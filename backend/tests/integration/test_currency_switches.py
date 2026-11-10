# ruff: noqa: F811  -- pytest fixtures are imported by name and used as parameters
"""ADR-106 (owner 2026-11-10): a Super Admin switches built-in currencies on and off.

"Switch built ones on/off" · "One Super Admin" · "Hide offers, finish deals" · China: "Both
must be on" (the switch and CHINA_ENABLED).
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from httpx import AsyncClient, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.db.session import build_engine
from app.domain.offer_rules import FOREIGN
from app.domain.staff_rules import SUPER_ADMIN
from app.services.currency_switch import CurrencySwitchService
from app.services.official_rates import current_ceilings
from app.services.staff import RequestInfo, StaffPrincipal
from tests.integration.test_admin_staff import BOSS, BOSS_PW, Admin, H
from tests.integration.test_auth_api import (  # noqa: F401
    Clock,
    Env,
    _runtime,
    _sql,
    clean,
    migrated,
)
from tests.integration.test_offers_api import currencies  # noqa: F401  (autouse: CD3 rows)
from tests.integration.test_payouts_api import Party, env, owner, taker  # noqa: F401

pytestmark = [pytest.mark.integration, pytest.mark.asyncio]

WHY = "Partner bank paused euro payments"


@pytest_asyncio.fixture
async def staff(db_settings: Settings, owner: Party) -> AsyncIterator[Admin]:
    """Made after the customer app: its setup clears every table first."""
    clock = Clock()
    a = Admin(db_settings, clock, _runtime(clock, None, 10_000))
    await a.service_call("create_first_super_admin", BOSS, "The Boss", BOSS_PW)
    yield a
    for c in a.opened:
        await c.aclose()


@pytest_asyncio.fixture
async def boss(staff: Admin) -> AsyncIterator[AsyncClient]:
    async with staff.client() as c:
        assert (await staff.login(c, BOSS, BOSS_PW)).status_code == 200
        yield c


async def _switch(c: AsyncClient, currency: str, enabled: bool, reason: str = WHY) -> Response:
    return await c.post(
        f"/api/v1/admin/currencies/{currency}",
        json={"enabled": enabled, "reason": reason},
        headers=H,
    )


async def _listed(p: Party, pair: str = "EUR/NGN") -> list[str]:
    r = await p.env.client.get(
        "/api/v1/marketplace/listings",
        params={"filter[currency_pair]": pair},
        headers=p._h() | {"X-Device-Country": "JP"},
    )
    assert r.status_code == 200, r.text
    return [o["offer_id"] for o in r.json()["items"]]


async def _ceilings(p: Party) -> set[str]:
    r = await p.env.client.get("/api/v1/rates/official", headers=p._h())
    return {i["currency"] for i in r.json()["items"]}


async def test_the_list_shows_naira_locked_and_the_yuan_off(boss: AsyncClient) -> None:
    items = {
        i["currency"]: i
        for i in (await boss.get("/api/v1/admin/currencies", headers=H)).json()["items"]
    }
    assert list(items) == ["NGN", *sorted(FOREIGN)]
    assert (items["NGN"]["enabled"], items["NGN"]["locked"]) == (True, "naira")
    assert (items["CNY"]["enabled"], items["CNY"]["locked"]) == (False, "china")
    assert all(items[c]["enabled"] for c in ("USD", "GBP", "EUR", "CAD"))


async def test_switching_euros_off_hides_offers_and_finishes_deals(
    db_settings: Settings, owner: Party, taker: Party, boss: AsyncClient
) -> None:
    # Two euro offers; one is taken before the switch, the other stays listed.
    a = (
        await owner.publish(source_currency="EUR", source_amount="200.00", desired_rate="1400")
    ).json()
    b = (
        await owner.publish(source_currency="EUR", source_amount="300.00", desired_rate="1410")
    ).json()
    r = await taker.take(a["offer_id"], "100.00")
    assert r.status_code == 201, r.text
    match_id = r.json()["match_id"]
    assert b["offer_id"] in await _listed(taker)

    r = await _switch(boss, "EUR", False)
    assert r.status_code == 200 and r.json() == {"currency": "EUR", "enabled": False}, r.text

    # Hidden: not listed, no rate limit, can't be taken, no new offers or euro accounts.
    assert await _listed(taker) == []
    assert "EUR" not in await _ceilings(taker)
    r = await taker.take(b["offer_id"], "50.00")
    assert (r.status_code, r.json()["error"]["code"]) == (409, "RES_409_OFFER_UNAVAILABLE")
    r = await owner.publish(source_currency="EUR", source_amount="200.00", desired_rate="1400")
    assert (r.status_code, r.json()["error"]["code"]) == (403, "BUS_403_NOT_AVAILABLE")
    r = await taker.add_account(
        currency="EUR", bank_name="Euro Bank", account_number="DE89370400440532013000"
    )
    assert (r.status_code, r.json()["error"]["code"]) == (403, "BUS_403_NOT_AVAILABLE")
    # Other currencies are unaffected.
    assert {"USD", "GBP", "CAD"} <= await _ceilings(taker)

    # The deal matched before the switch carries on: the owner can still choose a payout.
    ngn = await owner.ngn()
    r = await owner.choose(match_id, [(ngn, "140000.00")])
    assert r.status_code == 200, r.text

    # Back on: the waiting offer is listed again.
    assert (await _switch(boss, "EUR", True, "Partner bank resumed")).status_code == 200
    assert b["offer_id"] in await _listed(taker)
    actions = await _sql(
        db_settings,
        "SELECT string_agg(action || ':' || target_id, ',' ORDER BY action) FROM staff_audit_log "
        "WHERE target_type = 'currency'",
    )
    assert actions == "currency_switched_off:EUR,currency_switched_on:EUR"


async def test_only_a_super_admin_switches_with_a_reason(staff: Admin, boss: AsyncClient) -> None:
    officer = await staff.invite(boss, "officer@xspeeria.test", "compliance_officer")
    assert (await officer.get("/api/v1/admin/currencies", headers=H)).status_code == 200
    r = await _switch(officer, "USD", False)
    assert (r.status_code, r.json()["error"]["code"]) == (403, "ADMIN_403_SUPER_ADMIN_ONLY")
    assert (await _switch(boss, "USD", False, "x")).status_code == 422
    r = await _switch(boss, "NGN", False)
    assert (r.status_code, r.json()["error"]["code"]) == (409, "RES_409_INVALID_STATE")
    assert (await _switch(boss, "JPY", True)).status_code == 404
    # The yuan stays off while CHINA_ENABLED is off on the server.
    r = await _switch(boss, "CNY", True, "Lawyer said yes")
    assert (r.status_code, r.json()["error"]["code"]) == (409, "RES_409_INVALID_STATE")


async def test_the_yuan_needs_both_the_switch_and_china_enabled(
    db_settings: Settings, owner: Party, boss: AsyncClient
) -> None:
    """With CHINA_ENABLED on, the yuan still waits for the switch; then it has a rate limit."""
    engine = build_engine(db_settings)
    try:
        async with AsyncSession(engine, expire_on_commit=False) as db:
            clock = Clock()
            assert "CNY" not in await current_ceilings(db, clock())
            boss_id = await _sql(db_settings, "SELECT id::text FROM staff_accounts LIMIT 1")
            principal = StaffPrincipal(
                staff_id=uuid.UUID(boss_id),
                session_id=uuid.uuid4(),
                email=BOSS,
                role_id=uuid.uuid4(),
                role_name=SUPER_ADMIN,
                permissions=frozenset(),
            )
            service = CurrencySwitchService(db, clock, china_enabled=True)
            info = RequestInfo(ip_address=None, user_agent=None)
            assert (await service.set(principal, info, "CNY", True, "Lawyer said yes"))["enabled"]
            assert "CNY" in await current_ceilings(db, clock())
    finally:
        await engine.dispose()
