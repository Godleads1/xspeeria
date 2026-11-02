# ruff: noqa: F811, E501  -- pytest fixtures are imported by name and used as parameters
"""Emergency controls (SEC-039, ADR-075; owner 2026-11-02): pause all deals with the clocks
frozen, and end every session. Any Super Admin, reason required, audited, alerted. PostgreSQL."""

from __future__ import annotations

from datetime import datetime
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.core.config import Settings
from app.db.session import build_engine
from app.services.ops_alerts import OpsAlertService
from tests.integration.test_admin_disputes import boss, staff  # noqa: F401
from tests.integration.test_admin_staff import Admin, H
from tests.integration.test_auth_api import _code, _sql, clean, migrated  # noqa: F401
from tests.integration.test_escrow_api import (  # noqa: F401
    Escrow,
    _open,
    _phase,
    deal,
    esc,
    owner,
    partners,
    taker,
)
from tests.integration.test_offers_api import currencies  # noqa: F401
from tests.integration.test_payouts_api import Party

pytestmark = [pytest.mark.integration, pytest.mark.asyncio]

REASON = {"reason": "Bank reported a problem with payouts"}


def _advance(esc: Escrow, staff: Admin, **kw: float) -> None:
    """The customers' server and the console share one clock in real life."""
    esc.env.clock.advance(**kw)
    staff.clock.advance(**kw)


async def _pause(boss: AsyncClient) -> Any:
    return await boss.post("/api/v1/admin/emergency/deals/pause", json=REASON, headers=H)


async def _resume(boss: AsyncClient) -> Any:
    return await boss.post(
        "/api/v1/admin/emergency/deals/resume",
        json={"reason": "Bank confirmed it is fixed"},
        headers=H,
    )


async def test_a_pause_freezes_the_clocks_and_gives_the_time_back(
    db_settings: Settings,
    esc: Escrow,
    owner: Party,
    taker: Party,
    deal: dict[str, Any],
    staff: Admin,
    boss: AsyncClient,
) -> None:
    await _open(esc, deal, owner)
    before = await _sql(db_settings, "SELECT funding_deadline FROM settlements")
    r = await _pause(boss)
    assert r.status_code == 200 and r.json()["paused"] is True, r.text
    # No new deals while paused.
    r = await owner.publish(source_amount="100.00", desired_rate="1320.50")
    assert r.status_code == 503 and _code(r) == "SYS_503_SERVICE_UNAVAILABLE", r.text
    assert r.json()["error"]["details"]["reason"] == "deals_paused"
    # The funding window would have run out, but nothing is expired while paused.
    for _ in range(5):  # the customers keep the app open
        _advance(esc, staff, minutes=2)
        assert (
            await owner.env.client.get("/api/v1/users/me", headers=owner._h())
        ).status_code == 200
        assert (await boss.get("/api/v1/admin/me", headers=H)).status_code == 200
    await esc.tick(2)
    assert await _phase(db_settings) == "AWAITING_FUNDING"
    r = await _resume(boss)
    assert r.status_code == 200 and r.json()["paused"] is False, r.text
    details = r.json()["pause"]["details"]
    assert details["paused_seconds"] == 600 and details["funding_windows_extended"] == 1
    after: datetime = await _sql(db_settings, "SELECT funding_deadline FROM settlements")
    assert (after - before).total_seconds() == 600
    assert (
        await _sql(
            db_settings,
            "SELECT count(*) FROM settlement_events WHERE event_type = 'DeadlineExtended'",
        )
        == 1
    )
    # Deals work again.
    r = await owner.publish(source_amount="100.00", desired_rate="1320.50")
    assert r.status_code == 201, r.text
    actions = await _sql(
        db_settings,
        "SELECT string_agg(action, ',' ORDER BY id) FROM staff_audit_log WHERE target_type = 'deal_pause'",
    )
    assert actions == "deals_paused,deals_resumed"


async def test_bank_commands_are_held_while_paused(
    db_settings: Settings,
    esc: Escrow,
    owner: Party,
    taker: Party,
    deal: dict[str, Any],
    staff: Admin,
    boss: AsyncClient,
) -> None:
    assert await _phase(db_settings) == "INITIALIZING"
    waiting = await _sql(
        db_settings, "SELECT count(*) FROM outbox_messages WHERE status = 'PENDING'"
    )
    assert waiting > 0
    assert (await _pause(boss)).status_code == 200
    await esc.tick(2)
    # The escrow-opening commands never left.
    assert await _phase(db_settings) == "INITIALIZING"
    assert (
        await _sql(db_settings, "SELECT count(*) FROM outbox_messages WHERE status = 'PENDING'")
        == waiting
    )
    assert (await _resume(boss)).status_code == 200
    await esc.tick()
    assert await _phase(db_settings) == "AWAITING_FUNDING"


async def test_only_super_admins_with_a_reason(
    db_settings: Settings, esc: Escrow, owner: Party, staff: Admin, boss: AsyncClient
) -> None:
    officer = await staff.invite(boss, "officer@xspeeria.test", "compliance_officer")
    assert (
        await officer.post("/api/v1/admin/emergency/deals/pause", json=REASON, headers=H)
    ).status_code == 403
    assert (await officer.get("/api/v1/admin/emergency/deals", headers=H)).status_code == 403
    assert (
        await boss.post("/api/v1/admin/emergency/deals/pause", json={"reason": "no"}, headers=H)
    ).status_code == 422
    assert (await boss.post("/api/v1/admin/emergency/deals/pause", json=REASON)).status_code in (
        401,
        403,
    )
    assert (await _resume(boss)).status_code == 409  # not paused
    assert (await _pause(boss)).status_code == 200
    r = await _pause(boss)
    assert r.status_code == 409 and _code(r) == "RES_409_ALREADY_PAUSED"
    status = (await boss.get("/api/v1/admin/emergency/deals", headers=H)).json()
    assert status["paused"] is True and status["pause"]["reason"] == REASON["reason"]


async def test_ending_every_session_signs_everyone_out_but_me(
    db_settings: Settings, esc: Escrow, owner: Party, taker: Party, staff: Admin, boss: AsyncClient
) -> None:
    officer = await staff.invite(boss, "officer@xspeeria.test", "compliance_officer")
    assert (await owner.env.client.get("/api/v1/users/me", headers=owner._h())).status_code == 200
    r = await boss.post(
        "/api/v1/admin/emergency/sessions/end",
        json={"who": "everyone", "reason": "Suspected stolen session tokens"},
        headers=H,
    )
    assert r.status_code == 200, r.text
    assert r.json()["customer_sessions"] >= 2 and r.json()["staff_sessions"] >= 1
    # Customers and other staff are signed out; the Super Admin who did it is not.
    assert (await owner.env.client.get("/api/v1/users/me", headers=owner._h())).status_code == 401
    assert (await taker.env.client.get("/api/v1/users/me", headers=taker._h())).status_code == 401
    assert (await officer.get("/api/v1/admin/me", headers=H)).status_code == 401
    assert (await boss.get("/api/v1/admin/me", headers=H)).status_code == 200
    reasons = await _sql(
        db_settings, "SELECT string_agg(DISTINCT revoke_reason, ',') FROM auth_sessions"
    )
    assert reasons == "incident"
    # Only a Super Admin, and a reason is required.
    r = await boss.post(
        "/api/v1/admin/emergency/sessions/end", json={"who": "all", "reason": "x" * 10}, headers=H
    )
    assert r.status_code == 422


async def test_each_use_alerts_the_other_super_admins(
    db_settings: Settings, esc: Escrow, owner: Party, staff: Admin, boss: AsyncClient
) -> None:
    assert (await _pause(boss)).status_code == 200
    engine = build_engine(staff.db_settings)
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as db:
            raised = await OpsAlertService(db, staff.clock, None, staff.runtime.email).scan()
    finally:
        await engine.dispose()
    assert [(a.rule, a.severity) for a in raised] == [("emergency_control_used", "P1")]
    assert any(e.ops_alert and e.ops_alert.startswith("P1 #") for e in staff.mail.sent)
