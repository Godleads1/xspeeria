# ruff: noqa: F811  -- pytest fixtures are imported by name and used as parameters
"""Security review findings (scan of 2026-10-28) on customer sign-in. Against PostgreSQL.

* F-001: a sign-in or PIN-reset check started under the old PIN stops working once the PIN
  changes, so it can't open a new session or trust a new phone afterwards.
* F-007: Face ID/fingerprint can be turned on straight after the PIN and two-factor sign-in;
  later it needs a fresh "Confirm it's you", so copied session tokens alone can't mint a key.
"""

from __future__ import annotations

from typing import Any

import pytest

from tests.integration.test_auth_api import (  # noqa: F401
    PHONE,
    PIN,
    Env,
    _code,
    clean,
    env,
    migrated,
)

pytestmark = [pytest.mark.integration, pytest.mark.asyncio]

NEW = "736195"


async def _change_pin(env: Env, token: str) -> Any:
    approval = await env.approve(token, "pin.change")
    return await env.client.post(
        "/api/v1/users/me/pin",
        json={"current_pin": PIN, "new_pin": NEW},
        headers={"Authorization": f"Bearer {token}", "X-Step-Up-Token": approval},
    )


async def _enable(env: Env, token: str, approval: str | None = None) -> Any:
    headers = {"Authorization": f"Bearer {token}"}
    if approval:
        headers["X-Step-Up-Token"] = approval
    return await env.client.post(
        "/api/v1/auth/biometric", json={"device_token": env.device_tokens[PHONE]}, headers=headers
    )


# --- F-001 -----------------------------------------------------------------------------------


async def test_a_sign_in_started_under_the_old_pin_cannot_finish(env: Env) -> None:
    me = (await env.sign_up())["access_token"]
    env.clock.advance(seconds=61)
    # Someone who knows the old PIN starts a sign-in on another phone ...
    r = await env.login(trusted=False)
    check = r.json()
    assert check["check_required"] is True, r.text
    sms, email = env.sms.last_code_for(PHONE), env.email_code()
    assert sms is not None
    # ... the owner changes the PIN ...
    env.clock.advance(seconds=1)
    assert (await _change_pin(env, me)).status_code == 204
    # ... and the older sign-in can't be finished, even with the right codes.
    r = await env.post(
        f"/auth/checks/{check['check_id']}/codes", {"email_code": email, "sms_code": sms}
    )
    assert r.status_code == 410 and _code(r) == "AUTH_410_CHALLENGE_EXPIRED", r.text
    assert "device_token" not in r.json()


async def test_a_pin_reset_started_before_a_pin_change_cannot_finish(env: Env) -> None:
    me = (await env.sign_up())["access_token"]
    env.clock.advance(seconds=61)
    r = await env.post("/auth/pin-reset/start", {"phone": PHONE})
    assert r.status_code == 202, r.text
    code = env.sms.last_code_for(PHONE)
    r = await env.post("/auth/pin-reset/verify", {"phone": PHONE, "code": code})
    assert r.status_code == 200, r.text
    reset = r.json()["check_id"]
    email = env.email_code()
    env.clock.advance(seconds=1)
    assert (await _change_pin(env, me)).status_code == 204
    r = await env.post(
        "/auth/pin-reset/confirm", {"check_id": reset, "new_pin": "582947", "email_code": email}
    )
    assert r.status_code == 410 and _code(r) == "AUTH_410_CHALLENGE_EXPIRED", r.text
    assert (await env.login(pin=NEW)).status_code == 200


async def test_a_reset_code_sent_before_a_pin_change_cannot_be_used(env: Env) -> None:
    me = (await env.sign_up())["access_token"]
    env.clock.advance(seconds=61)
    assert (await env.post("/auth/pin-reset/start", {"phone": PHONE})).status_code == 202
    code = env.sms.last_code_for(PHONE)
    env.clock.advance(seconds=1)
    assert (await _change_pin(env, me)).status_code == 204
    r = await env.post("/auth/pin-reset/verify", {"phone": PHONE, "code": code})
    assert r.status_code == 401 and _code(r) == "AUTH_401_INVALID_OTP", r.text


# --- F-007 -----------------------------------------------------------------------------------


async def test_face_id_can_be_turned_on_right_after_sign_in(env: Env) -> None:
    me = (await env.sign_up())["access_token"]
    r = await _enable(env, me)
    assert r.status_code == 200 and r.json()["unlock_key"], r.text


async def test_later_turning_on_face_id_needs_a_fresh_approval(env: Env) -> None:
    me = (await env.sign_up())["access_token"]
    # The customer keeps using the app past the 10 minutes after sign-in.
    for _ in range(3):
        env.clock.advance(minutes=4)
        assert (await env.get("/users/me", token=me)).status_code == 200
    r = await _enable(env, me)
    assert r.status_code == 403 and _code(r) == "AUTH_403_FORBIDDEN", r.text
    assert r.json()["error"]["details"]["step_up_action"] == "biometric.enable"
    # A one-use approval from an email code check works.
    r = await env.post("/auth/step-up/checks", {"action": "biometric.enable"}, token=me)
    assert r.status_code in (200, 201), r.text
    check = r.json()["check_id"]
    r = await env.post(
        f"/auth/step-up/checks/{check}/code", {"email_code": env.email_code()}, token=me
    )
    assert r.status_code == 200, r.text
    approval = r.json()["step_up_token"]
    r = await _enable(env, me, approval)
    assert r.status_code == 200, r.text
    # ... and only once.
    r = await _enable(env, me, approval)
    assert r.status_code == 403
