# ruff: noqa: F811  -- pytest fixtures are imported by name and used as parameters
"""Fixes from the 40-point security check (owner, 2026-11-23: "go"). Against PostgreSQL.

* text messages only to the countries Xspeeria serves, and an overall cap per minute (SMS
  pumping, check 15 / B&A 13-14);
* a new phone number signs out every other session (check 13);
* a Super Admin can pause sign-ups and text messages (B&A 39);
* leaked staff passwords are refused (check 9);
* a wildcard CORS origin can't start in production (check 19);
* two copies of one partner event can never both be accepted (B&A 06).
"""

from __future__ import annotations

import uuid
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.core.config import Settings
from app.db.session import build_engine
from app.domain.auth_rules import SMS_ALL_NUMBERS_PER_MINUTE, phone_country_supported
from app.domain.staff_rules import password_problem
from app.main import build_auth_runtime
from app.services.ops_alerts import OpsAlertService
from tests.integration.test_admin_staff import Admin, H, admin, boss  # noqa: F401
from tests.integration.test_auth_api import (  # noqa: F401
    EMAIL,
    PHONE,
    PIN,
    Env,
    _code,
    _sql,
    clean,
    env,
    migrated,
)
from tests.integration.test_phone_change_api import NEW_PHONE, _start
from tests.integration.test_pin_api import _approve
from tests.production_settings import PRODUCTION_KEYS

pytestmark = [pytest.mark.integration, pytest.mark.asyncio]

JAPAN = "+819012345678"


def test_only_the_countries_we_serve() -> None:
    for ok in ("+2348030000001", "+447700900001", "+12025550101", "+233241234567", "+212612345678"):
        assert phone_country_supported(ok), ok
    for no in (JAPAN, "+882123456789", "+5511987654321", "+9715012345678"):
        assert not phone_country_supported(no), no


async def test_numbers_from_other_countries_get_no_code(env: Env) -> None:
    r = await env.post("/auth/register", {"phone": JAPAN, "email": EMAIL, "pin": PIN})
    assert r.status_code == 422 and "can't be used on Xspeeria" in r.json()["error"]["message"]
    assert env.sms.last_code_for(JAPAN) is None
    me = (await env.sign_up())["access_token"]
    r = await _start(env, me, JAPAN, await _approve(env, me, "contact.change"))
    assert r.status_code == 422 and env.sms.last_code_for(JAPAN) is None


async def test_an_overall_cap_stops_sms_pumping(db_settings: Settings, env: Env) -> None:
    # A minute in which codes already went to many different numbers.
    await _sql(
        db_settings,
        "INSERT INTO phone_verifications (id, phone, code_digest, attempts, created_at, "
        "expires_at, purpose) SELECT gen_random_uuid(), '+23480' || lpad(g::text, 8, '0'), "
        "repeat('0', 64), 0, CAST(:t AS timestamptz), "
        "CAST(:t AS timestamptz) + interval '10 minutes', 'signup' "
        "FROM generate_series(1, :n) g",
        t=env.clock(),
        n=SMS_ALL_NUMBERS_PER_MINUTE,
    )
    r = await env.post("/auth/register", {"phone": "+2348039999999", "email": EMAIL, "pin": PIN})
    assert r.status_code == 429, r.text
    assert env.sms.last_code_for("+2348039999999") is None
    env.clock.advance(minutes=1, seconds=1)  # the minute has passed
    await env.sign_up(phone="+2348039999999")


async def test_a_new_phone_number_signs_out_other_phones(env: Env) -> None:
    here = (await env.sign_up())["access_token"]
    elsewhere = (await env.login()).json()["access_token"]
    assert (await env.get("/users/me", token=elsewhere)).status_code == 200
    await _start(env, here, NEW_PHONE, await _approve(env, here, "contact.change"))
    code = env.sms.last_code_for(NEW_PHONE)
    body = {"new_phone": NEW_PHONE, "code": code}
    r = await env.post("/users/me/phone/confirm", body, token=here)
    assert r.status_code == 200, r.text
    assert (await env.get("/users/me", token=here)).status_code == 200  # this phone stays in
    assert (await env.get("/users/me", token=elsewhere)).status_code == 401


async def _signups(boss: AsyncClient, what: str, reason: str) -> Any:
    return await boss.post(
        f"/api/v1/admin/emergency/signups/{what}", json={"reason": reason}, headers=H
    )


async def test_a_super_admin_can_pause_sign_ups_and_text_messages(
    db_settings: Settings, env: Env, admin: Admin, boss: AsyncClient
) -> None:
    me = (await env.sign_up())["access_token"]  # someone already signed up before the pause
    assert (await _signups(boss, "resume", "Nothing is paused yet")).status_code == 409
    r = await _signups(boss, "pause", "Text-message bill is climbing fast")
    assert r.status_code == 200 and r.json()["paused"] is True, r.text
    r = await _signups(boss, "pause", "Twice by mistake")
    assert r.status_code == 409 and _code(r) == "RES_409_ALREADY_PAUSED"
    # Sign-up and every text-message code are refused, with a reason the app can show.
    new = {"phone": "+2348037777777", "email": "new@example.com", "pin": PIN}
    r = await env.post("/auth/register", new)
    assert r.status_code == 503 and r.json()["error"]["details"]["reason"] == "signups_paused"
    assert env.sms.last_code_for("+2348037777777") is None
    r = await env.post("/auth/pin-reset/start", {"phone": PHONE})
    assert r.status_code == 503
    # Everything else keeps working: people already signed in, and signing in with the PIN.
    assert (await env.get("/users/me", token=me)).status_code == 200
    assert (await env.login()).status_code == 200
    status = (await boss.get("/api/v1/admin/emergency/signups", headers=H)).json()
    assert status["paused"] is True and status["pause"]["reason"].startswith("Text-message")
    # Audited, and the other Super Admins are alerted.
    engine = build_engine(admin.db_settings)
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as db:
            raised = await OpsAlertService(db, admin.clock, None, admin.runtime.email).scan()
    finally:
        await engine.dispose()
    assert ("emergency_control_used", "P1") in {(a.rule, a.severity) for a in raised}
    # Resume: sign-up works again.
    r = await _signups(boss, "resume", "Provider blocked the bad numbers")
    assert r.status_code == 200 and r.json()["paused"] is False, r.text
    assert (await env.post("/auth/register", new)).status_code == 201
    actions = await _sql(
        db_settings,
        "SELECT string_agg(action, ',' ORDER BY action) FROM staff_audit_log "
        "WHERE target_type = 'signup_pause'",
    )
    assert actions == "signups_paused,signups_resumed"


async def test_only_a_super_admin_can_pause_sign_ups(admin: Admin, boss: AsyncClient) -> None:
    officer = await admin.invite(boss, "officer@xspeeria.test", "compliance_officer")
    for path in ("pause", "resume"):
        r = await officer.post(
            f"/api/v1/admin/emergency/signups/{path}",
            json={"reason": "Not my call to make"},
            headers=H,
        )
        assert r.status_code == 403, r.text
    assert (await officer.get("/api/v1/admin/emergency/signups", headers=H)).status_code == 403
    r = await boss.post("/api/v1/admin/emergency/signups/pause", json={"reason": "no"}, headers=H)
    assert r.status_code == 422


def test_leaked_staff_passwords_are_refused() -> None:
    for leaked in ("password1234", "Qwertyuiop123", "iloveyou1234", "welcome12345"):
        assert password_problem(leaked) is not None and "leaked" in str(password_problem(leaked))
    assert password_problem("tin roof ladder mango 47") is None


def test_production_refuses_a_wildcard_cors_origin() -> None:
    base: dict[str, Any] = {
        "_env_file": None,
        "app_env": "production",
        "database_url": None,
        **PRODUCTION_KEYS,
    }
    for bad in ("*", "http://admin.xspeeria.test", "https://admin.xspeeria.test,*"):
        with pytest.raises(ValueError, match="CORS_ALLOWED_ORIGINS"):
            build_auth_runtime(Settings(**base, cors_allowed_origins=bad))


async def test_one_partner_event_is_accepted_once_at_most(db_settings: Settings) -> None:
    partner = str(uuid.uuid4())
    await _sql(
        db_settings,
        "INSERT INTO partners (id, code, name, jurisdiction, currency, is_simulated, created_at) "
        "VALUES (:p, 'dup-test', 'Dup test', 'NG', 'NGN', true, now())",
        p=partner,
    )
    insert = (
        "INSERT INTO webhook_receipts (id, partner_id, provider_event_id, raw_body, verdict, "
        "received_at) VALUES (gen_random_uuid(), :p, 'evt-1', '\\x00'::bytea, :v, now())"
    )
    await _sql(db_settings, insert, p=partner, v="ACCEPTED")
    await _sql(db_settings, insert, p=partner, v="DUPLICATE")  # recorded, not accepted
    with pytest.raises(IntegrityError):
        await _sql(db_settings, insert, p=partner, v="ACCEPTED")
