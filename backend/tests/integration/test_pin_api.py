# ruff: noqa: F811  -- pytest fixtures are imported by name and used as parameters
"""ADR-046: change PIN (signed in, an approval, current PIN) and forgot PIN (SMS code plus,
since ADR-054, an email code or a face check). Against PostgreSQL."""

from __future__ import annotations

from typing import Any

import pytest

from app.core.config import Settings
from tests.integration.test_auth_api import (  # noqa: F401
    PHONE,
    PIN,
    Env,
    _code,
    _sql,
    clean,
    env,
    migrated,
)

pytestmark = [pytest.mark.integration, pytest.mark.asyncio]

NEW = "736195"


async def _approve(env: Env, token: str, action: str = "pin.change") -> str:
    return await env.approve(token, action)


async def _change(env: Env, token: str, body: dict[str, Any], approval: str | None) -> Any:
    headers = {"Authorization": f"Bearer {token}"}
    if approval:
        headers["X-Step-Up-Token"] = approval
    return await env.client.post("/api/v1/users/me/pin", json=body, headers=headers)


# --- change PIN ------------------------------------------------------------------------------


async def test_change_pin_signs_out_other_devices_only(env: Env) -> None:
    me = (await env.sign_up())["access_token"]
    other = (await env.login()).json()["access_token"]
    r = await _change(env, me, {"current_pin": PIN, "new_pin": NEW}, await _approve(env, me))
    assert r.status_code == 204, r.text
    assert (await env.get("/users/me", token=me)).status_code == 200  # this device stays
    assert (await env.get("/users/me", token=other)).status_code == 401
    assert (await env.login(pin=PIN)).status_code == 401
    assert (await env.login(pin=NEW)).status_code == 200


async def test_change_pin_needs_approval_and_the_current_pin(env: Env) -> None:
    me = (await env.sign_up())["access_token"]
    r = await _change(env, me, {"current_pin": PIN, "new_pin": NEW}, None)
    assert r.status_code == 403 and _code(r) == "AUTH_403_FORBIDDEN"
    approval = await _approve(env, me)
    r = await _change(env, me, {"current_pin": "111111", "new_pin": NEW}, approval)
    assert r.status_code == 401
    # The approval was spent by the wrong attempt: a second try needs a new one.
    r = await _change(env, me, {"current_pin": PIN, "new_pin": NEW}, approval)
    assert r.status_code == 403
    r = await _change(env, me, {"current_pin": PIN, "new_pin": PIN}, await _approve(env, me))
    assert r.status_code == 422 and "different" in r.json()["error"]["message"]
    r = await _change(env, me, {"current_pin": PIN, "new_pin": "123456"}, await _approve(env, me))
    assert r.status_code == 422  # weak PIN
    r = await _change(
        env, me, {"current_pin": PIN, "new_pin": NEW, "x": 1}, await _approve(env, me)
    )
    assert r.status_code == 422


async def test_wrong_current_pin_counts_towards_the_lock(env: Env) -> None:
    me = (await env.sign_up())["access_token"]
    last = None
    for _ in range(5):
        last = await _change(
            env, me, {"current_pin": "111111", "new_pin": NEW}, await _approve(env, me)
        )
    assert last is not None and last.status_code == 429


# --- forgot PIN ------------------------------------------------------------------------------


async def _reset_code(env: Env, phone: str = PHONE) -> str:
    env.clock.advance(seconds=61)  # past the resend wait
    r = await env.post("/auth/pin-reset/start", {"phone": phone})
    assert r.status_code == 202, r.text
    code = env.sms.last_code_for(phone)
    assert code is not None
    return code


async def _reset(env: Env, code: str, new_pin: str = NEW) -> Any:
    r = await env.post("/auth/pin-reset/verify", {"phone": PHONE, "code": code})
    assert r.status_code == 200, r.text
    check = r.json()["check_id"]
    return await env.post(
        "/auth/pin-reset/confirm",
        {"check_id": check, "new_pin": new_pin, "email_code": env.email_code()},
    )


async def test_reset_ends_every_session_and_forgets_trust(db_settings: Settings, env: Env) -> None:
    me = (await env.sign_up())["access_token"]
    code = await _reset_code(env)
    r = await _reset(env, code)
    assert r.status_code == 204, r.text
    assert (await env.get("/users/me", token=me)).status_code == 401
    assert (
        await _sql(db_settings, "SELECT count(*) FROM trusted_devices WHERE revoked_at IS NULL")
        == 0
    )
    assert (
        await _sql(
            db_settings, "SELECT count(*) FROM auth_sessions WHERE revoke_reason = 'pin_reset'"
        )
        >= 1
    )
    assert (await env.login(pin=NEW, trusted=False)).status_code == 200
    # The SMS code worked once.
    r = await env.post("/auth/pin-reset/verify", {"phone": PHONE, "code": code})
    assert r.status_code == 401


async def test_reset_needs_the_second_check(env: Env) -> None:
    await env.sign_up()
    code = await _reset_code(env)
    r = await env.post("/auth/pin-reset/verify", {"phone": PHONE, "code": code})
    check = r.json()["check_id"]
    for body in (
        {"check_id": check, "new_pin": NEW},  # no email code
        {"check_id": check, "new_pin": NEW, "email_code": "000000"},
    ):
        r = await env.post("/auth/pin-reset/confirm", body)
        assert r.status_code == 401, body
    # The old phone+code+PIN body is refused, never half-read.
    r = await env.post(
        "/auth/pin-reset/confirm",
        {"phone": PHONE, "code": code, "new_pin": NEW, "otp_code": "123456"},
    )
    assert r.status_code == 422
    assert (await env.login(pin=PIN)).status_code == 200  # PIN unchanged


async def test_wrong_sms_code_and_sign_up_code_do_not_work(env: Env) -> None:
    await env.sign_up()
    await _reset_code(env)
    r = await env.post("/auth/pin-reset/verify", {"phone": PHONE, "code": "000000"})
    assert r.status_code == 401
    # A reset code never activates an account, and a sign-up code never resets a PIN.
    other = "+2348031111111"
    r = await env.post("/auth/register", {"phone": other, "email": "x@example.com", "pin": PIN})
    signup_code = env.sms.last_code_for(other)
    r = await env.post("/auth/pin-reset/verify", {"phone": other, "code": signup_code})
    assert r.status_code == 401


async def test_unknown_number_gets_the_same_answer_and_no_sms(env: Env) -> None:
    r = await env.post("/auth/pin-reset/start", {"phone": "+447700900123"})
    assert r.status_code == 202
    assert r.json() == {"status": "code_sent_if_account_exists"}
    assert env.sms.last_code_for("+447700900123") is None
    r = await env.post("/auth/pin-reset/start", {"phone": "0803"})
    assert r.status_code == 422
