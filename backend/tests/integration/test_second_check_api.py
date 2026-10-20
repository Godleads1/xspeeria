"""ADR-054 end to end against PostgreSQL: the second check after the PIN.

Sign-up proves the email with a code; a new phone needs SMS + email codes before the
identity check and a face check after it; trusted phones (30 days) skip it; step-ups use
fingerprint/Face ID on a trusted phone, or a face check / email code; Forgot PIN needs the
SMS code plus a face check or an email code; 5 failures lock checks for 15 minutes; alerts
are emailed. The face provider is a recorder; Didit is never contacted.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

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

pytestmark = [pytest.mark.integration, pytest.mark.asyncio]

OTHER = ("+2348031112222", "b@example.com")
NEW_PIN = "736195"


@pytest_asyncio.fixture
async def env(db_settings: Settings) -> AsyncIterator[Env]:
    async for e in _env(db_settings):
        yield e


async def _kyc_approved(db_settings: Settings, phone: str = PHONE) -> None:
    await _sql(
        db_settings,
        "INSERT INTO kyc_cases (id, user_id, provider, country, provider_session_id, "
        "provider_status, status, legal_name, date_of_birth, decided_at, created_at, updated_at) "
        "SELECT gen_random_uuid(), id, 'didit', 'NG', 'kyc-1', 'Approved', 'approved', "
        "'David Test', DATE '1990-01-01', now(), now(), now() FROM users WHERE phone = :p",
        p=phone,
    )


async def _new_phone(env: Env, identifier: str = PHONE) -> dict[str, Any]:
    r = await env.login(identifier, trusted=False)
    assert r.status_code == 200, r.text
    body: dict[str, Any] = r.json()
    assert body["check_required"] is True and "access_token" not in body
    return body


async def _codes(env: Env, check: dict[str, Any], **codes: str) -> Any:
    return await env.post(f"/auth/checks/{check['check_id']}/codes", codes)


def _wrong(code: str) -> str:
    return "000000" if code != "000000" else "111111"


# --- sign-up ---


async def test_sign_up_needs_the_email_code_before_any_session(env: Env) -> None:
    await env.post("/auth/register", {"phone": PHONE, "email": EMAIL, "pin": PIN})
    r = await env.post("/auth/verify-phone", {"phone": PHONE, "code": env.sms.last_code_for(PHONE)})
    check = r.json()
    assert check | {"check_id": None} == {
        "check_required": True,
        "check_id": None,
        "purpose": "signup",
        "method": "email",
        "email_hint": "d***@example.com",
        "phone_hint": None,
    }
    assert _code(await _codes(env, check, email_code=_wrong(env.email_code()))) == (
        "AUTH_401_INVALID_OTP"
    )
    r = await _codes(env, check, email_code=env.email_code())
    assert r.status_code == 200 and r.json()["device_token"]
    # Used once.
    assert _code(await _codes(env, check, email_code=env.email_code())) == "AUTH_401_INVALID_OTP"


async def test_sign_up_is_off_without_an_email_sender(env: Env) -> None:
    env.runtime.email = None
    r = await env.post("/auth/register", {"phone": PHONE, "email": EMAIL, "pin": PIN})
    assert (r.status_code, _code(r)) == (503, "SYS_503_SERVICE_UNAVAILABLE")
    assert env.sms.sent == []


async def test_unfinished_sign_up_finishes_at_log_in(env: Env) -> None:
    await env.post("/auth/register", {"phone": PHONE, "email": EMAIL, "pin": PIN})
    await env.post("/auth/verify-phone", {"phone": PHONE, "code": env.sms.last_code_for(PHONE)})
    check = await _new_phone(env)
    assert check["method"] == "sms_email"


# --- log-in on a new phone, before and after the identity check ---


async def test_new_phone_before_kyc_needs_sms_and_email_codes(env: Env) -> None:
    await env.sign_up()
    env.clock.advance(seconds=61)
    check = await _new_phone(env)
    assert (check["method"], check["phone_hint"]) == ("sms_email", "***3838")
    sms = env.sms.last_code_for(PHONE)
    assert sms is not None
    # Either code alone is not enough.
    assert _code(await _codes(env, check, email_code=env.email_code())) == "AUTH_401_INVALID_OTP"
    r = await _codes(env, check, email_code=env.email_code(), sms_code=sms)
    assert r.status_code == 200
    token = r.json()["device_token"]
    assert "new_device_sign_in" in env.email.alerts_for(EMAIL)
    r = await env.post("/auth/login", {"identifier": PHONE, "pin": PIN, "device_token": token})
    assert "access_token" in r.json()  # PIN only on the now-trusted phone


async def test_new_phone_after_kyc_needs_a_face_check(env: Env, db_settings: Settings) -> None:
    await env.sign_up()
    await _kyc_approved(db_settings)
    check = await _new_phone(env)
    assert (check["method"], check["email_hint"]) == ("face", None)
    cid = check["check_id"]
    # Codes cannot finish a face check, and the result needs the check started first.
    assert _code(await _codes(env, check, email_code="123456")) == "AUTH_401_INVALID_OTP"
    r = await env.post(f"/auth/checks/{cid}/face/result", {})
    assert (r.status_code, _code(r)) == (409, "AUTH_409_FACE_CHECK_NOT_STARTED")
    r = await env.post(f"/auth/checks/{cid}/face")
    assert r.status_code == 200 and r.json()["url"].startswith("https://")
    user_id = await _sql(db_settings, "SELECT id::text FROM users WHERE phone = :p", p=PHONE)
    assert env.face.started[-1][1] == user_id  # matched against this user's identity check
    env.face.result = "pending"
    r = await env.post(f"/auth/checks/{cid}/face/result", {})
    assert (r.status_code, _code(r)) == (409, "AUTH_409_FACE_CHECK_PENDING")
    env.face.result = "approved"
    r = await env.post(f"/auth/checks/{cid}/face/result", {})
    assert r.status_code == 200 and r.json()["device_token"]
    assert _code(await env.post(f"/auth/checks/{cid}/face/result", {})) == "AUTH_401_INVALID_OTP"


async def test_a_declined_face_check_ends_that_check(env: Env, db_settings: Settings) -> None:
    await env.sign_up()
    await _kyc_approved(db_settings)
    cid = (await _new_phone(env))["check_id"]
    await env.post(f"/auth/checks/{cid}/face")
    env.face.result = "declined"
    r = await env.post(f"/auth/checks/{cid}/face/result", {})
    assert (r.status_code, _code(r)) == (401, "AUTH_401_FACE_CHECK_FAILED")
    env.face.result = "approved"
    r = await env.post(f"/auth/checks/{cid}/face/result", {})
    assert _code(r) == "AUTH_401_FACE_CHECK_FAILED"  # a new log-in is needed


async def test_no_face_on_file_is_reported(env: Env, db_settings: Settings) -> None:
    await env.sign_up()
    await _kyc_approved(db_settings)
    cid = (await _new_phone(env))["check_id"]
    env.face.no_face = True
    r = await env.post(f"/auth/checks/{cid}/face")
    assert (r.status_code, _code(r)) == (409, "AUTH_409_NO_FACE_ON_FILE")


async def test_face_check_off_answers_503(env: Env, db_settings: Settings) -> None:
    await env.sign_up()
    await _kyc_approved(db_settings)
    env.runtime.face = None
    r = await env.login(trusted=False)
    assert (r.status_code, _code(r)) == (503, "SYS_503_SERVICE_UNAVAILABLE")


async def test_check_expires(env: Env) -> None:
    await env.sign_up()
    env.clock.advance(seconds=61)
    check = await _new_phone(env)
    sms = env.sms.last_code_for(PHONE) or ""
    env.clock.advance(minutes=10)
    r = await _codes(env, check, email_code=env.email_code(), sms_code=sms)
    assert (r.status_code, _code(r)) == (410, "AUTH_410_CHALLENGE_EXPIRED")


async def test_another_users_device_token_is_not_trust(env: Env) -> None:
    await env.sign_up()
    env.clock.advance(seconds=61)
    other = await env.sign_up(*OTHER)
    r = await env.post(
        "/auth/login", {"identifier": PHONE, "pin": PIN, "device_token": other["device_token"]}
    )
    assert r.json()["check_required"] is True


async def test_trust_lasts_thirty_days(env: Env) -> None:
    await env.sign_up()
    env.clock.advance(days=30)
    assert (await env.login()).json()["check_required"] is True


async def test_removing_a_trusted_device(env: Env) -> None:
    body = await env.sign_up()
    rows = (await env.get("/users/me/trusted-devices", body["access_token"])).json()
    assert len(rows) == 1
    r = await env.client.delete(
        f"/api/v1/users/me/trusted-devices/{rows[0]['trusted_device_id']}",
        headers={"Authorization": f"Bearer {body['access_token']}"},
    )
    assert r.status_code == 204
    assert (await env.login()).json()["check_required"] is True


async def test_cannot_remove_another_users_trusted_device(env: Env) -> None:
    a = await env.sign_up()
    env.clock.advance(seconds=61)
    b = await env.sign_up(*OTHER)
    b_device = (await env.get("/users/me/trusted-devices", b["access_token"])).json()[0]
    r = await env.client.delete(
        f"/api/v1/users/me/trusted-devices/{b_device['trusted_device_id']}",
        headers={"Authorization": f"Bearer {a['access_token']}"},
    )
    assert (r.status_code, _code(r)) == (404, "RES_404_NOT_FOUND")


# --- lock and limits ---


async def test_five_failures_lock_checks_for_fifteen_minutes(env: Env) -> None:
    await env.sign_up()
    env.clock.advance(seconds=61)
    check = await _new_phone(env)
    for _ in range(4):
        assert _code(await _codes(env, check, email_code="000000", sms_code="000000")) == (
            "AUTH_401_INVALID_OTP"
        )
    r = await _codes(env, check, email_code="000000", sms_code="000000")
    assert (r.status_code, _code(r)) == (429, "AUTH_429_RATE_LIMITED")
    assert "checks_locked" in env.email.alerts_for(EMAIL)
    # While locked, no new check is started (no SMS or email is sent).
    sent = len(env.email.sent)
    assert _code(await env.login(trusted=False)) == "AUTH_429_RATE_LIMITED"
    assert len(env.email.sent) == sent
    env.clock.advance(minutes=15)
    check = await _new_phone(env)
    sms = env.sms.last_code_for(PHONE) or ""
    r = await _codes(env, check, email_code=env.email_code(), sms_code=sms)
    assert r.status_code == 200


async def test_checks_per_hour_are_limited(env: Env) -> None:
    await env.sign_up()  # 1 check
    for _ in range(4):
        await _new_phone(env)
    r = await env.login(trusted=False)
    assert (r.status_code, _code(r)) == (429, "AUTH_429_RATE_LIMITED")
    env.clock.advance(hours=1, seconds=1)
    assert (await env.login(trusted=False)).status_code == 200


async def test_a_check_id_is_not_a_step_up_and_vice_versa(env: Env) -> None:
    body = await env.sign_up()
    env.clock.advance(seconds=61)
    login_check = await _new_phone(env)
    access = body["access_token"]
    r = await env.post(
        f"/auth/step-up/checks/{login_check['check_id']}/code",
        {"email_code": env.email_code()},
        token=access,
    )
    assert _code(r) == "AUTH_401_INVALID_OTP"
    step = (await env.post("/auth/step-up/checks", {"action": "pin.change"}, token=access)).json()
    r = await _codes(env, step, email_code=env.email_code())
    assert _code(r) == "AUTH_401_INVALID_OTP"


# --- step-up ---


async def _pin_change(env: Env, access: str, approval: str | None, current: str = PIN) -> Any:
    headers = {"Authorization": f"Bearer {access}"}
    if approval:
        headers["X-Step-Up-Token"] = approval
    return await env.client.post(
        "/api/v1/users/me/pin",
        json={"current_pin": current, "new_pin": NEW_PIN},
        headers=headers,
    )


async def test_fingerprint_step_up_is_single_use_and_bound_to_its_action(env: Env) -> None:
    body = await env.sign_up()
    access = body["access_token"]
    other = await env.approve(access, "trade.accept")
    assert _code(await _pin_change(env, access, other)) == "AUTH_403_FORBIDDEN"  # wrong action
    assert _code(await _pin_change(env, access, None)) == "AUTH_403_FORBIDDEN"  # none
    token = await env.approve(access, "pin.change")
    r = await _pin_change(env, access, token, current="111111")
    assert _code(r) == "AUTH_401_INVALID_CREDENTIALS"  # spent, even though the PIN was wrong
    assert _code(await _pin_change(env, access, token)) == "AUTH_403_FORBIDDEN"
    assert (
        await _pin_change(env, access, await env.approve(access, "pin.change"))
    ).status_code == (204)
    assert "pin_changed" in env.email.alerts_for(EMAIL)


async def test_step_up_expires_and_is_bound_to_its_session(env: Env) -> None:
    body = await env.sign_up()
    access = body["access_token"]
    second = (await env.login()).json()["access_token"]
    token = await env.approve(access, "pin.change")
    assert _code(await _pin_change(env, second, token)) == "AUTH_403_FORBIDDEN"
    env.clock.advance(minutes=4)
    await env.get("/users/me", access)
    env.clock.advance(minutes=1)
    assert _code(await _pin_change(env, access, token)) == "AUTH_403_FORBIDDEN"


async def test_fingerprint_needs_it_turned_on_and_the_right_key(env: Env) -> None:
    body = await env.sign_up()
    access = body["access_token"]
    r = await env.post(
        "/auth/step-up", {"action": "pin.change", "unlock_key": "x" * 43}, token=access
    )
    assert (r.status_code, _code(r)) == (403, "AUTH_403_BIOMETRIC_OFF")
    await env.approve(access, "trade.accept")  # turns it on
    for _ in range(4):
        r = await env.post(
            "/auth/step-up", {"action": "pin.change", "unlock_key": "y" * 43}, token=access
        )
        assert _code(r) == "AUTH_401_BIOMETRIC_FAILED"
    r = await env.post(
        "/auth/step-up", {"action": "pin.change", "unlock_key": "y" * 43}, token=access
    )
    assert _code(r) == "AUTH_429_RATE_LIMITED"


async def test_fingerprint_stops_when_the_phone_is_no_longer_trusted(env: Env) -> None:
    body = await env.sign_up()
    access = body["access_token"]
    await env.approve(access, "trade.accept")
    device = (await env.get("/users/me/trusted-devices", access)).json()[0]
    await env.client.delete(
        f"/api/v1/users/me/trusted-devices/{device['trusted_device_id']}",
        headers={"Authorization": f"Bearer {access}"},
    )
    r = await env.post(
        "/auth/step-up",
        {"action": "pin.change", "unlock_key": env.unlock_keys[access]},
        token=access,
    )
    assert _code(r) == "AUTH_403_BIOMETRIC_OFF"


async def test_step_up_by_email_code_before_kyc(env: Env) -> None:
    body = await env.sign_up()
    access = body["access_token"]
    r = await env.post("/auth/step-up/checks", {"action": "pin.change"}, token=access)
    check = r.json()
    assert (check["purpose"], check["method"]) == ("step_up", "email")
    url = f"/auth/step-up/checks/{check['check_id']}/code"
    assert _code(await env.post(url, {"email_code": "000000"}, token=access)) == (
        "AUTH_401_INVALID_OTP"
    )
    r = await env.post(url, {"email_code": env.email_code()}, token=access)
    assert r.status_code == 200 and r.json()["action"] == "pin.change"
    assert (await _pin_change(env, access, r.json()["step_up_token"])).status_code == 204


async def test_step_up_by_face_after_kyc(env: Env, db_settings: Settings) -> None:
    body = await env.sign_up()
    await _kyc_approved(db_settings)
    access = body["access_token"]
    check = (await env.post("/auth/step-up/checks", {"action": "pin.change"}, token=access)).json()
    assert check["method"] == "face"
    base = f"/auth/step-up/checks/{check['check_id']}/face"
    # Another session of the same user cannot use this check.
    second = (await env.login()).json()["access_token"]
    assert _code(await env.post(base, token=second)) == "AUTH_401_INVALID_OTP"
    assert _code(await env.post(f"/auth/checks/{check['check_id']}/face")) == "AUTH_401_INVALID_OTP"
    assert (await env.post(base, token=access)).status_code == 200
    r = await env.post(f"{base}/result", token=access)
    assert r.status_code == 200
    assert (await _pin_change(env, access, r.json()["step_up_token"])).status_code == 204


async def test_step_up_needs_a_session_and_a_known_action(env: Env) -> None:
    body = await env.sign_up()
    r = await env.post("/auth/step-up/checks", {"action": "trade.accept"})
    assert _code(r) == "AUTH_401_UNAUTHORIZED"
    for action in ("everything", "mfa.change", "recovery_codes.regenerate"):
        r = await env.post("/auth/step-up/checks", {"action": action}, token=body["access_token"])
        assert _code(r) == "VALIDATION_ERROR"


# --- Forgot PIN ---


async def _reset_check(env: Env) -> dict[str, Any]:
    env.clock.advance(seconds=61)
    assert (await env.post("/auth/pin-reset/start", {"phone": PHONE})).status_code == 202
    r = await env.post(
        "/auth/pin-reset/verify", {"phone": PHONE, "code": env.sms.last_code_for(PHONE)}
    )
    assert r.status_code == 200, r.text
    body: dict[str, Any] = r.json()
    return body


async def test_forgot_pin_before_kyc_sms_then_email(env: Env, db_settings: Settings) -> None:
    body = await env.sign_up()
    check = await _reset_check(env)
    assert (check["purpose"], check["method"]) == ("pin_reset", "email")
    r = await env.post(
        "/auth/pin-reset/confirm",
        {"check_id": check["check_id"], "new_pin": NEW_PIN, "email_code": "000000"},
    )
    assert _code(r) == "AUTH_401_INVALID_OTP"
    r = await env.post(
        "/auth/pin-reset/confirm",
        {"check_id": check["check_id"], "new_pin": NEW_PIN, "email_code": env.email_code()},
    )
    assert r.status_code == 204
    assert (await env.get("/users/me", body["access_token"])).status_code == 401
    assert (await env.login(pin=NEW_PIN)).json()["check_required"] is True  # trust forgotten
    assert "pin_reset" in env.email.alerts_for(EMAIL)


async def test_forgot_pin_after_kyc_sms_then_face(env: Env, db_settings: Settings) -> None:
    await env.sign_up()
    await _kyc_approved(db_settings)
    check = await _reset_check(env)
    assert check["method"] == "face"
    confirm = {"check_id": check["check_id"], "new_pin": NEW_PIN}
    r = await env.post("/auth/pin-reset/confirm", confirm)
    assert _code(r) == "AUTH_409_FACE_CHECK_NOT_STARTED"
    assert (await env.post(f"/auth/checks/{check['check_id']}/face")).status_code == 200
    assert (await env.post("/auth/pin-reset/confirm", confirm)).status_code == 204
    assert (await env.post("/auth/pin-reset/confirm", confirm)).status_code == 401


async def test_forgot_pin_wrong_sms_code_and_weak_pin(env: Env) -> None:
    await env.sign_up()
    env.clock.advance(seconds=61)
    await env.post("/auth/pin-reset/start", {"phone": PHONE})
    r = await env.post("/auth/pin-reset/verify", {"phone": PHONE, "code": "000000"})
    assert _code(r) == "AUTH_401_INVALID_OTP"
    check = await _reset_check(env)
    r = await env.post(
        "/auth/pin-reset/confirm",
        {"check_id": check["check_id"], "new_pin": "123456", "email_code": env.email_code()},
    )
    assert _code(r) == "VAL_422_WEAK_PASSWORD"


# --- storage ---


async def test_codes_are_stored_only_as_keyed_digests(env: Env, db_settings: Settings) -> None:
    await env.sign_up()
    env.clock.advance(seconds=61)
    await _new_phone(env)
    stored = await _sql(
        db_settings,
        "SELECT concat_ws('|', email_code_digest, sms_code_digest) FROM verification_checks "
        "WHERE purpose = 'login'",
    )
    assert env.email_code() not in stored and (env.sms.last_code_for(PHONE) or "") not in stored
    assert len(stored) == 129
