"""Market search rules (ADR-059 Decision 1).

Everything the client sends is checked here before it reaches a query: sort keys come from a
fixed allow-list, rates and amounts are exact decimal text turned into ``Decimal`` / integer
minor units (never floats), and a lower bound above its upper bound is refused.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Literal

from app.domain.offer_rules import (
    FORMAT_ERROR,
    OfferInputError,
    Pair,
    parse_amount_minor,
    parse_rate,
)

__all__ = ["SORTS", "STATUSES", "Search", "parse_search"]

Sort = Literal["best_rate", "newest", "oldest", "largest", "smallest"]
Status = Literal["available", "success"]

#: Allow-list. "best_rate" is today's order and the default.
SORTS: tuple[Sort, ...] = ("best_rate", "newest", "oldest", "largest", "smallest")
#: "available": offers that can still be taken. "success": recent completed trades.
STATUSES: tuple[Status, ...] = ("available", "success")


@dataclass(frozen=True)
class Search:
    sort: Sort = "best_rate"
    status: Status = "available"
    min_rate: Decimal | None = None
    max_rate: Decimal | None = None
    #: In minor units of the pair's FOREIGN currency, whichever side the offer sells.
    min_amount_minor: int | None = None
    max_amount_minor: int | None = None


def _rate(text: str | None) -> Decimal | None:
    if text is None:
        return None
    rate = parse_rate(text)
    if rate <= 0:
        raise OfferInputError(FORMAT_ERROR, "The rate must be more than zero.")
    return rate


def _amount(text: str | None, currency: str) -> int | None:
    if text is None:
        return None
    return parse_amount_minor(text, currency, minimum=False)


def parse_search(
    pair: Pair,
    *,
    sort: str | None,
    status: str | None,
    min_rate: str | None,
    max_rate: str | None,
    min_amount: str | None,
    max_amount: str | None,
) -> Search:
    """Validated search, or :class:`OfferInputError` naming what is wrong."""
    chosen_sort = sort or "best_rate"
    if chosen_sort not in SORTS:
        raise OfferInputError(FORMAT_ERROR, "That sort order is not available.")
    chosen_status = status or "available"
    if chosen_status not in STATUSES:
        raise OfferInputError(FORMAT_ERROR, "That status filter is not available.")
    low_rate, high_rate = _rate(min_rate), _rate(max_rate)
    if low_rate is not None and high_rate is not None and low_rate > high_rate:
        raise OfferInputError(FORMAT_ERROR, "The lowest rate can’t be above the highest rate.")
    low, high = _amount(min_amount, pair.foreign), _amount(max_amount, pair.foreign)
    if low is not None and high is not None and low > high:
        raise OfferInputError(
            FORMAT_ERROR, "The smallest amount can’t be above the largest amount."
        )
    return Search(
        sort=chosen_sort,
        status=chosen_status,
        min_rate=low_rate,
        max_rate=high_rate,
        min_amount_minor=low,
        max_amount_minor=high,
    )
