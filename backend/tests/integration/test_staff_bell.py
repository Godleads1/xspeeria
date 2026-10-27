# ruff: noqa: F811, E501  -- pytest fixtures are imported by name and used as parameters
"""Staff bell: work waiting for you (ADR-070; owner 2026-10-27).

Read live from the queues, filtered by what each role may act on; the badge counts work newer
than the last time the person opened the panel; checking the bell never keeps an idle session
alive.
"""

from __future__ import annotations

import uuid
from typing import Any

import pytest
from httpx import AsyncClient

from app.core.config import Settings
from tests.integration.test_admin_kyc_review import _case_id, boss, staff  # noqa: F401
from tests.integration.test_admin_staff import Admin, H
from tests.integration.test_auth_api import _sql, clean, migrated  # noqa: F401
from tests.integration.test_kyc_api import K, _verify, k  # noqa: F401
from tests.integration.test_matches_api import OWNER

pytestmark = [pytest.mark.integration, pytest.mark.asyncio]

BELL = "/api/v1/admin/notifications"


async def _bell(c: AsyncClient) -> dict[str, Any]:
    r = await c.get(BELL, headers=H)
    assert r.status_code == 200, r.text
    body: dict[str, Any] = r.json()
    return body


async def test_two_person_check_moves_through_the_bells(
    db_settings: Settings, k: K, staff: Admin, boss: AsyncClient
) -> None:
    officer = await staff.invite(boss, "officer@xspeeria.test", "compliance_officer")
    agent = await staff.invite(boss, "agent@xspeeria.test", "support_agent")
    assert await _bell(boss) == {"items": [], "total": 0, "new": 0, "seen_at": None}

    _, uid, _ = await _verify(k, OWNER, document="B1", seen_for=str(uuid.uuid4()))
    cid = await _case_id(db_settings, uid)
    feed = await _bell(boss)
    assert feed["total"] == 1 and feed["new"] == 1
    item = feed["items"][0]
    assert item["kind"] == "kyc_recommend" and item["id"] == cid and item["new"] is True
    assert item["ref"] == "KYC-" + cid.split("-")[0].upper()
    # A support agent can't act on identity checks: nothing for them.
    assert (await _bell(agent))["total"] == 0

    # Opening the panel: still listed, no longer new.
    staff.clock.advance(minutes=1)
    assert (await boss.post(f"{BELL}/seen", headers=H)).status_code == 204
    feed = await _bell(boss)
    assert feed["total"] == 1 and feed["new"] == 0 and feed["items"][0]["new"] is False

    # The boss recommends: it leaves the boss's bell (never your own), reaches the officer's.
    staff.clock.advance(minutes=1)
    r = await boss.post(
        f"/api/v1/admin/kyc/cases/{cid}/recommend",
        json={"reason": "Checked by phone; old account was a test"},
        headers=H,
    )
    assert r.status_code == 204, r.text
    assert (await _bell(boss))["total"] == 0
    feed = await _bell(officer)
    assert [i["kind"] for i in feed["items"]] == ["kyc_confirm"] and feed["new"] == 1

    # Confirmed: gone from every bell.
    assert (
        await officer.post(f"/api/v1/admin/kyc/cases/{cid}/confirm", json={}, headers=H)
    ).status_code == 204
    assert (await _bell(officer))["total"] == 0
    assert (await _bell(boss))["total"] == 0


async def test_fraud_alerts_reach_those_who_can_work_them(
    db_settings: Settings, k: K, staff: Admin, boss: AsyncClient
) -> None:
    officer = await staff.invite(boss, "officer@xspeeria.test", "compliance_officer")
    ops = await staff.invite(boss, "ops@xspeeria.test", "ops_admin")
    _, uid, _ = await _verify(k, OWNER)
    await _sql(
        db_settings,
        "INSERT INTO fraud_alerts (id, user_id, rule, severity, status, subject, details, created_at, updated_at) "
        "VALUES (gen_random_uuid(), CAST(:u AS uuid), 'pin_lockout', 'high', 'open', 'pin', '{}', now(), now())",
        u=uid,
    )
    feed = await _bell(officer)
    assert [(i["kind"], i["detail"]) for i in feed["items"]] == [("fraud", "high")]
    assert feed["items"][0]["ref"].startswith("#")
    assert (await _bell(ops))["total"] == 0  # read-only on fraud
    await _sql(db_settings, "UPDATE fraud_alerts SET status = 'in_progress'")
    assert (await _bell(officer))["total"] == 0


async def test_checking_the_bell_does_not_keep_a_session_alive(
    db_settings: Settings, k: K, staff: Admin, boss: AsyncClient
) -> None:
    for _ in range(3):
        staff.clock.advance(minutes=4)
        assert (await boss.get(BELL, headers=H)).status_code == 200
    # 16 minutes with only bell checks: the 15-minute idle limit has passed.
    staff.clock.advance(minutes=4)
    assert (await boss.get(BELL, headers=H)).status_code == 401
    assert (await boss.get("/api/v1/admin/me", headers=H)).status_code == 401


async def test_signed_out_and_wrong_input(staff: Admin, boss: AsyncClient) -> None:
    async with staff.client() as anon:
        assert (await anon.get(BELL, headers=H)).status_code == 401
        assert (await anon.post(f"{BELL}/seen", headers=H)).status_code == 401
    # Nothing to choose: the server decides who you are and what you see.
    r = await boss.get(f"{BELL}?staff_id={uuid.uuid4()}&kind=fraud", headers=H)
    assert r.status_code == 200 and r.json()["total"] == 0
