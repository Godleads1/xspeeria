"""ADR-102: reading the CBN rate from Frankfurter — exact decimals, refuse anything odd."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import httpx
import pytest

from app.providers.frankfurter import FrankfurterCBN, RateFeedError, parse_quote

TODAY = date(2026, 11, 9)


asyncio_mark = pytest.mark.asyncio


def test_reads_the_rate_exactly() -> None:
    q = parse_quote('{"date":"2026-11-07","base":"USD","quote":"NGN","rate":1347.29}', "USD", TODAY)
    assert (q.currency, q.rate, q.rate_date) == ("USD", Decimal("1347.29"), date(2026, 11, 7))
    assert isinstance(q.rate, Decimal)  # never a float
    q = parse_quote('{"date":"2026-11-09","base":"GBP","quote":"NGN","rate":1802.96}', "GBP", TODAY)
    assert q.rate == Decimal("1802.96")


@pytest.mark.parametrize(
    "body",
    [
        '{"date":"2026-11-07","base":"EUR","quote":"NGN","rate":1503.5}',  # wrong currency
        '{"date":"2026-11-07","base":"USD","quote":"GHS","rate":1347.29}',  # wrong quote
        '{"date":"2026-11-07","base":"USD","quote":"NGN","rate":0}',
        '{"date":"2026-11-07","base":"USD","quote":"NGN","rate":-1}',
        '{"date":"2026-11-07","base":"USD","quote":"NGN","rate":1347.1234567}',  # 7 decimals
        '{"date":"2026-11-07","base":"USD","quote":"NGN","rate":1000000}',  # too large
        '{"date":"2026-11-10","base":"USD","quote":"NGN","rate":1347.29}',  # future date
        '{"date":"yesterday","base":"USD","quote":"NGN","rate":1347.29}',
        '{"date":"2026-11-07","base":"USD","quote":"NGN","rate":"abc"}',
        '{"base":"USD","quote":"NGN","rate":1347.29}',  # no date
        "not json",
        "[]",
    ],
)
def test_refuses_anything_unexpected(body: str) -> None:
    with pytest.raises(RateFeedError):
        parse_quote(body, "USD", TODAY)


@asyncio_mark
async def test_fetch_asks_for_the_cbn_rate_of_that_currency() -> None:
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(str(request.url))
        return httpx.Response(
            200, text='{"date":"2026-11-07","base":"EUR","quote":"NGN","rate":1503.54}'
        )

    q = await FrankfurterCBN(transport=httpx.MockTransport(handler)).fetch("EUR", TODAY)
    assert seen == ["https://api.frankfurter.dev/v2/providers/cbn/rate/EUR/NGN"]
    assert q.rate == Decimal("1503.54")


@asyncio_mark
@pytest.mark.parametrize("status", [404, 429, 500])
async def test_fetch_refuses_a_failed_answer(status: int) -> None:
    feed = FrankfurterCBN(transport=httpx.MockTransport(lambda _r: httpx.Response(status)))
    with pytest.raises(RateFeedError):
        await feed.fetch("USD", TODAY)


@asyncio_mark
async def test_fetch_survives_the_network_failing() -> None:
    def boom(_r: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("down")

    with pytest.raises(RateFeedError):
        await FrankfurterCBN(transport=httpx.MockTransport(boom)).fetch("USD", TODAY)
