# ruff: noqa: F811, E501  -- pytest fixtures are imported by name and used as parameters
"""Service outage notices (ADR-066; owner 2026-10-26 "Show a notice only").

Staff report an outage; every signed-in app user sees its notice until staff resolve it.
Nothing is blocked. App users never see who reported it.
"""

from __future__ import annotations

from typing import Any

import pytest
from httpx import AsyncClient

from app.core.config import Settings
from tests.integration.test_admin_disputes import boss, staff  # noqa: F401
from tests.integration.test_admin_staff import Admin, H
from tests.integration.test_auth_api import (  # noqa: F401
    Clock,
    _code,
    _runtime,
    _sql,
    clean,
    migrated,
)
from tests.integration.test_escrow_api import esc, owner, partners, taker  # noqa: F401
from tests.integration.test_offers_api import currencies  # noqa: F401
from tests.integration.test_payouts_api import Party

pytestmark = [pytest.mark.integration, pytest.mark.asyncio]

NEW = {
    "service": "GBP payouts",
    "message": "Payouts to UK banks are delayed. Your money is safe in escrow.",
    "severity": "high",
}


async def _notices(p: Party) -> Any:
    r = await p.env.client.get("/api/v1/service-notices", headers=p._h())
    assert r.status_code == 200, r.text
    return r.json()


async def test_reported_outage_shows_in_the_app_until_resolved(
    db_settings: Settings, staff: Admin, boss: AsyncClient, owner: Party
) -> None:
    assert await _notices(owner) == []
    r = await boss.post("/api/v1/admin/outages", json=NEW, headers=H)
    assert r.status_code == 201, r.text
    oid = r.json()["id"]
    assert r.json()["ref"].startswith("#")
    [n] = await _notices(owner)
    assert n["service"] == "GBP payouts" and n["severity"] == "high"
    assert n["message"].startswith("Payouts to UK banks")
    assert set(n) == {"id", "service", "message", "severity", "started_at", "expected_end_at"}
    # Staff list: the reporter and how long it has lasted.
    staff.clock.advance(minutes=10)  # within the 15-minute staff session
    listed = (await boss.get("/api/v1/admin/outages", headers=H)).json()
    [row] = listed["items"]
    assert row["status"] == "open" and row["reported_by"] == "The Boss"
    assert row["duration_seconds"] == 10 * 60
    # Change the words and mark in progress; then resolve.
    assert (
        await boss.patch(
            f"/api/v1/admin/outages/{oid}",
            json={"status": "in_progress", "message": "UK payouts are slow; fixing now."},
            headers=H,
        )
    ).status_code == 204
    assert (await _notices(owner))[0]["message"] == "UK payouts are slow; fixing now."
    staff.clock.advance(minutes=1)
    assert (
        await boss.patch(f"/api/v1/admin/outages/{oid}", json={"status": "resolved"}, headers=H)
    ).status_code == 204
    assert await _notices(owner) == []
    row = (await boss.get("/api/v1/admin/outages?status=resolved", headers=H)).json()["items"][0]
    assert row["resolved_at"] and row["duration_seconds"] == 11 * 60
    # Resolved is final.
    assert (
        await boss.patch(f"/api/v1/admin/outages/{oid}", json={"severity": "low"}, headers=H)
    ).status_code == 409
    actions = await _sql(
        db_settings,
        "SELECT string_agg(action, ',' ORDER BY at, action) FROM staff_audit_log WHERE target_type = 'outage'",
    )
    assert actions == "outage_reported,outage_updated,outage_resolved"


async def test_a_planned_outage_shows_only_once_it_starts(
    db_settings: Settings, staff: Admin, boss: AsyncClient, owner: Party
) -> None:
    r = await boss.post(
        "/api/v1/admin/outages",
        json={
            **NEW,
            "severity": "low",
            "started_at": "2030-01-01T09:00:00+01:00",
            "expected_end_at": "2030-01-01T11:00:00+01:00",
        },
        headers=H,
    )
    assert r.status_code == 201, r.text
    assert await _notices(owner) == []


async def test_validation_and_access(
    db_settings: Settings, staff: Admin, boss: AsyncClient, owner: Party
) -> None:
    for bad in (
        {**NEW, "severity": "critical"},
        {**NEW, "message": "x"},
        {**NEW, "service": "x"},
        {**NEW, "reporter": "me"},
        {**NEW, "started_at": "2026-10-18T10:00:00"},  # no time zone
        {
            **NEW,
            "started_at": "2026-10-18T10:00:00+01:00",
            "expected_end_at": "2026-10-18T09:00:00+01:00",
        },
    ):
        assert (await boss.post("/api/v1/admin/outages", json=bad, headers=H)).status_code == 422, (
            bad
        )
    # A support agent can't see or report outages.
    agent = await staff.invite(boss, "agent@xspeeria.test", "support_agent")
    assert (await agent.get("/api/v1/admin/outages", headers=H)).status_code == 403
    assert (await agent.post("/api/v1/admin/outages", json=NEW, headers=H)).status_code == 403
    bad_id = "00000000-0000-0000-0000-000000000000"
    assert (
        await boss.patch(f"/api/v1/admin/outages/{bad_id}", json={"status": "resolved"}, headers=H)
    ).status_code == 404
    # App users must be signed in to read notices.
    assert (await owner.env.client.get("/api/v1/service-notices")).status_code == 401
    grants = await _sql(
        db_settings,
        "SELECT string_agg(privilege_type, ',' ORDER BY privilege_type) "
        "FROM information_schema.role_table_grants "
        "WHERE grantee = 'xspeeria_app' AND table_name = 'service_outages'",
    )
    assert grants == "INSERT,SELECT,UPDATE"
