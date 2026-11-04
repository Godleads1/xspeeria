# ruff: noqa: F811  -- pytest fixtures are imported by name and used as parameters
"""ADR-098: the fee quote the app shows before confirming (signed-in, reads nothing)."""

from __future__ import annotations

import pytest
from httpx import Response

from tests.integration.test_auth_api import Env, clean, migrated  # noqa: F401
from tests.integration.test_offers_api import User, _user, currencies, env  # noqa: F401

pytestmark = [pytest.mark.integration, pytest.mark.asyncio]

Q = "/api/v1/fees/quote"


async def _q(env: Env, user: User | None, **params: str) -> Response:
    headers = {"Authorization": f"Bearer {user.token}"} if user else {}
    return await env.client.get(Q, params=params, headers=headers)


async def test_quotes_each_side_in_its_own_currency(env: Env) -> None:
    david = await _user(env)
    r = await _q(env, david, currency="NGN", amount="1600000.00")
    assert r.status_code == 200, r.text
    assert r.json() == {
        "currency": "NGN",
        "amount": "1600000.00",
        "side": "taker",
        "fee": "16000.00",
        "total": "1616000.00",
    }
    r = await _q(env, david, currency="USD", amount="1000", side="maker")
    assert r.json()["fee"] == "7.50" and r.json()["total"] == "1007.50"
    # The minimum and the cap.
    assert (await _q(env, david, currency="USD", amount="20")).json()["fee"] == "0.50"
    assert (await _q(env, david, currency="NGN", amount="50000000")).json()["fee"] == "48000.00"


async def test_needs_a_session_and_refuses_bad_input(env: Env) -> None:
    assert (await _q(env, None, currency="USD", amount="10")).status_code == 401
    david = await _user(env)
    for params in (
        {"currency": "JPY", "amount": "10"},
        {"currency": "USD", "amount": "-1"},
        {"currency": "USD", "amount": "1.234"},
        {"currency": "USD", "amount": "0"},
        {"currency": "USD", "amount": "10", "side": "both"},
        {"currency": "USD", "amount": "99999999999999"},
    ):
        assert (await _q(env, david, **params)).status_code == 422, params
