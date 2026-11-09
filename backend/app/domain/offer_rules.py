"""Offer rules as pure functions (ADR-020, ADR-029). No I/O, no clock.

Rates are always **NGN per 1 unit of the foreign currency**, whichever side the offer sells.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import timedelta
from decimal import ROUND_HALF_EVEN, Decimal, InvalidOperation

__all__ = [
    "CURRENCY_DEF_VERSION",
    "FORMAT_ERROR",
    "FOREIGN",
    "IDEMPOTENCY_TTL",
    "MARKET_REQUESTS_PER_MINUTE",
    "MINIMUM_MINOR",
    "OFFICIAL_RATE",
    "OFFICIAL_RATE_AS_OF",
    "CAD_PER_USD",
    "CAD_PER_USD_AS_OF",
    "RATE_PLACES",
    "SCALE",
    "OfferInputError",
    "Pair",
    "below_minimum",
    "parse_amount_minor",
    "parse_pair",
    "parse_rate",
    "rate_problem",
]

#: The currency-definition version offers are bound to (inserted by the
#: `app.cli.currency_definitions` command; permanent under CD3).
CURRENCY_DEF_VERSION = "iso4217-v1"
#: ISO 4217 minor units for the launch currencies.
SCALE: dict[str, int] = {"NGN": 2, "USD": 2, "GBP": 2, "EUR": 2, "CAD": 2}
#: CAD: Canada joins the MVP corridors (ADR-100); its ceiling is derived from the USD one (ADR-101).
FOREIGN = frozenset({"USD", "GBP", "EUR", "CAD"})

#: ADR-020 — CBN official rate snapshot, 17 Oct 2026: the maximum allowed rate.
OFFICIAL_RATE: dict[str, Decimal] = {
    "USD": Decimal("1333.26"),
    "GBP": Decimal("1765.11"),
    "EUR": Decimal("1491.20"),
}
OFFICIAL_RATE_AS_OF = "2026-10-17"

#: ADR-101 (owner, 2026-11-09): the CBN publishes no CAD figure we can rely on, so the CAD
#: ceiling = the USD ceiling ÷ Bank of Canada's daily USD/CAD rate (CAD per 1 USD), rounded
#: half to even to the kobo. Refreshing the USD ceiling or this rate changes CAD with it.
CAD_PER_USD = Decimal("1.4113")
CAD_PER_USD_AS_OF = "2026-11-06"
OFFICIAL_RATE["CAD"] = (OFFICIAL_RATE["USD"] / CAD_PER_USD).quantize(
    Decimal("0.01"), rounding=ROUND_HALF_EVEN
)

#: ADR-029 — ₦10,000 or 10 units of the foreign currency.
MINIMUM_MINOR: dict[str, int] = {
    "NGN": 1_000_000,
    "USD": 1_000,
    "GBP": 1_000,
    "EUR": 1_000,
    "CAD": 1_000,
}

#: ADR-031 — offer and marketplace requests per signed-in user per minute (product owner,
#: 2026-10-18: "60 per user per min"). Separate from the sign-in limit.
MARKET_REQUESTS_PER_MINUTE = 60

#: ADR-029 — remember each Idempotency-Key for 24 hours.
IDEMPOTENCY_TTL = timedelta(hours=24)

#: NUMERIC(12,6): up to 6 decimal places, 6 integer digits.
RATE_PLACES = 6
_RATE_MAX = Decimal("999999.999999")
_DECIMAL_TEXT = re.compile(r"^[0-9]{1,15}(\.[0-9]{1,8})?$")


#: The app's general validation code (used for every malformed field). No new contract
#: identifier is invented for shape errors.
FORMAT_ERROR = "VALIDATION_ERROR"


class OfferInputError(ValueError):
    """A field the client sent is not acceptable. ``code`` is a contract identifier."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class Pair:
    source: str
    target: str

    @property
    def foreign(self) -> str:
        return self.target if self.source == "NGN" else self.source


def parse_pair(source: str, target: str) -> Pair:
    """NGN with one of USD/GBP/EUR, in either direction."""
    s, t = source.upper(), target.upper()
    if s == t or "NGN" not in (s, t) or (s if t == "NGN" else t) not in FOREIGN:
        raise OfferInputError(
            FORMAT_ERROR, "Offers exchange naira with US dollars, pounds or euros."
        )
    return Pair(s, t)


def parse_amount_minor(text: str, currency: str, *, minimum: bool = True) -> int:
    """Plain decimal text → exact minor units. Extra decimals are refused, never rounded.

    With ``minimum=False`` only "more than zero" is checked; the caller applies its own rule
    (acceptance: the minimum, or exactly what is left — ADR-031).
    """
    if not _DECIMAL_TEXT.fullmatch(text):
        raise OfferInputError(FORMAT_ERROR, "Enter the amount as a number, e.g. 1000.00.")
    value = Decimal(text)
    scale = SCALE[currency]
    exponent = value.as_tuple().exponent
    if isinstance(exponent, int) and -exponent > scale:
        raise OfferInputError(
            FORMAT_ERROR, f"{currency} amounts have at most {scale} decimal places."
        )
    minor = int(value.scaleb(scale))
    if minor <= 0:
        raise OfferInputError(FORMAT_ERROR, "The amount must be more than zero.")
    if minimum and minor < MINIMUM_MINOR[currency]:
        shown = Decimal(MINIMUM_MINOR[currency]).scaleb(-scale)
        raise OfferInputError(
            "VAL_422_AMOUNT_BELOW_MINIMUM", f"The smallest offer is {shown:,.2f} {currency}."
        )
    return minor


def below_minimum(currency: str) -> OfferInputError:
    shown = Decimal(MINIMUM_MINOR[currency]).scaleb(-SCALE[currency])
    return OfferInputError(
        "VAL_422_AMOUNT_BELOW_MINIMUM", f"The smallest amount is {shown:,.2f} {currency}."
    )


def parse_rate(text: str) -> Decimal:
    """Decimal text, up to 6 places. Sign and size are judged by :func:`rate_problem`."""
    try:
        if not re.fullmatch(r"^-?[0-9]{1,7}(\.[0-9]{1,6})?$", text):
            raise InvalidOperation
        return Decimal(text)
    except InvalidOperation:
        raise OfferInputError(
            FORMAT_ERROR, "Enter the rate as a number with up to 6 decimal places."
        ) from None


def rate_problem(rate: Decimal, foreign: str) -> OfferInputError | None:
    """Positivity first, then the official-rate ceiling (contract §3.3, ADR-020)."""
    if rate <= 0:
        return OfferInputError("VAL_422_RATE_NOT_POSITIVE", "The rate must be more than zero.")
    ceiling = OFFICIAL_RATE.get(foreign)
    if ceiling is None or rate > ceiling or rate > _RATE_MAX:
        limit = f"{ceiling:,.2f}" if ceiling is not None else "not set"
        return OfferInputError(
            "VAL_422_RATE_ABOVE_CEILING",
            f"The rate can’t be above the official rate (NGN {limit} per {foreign}).",
        )
    return None
