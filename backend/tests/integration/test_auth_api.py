"""Milestones AUTH-1 and AUTH-2 end to end, over HTTP, against PostgreSQL (ADR-024/025/026).

Every sign-up ends with a code sent to the email (ADR-054); ``Env.sign_up`` does that and
keeps the device token, so later log-ins in these tests are on a trusted device unless a
test says otherwise. Second-check cases live in ``test_second_check_api.py``.

Normal, failure and abuse cases for sign-up, log-in, refresh, idle and 7-day limits,
log-out, device sessions, rate limits and the logging rule. The clock is injected, the SMS
sender records instead of sending, and PIN hashing uses cheap parameters for speed (the
production parameters are asserted in the unit suite).
"""

from __future__ import annotations

import base64
import logging
from collections.abc import AsyncIterator, Iterator
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
import pytest_asyncio
from alembic import command
from alembic.config import Config
from httpx import ASGITransport, AsyncClient, Response
from sqlalchemy import text

from app.core.auth_tokens import TokenKeys
from app.core.config import Settings
from app.core.mfa import SecretBox
from app.core.pin_hashing import PinHasher
from app.core.rate_limit import SlidingWindowLimiter
from app.db.session import build_engine, dispose_engine
from app.domain.auth_rules import MAX_PIN_TRIES, PIN_LOCK
from app.main import create_app
from app.providers.email import RecordingEmailSender
from app.providers.face import RecordingFaceCheck
from app.providers.sms import RecordingSmsSender
from app.services.auth import AuthRuntime
from tests.integration.test_migrations import ALEMBIC_INI, MIGRATIONS_DIR

pytestmark = pytest.mark.integration

T0 = datetime(2026, 10, 18, 9, 0, tzinfo=UTC)
#: A throwaway signing key made at import time (no secret-shaped literal in the repo).
KEY = "t" * 48
#: Throwaway sealing key, built at import time.
MFA_KEY = base64.b64encode(bytes(range(32))).decode()
PHONE = "+2348038383838"
EMAIL = "david@example.com"
PIN = "482613"
TABLES = (
    "staff_audit_log, staff_sessions, staff_codes, staff_accounts, "
    "tier_checks, offer_queue_entries, reversals, dispute_messages, disputes, verification_checks, "
    "push_deliveries, push_tokens, "
    "notifications, kyc_webhook_events, "
    "kyc_cases, "
    "outbox_messages, reconciliation_exceptions, settlement_holds, pending_events, "
    "settlement_events, webhook_receipts, payout_executions, settlement_legs, settlements, "
    "transactions, partners, "
    "match_payout_selections, beneficiaries, matches, idempotency_records, offers, offer_groups, "
    "step_up_grants, trusted_devices, recovery_codes, mfa_challenges, mfa_factors, "
    "auth_refresh_tokens, auth_sessions, phone_verifications, users"
)


class Clock:
    def __init__(self) -> None:
        self.now = T0

    def __call__(self) -> datetime:
        return self.now

    def advance(self, **kw: float) -> None:
        self.now += timedelta(**kw)


@pytest.fixture(scope="module", autouse=True)
def migrated(database_url: str) -> Iterator[None]:
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("script_location", str(MIGRATIONS_DIR))
    config.attributes["database_url"] = database_url
    # Round-trip tests remove CD3 on their own throwaway database (ADR-028, H9).
    config.attributes["cd3_downgrade"] = "authorized"
    config.attributes["records_downgrade"] = "authorized"
    command.upgrade(config, "head")
    yield


@pytest_asyncio.fixture(autouse=True)
async def clean(db_settings: Settings) -> AsyncIterator[None]:
    engine = build_engine(db_settings)
    try:
        async with engine.begin() as conn:
            await conn.execute(text(f"TRUNCATE {TABLES}"))
        yield
    finally:
        await engine.dispose()
        await dispose_engine()


def _runtime(clock: Clock, sms: RecordingSmsSender | None, address_limit: int) -> AuthRuntime:
    return AuthRuntime(
        keys=TokenKeys(KEY),
        secret_box=SecretBox(MFA_KEY),
        hasher=PinHasher(memory_kib=1024, iterations=1),
        sms=sms,
        clock=clock,
        address_limiter=SlidingWindowLimiter(limit=address_limit, window=timedelta(minutes=1)),
        unknown_identifier_limiter=SlidingWindowLimiter(limit=MAX_PIN_TRIES, window=PIN_LOCK),
        email=RecordingEmailSender(),
        face=RecordingFaceCheck(),
    )


class Env:
    def __init__(self, client: AsyncClient, clock: Clock, sms: RecordingSmsSender) -> None:
        self.client, self.clock, self.sms = client, clock, sms
        #: Per account (phone and email): trusted-device token.
        self.device_tokens: dict[str, str] = {}
        #: Per access token: the fingerprint/Face ID key for that session.
        self.unlock_keys: dict[str, str] = {}

    @property
    def runtime(self) -> AuthRuntime:
        app = self.client._transport.app  # type: ignore[attr-defined]
        runtime: AuthRuntime = app.state.auth
        return runtime

    @property
    def email(self) -> RecordingEmailSender:
        sender = self.runtime.email
        assert isinstance(sender, RecordingEmailSender)
        return sender

    @property
    def face(self) -> RecordingFaceCheck:
        provider = self.runtime.face
        assert isinstance(provider, RecordingFaceCheck)
        return provider

    def email_code(self, email: str = EMAIL) -> str:
        code = self.email.last_code_for(email)
        assert code is not None
        return code

    @staticmethod
    def _key(identifier: str) -> str:
        return identifier.replace(" ", "").lower()

    async def approve(self, token: str, action: str, identifier: str = PHONE) -> str:
        """One step-up approval, the everyday way: fingerprint/Face ID on a trusted phone."""
        key = self.unlock_keys.get(token)
        if key is None:
            r = await self.post(
                "/auth/biometric",
                {"device_token": self.device_tokens[self._key(identifier)]},
                token=token,
            )
            assert r.status_code == 200, r.text
            key = self.unlock_keys[token] = str(r.json()["unlock_key"])
        r = await self.post("/auth/step-up", {"action": action, "unlock_key": key}, token=token)
        assert r.status_code == 200, r.text
        return str(r.json()["step_up_token"])

    async def post(
        self, path: str, body: dict[str, Any] | None = None, token: str | None = None
    ) -> Response:
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        return await self.client.post(f"/api/v1{path}", json=body, headers=headers)

    async def get(self, path: str, token: str | None = None) -> Response:
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        return await self.client.get(f"/api/v1{path}", headers=headers)

    async def sign_up(
        self, phone: str = PHONE, email: str = EMAIL, pin: str = PIN
    ) -> dict[str, Any]:
        r = await self.post("/auth/register", {"phone": phone, "email": email, "pin": pin})
        assert r.status_code == 201, r.text
        code = self.sms.last_code_for(phone)
        assert code is not None
        r = await self.post("/auth/verify-phone", {"phone": phone, "code": code})
        assert r.status_code == 200, r.text
        check = r.json()
        assert check["check_required"] is True and check["method"] == "email"
        r = await self.post(
            f"/auth/checks/{check['check_id']}/codes", {"email_code": self.email_code(email)}
        )
        assert r.status_code == 200, r.text
        body: dict[str, Any] = r.json()
        for key in (self._key(phone), self._key(email)):
            self.device_tokens[key] = body["device_token"]
        return body

    async def login(
        self,
        identifier: str = PHONE,
        pin: str = PIN,
        device: str | None = None,
        *,
        trusted: bool = True,
    ) -> Response:
        """Log in; on a trusted device (the default) this returns tokens directly."""
        body: dict[str, Any] = {"identifier": identifier, "pin": pin}
        if device:
            body["device_id"] = device
        token = self.device_tokens.get(self._key(identifier))
        if trusted and token:
            body["device_token"] = token
        return await self.post("/auth/login", body)


async def _env(
    db_settings: Settings, *, sms: bool = True, address_limit: int = 10_000
) -> AsyncIterator[Env]:
    clock = Clock()
    recorder = RecordingSmsSender()
    settings = Settings(_env_file=None, database_url=db_settings.database_url)  # type: ignore[call-arg]
    app = create_app(
        settings, auth_runtime=_runtime(clock, recorder if sms else None, address_limit)
    )
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield Env(client, clock, recorder)


@pytest_asyncio.fixture
async def env(db_settings: Settings) -> AsyncIterator[Env]:
    async for e in _env(db_settings):
        yield e


def _code(r: Response) -> str:
    return str(r.json()["error"]["code"])


async def _sql(db_settings: Settings, sql: str, **params: Any) -> Any:
    engine = build_engine(db_settings)
    try:
        async with engine.begin() as conn:
            result = await conn.execute(text(sql), params)
            return result.scalar() if result.returns_rows else None
    finally:
        await engine.dispose()


# --- sign-up ---


@pytest.mark.asyncio
async def test_sign_up_verify_and_read_my_profile(env: Env) -> None:
    tokens = await env.sign_up()
    assert tokens["check_required"] is False and tokens["token_type"] == "bearer"
    r = await env.get("/users/me", tokens["access_token"])
    assert r.status_code == 200
    assert r.json() | {"user_id": None, "created_at": None} == {
        "user_id": None,
        "created_at": None,
        "phone": PHONE,
        "email": EMAIL,
        "status": "active",
        # ADR-055: no approved identity check yet, so no name, date of birth or gender.
        "legal_name": None,
        "date_of_birth": None,
        "gender": None,
    }


@pytest.mark.asyncio
async def test_register_response_carries_nothing_identifying(env: Env) -> None:
    r = await env.post("/auth/register", {"phone": PHONE, "email": EMAIL, "pin": PIN})
    assert r.status_code == 201 and r.json() == {"status": "pending_verification"}


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("body", "status", "code"),
    [
        ({"phone": "08038383838", "email": EMAIL, "pin": PIN}, 422, "VAL_422_INVALID_PHONE"),
        ({"phone": "+２３４8038383838", "email": EMAIL, "pin": PIN}, 422, "VAL_422_INVALID_PHONE"),
        ({"phone": PHONE, "email": EMAIL, "pin": "123456"}, 422, "VAL_422_WEAK_PASSWORD"),
        ({"phone": PHONE, "email": EMAIL, "pin": "4826"}, 422, "VAL_422_WEAK_PASSWORD"),
        ({"phone": PHONE, "email": "nope", "pin": PIN}, 422, "VALIDATION_ERROR"),
        # Unknown fields are refused, never silently ignored (no mass assignment).
        ({"phone": PHONE, "email": EMAIL, "pin": PIN, "status": "active"}, 422, "VALIDATION_ERROR"),
    ],
)
async def test_register_validation(env: Env, body: dict[str, str], status: int, code: str) -> None:
    r = await env.post("/auth/register", body)
    assert (r.status_code, _code(r)) == (status, code)
    assert env.sms.sent == []


@pytest.mark.asyncio
async def test_validation_errors_do_not_echo_the_pin(env: Env) -> None:
    r = await env.post("/auth/register", {"phone": PHONE, "email": "nope", "pin": "739152", "x": 1})
    assert "739152" not in r.text


@pytest.mark.asyncio
async def test_unverified_account_cannot_log_in(env: Env) -> None:
    await env.post("/auth/register", {"phone": PHONE, "email": EMAIL, "pin": PIN})
    r = await env.login()
    assert (r.status_code, _code(r)) == (401, "AUTH_401_INVALID_CREDENTIALS")


@pytest.mark.asyncio
async def test_resend_wait_then_only_the_newest_code_works(env: Env) -> None:
    body = {"phone": PHONE, "email": EMAIL, "pin": PIN}
    assert (await env.post("/auth/register", body)).status_code == 201
    first = env.sms.last_code_for(PHONE)
    r = await env.post("/auth/register", body)
    assert (r.status_code, _code(r)) == (429, "AUTH_429_RATE_LIMITED")
    assert r.json()["error"]["details"]["retry_after_seconds"] == 60
    env.clock.advance(seconds=61)
    assert (await env.post("/auth/register", body)).status_code == 201
    second = env.sms.last_code_for(PHONE)
    if first != second:
        r = await env.post("/auth/verify-phone", {"phone": PHONE, "code": first})
        assert _code(r) == "AUTH_401_INVALID_OTP"
    r = await env.post("/auth/verify-phone", {"phone": PHONE, "code": second})
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_sms_limit_five_per_hour_and_ten_per_day(env: Env) -> None:
    body = {"phone": PHONE, "email": EMAIL, "pin": PIN}
    for _ in range(5):
        assert (await env.post("/auth/register", body)).status_code == 201
        env.clock.advance(seconds=61)
    r = await env.post("/auth/register", body)
    assert (r.status_code, _code(r)) == (429, "AUTH_429_RATE_LIMITED")
    assert len(env.sms.sent) == 5
    env.clock.advance(hours=1)
    for _ in range(5):
        assert (await env.post("/auth/register", body)).status_code == 201
        env.clock.advance(seconds=61)
    env.clock.advance(hours=1)
    r = await env.post("/auth/register", body)
    assert (r.status_code, _code(r)) == (429, "AUTH_429_RATE_LIMITED")  # 10 in 24 hours
    env.clock.advance(hours=23)
    assert (await env.post("/auth/register", body)).status_code == 201


@pytest.mark.asyncio
async def test_registered_number_answers_like_a_new_one_and_sends_nothing(env: Env) -> None:
    await env.sign_up()
    env.clock.advance(seconds=61)
    sent_before = len(env.sms.sent)
    r = await env.post(
        "/auth/register", {"phone": PHONE, "email": "other@example.com", "pin": "739152"}
    )
    assert (r.status_code, r.json()) == (201, {"status": "pending_verification"})
    assert len(env.sms.sent) == sent_before
    # ...and it is counted against the same SMS limits, so the limit reveals nothing either.
    r = await env.post(
        "/auth/register", {"phone": PHONE, "email": "other@example.com", "pin": "739152"}
    )
    assert _code(r) == "AUTH_429_RATE_LIMITED"
    # The existing account is untouched: its PIN still works, the attacker's does not.
    assert (await env.login(pin=PIN)).status_code == 200
    assert (await env.login(pin="739152")).status_code == 401


@pytest.mark.asyncio
async def test_email_of_an_active_account_is_taken(env: Env) -> None:
    await env.sign_up()
    r = await env.post(
        "/auth/register", {"phone": "+2348031112222", "email": EMAIL.upper(), "pin": PIN}
    )
    assert (r.status_code, _code(r)) == (400, "AUTH_400_EMAIL_TAKEN")


@pytest.mark.asyncio
async def test_abandoned_sign_up_does_not_block_the_email(env: Env) -> None:
    await env.post("/auth/register", {"phone": "+2348031112222", "email": EMAIL, "pin": PIN})
    tokens = await env.sign_up()  # another number, same email: allowed, first never verified
    assert tokens["access_token"]


@pytest.mark.asyncio
async def test_wrong_codes_lock_the_code_and_expired_codes_are_gone(env: Env) -> None:
    await env.post("/auth/register", {"phone": PHONE, "email": EMAIL, "pin": PIN})
    good = env.sms.last_code_for(PHONE)
    wrong = "000000" if good != "000000" else "111111"
    for _ in range(5):
        r = await env.post("/auth/verify-phone", {"phone": PHONE, "code": wrong})
        assert _code(r) == "AUTH_401_INVALID_OTP"
    r = await env.post("/auth/verify-phone", {"phone": PHONE, "code": good})
    assert _code(r) == "AUTH_429_RATE_LIMITED"  # 5 tries per code, even with the right one

    env.clock.advance(seconds=61)
    await env.post("/auth/register", {"phone": PHONE, "email": EMAIL, "pin": PIN})
    env.clock.advance(minutes=10)
    r = await env.post("/auth/verify-phone", {"phone": PHONE, "code": env.sms.last_code_for(PHONE)})
    assert (r.status_code, _code(r)) == (410, "AUTH_410_CHALLENGE_EXPIRED")


@pytest.mark.asyncio
async def test_a_code_works_only_once(env: Env) -> None:
    await env.post("/auth/register", {"phone": PHONE, "email": EMAIL, "pin": PIN})
    code = env.sms.last_code_for(PHONE)
    assert (await env.post("/auth/verify-phone", {"phone": PHONE, "code": code})).status_code == 200
    r = await env.post("/auth/verify-phone", {"phone": PHONE, "code": code})
    assert _code(r) == "AUTH_401_INVALID_OTP"


@pytest.mark.asyncio
async def test_no_sms_provider_means_no_sign_up(db_settings: Settings) -> None:
    async for e in _env(db_settings, sms=False):
        r = await e.post("/auth/register", {"phone": PHONE, "email": EMAIL, "pin": PIN})
        assert (r.status_code, _code(r)) == (503, "SYS_503_SERVICE_UNAVAILABLE")


@pytest.mark.asyncio
async def test_no_signing_key_switches_sign_in_off(db_settings: Settings) -> None:
    settings = Settings(_env_file=None, database_url=db_settings.database_url)  # type: ignore[call-arg]
    app = create_app(settings)  # production wiring; no JWT_SECRET_KEY
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        r = await client.post("/api/v1/auth/login", json={"identifier": PHONE, "pin": PIN})
        assert (r.status_code, _code(r)) == (503, "SYS_503_SERVICE_UNAVAILABLE")
        assert (await client.get("/health")).status_code == 200


# --- log-in ---


@pytest.mark.asyncio
async def test_log_in_with_phone_or_email(env: Env) -> None:
    await env.sign_up()
    assert (await env.login(PHONE)).status_code == 200
    assert (await env.login("+234 803 838 3838")).status_code == 200
    assert (await env.login("DAVID@example.com")).status_code == 200


@pytest.mark.asyncio
async def test_wrong_pin_and_unknown_account_look_the_same(env: Env) -> None:
    await env.sign_up()
    wrong = await env.login(pin="739152")
    unknown = await env.login("+2348099999999", pin="739152")
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()


@pytest.mark.asyncio
async def test_five_wrong_pins_lock_for_fifteen_minutes(env: Env, db_settings: Settings) -> None:
    await env.sign_up()
    for _ in range(4):
        assert _code(await env.login(pin="739152")) == "AUTH_401_INVALID_CREDENTIALS"
    r = await env.login(pin="739152")
    assert (r.status_code, _code(r)) == (429, "AUTH_429_RATE_LIMITED")
    assert _code(await env.login(pin=PIN)) == "AUTH_429_RATE_LIMITED"  # right PIN refused too
    env.clock.advance(minutes=15)
    assert (await env.login(pin=PIN)).status_code == 200
    assert await _sql(db_settings, "SELECT failed_pin_attempts FROM users") == 0


@pytest.mark.asyncio
async def test_unknown_accounts_lock_the_same_way(env: Env) -> None:
    for _ in range(4):
        assert _code(await env.login("+2348099999999", "739152")) == "AUTH_401_INVALID_CREDENTIALS"
    assert _code(await env.login("+2348099999999", "739152")) == "AUTH_429_RATE_LIMITED"


@pytest.mark.asyncio
async def test_ten_requests_per_minute_per_address(db_settings: Settings) -> None:
    async for e in _env(db_settings, address_limit=10):
        # Different unknown numbers each time, so only the per-address limit can trigger.
        for i in range(10):
            assert (await e.login(f"+23480900000{i:02d}", "739152")).status_code == 401
        r = await e.login("+2348090000099", "739152")
        assert r.status_code == 429 and r.json()["error"]["details"]["retry_after_seconds"] == 60
        r = await e.post("/auth/register", {"phone": PHONE, "email": EMAIL, "pin": PIN})
        assert r.status_code == 429  # the limit is shared by every auth endpoint
        e.clock.advance(seconds=61)
        assert (await e.login("+2348090000099", "739152")).status_code == 401


# --- tokens, refresh, idle and 7 days -----------------------------------------------------------


@pytest.mark.asyncio
async def test_refresh_rotates_and_reuse_ends_the_session(env: Env) -> None:
    t = await env.sign_up()
    r = await env.post("/auth/refresh", token=t["refresh_token"])
    assert r.status_code == 200
    new = r.json()
    assert new["refresh_token"] != t["refresh_token"]

    r = await env.post("/auth/refresh", token=t["refresh_token"])  # the spent one, again
    assert (r.status_code, _code(r)) == (401, "AUTH_401_TOKEN_REUSE_DETECTED")
    # The whole session is gone: the legitimate new tokens no longer work either.
    assert (
        _code(await env.post("/auth/refresh", token=new["refresh_token"]))
        == "AUTH_401_INVALID_REFRESH_TOKEN"
    )
    assert _code(await env.get("/users/me", new["access_token"])) == "AUTH_401_UNAUTHORIZED"


@pytest.mark.asyncio
async def test_garbage_and_missing_tokens(env: Env) -> None:
    assert _code(await env.post("/auth/refresh", token="nope")) == "AUTH_401_INVALID_REFRESH_TOKEN"
    assert _code(await env.post("/auth/refresh")) == "AUTH_401_UNAUTHORIZED"
    assert _code(await env.get("/users/me")) == "AUTH_401_UNAUTHORIZED"
    assert _code(await env.get("/users/me", "a.b.c")) == "AUTH_401_UNAUTHORIZED"


@pytest.mark.asyncio
async def test_a_token_signed_with_another_key_is_refused(env: Env) -> None:
    t = await env.sign_up()
    me = (await env.get("/users/me", t["access_token"])).json()
    session_id = (await env.get("/users/me/sessions", t["access_token"])).json()[0]["session_id"]
    from uuid import UUID

    from app.core.auth_tokens import AccessClaims

    forged = TokenKeys("o" * 48).issue_access(
        AccessClaims(UUID(me["user_id"]), UUID(session_id)), env.clock.now
    )
    assert _code(await env.get("/users/me", forged)) == "AUTH_401_UNAUTHORIZED"


@pytest.mark.asyncio
async def test_a_refresh_token_is_not_an_access_token(env: Env) -> None:
    t = await env.sign_up()
    assert _code(await env.get("/users/me", t["refresh_token"])) == "AUTH_401_UNAUTHORIZED"


@pytest.mark.asyncio
async def test_idle_five_minutes_ends_the_session(env: Env) -> None:
    t = await env.sign_up()
    env.clock.advance(minutes=4, seconds=59)
    assert (await env.get("/users/me", t["access_token"])).status_code == 200  # activity
    env.clock.advance(minutes=4, seconds=59)
    assert (await env.get("/users/me", t["access_token"])).status_code == 200
    env.clock.advance(minutes=5)
    assert _code(await env.get("/users/me", t["access_token"])) == "AUTH_401_UNAUTHORIZED"
    assert (
        _code(await env.post("/auth/refresh", token=t["refresh_token"]))
        == "AUTH_401_INVALID_REFRESH_TOKEN"
    )
    assert (await env.login()).status_code == 200  # the PIN starts a new session


@pytest.mark.asyncio
async def test_seven_days_is_absolute(env: Env, db_settings: Settings) -> None:
    t = await env.sign_up()
    refresh = t["refresh_token"]
    # Stay active right up to the limit (simulated: activity 1 minute before each check).
    env.clock.advance(days=7, minutes=-1)
    await _sql(db_settings, "UPDATE auth_sessions SET last_active_at = :t", t=env.clock.now)
    r = await env.post("/auth/refresh", token=refresh)
    assert r.status_code == 200
    refresh = r.json()["refresh_token"]
    env.clock.advance(minutes=1)
    r = await env.post("/auth/refresh", token=refresh)
    assert _code(r) == "AUTH_401_INVALID_REFRESH_TOKEN"


@pytest.mark.asyncio
async def test_access_token_expires_after_fifteen_minutes(env: Env, db_settings: Settings) -> None:
    t = await env.sign_up()
    env.clock.advance(minutes=15)
    await _sql(db_settings, "UPDATE auth_sessions SET last_active_at = :t", t=env.clock.now)
    assert _code(await env.get("/users/me", t["access_token"])) == "AUTH_401_UNAUTHORIZED"


# --- log-out and device sessions ---


@pytest.mark.asyncio
async def test_logout_ends_access_and_refresh_immediately(env: Env) -> None:
    t = await env.sign_up()
    r = await env.post("/auth/logout", token=t["access_token"])
    assert r.status_code == 204
    assert _code(await env.get("/users/me", t["access_token"])) == "AUTH_401_UNAUTHORIZED"
    assert (
        _code(await env.post("/auth/refresh", token=t["refresh_token"]))
        == "AUTH_401_INVALID_REFRESH_TOKEN"
    )


@pytest.mark.asyncio
async def test_device_sessions_list_and_revoke(env: Env) -> None:
    await env.sign_up()
    phone = (await env.login(device="phone-1")).json()
    tablet = (await env.login(device="tablet-1")).json()
    r = await env.get("/users/me/sessions", phone["access_token"])
    rows = r.json()
    assert {s["device_id"] for s in rows} >= {"phone-1", "tablet-1"}
    assert [s["current"] for s in rows].count(True) == 1
    tablet_id = next(s["session_id"] for s in rows if s["device_id"] == "tablet-1")
    current_id = next(s["session_id"] for s in rows if s["current"])

    r = await env.client.delete(
        f"/api/v1/users/me/sessions/{current_id}",
        headers={"Authorization": f"Bearer {phone['access_token']}"},
    )
    assert (r.status_code, _code(r)) == (403, "AUTH_403_FORBIDDEN")
    r = await env.client.delete(
        f"/api/v1/users/me/sessions/{tablet_id}",
        headers={"Authorization": f"Bearer {phone['access_token']}"},
    )
    assert r.status_code == 204
    assert _code(await env.get("/users/me", tablet["access_token"])) == "AUTH_401_UNAUTHORIZED"


@pytest.mark.asyncio
async def test_cannot_see_or_revoke_another_users_session(env: Env) -> None:
    a = await env.sign_up()
    env.clock.advance(seconds=61)
    b = await env.sign_up(phone="+2348031112222", email="b@example.com")
    b_rows = (await env.get("/users/me/sessions", b["access_token"])).json()
    a_rows = (await env.get("/users/me/sessions", a["access_token"])).json()
    assert {s["session_id"] for s in a_rows}.isdisjoint({s["session_id"] for s in b_rows})
    r = await env.client.delete(
        f"/api/v1/users/me/sessions/{b_rows[0]['session_id']}",
        headers={"Authorization": f"Bearer {a['access_token']}"},
    )
    assert (r.status_code, _code(r)) == (404, "RES_404_SESSION_NOT_FOUND")
    assert (await env.get("/users/me", b["access_token"])).status_code == 200
    me_a = (await env.get("/users/me", a["access_token"])).json()
    assert me_a["phone"] == PHONE  # each token only ever sees its own user


# --- storage and logging rules ---


@pytest.mark.asyncio
async def test_no_secret_is_stored_in_the_clear(env: Env, db_settings: Settings) -> None:
    t = await env.sign_up()
    stored = await _sql(
        db_settings,
        "SELECT concat_ws('|', u.pin_hash, r.token_hash, v.code_digest) "
        "FROM users u, auth_refresh_tokens r, phone_verifications v LIMIT 1",
    )
    assert PIN not in stored and t["refresh_token"] not in stored
    assert stored.startswith("$argon2id$")


@pytest.mark.asyncio
async def test_logs_never_carry_pins_codes_tokens_or_full_numbers(
    env: Env, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG)
    t = await env.sign_up()
    await env.login(pin="739152")
    await env.login(trusted=False)  # SMS + email codes for a new phone
    await env.get("/users/me", t["access_token"])
    await env.post("/auth/refresh", token=t["refresh_token"])
    text_out = " ".join(f"{r.getMessage()} {r.__dict__}" for r in caplog.records)
    code = env.sms.last_code_for(PHONE) or "never"
    for secret in [
        PIN,
        "739152",
        code,
        t["access_token"],
        t["refresh_token"],
        t["device_token"],
        *[e.code for e in env.email.sent if e.code],
        *[m.code for m in env.sms.sent],
        PHONE,
        EMAIL,
    ]:
        assert secret not in text_out, "a secret or full identifier reached the logs"
    assert "***3838" in text_out  # the allowed form
    assert any(getattr(r, "route", None) == "/api/v1/users/me" for r in caplog.records)


@pytest.mark.asyncio
async def test_request_id_is_returned_and_sanitised(env: Env) -> None:
    r = await env.client.get("/health", headers={"X-Request-ID": "abc-12345678"})
    assert r.headers["X-Request-ID"] == "abc-12345678"
    r = await env.client.get("/health", headers={"X-Request-ID": "bad\nvalue"})
    assert r.headers["X-Request-ID"] != "bad\nvalue"


@pytest.mark.asyncio
async def test_simultaneous_sign_ups_for_one_number(env: Env) -> None:
    import asyncio

    body = {"phone": PHONE, "email": EMAIL, "pin": PIN}
    results = await asyncio.gather(*(env.post("/auth/register", body) for _ in range(4)))
    codes = sorted(r.status_code for r in results)
    assert codes.count(201) == 1 and set(codes) <= {201, 429}, codes
    assert len(env.sms.sent) == 1
