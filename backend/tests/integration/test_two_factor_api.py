"""Milestone AUTH-2 end to end against PostgreSQL (ADR-008, ADR-026).

Sign-up requires an authenticator; new devices need a code; trusted devices last 30 days;
recovery codes work once and trigger the payout hold; step-up approvals are single-use,
bound to action and session, and last 5 minutes; 5 wrong codes lock 2FA for 15 minutes.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import timedelta
from typing import Any

import pyotp
import pytest
import pytest_asyncio

from app.core.config import Settings
from tests.integration.test_auth_api import (  # noqa: F401  -- fixtures are used by name
    EMAIL,
    PHONE,
    PIN,
    Env,
    _code,
    _env,
    _sql,
    clean,
    migrated,
)

pytestmark = pytest.mark.integration


@pytest_asyncio.fixture
async def env(db_settings: Settings) -> AsyncIterator[Env]:
    async for e in _env(db_settings):
        yield e


async def _challenge(env: Env, identifier: str = PHONE) -> str:
    r = await env.login(identifier, trusted=False)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["mfa_required"] is True and body["enrolment_required"] is False
    return str(body["mfa_challenge_id"])


async def _verify(env: Env, cid: str, **codes: str) -> Any:
    return await env.post("/auth/mfa/verify", {"mfa_challenge_id": cid, **codes})


def _next_step(env: Env) -> None:
    """Move to the next 30-second step so a fresh code exists (codes work once)."""
    env.clock.advance(seconds=30)


async def _step_up(env: Env, access: str, action: str) -> Any:
    _next_step(env)
    return await env.post("/auth/step-up", {"action": action, "otp_code": env.totp()}, token=access)


# --- sign-up ---


@pytest.mark.asyncio
async def test_sign_up_gives_no_session_until_an_authenticator_is_added(env: Env) -> None:
    await env.post("/auth/register", {"phone": PHONE, "email": EMAIL, "pin": PIN})
    r = await env.post("/auth/verify-phone", {"phone": PHONE, "code": env.sms.last_code_for(PHONE)})
    body = r.json()
    assert set(body) == {"mfa_required", "mfa_challenge_id", "enrolment_required"}
    assert body["enrolment_required"] is True
    # Logging in before finishing gives the enrolment step again — never a session.
    r = await env.login(trusted=False)
    assert r.json()["enrolment_required"] is True and "access_token" not in r.json()


@pytest.mark.asyncio
async def test_enrolment_returns_session_recovery_codes_and_device_token(env: Env) -> None:
    body = await env.sign_up()
    assert len(body["recovery_codes"]) == 10
    assert body["device_token"] and body["access_token"]
    assert (await env.get("/users/me", body["access_token"])).status_code == 200


@pytest.mark.asyncio
async def test_restarting_enrolment_invalidates_the_first_secret(env: Env) -> None:
    await env.post("/auth/register", {"phone": PHONE, "email": EMAIL, "pin": PIN})
    cid = (
        await env.post("/auth/verify-phone", {"phone": PHONE, "code": env.sms.last_code_for(PHONE)})
    ).json()["mfa_challenge_id"]
    first = (await env.post("/auth/mfa/enrol/start", {"mfa_challenge_id": cid})).json()["secret"]
    second = (await env.post("/auth/mfa/enrol/start", {"mfa_challenge_id": cid})).json()["secret"]
    assert first != second
    r = await env.post(
        "/auth/mfa/enrol/confirm",
        {"mfa_challenge_id": cid, "otp_code": pyotp.TOTP(first).at(env.clock.now)},
    )
    assert _code(r) == "AUTH_401_INVALID_OTP"
    r = await env.post(
        "/auth/mfa/enrol/confirm",
        {"mfa_challenge_id": cid, "otp_code": pyotp.TOTP(second).at(env.clock.now)},
    )
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_enrolment_step_expires_after_ten_minutes(env: Env) -> None:
    await env.post("/auth/register", {"phone": PHONE, "email": EMAIL, "pin": PIN})
    cid = (
        await env.post("/auth/verify-phone", {"phone": PHONE, "code": env.sms.last_code_for(PHONE)})
    ).json()["mfa_challenge_id"]
    env.clock.advance(minutes=10)
    r = await env.post("/auth/mfa/enrol/start", {"mfa_challenge_id": cid})
    assert (r.status_code, _code(r)) == (410, "AUTH_410_CHALLENGE_EXPIRED")


@pytest.mark.asyncio
async def test_a_second_authenticator_cannot_be_enrolled_through_sign_up(env: Env) -> None:
    await env.sign_up()
    # A log-in challenge cannot be used to enrol (wrong purpose) ...
    cid = await _challenge(env)
    r = await env.post("/auth/mfa/enrol/start", {"mfa_challenge_id": cid})
    assert _code(r) == "AUTH_401_INVALID_OTP"


# --- log-in on new and trusted devices ---


@pytest.mark.asyncio
async def test_new_device_needs_a_code_then_becomes_trusted(env: Env) -> None:
    await env.sign_up()
    cid = await _challenge(env)
    _next_step(env)
    r = await _verify(env, cid, otp_code=env.totp())
    assert r.status_code == 200
    new_token = r.json()["device_token"]
    assert new_token and r.json()["access_token"]
    r = await env.post("/auth/login", {"identifier": PHONE, "pin": PIN, "device_token": new_token})
    assert "access_token" in r.json()  # PIN only, on the trusted device


@pytest.mark.asyncio
async def test_each_code_works_once(env: Env) -> None:
    await env.sign_up()
    _next_step(env)
    code = env.totp()
    assert (await _verify(env, await _challenge(env), otp_code=code)).status_code == 200
    r = await _verify(env, await _challenge(env), otp_code=code)
    assert _code(r) == "AUTH_401_INVALID_OTP"


@pytest.mark.asyncio
async def test_login_challenge_expires_in_five_minutes_and_works_once(env: Env) -> None:
    await env.sign_up()
    cid = await _challenge(env)
    env.clock.advance(minutes=5)
    r = await _verify(env, cid, otp_code=env.totp())
    assert (r.status_code, _code(r)) == (410, "AUTH_410_CHALLENGE_EXPIRED")
    cid = await _challenge(env)
    _next_step(env)
    assert (await _verify(env, cid, otp_code=env.totp())).status_code == 200
    _next_step(env)
    assert _code(await _verify(env, cid, otp_code=env.totp())) == "AUTH_401_INVALID_OTP"


@pytest.mark.asyncio
async def test_exactly_one_kind_of_code(env: Env) -> None:
    body = await env.sign_up()
    cid = await _challenge(env)
    r = await _verify(env, cid)
    assert _code(r) == "AUTH_401_INVALID_OTP"
    r = await _verify(env, cid, otp_code=env.totp(), recovery_code=body["recovery_codes"][0])
    assert _code(r) == "AUTH_401_INVALID_OTP"


@pytest.mark.asyncio
async def test_another_users_device_token_is_not_trust(env: Env) -> None:
    await env.sign_up()
    env.clock.advance(seconds=61)
    other = await env.sign_up(phone="+2348031112222", email="b@example.com")
    r = await env.post(
        "/auth/login", {"identifier": PHONE, "pin": PIN, "device_token": other["device_token"]}
    )
    assert r.json()["mfa_required"] is True


@pytest.mark.asyncio
async def test_trust_lasts_thirty_days(env: Env, db_settings: Settings) -> None:
    await env.sign_up()
    env.clock.advance(days=30)
    r = await env.login()
    assert r.json()["mfa_required"] is True


@pytest.mark.asyncio
async def test_removing_a_trusted_device(env: Env) -> None:
    body = await env.sign_up()
    rows = (await env.get("/users/me/trusted-devices", body["access_token"])).json()
    assert len(rows) == 1
    r = await env.client.delete(
        f"/api/v1/users/me/trusted-devices/{rows[0]['trusted_device_id']}",
        headers={"Authorization": f"Bearer {body['access_token']}"},
    )
    assert r.status_code == 204
    assert (await env.login()).json()["mfa_required"] is True


@pytest.mark.asyncio
async def test_cannot_remove_another_users_trusted_device(env: Env) -> None:
    a = await env.sign_up()
    env.clock.advance(seconds=61)
    b = await env.sign_up(phone="+2348031112222", email="b@example.com")
    b_device = (await env.get("/users/me/trusted-devices", b["access_token"])).json()[0]
    r = await env.client.delete(
        f"/api/v1/users/me/trusted-devices/{b_device['trusted_device_id']}",
        headers={"Authorization": f"Bearer {a['access_token']}"},
    )
    assert (r.status_code, _code(r)) == (404, "RES_404_NOT_FOUND")


# --- lock ---


@pytest.mark.asyncio
async def test_five_wrong_codes_lock_2fa_for_fifteen_minutes(env: Env) -> None:
    await env.sign_up()
    wrong = "000000" if env.totp() != "000000" else "111111"
    for _ in range(4):
        cid = await _challenge(env)
        assert _code(await _verify(env, cid, otp_code=wrong)) == "AUTH_401_INVALID_OTP"
    cid = await _challenge(env)
    r = await _verify(env, cid, otp_code=wrong)
    assert (r.status_code, _code(r)) == (429, "AUTH_429_RATE_LIMITED")
    _next_step(env)
    cid = await _challenge(env)
    assert _code(await _verify(env, cid, otp_code=env.totp())) == "AUTH_429_RATE_LIMITED"
    env.clock.advance(minutes=15)
    cid = await _challenge(env)
    assert (await _verify(env, cid, otp_code=env.totp())).status_code == 200


# --- recovery codes ---


@pytest.mark.asyncio
async def test_recovery_code_logs_in_once_and_triggers_the_hold(
    env: Env, db_settings: Settings
) -> None:
    body = await env.sign_up()
    code = body["recovery_codes"][0]
    r = await _verify(env, await _challenge(env), recovery_code=code.lower().replace("-", ""))
    assert r.status_code == 200
    assert r.json()["device_token"] is None  # a recovery log-in does not trust the device
    hold = await _sql(db_settings, "SELECT payout_hold_until FROM users")
    assert hold == env.clock.now + timedelta(hours=24)
    # Trust ended everywhere: the sign-up device now needs a code too.
    assert (await env.login()).json()["mfa_required"] is True
    # The same recovery code never works twice.
    r = await _verify(env, await _challenge(env), recovery_code=code)
    assert _code(r) == "AUTH_401_INVALID_OTP"


@pytest.mark.asyncio
async def test_recovery_code_of_another_user_is_refused(env: Env) -> None:
    await env.sign_up()
    env.clock.advance(seconds=61)
    other = await env.sign_up(phone="+2348031112222", email="b@example.com")
    r = await _verify(env, await _challenge(env), recovery_code=other["recovery_codes"][0])
    assert _code(r) == "AUTH_401_INVALID_OTP"


# --- step-up ---


@pytest.mark.asyncio
async def test_step_up_is_single_use_and_bound_to_its_action(env: Env) -> None:
    body = await env.sign_up()
    access = body["access_token"]
    r = await _step_up(env, access, "recovery_codes.regenerate")
    assert r.status_code == 200 and r.json()["expires_in_seconds"] == 300
    token = r.json()["step_up_token"]
    headers = {"Authorization": f"Bearer {access}", "X-Step-Up-Token": token}

    r = await env.client.post("/api/v1/users/me/recovery-codes", headers=headers)
    assert r.status_code == 200
    fresh = r.json()["recovery_codes"]
    assert len(fresh) == 10 and set(fresh).isdisjoint(body["recovery_codes"])

    r = await env.client.post("/api/v1/users/me/recovery-codes", headers=headers)
    assert (r.status_code, _code(r)) == (403, "AUTH_403_FORBIDDEN")  # used once

    other = (await _step_up(env, access, "trade.accept")).json()["step_up_token"]
    r = await env.client.post(
        "/api/v1/users/me/recovery-codes",
        headers={"Authorization": f"Bearer {access}", "X-Step-Up-Token": other},
    )
    assert _code(r) == "AUTH_403_FORBIDDEN"  # wrong action

    r = await env.client.post(
        "/api/v1/users/me/recovery-codes", headers={"Authorization": f"Bearer {access}"}
    )
    assert _code(r) == "AUTH_403_FORBIDDEN"  # none at all

    # Old recovery codes stopped working when new ones were issued.
    r = await _verify(env, await _challenge(env), recovery_code=body["recovery_codes"][1])
    assert _code(r) == "AUTH_401_INVALID_OTP"


@pytest.mark.asyncio
async def test_step_up_expires_after_five_minutes(env: Env) -> None:
    body = await env.sign_up()
    access = body["access_token"]
    token = (await _step_up(env, access, "recovery_codes.regenerate")).json()["step_up_token"]
    env.clock.advance(minutes=4)
    await env.get("/users/me", access)  # stay active
    env.clock.advance(minutes=1)
    r = await env.client.post(
        "/api/v1/users/me/recovery-codes",
        headers={"Authorization": f"Bearer {access}", "X-Step-Up-Token": token},
    )
    assert _code(r) == "AUTH_403_FORBIDDEN"


@pytest.mark.asyncio
async def test_step_up_is_bound_to_its_session(env: Env) -> None:
    body = await env.sign_up()
    second = (await env.login()).json()["access_token"]
    token = (await _step_up(env, body["access_token"], "recovery_codes.regenerate")).json()[
        "step_up_token"
    ]
    r = await env.client.post(
        "/api/v1/users/me/recovery-codes",
        headers={"Authorization": f"Bearer {second}", "X-Step-Up-Token": token},
    )
    assert _code(r) == "AUTH_403_FORBIDDEN"


@pytest.mark.asyncio
async def test_step_up_needs_a_session_and_a_known_action(env: Env) -> None:
    body = await env.sign_up()
    r = await env.post("/auth/step-up", {"action": "trade.accept", "otp_code": env.totp()})
    assert _code(r) == "AUTH_401_UNAUTHORIZED"
    r = await env.post(
        "/auth/step-up",
        {"action": "everything", "otp_code": env.totp()},
        token=body["access_token"],
    )
    assert _code(r) == "VALIDATION_ERROR"


@pytest.mark.asyncio
async def test_wrong_step_up_codes_count_toward_the_lock(env: Env) -> None:
    body = await env.sign_up()
    wrong = "000000" if env.totp() != "000000" else "111111"
    for _ in range(4):
        r = await env.post(
            "/auth/step-up",
            {"action": "trade.accept", "otp_code": wrong},
            token=body["access_token"],
        )
        assert _code(r) == "AUTH_401_INVALID_OTP"
    r = await env.post(
        "/auth/step-up", {"action": "trade.accept", "otp_code": wrong}, token=body["access_token"]
    )
    assert _code(r) == "AUTH_429_RATE_LIMITED"
    assert (
        _code(await _step_up(env, body["access_token"], "trade.accept")) == "AUTH_429_RATE_LIMITED"
    )


# --- replacing the authenticator ---


@pytest.mark.asyncio
async def test_replacing_the_authenticator(env: Env, db_settings: Settings) -> None:
    body = await env.sign_up()
    access = body["access_token"]
    old_secret = env.secrets[PHONE]
    token = (await _step_up(env, access, "mfa.change")).json()["step_up_token"]
    headers = {"Authorization": f"Bearer {access}", "X-Step-Up-Token": token}
    r = await env.client.post("/api/v1/users/me/mfa/replace/start", headers=headers)
    assert r.status_code == 200
    new_secret = r.json()["secret"]
    assert new_secret != old_secret

    r = await env.post(
        "/users/me/mfa/replace/confirm",
        {"otp_code": pyotp.TOTP(new_secret).at(env.clock.now)},
        token=access,
    )
    assert r.status_code == 204
    hold = await _sql(db_settings, "SELECT payout_hold_until FROM users")
    assert hold == env.clock.now + timedelta(hours=24)

    # Trust ended everywhere; the old authenticator no longer works, the new one does.
    assert (await env.login()).json()["mfa_required"] is True
    _next_step(env)
    cid = await _challenge(env)
    assert _code(await _verify(env, cid, otp_code=pyotp.TOTP(old_secret).at(env.clock.now))) == (
        "AUTH_401_INVALID_OTP"
    )
    _next_step(env)
    cid = await _challenge(env)
    r = await _verify(env, cid, otp_code=pyotp.TOTP(new_secret).at(env.clock.now))
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_replacing_needs_a_step_up(env: Env) -> None:
    body = await env.sign_up()
    r = await env.post("/users/me/mfa/replace/start", token=body["access_token"])
    assert _code(r) == "AUTH_403_FORBIDDEN"


# --- storage ---


@pytest.mark.asyncio
async def test_secrets_are_sealed_and_codes_hashed(env: Env, db_settings: Settings) -> None:
    body = await env.sign_up()
    sealed = await _sql(db_settings, "SELECT encode(secret_sealed, 'escape') FROM mfa_factors")
    assert env.secrets[PHONE] not in sealed
    digests = await _sql(db_settings, "SELECT string_agg(code_digest, ',') FROM recovery_codes")
    for code in body["recovery_codes"]:
        assert code.replace("-", "") not in digests
    stored = await _sql(db_settings, "SELECT token_hash FROM trusted_devices")
    assert stored != body["device_token"] and len(stored) == 64


@pytest.mark.asyncio
async def test_a_secret_copied_to_another_account_does_not_work(
    env: Env, db_settings: Settings
) -> None:
    await env.sign_up()
    env.clock.advance(seconds=61)
    await env.sign_up(phone="+2348031112222", email="b@example.com")
    # Copy A's sealed secret onto B's factor: sealing is bound to the user, so B's
    # log-in can no longer verify any code, including A's.
    await _sql(
        db_settings,
        "UPDATE mfa_factors SET secret_sealed = (SELECT f.secret_sealed FROM mfa_factors f "
        "JOIN users u ON u.id = f.user_id WHERE u.phone = :a) "
        "WHERE user_id = (SELECT id FROM users WHERE phone = :b)",
        a=PHONE,
        b="+2348031112222",
    )
    _next_step(env)
    cid = await _challenge(env, "+2348031112222")
    assert _code(await _verify(env, cid, otp_code=env.totp(PHONE))) == "AUTH_401_INVALID_OTP"
