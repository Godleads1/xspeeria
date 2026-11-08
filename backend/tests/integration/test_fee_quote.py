# ruff: noqa: F811  -- pytest fixtures are imported by name and used as parameters
"""ADR-098: the 1% fee quote the app shows before confirming (signed-in, reads nothing)."""

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


async def test_quotes_one_percent_in_the_currency_sent(env: Env) -> None:
    david = await _user(env)
    r = await _q(env, david, currency="NGN", amount="264100")
    assert r.status_code == 200, r.text
    assert r.json() == {
        "currency": "NGN",
        "amount": "264100.00",
        "fee": "2641.00",
        "total": "266741.00",
    }
    assert (await _q(env, david, currency="USD", amount="200.00")).json()["total"] == "202.00"
    # No minimum or maximum (owner, 2026-11-08); half to even on the last kobo.
    assert (await _q(env, david, currency="USD", amount="0.50")).json()["fee"] == "0.00"
    assert (await _q(env, david, currency="USD", amount="1.50")).json()["fee"] == "0.02"
    assert (await _q(env, david, currency="NGN", amount="50000000")).json()["fee"] == "500000.00"


async def test_needs_a_session_and_refuses_bad_input(env: Env) -> None:
    assert (await _q(env, None, currency="USD", amount="10")).status_code == 401
    david = await _user(env)
    for params in (
        {"currency": "JPY", "amount": "10"},
        {"currency": "USD", "amount": "-1"},
        {"currency": "USD", "amount": "1.234"},
        {"currency": "USD", "amount": "0"},
        {"currency": "USD", "amount": "99999999999999"},
    ):
        assert (await _q(env, david, **params)).status_code == 422, params
