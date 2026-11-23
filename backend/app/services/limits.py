"""Trade limits by verification tier (ADR-058).

* ``tier_of``: 0 without an approved identity check, 1 with one, 2 with BVN and address, 3 with
  proof of address and the source-of-funds answer too (``app.services.tier_checks``).
* ``usage``: kobo traded today and this month (Lagos calendar), both sides, from deal start;
  deals that ended unpaid do not count.
* ``check_new_deal``: inside `accept`, holding the Offer lock — locks both people's user rows
  (in id order) so two deals at once cannot both slip under a limit, then refuses a deal that
  would take either person over their daily or monthly limit.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from fastapi import status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.exceptions import AppError
from app.db.row_scope import acting_for_service
from app.domain.tier_rules import LIMITS, day_start, deal_kobo, month_start
from app.models.identity import User
from app.models.kyc import KycCase
from app.models.marketplace import Match, Offer
from app.models.settlement import Settlement, Transaction
from app.models.tiers import TierCheck
from app.services.offers import money_text

__all__ = ["check_new_deal", "check_new_offer", "limits_view", "tier_of", "usage"]

#: A deal in one of these ended unpaid (or was paid back): its amount no longer counts.
_GIVEN_BACK_PHASES = ("CANCELLED", "UNWINDING", "CLOSED_UNWOUND")


async def tier_of(db: AsyncSession, user_id: uuid.UUID, settings: Settings) -> int:
    """ADR-058: 0 look only; 1 identity check; 2 + BVN and address; 3 + proof of address and
    source of funds. The local identity bypass counts as an identity check."""
    approved = await db.scalar(
        select(KycCase.id).where(KycCase.user_id == user_id, KycCase.status == "approved").limit(1)
    )
    if approved is None and not (settings.kyc_dev_bypass and settings.app_env == "local"):
        return 0
    done = set(
        (
            await db.scalars(
                select(TierCheck.kind).where(
                    TierCheck.user_id == user_id, TierCheck.status == "approved"
                )
            )
        ).all()
    )
    if not {"bvn", "address"} <= done:
        return 1
    if not {"proof_of_address", "source_of_funds"} <= done:
        return 2
    return 3


async def usage(db: AsyncSession, user_id: uuid.UUID, now: datetime) -> tuple[int, int]:
    """(today, this month) in kobo."""
    since = month_start(now)
    today = day_start(now)
    given_back = (
        select(Settlement.id)
        .join(Transaction, Transaction.id == Settlement.transaction_id)
        .where(Transaction.match_id == Match.id, Settlement.phase.in_(_GIVEN_BACK_PHASES))
        .exists()
    )
    rows = (
        await db.execute(
            select(
                Offer.source_currency,
                Offer.target_currency,
                Match.allocated_amount_minor,
                Match.agreed_rate,
                Match.accepted_at,
            )
            .join(Offer, Offer.id == Match.offer_id)
            .where(
                or_(Match.counterparty_user_id == user_id, Offer.user_id == user_id),
                Match.accepted_at >= since,
                Match.preparation_state != "expired",
                ~given_back,
            )
        )
    ).all()
    day = month = 0
    for source, target, allocated, rate, accepted_at in rows:
        kobo = deal_kobo(source, target, int(allocated), rate)
        month += kobo
        if accepted_at >= today:
            day += kobo
    return day, month


async def check_new_deal(
    db: AsyncSession,
    offer: Offer,
    taker_id: uuid.UUID,
    amount_minor: int,
    now: datetime,
    settings: Settings,
) -> None:
    """Refuse a deal that would take the taker or the offer's owner over a limit."""
    deal = deal_kobo(offer.source_currency, offer.target_currency, amount_minor, offer.desired_rate)
    people = sorted({taker_id, offer.user_id})
    await db.execute(select(User.id).where(User.id.in_(people)).order_by(User.id).with_for_update())
    # The taker first: when both would go over, tell the taker about their own limit.
    for person in sorted(people, key=lambda p: p != taker_id):
        mine = person == taker_id
        if mine:
            tier = await tier_of(db, person, settings)
            day, month = await usage(db, person, now)
        else:
            # The owner's identity check and tier checks are their private rows (ADR-078);
            # the taker's request can't see them. Only the owner's tier and usage are read
            # here, never shown: a refusal says only "can't be taken right now".
            async with acting_for_service(db, "deal limits: the other party's tier and usage"):
                tier = await tier_of(db, person, settings)
                day, month = await usage(db, person, now)
        limits = LIMITS[tier]
        if limits is None:
            raise AppError(
                "AUTH_403_KYC_REQUIRED" if mine else "TRADE_403_COUNTERPARTY_LIMIT",
                "Verify your identity to trade."
                if mine
                else "This offer can’t be taken right now. Try another offer.",
                status_code=status.HTTP_403_FORBIDDEN,
            )
        over_day = day + deal > limits.daily_minor
        over_month = month + deal > limits.monthly_minor
        if not (over_day or over_month):
            continue
        if not mine:
            # Never reveal another person's limits or usage.
            raise AppError(
                "TRADE_403_COUNTERPARTY_LIMIT",
                "This offer can’t be taken right now. Try another offer.",
                status_code=status.HTTP_403_FORBIDDEN,
            )
        left = max(0, min(limits.daily_minor - day, limits.monthly_minor - month))
        raise AppError(
            "TRADE_403_DAILY_LIMIT" if over_day else "TRADE_403_MONTHLY_LIMIT",
            (
                f"This deal is over your daily limit. You can trade up to NGN "
                f"{money_text(left, 2)} more today."
                if over_day
                else f"This deal is over your monthly limit. You can trade up to NGN "
                f"{money_text(left, 2)} more this month."
            ),
            status_code=status.HTTP_403_FORBIDDEN,
            details={"left": money_text(left, 2)},
        )


async def check_new_offer(
    db: AsyncSession, user_id: uuid.UUID, value_kobo: int, now: datetime, settings: Settings
) -> None:
    """Owner 2026-11-11 ("Stop it"): an offer or request bigger than its owner can still trade
    today or this month is refused, so nobody sees one that can't be filled.

    ``value_kobo`` is the whole offer at its naira value (``deal_kobo``). Deals already made
    count, as for ``check_new_deal``; other open offers don't (only one deal is ever counted
    once). Tier 0 can't post at all, which the identity check before this already says.
    """
    tier = await tier_of(db, user_id, settings)
    limits = LIMITS[tier]
    if limits is None:
        raise AppError(
            "AUTH_403_KYC_REQUIRED",
            "Verify your identity to trade.",
            status_code=status.HTTP_403_FORBIDDEN,
        )
    day, month = await usage(db, user_id, now)
    over_day = day + value_kobo > limits.daily_minor
    over_month = month + value_kobo > limits.monthly_minor
    if not (over_day or over_month):
        return
    left = max(0, min(limits.daily_minor - day, limits.monthly_minor - month))
    raise AppError(
        "TRADE_403_DAILY_LIMIT" if over_day else "TRADE_403_MONTHLY_LIMIT",
        (
            f"This offer is over your daily limit. You can trade up to NGN "
            f"{money_text(left, 2)} more today."
            if over_day
            else f"This offer is over your monthly limit. You can trade up to NGN "
            f"{money_text(left, 2)} more this month."
        ),
        status_code=status.HTTP_403_FORBIDDEN,
        details={"left": money_text(left, 2), "for": "offer"},
    )


async def limits_view(
    db: AsyncSession, user_id: uuid.UUID, now: datetime, settings: Settings
) -> dict[str, Any]:
    tier = await tier_of(db, user_id, settings)
    limits = LIMITS[tier]
    day, month = await usage(db, user_id, now)
    if limits is None:
        return {
            "tier": tier,
            "daily_limit": None,
            "monthly_limit": None,
            "used_today": money_text(day, 2),
            "used_this_month": money_text(month, 2),
            "left_today": "0.00",
            "left_this_month": "0.00",
        }
    return {
        "tier": tier,
        "daily_limit": money_text(limits.daily_minor, 2),
        "monthly_limit": money_text(limits.monthly_minor, 2),
        "used_today": money_text(day, 2),
        "used_this_month": money_text(month, 2),
        "left_today": money_text(max(0, limits.daily_minor - day), 2),
        "left_this_month": money_text(max(0, limits.monthly_minor - month), 2),
    }
