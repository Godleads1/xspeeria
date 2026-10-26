# ruff: noqa: F811  -- pytest fixtures are imported by name and used as parameters
"""Admin Analytics Dashboard (ADR-061): real figures only, from a real simulated trade."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.core.config import Settings
from app.core.exceptions import AppError
from app.db.session import build_engine
from app.services.dashboard import LAGOS, DashboardService, period_bounds
from app.services.staff import StaffPrincipal
from tests.integration.test_admin_staff import Admin, H, admin, boss  # noqa: F401
from tests.integration.test_auth_api import (  # noqa: F401
    Clock,
    _code,
    _runtime,
    _sql,
    clean,
    migrated,
)
from tests.integration.test_escrow_api import (  # noqa: F401
    Escrow,
    _open,
    _pay,
    deal,
    esc,
    owner,
    partners,
    taker,
)
from tests.integration.test_offers_api import currencies  # noqa: F401
from tests.integration.test_payouts_api import Party

pytestmark = [pytest.mark.integration, pytest.mark.asyncio]


def _staff(*permissions: str) -> StaffPrincipal:
    return StaffPrincipal(
        staff_id=uuid.uuid4(),
        session_id=uuid.uuid4(),
        email="x@xspeeria.test",
        role_id=uuid.uuid4(),
        role_name="custom",
        permissions=frozenset(permissions),
    )


async def _figures(
    db_settings: Settings, now: datetime, period: str = "month", who: StaffPrincipal | None = None
) -> dict[str, Any]:
    engine = build_engine(db_settings)
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as db:
            return await DashboardService(db).figures(
                who or _staff("dashboard.read"),
                period,  # type: ignore[arg-type]
                now,
                None,
            )
    finally:
        await engine.dispose()


# --- periods -----------------------------------------------------------------------------------


def test_periods_are_lagos_calendar_periods_compared_with_the_one_before() -> None:
    now = datetime(2026, 10, 26, 13, 30, tzinfo=UTC)  # 14:30 in Lagos
    w = period_bounds("today", now)
    assert w.start == datetime(2026, 10, 25, 23, 0, tzinfo=UTC) and w.end == now
    assert w.prev_start == w.start - timedelta(days=1) and w.prev_end == now - timedelta(days=1)
    w = period_bounds("month", now)
    assert w.start.astimezone(LAGOS).date().isoformat() == "2026-10-01"
    assert w.prev_start.astimezone(LAGOS).date().isoformat() == "2026-09-01"
    assert w.bucket == "day"
    w = period_bounds("year", now)
    assert w.start.astimezone(LAGOS).date().isoformat() == "2026-01-01" and w.bucket == "month"
    w = period_bounds("custom", now, "2026-02")
    assert w.start.astimezone(LAGOS).date().isoformat() == "2026-02-01"
    assert w.end.astimezone(LAGOS).date().isoformat() == "2026-03-01"
    assert w.prev_start.astimezone(LAGOS).date().isoformat() == "2026-01-01"
    with pytest.raises(ValueError):
        period_bounds("custom", now, "2026-11")
    # 31 March compares with all of February, never with the first days of March.
    w = period_bounds("month", datetime(2026, 3, 31, 12, tzinfo=UTC))
    assert w.prev_end == w.start


# --- figures -----------------------------------------------------------------------------------


async def test_a_completed_trade_shows_up_everywhere_with_exact_money(
    db_settings: Settings, esc: Escrow, owner: Party, taker: Party, deal: dict[str, Any]
) -> None:
    await _open(esc, deal, owner)
    await _pay(owner, deal["match_id"])
    await _pay(taker, deal["match_id"])
    f = await _figures(db_settings, esc.env.clock() + timedelta(minutes=1))
    o = f["overview"]
    assert o["trades_started"]["value"] == 1 and o["trades_completed"]["value"] == 1
    assert o["new_users"]["value"] == 2 and o["active_users"]["value"] == 2
    # Money as integer minor units in text, per currency, with the scale; never a float.
    value = {v["currency"]: (v["minor"], v["scale"]) for v in o["value"]}
    fees = {v["currency"]: v["minor"] for v in o["fees"]}
    assert value == {"NGN": ("26410000", 2), "USD": ("20000", 2)}
    assert fees == {"NGN": "264100", "USD": "200"}
    assert all(isinstance(v["minor"], str) for v in o["value"] + o["fees"])
    assert o["avg_settlement_seconds"] is not None
    t = f["transactions"]
    assert (t["completed"], t["failed"]) == (1, 0) and sum(t["speed"].values()) == 1
    [c] = f["corridors"]
    assert c["pair"] == ["NGN", "USD"] and c["trades"] == 1 and c["average_rate"] == "1320.5000"
    assert (
        sum(int(x["minor"]) for x in f["revenue"]["fees_by_time"] if x["currency"] == "USD") == 200
    )
    # Nothing is waiting in escrow once both sides were paid out.
    assert f["revenue"]["waiting_in_escrow"] == []
    assert sum(g["signed_up"] for g in f["customers"]["growth"]) == 2
    # Trend lines: one row per day with something in it, summing to the totals.
    series = o["series"]
    assert sum(r["trades_started"] for r in series) == 1
    assert sum(r["trades_completed"] for r in series) == 1
    assert sum(r["new_users"] for r in series) == 2
    assert {v["currency"] for v in o["value_by_time"]} == {"NGN", "USD"}
    assert all(isinstance(v["minor"], str) for v in o["value_by_time"])
    # Customers by status (every account now).
    assert f["customers"]["by_status"] == {
        "active": 2,
        "pending_verification": 0,
        "suspended": 0,
        "closed": 0,
    }
    # The month before had nothing: the console compares with zero.
    assert o["trades_completed"]["previous"] == 0


async def test_money_waiting_in_escrow_is_a_record_of_funded_legs(
    db_settings: Settings, esc: Escrow, owner: Party, deal: dict[str, Any]
) -> None:
    await _open(esc, deal, owner)
    await _pay(owner, deal["match_id"])
    f = await _figures(db_settings, esc.env.clock())
    # Owner's USD 200.00 (plus nothing else) waits at the partner bank: a record, not revenue.
    [w] = f["revenue"]["waiting_in_escrow"]
    assert (w["currency"], w["minor"], w["legs"]) == ("USD", "20000", 1)
    assert f["overview"]["trades_completed"]["value"] == 0
    assert f["overview"]["fees"] == []
    assert f["operations"]["open_offers_paying_naira"] == 0


async def test_empty_platform_shows_zeros_not_samples(db_settings: Settings, clean: None) -> None:
    f = await _figures(db_settings, datetime(2026, 10, 26, 12, tzinfo=UTC), "year")
    o = f["overview"]
    assert o["active_users"] == {"value": 0, "previous": 0}
    assert o["value"] == [] and o["avg_settlement_seconds"] is None
    assert f["corridors"] == [] and f["customers"]["growth"] == []
    assert f["operations"]["mean_seconds_to_resolve"] is None
    # No tiles without a source: no NPS, uptime, cards or adverts.
    flat = str(f)
    for absent in ("nps", "uptime", "card", "advert", "cost_per"):
        assert absent not in flat


async def test_dashboard_needs_the_permission(db_settings: Settings, clean: None) -> None:
    with pytest.raises(AppError) as e:
        await _figures(db_settings, datetime.now(UTC), who=_staff("users.read"))
    assert e.value.status_code == 403


async def test_dashboard_route(admin: Admin, boss: Any) -> None:
    r = await boss.get("/api/v1/admin/dashboard?period=today", headers=H)
    assert r.status_code == 200, r.text
    assert r.json()["period"]["bucket"] == "hour"
    assert (await boss.get("/api/v1/admin/dashboard?period=custom", headers=H)).status_code == 422
    bad = await boss.get("/api/v1/admin/dashboard?period=custom&month=2026-13", headers=H)
    assert bad.status_code == 422
    future = await boss.get("/api/v1/admin/dashboard?period=custom&month=2099-01", headers=H)
    assert future.status_code == 422
    assert (await boss.get("/api/v1/admin/dashboard?period=week", headers=H)).status_code == 422
    assert (await boss.get("/api/v1/admin/dashboard")).status_code == 403  # no admin header
    async with admin.client() as stranger:
        assert (await stranger.get("/api/v1/admin/dashboard", headers=H)).status_code == 401
