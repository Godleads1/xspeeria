"""Xspeeria Fair Fee — ADR-098 (owner 2026-11-04: "use the fee model"; DEC-110).

Each side of a deal pays a fee on the money it **sends**, in that currency, on top (ADR-021
unchanged on that point). What changes is how much:

* **Bands** on the amount one side sends: 1% on the first 1,000 (USD/GBP/EUR) or ₦1,600,000;
  0.6% on the part up to 5,000 / ₦8,000,000; 0.3% above.
* **Minimum** per side 0.50 / ₦800, **maximum** 30 / ₦48,000. Naira figures are fixed in
  naira, never converted from dollars.
* **Maker discount**: the side that posted the offer (``REQUESTER``) pays 25% less, never below
  the minimum. So a maker pays at most 22.50 / ₦36,000.

Integer minor units only (scale 2 for every currency here), each step rounded half to even,
as the 1% fee was (ADR-019 §2). The numbers live in ``SCHEDULES`` and ``MAKER_DISCOUNT_BPS``;
changing them is an owner decision, pinned by ``test_fee_rules.py``.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

__all__ = [
    "MAKER_DISCOUNT_BPS",
    "SCHEDULES",
    "FeeSchedule",
    "Side",
    "side_fee_minor",
]

Side = Literal["maker", "taker"]


@dataclass(frozen=True)
class FeeSchedule:
    """One currency's figures, in minor units (scale 2)."""

    #: (upper edge of the band in minor units, or None for the last band; rate in basis points)
    bands: tuple[tuple[int | None, int], ...]
    minimum_minor: int
    maximum_minor: int


def _schedule(first_edge: int, second_edge: int, minimum: int, maximum: int) -> FeeSchedule:
    return FeeSchedule(
        bands=((first_edge, 100), (second_edge, 60), (None, 30)),
        minimum_minor=minimum,
        maximum_minor=maximum,
    )


#: Owner's figures, 2026-11-04 (GBP and EUR as USD until the owner sets their own).
SCHEDULES: dict[str, FeeSchedule] = {
    "NGN": _schedule(160_000_000, 800_000_000, 80_000, 4_800_000),
    "USD": _schedule(100_000, 500_000, 50, 3_000),
    "GBP": _schedule(100_000, 500_000, 50, 3_000),
    "EUR": _schedule(100_000, 500_000, 50, 3_000),
}

#: The side that posted the offer pays 25% less (owner, 2026-11-04).
MAKER_DISCOUNT_BPS = 2_500


def _round_half_even(numerator: int, denominator: int) -> int:
    q, r = divmod(numerator, denominator)
    if 2 * r > denominator or (2 * r == denominator and q % 2 == 1):
        q += 1
    return q


def side_fee_minor(sent_minor: int, currency: str, side: Side) -> int:
    """The fee one side pays on ``sent_minor`` of ``currency``, in minor units."""
    if sent_minor < 0:
        raise ValueError("amount must be non-negative")
    schedule = SCHEDULES.get(currency)
    if schedule is None:
        raise ValueError(f"no fee schedule for {currency}")
    if sent_minor == 0:
        return 0
    # Each band's rate applies only to the part of the amount inside that band.
    weighted = 0  # amount × basis points, summed exactly
    lower = 0
    for upper, bps in schedule.bands:
        top = sent_minor if upper is None else min(sent_minor, upper)
        if top > lower:
            weighted += (top - lower) * bps
        if upper is None or sent_minor <= upper:
            break
        lower = upper
    fee = _round_half_even(weighted, 10_000)
    fee = min(max(fee, schedule.minimum_minor), schedule.maximum_minor)
    if side == "maker":
        fee = _round_half_even(fee * (10_000 - MAKER_DISCOUNT_BPS), 10_000)
        fee = max(fee, schedule.minimum_minor)
    return fee
