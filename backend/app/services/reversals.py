"""Admin console: reversals (ADR-065; ADR-051 decision 4; owner: "Return escrow to payer").

Permissions (checked here, from the database role, on every call):

* ``reversals.read``    — list, counts, one request.
* ``reversals.create``  — ask for a deal's escrow to be returned ("Process refund" on a dispute).
* ``reversals.approve`` — approve or reject, **never your own request** (SEC-008; also a CHECK
  in the database).

What a reversal can do: only money still in escrow, before any payout, goes back to whoever
paid it in, in full (fee included). Asking opens a ``REVERSAL`` hold so the payout cannot start
while the request waits. Approving moves the settlement to ``UNWINDING`` through
``SettlementService.reverse`` (the same returns as an expired funding window); the partner bank
does the returning. Rejecting closes the hold and the deal continues under its own rules.
Every step is in the staff audit log; the request is decided once (database trigger).
"""

from __future__ import annotations

import re
import uuid
from collections.abc import Callable
from datetime import datetime
from typing import Any

from fastapi import status
from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.core.exceptions import AppError
from app.domain.settlement_rules import reversal_problem
from app.models.disputes import Dispute, DisputeCategory
from app.models.identity import User
from app.models.kyc import KycCase
from app.models.reversals import REVERSAL_STATUSES, Reversal
from app.models.settlement import Settlement, SettlementEvent, SettlementHold, SettlementLeg
from app.models.staff import StaffAccount, StaffAuditEntry
from app.services.settlement import SettlementService
from app.services.staff import RequestInfo, StaffPrincipal, forbidden

__all__ = ["ReversalService", "ref"]


def ref(reversal_id: uuid.UUID) -> str:
    return "RVL-" + str(reversal_id).split("-")[0].upper()


def _err(code: str, message: str, http: int, details: dict[str, Any] | None = None) -> AppError:
    return AppError(code, message, status_code=http, details=details)


def _not_found() -> AppError:
    return _err("RES_404_NOT_FOUND", "That reversal was not found.", 404)


def _cannot(problem: str) -> AppError:
    return _err(
        "RES_409_INVALID_SETTLEMENT_STATE",
        "Nothing is in escrow to return for this deal."
        if problem == "nothing_paid_in"
        else "This deal's escrow can no longer be returned.",
        status.HTTP_409_CONFLICT,
        {"problem": problem},
    )


class ReversalService:
    def __init__(self, db: AsyncSession, clock: Callable[[], datetime]) -> None:
        self._db = db
        self._clock = clock

    def _need(self, principal: StaffPrincipal, permission: str) -> None:
        if not principal.can(permission):
            raise forbidden()

    def _audit(
        self,
        principal: StaffPrincipal,
        info: RequestInfo,
        action: str,
        target_type: str,
        target_id: object,
        detail: dict[str, Any] | None = None,
    ) -> None:
        self._db.add(
            StaffAuditEntry(
                at=self._clock(),
                staff_id=principal.staff_id,
                action=action,
                target_type=target_type,
                target_id=str(target_id),
                detail=detail,
                ip_address=info.ip_address,
                user_agent=info.user_agent,
            )
        )

    async def _legs(self, settlement_id: uuid.UUID) -> list[SettlementLeg]:
        return list(
            (
                await self._db.scalars(
                    select(SettlementLeg)
                    .where(SettlementLeg.settlement_id == settlement_id)
                    .order_by(SettlementLeg.party_role.desc())
                )
            ).all()
        )

    async def _name(self, user_id: uuid.UUID) -> str | None:
        name: str | None = await self._db.scalar(
            select(KycCase.legal_name)
            .where(KycCase.user_id == user_id, KycCase.status == "approved")
            .order_by(KycCase.decided_at.desc())
            .limit(1)
        )
        return name

    async def _returns(self, legs: list[SettlementLeg]) -> list[dict[str, Any]]:
        """What goes back to whom: only funded escrows, in full (fee included)."""
        out = []
        for leg in legs:
            if leg.state in ("FUNDED", "RETURN_SENT", "RETURNED"):
                user = await self._db.get(User, leg.funder_user_id)
                out.append(
                    {
                        "user_id": leg.funder_user_id,
                        "name": await self._name(leg.funder_user_id),
                        "email": user.email if user else None,
                        "phone": user.phone if user else None,
                        "currency": leg.currency,
                        "scale": leg.scale,
                        "minor": str(leg.amount_minor + leg.fee_minor),
                        "state": leg.state,
                    }
                )
        return out

    # --- asking ---------------------------------------------------------------------------

    async def request(
        self, principal: StaffPrincipal, info: RequestInfo, dispute_id: uuid.UUID, reason: str
    ) -> dict[str, Any]:
        """ "Process refund" on a dispute: ask for the deal's escrow to be returned."""
        self._need(principal, "reversals.create")
        d = await self._db.scalar(select(Dispute).where(Dispute.id == dispute_id).with_for_update())
        if d is None:
            await self._db.rollback()
            raise _err("RES_404_NOT_FOUND", "That case was not found.", 404)
        if d.status == "resolved":
            await self._db.rollback()
            raise _err(
                "RES_409_DISPUTE_RESOLVED", "This case is already closed.", status.HTTP_409_CONFLICT
            )
        if d.transaction_id is None:
            await self._db.rollback()
            raise _err(
                "RES_409_NO_DEAL",
                "This case is not about a deal, so there is no escrow to return.",
                status.HTTP_409_CONFLICT,
            )
        settlement = await self._db.scalar(
            select(Settlement)
            .where(Settlement.transaction_id == d.transaction_id)
            .with_for_update()
        )
        if settlement is None:
            await self._db.rollback()
            raise _cannot("nothing_paid_in")
        legs = await self._legs(settlement.id)
        problem = reversal_problem(
            settlement.phase,
            settlement.release_authorized_at is not None,
            [leg.state for leg in legs],
        )
        if problem is not None:
            await self._db.rollback()
            raise _cannot(problem)
        now = self._clock()
        hold = SettlementHold(
            id=uuid.uuid4(),
            settlement_id=settlement.id,
            type="REVERSAL",
            blocks_progression=True,
            reason="Refund requested by staff; waiting for approval.",
            opened_at=now,
        )
        self._db.add(hold)
        self._db.add(
            SettlementEvent(
                id=uuid.uuid4(),
                settlement_id=settlement.id,
                leg_id=None,
                event_type="HoldOpened",
                payload={"type": "REVERSAL", "reason": "refund requested"},
                created_at=now,
            )
        )
        await self._db.flush()
        row = Reversal(
            id=uuid.uuid4(),
            dispute_id=d.id,
            settlement_id=settlement.id,
            hold_id=hold.id,
            status="pending",
            reason=reason,
            requested_by=principal.staff_id,
            requested_at=now,
        )
        self._db.add(row)
        try:
            await self._db.flush()
        except IntegrityError:
            await self._db.rollback()
            raise _err(
                "RES_409_REVERSAL_PENDING",
                "A refund for this deal is already waiting for approval.",
                status.HTTP_409_CONFLICT,
            ) from None
        self._audit(
            principal, info, "reversal_requested", "reversal", row.id, {"dispute": str(d.id)}
        )
        self._audit(
            principal, info, "dispute_refund_requested", "dispute", d.id, {"ref": ref(row.id)}
        )
        out = {"id": row.id, "ref": ref(row.id)}
        await self._db.commit()
        return out

    # --- deciding -------------------------------------------------------------------------

    async def _pending(self, principal: StaffPrincipal, reversal_id: uuid.UUID) -> Reversal:
        row = await self._db.scalar(
            select(Reversal).where(Reversal.id == reversal_id).with_for_update()
        )
        if row is None:
            await self._db.rollback()
            raise _not_found()
        if row.status != "pending":
            await self._db.rollback()
            raise _err(
                "RES_409_REVERSAL_DECIDED",
                "This request has already been decided.",
                status.HTTP_409_CONFLICT,
            )
        if row.requested_by == principal.staff_id:
            await self._db.rollback()
            raise _err(
                "AUTH_403_OWN_REQUEST",
                "Another staff member must decide on a request you made.",
                status.HTTP_403_FORBIDDEN,
            )
        return row

    async def _close_hold(self, row: Reversal, now: datetime, why: str) -> None:
        hold = await self._db.get(SettlementHold, row.hold_id, with_for_update=True)
        if hold is not None and hold.closed_at is None:
            hold.closed_at = now
            self._db.add(
                SettlementEvent(
                    id=uuid.uuid4(),
                    settlement_id=row.settlement_id,
                    leg_id=None,
                    event_type="HoldClosed",
                    payload={"type": "REVERSAL", "reason": why},
                    created_at=now,
                )
            )

    async def approve(
        self,
        principal: StaffPrincipal,
        info: RequestInfo,
        reversal_id: uuid.UUID,
        note: str | None,
    ) -> None:
        self._need(principal, "reversals.approve")
        row = await self._pending(principal, reversal_id)
        now = self._clock()
        settlement = SettlementService(self._db, self._clock, None)
        try:
            returned = await settlement.reverse(row.settlement_id)
        except AppError:
            await self._db.rollback()
            raise
        await self._close_hold(row, now, "refund approved")
        row.status, row.decided_by, row.decided_at = "approved", principal.staff_id, now
        row.decision_note = note
        self._audit(
            principal,
            info,
            "reversal_approved",
            "reversal",
            row.id,
            {
                "note": note,
                "returns": [
                    {"currency": r["currency"], "minor": str(r["minor"])} for r in returned
                ],
            },
        )
        self._audit(
            principal,
            info,
            "dispute_refund_approved",
            "dispute",
            row.dispute_id,
            {"ref": ref(row.id)},
        )
        await self._db.commit()

    async def reject(
        self, principal: StaffPrincipal, info: RequestInfo, reversal_id: uuid.UUID, note: str
    ) -> None:
        self._need(principal, "reversals.approve")
        row = await self._pending(principal, reversal_id)
        now = self._clock()
        await self._close_hold(row, now, "refund rejected")
        row.status, row.decided_by, row.decided_at = "rejected", principal.staff_id, now
        row.decision_note = note
        self._audit(principal, info, "reversal_rejected", "reversal", row.id, {"note": note})
        self._audit(
            principal,
            info,
            "dispute_refund_rejected",
            "dispute",
            row.dispute_id,
            {"ref": ref(row.id)},
        )
        # The hold is gone: if both sides paid in and nothing else holds the deal, it pays out.
        await SettlementService(self._db, self._clock, None).recheck(row.settlement_id)
        await self._db.commit()

    # --- reading --------------------------------------------------------------------------

    async def list(
        self,
        principal: StaffPrincipal,
        *,
        search: str | None,
        status_in: str | None,
        offset: int,
        limit: int,
    ) -> dict[str, Any]:
        self._need(principal, "reversals.read")
        requester = aliased(StaffAccount)
        customer_name = (
            select(KycCase.legal_name)
            .where(KycCase.user_id == Dispute.initiator_user_id, KycCase.status == "approved")
            .order_by(KycCase.decided_at.desc())
            .limit(1)
            .scalar_subquery()
        )
        q = (
            select(
                Reversal,
                requester.name.label("requested_by_name"),
                User.email,
                customer_name.label("customer_name"),
                DisputeCategory.name.label("category_name"),
            )
            .join(Dispute, Dispute.id == Reversal.dispute_id)
            .join(User, User.id == Dispute.initiator_user_id)
            .join(DisputeCategory, DisputeCategory.code == Dispute.reason)
            .join(requester, requester.id == Reversal.requested_by)
        )
        if status_in in REVERSAL_STATUSES:
            q = q.where(Reversal.status == status_in)
        if search:
            s = search.strip()
            like = f"%{s.lower()}%"
            named = select(KycCase.id).where(
                KycCase.user_id == Dispute.initiator_user_id,
                func.lower(KycCase.legal_name).like(like),
            )
            conditions = [User.email.like(like), named.exists()]
            hexpart = s.upper().removeprefix("RVL-")
            if re.fullmatch(r"[0-9A-F]{4,8}", hexpart):
                conditions.append(func.upper(cast(Reversal.id, String)).like(f"{hexpart}%"))
            q = q.where(or_(*conditions))
        total = await self._db.scalar(select(func.count()).select_from(q.subquery()))
        rows = (
            await self._db.execute(
                q.order_by(Reversal.requested_at.desc(), Reversal.id).offset(offset).limit(limit)
            )
        ).all()
        items = []
        for r, who, email, name, category in rows:
            legs = await self._legs(r.settlement_id)
            items.append(
                {
                    "id": r.id,
                    "ref": ref(r.id),
                    "requested_by": who,
                    "customer": name or email,
                    "returns": [
                        {"currency": x["currency"], "scale": x["scale"], "minor": x["minor"]}
                        for x in await self._returns(legs)
                    ],
                    "category_name": category,
                    "reason": r.reason,
                    "status": r.status,
                    "requested_at": r.requested_at,
                    "decided_at": r.decided_at,
                }
            )
        await self._db.rollback()
        return {"total": int(total or 0), "items": items}

    async def stats(self, principal: StaffPrincipal) -> dict[str, Any]:
        self._need(principal, "reversals.read")
        rows = (
            await self._db.execute(select(Reversal.status, func.count()).group_by(Reversal.status))
        ).all()
        await self._db.rollback()
        by = {s: int(n) for s, n in rows}
        return {
            "total": sum(by.values()),
            "approved": by.get("approved", 0),
            "pending": by.get("pending", 0),
            "rejected": by.get("rejected", 0),
        }

    async def get(self, principal: StaffPrincipal, reversal_id: uuid.UUID) -> dict[str, Any]:
        self._need(principal, "reversals.read")
        r = await self._db.get(Reversal, reversal_id)
        if r is None:
            await self._db.rollback()
            raise _not_found()
        d = await self._db.get(Dispute, r.dispute_id)
        settlement = await self._db.get(Settlement, r.settlement_id)
        if d is None or settlement is None:  # pragma: no cover - foreign keys
            raise _not_found()
        category = await self._db.get(DisputeCategory, d.reason)
        requester = await self._db.get(StaffAccount, r.requested_by)
        decider = await self._db.get(StaffAccount, r.decided_by) if r.decided_by else None
        legs = await self._legs(settlement.id)
        user = await self._db.get(User, d.initiator_user_id)
        view = {
            "id": r.id,
            "ref": ref(r.id),
            "status": r.status,
            "reason": r.reason,
            "requested_by": requester.name if requester else None,
            "requested_by_id": r.requested_by,
            "requested_at": r.requested_at,
            "decided_by": decider.name if decider else None,
            "decided_at": r.decided_at,
            "decision_note": r.decision_note,
            "dispute": {
                "id": d.id,
                "ref": str(d.id).split("-")[0].upper(),
                "category_name": category.name if category else d.reason,
                "description": d.description,
                "status": d.status,
            },
            "customer": {
                "name": await self._name(d.initiator_user_id),
                "email": user.email if user else None,
                "phone": user.phone if user else None,
            },
            "deal": {
                "transaction_id": settlement.transaction_id,
                "phase": settlement.phase,
                "closure_reason": settlement.closure_reason,
                "legs": [
                    {
                        "party": leg.party_role,
                        "currency": leg.currency,
                        "scale": leg.scale,
                        "amount_minor": str(leg.amount_minor),
                        "fee_minor": str(leg.fee_minor),
                        "state": leg.state,
                    }
                    for leg in legs
                ],
            },
            "returns": await self._returns(legs),
            # Whether approving would work right now (the server checks again when it is done).
            "can_return": reversal_problem(
                settlement.phase,
                settlement.release_authorized_at is not None,
                [leg.state for leg in legs],
            )
            is None,
        }
        await self._db.rollback()
        return view
