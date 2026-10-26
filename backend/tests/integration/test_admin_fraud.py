# ruff: noqa: F811, E501  -- pytest fixtures are imported by name and used as parameters
"""Fraud Management (ADR-068; owner 2026-10-26 "Simple rules + staff flag").

Simple rules over data Xspeeria already has raise alerts (once per thing they are about);
staff can raise one by hand; staff work and resolve them. An alert never blocks or moves money.
"""

from __future__ import annotations

from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.core.config import Settings
from app.db.session import build_engine
from app.services import fraud as fraud_module
from app.services.fraud import FraudService, names_share_a_word
from tests.integration.test_admin_disputes import _dispute, boss, staff  # noqa: F401
from tests.integration.test_admin_staff import Admin, H
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
    deal,
    esc,
    owner,
    partners,
    taker,
)
from tests.integration.test_matches_api import OWNER, TAKER
from tests.integration.test_offers_api import currencies  # noqa: F401
from tests.integration.test_payouts_api import Party

pytestmark = [pytest.mark.integration, pytest.mark.asyncio]


async def _scan(db_settings: Settings, clock: Any) -> int:
    engine = build_engine(db_settings)
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as db:
            return await FraudService(db, clock).scan()
    finally:
        await engine.dispose()


async def _uid(db_settings: Settings, email: str) -> str:
    return str(await _sql(db_settings, f"SELECT id FROM users WHERE email = '{email}'"))


def test_names_share_a_word() -> None:
    assert names_share_a_word("ADA OBI", "Ada Chioma Obi")
    assert names_share_a_word("Zoë Smith", "zoe smith")
    assert not names_share_a_word("Musa Bello", "Ada Obi")
    assert names_share_a_word("", "Ada Obi")  # nothing to compare: no alert


async def test_rules_raise_alerts_once_and_staff_resolve_them(
    db_settings: Settings,
    esc: Escrow,
    staff: Admin,
    boss: AsyncClient,
    owner: Party,
    taker: Party,
    deal: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    clock = esc.env.clock
    assert await _scan(db_settings, clock) == 0
    owner_id = await _uid(db_settings, OWNER[1])
    taker_id = await _uid(db_settings, TAKER[1])
    # 1. PIN lock-out (the app locks after 5 wrong PINs).
    await _sql(
        db_settings,
        f"UPDATE users SET pin_locked_until = now() + interval '1 day' WHERE id = '{owner_id}'",
    )
    # 2. Disputes against the taker (threshold lowered for the test; real value 3 in 30 days).
    monkeypatch.setattr(fraud_module, "DISPUTES_THRESHOLD", 1)
    await _dispute(esc, deal, owner)
    # 3. A payout account in another person's name (verified as "Ada Obi").
    await _sql(
        db_settings,
        "INSERT INTO kyc_cases (id, user_id, provider, provider_session_id, provider_status, status, "
        "legal_name, date_of_birth, decided_at, created_at, updated_at, country) VALUES "
        f"(gen_random_uuid(), '{taker_id}', 'didit', 'fraud-test', 'Approved', 'approved', "
        "'Ada Obi', '1990-01-01', now(), now(), now(), 'NG')",
    )
    approved = await _sql(
        db_settings,
        f"SELECT count(*) FROM kyc_cases WHERE user_id = '{taker_id}' AND status = 'approved'",
    )
    assert approved, "the deal fixture approves both identity checks"
    if approved:
        await _sql(
            db_settings,
            f"UPDATE kyc_cases SET legal_name = 'Ada Obi' WHERE user_id = '{taker_id}' AND status = 'approved'",
        )
        await _sql(
            db_settings,
            f"UPDATE beneficiaries SET account_name = 'MUSA BELLO' WHERE user_id = '{taker_id}'",
        )
    raised = await _scan(db_settings, clock)
    rules = await _sql(db_settings, "SELECT string_agg(rule, ',' ORDER BY rule) FROM fraud_alerts")
    expected = ["disputes_against", "pin_lockout"] + (["payout_name_mismatch"] if approved else [])
    assert sorted(rules.split(",")) == sorted(expected)
    assert raised == len(expected)
    # The same things don't raise again.
    assert await _scan(db_settings, clock) == 0
    # Who they are about.
    assert (
        await _sql(db_settings, "SELECT user_id::text FROM fraud_alerts WHERE rule = 'pin_lockout'")
        == owner_id
    )
    assert (
        await _sql(
            db_settings, "SELECT user_id::text FROM fraud_alerts WHERE rule = 'disputes_against'"
        )
        == taker_id
    )
    # Details never hold a full account number, PIN or code.
    details = str(
        await _sql(db_settings, "SELECT string_agg(details::text, ' ') FROM fraud_alerts")
    )
    assert "pin" not in details.lower().replace("pin_", "")
    # Staff list, counts and one alert.
    listed = (await boss.get("/api/v1/admin/fraud-alerts", headers=H)).json()
    assert listed["total"] == len(expected)
    stats = (await boss.get("/api/v1/admin/fraud-alerts/stats", headers=H)).json()
    assert stats["open"] == len(expected) and stats["high_open"] == 1
    high = next(i for i in listed["items"] if i["rule"] == "disputes_against")
    assert high["severity"] == "high" and high["ref"].startswith("#")
    one = (await boss.get(f"/api/v1/admin/fraud-alerts/{high['id']}", headers=H)).json()
    assert one["customer_email"] == TAKER[1] and one["customer_status"] == "active"
    if approved:
        mismatch = next(i for i in listed["items"] if i["rule"] == "payout_name_mismatch")
        m = (await boss.get(f"/api/v1/admin/fraud-alerts/{mismatch['id']}", headers=H)).json()
        assert m["account_name"] == "MUSA BELLO" and m["verified_name"] == "Ada Obi"
        assert len(m["details"]["last4"]) == 4
    # Work and resolve it.
    assert (
        await boss.post(f"/api/v1/admin/fraud-alerts/{high['id']}/start", headers=H)
    ).status_code == 204
    r = await boss.post(
        f"/api/v1/admin/fraud-alerts/{high['id']}/resolve",
        json={"resolution": "false_alarm", "note": "Seller was slow, not fraud"},
        headers=H,
    )
    assert r.status_code == 204, r.text
    assert (
        await boss.post(
            f"/api/v1/admin/fraud-alerts/{high['id']}/resolve",
            json={"resolution": "confirmed", "note": "again"},
            headers=H,
        )
    ).status_code == 409
    one = (await boss.get(f"/api/v1/admin/fraud-alerts/{high['id']}", headers=H)).json()
    assert one["status"] == "resolved" and one["resolution"] == "false_alarm"
    assert one["resolved_by"] == "The Boss"
    # A resolved alert isn't raised again for the same disputes.
    assert await _scan(db_settings, clock) == 0
    # An alert never blocks the customer or the deal.
    assert await _sql(db_settings, f"SELECT status FROM users WHERE id = '{taker_id}'") == "active"
    actions = await _sql(
        db_settings,
        "SELECT string_agg(action, ',' ORDER BY at, action) FROM staff_audit_log WHERE target_type = 'fraud_alert'",
    )
    assert "fraud_alert_in_progress" in actions and "fraud_alert_resolved" in actions


async def test_staff_raise_an_alert_by_hand(
    db_settings: Settings, staff: Admin, boss: AsyncClient, owner: Party
) -> None:
    owner_id = await _uid(db_settings, OWNER[1])
    r = await boss.post(
        "/api/v1/admin/fraud-alerts",
        json={
            "user_id": owner_id,
            "severity": "medium",
            "note": "Caller asked for someone else's code",
        },
        headers=H,
    )
    assert r.status_code == 201, r.text
    one = (await boss.get(f"/api/v1/admin/fraud-alerts/{r.json()['id']}", headers=H)).json()
    assert one["rule"] == "staff_report" and one["raised_by"] == "The Boss"
    assert one["note"] == "Caller asked for someone else's code"
    listed = (await boss.get("/api/v1/admin/fraud-alerts?rule=staff_report", headers=H)).json()
    assert listed["total"] == 1


async def test_validation_and_access(
    db_settings: Settings, staff: Admin, boss: AsyncClient, owner: Party
) -> None:
    owner_id = await _uid(db_settings, OWNER[1])
    for bad in (
        {"user_id": owner_id, "severity": "critical", "note": "something odd"},
        {"user_id": owner_id, "severity": "low", "note": "x"},
        {"user_id": owner_id, "severity": "low", "note": "something odd", "rule": "pin_lockout"},
    ):
        assert (
            await boss.post("/api/v1/admin/fraud-alerts", json=bad, headers=H)
        ).status_code == 422
    missing = "00000000-0000-0000-0000-000000000000"
    assert (
        await boss.post(
            "/api/v1/admin/fraud-alerts",
            json={"user_id": missing, "severity": "low", "note": "something odd"},
            headers=H,
        )
    ).status_code == 404
    assert (await boss.get(f"/api/v1/admin/fraud-alerts/{missing}", headers=H)).status_code == 404
    # Support agents and Ops admins have no fraud access; compliance officers do.
    agent = await staff.invite(boss, "agent@xspeeria.test", "support_agent")
    assert (await agent.get("/api/v1/admin/fraud-alerts", headers=H)).status_code == 403
    officer = await staff.invite(boss, "officer@xspeeria.test", "compliance_officer")
    assert (await officer.get("/api/v1/admin/fraud-alerts", headers=H)).status_code == 200
    grants = await _sql(
        db_settings,
        "SELECT string_agg(privilege_type, ',' ORDER BY privilege_type) "
        "FROM information_schema.role_table_grants "
        "WHERE grantee = 'xspeeria_app' AND table_name = 'fraud_alerts'",
    )
    assert grants == "INSERT,SELECT,UPDATE"
