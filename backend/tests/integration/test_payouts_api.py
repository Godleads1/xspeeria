# ruff: noqa: F811  -- pytest fixtures are imported by name and used as parameters
"""Milestone 4.1E: payout accounts and the 30-minute preparation window (ADR-035).

Payout accounts are where the partner bank pays each user from escrow; a deal's payout
choice says which accounts and how much. Records only — no money moves. Normal, failure,
abuse and expiry cases, against PostgreSQL.
"""

from __future__ import annotations

import base64
import dataclasses
import logging
import uuid
from collections.abc import AsyncIterator
from typing import Any

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient, Response

from app.core.config import Settings
from app.core.mfa import SecretBox
from app.db.session import build_engine
from app.main import create_app
from app.providers.bank_check import DevNameCheck
from app.providers.sms import RecordingSmsSender
from app.services.matches import MatchService
from tests.integration.test_auth_api import (  # noqa: F401
    Clock,
    Env,
    _code,
    _runtime,
    _sql,
    clean,
    migrated,
)
from tests.integration.test_matches_api import OWNER, TAKER, THIRD, Person
from tests.integration.test_offers_api import currencies  # noqa: F401

pytestmark = [pytest.mark.integration, pytest.mark.asyncio]

BOX_KEY = base64.b64encode(bytes(range(100, 132))).decode()
ROUTING = "021000021"  # a valid ABA checksum


async def _env(
    db_settings: Settings, *, box: bool = True, check: bool = True
) -> AsyncIterator[Env]:
    clock = Clock()
    runtime = dataclasses.replace(
        _runtime(clock, RecordingSmsSender(), 10_000),
        beneficiary_box=SecretBox(BOX_KEY, name="BENEFICIARY_ENCRYPTION_KEY") if box else None,
        name_check=DevNameCheck() if check else None,
    )
    settings = Settings(  # type: ignore[call-arg]
        _env_file=None, database_url=db_settings.database_url, app_env="local", kyc_dev_bypass=True
    )
    app = create_app(settings, auth_runtime=runtime)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield Env(client, clock, runtime.sms)  # type: ignore[arg-type]


@pytest_asyncio.fixture
async def env(db_settings: Settings) -> AsyncIterator[Env]:
    async for e in _env(db_settings):
        yield e


class Party(Person):
    async def relogin(self) -> None:
        r = await self.env.login(self.phone)
        assert r.status_code == 200, r.text
        self.token = r.json()["access_token"]

    async def add_account(self, *, approve: bool = True, **body: Any) -> Response:
        headers = self._h()
        if approve:
            headers["X-Step-Up-Token"] = await self.approve("beneficiary.add")
        return await self.env.client.post("/api/v1/payout-accounts", json=body, headers=headers)

    async def ngn(self, number: str = "0123456789") -> str:
        r = await self.add_account(currency="NGN", bank_name="Zenith Bank", account_number=number)
        assert r.status_code == 201, r.text
        return str(r.json()["payout_account_id"])

    async def usd(self, number: str = "123456789012") -> str:
        r = await self.add_account(
            currency="USD",
            bank_name="Chase",
            account_number=number,
            routing_number=ROUTING,
            account_type="Checking",
        )
        assert r.status_code == 201, r.text
        return str(r.json()["payout_account_id"])

    async def accounts(self) -> Response:
        return await self.env.client.get("/api/v1/payout-accounts", headers=self._h())

    async def choose(
        self, match_id: str, lines: list[tuple[str, str]], *, approve: bool = True
    ) -> Response:
        headers = self._h()
        if approve:
            headers["X-Step-Up-Token"] = await self.approve("payout.confirm")
        body = {"accounts": [{"payout_account_id": a, "amount": amt} for a, amt in lines]}
        return await self.env.client.put(
            f"/api/v1/matches/{match_id}/payout-accounts", json=body, headers=headers
        )


async def _party(env: Env, who: tuple[str, str]) -> Party:
    body = await env.sign_up(phone=who[0], email=who[1])
    return Party(env, body["access_token"], who[0])


@pytest_asyncio.fixture
async def owner(env: Env) -> Party:
    return await _party(env, OWNER)


@pytest_asyncio.fixture
async def taker(env: Env, owner: Party) -> Party:
    return await _party(env, TAKER)


@pytest_asyncio.fixture
async def deal(owner: Party, taker: Party) -> dict[str, Any]:
    """Owner sells 500 USD at 1,320.50; taker takes 200 → owner receives NGN 264,100.00."""
    offer = (await owner.publish(source_amount="500.00", desired_rate="1320.50")).json()
    r = await taker.take(offer["offer_id"], "200.00")
    assert r.status_code == 201, r.text
    return {"offer_id": offer["offer_id"], **r.json()}


# --- payout accounts -----------------------------------------------------------------------


async def test_add_account_keeps_only_last4_readable(
    db_settings: Settings, owner: Party, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG)
    r = await owner.add_account(
        currency="NGN", bank_name="Zenith Bank", account_number="0123456789"
    )
    assert r.status_code == 201, r.text
    a = r.json()
    assert a["account_last4"] == "6789" and a["validation_state"] == "validated"
    assert a["account_name"] == "DEV ACCOUNT HOLDER"
    assert "0123456789" not in r.text and "account_number" not in a
    assert "0123456789" not in caplog.text
    sealed = await _sql(db_settings, "SELECT account_number_sealed FROM beneficiaries")
    assert b"0123456789" not in bytes(sealed)
    box = SecretBox(BOX_KEY)
    assert box.open(bytes(sealed), bound_to=a["payout_account_id"]) == "0123456789"
    ref = await _sql(db_settings, "SELECT account_ref FROM beneficiaries")
    assert str(ref).startswith("local:") and "6789" not in str(ref)
    listed = (await owner.accounts()).json()
    assert [x["account_last4"] for x in listed] == ["6789"]


async def test_new_accounts_have_no_waiting_period(owner: Party) -> None:
    a = (
        await owner.add_account(currency="NGN", bank_name="GTBank", account_number="1111111111")
    ).json()
    assert a["payout_hold_until"] == a["created_at"]  # DEC-044: paid at once


@pytest.mark.parametrize(
    "body",
    [
        {"currency": "NGN", "bank_name": "Zenith", "account_number": "123456789"},
        {"currency": "NGN", "bank_name": "Zenith", "account_number": "12345678901"},
        {"currency": "NGN", "bank_name": "Zenith", "account_number": "01234567８9"},
        {
            "currency": "USD",
            "bank_name": "Chase",
            "account_number": "1234",
            "routing_number": "123456789",
            "account_type": "Checking",
        },
        {
            "currency": "USD",
            "bank_name": "Chase",
            "account_number": "1234",
            "routing_number": ROUTING,
        },
        {"currency": "GBP", "bank_name": "Barclays", "account_number": "12345678"},
        {"currency": "EUR", "bank_name": "ING", "account_number": "12345678"},
        {"currency": "NGN", "bank_name": "<script>", "account_number": "0123456789"},
    ],
)
async def test_bad_account_details(owner: Party, body: dict[str, str]) -> None:
    r = await owner.add_account(**body)  # type: ignore[arg-type]
    assert r.status_code == 422 and _code(r) == "VALIDATION_ERROR"


async def test_gbp_account(owner: Party) -> None:
    r = await owner.add_account(
        currency="GBP", bank_name="Barclays", account_number="12345678", sort_code="200000"
    )
    assert r.status_code == 201 and r.json()["account_last4"] == "5678"


async def test_eur_account_by_iban(owner: Party) -> None:
    """ADR-099: the IBAN only; written in groups is fine; it may end in a letter."""
    r = await owner.add_account(
        currency="EUR", bank_name="ING", account_number="DE89 3704 0044 0532 0130 00"
    )
    assert r.status_code == 201, r.text
    assert r.json()["account_last4"] == "3000" and "account_number" not in r.json()
    r = await owner.add_account(
        currency="EUR",
        bank_name="Bank of Valletta",
        account_number="MT84MALT011000012345MTLCAST001S",
    )
    assert r.status_code == 201 and r.json()["account_last4"] == "001S"
    r = await owner.add_account(
        currency="EUR", bank_name="ING", account_number="DE89370400440532013001"
    )
    assert r.status_code == 422 and _code(r) == "VALIDATION_ERROR"


async def test_cad_account(owner: Party) -> None:
    """ADR-100: institution (3 digits), transit (5 digits) and the account number."""
    r = await owner.add_account(
        currency="CAD",
        bank_name="RBC",
        account_number="1234567",
        institution_number="003",
        transit_number="12345",
    )
    assert r.status_code == 201, r.text
    assert r.json()["account_last4"] == "4567" and "account_number" not in r.json()
    r = await owner.add_account(currency="CAD", bank_name="RBC", account_number="1234567")
    assert r.status_code == 422 and _code(r) == "VALIDATION_ERROR"


async def test_adding_needs_an_approval_for_that_action(owner: Party) -> None:
    r = await owner.add_account(
        approve=False, currency="NGN", bank_name="Zenith", account_number="0123456789"
    )
    assert r.status_code == 403
    headers = owner._h()
    headers["X-Step-Up-Token"] = await owner.approve("pin.change")
    r = await owner.env.client.post(
        "/api/v1/payout-accounts",
        json={"currency": "NGN", "bank_name": "Zenith", "account_number": "0123456789"},
        headers=headers,
    )
    assert r.status_code == 403


async def test_client_cannot_set_server_fields(owner: Party) -> None:
    r = await owner.add_account(
        currency="NGN",
        bank_name="Zenith",
        account_number="0123456789",
        validation_state="validated",
    )
    assert r.status_code == 422


async def test_remove_account(env: Env, owner: Party, taker: Party) -> None:
    acct = await owner.ngn()
    h = taker._h()
    h["X-Step-Up-Token"] = await taker.approve("beneficiary.remove")
    r = await env.client.delete(f"/api/v1/payout-accounts/{acct}", headers=h)
    assert r.status_code == 404  # someone else's: as if it did not exist
    r = await env.client.delete(f"/api/v1/payout-accounts/{acct}", headers=owner._h())
    assert r.status_code == 403  # no approval
    h = owner._h()
    h["X-Step-Up-Token"] = await owner.approve("beneficiary.remove")
    assert (
        await env.client.delete(f"/api/v1/payout-accounts/{acct}", headers=h)
    ).status_code == 204
    assert (await owner.accounts()).json() == []


async def test_without_encryption_key_accounts_are_off(db_settings: Settings) -> None:
    async for e in _env(db_settings, box=False):
        p = await _party(e, OWNER)
        r = await p.add_account(currency="NGN", bank_name="Zenith", account_number="0123456789")
        assert r.status_code == 503 and _code(r) == "SYS_503_SERVICE_UNAVAILABLE"


async def test_without_a_bank_check_accounts_stay_pending(db_settings: Settings) -> None:
    async for e in _env(db_settings, check=False):
        p = await _party(e, OWNER)
        r = await p.add_account(currency="NGN", bank_name="Zenith", account_number="0123456789")
        assert r.status_code == 201 and r.json()["validation_state"] == "pending"
        assert r.json()["account_name"] is None


# --- choosing payout accounts for a deal ---------------------------------------------------


async def test_deal_starts_waiting_30_minutes_and_says_what_each_side_receives(
    owner: Party, taker: Party, deal: dict[str, Any]
) -> None:
    assert deal["preparation_state"] == "awaiting_payout_accounts"
    assert deal["you_receive_currency"] == "USD" and deal["you_receive_amount"] == "200.00"
    seen = (await owner.match(deal["match_id"])).json()
    assert seen["you_receive_currency"] == "NGN" and seen["you_receive_amount"] == "264100.00"
    from datetime import datetime

    accepted = datetime.fromisoformat(deal["accepted_at"])
    deadline = datetime.fromisoformat(deal["preparation_deadline"])
    assert (deadline - accepted).total_seconds() == 1800


async def test_both_sides_choose_and_the_deal_is_ready(
    db_settings: Settings, owner: Party, taker: Party, deal: dict[str, Any]
) -> None:
    usd = await taker.usd()
    r = await taker.choose(deal["match_id"], [(usd, "200.00")])
    assert r.status_code == 200, r.text
    assert r.json()["you_chose_payout_accounts"] is True
    assert r.json()["other_side_chose_payout_accounts"] is False
    assert r.json()["preparation_state"] == "awaiting_payout_accounts"
    # Owner splits across two of their own NGN accounts (ADR-021 §3).
    a, b = await owner.ngn("0123456789"), await owner.ngn("9876543210")
    r = await owner.choose(deal["match_id"], [(a, "200000.00"), (b, "64100.00")])
    assert r.status_code == 200, r.text
    assert r.json()["preparation_state"] == "funding_ready"
    assert await _sql(db_settings, "SELECT count(*) FROM match_payout_selections") == 3
    # Once ready, choices are fixed.
    r = await owner.choose(deal["match_id"], [(a, "264100.00")])
    assert r.status_code == 409 and _code(r) == "RES_409_INVALID_SETTLEMENT_STATE"


async def test_choice_can_be_changed_while_waiting(
    db_settings: Settings, taker: Party, deal: dict[str, Any]
) -> None:
    a, b = await taker.usd("111122223333"), await taker.usd("444455556666")
    assert (await taker.choose(deal["match_id"], [(a, "200")])).status_code == 200
    assert (await taker.choose(deal["match_id"], [(a, "50"), (b, "150")])).status_code == 200
    assert await _sql(db_settings, "SELECT count(*) FROM match_payout_selections") == 2


@pytest.mark.parametrize(
    ("lines", "code"),
    [
        ([("usd", "199.99")], "VALIDATION_ERROR"),  # must add up exactly
        ([("usd", "200.001")], "VALIDATION_ERROR"),
        ([("usd", "100"), ("usd", "100")], "VALIDATION_ERROR"),  # same account twice
        ([("ngn", "200.00")], "VALIDATION_ERROR"),  # wrong currency
    ],
)
async def test_bad_choices(
    taker: Party, deal: dict[str, Any], lines: list[tuple[str, str]], code: str
) -> None:
    ids = {"usd": await taker.usd(), "ngn": await taker.ngn()}
    r = await taker.choose(deal["match_id"], [(ids[k], amt) for k, amt in lines])
    assert r.status_code == 422 and _code(r) == code


async def test_cannot_use_someone_elses_or_unconfirmed_account(
    db_settings: Settings, owner: Party, taker: Party, deal: dict[str, Any]
) -> None:
    owners_usd = await owner.usd()
    r = await taker.choose(deal["match_id"], [(owners_usd, "200")])
    assert r.status_code == 404
    mine = await taker.usd()
    await _sql(
        db_settings,
        "UPDATE beneficiaries SET validation_state = 'pending', validated_at = NULL WHERE id = :i",
        i=mine,
    )
    r = await taker.choose(deal["match_id"], [(mine, "200")])
    assert r.status_code == 422


async def test_outsiders_and_missing_approval_are_refused(
    env: Env, taker: Party, deal: dict[str, Any]
) -> None:
    usd = await taker.usd()
    r = await taker.choose(deal["match_id"], [(usd, "200")], approve=False)
    assert r.status_code == 403
    third = await _party(env, THIRD)
    their = await third.usd()
    r = await third.choose(deal["match_id"], [(their, "200")])
    assert r.status_code == 403 and _code(r) == "AUTH_403_FORBIDDEN"
    r = await taker.choose(str(uuid.uuid4()), [(usd, "200")])
    assert r.status_code == 404


async def test_removed_account_cannot_be_chosen(
    env: Env, taker: Party, deal: dict[str, Any]
) -> None:
    usd = await taker.usd()
    h = taker._h()
    h["X-Step-Up-Token"] = await taker.approve("beneficiary.remove")
    await env.client.delete(f"/api/v1/payout-accounts/{usd}", headers=h)
    assert (await taker.choose(deal["match_id"], [(usd, "200")])).status_code == 404


# --- the 30-minute window ------------------------------------------------------------------


async def test_unchosen_deal_expires_and_returns_the_amount(
    db_settings: Settings, env: Env, owner: Party, taker: Party, deal: dict[str, Any]
) -> None:
    env.clock.advance(minutes=31)
    await owner.relogin()
    await taker.relogin()
    m = (await taker.match(deal["match_id"])).json()
    assert m["preparation_state"] == "expired"
    cause = await _sql(db_settings, "SELECT termination_cause FROM matches")
    assert cause == "payout_accounts_not_chosen_in_time"
    status_, matched = (
        await _sql(db_settings, "SELECT status FROM offers"),
        await _sql(db_settings, "SELECT matched_amount_minor FROM offers"),
    )
    assert (status_, matched) == ("open", 0)
    listed = (await taker.listings()).json()["items"]
    assert [o["remaining_amount"] for o in listed] == ["500.00"]


async def test_choosing_after_the_deadline_is_refused(
    env: Env, taker: Party, deal: dict[str, Any]
) -> None:
    usd = await taker.usd()
    env.clock.advance(minutes=31)
    await taker.relogin()
    r = await taker.choose(deal["match_id"], [(usd, "200")])
    assert r.status_code == 409 and "30 minutes" in r.json()["error"]["message"]


async def test_expired_amount_can_be_taken_again(
    env: Env, owner: Party, taker: Party, deal: dict[str, Any]
) -> None:
    env.clock.advance(minutes=31)
    await taker.relogin()
    # No sweep has run: acceptance itself frees the expired amount under the offer lock.
    r = await taker.take(deal["offer_id"], "500.00")
    assert r.status_code == 201, r.text


async def test_ready_deals_never_expire(
    db_settings: Settings, env: Env, owner: Party, taker: Party, deal: dict[str, Any]
) -> None:
    await taker.choose(deal["match_id"], [(await taker.usd(), "200")])
    await owner.choose(deal["match_id"], [(await owner.ngn(), "264100.00")])
    env.clock.advance(hours=2)
    await taker.relogin()
    assert (await taker.match(deal["match_id"])).json()["preparation_state"] == "funding_ready"
    assert await _sql(db_settings, "SELECT matched_amount_minor FROM offers") == 20_000


async def test_withdrawn_offer_stays_withdrawn_after_expiry(
    db_settings: Settings, env: Env, owner: Party, taker: Party, deal: dict[str, Any]
) -> None:
    await owner.delete(deal["offer_id"])
    env.clock.advance(minutes=31)
    await taker.relogin()
    await taker.match(deal["match_id"])
    assert await _sql(db_settings, "SELECT status FROM offers") == "withdrawn"
    assert await _sql(db_settings, "SELECT matched_amount_minor FROM offers") == 0


async def test_sweep_expires_due_deals_once(
    db_settings: Settings, env: Env, deal: dict[str, Any]
) -> None:
    env.clock.advance(minutes=31)
    engine = build_engine(db_settings)
    try:
        from sqlalchemy.ext.asyncio import async_sessionmaker

        maker = async_sessionmaker(engine, expire_on_commit=False)
        async with maker() as db:
            assert await MatchService(db, env.clock).expire_due() == 1
        async with maker() as db:
            assert await MatchService(db, env.clock).expire_due() == 0
    finally:
        await engine.dispose()


# --- database guarantees -------------------------------------------------------------------


async def test_app_role_grants(db_settings: Settings) -> None:
    async def grants(table: str) -> Any:
        return await _sql(
            db_settings,
            "SELECT string_agg(privilege_type, ',' ORDER BY privilege_type) "
            "FROM information_schema.role_table_grants "
            "WHERE grantee = 'xspeeria_app' AND table_name = :t",
            t=table,
        )

    assert await grants("beneficiaries") == "INSERT,SELECT,UPDATE"
    assert await grants("match_payout_selections") == "DELETE,INSERT,SELECT"
    cols = await _sql(
        db_settings,
        "SELECT string_agg(column_name, ',' ORDER BY column_name) "
        "FROM information_schema.column_privileges "
        "WHERE grantee = 'xspeeria_app' AND table_name = 'matches' AND privilege_type = 'UPDATE'",
    )
    assert cols == "preparation_ended_at,preparation_state,termination_cause"


async def test_database_refuses_inconsistent_preparation(
    db_settings: Settings, deal: dict[str, Any]
) -> None:
    with pytest.raises(Exception, match="expired_iff_cause"):
        await _sql(
            db_settings,
            "UPDATE matches SET preparation_state = 'expired', preparation_ended_at = now()",
        )
