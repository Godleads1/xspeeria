"""In-app notifications — Milestone N-1 (ADR-044).

* ``notify``: record one message for one user, inside the caller's transaction, so it exists
  exactly when the fact it reports is committed. Repeats (same user + ``dedupe_key``) are
  ignored, never an error — a money transaction must not fail because of a message.
* ``NotificationService``: my messages, newest first, and marking one read or unread.

Payloads carry an event name plus ids/codes only (``EVENTS`` lists what each may hold); the app
writes the words in the user's language. Nothing personal, no amounts, no account numbers.
"""

from __future__ import annotations

import uuid
from collections.abc import Callable
from datetime import datetime
from typing import Any

from fastapi import status
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError
from app.models.marketplace import Match, Offer
from app.models.notifications import Notification
from app.models.settlement import Settlement, Transaction
from app.services.auth import Principal

__all__ = [
    "EVENTS",
    "NotificationService",
    "notify",
    "notify_settlement",
    "notification_view",
]

#: event -> (type, data keys allowed). Anything else is refused (programming error).
EVENTS: dict[str, tuple[str, frozenset[str]]] = {
    "kyc.approved": ("kyc_status", frozenset({"kyc_case_id", "country"})),
    "kyc.rejected": ("kyc_status", frozenset({"kyc_case_id", "country"})),
    "kyc.in_review": ("kyc_status", frozenset({"kyc_case_id", "country"})),
    "kyc.expired": ("kyc_status", frozenset({"kyc_case_id", "country"})),
    "match.created": ("match_found", frozenset({"match_id", "offer_id"})),
    "settlement.awaiting_funding": ("settlement_update", frozenset({"match_id", "deadline"})),
    "settlement.releasing": ("settlement_update", frozenset({"match_id"})),
    "settlement.completed": ("settlement_update", frozenset({"match_id"})),
    "settlement.cancelled": ("settlement_update", frozenset({"match_id"})),
    "settlement.unwinding": ("settlement_update", frozenset({"match_id"})),
    "settlement.refunded": ("settlement_update", frozenset({"match_id"})),
    # ADR-057: the other side of a deal opened a dispute (its escrow is paused).
    "dispute.opened": ("dispute_update", frozenset({"dispute_id", "match_id"})),
}

#: Settlement phase -> event (ADR-001 phases a person needs to hear about).
_PHASE_EVENTS = {
    "AWAITING_FUNDING": "settlement.awaiting_funding",
    "RELEASING": "settlement.releasing",
    "COMPLETED": "settlement.completed",
    "CANCELLED": "settlement.cancelled",
    "UNWINDING": "settlement.unwinding",
    "CLOSED_UNWOUND": "settlement.refunded",
}

MAX_PAGE = 50


async def notify(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    event: str,
    dedupe_key: str,
    now: datetime,
    **data: str,
) -> None:
    kind, allowed = EVENTS[event]
    if not set(data) <= allowed:  # pragma: no cover - guards against careless callers
        raise ValueError(f"{event}: unexpected data {sorted(set(data) - allowed)}")
    await db.execute(
        insert(Notification)
        .values(
            id=uuid.uuid4(),
            user_id=user_id,
            type=kind,
            payload={"event": event, "data": data},
            dedupe_key=dedupe_key[:128],
            created_at=now,
        )
        .on_conflict_do_nothing(index_elements=["user_id", "dedupe_key"])
    )


async def notify_settlement(db: AsyncSession, settlement: Settlement, now: datetime) -> None:
    """Tell both parties of a deal about its new phase (called where the phase changes)."""
    event = _PHASE_EVENTS.get(settlement.phase)
    if event is None:
        return
    row = (
        await db.execute(
            select(Match.id, Match.counterparty_user_id, Offer.user_id)
            .join(Transaction, Transaction.match_id == Match.id)
            .join(Offer, Offer.id == Match.offer_id)
            .where(Transaction.id == settlement.transaction_id)
        )
    ).one_or_none()
    if row is None:  # pragma: no cover - every settlement has a transaction
        return
    match_id, taker, maker = row
    data = {"match_id": str(match_id)}
    if event == "settlement.awaiting_funding" and settlement.funding_deadline is not None:
        data["deadline"] = settlement.funding_deadline.isoformat()
    for user_id in {maker, taker}:
        await notify(
            db,
            user_id=user_id,
            event=event,
            dedupe_key=f"settlement:{settlement.id}:{settlement.phase}",
            now=now,
            **data,
        )


def notification_view(n: Notification) -> dict[str, Any]:
    return {
        "notification_id": str(n.id),
        "type": n.type,
        "event": n.payload.get("event"),
        "data": n.payload.get("data", {}),
        "created_at": n.created_at.isoformat(),
        "read": n.read_at is not None,
    }


def _not_found() -> AppError:
    return AppError(
        "RES_404_NOT_FOUND",
        "That notification was not found.",
        status_code=status.HTTP_404_NOT_FOUND,
    )


class NotificationService:
    def __init__(self, db: AsyncSession, clock: Callable[[], datetime]) -> None:
        self._db = db
        self._clock = clock

    async def list(
        self,
        principal: Principal,
        *,
        read: bool | None = None,
        before: uuid.UUID | None = None,
        limit: int = 20,
    ) -> dict[str, Any]:
        limit = max(1, min(limit, MAX_PAGE))
        query = select(Notification).where(Notification.user_id == principal.user_id)
        if read is True:
            query = query.where(Notification.read_at.is_not(None))
        elif read is False:
            query = query.where(Notification.read_at.is_(None))
        if before is not None:
            anchor = await self._db.scalar(
                select(Notification.seq).where(
                    Notification.id == before, Notification.user_id == principal.user_id
                )
            )
            if anchor is None:
                await self._db.rollback()
                raise _not_found()
            query = query.where(Notification.seq < anchor)
        rows = list(
            (await self._db.scalars(query.order_by(Notification.seq.desc()).limit(limit + 1))).all()
        )
        unread = await self._db.scalar(
            select(func.count())
            .select_from(Notification)
            .where(Notification.user_id == principal.user_id, Notification.read_at.is_(None))
        )
        more = len(rows) > limit
        rows = rows[:limit]
        page = {
            "items": [notification_view(n) for n in rows],
            "unread_count": int(unread or 0),
            "next_before": str(rows[-1].id) if more and rows else None,
        }
        await self._db.rollback()  # read-only; views are built before the rows expire
        return page

    async def mark(
        self, principal: Principal, notification_id: uuid.UUID, read: bool
    ) -> dict[str, Any]:
        n = await self._db.scalar(
            select(Notification)
            .where(Notification.id == notification_id, Notification.user_id == principal.user_id)
            .with_for_update()
        )
        if n is None:
            # Someone else's or no such message: the same answer (no way to probe ids).
            await self._db.rollback()
            raise _not_found()
        if read and n.read_at is None:
            n.read_at = self._clock()
        elif not read:
            n.read_at = None
        view = notification_view(n)
        await self._db.commit()
        return view
