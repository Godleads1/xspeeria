"""Waiting queue for offers someone else is paying for (ADR-059 Decision 4).

An offer whose whole amount is taken by deals that are not paid yet is "waiting for payment".
Up to 3 people may wait for it, each in only one queue at a time. When a deal on it ends
without payment and its amount comes back, the first person waiting is told it is their turn
and has 5 minutes to take it; nobody else can take it meanwhile. If they don't, the turn
passes on; when nobody is left the offer is simply available again.

Every rule is checked on the server under the offer's row lock — the same lock taking an offer
uses — so a join, a turn and a take can never race each other. Nothing here moves money.
"""

from __future__ import annotations

import uuid
from collections.abc import Callable
from datetime import datetime, timedelta
from typing import Any

from fastapi import status
from sqlalchemy import and_, exists, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError
from app.core.logging import get_logger
from app.domain.offer_rules import ceiling_key, offer_pair
from app.models.marketplace import QUEUE_ACTIVE, Match, Offer, OfferQueueEntry
from app.models.settlement import Settlement, Transaction
from app.services.auth import Principal
from app.services.deal_pause import deals_paused, refuse_if_paused
from app.services.groups import reopen_group
from app.services.notifications import notify
from app.services.official_rates import current_ceilings

__all__ = [
    "QUEUE_LIMIT",
    "TURN_WINDOW",
    "QueueService",
    "active_turn",
    "on_capacity_returned",
    "pass_overdue_turns",
    "pending_minor_expr",
    "queue_facts",
]

_logger = get_logger(__name__)

#: Owner decisions, 2026-10-21.
QUEUE_LIMIT = 3
TURN_WINDOW = timedelta(minutes=5)
#: Offer statuses a queue can belong to (fully taken offers included).
QUEUE_OFFER_STATUSES = ("open", "partially_matched", "fully_matched")
#: Escrow phases in which a deal is still waiting for payment.
_UNPAID_PHASES = ("INITIALIZING", "AWAITING_FUNDING")


def _err(code: str, message: str, http: int) -> AppError:
    return AppError(code, message, status_code=http)


def _unfinished_match() -> Any:
    """A Match whose amount is held but not paid: choosing payout accounts, or funding."""
    settled_elsewhere = exists(
        select(Settlement.id)
        .join(Transaction, Transaction.id == Settlement.transaction_id)
        .where(Transaction.match_id == Match.id, Settlement.phase.not_in(_UNPAID_PHASES))
    )
    return or_(
        Match.preparation_state == "awaiting_payout_accounts",
        and_(Match.preparation_state == "funding_ready", ~settled_elsewhere),
    )


def pending_minor_expr() -> Any:
    """Per Offer (correlated): the amount held by deals that are not paid yet."""
    return (
        select(func.coalesce(func.sum(Match.allocated_amount_minor), 0))
        .where(Match.offer_id == Offer.id, _unfinished_match())
        .correlate(Offer)
        .scalar_subquery()
    )


async def _pending(db: AsyncSession, offer_id: uuid.UUID) -> int:
    value = await db.scalar(
        select(func.coalesce(func.sum(Match.allocated_amount_minor), 0)).where(
            Match.offer_id == offer_id, _unfinished_match()
        )
    )
    return int(value or 0)


async def active_turn(
    db: AsyncSession, offer_id: uuid.UUID, now: datetime
) -> OfferQueueEntry | None:
    """The queue entry whose 5-minute turn is running on this offer, if any."""
    entry: OfferQueueEntry | None = await db.scalar(
        select(OfferQueueEntry).where(
            OfferQueueEntry.offer_id == offer_id,
            OfferQueueEntry.status == "notified",
            OfferQueueEntry.turn_deadline > now,
        )
    )
    return entry


async def queue_facts(
    db: AsyncSession, offer_ids: list[uuid.UUID], viewer: uuid.UUID, now: datetime
) -> dict[uuid.UUID, dict[str, Any]]:
    """For listing rows: queue length, whether the viewer waits, and whose turn it is."""
    if not offer_ids:
        return {}
    rows = (
        await db.execute(
            select(
                OfferQueueEntry.offer_id,
                OfferQueueEntry.user_id,
                OfferQueueEntry.status,
                OfferQueueEntry.turn_deadline,
            ).where(
                OfferQueueEntry.offer_id.in_(offer_ids),
                OfferQueueEntry.status.in_(QUEUE_ACTIVE),
            )
        )
    ).all()
    out: dict[uuid.UUID, dict[str, Any]] = {
        oid: {"queue_length": 0, "in_queue": False, "your_turn": False, "held_for_other": False}
        for oid in offer_ids
    }
    for offer_id, user_id, state, deadline in rows:
        facts = out[offer_id]
        facts["queue_length"] += 1
        mine = user_id == viewer
        facts["in_queue"] = facts["in_queue"] or mine
        live_turn = state == "notified" and deadline is not None and deadline > now
        if live_turn:
            facts["your_turn"] = facts["your_turn"] or mine
            facts["held_for_other"] = facts["held_for_other"] or not mine
    return out


async def pass_overdue_turns(db: AsyncSession, offer: Offer, now: datetime) -> bool:
    """Inside a transaction holding the Offer lock: a turn whose time ran out passes on.

    F-009: a take must not slip in during the gap between a turn's deadline and the background
    sweep. The turns that ran out are marked passed, and the next waiting person gets theirs.
    Returns whether any turn passed; the caller must commit that handoff even if it then refuses.
    """
    if await deals_paused(db):  # ADR-075: clocks frozen
        return False
    overdue = (
        await db.scalars(
            select(OfferQueueEntry)
            .where(
                OfferQueueEntry.offer_id == offer.id,
                OfferQueueEntry.status == "notified",
                OfferQueueEntry.turn_deadline.is_not(None),
                OfferQueueEntry.turn_deadline <= now,
            )
            .with_for_update()
        )
    ).all()
    if not overdue:
        return False
    for entry in overdue:
        entry.status = "passed"
        entry.ended_at = now
    await db.flush()
    await on_capacity_returned(db, offer, now)
    return True


async def on_capacity_returned(db: AsyncSession, offer: Offer, now: datetime) -> None:
    """Inside a transaction holding the Offer lock: give the next person their turn.

    Called wherever an unpaid deal returns its amount; the background sweep calls it too, so a
    missed call only delays the turn, never loses it.
    """
    # ADR-059 Decision 5: a failed deal on one currency brings the request's others back.
    await reopen_group(db, offer, now)
    if offer.status not in ("open", "partially_matched"):
        return
    if offer.source_amount_minor - offer.matched_amount_minor <= 0:
        return
    if await active_turn(db, offer.id, now) is not None:
        return
    nxt = await db.scalar(
        select(OfferQueueEntry)
        .where(OfferQueueEntry.offer_id == offer.id, OfferQueueEntry.status == "waiting")
        .order_by(OfferQueueEntry.joined_at, OfferQueueEntry.id)
        .limit(1)
        .with_for_update()
    )
    if nxt is None:
        return
    nxt.status = "notified"
    nxt.notified_at = now
    nxt.turn_deadline = now + TURN_WINDOW
    await db.flush()
    await notify(
        db,
        user_id=nxt.user_id,
        event="queue.your_turn",
        dedupe_key=f"queue:{nxt.id}:turn",
        now=now,
        offer_id=str(offer.id),
        deadline=nxt.turn_deadline.isoformat(),
    )
    _logger.info("queue_turn_started", extra={"offer_id": str(offer.id), "entry_id": str(nxt.id)})


async def mark_taken(
    db: AsyncSession, offer_id: uuid.UUID, user_id: uuid.UUID, now: datetime
) -> None:
    """The person whose turn it was (or who was waiting) took the offer."""
    entry = await db.scalar(
        select(OfferQueueEntry)
        .where(
            OfferQueueEntry.offer_id == offer_id,
            OfferQueueEntry.user_id == user_id,
            OfferQueueEntry.status.in_(QUEUE_ACTIVE),
        )
        .with_for_update()
    )
    if entry is not None:
        entry.status = "taken"
        entry.ended_at = now


def entry_view(entry: OfferQueueEntry, position: int, length: int) -> dict[str, Any]:
    return {
        "offer_id": str(entry.offer_id),
        "status": entry.status,
        "position": position,
        "queue_length": length,
        "turn_deadline": entry.turn_deadline.isoformat() if entry.turn_deadline else None,
    }


class QueueService:
    def __init__(self, db: AsyncSession, clock: Callable[[], datetime]) -> None:
        self._db = db
        self._clock = clock

    async def _position(self, entry: OfferQueueEntry) -> tuple[int, int]:
        rows = (
            await self._db.scalars(
                select(OfferQueueEntry.id)
                .where(
                    OfferQueueEntry.offer_id == entry.offer_id,
                    OfferQueueEntry.status.in_(QUEUE_ACTIVE),
                )
                .order_by(OfferQueueEntry.joined_at, OfferQueueEntry.id)
            )
        ).all()
        ids = list(rows)
        return (ids.index(entry.id) + 1 if entry.id in ids else 0), len(ids)

    async def join(self, principal: Principal, offer_id: uuid.UUID) -> dict[str, Any]:
        await refuse_if_paused(self._db)  # ADR-075: deals paused
        now = self._clock()
        offer = await self._db.scalar(select(Offer).where(Offer.id == offer_id).with_for_update())
        if offer is None:
            await self._db.rollback()
            raise _err("RES_404_NOT_FOUND", "That offer was not found.", status.HTTP_404_NOT_FOUND)
        if offer.user_id == principal.user_id:
            await self._db.rollback()
            raise _err(
                "AUTH_403_SELF_MATCH_FORBIDDEN",
                "You can’t wait for your own offer.",
                status.HTTP_403_FORBIDDEN,
            )
        key = ceiling_key(offer_pair(offer))  # ADR-111: "USD" or "USD/GHS"
        ceiling = (await current_ceilings(self._db, self._clock())).get(key)
        if (
            offer.status not in QUEUE_OFFER_STATUSES
            or ceiling is None
            or offer.desired_rate > ceiling
        ):
            await self._db.rollback()
            raise _err(
                "RES_409_OFFER_UNAVAILABLE",
                "This offer is no longer available.",
                status.HTTP_409_CONFLICT,
            )
        mine = await self._db.scalar(
            select(OfferQueueEntry).where(
                OfferQueueEntry.user_id == principal.user_id,
                OfferQueueEntry.status.in_(QUEUE_ACTIVE),
            )
        )
        if mine is not None and mine.offer_id == offer.id:
            position, length = await self._position(mine)
            view = entry_view(mine, position, length)
            await self._db.rollback()
            return view  # joining twice is harmless
        if mine is not None:
            await self._db.rollback()
            raise _err(
                "RES_409_ALREADY_IN_QUEUE",
                "You are already waiting for another offer. Leave that queue first.",
                status.HTTP_409_CONFLICT,
            )
        remaining = offer.source_amount_minor - offer.matched_amount_minor
        turn = await active_turn(self._db, offer.id, now)
        held_for_other = turn is not None and turn.user_id != principal.user_id
        pending = await _pending(self._db, offer.id)
        if remaining > 0 and not held_for_other:
            await self._db.rollback()
            raise _err(
                "RES_409_OFFER_AVAILABLE",
                "This offer can be taken now, so there is no need to wait.",
                status.HTTP_409_CONFLICT,
            )
        if remaining <= 0 and pending <= 0:
            await self._db.rollback()
            raise _err(
                "RES_409_OFFER_UNAVAILABLE",
                "This offer is no longer available.",
                status.HTTP_409_CONFLICT,
            )
        in_deal = await self._db.scalar(
            select(Match.id).where(
                Match.offer_id == offer.id,
                Match.counterparty_user_id == principal.user_id,
                _unfinished_match(),
            )
        )
        if in_deal is not None:
            await self._db.rollback()
            raise _err(
                "RES_409_ALREADY_IN_DEAL",
                "You already have a deal on this offer.",
                status.HTTP_409_CONFLICT,
            )
        waiting_count = await self._db.scalar(
            select(func.count(OfferQueueEntry.id)).where(
                OfferQueueEntry.offer_id == offer.id,
                OfferQueueEntry.status.in_(QUEUE_ACTIVE),
            )
        )
        if int(waiting_count or 0) >= QUEUE_LIMIT:
            await self._db.rollback()
            raise _err(
                "RES_409_QUEUE_FULL",
                "The queue for this offer is full. Try another offer.",
                status.HTTP_409_CONFLICT,
            )
        entry = OfferQueueEntry(
            id=uuid.uuid4(),
            offer_id=offer.id,
            user_id=principal.user_id,
            status="waiting",
            joined_at=now,
        )
        self._db.add(entry)
        try:
            await self._db.flush()
        except IntegrityError:
            # Joined another queue at the same moment: the unique index decides.
            await self._db.rollback()
            raise _err(
                "RES_409_ALREADY_IN_QUEUE",
                "You are already waiting for another offer. Leave that queue first.",
                status.HTTP_409_CONFLICT,
            ) from None
        position, total = await self._position(entry)
        view = entry_view(entry, position, total)
        await self._db.commit()
        _logger.info(
            "queue_joined",
            extra={"user_id": str(principal.user_id), "offer_id": str(offer.id)},
        )
        return view

    async def leave(self, principal: Principal, offer_id: uuid.UUID) -> None:
        """Leaving is always allowed; a running turn passes on at once."""
        now = self._clock()
        offer = await self._db.scalar(select(Offer).where(Offer.id == offer_id).with_for_update())
        entry = await self._db.scalar(
            select(OfferQueueEntry)
            .where(
                OfferQueueEntry.offer_id == offer_id,
                OfferQueueEntry.user_id == principal.user_id,
                OfferQueueEntry.status.in_(QUEUE_ACTIVE),
            )
            .with_for_update()
        )
        if offer is None or entry is None:
            await self._db.rollback()
            return  # nothing to leave: repeat-safe
        entry.status = "left"
        entry.ended_at = now
        await self._db.flush()
        await on_capacity_returned(self._db, offer, now)
        await self._db.commit()

    async def mine(self, principal: Principal) -> dict[str, Any] | None:
        entry = await self._db.scalar(
            select(OfferQueueEntry).where(
                OfferQueueEntry.user_id == principal.user_id,
                OfferQueueEntry.status.in_(QUEUE_ACTIVE),
            )
        )
        if entry is None:
            await self._db.rollback()
            return None
        position, length = await self._position(entry)
        view = entry_view(entry, position, length)
        await self._db.rollback()
        return view

    async def sweep(self, *, limit: int = 200) -> int:
        """Background pass: pass on missed turns, start due turns, end queues for offers that
        will not come back (withdrawn, or completed). One transaction per offer."""
        if await deals_paused(self._db):  # ADR-075: clocks frozen, nothing is expired
            await self._db.rollback()
            return 0
        now = self._clock()
        offer_ids = (
            await self._db.scalars(
                select(OfferQueueEntry.offer_id)
                .where(OfferQueueEntry.status.in_(QUEUE_ACTIVE))
                .distinct()
                .limit(limit)
            )
        ).all()
        await self._db.rollback()
        changed = 0
        for offer_id in offer_ids:
            offer = await self._db.scalar(
                select(Offer).where(Offer.id == offer_id).with_for_update()
            )
            if offer is None:  # pragma: no cover - entries reference existing offers
                await self._db.rollback()
                continue
            entries = (
                await self._db.scalars(
                    select(OfferQueueEntry)
                    .where(
                        OfferQueueEntry.offer_id == offer_id,
                        OfferQueueEntry.status.in_(QUEUE_ACTIVE),
                    )
                    .with_for_update()
                )
            ).all()
            for e in entries:
                if (
                    e.status == "notified"
                    and e.turn_deadline is not None
                    and e.turn_deadline <= now
                ):
                    e.status = "passed"
                    e.ended_at = now
                    changed += 1
            remaining = offer.source_amount_minor - offer.matched_amount_minor
            gone = offer.status not in QUEUE_OFFER_STATUSES or (
                remaining <= 0 and await _pending(self._db, offer_id) <= 0
            )
            if gone:
                for e in entries:
                    if e.status in QUEUE_ACTIVE:
                        e.status = "ended"
                        e.ended_at = now
                        changed += 1
            await self._db.flush()
            if not gone:
                await on_capacity_returned(self._db, offer, now)
            await self._db.commit()
        return changed
