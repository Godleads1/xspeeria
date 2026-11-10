# ruff: noqa: F811  -- pytest fixtures are imported by name and used as parameters
"""ADR-107 (owner 2026-11-10): eleven African countries join the corridors.

Zimbabwe pays in US dollars, so a dollar side's escrow follows the payer's verified country
(the US or Zimbabwe). Currencies without cents take whole amounts. Payout accounts are bank
accounts or mobile-money wallets.
"""

from __future__ import annotations

import pytest

from app.core.config import Settings
from tests.integration.test_auth_api import (  # noqa: F401
    Clock,
    Env,
    _runtime,
    _sql,
    clean,
    migrated,
)
from tests.integration.test_escrow_api import (  # noqa: F401
    Escrow,
    _open,
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


async def test_a_zimbabwean_pays_dollars_through_a_zimbabwe_escrow(
    db_settings: Settings, esc: Escrow, owner: Party, taker: Party
) -> None:
    await _verified_in(db_settings, OWNER[0], "ZW")
    r = await owner.publish(source_currency="USD", source_amount="200.00", desired_rate="1300")
    assert r.status_code == 201, r.text
    offer = r.json()
    r = await taker.take(offer["offer_id"], "100.00")
    assert r.status_code == 201, r.text
    deal = {"offer_id": offer["offer_id"], **r.json()}
    ngn = await owner.ngn()
    r = await taker.add_account(
        currency="USD", bank_name="EcoCash", account_number="+263771234567",
        account_type="mobile_money",
    )  # fmt: skip
    assert r.status_code == 201, r.text
    wallet = r.json()["payout_account_id"]
    assert (await owner.choose(deal["match_id"], [(ngn, "130000.00")])).status_code == 200
    r = await taker.choose(deal["match_id"], [(wallet, "100.00")])
    assert r.status_code == 200 and r.json()["preparation_state"] == "funding_ready", r.text
    v = await _open(esc, deal, owner)
    assert v["you_pay"]["pay_in"]["bank_name"] == "Pretend Bank Zimbabwe"


async def test_shillings_without_cents_are_whole_amounts(owner: Party, taker: Party) -> None:
    # A Ugandan shilling is about ₦0.31: rates to 3 decimals, amounts in whole shillings.
    r = await owner.publish(source_currency="UGX", source_amount="500000.50", desired_rate="0.300")
    assert r.status_code == 422, r.text
    # A fourth decimal is refused, never rounded.
    r = await owner.publish(source_currency="UGX", source_amount="500000", desired_rate="0.3055")
    assert r.status_code == 422 and r.json()["error"]["code"] == "VALIDATION_ERROR"
    r = await owner.publish(source_currency="UGX", source_amount="500000", desired_rate="0.305")
    assert r.status_code == 201, r.text
    # The limit is ₦0.306 (0.30690… rounded down): ₦0.306 is allowed, ₦0.307 is refused.
    r = await owner.publish(source_currency="UGX", source_amount="500000", desired_rate="0.306")
    assert r.status_code == 201, r.text
    r = await owner.publish(source_currency="UGX", source_amount="500000", desired_rate="0.307")
    assert r.status_code == 422 and r.json()["error"]["code"] == "VAL_422_RATE_ABOVE_CEILING"
    # A Kenyan bank account and a Ugandan mobile-money wallet.
    r = await taker.add_account(
        currency="KES", bank_name="Equity Bank", account_number="0123456789012",
        account_type="bank", branch_code="068",
    )  # fmt: skip
    assert r.status_code == 201, r.text
    r = await taker.add_account(
        currency="UGX", bank_name="MTN MoMo", account_number="+256772123456",
        account_type="mobile_money",
    )  # fmt: skip
    assert r.status_code == 201, r.text


async def test_paying_dollars_needs_a_us_or_zimbabwe_check(
    db_settings: Settings, strict: Env
) -> None:
    body = await strict.sign_up(phone=OWNER[0], email=OWNER[1])
    p = Party(strict, body["access_token"], OWNER[0])
    await _verified_in(db_settings, OWNER[0], "NG")
    r = await p.publish(source_currency="USD", source_amount="200.00", desired_rate="1300")
    assert r.status_code == 403
    assert "the United States or Zimbabwe" in r.json()["error"]["message"]
    await _verified_in(db_settings, OWNER[0], "ZW")
    r = await p.publish(source_currency="USD", source_amount="200.00", desired_rate="1300")
    assert r.status_code == 201, r.text
