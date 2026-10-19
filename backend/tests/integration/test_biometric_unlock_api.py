# ruff: noqa: F811  -- pytest fixtures are imported by name and used as parameters
"""ADR-048: Face ID/fingerprint resumes a session after the 5-minute idle lock, on a trusted
device only, never past the 7-day limit. Against PostgreSQL."""

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


async def _signed_in(env: Env) -> dict[str, Any]:
    await env.sign_up()
    r = await env.login()
    assert r.status_code == 200, r.text
    return dict(r.json())


async def _enable(env: Env, access: str, device_token: str | None = None) -> Any:
    token = device_token if device_token is not None else env.device_tokens[PHONE]
    return await env.post("/auth/biometric", {"device_token": token}, token=access)


async def _unlock(env: Env, refresh: str, key: str) -> Any:
    return await env.post("/auth/biometric/unlock", {"refresh_token": refresh, "unlock_key": key})


async def test_unlocks_after_the_idle_lock_and_keeps_the_7_day_limit(env: Env) -> None:
    t = await _signed_in(env)
    r = await _enable(env, t["access_token"])
    assert r.status_code == 200, r.text
    key = r.json()["unlock_key"]
    env.clock.advance(minutes=6)
    # The plain refresh is refused after 5 minutes idle...
    r = await env.client.post(
        "/api/v1/auth/refresh", headers={"Authorization": f"Bearer {t['refresh_token']}"}
    )
    assert r.status_code == 401
    # ...but the unlock key resumes the same session.
    r = await _unlock(env, t["refresh_token"], key)
    assert r.status_code == 200, r.text
    resumed = r.json()
    assert (await env.get("/users/me", token=resumed["access_token"])).status_code == 200
    # Unlocking again and again never passes 7 days from the PIN log-in.
    env.clock.advance(days=7)
    r = await _unlock(env, resumed["refresh_token"], key)
    assert r.status_code == 401


async def test_only_on_a_trusted_device(env: Env) -> None:
    t = await _signed_in(env)
    r = await _enable(env, t["access_token"], device_token="not-a-real-device-token")
    assert r.status_code == 403 and _code(r) == "AUTH_403_DEVICE_NOT_TRUSTED"
    r = await env.post("/auth/biometric", {}, token=t["access_token"])
    assert r.status_code == 422
    r = await env.post(
        "/auth/biometric",
        {"device_token": env.device_tokens[PHONE], "user_id": "x"},
        token=t["access_token"],
    )
    assert r.status_code == 422


async def test_wrong_key_ends_the_session(db_settings: Settings, env: Env) -> None:
    t = await _signed_in(env)
    key = (await _enable(env, t["access_token"])).json()["unlock_key"]
    env.clock.advance(minutes=6)
    r = await _unlock(env, t["refresh_token"], "x" * 43)
    assert r.status_code == 401
    assert (
        await _sql(
            db_settings,
            "SELECT count(*) FROM auth_sessions WHERE revoke_reason = 'unlock_failed'",
        )
        == 1
    )
    # The right key no longer helps: log in with the PIN.
    assert (await _unlock(env, t["refresh_token"], key)).status_code == 401


async def test_needs_the_current_refresh_token(env: Env) -> None:
    t = await _signed_in(env)
    key = (await _enable(env, t["access_token"])).json()["unlock_key"]
    env.clock.advance(minutes=6)
    first = await _unlock(env, t["refresh_token"], key)
    assert first.status_code == 200
    # Presenting the spent refresh token again ends the session (copied token).
    assert (await _unlock(env, t["refresh_token"], key)).status_code == 401
    assert (await _unlock(env, first.json()["refresh_token"], key)).status_code == 401
    assert (await _unlock(env, "unknown", key)).status_code == 401


async def test_stops_after_logout_turning_off_or_untrusting(env: Env) -> None:
    # Log-out.
    t = await _signed_in(env)
    key = (await _enable(env, t["access_token"])).json()["unlock_key"]
    assert (await env.post("/auth/logout", token=t["access_token"])).status_code == 204
    env.clock.advance(minutes=6)
    assert (await _unlock(env, t["refresh_token"], key)).status_code == 401

    # Turned off.
    t = (await env.login()).json()
    key = (await _enable(env, t["access_token"])).json()["unlock_key"]
    r = await env.client.delete(
        "/api/v1/auth/biometric", headers={"Authorization": f"Bearer {t['access_token']}"}
    )
    assert r.status_code == 204
    env.clock.advance(minutes=6)
    assert (await _unlock(env, t["refresh_token"], key)).status_code == 401

    # The device is no longer trusted.
    t = (await env.login()).json()
    key = (await _enable(env, t["access_token"])).json()["unlock_key"]
    devices = (await env.get("/users/me/trusted-devices", token=t["access_token"])).json()
    for d in devices:
        r = await env.client.delete(
            f"/api/v1/users/me/trusted-devices/{d['trusted_device_id']}",
            headers={"Authorization": f"Bearer {t['access_token']}"},
        )
        assert r.status_code == 204
    env.clock.advance(minutes=6)
    assert (await _unlock(env, t["refresh_token"], key)).status_code == 401


async def test_refused_while_the_pin_is_locked(env: Env) -> None:
    t = await _signed_in(env)
    key = (await _enable(env, t["access_token"])).json()["unlock_key"]
    for _ in range(5):
        await env.login(pin="111111")
    env.clock.advance(minutes=6)
    r = await _unlock(env, t["refresh_token"], key)
    assert r.status_code == 429
    env.clock.advance(minutes=15)
    # After the lock the session has been idle too long for anything but the key; it works.
    assert (await _unlock(env, t["refresh_token"], key)).status_code == 200
    assert PIN  # the PIN itself was never needed


async def test_key_is_bound_to_its_own_session(env: Env) -> None:
    a = await _signed_in(env)
    b = (await env.login()).json()
    key_a = (await _enable(env, a["access_token"])).json()["unlock_key"]
    env.clock.advance(minutes=6)
    # Session B never turned it on; A's key does not open it.
    assert (await _unlock(env, b["refresh_token"], key_a)).status_code == 401
