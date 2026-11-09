"""CBN official rates through the Frankfurter API — ADR-102 (owner 2026-11-09: "Frankfurter").

The Central Bank of Nigeria publishes its daily rates as JSON; Frankfurter (free, no key)
reads them and serves each currency's **central rate** (the middle of the CBN's buying and
selling figures) unchanged, with the CBN's own date. One request per currency:

    GET https://api.frankfurter.dev/v2/providers/cbn/rate/USD/NGN
    -> {"date": "YYYY-MM-DD", "base": "USD", "quote": "NGN", "rate": <naira per 1 USD>}

(Shape read from Frankfurter's source, ``lib/versions/v2.rb`` and the CBN adapter
``lib/provider/adapters/cbn.rb``, commit 677d7d5, 9 Nov 2026.) The number is parsed as an exact
decimal, never a float. Anything unexpected is refused: a wrong currency, a missing or
non-positive rate, more than 6 decimal places or 6 integer digits, or a date in the future.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, InvalidOperation

import httpx

from app.core.api_metrics import tracked_transport

__all__ = ["FrankfurterCBN", "RateFeedError", "RateQuote", "parse_quote"]

SOURCE = "frankfurter-cbn"
_MONITOR_NAME = "Frankfurter (CBN rates)"
_TIMEOUT = httpx.Timeout(10.0)
_MAX = Decimal("999999.999999")  # NUMERIC(12,6)


class RateFeedError(Exception):
    """The rate could not be fetched or was not understood. Nothing is stored."""


@dataclass(frozen=True)
class RateQuote:
    currency: str
    rate: Decimal  # naira per 1 unit of ``currency``
    rate_date: date


def parse_quote(body: str, currency: str, today: date) -> RateQuote:
    try:
        data = json.loads(body, parse_float=Decimal, parse_int=Decimal)
        base, quote, raw, day = data["base"], data["quote"], data["rate"], data["date"]
    except (ValueError, KeyError, TypeError):
        raise RateFeedError("rate response not understood") from None
    if base != currency or quote != "NGN":
        raise RateFeedError(f"rate response for {base}/{quote}, expected {currency}/NGN")
    try:
        rate = Decimal(raw) if not isinstance(raw, Decimal) else raw
        rate_date = date.fromisoformat(str(day))
    except (InvalidOperation, ValueError, TypeError):
        raise RateFeedError("rate response not understood") from None
    exponent = rate.as_tuple().exponent
    if (
        not rate.is_finite()
        or rate <= 0
        or rate > _MAX
        or (isinstance(exponent, int) and exponent < -6)
    ):
        raise RateFeedError("rate out of range")
    if rate_date > today:
        raise RateFeedError("rate dated in the future")
    return RateQuote(currency, rate, rate_date)


class FrankfurterCBN:
    name = SOURCE

    def __init__(
        self,
        base_url: str = "https://api.frankfurter.dev",
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._base = base_url.rstrip("/")
        self._transport = transport

    async def fetch(self, currency: str, today: date) -> RateQuote:
        url = f"{self._base}/v2/providers/cbn/rate/{currency}/NGN"
        try:
            async with httpx.AsyncClient(
                timeout=_TIMEOUT, transport=tracked_transport(_MONITOR_NAME, self._transport)
            ) as c:
                r = await c.get(url, headers={"Accept": "application/json"})
        except httpx.HTTPError as exc:
            raise RateFeedError(f"rate feed unreachable: {type(exc).__name__}") from None
        if r.status_code != 200:
            raise RateFeedError(f"rate feed refused: HTTP {r.status_code}")
        return parse_quote(r.text, currency, today)
