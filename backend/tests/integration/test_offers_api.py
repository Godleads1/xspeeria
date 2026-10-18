"""Milestone 4.1C offers over HTTP, against PostgreSQL (ADR-029).

Offers are records of what a user is willing to exchange — information, not money.
Normal, failure and abuse cases: publish, list, ownership, edit, withdraw, idempotency,
the rate ceiling, the minimum, KYC, and the database grants.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from typing import Any

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient, Response
from sqlalchemy import text

from app.cli.currency_definitions import ensure_currency_definitions
from app.core.config import Settings
from app.db.session import build_engine
from app.domain.offer_rules import IDEMPOTENCY_TTL
from app.main import build_auth_runtime, create_app
from app.providers.sms import RecordingSmsSender
from tests.integration.test_auth_api import (  # noqa: F401  -- fixtures are used by name
    Clock,
    Env,
    _code,
    _runtime,
    _sql,
    clean,
    migrated,
)

pytestmark = [pytest.mark.integration, pytest.mark.asyncio]

OTHER_PHONE = "+2348031111111"
OTHER_EMAIL = "ada@example.com"


@pytest_asyncio.fixture(autouse=True)
async def currencies(db_settings: Settings, clean: None) -> None:  # noqa: F811
    engine = build_engine(db_settings)
    try:
        async with engine.begin() as conn:
            await ensure_currency_definitions(conn)
    finally:
        await engine.dispose()


async def _make_env(db_settings: Settings, *, bypass: bool) -> AsyncIterator[Env]:
    clock = Clock()
    recorder = RecordingSmsSender()
    settings = Settings(  # type: ignore[call-arg]
        _env_file=None,
        database_url=db_settings.database_url,
        app_env="local",
        kyc_dev_bypass=bypass,
    )
    app = create_app(settings, auth_runtime=_runtime(clock, recorder, 10_000))
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield Env(client, clock, recorder)


@pytest_asyncio.fixture
async def env(db_settings: Settings) -> AsyncIterator[Env]:
    async for e in _make_env(db_settings, bypass=True):
        yield e


@pytest_asyncio.fixture
async def no_kyc_env(db_settings: Settings) -> AsyncIterator[Env]:
    async for e in _make_env(db_settings, bypass=False):
        yield e


class User:
    def __init__(self, env: Env, token: str) -> None:
        self.env, self.token = env, token

    def _h(self, key: uuid.UUID | None = None) -> dict[str, str]:
        h = {"Authorization": f"Bearer {self.token}"}
        if key is not None:
            h["Idempotency-Key"] = str(key)
        return h

    async def publish(self, key: uuid.UUID | None = None, **over: str) -> Response:
        body = {
            "source_currency": "USD",
            "target_currency": "NGN",
            "source_amount": "500.00",
            "desired_rate": "1320.50",
            **over,
        }
        return await self.env.client.post(
            "/api/v1/offers", json=body, headers=self._h(key or uuid.uuid4())
        )

    async def get(self, path: str, **params: Any) -> Response:
        return await self.env.client.get(f"/api/v1/offers{path}", params=params, headers=self._h())

    async def listings(self, pair: str = "USD/NGN", **params: Any) -> Response:
        return await self.env.client.get(
            "/api/v1/marketplace/listings",
            params={"filter[currency_pair]": pair, **params},
            headers=self._h(),
        )

    async def patch(self, offer_id: str, body: dict[str, Any]) -> Response:
        return await self.env.client.patch(
            f"/api/v1/offers/{offer_id}", json=body, headers=self._h()
        )

    async def delete(self, offer_id: str) -> Response:
        return await self.env.client.delete(f"/api/v1/offers/{offer_id}", headers=self._h())


async def _user(env: Env, phone: str = "+2348038383838", email: str = "david@example.com") -> User:
    body = await env.sign_up(phone=phone, email=email)
    return User(env, body["access_token"])


@pytest_asyncio.fixture
async def david(env: Env) -> User:
    return await _user(env)


@pytest_asyncio.fixture
async def ada(env: Env) -> User:
    return await _user(env, OTHER_PHONE, OTHER_EMAIL)


# --- publish -------------------------------------------------------------------------------


async def test_publish_returns_the_offer_as_strings(david: User) -> None:
    r = await david.publish()
    assert r.status_code == 201, r.text
    b = r.json()
    assert b["source_amount"] == "500.00" and b["matched_amount"] == "0.00"
    assert b["remaining_amount"] == "500.00" and b["desired_rate"] == "1320.50"
    assert b["status"] == "open" and b["is_own"] is True and b["version"] == 1
    assert "user_id" not in b


async def test_amount_is_stored_as_exact_minor_units(db_settings: Settings, david: User) -> None:
    r = await david.publish(source_amount="12345.67", source_currency="NGN", target_currency="USD")
    assert r.status_code == 201, r.text
    assert r.json()["source_amount"] == "12345.67"
    minor = await _sql(db_settings, "SELECT source_amount_minor FROM offers")
    assert minor == 1_234_567


@pytest.mark.parametrize(
    ("over", "code"),
    [
        ({"source_amount": "9.99"}, "VAL_422_AMOUNT_BELOW_MINIMUM"),
        ({"source_amount": "10.001"}, "VALIDATION_ERROR"),
        ({"source_amount": "1e3"}, "VALIDATION_ERROR"),
        ({"source_amount": "-50.00"}, "VALIDATION_ERROR"),
        (
            {"source_currency": "NGN", "target_currency": "USD", "source_amount": "9999.99"},
            "VAL_422_AMOUNT_BELOW_MINIMUM",
        ),
        ({"desired_rate": "0"}, "VAL_422_RATE_NOT_POSITIVE"),
        ({"desired_rate": "-1"}, "VAL_422_RATE_NOT_POSITIVE"),
        ({"desired_rate": "1333.27"}, "VAL_422_RATE_ABOVE_CEILING"),
        ({"desired_rate": "1.1234567"}, "VALIDATION_ERROR"),
        ({"desired_rate": "NaN"}, "VALIDATION_ERROR"),
        ({"source_currency": "USD", "target_currency": "GBP"}, "VALIDATION_ERROR"),
        ({"source_currency": "NGN", "target_currency": "NGN"}, "VALIDATION_ERROR"),
        ({"source_currency": "JPY", "target_currency": "NGN"}, "VALIDATION_ERROR"),
    ],
)
async def test_publish_refuses_bad_input(david: User, over: dict[str, str], code: str) -> None:
    r = await david.publish(**over)  # type: ignore[arg-type]
    assert r.status_code == 422, r.text
    assert _code(r) == code


async def test_rate_at_the_ceiling_is_allowed(david: User) -> None:
    assert (await david.publish(desired_rate="1333.26")).status_code == 201


async def test_a_number_amount_is_refused(david: User) -> None:
    r = await david.env.client.post(
        "/api/v1/offers",
        json={
            "source_currency": "USD",
            "target_currency": "NGN",
            "source_amount": 500.0,
            "desired_rate": "1320",
        },
        headers=david._h(uuid.uuid4()),
    )
    assert r.status_code == 422


@pytest.mark.parametrize("field", ["user_id", "status", "matched_amount", "version"])
async def test_client_cannot_set_server_fields(david: User, field: str) -> None:
    r = await david.publish(**{field: "x"})  # type: ignore[arg-type]
    assert r.status_code == 422


async def test_publish_needs_an_idempotency_key(david: User) -> None:
    r = await david.env.client.post(
        "/api/v1/offers",
        json={
            "source_currency": "USD",
            "target_currency": "NGN",
            "source_amount": "500.00",
            "desired_rate": "1320",
        },
        headers={"Authorization": f"Bearer {david.token}"},
    )
    assert r.status_code == 422


async def test_publish_needs_sign_in(env: Env) -> None:
    r = await env.client.post(
        "/api/v1/offers", json={}, headers={"Idempotency-Key": str(uuid.uuid4())}
    )
    assert r.status_code == 401


async def test_without_kyc_offers_are_refused(no_kyc_env: Env) -> None:
    user = await _user(no_kyc_env)
    r = await user.publish()
    assert r.status_code == 403 and _code(r) == "AUTH_403_KYC_REQUIRED"
    r = await user.listings()
    assert r.status_code == 403


async def test_kyc_bypass_outside_local_is_refused() -> None:
    settings = Settings(_env_file=None, app_env="staging", kyc_dev_bypass=True)  # type: ignore[call-arg]
    with pytest.raises(ValueError, match="KYC_DEV_BYPASS"):
        build_auth_runtime(settings)


async def test_missing_currency_definition_answers_503(
    db_settings: Settings, env: Env, monkeypatch: pytest.MonkeyPatch
) -> None:
    user = await _user(env)
    import app.services.offers as svc

    monkeypatch.setattr(svc, "CURRENCY_DEF_VERSION", "iso4217-v999")
    r = await user.publish()
    assert r.status_code == 503 and _code(r) == "SYS_503_SERVICE_UNAVAILABLE"
    assert await _sql(db_settings, "SELECT count(*) FROM offers") == 0


# --- idempotency ---------------------------------------------------------------------------


async def test_same_key_same_request_replays(db_settings: Settings, david: User) -> None:
    key = uuid.uuid4()
    first = await david.publish(key)
    again = await david.publish(key)
    assert first.status_code == again.status_code == 201
    assert first.json() == again.json()
    assert await _sql(db_settings, "SELECT count(*) FROM offers") == 1


async def test_same_key_different_request_is_refused(db_settings: Settings, david: User) -> None:
    key = uuid.uuid4()
    assert (await david.publish(key)).status_code == 201
    r = await david.publish(key, source_amount="600.00")
    assert r.status_code == 409 and _code(r) == "SYS_409_IDEMPOTENCY_KEY_REUSED"
    assert await _sql(db_settings, "SELECT count(*) FROM offers") == 1


async def test_keys_are_per_user(db_settings: Settings, david: User, ada: User) -> None:
    key = uuid.uuid4()
    a = await david.publish(key)
    b = await ada.publish(key)
    assert a.status_code == b.status_code == 201
    assert a.json()["offer_id"] != b.json()["offer_id"]
    assert await _sql(db_settings, "SELECT count(*) FROM offers") == 2


async def test_key_is_forgotten_after_24_hours(db_settings: Settings, david: User) -> None:
    key = uuid.uuid4()
    first = await david.publish(key)
    david.env.clock.advance(seconds=IDEMPOTENCY_TTL.total_seconds() + 1)
    # The session has idled out by now; sign in again.
    r = await david.env.login()
    david.token = r.json()["access_token"]
    second = await david.publish(key)
    assert second.status_code == 201
    assert second.json()["offer_id"] != first.json()["offer_id"]
    assert await _sql(db_settings, "SELECT count(*) FROM idempotency_records") == 1


# --- read ----------------------------------------------------------------------------------


async def test_listing_is_best_rate_first_and_hides_owner(david: User, ada: User) -> None:
    await david.publish(desired_rate="1330")
    await ada.publish(desired_rate="1310")
    await david.publish(desired_rate="1320")
    r = await ada.listings()
    assert r.status_code == 200
    rows = r.json()["items"]
    assert r.json()["next_offset"] is None
    assert [o["desired_rate"] for o in rows] == ["1310.00", "1320.00", "1330.00"]
    assert [o["is_own"] for o in rows] == [True, False, False]
    assert all("user_id" not in o for o in rows)


async def test_naira_offers_list_highest_rate_first(david: User) -> None:
    for rate in ("1300", "1330", "1320"):
        await david.publish(
            source_currency="NGN", target_currency="USD", source_amount="500000", desired_rate=rate
        )
    r = await david.listings("NGN/USD")
    assert [o["desired_rate"] for o in r.json()["items"]] == ["1330.00", "1320.00", "1300.00"]


async def test_listing_pages_and_filters_pair(david: User) -> None:
    for rate in ("1300", "1301", "1302"):
        await david.publish(desired_rate=rate)
    await david.publish(source_currency="GBP", desired_rate="1700")
    r = await david.listings(limit=2, offset=1)
    assert [o["desired_rate"] for o in r.json()["items"]] == ["1301.00", "1302.00"]
    assert r.json()["next_offset"] is None
    first = (await david.listings(limit=2)).json()
    assert first["next_offset"] == 2
    assert (await david.listings(limit=51)).status_code == 422
    assert (await david.listings("USDNGN")).status_code == 422
    assert (await david.listings("USD/GBP")).status_code == 422
    assert (await david.listings(**{"filter[type]": "request"})).status_code == 422


async def test_offers_above_the_ceiling_are_not_listed(
    db_settings: Settings, david: User, ada: User
) -> None:
    offer = (await david.publish(desired_rate="1330")).json()
    # A ceiling lowered after publishing: the stored rate is now above it.
    await _sql(
        db_settings, "UPDATE offers SET desired_rate = 1400 WHERE id = :i", i=offer["offer_id"]
    )
    assert (await ada.listings()).json()["items"] == []
    assert (await ada.get(f"/{offer['offer_id']}")).status_code == 404
    assert (await david.get(f"/{offer['offer_id']}")).status_code == 200


async def test_others_withdrawn_offer_is_not_found(david: User, ada: User) -> None:
    offer = (await david.publish()).json()
    assert (await ada.get(f"/{offer['offer_id']}")).status_code == 200
    await david.delete(offer["offer_id"])
    r = await ada.get(f"/{offer['offer_id']}")
    assert r.status_code == 404 and _code(r) == "RES_404_NOT_FOUND"
    assert (await david.get(f"/{offer['offer_id']}")).json()["status"] == "withdrawn"


async def test_mine_shows_only_my_offers(david: User, ada: User) -> None:
    await david.publish()
    await ada.publish()
    rows = (await david.get("/mine")).json()
    assert len(rows) == 1 and rows[0]["is_own"] is True


async def test_unknown_offer_is_404(david: User) -> None:
    assert (await david.get(f"/{uuid.uuid4()}")).status_code == 404
    assert (await david.get("/not-a-uuid")).status_code == 422


# --- change --------------------------------------------------------------------------------


async def test_owner_can_change_rate(david: User) -> None:
    offer = (await david.publish()).json()
    r = await david.patch(offer["offer_id"], {"desired_rate": "1325.125"})
    assert r.status_code == 200, r.text
    assert r.json()["desired_rate"] == "1325.125" and r.json()["version"] == 2


async def test_rate_change_checks_the_ceiling(david: User) -> None:
    offer = (await david.publish()).json()
    r = await david.patch(offer["offer_id"], {"desired_rate": "2000"})
    assert r.status_code == 422 and _code(r) == "VAL_422_RATE_ABOVE_CEILING"


async def test_each_change_bumps_the_version(david: User) -> None:
    offer = (await david.publish()).json()
    await david.patch(offer["offer_id"], {"desired_rate": "1321"})
    r = await david.patch(offer["offer_id"], {"desired_rate": "1322"})
    assert r.json()["version"] == 3


async def test_only_rate_can_change(david: User) -> None:
    offer = (await david.publish()).json()
    r = await david.patch(offer["offer_id"], {"desired_rate": "1321", "source_amount": "1.00"})
    assert r.status_code == 422


async def test_non_owner_cannot_change_or_withdraw(
    db_settings: Settings, david: User, ada: User
) -> None:
    offer = (await david.publish()).json()
    r = await ada.patch(offer["offer_id"], {"desired_rate": "1300"})
    assert r.status_code == 403 and _code(r) == "AUTH_403_NOT_OWNER"
    r = await ada.delete(offer["offer_id"])
    assert r.status_code == 403 and _code(r) == "AUTH_403_NOT_OWNER"
    assert await _sql(db_settings, "SELECT status FROM offers") == "open"


async def test_partly_matched_offer_cannot_be_edited(db_settings: Settings, david: User) -> None:
    offer = (await david.publish()).json()
    await _sql(
        db_settings,
        "UPDATE offers SET matched_amount_minor = 100, status = 'partially_matched' WHERE id = :i",
        i=offer["offer_id"],
    )
    r = await david.patch(offer["offer_id"], {"desired_rate": "1300"})
    assert r.status_code == 409 and _code(r) == "RES_409_OFFER_ALREADY_MATCHED"
    # Withdrawing the rest is still allowed and keeps the matched part.
    r = await david.delete(offer["offer_id"])
    assert r.status_code == 200
    assert r.json()["matched_amount"] == "1.00" and r.json()["status"] == "withdrawn"


async def test_withdraw_is_repeat_safe(david: User) -> None:
    offer = (await david.publish()).json()
    a = await david.delete(offer["offer_id"])
    b = await david.delete(offer["offer_id"])
    assert a.status_code == b.status_code == 200
    assert a.json() == b.json() and a.json()["version"] == 2
    r = await david.patch(offer["offer_id"], {"desired_rate": "1300"})
    assert r.status_code == 409


async def test_fully_matched_offer_cannot_be_withdrawn(db_settings: Settings, david: User) -> None:
    offer = (await david.publish()).json()
    await _sql(
        db_settings,
        "UPDATE offers SET matched_amount_minor = source_amount_minor, status = 'fully_matched' "
        "WHERE id = :i",
        i=offer["offer_id"],
    )
    r = await david.delete(offer["offer_id"])
    assert r.status_code == 409 and _code(r) == "RES_409_OFFER_ALREADY_MATCHED"


# --- database guarantees -------------------------------------------------------------------


async def test_database_refuses_a_matched_amount_above_the_offer(
    db_settings: Settings, david: User
) -> None:
    offer = (await david.publish()).json()
    with pytest.raises(Exception, match="matched_within_source"):
        await _sql(
            db_settings,
            "UPDATE offers SET matched_amount_minor = source_amount_minor + 1 WHERE id = :i",
            i=offer["offer_id"],
        )


async def test_app_role_grants(db_settings: Settings) -> None:
    def grants(table: str) -> str:
        return (
            "SELECT string_agg(privilege_type, ',' ORDER BY privilege_type) "
            "FROM information_schema.role_table_grants "
            f"WHERE grantee = 'xspeeria_app' AND table_name = '{table}'"
        )

    assert await _sql(db_settings, grants("offers")) == "INSERT,SELECT,UPDATE"
    assert await _sql(db_settings, grants("idempotency_records")) == "DELETE,INSERT,SELECT"


async def test_currency_definitions_command_is_insert_only(db_settings: Settings) -> None:
    engine = build_engine(db_settings)
    try:
        async with engine.begin() as conn:
            assert await ensure_currency_definitions(conn) == []  # already present
            count = await conn.scalar(text("SELECT count(*) FROM currency_definitions"))
        assert count is not None and count >= 4
    finally:
        await engine.dispose()
