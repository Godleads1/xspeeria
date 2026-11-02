"""Emergency controls for Super Admins (SEC-039, ADR-075; owner 2026-11-02).

**Pause all deals** ("freeze the clocks"). While a pause is open:

* customers can't post or edit offers, take an offer, join a waiting queue, choose payout
  accounts or ask for more time to pay (``SYS_503_SERVICE_UNAVAILABLE``, details
  ``{"reason": "deals_paused"}``). Withdrawing an offer and leaving a queue still work: they
  only reduce what is at stake;
* no deadline is acted on: payout-choice windows, escrow funding windows and queue turns are
  not expired by the sweeps or by any request;
* no command goes to the bank (open escrow, pay out, return): the outbox holds them. Messages
  *from* the bank are still recorded, so nothing the bank did is lost.

On **resume**, every window still open gets the paused time back: payout-choice deadlines,
escrow funding deadlines and queue turns move later by exactly how long the pause lasted. Each
deal in escrow gets a ``DeadlineExtended`` settlement event, each deal still choosing accounts a
staff audit entry, so its timeline shows it. A window opened during the pause also gets the full
paused time (it errs on the customer's side).

**End every session**: signs out every customer (reason ``incident``) and/or every staff member
except the one doing it. Trusted phones stay trusted; the next sign-in still needs the PIN.

Both need a Super Admin (checked here on every call), a reason of 5–500 characters, and are
recorded in the staff audit log; the operations alert rules turn each into a P1 alert for the
other Super Admins (ADR-074).
"""

from __future__ import annotations

import uuid
from collections.abc import Callable
from datetime import datetime
from typing import Any, Literal

from fastapi import status
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError
from app.core.logging import get_logger
from app.models.deal_pauses import DealPause
from app.models.identity import AuthSession
from app.models.marketplace import Match, OfferQueueEntry
from app.models.settlement import Settlement, SettlementEvent
from app.models.staff import StaffAuditEntry, StaffSession
from app.services.staff import RequestInfo, StaffPrincipal, forbidden

__all__ = ["DealPauseService", "deals_paused", "refuse_if_paused"]

_logger = get_logger(__name__)

#: The match state while customers are choosing payout accounts (ADR-035).
_AWAITING = "awaiting_payout_accounts"  # matches.AWAITING (ADR-035)

Who = Literal["customers", "staff", "everyone"]


async def deals_paused(db: AsyncSession) -> bool:
    """Is a pause open right now? One indexed read."""
    return (
        await db.scalar(select(DealPause.id).where(DealPause.ended_at.is_(None)).limit(1))
    ) is not None


def _paused_error() -> AppError:
    return AppError(
        "SYS_503_SERVICE_UNAVAILABLE",
        "Deals are paused for a short while for safety. Your money in escrow is safe. "
        "Please try again later.",
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        details={"reason": "deals_paused"},
    )


async def refuse_if_paused(db: AsyncSession) -> None:
    """For actions that start or move a deal: refuse while deals are paused."""
    if await deals_paused(db):
        await db.rollback()
        raise _paused_error()


def _reason(text: str) -> str:
    clean = " ".join(text.split())
    if not 5 <= len(clean) <= 500:
        raise AppError(
            "VAL_422_MISSING_FIELD",
            "Give a reason (5 to 500 characters).",
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            details={"field": "reason"},
        )
    return clean


def _view(p: DealPause | None) -> dict[str, Any]:
    if p is None:
        return {"paused": False, "pause": None}
    return {
        "paused": p.ended_at is None,
        "pause": {
            "id": p.id,
            "started_at": p.started_at,
            "started_by": p.started_by,
            "reason": p.reason,
            "ended_at": p.ended_at,
            "ended_by": p.ended_by,
            "end_reason": p.end_reason,
            "details": p.details,
        },
    }


class DealPauseService:
    def __init__(self, db: AsyncSession, clock: Callable[[], datetime]) -> None:
        self._db = db
        self._clock = clock

    def _need_super_admin(self, principal: StaffPrincipal) -> None:
        if not principal.is_super_admin:
            raise forbidden()

    def _audit(
        self,
        principal: StaffPrincipal,
        info: RequestInfo,
        action: str,
        target_type: str,
        target_id: object,
        detail: dict[str, Any],
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

    # --- pause ------------------------------------------------------------------------------

    async def status(self, principal: StaffPrincipal) -> dict[str, Any]:
        self._need_super_admin(principal)
        latest = await self._db.scalar(
            select(DealPause).order_by(DealPause.started_at.desc()).limit(1)
        )
        out = _view(latest)
        await self._db.rollback()
        return out

    async def pause(
        self, principal: StaffPrincipal, info: RequestInfo, reason: str
    ) -> dict[str, Any]:
        self._need_super_admin(principal)
        why = _reason(reason)
        row = DealPause(
            id=uuid.uuid4(),
            started_at=self._clock(),
            started_by=principal.staff_id,
            reason=why,
            details={},
        )
        self._db.add(row)
        try:
            await self._db.flush()
        except IntegrityError:
            await self._db.rollback()
            raise AppError(
                "RES_409_ALREADY_PAUSED",
                "Deals are already paused.",
                status_code=status.HTTP_409_CONFLICT,
            ) from None
        self._audit(principal, info, "deals_paused", "deal_pause", row.id, {"reason": why})
        out = _view(row)
        await self._db.commit()
        _logger.warning("deals_paused", extra={"staff_id": str(principal.staff_id)})
        return out

    async def resume(
        self, principal: StaffPrincipal, info: RequestInfo, reason: str
    ) -> dict[str, Any]:
        """End the pause and give every open window the paused time back, in one transaction."""
        self._need_super_admin(principal)
        why = _reason(reason)
        row = await self._db.scalar(
            select(DealPause).where(DealPause.ended_at.is_(None)).with_for_update()
        )
        if row is None:
            await self._db.rollback()
            raise AppError(
                "RES_409_NOT_PAUSED", "Deals are not paused.", status_code=status.HTTP_409_CONFLICT
            )
        now = self._clock()
        paused_for = now - row.started_at

        matches = (
            await self._db.scalars(
                select(Match)
                .where(Match.preparation_state == _AWAITING, Match.preparation_deadline.isnot(None))
                .with_for_update()
            )
        ).all()
        for m in matches:
            if m.preparation_deadline is None:  # pragma: no cover - selected above
                continue
            m.preparation_deadline = m.preparation_deadline + paused_for
            self._audit(
                principal,
                info,
                "deal_window_extended",
                "match",
                m.id,
                {
                    "window": "payout_accounts",
                    "seconds": int(paused_for.total_seconds()),
                    "pause_id": str(row.id),
                },
            )

        settlements = (
            await self._db.scalars(
                select(Settlement)
                .where(
                    Settlement.phase == "AWAITING_FUNDING", Settlement.funding_deadline.isnot(None)
                )
                .with_for_update()
            )
        ).all()
        for s in settlements:
            if s.funding_deadline is None:  # pragma: no cover - selected above
                continue
            s.funding_deadline = s.funding_deadline + paused_for
            self._db.add(
                SettlementEvent(
                    id=uuid.uuid4(),
                    settlement_id=s.id,
                    leg_id=None,
                    event_type="DeadlineExtended",
                    payload={
                        "reason": "deals_paused",
                        "seconds": int(paused_for.total_seconds()),
                        "funding_deadline": s.funding_deadline.isoformat(),
                    },
                    created_at=now,
                )
            )

        turns = await self._db.execute(
            update(OfferQueueEntry)
            .where(OfferQueueEntry.status == "notified", OfferQueueEntry.turn_deadline.isnot(None))
            .values(turn_deadline=OfferQueueEntry.turn_deadline + paused_for)
        )

        row.ended_at, row.ended_by, row.end_reason = now, principal.staff_id, why
        row.details = {
            "paused_seconds": int(paused_for.total_seconds()),
            "payout_windows_extended": len(matches),
            "funding_windows_extended": len(settlements),
            "queue_turns_extended": int(turns.rowcount or 0),  # type: ignore[attr-defined]
        }
        self._audit(
            principal, info, "deals_resumed", "deal_pause", row.id, {"reason": why, **row.details}
        )
        out = _view(row)
        await self._db.commit()
        _logger.warning("deals_resumed", extra={"staff_id": str(principal.staff_id)})
        return out

    # --- end every session ---------------------------------------------------------------------

    async def end_sessions(
        self, principal: StaffPrincipal, info: RequestInfo, who: Who, reason: str
    ) -> dict[str, int]:
        """Sign out every customer and/or every other staff member, now."""
        self._need_super_admin(principal)
        why = _reason(reason)
        now = self._clock()
        customers = staff = 0
        if who in ("customers", "everyone"):
            result = await self._db.execute(
                update(AuthSession)
                .where(AuthSession.revoked_at.is_(None))
                .values(revoked_at=now, revoke_reason="incident")
            )
            customers = int(result.rowcount or 0)  # type: ignore[attr-defined]
        if who in ("staff", "everyone"):
            result = await self._db.execute(
                update(StaffSession)
                .where(
                    StaffSession.revoked_at.is_(None),
                    StaffSession.id != principal.session_id,
                )
                .values(revoked_at=now)
            )
            staff = int(result.rowcount or 0)  # type: ignore[attr-defined]
        counts = {"customer_sessions": customers, "staff_sessions": staff}
        self._audit(
            principal,
            info,
            "sessions_ended",
            "sessions",
            who,
            {"who": who, "reason": why, **counts},
        )
        await self._db.commit()
        _logger.warning("sessions_ended", extra={"who": who, **counts})
        return counts
