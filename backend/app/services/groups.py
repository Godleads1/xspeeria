"""Buy requests in several currencies (ADR-059 Decision 5).

A group is one naira amount offered for 2–5 currencies, each an ordinary offer with its own
rate. The same naira cannot fund two deals, so:

* taking one currency locks the group to that offer — the others are hidden and refused;
* if that deal ends unpaid, the group opens again and the others come back;
* if it completes, the group is done and the others are withdrawn ("deleted" for the user).

Whole amount only. Lock order is always Offer → group (the same as taking an offer), so two
people taking two currencies at once cannot both win and cannot deadlock.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import status
from sqlalchemy import exists, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError
from app.core.logging import get_logger
from app.models.marketplace import QUEUE_ACTIVE, Offer, OfferGroup, OfferQueueEntry

__all__ = [
    "GROUP_MAX",
    "GROUP_MIN",
    "complete_group",
    "group_visible",
    "lock_group_for_take",
    "reopen_group",
]

_logger = get_logger(__name__)

#: Owner, 2026-10-21: "make 5 desired currencies"; one currency is an ordinary request.
GROUP_MIN = 2
GROUP_MAX = 5


def group_visible() -> Any:
    """Listing condition: not grouped, or the group is open, or this offer holds the lock."""
    blocked = exists(
        select(OfferGroup.id).where(
            OfferGroup.id == Offer.group_id,
            OfferGroup.status != "open",
            OfferGroup.locked_offer_id != Offer.id,
        )
    )
    return ~blocked


async def lock_group_for_take(
    db: AsyncSession, offer: Offer, amount_minor: int, now: datetime
) -> None:
    """Inside `accept`, holding the Offer lock: whole amount only, then lock the group."""
    if offer.group_id is None:
        return
    remaining = offer.source_amount_minor - offer.matched_amount_minor
    if amount_minor != remaining:
        raise AppError(
            "VAL_422_WHOLE_AMOUNT_ONLY",
            "This request can only be taken whole.",
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        )
    group = await db.scalar(
        select(OfferGroup).where(OfferGroup.id == offer.group_id).with_for_update()
    )
    if group is None or group.status != "open":
        raise AppError(
            "RES_409_OFFER_UNAVAILABLE",
            "This offer is no longer available.",
            status_code=status.HTTP_409_CONFLICT,
        )
    group.status = "locked"
    group.locked_offer_id = offer.id
    group.updated_at = now


async def reopen_group(db: AsyncSession, offer: Offer, now: datetime) -> None:
    """The deal on the locked currency ended unpaid: the other currencies come back."""
    if offer.group_id is None or offer.matched_amount_minor != 0:
        return
    group = await db.scalar(
        select(OfferGroup).where(OfferGroup.id == offer.group_id).with_for_update()
    )
    if group is not None and group.status == "locked" and group.locked_offer_id == offer.id:
        group.status = "open"
        group.locked_offer_id = None
        group.updated_at = now
        _logger.info("offer_group_reopened", extra={"group_id": str(group.id)})


async def complete_group(db: AsyncSession, offer: Offer, now: datetime) -> None:
    """The deal on the locked currency completed: the group is done, the rest withdrawn."""
    if offer.group_id is None:
        return
    siblings = (
        await db.scalars(
            select(Offer)
            .where(Offer.group_id == offer.group_id, Offer.id != offer.id)
            .order_by(Offer.id)
            .with_for_update()
        )
    ).all()
    group = await db.scalar(
        select(OfferGroup).where(OfferGroup.id == offer.group_id).with_for_update()
    )
    if group is None or group.status == "done":
        return
    for other in siblings:
        if other.status in ("open", "partially_matched") and other.matched_amount_minor == 0:
            other.status = "withdrawn"
            other.withdrawn_at = now
            other.version += 1
    sibling_ids = [o.id for o in siblings]
    if sibling_ids:
        await db.execute(
            update(OfferQueueEntry)
            .where(
                OfferQueueEntry.offer_id.in_(sibling_ids),
                OfferQueueEntry.status.in_(QUEUE_ACTIVE),
            )
            .values(status="ended", ended_at=now)
        )
    group.status = "done"
    group.locked_offer_id = offer.id
    group.updated_at = now
    _logger.info("offer_group_done", extra={"group_id": str(group.id)})
