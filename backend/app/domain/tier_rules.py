"""Verification tiers and trade limits (ADR-058; owner decisions 2026-10-20 and 2026-10-26).

Xspeeria holds no money, so tiers limit how much a person may TRADE, counted in naira
equivalent across all their deals — deals they take and deals on their offers, from the moment
a deal starts. A deal that ends unpaid gives its amount back. "Day" and "month" are calendar
periods in Lagos time.

All amounts are integer kobo (NGN minor units). Never floats.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import ROUND_HALF_EVEN, Decimal
from zoneinfo import ZoneInfo

__all__ = ["LAGOS", "LIMITS", "Limits", "day_start", "month_start", "naira_minor_of"]

LAGOS = ZoneInfo("Africa/Lagos")
_KOBO = 100


@dataclass(frozen=True)
class Limits:
    daily_minor: int
    monthly_minor: int


#: ADR-058 Decision 1 (confirmed by the owner). Tier 0 may only look.
LIMITS: dict[int, Limits | None] = {
    0: None,
    1: Limits(500_000 * _KOBO, 2_000_000 * _KOBO),
    2: Limits(5_000_000 * _KOBO, 20_000_000 * _KOBO),
    3: Limits(20_000_000 * _KOBO, 100_000_000 * _KOBO),
}


def day_start(now: datetime) -> datetime:
    """Midnight today, Lagos time (as an aware datetime)."""
    local = now.astimezone(LAGOS)
    return local.replace(hour=0, minute=0, second=0, microsecond=0)


def month_start(now: datetime) -> datetime:
    """Midnight on the 1st of this month, Lagos time."""
    return day_start(now).replace(day=1)


def naira_minor_of(
    source_currency: str, allocated_minor: int, agreed_rate: Decimal, foreign_scale: int = 2
) -> int:
    """A deal's size in kobo: naira as is; foreign amount × rate, half to even."""
    if source_currency == "NGN":
        return allocated_minor
    foreign = Decimal(allocated_minor).scaleb(-foreign_scale)
    kobo = (foreign * agreed_rate * _KOBO).quantize(Decimal(1), rounding=ROUND_HALF_EVEN)
    return int(kobo)
