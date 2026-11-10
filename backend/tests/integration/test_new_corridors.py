# ruff: noqa: F811  -- pytest fixtures are imported by name and used as parameters
"""ADR-105 (owner 2026-11-10): Germany, France and China join the corridors.

* A euro leg goes to the escrow bank of the euro country its payer is verified in
  ("User's verified country").
* China is built but switched off (``CHINA_ENABLED``) until legal clearance: every way in is
  refused and the yuan ceiling is hidden.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from decimal import Decimal
from typing import Any

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.core.config import Settings
from app.domain.offer_rules import CNY_PER_USD, OFFICIAL_RATE
from app.main import create_app
from app.providers.sms import RecordingSmsSender
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
    _make,
    _open,
    _view,
    esc,
    owner,
    partners,
    taker,
)
from tests.integration.test_matches_api import OWNER
from tests.integration.test_offers_api import currencies  # noqa: F401  (autouse: CD3 rows)
from tests.integration.test_payouts_api import Party

pytestmark = [pytest.mark.integration, pytest.mark.asyncio]

DE_IBAN = "DE89370400440532013000"
FR_IBAN = "FR1420041010050500013M02606"


async def _verified_in(db_settings: Settings, phone: str, country: str) -> None:
    await _sql(
        db_settings,
        "INSERT INTO kyc_cases (id, user_id, provider, country, provider_session_id, "
        "provider_status, status, legal_name, date_of_birth, decided_at, created_at, updated_at) "
        "SELECT gen_random_uuid(), id, 'didit', :c, :sid, 'Approved', 'approved', "
        "'Ada Obi', DATE '1990-01-01', now(), now(), now() FROM users WHERE phone = :p",
        p=phone,
        c=country,
        sid=f"kyc-{country}",
    )


async def _eur(p: Party, iban: str) -> str:
    r = await p.add_account(currency="EUR", bank_name="Euro Bank", account_number=iban)
    assert r.status_code == 201, r.text
    return str(r.json()["payout_account_id"])


async def _euro_deal(owner: Party, taker: Party, iban: str) -> dict[str, Any]:
    """Owner sells 200 EUR at 1,400; taker takes 100 → owner receives NGN 140,000.00."""
    r = await owner.publish(source_currency="EUR", source_amount="200.00", desired_rate="1400")
    assert r.status_code == 201, r.text
    offer = r.json()
    r = await taker.take(offer["offer_id"], "100.00")
    assert r.status_code == 201, r.text
    deal = {"offer_id": offer["offer_id"], **r.json()}
    ngn, eur = await owner.ngn(), await _eur(taker, iban)
    assert (await owner.choose(deal["match_id"], [(ngn, "140000.00")])).status_code == 200
    r = await taker.choose(deal["match_id"], [(eur, "100.00")])
    assert r.status_code == 200 and r.json()["preparation_state"] == "funding_ready", r.text
    return deal


@pytest.mark.parametrize(("country", "bank"), [("DE", "Germany"), ("FR", "France")])
async def test_a_euro_leg_goes_to_the_payers_verified_country(
    db_settings: Settings, esc: Escrow, owner: Party, taker: Party, country: str, bank: str
) -> None:
    await _verified_in(db_settings, OWNER[0], country)
    deal = await _euro_deal(owner, taker, DE_IBAN if country == "DE" else FR_IBAN)
    v = await _open(esc, deal, owner)
    assert (v["you_pay"]["currency"], v["you_pay"]["total"]) == ("EUR", "101.00")
    assert v["you_pay"]["pay_in"]["bank_name"] == f"Pretend Bank {bank}"
    j = await _sql(
        db_settings,
        "SELECT string_agg(DISTINCT source_jurisdiction, ',') FROM settlement_legs "
        "WHERE currency = 'EUR'",
    )
    assert j == country


async def test_a_euro_payer_verified_nowhere_in_the_euro_area_gets_no_escrow(
    db_settings: Settings, esc: Escrow, owner: Party, taker: Party
) -> None:
    # The test server skips identity checks for offers (KYC_DEV_BYPASS), so the offer and
    # the deal exist; the escrow still fails closed without a German or French check.
    deal = await _euro_deal(owner, taker, DE_IBAN)
    await esc.tick()
    v = (await _view(owner, deal["match_id"])).json()
    assert v.get("phase") != "AWAITING_FUNDING"
    assert int(await _sql(db_settings, "SELECT count(*) FROM settlements")) == 0


@pytest_asyncio.fixture
async def strict(db_settings: Settings, clean: None) -> AsyncIterator[Env]:
    """A server that checks identity for real (no KYC_DEV_BYPASS) and has China off."""
    clock = Clock()
    runtime = _runtime(clock, RecordingSmsSender(), 10_000)
    settings = Settings(  # type: ignore[call-arg]
        _env_file=None, database_url=db_settings.database_url, app_env="local"
    )
    assert settings.china_enabled is False  # the default (ADR-105)
    app = create_app(settings, auth_runtime=runtime)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield Env(client, clock, runtime.sms)  # type: ignore[arg-type]


async def test_paying_euros_needs_a_german_or_french_check(
    db_settings: Settings, strict: Env
) -> None:
    body = await strict.sign_up(phone=OWNER[0], email=OWNER[1])
    p = Party(strict, body["access_token"], OWNER[0])
    await _verified_in(db_settings, OWNER[0], "NG")
    r = await p.publish(source_currency="EUR", source_amount="200.00", desired_rate="1400")
    assert r.status_code == 403 and "Germany or France" in r.json()["error"]["message"]
    await _verified_in(db_settings, OWNER[0], "FR")
    r = await p.publish(source_currency="EUR", source_amount="200.00", desired_rate="1400")
    assert r.status_code == 201, r.text


async def test_china_is_refused_everywhere_while_switched_off(
    db_settings: Settings, strict: Env
) -> None:
    body = await strict.sign_up(phone=OWNER[0], email=OWNER[1])
    p = Party(strict, body["access_token"], OWNER[0])
    await _verified_in(db_settings, OWNER[0], "NG")
    h = p._h()

    def refused(r: Any) -> None:
        assert r.status_code == 403, r.text
        assert r.json()["error"]["code"] == "BUS_403_NOT_AVAILABLE"

    # Buying yuan with naira, selling yuan, a multi-currency request including yuan.
    refused(
        await p.publish(
            source_currency="NGN",
            target_currency="CNY",
            source_amount="20000.00",
            desired_rate="150",
        )
    )
    refused(
        await p.publish(
            source_currency="CNY", target_currency="NGN", source_amount="100.00", desired_rate="150"
        )
    )
    r = await strict.client.post(
        "/api/v1/offers/requests",
        json={
            "source_amount": "200000.00",
            "currencies": [
                {"currency": "USD", "desired_rate": "1300"},
                {"currency": "CNY", "desired_rate": "150"},
            ],
        },
        headers=h | {"Idempotency-Key": "4a4d2e3c-9d0b-4c35-8d7e-8f0a1c2b3d4e"},
    )
    refused(r)
    # A yuan payout account and an identity check for China.
    refused(
        await p.add_account(
            currency="CNY",
            bank_name="Bank of China",
            account_number="6217000010012345678",
            cnaps_code="104100000004",
        )
    )
    refused(await strict.client.post("/api/v1/kyc/cases", json={"country": "CN"}, headers=h))
    # Nothing tells the app China exists.
    ceilings = (await strict.client.get("/api/v1/rates/official", headers=h)).json()
    assert "CNY" not in {i["currency"] for i in ceilings["items"]}
    assert ceilings["cny_per_usd"] is None
    regions = (await strict.client.get("/api/v1/kyc/regions", headers=h)).json()["regions"]
    assert {r["country"] for r in regions} == {"NG", "GB", "US", "CA", "DE", "FR"}


async def test_with_china_on_the_yuan_ceiling_is_worked_out_from_usd(
    db_settings: Settings, clean: None
) -> None:
    clock = Clock()
    runtime = _runtime(clock, RecordingSmsSender(), 10_000)
    settings = Settings(  # type: ignore[call-arg]
        _env_file=None, database_url=db_settings.database_url, app_env="local", china_enabled=True
    )
    app = create_app(settings, auth_runtime=runtime)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        env = Env(client, clock, runtime.sms)  # type: ignore[arg-type]
        body = await env.sign_up(phone=OWNER[0], email=OWNER[1])
        h = {"Authorization": f"Bearer {body['access_token']}"}
        ceilings = (await client.get("/api/v1/rates/official", headers=h)).json()
        cny = next(i for i in ceilings["items"] if i["currency"] == "CNY")
        expected = (OFFICIAL_RATE["USD"] / CNY_PER_USD).quantize(Decimal("0.01"))
        assert Decimal(cny["max_rate"]) == expected and cny["derived"] is True
        assert ceilings["cny_per_usd"] == "6.7167"
        regions = (await client.get("/api/v1/kyc/regions", headers=h)).json()["regions"]
        assert "CN" in {r["country"] for r in regions}
