# ruff: noqa: F811  -- pytest fixtures are imported by name and used as parameters
"""ADR-111 (owner 2026-11-11): any currency for any other, not only against naira.

"US citizen can decide to buy ghana currency or any other currencies, but can not buy us
dollars. Same for other countries." Pay with your verified country's currency; the Market
never shows offers selling your own currency; limits are worked out from the official naira
rates ("Work out via official rates").
"""

from __future__ import annotations

from typing import Any

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.db.session import build_engine
from app.domain.offer_rules import FED_SNAPSHOT, cross_ceilings
from app.services.reconciliation import ReconciliationService
from tests.integration.test_auth_api import (  # noqa: F401
    Env,
    _sql,
    clean,
    migrated,
)
from tests.integration.test_escrow_api import (  # noqa: F401
    Escrow,
    _open,
    _pay,
    _phase,
    esc,
    owner,
    partners,
    taker,
)
from tests.integration.test_matches_api import OWNER
from tests.integration.test_new_corridors import _verified_in, strict  # noqa: F401
from tests.integration.test_offers_api import currencies  # noqa: F401  (autouse: CD3 rows)
from tests.integration.test_payouts_api import Party

pytestmark = [pytest.mark.integration, pytest.mark.asyncio]

USD_GHS = cross_ceilings(FED_SNAPSHOT)["USD/GHS"]  # 11.604 cedis per US dollar


async def _ghs(p: Party) -> str:
    r = await p.add_account(
        currency="GHS", bank_name="GCB Bank", account_number="1234567890123",
        account_type="bank", branch_code="040",
    )  # fmt: skip
    assert r.status_code == 201, r.text
    return str(r.json()["payout_account_id"])


async def _listed(p: Party, pair: str, country: str) -> dict[str, Any]:
    r = await p.env.client.get(
        "/api/v1/marketplace/listings",
        params={"filter[currency_pair]": pair},
        headers=p._h() | {"X-Device-Country": country},
    )
    assert r.status_code == 200, r.text
    body: dict[str, Any] = r.json()
    return body


async def test_dollars_for_cedis_with_a_limit_worked_out_from_naira_rates(
    owner: Party, taker: Party
) -> None:
    assert str(USD_GHS) == "11.604"  # ₦1,333.26 ÷ (₦1,333.26 ÷ 11.6046), cut to 3 decimals
    r = await owner.publish(
        source_currency="USD", target_currency="GHS", source_amount="200.00",
        desired_rate="11.605",
    )  # fmt: skip
    assert r.status_code == 422, r.text
    assert r.json()["error"]["code"] == "VAL_422_RATE_ABOVE_CEILING"
    assert "GHS 11.604 per USD" in r.json()["error"]["message"]
    r = await owner.publish(
        source_currency="USD", target_currency="GHS", source_amount="200.00",
        desired_rate="11.604",
    )  # fmt: skip
    assert r.status_code == 201, r.text
    offer = r.json()
    # A person in Ghana sees it; a person in the US (selling dollars is their own) doesn't.
    gh = await _listed(taker, "USD/GHS", "GH")
    assert [o["offer_id"] for o in gh["items"]] == [offer["offer_id"]]
    us = await _listed(taker, "USD/GHS", "US")
    assert (us["hidden"], us["items"]) == (True, [])


async def test_the_rates_list_has_the_pairs_without_naira(owner: Party) -> None:
    r = await owner.env.client.get("/api/v1/rates/official", headers=owner._h())
    body = r.json()
    pairs = {(p["base"], p["quote"]): p["max_rate"] for p in body["pairs"]}
    assert pairs[("USD", "GHS")] == "11.604"
    assert pairs[("EUR", "USD")] == "1.118"
    # The naira list is unchanged; the yuan stays hidden while China is off (ADR-105).
    assert "USD" in {i["currency"] for i in body["items"]}
    assert not any("CNY" in pair for pair in pairs)


async def test_a_dollar_for_cedi_deal_settles_in_both_countries(
    db_settings: Settings, esc: Escrow, owner: Party, taker: Party
) -> None:
    """The owner sells 200 USD for cedis at 11.5; the taker pays cedis for 100 USD."""
    r = await owner.publish(
        source_currency="USD", target_currency="GHS", source_amount="200.00",
        desired_rate="11.5",
    )  # fmt: skip
    offer = r.json()
    r = await taker.take(offer["offer_id"], "100.00")
    assert r.status_code == 201, r.text
    deal = {"offer_id": offer["offer_id"], **r.json()}
    assert (deal["currency"], deal["counter_currency"]) == ("USD", "GHS")
    assert (deal["allocated_amount"], deal["counter_amount"]) == ("100.00", "1150.00")
    ghs, usd = await _ghs(owner), await taker.usd()
    r = await owner.choose(deal["match_id"], [(ghs, "1150.00")])
    assert r.status_code == 200 and r.json()["you_receive_amount"] == "1150.00", r.text
    r = await taker.choose(deal["match_id"], [(usd, "100.00")])
    assert r.status_code == 200 and r.json()["preparation_state"] == "funding_ready", r.text
    v = await _open(esc, deal, owner)
    assert (v["you_pay"]["currency"], v["you_pay"]["total"]) == ("USD", "101.00")
    legs = await _sql(
        db_settings,
        "SELECT string_agg(currency || ':' || amount_minor || '+' || fee_minor || '@' "
        "|| source_jurisdiction, ',' ORDER BY currency) FROM settlement_legs",
    )
    assert legs == "GHS:115000+1150@GH,USD:10000+100@US"
    assert (await _pay(owner, deal["match_id"])).status_code == 200
    assert (await _pay(taker, deal["match_id"])).status_code == 200
    await esc.tick(3)
    assert await _phase(db_settings) == "COMPLETED"
    paid = await _sql(
        db_settings,
        "SELECT string_agg(currency || ':' || amount_minor, ',' ORDER BY currency) "
        "FROM payout_executions",
    )
    assert paid == "GHS:115000,USD:10000"
    # The daily money check agrees.
    engine = build_engine(db_settings)
    try:
        async with AsyncSession(engine, expire_on_commit=False) as db:
            assert await ReconciliationService(db, esc.env.clock).run() == (1, 0)
    finally:
        await engine.dispose()


async def test_cedis_for_dollars_is_quoted_the_same_way(owner: Party, taker: Party) -> None:
    """Selling cedis for dollars: the rate is still cedis per 1 dollar (ADR-111)."""
    r = await owner.publish(
        source_currency="GHS", target_currency="USD", source_amount="1150.00",
        desired_rate="11.5",
    )  # fmt: skip
    assert r.status_code == 201, r.text
    offer = r.json()
    us = await _listed(taker, "GHS/USD", "US")
    assert [o["offer_id"] for o in us["items"]] == [offer["offer_id"]]
    r = await taker.take(offer["offer_id"], "1150.00")
    assert r.status_code == 201, r.text
    assert (r.json()["currency"], r.json()["counter_amount"]) == ("GHS", "100.00")


async def test_paying_cedis_needs_a_ghana_check_and_dollars_a_us_one(
    db_settings: Settings, strict: Env
) -> None:
    body = await strict.sign_up(phone=OWNER[0], email=OWNER[1])
    p = Party(strict, body["access_token"], OWNER[0])
    await _verified_in(db_settings, OWNER[0], "US")
    # Verified in the US: pays dollars for cedis, never cedis for dollars.
    r = await p.publish(
        source_currency="USD", target_currency="GHS", source_amount="200.00",
        desired_rate="11.5",
    )  # fmt: skip
    assert r.status_code == 201, r.text
    r = await p.publish(
        source_currency="GHS", target_currency="USD", source_amount="1150.00",
        desired_rate="11.5",
    )  # fmt: skip
    assert r.status_code == 403 and "Ghana" in r.json()["error"]["message"]
