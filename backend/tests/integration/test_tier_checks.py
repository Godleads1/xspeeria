# ruff: noqa: F811  -- pytest fixtures are imported by name and used as parameters
"""ADR-058 Tier 2 and Tier 3 checks. Didit is a fake here; nothing leaves the test."""

from __future__ import annotations

import base64
import json
from collections.abc import AsyncIterator
from dataclasses import replace
from datetime import date
from typing import Any

import httpx
import pytest
import pytest_asyncio

from app.core.config import Settings
from app.providers.tier_checks import DiditTierChecks, TierOutcome
from tests.integration.test_auth_api import Env, _code, _sql, clean, migrated  # noqa: F401
from tests.integration.test_offers_api import User, _make_env, _user, currencies  # noqa: F401

pytestmark = [pytest.mark.integration, pytest.mark.asyncio]

BVN = "22233344455"
ADDRESS = {"line1": "12 Allen Avenue", "city": "Ikeja", "state": "Lagos", "country": "NG"}
PNG = base64.b64encode(b"\x89PNG fake image bytes").decode()


class FakeDidit:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self.bvn_outcome = TierOutcome("approved", "MATCH", "req-1")
        self.poa_outcome = TierOutcome("approved", None, "req-2")

    async def bvn(self, **kw: Any) -> TierOutcome:
        self.calls.append(("bvn", kw))
        return self.bvn_outcome

    async def proof_of_address(self, **kw: Any) -> TierOutcome:
        self.calls.append(("poa", kw))
        return self.poa_outcome


@pytest_asyncio.fixture
async def didit_env(db_settings: Settings) -> AsyncIterator[tuple[Env, FakeDidit]]:
    """Real identity rules (no bypass) and a fake Didit."""
    async for env in _make_env(db_settings, bypass=False):
        fake = FakeDidit()
        app = env.client._transport.app  # type: ignore[attr-defined]
        app.state.auth = replace(app.state.auth, tier_checks=fake)
        yield env, fake


async def _verified(env: Env, db_settings: Settings) -> User:
    user = await _user(env)
    await _sql(
        db_settings,
        "INSERT INTO kyc_cases (id, user_id, provider, country, provider_session_id, "
        "provider_status, status, legal_name, date_of_birth, decided_at, created_at, updated_at) "
        "SELECT gen_random_uuid(), id, 'didit', 'NG', 'kyc-1', 'Approved', 'approved', "
        "'ADA NGOZI OBI', DATE '1990-01-01', now(), now(), now() FROM users",
    )
    return user


async def _post(u: User, path: str, body: dict[str, Any]) -> Any:
    return await u.env.client.post(
        f"/api/v1/users/me/tier-checks/{path}", json=body, headers=u._h()
    )


async def _view(u: User) -> dict[str, Any]:
    r = await u.env.client.get("/api/v1/users/me/tier-checks", headers=u._h())
    assert r.status_code == 200, r.text
    return dict(r.json())


async def _tier(u: User) -> int:
    r = await u.env.client.get("/api/v1/users/me/limits", headers=u._h())
    return int(r.json()["tier"])


# --- Tier 2 --------------------------------------------------------------------------------


async def test_bvn_and_address_make_tier_2(
    db_settings: Settings, didit_env: tuple[Env, FakeDidit]
) -> None:
    env, fake = didit_env
    user = await _verified(env, db_settings)
    assert await _tier(user) == 1
    r = await _post(user, "bvn", {"bvn": BVN})
    assert r.status_code == 200, r.text
    assert r.json()["bvn"] == "approved" and r.json()["tier"] == 1
    # Didit got the name and date of birth from the approved identity check.
    kind, sent = fake.calls[0]
    assert kind == "bvn" and sent["first_name"] == "ADA" and sent["last_name"] == "OBI"
    assert sent["date_of_birth"] == date(1990, 1, 1) and sent["bvn"] == BVN
    r = await _post(user, "address", ADDRESS)
    assert r.status_code == 200 and r.json()["tier"] == 2
    assert r.json()["address"]["city"] == "Ikeja"
    limits = (await user.env.client.get("/api/v1/users/me/limits", headers=user._h())).json()
    assert limits["daily_limit"] == "5000000.00" and limits["monthly_limit"] == "20000000.00"


async def test_the_bvn_is_never_stored_or_logged(
    db_settings: Settings, didit_env: tuple[Env, FakeDidit], caplog: pytest.LogCaptureFixture
) -> None:
    env, _ = didit_env
    user = await _verified(env, db_settings)
    await _post(user, "bvn", {"bvn": BVN})
    rows = await _sql(db_settings, "SELECT row_to_json(t)::text FROM tier_checks t")
    assert BVN not in str(rows)
    assert BVN not in caplog.text


async def test_a_declined_bvn_stays_tier_1_and_tries_are_limited(
    db_settings: Settings, didit_env: tuple[Env, FakeDidit]
) -> None:
    env, fake = didit_env
    user = await _verified(env, db_settings)
    fake.bvn_outcome = TierOutcome("declined", "NO_MATCH")
    for _ in range(3):
        r = await _post(user, "bvn", {"bvn": BVN})
        assert r.status_code == 200 and r.json()["bvn"] == "declined"
    r = await _post(user, "bvn", {"bvn": BVN})
    assert r.status_code == 429 and len(fake.calls) == 3  # no 4th paid check
    await _post(user, "address", ADDRESS)
    assert await _tier(user) == 1


@pytest.mark.parametrize("bvn", ["123", "2223334445x", " 22233344455", "222333444556"])
async def test_bad_bvn_is_refused_before_any_call(
    db_settings: Settings, didit_env: tuple[Env, FakeDidit], bvn: str
) -> None:
    env, fake = didit_env
    user = await _verified(env, db_settings)
    assert (await _post(user, "bvn", {"bvn": bvn})).status_code == 422
    assert fake.calls == []


async def test_unverified_users_cannot_start(didit_env: tuple[Env, FakeDidit]) -> None:
    env, fake = didit_env
    user = await _user(env)
    r = await _post(user, "bvn", {"bvn": BVN})
    assert r.status_code == 403 and _code(r) == "AUTH_403_TIER_REQUIRED"
    assert fake.calls == []


@pytest.mark.parametrize(
    "body",
    [
        {**ADDRESS, "country": "JP"},
        {**ADDRESS, "line1": "x"},
        {**ADDRESS, "city": "y" * 61},
        {**ADDRESS, "extra": "field"},
    ],
)
async def test_bad_addresses_are_refused(
    db_settings: Settings, didit_env: tuple[Env, FakeDidit], body: dict[str, str]
) -> None:
    env, _ = didit_env
    user = await _verified(env, db_settings)
    assert (await _post(user, "address", body)).status_code == 422


# --- Tier 3 --------------------------------------------------------------------------------


async def _tier2(env: Env, db_settings: Settings) -> User:
    user = await _verified(env, db_settings)
    await _post(user, "bvn", {"bvn": BVN})
    await _post(user, "address", ADDRESS)
    return user


async def test_proof_of_address_and_source_of_funds_make_tier_3(
    db_settings: Settings, didit_env: tuple[Env, FakeDidit]
) -> None:
    env, fake = didit_env
    user = await _tier2(env, db_settings)
    r = await _post(user, "proof-of-address", {"document": PNG, "content_type": "image/png"})
    assert r.status_code == 200 and r.json()["proof_of_address"] == "approved"
    kind, sent = fake.calls[-1]
    assert kind == "poa" and sent["expected_country"] == "NGA"
    assert sent["expected_address"] == "12 Allen Avenue, Ikeja, Lagos"
    assert sent["first_name"] == "ADA" and sent["document"].startswith(b"\x89PNG")
    r = await _post(user, "source-of-funds", {"source": "salary"})
    assert r.status_code == 200 and r.json()["tier"] == 3
    # The document itself is not kept anywhere.
    rows = await _sql(db_settings, "SELECT row_to_json(t)::text FROM tier_checks t")
    assert "PNG" not in str(rows)
    # Once proven, the address can't be swapped for another.
    r = await _post(user, "address", {**ADDRESS, "line1": "1 Other Street"})
    assert r.status_code == 409


async def test_tier_3_steps_need_tier_2(
    db_settings: Settings, didit_env: tuple[Env, FakeDidit]
) -> None:
    env, fake = didit_env
    user = await _verified(env, db_settings)
    r = await _post(user, "proof-of-address", {"document": PNG, "content_type": "image/png"})
    assert r.status_code == 403 and fake.calls == []
    assert (await _post(user, "source-of-funds", {"source": "salary"})).status_code == 403


@pytest.mark.parametrize(
    "body",
    [
        {"document": PNG, "content_type": "text/html"},
        {"document": "not base64!!", "content_type": "image/png"},
        {"document": PNG, "content_type": "image/png", "filename": "../x"},
    ],
)
async def test_bad_uploads_are_refused(
    db_settings: Settings, didit_env: tuple[Env, FakeDidit], body: dict[str, str]
) -> None:
    env, fake = didit_env
    user = await _tier2(env, db_settings)
    calls = len(fake.calls)
    assert (await _post(user, "proof-of-address", body)).status_code == 422
    assert len(fake.calls) == calls


async def test_unknown_source_of_funds_is_refused(
    db_settings: Settings, didit_env: tuple[Env, FakeDidit]
) -> None:
    env, _ = didit_env
    user = await _tier2(env, db_settings)
    assert (await _post(user, "source-of-funds", {"source": "lottery"})).status_code == 422


# --- the Didit client (no network: a fake transport) -----------------------------------------


async def test_didit_bvn_needs_a_real_match() -> None:
    seen: list[httpx.Request] = []

    def answer(body: dict[str, Any]) -> httpx.MockTransport:
        def handler(request: httpx.Request) -> httpx.Response:
            seen.append(request)
            return httpx.Response(200, json=body)

        return httpx.MockTransport(handler)

    ok = DiditTierChecks(
        "k",
        transport=answer(
            {"status": "Approved", "request_id": "r", "validations": [{"outcome_code": "MATCH"}]}
        ),
    )
    out = await ok.bvn(first_name="A", last_name="B", bvn=BVN, date_of_birth=None)
    assert out.status == "approved" and out.request_id == "r"
    assert (
        seen[0].headers["x-api-key"] == "k" and b"nga_bank_verification_number" in seen[0].content
    )
    # "Approved" without a MATCH is not trusted.
    odd = DiditTierChecks("k", transport=answer({"status": "Approved", "validations": []}))
    assert (
        await odd.bvn(first_name="A", last_name="B", bvn=BVN, date_of_birth=None)
    ).status == "in_review"
    weird = DiditTierChecks("k", transport=answer({"status": "Something"}))
    assert (
        await weird.bvn(first_name="A", last_name="B", bvn=BVN, date_of_birth=None)
    ).status == "in_review"


async def test_didit_errors_fail_closed() -> None:
    down = DiditTierChecks("k", transport=httpx.MockTransport(lambda r: httpx.Response(500)))
    out = await down.proof_of_address(
        document=b"x",
        filename="p.png",
        content_type="image/png",
        first_name="A",
        last_name="B",
        expected_address="1 St",
        expected_country="NGA",
    )
    assert out.status == "in_review" and out.reason == "PROVIDER_UNAVAILABLE"
    declined = DiditTierChecks(
        "k",
        transport=httpx.MockTransport(
            lambda r: httpx.Response(
                200,
                content=json.dumps(
                    {
                        "poa": {
                            "status": "Declined",
                            "warnings": [{"risk": "NAME_MISMATCH_WITH_PROVIDED"}],
                        }
                    }
                ),
            )
        ),
    )
    out = await declined.proof_of_address(
        document=b"x",
        filename="p.png",
        content_type="image/png",
        first_name="A",
        last_name="B",
        expected_address="1 St",
        expected_country="NGA",
    )
    assert out.status == "declined" and out.reason == "NAME_MISMATCH_WITH_PROVIDED"
