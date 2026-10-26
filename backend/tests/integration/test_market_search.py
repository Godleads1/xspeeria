# ruff: noqa: F811  -- pytest fixtures are imported by name and used as parameters
"""ADR-059 Decision 1: searching the marketplace (sort, rate and amount filters, Success)."""

from __future__ import annotations

import json
from typing import Any

import pytest

from app.core.config import Settings
from tests.integration.test_auth_api import _sql, clean, migrated  # noqa: F401
from tests.integration.test_escrow_api import (  # noqa: F401
    Escrow,
    _open,
    _pay,
    deal,
    esc,
    owner,
    partners,
    taker,
)
from tests.integration.test_offers_api import (  # noqa: F401
    User,
    ada,
    currencies,
    david,
    env,
)
from tests.integration.test_payouts_api import Party

pytestmark = [pytest.mark.integration, pytest.mark.asyncio]


def _rates(r: Any) -> list[str]:
    assert r.status_code == 200, r.text
    return [o["desired_rate"] for o in r.json()["items"]]


async def _three(u: User) -> None:
    """Published in this order: 1320 for 800, 1310 for 200, 1330 for 500."""
    await u.publish(desired_rate="1320", source_amount="800.00")
    await u.publish(desired_rate="1310", source_amount="200.00")
    await u.publish(desired_rate="1330", source_amount="500.00")


# --- sort ----------------------------------------------------------------------------------


async def test_default_order_is_unchanged(david: User, ada: User) -> None:
    await _three(david)
    r = await ada.listings()
    assert _rates(r) == ["1310.00", "1320.00", "1330.00"]
    assert r.json()["status"] == "available" and r.json()["trades"] == []


@pytest.mark.parametrize(
    ("sort", "expected"),
    [
        ("best_rate", ["1310.00", "1320.00", "1330.00"]),
        ("newest", ["1330.00", "1310.00", "1320.00"]),
        ("oldest", ["1320.00", "1310.00", "1330.00"]),
        ("largest", ["1320.00", "1330.00", "1310.00"]),
        ("smallest", ["1310.00", "1330.00", "1320.00"]),
    ],
)
async def test_every_sort(env: Any, david: User, ada: User, sort: str, expected: list[str]) -> None:
    await david.publish(desired_rate="1320", source_amount="800.00")
    env.clock.advance(seconds=5)
    await david.publish(desired_rate="1310", source_amount="200.00")
    env.clock.advance(seconds=5)
    await david.publish(desired_rate="1330", source_amount="500.00")
    assert _rates(await ada.listings(sort=sort)) == expected


async def test_buy_requests_sort_by_their_foreign_size(david: User, ada: User) -> None:
    # Naira held / rate: 1,330,000 / 1330 = 1,000 USD; 660,000 / 1320 = 500 USD.
    for naira, rate in (("660000.00", "1320"), ("1330000.00", "1330")):
        await david.publish(
            source_currency="NGN", target_currency="USD", source_amount=naira, desired_rate=rate
        )
    assert _rates(await ada.listings("NGN/USD", sort="largest")) == ["1330.00", "1320.00"]
    assert _rates(await ada.listings("NGN/USD", sort="smallest")) == ["1320.00", "1330.00"]


# --- filters -------------------------------------------------------------------------------


async def test_rate_range_is_inclusive(david: User, ada: User) -> None:
    await _three(david)
    params = {"filter[min_rate]": "1315", "filter[max_rate]": "1330.00"}
    assert _rates(await ada.listings(**params)) == ["1320.00", "1330.00"]
    assert _rates(await ada.listings(**{"filter[max_rate]": "1310"})) == ["1310.00"]


async def test_amount_range_uses_what_is_left(david: User, ada: User) -> None:
    await _three(david)
    params = {"filter[min_amount]": "500", "filter[max_amount]": "800.00"}
    assert _rates(await ada.listings(**params)) == ["1320.00", "1330.00"]


async def test_amount_range_on_buy_requests_is_in_the_foreign_currency(
    david: User, ada: User
) -> None:
    # 1,330,000 NGN at 1330 = exactly 1,000.00 USD; 660,000 at 1320 = 500.00 USD.
    for naira, rate in (("660000.00", "1320"), ("1330000.00", "1330")):
        await david.publish(
            source_currency="NGN", target_currency="USD", source_amount=naira, desired_rate=rate
        )
    at_least = await ada.listings("NGN/USD", **{"filter[min_amount]": "1000.00"})
    assert _rates(at_least) == ["1330.00"]
    at_most = await ada.listings("NGN/USD", **{"filter[max_amount]": "999.99"})
    assert _rates(at_most) == ["1320.00"]


async def test_filters_and_sort_combine(david: User, ada: User) -> None:
    await _three(david)
    r = await ada.listings(sort="largest", **{"filter[min_rate]": "1315"})
    assert _rates(r) == ["1320.00", "1330.00"]


@pytest.mark.parametrize(
    "params",
    [
        {"sort": "cheapest"},
        {"sort": "best_rate; DROP TABLE offers"},
        {"filter[status]": "pending"},
        {"filter[min_rate]": "abc"},
        {"filter[min_rate]": "-5"},
        {"filter[min_rate]": "0"},
        {"filter[min_rate]": "1e3"},
        {"filter[min_rate]": "1300.1234567"},
        {"filter[min_amount]": "10.001"},
        {"filter[min_amount]": "0"},
        {"filter[min_amount]": "NaN"},
        {"filter[min_rate]": "1340", "filter[max_rate]": "1300"},
        {"filter[min_amount]": "900", "filter[max_amount]": "100"},
        {"filter[max_amount]": "1" * 30},
    ],
)
async def test_bad_search_is_refused(david: User, params: dict[str, str]) -> None:
    r = await david.listings(**params)
    assert r.status_code == 422, r.text
    assert "Traceback" not in r.text


async def test_search_needs_sign_in(env: Any) -> None:
    r = await env.client.get(
        "/api/v1/marketplace/listings",
        params={"filter[currency_pair]": "USD/NGN", "sort": "newest"},
    )
    assert r.status_code == 401


async def test_filters_never_show_hidden_offers(
    db_settings: Settings, david: User, ada: User
) -> None:
    gone = (await david.publish(desired_rate="1320")).json()
    await david.delete(gone["offer_id"])
    above = (await david.publish(desired_rate="1325")).json()
    await _sql(
        db_settings, "UPDATE offers SET desired_rate = 1400 WHERE id = :i", i=above["offer_id"]
    )
    wide = {"filter[min_rate]": "1", "filter[max_rate]": "999999", "filter[min_amount]": "0.01"}
    for sort in ("best_rate", "newest", "largest"):
        assert _rates(await ada.listings(sort=sort, **wide)) == []


# --- Success (recent completed trades) -----------------------------------------------------


async def test_success_lists_completed_trades_without_names(
    db_settings: Settings, esc: Escrow, owner: Party, taker: Party, deal: dict[str, Any]
) -> None:
    assert (await taker.listings(**{"filter[status]": "success"})).json()["trades"] == []
    await _open(esc, deal, owner)
    await _pay(owner, deal["match_id"])
    await _pay(taker, deal["match_id"])
    r = await taker.listings(**{"filter[status]": "success"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "success" and body["items"] == []
    [trade] = body["trades"]
    assert (trade["currency"], trade["amount"], trade["rate"]) == ("USD", "200.00", "1320.50")
    assert trade["completed_at"]
    assert set(trade) == {"currency", "amount", "rate", "completed_at"}
    text = json.dumps(body)
    for secret in (deal["match_id"], deal["offer_id"], owner.phone, taker.phone):
        assert secret not in text
    # Filters apply to trades too.
    none = await taker.listings(**{"filter[status]": "success", "filter[min_rate]": "1321"})
    assert none.json()["trades"] == []
    # The other direction (buy requests) has no trades.
    other = await taker.listings("NGN/USD", **{"filter[status]": "success"})
    assert other.json()["trades"] == []


async def test_unfinished_deals_are_not_success(
    esc: Escrow, owner: Party, taker: Party, deal: dict[str, Any]
) -> None:
    await _open(esc, deal, owner)
    await _pay(owner, deal["match_id"])
    r = await taker.listings(**{"filter[status]": "success"})
    assert r.json()["trades"] == []


async def test_old_trades_drop_off_the_success_list(
    db_settings: Settings, esc: Escrow, owner: Party, taker: Party, deal: dict[str, Any]
) -> None:
    await _open(esc, deal, owner)
    await _pay(owner, deal["match_id"])
    await _pay(taker, deal["match_id"])
    await _sql(db_settings, "UPDATE settlements SET updated_at = updated_at - interval '8 days'")
    r = await taker.listings(**{"filter[status]": "success"})
    assert r.json()["trades"] == []
