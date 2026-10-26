"""Admin console: disputes and support cases (ADR-051 A-3, ADR-057, ADR-063).

Permissions (checked here, from the database role, on every call):

* ``disputes.read``   — list, counts, one case with both parties' words, categories.
* ``disputes.create`` — open a case for a customer (ADR-051 decision 6).
* ``disputes.update`` — reply, mark "in progress", assign, escalate.
* ``disputes.approve``— close (resolve) with an outcome; manage the category list.

Closing a dispute ends its ``DISPUTE`` hold, so the escrow continues under its own rules:
it pays out only if both sides paid in, otherwise it returns the money (ADR-037). Staff never
move money here; a refund is a separate reversal that needs an approver (ADR-051 decision 4).

SLA (owner decision 2026-10-26): 24 hours from opening to resolution.
"""

from __future__ import annotations

import re
import uuid
from collections.abc import Callable
from datetime import datetime, timedelta
from typing import Any

from fastapi import status
from sqlalchemy import Select, String, cast, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.core.exceptions import AppError
from app.domain.settlement_rules import reversal_problem
from app.models.disputes import (
    DISPUTE_OUTCOMES,
    DISPUTE_PRIORITIES,
    Dispute,
    DisputeCategory,
    DisputeMessage,
)
from app.models.identity import User
from app.models.kyc import KycCase
from app.models.marketplace import Match, Offer
from app.models.reversals import Reversal
from app.models.settlement import (
    Settlement,
    SettlementEvent,
    SettlementHold,
    SettlementLeg,
    Transaction,
)
from app.models.staff import StaffAccount, StaffAuditEntry, StaffRole
from app.services.notifications import notify
from app.services.reversals import ref as reversal_ref
from app.services.staff import RequestInfo, StaffPrincipal, forbidden

__all__ = ["SLA", "DisputeAdminService", "list_categories"]

SLA = timedelta(hours=24)


def _err(code: str, message: str, http: int, details: dict[str, Any] | None = None) -> AppError:
    return AppError(code, message, status_code=http, details=details)


def _not_found() -> AppError:
    return _err("RES_404_NOT_FOUND", "That case was not found.", 404)


def _resolved() -> AppError:
    return _err(
        "RES_409_DISPUTE_RESOLVED", "This case is already closed.", status.HTTP_409_CONFLICT
    )


async def list_categories(db: AsyncSession, *, active_only: bool) -> list[dict[str, Any]]:
    q = select(DisputeCategory).order_by(DisputeCategory.sort_order, DisputeCategory.name)
    if active_only:
        q = q.where(DisputeCategory.active.is_(True))
    rows = (await db.scalars(q)).all()
    out = [
        {"code": c.code, "name": c.name, "description": c.description, "active": c.active}
        for c in rows
    ]
    await db.rollback()
    return out


def ref(dispute_id: uuid.UUID) -> str:
    return str(dispute_id).split("-")[0].upper()


class DisputeAdminService:
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

    # --- categories ---------------------------------------------------------------------

    async def categories(self, principal: StaffPrincipal) -> list[dict[str, Any]]:
        """Every category, switched-off ones included (staff view)."""
        self._need(principal, "disputes.read")
        return await list_categories(self._db, active_only=False)

    async def save_category(
        self,
        principal: StaffPrincipal,
        info: RequestInfo,
        *,
        code: str | None,
        name: str,
        description: str,
        active: bool,
    ) -> dict[str, Any]:
        self._need(principal, "disputes.approve")
        name = " ".join(name.split())
        description = " ".join(description.split())
        now = self._clock()
        if code is None:
            slug = re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")[:28] or "category"
            if not slug[0].isalpha():
                slug = f"c_{slug}"[:28]
            code = slug
            n = 1
            while await self._db.get(DisputeCategory, code) is not None:
                n += 1
                code = f"{slug}_{n}"
            row = DisputeCategory(
                code=code,
                name=name,
                description=description,
                active=active,
                sort_order=100,
                created_at=now,
                updated_at=now,
            )
            self._db.add(row)
            action = "dispute_category_created"
        else:
            found = await self._db.get(DisputeCategory, code, with_for_update=True)
            if found is None:
                await self._db.rollback()
                raise _err("RES_404_NOT_FOUND", "That category was not found.", 404)
            row = found
            row.name, row.description, row.active, row.updated_at = name, description, active, now
            action = "dispute_category_updated"
        try:
            await self._db.flush()
        except IntegrityError:
            await self._db.rollback()
            raise _err(
                "RES_409_NAME_TAKEN",
                "A category with this name exists.",
                status.HTTP_409_CONFLICT,
                {"field": "name"},
            ) from None
        self._audit(principal, info, action, "dispute_category", code, {"active": active})
        out = {"code": code, "name": name, "description": description, "active": active}
        await self._db.commit()
        return out

    # --- reading ------------------------------------------------------------------------

    def _list_query(self) -> Select[Any]:
        name = (
            select(KycCase.legal_name)
            .where(KycCase.user_id == Dispute.initiator_user_id, KycCase.status == "approved")
            .order_by(KycCase.decided_at.desc())
            .limit(1)
            .scalar_subquery()
        )
        return (
            select(
                Dispute,
                User.email,
                name.label("customer_name"),
                DisputeCategory.name.label("category_name"),
                StaffAccount.name.label("assignee_name"),
            )
            .join(User, User.id == Dispute.initiator_user_id)
            .join(DisputeCategory, DisputeCategory.code == Dispute.reason)
            .outerjoin(StaffAccount, StaffAccount.id == Dispute.assigned_staff_id)
        )

    def _row(
        self, d: Dispute, email: str, customer: str | None, category: str, assignee: str | None
    ) -> dict[str, Any]:
        return {
            "id": d.id,
            "ref": ref(d.id),
            "kind": d.kind,
            "customer": customer or email,
            "customer_email": email,
            "category": d.reason,
            "category_name": category,
            "status": d.status,
            "priority": d.priority,
            "assigned_to": d.assigned_staff_id,
            "assigned_name": assignee,
            "escalated": d.escalated_at is not None,
            "created_at": d.created_at,
            "resolved_at": d.resolved_at,
            "sla_due_at": d.created_at + SLA,
        }

    async def list(
        self,
        principal: StaffPrincipal,
        *,
        search: str | None,
        status_in: str | None,
        mine: bool,
        offset: int,
        limit: int,
    ) -> dict[str, Any]:
        self._need(principal, "disputes.read")
        q = self._list_query()
        if status_in:
            q = q.where(Dispute.status == status_in)
        if mine:
            q = q.where(Dispute.assigned_staff_id == principal.staff_id)
        if search:
            s = search.strip()
            like = f"%{s.lower()}%"
            named = select(KycCase.id).where(
                KycCase.user_id == Dispute.initiator_user_id,
                func.lower(KycCase.legal_name).like(like),
            )
            conditions = [User.email.like(like), named.exists()]
            if re.fullmatch(r"[0-9A-Fa-f]{4,8}", s):
                conditions.append(func.upper(cast(Dispute.id, String)).like(f"{s.upper()}%"))
            q = q.where(or_(*conditions))
        total = await self._db.scalar(select(func.count()).select_from(q.subquery()))
        rows = (
            await self._db.execute(
                q.order_by(Dispute.created_at.desc(), Dispute.id).offset(offset).limit(limit)
            )
        ).all()
        items = [self._row(*r) for r in rows]  # read before the rollback expires the rows
        await self._db.rollback()
        return {"now": self._clock(), "total": int(total or 0), "items": items}

    async def stats(self, principal: StaffPrincipal) -> dict[str, Any]:
        self._need(principal, "disputes.read")
        now = self._clock()
        total = await self._db.scalar(select(func.count(Dispute.id)))
        week = await self._db.scalar(
            select(func.count(Dispute.id)).where(Dispute.resolved_at >= now - timedelta(days=7))
        )
        pending = await self._db.scalar(
            select(func.count(Dispute.id)).where(Dispute.status != "resolved")
        )
        overdue = await self._db.scalar(
            select(func.count(Dispute.id)).where(
                Dispute.status != "resolved", Dispute.created_at < now - SLA
            )
        )
        avg = await self._db.scalar(
            select(func.avg(func.extract("epoch", Dispute.resolved_at - Dispute.created_at))).where(
                Dispute.resolved_at >= now - timedelta(days=30)
            )
        )
        await self._db.rollback()
        return {
            "total": int(total or 0),
            "resolved_7_days": int(week or 0),
            "pending": int(pending or 0),
            "overdue": int(overdue or 0),
            "avg_resolution_seconds": None if avg is None else int(avg),
        }

    async def _person(self, user_id: uuid.UUID) -> dict[str, Any]:
        user = await self._db.get(User, user_id)
        name = await self._db.scalar(
            select(KycCase.legal_name)
            .where(KycCase.user_id == user_id, KycCase.status == "approved")
            .order_by(KycCase.decided_at.desc())
            .limit(1)
        )
        if user is None:  # pragma: no cover - foreign key
            raise _not_found()
        return {
            "id": user.id,
            "name": name,
            "email": user.email,
            "phone": user.phone,
            "status": user.status,
        }

    async def get(self, principal: StaffPrincipal, dispute_id: uuid.UUID) -> dict[str, Any]:
        self._need(principal, "disputes.read")
        found = (await self._db.execute(self._list_query().where(Dispute.id == dispute_id))).first()
        if found is None:
            await self._db.rollback()
            raise _not_found()
        d: Dispute = found[0]
        view = self._row(*found)
        view["now"] = self._clock()
        view["description"] = d.description
        view["desired_resolution"] = d.desired_resolution
        view["opened_by_staff"] = d.opened_by_staff_id is not None
        view["customer_details"] = await self._person(d.initiator_user_id)
        view["deal"] = None
        view["reversals"] = []
        view["can_refund"] = False
        if d.transaction_id is not None:
            m = (
                await self._db.execute(
                    select(Match, Offer)
                    .join(Transaction, Transaction.match_id == Match.id)
                    .join(Offer, Offer.id == Match.offer_id)
                    .where(Transaction.id == d.transaction_id)
                )
            ).one()
            match, offer = m
            settlement = await self._db.scalar(
                select(Settlement).where(Settlement.transaction_id == d.transaction_id)
            )
            legs = []
            if settlement is not None:
                for leg in (
                    await self._db.scalars(
                        select(SettlementLeg)
                        .where(SettlementLeg.settlement_id == settlement.id)
                        .order_by(SettlementLeg.party_role)
                    )
                ).all():
                    legs.append(
                        {
                            "party": leg.party_role,
                            "paid_by": leg.funder_user_id,
                            "currency": leg.currency,
                            "scale": leg.scale,
                            "amount_minor": str(leg.amount_minor),
                            "fee_minor": str(leg.fee_minor),
                            "state": leg.state,
                        }
                    )
            other = (
                offer.user_id
                if d.initiator_user_id == match.counterparty_user_id
                else match.counterparty_user_id
            )
            reversals = (
                await self._db.scalars(
                    select(Reversal)
                    .where(Reversal.dispute_id == d.id)
                    .order_by(Reversal.requested_at.desc())
                )
            ).all()
            view["reversals"] = [
                {"id": r.id, "ref": reversal_ref(r.id), "status": r.status} for r in reversals
            ]
            view["can_refund"] = (
                settlement is not None
                and d.status != "resolved"
                and not any(r.status == "pending" for r in reversals)
                and reversal_problem(
                    settlement.phase,
                    settlement.release_authorized_at is not None,
                    [str(leg["state"]) for leg in legs],
                )
                is None
            )
            view["deal"] = {
                "transaction_id": d.transaction_id,
                "match_id": match.id,
                # Decimal as text without trailing zeros: 1320.500000 -> "1320.5".
                "rate": format(match.agreed_rate.normalize(), "f"),
                "phase": settlement.phase if settlement else None,
                "escrow_paused": d.status != "resolved" and d.hold_id is not None,
                "legs": legs,
                "other_party": await self._person(other),
            }
        staff_names = aliased(StaffAccount)
        msgs = (
            await self._db.execute(
                select(DisputeMessage, staff_names.name)
                .outerjoin(staff_names, staff_names.id == DisputeMessage.author_staff_id)
                .where(DisputeMessage.dispute_id == d.id)
                .order_by(DisputeMessage.created_at, DisputeMessage.id)
            )
        ).all()
        view["messages"] = [
            {
                "id": msg.id,
                "author": msg.author_role
                if msg.author_role == "staff"
                else ("customer" if msg.author_user_id == d.initiator_user_id else "other_party"),
                "staff_name": who,
                "body": msg.body,
                "created_at": msg.created_at,
            }
            for msg, who in msgs
        ]
        audit = (
            await self._db.execute(
                select(StaffAuditEntry, StaffAccount.name)
                .outerjoin(StaffAccount, StaffAccount.id == StaffAuditEntry.staff_id)
                .where(
                    StaffAuditEntry.target_type == "dispute",
                    StaffAuditEntry.target_id == str(d.id),
                )
                .order_by(StaffAuditEntry.at, StaffAuditEntry.id)
            )
        ).all()
        view["timeline"] = [
            {
                "at": d.created_at,
                "who": "staff" if d.opened_by_staff_id else "customer",
                "name": None,
                "event": "created",
                "detail": None,
            }
        ] + [
            {"at": a.at, "who": "staff", "name": n, "event": a.action, "detail": a.detail}
            for a, n in audit
        ]
        await self._db.rollback()
        return view

    # --- changing -----------------------------------------------------------------------

    async def _open_case(self, dispute_id: uuid.UUID) -> Dispute:
        d = await self._db.scalar(select(Dispute).where(Dispute.id == dispute_id).with_for_update())
        if d is None:
            await self._db.rollback()
            raise _not_found()
        if d.status == "resolved":
            await self._db.rollback()
            raise _resolved()
        return d

    async def reply(
        self, principal: StaffPrincipal, info: RequestInfo, dispute_id: uuid.UUID, body: str
    ) -> None:
        self._need(principal, "disputes.update")
        d = await self._open_case(dispute_id)
        now = self._clock()
        self._db.add(
            DisputeMessage(
                id=uuid.uuid4(),
                dispute_id=d.id,
                author_role="staff",
                author_user_id=None,
                author_staff_id=principal.staff_id,
                body=body,
                created_at=now,
            )
        )
        if d.status == "open":
            d.status = "under_review"
        d.updated_at = now
        self._audit(principal, info, "dispute_replied", "dispute", d.id)
        await notify(
            self._db,
            user_id=d.initiator_user_id,
            event="dispute.reply",
            dedupe_key=f"dispute:{d.id}:reply:{int(now.timestamp())}",
            now=now,
            dispute_id=str(d.id),
        )
        await self._db.commit()

    async def start(
        self, principal: StaffPrincipal, info: RequestInfo, dispute_id: uuid.UUID
    ) -> None:
        self._need(principal, "disputes.update")
        d = await self._open_case(dispute_id)
        if d.status == "open":
            d.status = "under_review"
            d.updated_at = self._clock()
            self._audit(principal, info, "dispute_in_progress", "dispute", d.id)
        await self._db.commit()

    async def assign(
        self,
        principal: StaffPrincipal,
        info: RequestInfo,
        dispute_id: uuid.UUID,
        staff_id: uuid.UUID | None,
    ) -> None:
        self._need(principal, "disputes.update")
        d = await self._open_case(dispute_id)
        name = None
        if staff_id is not None:
            row = (
                await self._db.execute(
                    select(StaffAccount, StaffRole)
                    .join(StaffRole, StaffRole.id == StaffAccount.role_id)
                    .where(StaffAccount.id == staff_id)
                )
            ).first()
            if (
                row is None
                or row[0].status != "active"
                or "disputes.update" not in row[1].permissions
            ):
                await self._db.rollback()
                raise _err(
                    "VAL_422_INVALID_ASSIGNEE",
                    "Choose an active staff member who can work on disputes.",
                    422,
                    {"field": "staff_id"},
                )
            name = row[0].name
        d.assigned_staff_id = staff_id
        d.updated_at = self._clock()
        self._audit(principal, info, "dispute_assigned", "dispute", d.id, {"to": name})
        await self._db.commit()

    async def escalate(
        self, principal: StaffPrincipal, info: RequestInfo, dispute_id: uuid.UUID, reason: str
    ) -> None:
        self._need(principal, "disputes.update")
        d = await self._open_case(dispute_id)
        now = self._clock()
        d.escalated_at = now
        d.priority = "high"
        d.updated_at = now
        if d.status == "open":
            d.status = "under_review"
        self._audit(principal, info, "dispute_escalated", "dispute", d.id, {"reason": reason})
        await self._db.commit()

    async def resolve(
        self,
        principal: StaffPrincipal,
        info: RequestInfo,
        dispute_id: uuid.UUID,
        outcome: str,
        note: str | None,
    ) -> None:
        self._need(principal, "disputes.approve")
        if outcome not in DISPUTE_OUTCOMES:
            raise _err("VAL_422_MISSING_FIELD", "Choose the outcome.", 422, {"field": "outcome"})
        d = await self._open_case(dispute_id)
        # ADR-065: a refund waiting for approval is decided first, so a closed case and a
        # refund can never contradict each other.
        waiting = await self._db.scalar(
            select(Reversal.id).where(Reversal.dispute_id == d.id, Reversal.status == "pending")
        )
        if waiting is not None:
            await self._db.rollback()
            raise _err(
                "RES_409_REFUND_PENDING",
                "A refund for this case is waiting for approval. Approve or reject it first.",
                status.HTTP_409_CONFLICT,
            )
        now = self._clock()
        d.status, d.outcome, d.resolved_at, d.updated_at = "resolved", outcome, now, now
        if d.hold_id is not None:
            hold = await self._db.get(SettlementHold, d.hold_id, with_for_update=True)
            if hold is not None and hold.closed_at is None:
                # The escrow continues under its own rules (pay out only if both paid in).
                hold.closed_at = now
                self._db.add(
                    SettlementEvent(
                        id=uuid.uuid4(),
                        settlement_id=hold.settlement_id,
                        leg_id=None,
                        event_type="HoldClosed",
                        payload={"type": "DISPUTE", "reason": "dispute resolved"},
                        created_at=now,
                    )
                )
        if d.hold_id is not None:
            # The hold is gone: if both sides paid in and nothing else holds the deal, it pays
            # out now (ADR-063; ADR-065 fixed the case where nothing re-checked it).
            hold_row = await self._db.get(SettlementHold, d.hold_id)
            if hold_row is not None:
                from app.services.settlement import SettlementService

                await SettlementService(self._db, self._clock, None).recheck(hold_row.settlement_id)
        self._audit(
            principal, info, "dispute_resolved", "dispute", d.id, {"outcome": outcome, "note": note}
        )
        await notify(
            self._db,
            user_id=d.initiator_user_id,
            event="dispute.resolved",
            dedupe_key=f"dispute:{d.id}:resolved",
            now=now,
            dispute_id=str(d.id),
        )
        await self._db.commit()

    async def open_for_customer(
        self,
        principal: StaffPrincipal,
        info: RequestInfo,
        *,
        user_id: uuid.UUID,
        transaction_id: uuid.UUID | None,
        category: str,
        description: str,
        desired_resolution: str | None,
        priority: str,
    ) -> dict[str, Any]:
        """A staff member opens a case for a customer (ADR-051 decision 6), through the same
        rules as the app: a dispute pauses the deal's escrow; the customer must be a party."""
        self._need(principal, "disputes.create")
        if priority not in DISPUTE_PRIORITIES:
            raise _err("VAL_422_MISSING_FIELD", "Choose the priority.", 422, {"field": "priority"})
        cat = await self._db.get(DisputeCategory, category)
        if cat is None or not cat.active:
            await self._db.rollback()
            raise _err("VAL_422_MISSING_FIELD", "Choose a category.", 422, {"field": "category"})
        user = await self._db.get(User, user_id)
        if user is None or user.status == "pending_verification":
            await self._db.rollback()
            raise _err("RES_404_NOT_FOUND", "That customer was not found.", 404)
        await self._db.rollback()
        # Reuse the customer-side rules (party check, one open dispute per deal, escrow hold).
        from app.services.auth import Principal
        from app.services.disputes import DisputeService

        view = await DisputeService(self._db, self._clock).open(
            Principal(user_id=user_id, session_id=uuid.uuid4()),
            transaction_id=transaction_id,
            reason=category,
            description=description,
        )
        d = await self._db.get(Dispute, uuid.UUID(view["dispute_id"]), with_for_update=True)
        if d is None:  # pragma: no cover - just created
            raise _not_found()
        d.opened_by_staff_id = principal.staff_id
        d.priority = priority
        d.desired_resolution = desired_resolution
        self._audit(
            principal, info, "dispute_opened_for_customer", "dispute", d.id, {"category": category}
        )
        out = {"id": d.id, "ref": ref(d.id)}
        await self._db.commit()
        return out
