# ruff: noqa: F811  -- pytest fixtures are imported by name and used as parameters
"""ADR-058: trade limits by tier, counted in naira from deal start, both sides, Lagos time."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.core.config import Settings
from app.db.session import build_engine
from app.services.matches import MatchService
from tests.integration.test_auth_api import Env, _code, _sql, clean, migrated  # noqa: F401
from tests.integration.test_matches_api import (  # noqa: F401
    THIRD,
    Person,
    _person,
    offer,
    owner,
    taker,
)
from tests.integration.test_offers_api import (  # noqa: F401
    User,
    _user,
    currencies,
    env,
    no_kyc_env,
)

pytestmark = [pytest.mark.integration, pytest.mark.asyncio]


async def _limits(p: User) -> dict[str, Any]:
    r = await p.env.client.get("/api/v1/users/me/limits", headers=p._h())
    assert r.status_code == 200, r.text
    return dict(r.json())


async def _sell(owner: Person, usd: str) -> str:
    r = await owner.publish(source_amount=usd, desired_rate="1320.50")
    assert r.status_code == 201, r.text
    return str(r.json()["offer_id"])


# --- Tier 0 --------------------------------------------------------------------------------


async def test_tier_0_can_look_but_not_trade(no_kyc_env: Env) -> None:
    user = await _user(no_kyc_env)
    assert (await user.listings()).status_code == 200
    r = await user.publish()
    assert r.status_code == 403 and _code(r) == "AUTH_403_KYC_REQUIRED"
    limits = await _limits(user)
    assert limits["tier"] == 0 and limits["daily_limit"] is None and limits["left_today"] == "0.00"


# --- Tier 1 (local identity bypass counts as Tier 1) -----------------------------------------


async def test_a_deal_over_the_daily_limit_is_refused(owner: Person, taker: Person) -> None:
    oid = await _sell(owner, "500.00")  # NGN 660,250 > NGN 500,000
    r = await taker.take(oid, "500.00")
    assert r.status_code == 403 and _code(r) == "TRADE_403_DAILY_LIMIT", r.text
    assert r.json()["error"]["details"]["left"] == "500000.00"
    assert (await taker.take(oid, "300.00")).status_code == 201  # NGN 396,150
    r = await taker.take(oid, "100.00")  # would make NGN 528,200
    assert r.status_code == 403 and r.json()["error"]["details"]["left"] == "103850.00"
    limits = await _limits(taker)
    assert limits == {
        "tier": 1,
        "daily_limit": "500000.00",
        "monthly_limit": "2000000.00",
        "used_today": "396150.00",
        "used_this_month": "396150.00",
        "left_today": "103850.00",
        "left_this_month": "1603850.00",
    }


async def test_deals_on_my_offers_count_for_me_too(env: Env, owner: Person, taker: Person) -> None:
    oid = await _sell(owner, "500.00")
    assert (await taker.take(oid, "300.00")).status_code == 201
    assert (await _limits(owner))["used_today"] == "396150.00"
    third = await _person(env, THIRD)
    # The owner would go over; the taker is not told the owner's limits.
    r = await third.take(oid, "100.00")
    assert r.status_code == 403 and _code(r) == "TRADE_403_COUNTERPARTY_LIMIT"
    assert "396" not in r.text and "103850" not in r.text


async def test_an_unpaid_deal_gives_its_amount_back(
    db_settings: Settings, env: Env, owner: Person, taker: Person
) -> None:
    oid = await _sell(owner, "500.00")
    assert (await taker.take(oid, "300.00")).status_code == 201
    await _sql(
        db_settings,
        "UPDATE matches SET preparation_deadline = :t",
        t=env.clock() - timedelta(minutes=1),
    )
    engine = build_engine(db_settings)
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as db:
            await MatchService(db, env.clock).expire_due()
    finally:
        await engine.dispose()
    assert (await _limits(taker))["used_today"] == "0.00"
    assert (await taker.take(oid, "300.00")).status_code == 201


async def test_yesterday_counts_for_the_month_not_the_day(
    db_settings: Settings, env: Env, owner: Person, taker: Person
) -> None:
    for _ in range(5):
        oid = await _sell(owner, "300.00")
        assert (await taker.take(oid, "300.00")).status_code == 201
        # Move that deal to an earlier day this month (Lagos time).
        await _sql(
            db_settings,
            "UPDATE matches SET accepted_at = :t WHERE offer_id = :o",
            t=env.clock() - timedelta(days=3),
            o=oid,
        )
    limits = await _limits(taker)
    assert limits["used_today"] == "0.00" and limits["used_this_month"] == "1980750.00"
    oid = await _sell(owner, "300.00")
    r = await taker.take(oid, "300.00")
    assert r.status_code == 403 and _code(r) == "TRADE_403_MONTHLY_LIMIT"
    assert r.json()["error"]["details"]["left"] == "19250.00"
