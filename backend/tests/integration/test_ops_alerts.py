# ruff: noqa: F811, E501  -- pytest fixtures are imported by name and used as parameters
"""Operations alerts for Super Admins (ADR-074; owner 2026-11-01). SEC-037.

Rules over data Xspeeria already records raise alerts once; a condition that keeps firing
updates its open alert; new P1/P2 alerts are emailed to Super Admins; Super Admins acknowledge
and resolve them with a note; nobody else can see or touch them. Against PostgreSQL.
"""

from __future__ import annotations

import uuid
from typing import Any

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.core.config import Settings
from app.db.session import build_engine
from app.services.ops_alerts import OpsAlertService
from tests.integration.test_admin_staff import (  # noqa: F401
    BOSS,
    BOSS_PW,
    NEW_PW,
    Admin,
    H,
    admin,
    boss,
)
from tests.integration.test_auth_api import _code, _sql, clean, migrated  # noqa: F401

pytestmark = [pytest.mark.integration, pytest.mark.asyncio]


async def _scan(staff: Admin, *, system: bool = True) -> list[Any]:
    engine = build_engine(staff.db_settings)
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as db:
            settings = Settings(_env_file=None, database_url=staff.db_settings.database_url)  # type: ignore[call-arg]
            service = OpsAlertService(
                db, staff.clock, settings if system else None, staff.runtime.email
            )
            return [(a.rule, a.severity) for a in await service.scan()]
    finally:
        await engine.dispose()


async def _alerts(c: AsyncClient, which: str = "live") -> dict[str, Any]:
    r = await c.get(f"/api/v1/admin/alerts?which={which}", headers=H)
    assert r.status_code == 200, r.text
    return dict(r.json())


def _ops_mail(staff: Admin) -> list[str]:
    return [e.ops_alert for e in staff.mail.sent if e.ops_alert]


@pytest_asyncio.fixture
async def officer(admin: Admin, boss: AsyncClient) -> AsyncClient:
    return await admin.invite(boss, "officer@xspeeria.test", "compliance_officer")


async def test_a_staff_access_change_alerts_super_admins_once(
    admin: Admin, boss: AsyncClient
) -> None:
    r = await boss.post(
        "/api/v1/admin/roles", json={"name": "viewer", "permissions": ["users.read"]}, headers=H
    )
    assert r.status_code == 201, r.text
    assert await _scan(admin, system=False) == [("staff_access_changed", "P2")]
    # Raised once: the next sweep finds nothing new, and the email went out once.
    assert await _scan(admin, system=False) == []
    assert _ops_mail(admin) == [
        m for m in _ops_mail(admin) if "A staff account or role was changed" in m
    ]
    assert len(_ops_mail(admin)) == 1 and _ops_mail(admin)[0].startswith("P2 #")
    [alert] = (await _alerts(boss))["items"]
    assert alert["rule"] == "staff_access_changed" and alert["status"] == "open"
    assert alert["details"]["action"] == "role_created" and alert["notified_at"]
    # Nothing about a customer, and no names or contact details.
    assert BOSS not in str(alert)


async def test_repeated_staff_sign_in_failures_update_one_open_alert(
    admin: Admin, boss: AsyncClient
) -> None:
    async with admin.client() as c:
        for i in range(10):
            await admin.login(c, f"nobody{i}@xspeeria.test", "whatever password here")
    assert await _scan(admin, system=False) == [("staff_sign_in_attack", "P2")]
    assert await _scan(admin, system=False) == []  # still happening: same alert
    [alert] = (await _alerts(boss))["items"]
    assert alert["occurrences"] == 2 and alert["details"]["failures"] == 10


async def test_failed_webhooks_jobs_and_escrow_raise_system_alerts(
    db_settings: Settings, admin: Admin
) -> None:
    await _sql(
        db_settings,
        "INSERT INTO api_metrics (minute, kind, name, method, calls, client_errors, server_errors, "
        "network_errors, total_ms, max_ms, slow_calls) VALUES "
        "(date_trunc('minute', now()), 'webhook', '/api/v1/kyc/webhooks/didit', 'POST', 6, 6, 0, 0, 60, 10, 0)",
    )
    await _sql(
        db_settings,
        "INSERT INTO job_status (name, interval_s, runs, failures, last_started_at, last_ok_at, "
        "last_failed_at, last_error, updated_at) VALUES "
        "('Fraud scan', 30, 3, 1, now(), now() - interval '1 minute', now(), 'TimeoutError', now()), "
        "('Escrow processing', 5, 9, 0, now() - interval '1 hour', now() - interval '1 hour', NULL, NULL, now())",
    )
    raised = await _scan(admin)
    assert set(raised) == {
        ("webhook_rejected", "P2"),
        ("job_failing", "P2"),
        ("escrow_stalled", "P1"),
    }
    # The P1 is emailed first.
    assert (
        _ops_mail(admin)[0].startswith("P1 #")
        and "Escrow processing has stopped" in _ops_mail(admin)[0]
    )


async def test_many_failed_customer_sign_ins_raise_an_alert(
    db_settings: Settings, admin: Admin
) -> None:
    uid = uuid.uuid4()
    await _sql(
        db_settings,
        "INSERT INTO users (id, phone, email, pin_hash, status, created_at, phone_verified_at) VALUES "
        "(:u, '+2348030000001', 'x@example.com', 'x', 'active', now(), now())",
        u=uid,
    )
    for _ in range(30):
        await _sql(
            db_settings,
            "INSERT INTO customer_activity (id, user_id, at, action, category, outcome) VALUES "
            "(gen_random_uuid(), :u, :at, 'sign_in_failed', 'security', 'refused')",
            u=uid,
            at=admin.clock(),
        )
    assert await _scan(admin, system=False) == [("customer_sign_in_attack", "P2")]


async def test_super_admins_acknowledge_and_resolve_others_cannot(
    db_settings: Settings, admin: Admin, boss: AsyncClient, officer: AsyncClient
) -> None:
    # Inviting the officer changed staff access: that is the alert.
    await _scan(admin, system=False)
    [alert] = (await _alerts(boss))["items"]
    aid = alert["id"]
    # Compliance can't see or touch alerts (Super Admin only).
    assert (await officer.get("/api/v1/admin/alerts", headers=H)).status_code == 403
    assert (
        await officer.post(f"/api/v1/admin/alerts/{aid}/acknowledge", headers=H)
    ).status_code == 403
    # The bell shows it to Super Admins only.
    feed = (await boss.get("/api/v1/admin/notifications", headers=H)).json()
    assert [i["kind"] for i in feed["items"]].count("ops_alert") == 1
    officer_feed = (await officer.get("/api/v1/admin/notifications", headers=H)).json()
    assert "ops_alert" not in [i["kind"] for i in officer_feed["items"]]
    # Acknowledge, then resolve with a note.
    r = await boss.post(f"/api/v1/admin/alerts/{aid}/acknowledge", headers=H)
    assert r.status_code == 200 and r.json()["status"] == "acknowledged"
    assert (
        await boss.post(f"/api/v1/admin/alerts/{aid}/resolve", json={"note": "ok"}, headers=H)
    ).status_code == 422
    r = await boss.post(
        f"/api/v1/admin/alerts/{aid}/resolve",
        json={"note": "I invited the officer myself."},
        headers=H,
    )
    assert r.status_code == 200 and r.json()["status"] == "resolved"
    r = await boss.post(
        f"/api/v1/admin/alerts/{aid}/resolve", json={"note": "again, again"}, headers=H
    )
    assert r.status_code == 409 and _code(r) == "RES_409_ALERT_RESOLVED"
    assert (await _alerts(boss))["items"] == []
    assert len((await _alerts(boss, "all"))["items"]) == 1
    # An event alert is never raised again after it is resolved.
    assert await _scan(admin, system=False) == []
    actions = await _sql(
        db_settings,
        "SELECT string_agg(action, ',' ORDER BY id) FROM staff_audit_log WHERE target_type = 'ops_alert'",
    )
    assert actions == "ops_alert_acknowledged,ops_alert_resolved"
    # The database refuses an incomplete resolution and deletion.
    with pytest.raises(Exception, match="resolved_complete"):
        await _sql(db_settings, "UPDATE ops_alerts SET resolution_note = NULL")


async def test_a_condition_still_happening_after_resolution_opens_a_new_alert(
    admin: Admin, boss: AsyncClient
) -> None:
    async with admin.client() as c:
        for i in range(10):
            await admin.login(c, f"nobody{i}@xspeeria.test", "whatever password here")
    await _scan(admin, system=False)
    [alert] = (await _alerts(boss))["items"]
    r = await boss.post(
        f"/api/v1/admin/alerts/{alert['id']}/resolve",
        json={"note": "Blocked the address range."},
        headers=H,
    )
    assert r.status_code == 200
    assert await _scan(admin, system=False) == [("staff_sign_in_attack", "P2")]
    assert len((await _alerts(boss, "all"))["items"]) == 2


async def test_signed_out_and_console_header_are_required(admin: Admin) -> None:
    async with admin.client() as c:
        assert (await c.get("/api/v1/admin/alerts", headers=H)).status_code == 401
        assert (await admin.login(c, BOSS, BOSS_PW)).status_code == 200
        assert (await c.get("/api/v1/admin/alerts")).status_code in (401, 403)
    assert NEW_PW  # imported for the officer's password
