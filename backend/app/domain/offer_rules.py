"""Offer rules as pure functions (ADR-020, ADR-029). No I/O, no clock.

A rate is the price of 1 unit of the pair's **base** currency in its **quote** currency,
whichever side the offer sells (ADR-111):

* a pair with naira: the quote is always NGN, so the rate is naira per 1 unit of the other
  currency, as before (₦1,333.26 per USD);
* a pair without naira (owner 2026-11-11, "any currency for any other"): the quote is the
  weaker currency in ``STRENGTH`` order, so the rate is e.g. GHS per 1 USD (11.488).
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import timedelta
from decimal import ROUND_DOWN, ROUND_HALF_EVEN, Decimal, InvalidOperation
from typing import Protocol

__all__ = [
    "CURRENCY_DEF_VERSION",
    "FORMAT_ERROR",
    "FOREIGN",
    "IDEMPOTENCY_TTL",
    "MARKET_REQUESTS_PER_MINUTE",
    "MINIMUM_MINOR",
    "OFFICIAL_RATE",
    "XOF_PER_EUR",
    "OFFICIAL_RATE_AS_OF",
    "with_derived",
    "CAD_PER_USD",
    "CAD_PER_USD_AS_OF",
    "AFRICAN",
    "AFRICA_PER_USD",
    "AFRICA_PER_USD_AS_OF",
    "CNY_PER_USD",
    "CNY_PER_USD_AS_OF",
    "RATE_PLACES",
    "STORED_RATE_PLACES",
    "SCALE",
    "OfferInputError",
    "Pair",
    "STRENGTH",
    "ceiling_key",
    "offer_pair",
    "cross_ceilings",
    "naira_values",
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
SCALE: dict[str, int] = {
    "NGN": 2,
    "USD": 2,
    "GBP": 2,
    "EUR": 2,
    "CAD": 2,
    "CNY": 2,
    # ADR-107 (owner 2026-11-10): ISO 4217 minor units. The CFA franc and the Ugandan shilling
    # have none, so their amounts are whole numbers.
    "EGP": 2,
    "ZAR": 2,
    "MAD": 2,
    "ETB": 2,
    "KES": 2,
    "XOF": 0,
    "GHS": 2,
    "UGX": 0,
    "ZMW": 2,
    "TZS": 2,
}
#: CAD: Canada joins the MVP corridors (ADR-100); its ceiling is derived from the USD one (ADR-101).
#: CNY: China joins the corridors behind a switch (ADR-105, ``CHINA_ENABLED``, off until legal
#: clearance); its ceiling is derived from the USD one too.
#: ADR-107: ten African currencies (Zimbabwe pays in US dollars, so it adds none).
AFRICAN = frozenset({"EGP", "ZAR", "MAD", "ETB", "KES", "XOF", "GHS", "UGX", "ZMW", "TZS"})
FOREIGN = frozenset({"USD", "GBP", "EUR", "CAD", "CNY"}) | AFRICAN

#: ADR-020 — CBN official rate snapshot, 17 Oct 2026: the maximum allowed rate. ADR-102: used
#: until the automatic feed has stored its first rate (``services.official_rates``).
OFFICIAL_RATE: dict[str, Decimal] = {
    "USD": Decimal("1333.26"),
    "GBP": Decimal("1765.11"),
    "EUR": Decimal("1491.20"),
}
OFFICIAL_RATE_AS_OF = "2026-10-17"
#: The fed currencies of the snapshot, before anything is derived (for cross limits).
FED_SNAPSHOT: dict[str, Decimal] = dict(OFFICIAL_RATE)

#: ADR-101 (owner, 2026-11-09): the CBN publishes no CAD figure we can rely on, so the CAD
#: ceiling = the USD ceiling ÷ Bank of Canada's daily USD/CAD rate (CAD per 1 USD), rounded
#: half to even to the kobo. Refreshing the USD ceiling or this rate changes CAD with it.
CAD_PER_USD = Decimal("1.4113")
CAD_PER_USD_AS_OF = "2026-11-06"
#: ADR-105 (owner, 2026-11-10: "Work out from USD"): the CNY ceiling = the USD ceiling ÷ the
#: People's Bank of China USD/CNY central parity (CNY per 1 USD), rounded half to even.
#: 6.7167 was the 10 Nov 2026 fixing as reported by FXStreet; check it against PBOC/CFETS
#: before China is switched on.
CNY_PER_USD = Decimal("6.7167")
CNY_PER_USD_AS_OF = "2026-11-10"
#: ADR-107 (owner 2026-11-10): each African currency's ceiling = the USD ceiling ÷ its units
#: per 1 USD, cut to 3 decimals (owner 2026-11-10: "3 decimal not 6"; round down, so a ceiling
#: never exceeds the official rate). Source: the Kenya Revenue
#: Authority's official exchange rates for 2–8 November 2026 (KES 129.95 per USD), crossed
#: through the US dollar; ZMW from Frankfurter's blended central-bank rate (not on the KRA
#: list). Check each against its central bank before the live server switches it on.
AFRICA_PER_USD: dict[str, Decimal] = {
    "KES": Decimal("129.9500"),
    "EGP": Decimal("55.3214"),
    "ZAR": Decimal("16.6603"),
    "MAD": Decimal("9.8097"),
    "ETB": Decimal("163.4180"),
    "GHS": Decimal("11.6046"),
    "UGX": Decimal("4344.2285"),
    "TZS": Decimal("2640.5840"),
    "ZMW": Decimal("20.3320"),
}
AFRICA_PER_USD_AS_OF = "2026-11-02"
#: The CFA franc (BCEAO) is fixed to the euro: 655.957 XOF per 1 EUR, so its ceiling comes
#: from the EUR one.
XOF_PER_EUR = Decimal("655.957")
_THREE = Decimal("0.001")


def with_derived(fed: dict[str, Decimal]) -> dict[str, Decimal]:
    """Add the ceilings worked out from others: CAD (ADR-101) and CNY (ADR-105) from USD, the
    African currencies from USD and XOF from EUR (ADR-107). No base ceiling, none derived."""
    out = dict(fed)
    usd, eur = out.get("USD"), out.get("EUR")
    for currency, per_usd in (("CAD", CAD_PER_USD), ("CNY", CNY_PER_USD)):
        if usd is not None:
            out[currency] = (usd / per_usd).quantize(Decimal("0.01"), rounding=ROUND_HALF_EVEN)
        else:
            out.pop(currency, None)
    for currency, per_usd in AFRICA_PER_USD.items():
        if usd is not None:
            out[currency] = (usd / per_usd).quantize(_THREE, rounding=ROUND_DOWN)
        else:
            out.pop(currency, None)
    if eur is not None:
        out["XOF"] = (eur / XOF_PER_EUR).quantize(_THREE, rounding=ROUND_DOWN)
    else:
        out.pop("XOF", None)
    return out


OFFICIAL_RATE.update(with_derived(OFFICIAL_RATE))

#: ADR-029 — ₦10,000 or 10 units of the foreign currency.
MINIMUM_MINOR: dict[str, int] = {
    "NGN": 1_000_000,
    "USD": 1_000,
    "GBP": 1_000,
    "EUR": 1_000,
    "CAD": 1_000,
    "CNY": 1_000,
    # ADR-107: 10 units too (whole units where there are no cents).
    **{c: 10 * 10**s for c, s in SCALE.items() if c in AFRICAN},
}

#: ADR-031 — offer and marketplace requests per signed-in user per minute (product owner,
#: 2026-10-18: "60 per user per min"). Separate from the sign-in limit.
MARKET_REQUESTS_PER_MINUTE = 60

#: ADR-029 — remember each Idempotency-Key for 24 hours.
IDEMPOTENCY_TTL = timedelta(hours=24)

#: A rate has at most 3 decimal places (owner 2026-11-10: "3 decimal not 6", server and app).
#: Storage stays NUMERIC(12,6): 6 integer digits, and older stored rates are kept exactly.
RATE_PLACES = 3
STORED_RATE_PLACES = 6
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


#: ADR-111: which way round a pair without naira is quoted — the earlier currency is the base,
#: the later one the quote, so most rates are 1 or more (11.488 GHS per USD, 1.118 USD per
#: EUR). Fixed, not from today's rates, so a pair is always quoted the same way. Roughly by
#: naira value on 2026-11-10.
STRENGTH: tuple[str, ...] = (
    "GBP", "EUR", "USD", "CAD", "CNY", "MAD", "GHS", "ZAR", "ZMW",
    "EGP", "KES", "ETB", "XOF", "TZS", "UGX",
)  # fmt: skip
CURRENCIES = FOREIGN | {"NGN"}


@dataclass(frozen=True)
class Pair:
    source: str
    target: str

    @property
    def base(self) -> str:
        """The currency the rate is "per 1 unit" of."""
        if "NGN" in (self.source, self.target):
            return self.target if self.source == "NGN" else self.source
        return min(self.source, self.target, key=STRENGTH.index)

    @property
    def quote(self) -> str:
        """The currency the rate is counted in: NGN when present, else the weaker one."""
        return self.target if self.base == self.source else self.source

    @property
    def foreign(self) -> str:
        """The base currency (the name from when every pair had naira)."""
        return self.base

    @property
    def sells_quote(self) -> bool:
        """The offer sells the quote currency (a naira request: sells NGN for USD)."""
        return self.source == self.quote


def parse_pair(source: str, target: str) -> Pair:
    """Any two different supported currencies, in either direction (ADR-111)."""
    s, t = source.upper(), target.upper()
    if s == t or s not in CURRENCIES or t not in CURRENCIES:
        raise OfferInputError(
            FORMAT_ERROR, "Choose two different currencies that Xspeeria exchanges."
        )
    return Pair(s, t)


class _HasPair(Protocol):
    source_currency: str
    target_currency: str


def offer_pair(offer: _HasPair) -> Pair:
    """The pair of a stored offer (anything with ``source_currency`` and ``target_currency``)."""
    return Pair(offer.source_currency, offer.target_currency)


def ceiling_key(pair: Pair) -> str:
    """The key of a pair's limit in a ceilings map: "USD" (naira per USD) or "USD/GHS"."""
    return pair.base if pair.quote == "NGN" else f"{pair.base}/{pair.quote}"


def naira_values(fed: Mapping[str, Decimal]) -> dict[str, Decimal]:
    """Naira per 1 unit of each currency, **unrounded**, from the fed USD/GBP/EUR rates and
    the same reference rates ``with_derived`` uses. Only for working out cross limits."""
    out = {c: v for c, v in fed.items() if c in ("USD", "GBP", "EUR")}
    usd, eur = out.get("USD"), out.get("EUR")
    if usd is not None:
        out["CAD"] = usd / CAD_PER_USD
        out["CNY"] = usd / CNY_PER_USD
        for currency, per_usd in AFRICA_PER_USD.items():
            out[currency] = usd / per_usd
    if eur is not None:
        out["XOF"] = eur / XOF_PER_EUR
    return out


def cross_ceilings(fed: Mapping[str, Decimal]) -> dict[str, Decimal]:
    """ADR-111 (owner: "Work out via official rates"): the limit for each pair without naira
    = naira value of the base ÷ naira value of the quote, from unrounded values, cut down to
    3 decimals, so it never exceeds the official cross rate. Keyed "BASE/QUOTE"."""
    values = naira_values(fed)
    out: dict[str, Decimal] = {}
    for i, base in enumerate(STRENGTH):
        for quote in STRENGTH[i + 1 :]:
            if base in values and quote in values:
                limit = (values[base] / values[quote]).quantize(_THREE, rounding=ROUND_DOWN)
                if limit > 0:
                    out[f"{base}/{quote}"] = limit
    return out


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


def parse_rate(text: str, places: int = RATE_PLACES) -> Decimal:
    """Decimal text, up to 3 places (refused, never rounded). Sign and size are judged by
    :func:`rate_problem`. ``places=STORED_RATE_PLACES`` reads back a rate the server showed,
    which may be an older one with more decimals (confirming a take)."""
    try:
        if not re.fullmatch(rf"^-?[0-9]{{1,7}}(\.[0-9]{{1,{places}}})?$", text):
            raise InvalidOperation
        return Decimal(text)
    except InvalidOperation:
        raise OfferInputError(
            FORMAT_ERROR, f"Enter the rate as a number with up to {RATE_PLACES} decimal places."
        ) from None


def _shown(v: Decimal) -> str:
    """Grouped, at least 2 decimals, never rounded (2.273 stays 2.273, not 2.27)."""
    return f"{v:,.2f}" if v == v.quantize(Decimal("0.01")) else f"{v.normalize():,f}"


def rate_problem(
    rate: Decimal, key: str, ceilings: Mapping[str, Decimal] | None = None
) -> OfferInputError | None:
    """Positivity first, then the official-rate ceiling (contract §3.3, ADR-020, ADR-102).

    ``key`` is :func:`ceiling_key` ("USD" or "USD/GHS"). ``ceilings`` comes from
    ``services.official_rates.current_ceilings``; None = the snapshot.
    """
    if rate <= 0:
        return OfferInputError("VAL_422_RATE_NOT_POSITIVE", "The rate must be more than zero.")
    if ceilings is None:
        ceilings = {**OFFICIAL_RATE, **cross_ceilings(FED_SNAPSHOT)}
    ceiling = ceilings.get(key)
    if ceiling is None or rate > ceiling or rate > _RATE_MAX:
        limit = _shown(ceiling) if ceiling is not None else "not set"
        base, _, quote = key.partition("/")
        return OfferInputError(
            "VAL_422_RATE_ABOVE_CEILING",
            f"The rate can’t be above the official rate ({quote or 'NGN'} {limit} per {base}).",
        )
    return None
