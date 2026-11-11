# ruff: noqa: F811  -- pytest fixtures are imported by name and used as parameters
"""ADR-102: rate ceilings from the automatic CBN feed (owner 2026-11-09).

Snapshot until the feed has stored a rate; then the latest stored rate, if fetched in the last
3 days; older than that, no new offers in that currency (fail closed). CAD follows USD.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import date
from decimal import Decimal

import pytest
import pytest_asyncio
from httpx import Response
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import Settings
from app.db.session import build_engine
from app.domain.offer_rules import AFRICAN, FED_SNAPSHOT, OFFICIAL_RATE, cross_ceilings
from app.providers.frankfurter import RateFeedError, RateQuote
from app.services.official_rates import OfficialRateService, current_ceilings
from tests.integration.test_auth_api import Env, _code, _sql, clean, migrated  # noqa: F401
from tests.integration.test_offers_api import (  # noqa: F401
    OTHER_EMAIL,
    OTHER_PHONE,
    User,
    _user,
    currencies,
    env,
)

pytestmark = [pytest.mark.integration, pytest.mark.asyncio]

FED = {"USD": Decimal("1347.29"), "GBP": Decimal("1802.96"), "EUR": Decimal("1503.54")}


class FakeFeed:
    name = "frankfurter-cbn"

    def __init__(self, rates: dict[str, Decimal], fail: set[str] | None = None) -> None:
        self.rates, self.fail, self.calls = rates, fail or set(), []

    async def fetch(self, currency: str, today: date) -> RateQuote:
        self.calls.append(currency)
        if currency in self.fail:
            raise RateFeedError("down")
        return RateQuote(currency, self.rates[currency], today)


@pytest_asyncio.fixture
async def db(db_settings: Settings) -> AsyncIterator[AsyncSession]:
    engine = build_engine(db_settings)
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as s:
            yield s
    finally:
        await engine.dispose()


async def _rates(env: Env, user: User | None) -> Response:
    headers = {"Authorization": f"Bearer {user.token}"} if user else {}
    return await env.client.get("/api/v1/rates/official", headers=headers)


async def test_snapshot_until_the_feed_has_stored_a_rate(env: Env, db: AsyncSession) -> None:
    # The yuan is switched off by default (ADR-105, ADR-106), so it has no rate limit in force.
    # Pairs without naira (ADR-111) are worked out from the same rates; none with the yuan.
    both = {**OFFICIAL_RATE, **cross_ceilings(FED_SNAPSHOT)}
    expected = {k: v for k, v in both.items() if "CNY" not in k.split("/")}
    assert await current_ceilings(db, env.clock()) == expected
    assert OFFICIAL_RATE["CAD"] == Decimal("944.70")


async def test_fetched_rates_become_the_ceilings(env: Env, db: AsyncSession) -> None:
    feed = FakeFeed(FED)
    assert await OfficialRateService(db, env.clock, feed).refresh() == ["USD", "GBP", "EUR"]
    ceilings = await current_ceilings(db, env.clock())
    assert {c: ceilings[c] for c in FED} == FED
    assert ceilings["CAD"] == Decimal("954.64")  # 1,347.29 / 1.4113 = 954.6446… (ADR-101)
    # A later fetch wins.
    env.clock.advance(hours=1)
    await OfficialRateService(db, env.clock, FakeFeed({**FED, "USD": Decimal("1350")})).refresh()
    assert (await current_ceilings(db, env.clock()))["USD"] == Decimal("1350")


async def test_offers_follow_the_fetched_ceiling(
    env: Env, db: AsyncSession, db_settings: Settings
) -> None:
    await OfficialRateService(db, env.clock, FakeFeed(FED)).refresh()
    david = await _user(env)
    r = await david.publish(desired_rate="1347.30")
    assert r.status_code == 422 and _code(r) == "VAL_422_RATE_ABOVE_CEILING", r.text
    assert (await david.publish(desired_rate="1347.29")).status_code == 201
    assert len((await david.listings()).json()["items"]) == 1
    source = await _sql(db_settings, "SELECT DISTINCT source FROM official_rates")
    assert source == "frankfurter-cbn"


async def test_three_days_without_a_fresh_rate_stops_new_offers(env: Env, db: AsyncSession) -> None:
    await OfficialRateService(db, env.clock, FakeFeed(FED)).refresh()
    david = await _user(env)
    assert (await david.publish(desired_rate="1300")).status_code == 201
    env.clock.advance(days=3, seconds=-1)
    assert "USD" in await current_ceilings(db, env.clock())  # still within 3 days
    env.clock.advance(seconds=2)
    ceilings = await current_ceilings(db, env.clock())
    assert "USD" not in ceilings and "CAD" not in ceilings
    ada = await _user(env, OTHER_PHONE, OTHER_EMAIL)  # a fresh session after 3 days
    r = await ada.publish(desired_rate="1300")
    assert r.status_code == 422 and _code(r) == "VAL_422_RATE_ABOVE_CEILING"
    assert (await ada.listings()).json()["items"] == []  # nothing listed either
    # A working fetch puts it back.
    await OfficialRateService(db, env.clock, FakeFeed(FED)).refresh()
    assert len((await ada.listings()).json()["items"]) == 1


async def test_a_failed_currency_keeps_its_last_rate_and_fails_the_job(
    env: Env, db: AsyncSession, db_settings: Settings
) -> None:
    await OfficialRateService(db, env.clock, FakeFeed(FED)).refresh()
    env.clock.advance(hours=1)
    feed = FakeFeed({**FED, "USD": Decimal("1360")}, fail={"GBP"})
    with pytest.raises(RateFeedError):  # the job fails, so staff are alerted (ADR-074)
        await OfficialRateService(db, env.clock, feed).refresh()
    assert feed.calls == ["USD", "GBP", "EUR"]  # one failure doesn't stop the others
    ceilings = await current_ceilings(db, env.clock())
    assert ceilings["USD"] == Decimal("1360") and ceilings["GBP"] == FED["GBP"]
    assert await _sql(db_settings, "SELECT count(*) FROM official_rates") == 5


async def test_rows_can_never_be_changed(env: Env, db: AsyncSession, db_settings: Settings) -> None:
    await OfficialRateService(db, env.clock, FakeFeed(FED)).refresh()
    for sql in ("UPDATE official_rates SET rate = 1", "DELETE FROM official_rates"):
        with pytest.raises(DBAPIError):
            await _sql(db_settings, sql)


async def test_the_app_reads_the_ceilings_signed_in(env: Env, db: AsyncSession) -> None:
    assert (await _rates(env, None)).status_code == 401
    david = await _user(env)
    body = (await _rates(env, david)).json()
    items = {i["currency"]: i["max_rate"] for i in body["items"]}
    assert {c: items[c] for c in ("CAD", "EUR", "GBP", "USD")} == {
        "CAD": "944.70",
        "EUR": "1491.20",
        "GBP": "1765.11",
        "USD": "1333.26",
    }
    # ADR-107: the African ceilings are worked out to 3 decimals, rounded down (USD ÷ units
    # per USD; XOF from the euro's fixed rate). The yuan is off by default (ADR-106).
    assert items["UGX"] == "0.306" and items["XOF"] == "2.273"
    assert "CNY" not in items
    assert sorted(i["currency"] for i in body["items"] if i["derived"]) == sorted({"CAD"} | AFRICAN)
    assert body["cad_per_usd"] == "1.4113"
    await OfficialRateService(db, env.clock, FakeFeed(FED)).refresh()
    body = (await _rates(env, david)).json()
    assert {i["currency"]: i["max_rate"] for i in body["items"]}["USD"] == "1347.29"


def test_the_job_runs_only_when_the_feed_is_switched_on() -> None:
    from app.main import planned_tasks
    from app.services.auth import AuthRuntime

    base = {"_env_file": None, "database_url": "postgresql+asyncpg://x:y@localhost/z"}
    rt = AuthRuntime.__new__(AuthRuntime)
    for attr in ("pretend_bank", "push_sender", "email"):
        setattr(rt, attr, None)
    off = planned_tasks(Settings(**base), rt, role="worker")  # type: ignore[arg-type]
    on = planned_tasks(Settings(**base, official_rate_feed="frankfurter"), rt, role="worker")  # type: ignore[arg-type]
    assert "official rates" not in off and "official rates" in on
