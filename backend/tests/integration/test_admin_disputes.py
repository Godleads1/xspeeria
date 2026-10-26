# ruff: noqa: F811, E501  -- pytest fixtures are imported by name and used as parameters
"""Admin console disputes (ADR-063): categories, list, case, reply, assign, escalate, resolve.

Owner decisions 2026-10-26: staff-managed categories (starting with the app's four); SLA 24 h.
Resolving ends the escrow pause; the escrow then follows its own rules (no money moved here).
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

import pytest
import pytest_asyncio
from httpx import AsyncClient

from app.core.config import Settings
from tests.integration.test_admin_staff import BOSS, BOSS_PW, Admin, H
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
    _phase,
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


@pytest_asyncio.fixture
async def staff(db_settings: Settings, owner: Party, taker: Party) -> AsyncIterator[Admin]:
    """Made after the customers: their setup clears the staff tables first."""
    # Categories are kept between tests (the four built-in ones are seeded by the migration).
    await _sql(
        db_settings,
        "DELETE FROM dispute_categories WHERE code NOT IN "
        "('funds_not_received', 'wrong_amount', 'counterparty_unresponsive', 'other')",
    )
    await _sql(db_settings, "UPDATE dispute_categories SET active = true")
    clock = Clock()
    a = Admin(db_settings, clock, _runtime(clock, None, 10_000))
    await a.service_call("create_first_super_admin", BOSS, "The Boss", BOSS_PW)
    yield a
    for c in a.opened:
        await c.aclose()


@pytest_asyncio.fixture
async def boss(staff: Admin) -> AsyncIterator[AsyncClient]:
    async with staff.client() as c:
        assert (await staff.login(c, BOSS, BOSS_PW)).status_code == 200
        yield c


async def _dispute(
    esc: Escrow, deal: dict[str, Any], owner: Party, reason: str = "funds_not_received"
) -> dict[str, Any]:
    v = await _open(esc, deal, owner)
    r = await owner.env.client.post(
        "/api/v1/disputes",
        json={
            "transaction_id": v["transaction_id"],
            "reason": reason,
            "description": "I paid, nothing came",
        },
        headers=owner._h(),
    )
    assert r.status_code == 201, r.text
    return dict(r.json())


async def test_categories_start_with_the_app_four_and_staff_manage_them(
    db_settings: Settings, staff: Admin, boss: AsyncClient, owner: Party
) -> None:
    app = await owner.env.client.get("/api/v1/disputes/categories", headers=owner._h())
    assert [c["code"] for c in app.json()] == [
        "funds_not_received",
        "wrong_amount",
        "counterparty_unresponsive",
        "other",
    ]
    r = await boss.post(
        "/api/v1/admin/dispute-categories",
        json={"name": "Technical Problem", "description": "App issues"},
        headers=H,
    )
    assert r.status_code == 201 and r.json()["code"] == "technical_problem", r.text
    assert (
        await boss.post(
            "/api/v1/admin/dispute-categories", json={"name": "technical problem"}, headers=H
        )
    ).status_code == 409
    # The app sees it and a customer can use it for a support case.
    codes = [
        c["code"]
        for c in (
            await owner.env.client.get("/api/v1/disputes/categories", headers=owner._h())
        ).json()
    ]
    assert "technical_problem" in codes
    r = await owner.env.client.post(
        "/api/v1/disputes",
        json={"reason": "technical_problem", "description": "App freezes"},
        headers=owner._h(),
    )
    assert r.status_code == 201, r.text
    # Switched off: hidden from the app and refused.
    assert (
        await boss.put(
            "/api/v1/admin/dispute-categories/technical_problem",
            json={"name": "Technical Problem", "active": False},
            headers=H,
        )
    ).status_code == 200
    assert "technical_problem" not in str(
        (await owner.env.client.get("/api/v1/disputes/categories", headers=owner._h())).json()
    )
    r = await owner.env.client.post(
        "/api/v1/disputes",
        json={"reason": "technical_problem", "description": "Again"},
        headers=owner._h(),
    )
    assert r.status_code == 422
    # Only staff who can resolve disputes manage the list.
    agent = await staff.invite(boss, "agent@xspeeria.test", "support_agent")
    assert (await agent.get("/api/v1/admin/dispute-categories", headers=H)).status_code == 200
    assert (
        await agent.post("/api/v1/admin/dispute-categories", json={"name": "Mine"}, headers=H)
    ).status_code == 403


async def test_staff_see_both_sides_work_the_case_and_resolving_lifts_the_pause(
    db_settings: Settings,
    esc: Escrow,
    staff: Admin,
    boss: AsyncClient,
    owner: Party,
    taker: Party,
    deal: dict[str, Any],
) -> None:
    d = await _dispute(esc, deal, owner)
    did = d["dispute_id"]
    listed = (await boss.get("/api/v1/admin/disputes", headers=H)).json()
    [row] = listed["items"]
    assert row["status"] == "open" and row["category_name"] == "Funds not received"
    assert row["sla_due_at"] and listed["now"]
    stats = (await boss.get("/api/v1/admin/disputes/stats", headers=H)).json()
    assert stats["pending"] == 1 and stats["total"] == 1
    case = (await boss.get(f"/api/v1/admin/disputes/{did}", headers=H)).json()
    assert case["description"] == "I paid, nothing came"
    assert case["deal"]["escrow_paused"] is True and len(case["deal"]["legs"]) == 2
    assert case["deal"]["other_party"]["email"] == TAKER[1] and case["customer_email"] == OWNER[1]
    # The other party adds their side; staff see both, each party sees only their own + staff.
    await taker.env.client.post(
        f"/api/v1/disputes/{did}/evidence",
        json={"message": "I have not been paid either"},
        headers=taker._h(),
    )
    # Both test clocks start at the same moment; staff answer a minute later.
    staff.clock.advance(minutes=1)
    agent = await staff.invite(boss, "agent@xspeeria.test", "support_agent")
    agent_id = await _sql(
        db_settings, "SELECT id FROM staff_accounts WHERE email = 'agent@xspeeria.test'"
    )
    assert (
        await boss.post(
            f"/api/v1/admin/disputes/{did}/assign", json={"staff_id": str(agent_id)}, headers=H
        )
    ).status_code == 204
    assert (
        await agent.post(
            f"/api/v1/admin/disputes/{did}/messages",
            json={"message": "Please send your bank receipt."},
            headers=H,
        )
    ).status_code == 204
    assert (
        await agent.post(
            f"/api/v1/admin/disputes/{did}/escalate",
            json={"reason": "Large amount, needs a senior"},
            headers=H,
        )
    ).status_code == 204
    case = (await agent.get(f"/api/v1/admin/disputes/{did}", headers=H)).json()
    assert case["status"] == "under_review" and case["escalated"] and case["priority"] == "high"
    assert case["assigned_name"] == "New Person"
    assert [m["author"] for m in case["messages"]] == ["other_party", "staff"]
    assert [t["event"] for t in case["timeline"]] == [
        "created",
        "dispute_assigned",
        "dispute_replied",
        "dispute_escalated",
    ]
    mine = (await owner.env.client.get(f"/api/v1/disputes/{did}", headers=owner._h())).json()
    assert [m["author"] for m in mine["messages"]] == ["staff"]
    notes = await _sql(
        db_settings, "SELECT count(*) FROM notifications WHERE payload->>'event' = 'dispute.reply'"
    )
    assert notes == 1
    # Only someone who can approve closes it; the support agent can't.
    assert (
        await agent.post(
            f"/api/v1/admin/disputes/{did}/resolve", json={"outcome": "favor_initiator"}, headers=H
        )
    ).status_code == 403
    r = await boss.post(
        f"/api/v1/admin/disputes/{did}/resolve",
        json={"outcome": "favor_initiator", "note": "Receipt checked"},
        headers=H,
    )
    assert r.status_code == 204, r.text
    assert (
        await _sql(db_settings, "SELECT count(*) FROM settlement_holds WHERE closed_at IS NULL")
        == 0
    )
    assert "HoldClosed" in str(
        await _sql(db_settings, "SELECT string_agg(event_type, ',') FROM settlement_events")
    )
    # No money moved by closing it: the escrow is where it was.
    assert await _phase(db_settings) == "AWAITING_FUNDING"
    assert (
        await boss.post(
            f"/api/v1/admin/disputes/{did}/messages", json={"message": "late"}, headers=H
        )
    ).status_code == 409
    assert (await owner.env.client.get(f"/api/v1/disputes/{did}", headers=owner._h())).json()[
        "status"
    ] == "resolved"


async def test_staff_open_a_case_for_a_customer(
    db_settings: Settings,
    esc: Escrow,
    staff: Admin,
    boss: AsyncClient,
    owner: Party,
    taker: Party,
    deal: dict[str, Any],
) -> None:
    v = await _open(esc, deal, owner)
    uid = await _sql(
        db_settings, "SELECT id FROM users WHERE id = (SELECT user_id FROM offers LIMIT 1)"
    )
    body = {
        "user_id": str(uid),
        "transaction_id": v["transaction_id"],
        "category": "wrong_amount",
        "description": "Customer called: amount was short",
        "desired_resolution": "Pay the difference",
        "priority": "high",
    }
    r = await boss.post("/api/v1/admin/disputes", json=body, headers=H)
    assert r.status_code == 201, r.text
    case = (await boss.get(f"/api/v1/admin/disputes/{r.json()['id']}", headers=H)).json()
    assert (
        case["opened_by_staff"]
        and case["priority"] == "high"
        and case["desired_resolution"] == "Pay the difference"
    )
    assert case["deal"]["escrow_paused"]
    # Same rules as the app: one open dispute per deal; the customer must be a party.
    assert (await boss.post("/api/v1/admin/disputes", json=body, headers=H)).status_code == 409
    agent = await staff.invite(boss, "comp@xspeeria.test", "compliance_officer")
    assert (await agent.post("/api/v1/admin/disputes", json=body, headers=H)).status_code == 403


async def test_validation_and_access(
    db_settings: Settings, staff: Admin, boss: AsyncClient
) -> None:
    missing = "00000000-0000-0000-0000-000000000000"
    assert (await boss.get(f"/api/v1/admin/disputes/{missing}", headers=H)).status_code == 404
    assert (
        await boss.post(
            f"/api/v1/admin/disputes/{missing}/escalate", json={"reason": "no"}, headers=H
        )
    ).status_code == 422
    assert (
        await boss.post(
            f"/api/v1/admin/disputes/{missing}/resolve", json={"outcome": "refund_all"}, headers=H
        )
    ).status_code == 422
    assert (
        await boss.get("/api/v1/admin/disputes", params={"status": "closed"}, headers=H)
    ).status_code == 422
    assert (await boss.get("/api/v1/admin/disputes")).status_code == 403
    async with staff.client() as stranger:
        assert (await stranger.get("/api/v1/admin/disputes", headers=H)).status_code == 401
