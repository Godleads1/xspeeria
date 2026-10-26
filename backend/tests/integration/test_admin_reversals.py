# ruff: noqa: F811, E501  -- pytest fixtures are imported by name and used as parameters
"""Reversals (ADR-065): staff ask, a *different* staff member approves, the escrow goes back.

Owner decision 2026-10-26 "Return escrow to payer": only money still in escrow, before any
payout, goes back to whoever paid it in, in full (fee included). ADR-051 decision 4: never
approved by the person who asked. Also covers the ADR-063 fix: closing a dispute (or rejecting a
refund) when both sides have paid in lets the payout go ahead instead of waiting or unwinding.
"""

from __future__ import annotations

from typing import Any

import pytest
from httpx import AsyncClient

from app.core.config import Settings
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
    _offer,
    _open,
    _pay,
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


async def _both_paid_and_disputed(
    esc: Escrow, deal: dict[str, Any], owner: Party, taker: Party
) -> str:
    """A deal where the owner paid in, then disputed, then the taker paid in: held, not paid out."""
    await _open(esc, deal, owner)
    assert (await _pay(owner, deal["match_id"])).status_code == 200
    d = await _dispute(esc, deal, owner)
    assert (await _pay(taker, deal["match_id"])).status_code == 200
    assert await _phase(esc.db_settings) == "AWAITING_FUNDING"  # the dispute holds the payout
    return str(d["dispute_id"])


async def _approver(staff: Admin, boss: AsyncClient) -> AsyncClient:
    return await staff.invite(boss, "ops@xspeeria.test", "ops_admin")


async def test_refund_is_approved_by_someone_else_and_both_escrows_go_back_in_full(
    db_settings: Settings,
    esc: Escrow,
    staff: Admin,
    boss: AsyncClient,
    owner: Party,
    taker: Party,
    deal: dict[str, Any],
) -> None:
    did = await _both_paid_and_disputed(esc, deal, owner, taker)
    ops = await _approver(staff, boss)
    case = (await boss.get(f"/api/v1/admin/disputes/{did}", headers=H)).json()
    assert case["can_refund"] is True and case["reversals"] == []
    r = await boss.post(
        f"/api/v1/admin/disputes/{did}/refund", json={"reason": "Seller never delivered"}, headers=H
    )
    assert r.status_code == 201, r.text
    rid, ref = r.json()["id"], r.json()["ref"]
    assert ref.startswith("RVL-")
    # A second request while one waits is refused; the case shows the pending one.
    assert (
        await boss.post(f"/api/v1/admin/disputes/{did}/refund", json={"reason": "again"}, headers=H)
    ).status_code == 409
    case = (await boss.get(f"/api/v1/admin/disputes/{did}", headers=H)).json()
    assert case["can_refund"] is False and case["reversals"][0]["status"] == "pending"
    # The case can't be closed while the refund waits (no contradicting decisions).
    r = await boss.post(
        f"/api/v1/admin/disputes/{did}/resolve", json={"outcome": "favor_initiator"}, headers=H
    )
    assert r.status_code == 409 and r.json()["error"]["code"] == "RES_409_REFUND_PENDING"
    await esc.tick(2)
    assert await _phase(db_settings) == "AWAITING_FUNDING"
    # The list, counts and details.
    listed = (await ops.get("/api/v1/admin/reversals", headers=H)).json()
    [row] = listed["items"]
    assert row["ref"] == ref and row["status"] == "pending" and row["requested_by"] == "The Boss"
    assert {x["currency"] for x in row["returns"]} == {"NGN", "USD"}
    assert (await ops.get("/api/v1/admin/reversals/stats", headers=H)).json() == {
        "total": 1,
        "approved": 0,
        "pending": 1,
        "rejected": 0,
    }
    detail = (await ops.get(f"/api/v1/admin/reversals/{rid}", headers=H)).json()
    assert detail["can_return"] is True and len(detail["returns"]) == 2
    legs = await _sql(
        db_settings,
        "SELECT string_agg(currency || ':' || (amount_minor + fee_minor)::text, ',' ORDER BY currency) FROM settlement_legs",
    )
    assert sorted(f"{x['currency']}:{x['minor']}" for x in detail["returns"]) == legs.split(",")
    # Never on your own request (server rule and database CHECK).
    r = await boss.post(f"/api/v1/admin/reversals/{rid}/approve", json={}, headers=H)
    assert r.status_code == 403 and r.json()["error"]["code"] == "AUTH_403_OWN_REQUEST"
    r = await boss.post(
        f"/api/v1/admin/reversals/{rid}/reject", json={"note": "Changed my mind"}, headers=H
    )
    assert r.status_code == 403 and r.json()["error"]["code"] == "AUTH_403_OWN_REQUEST"
    # The database refuses it too, whatever the code does.
    boss_id = await _sql(
        db_settings, "SELECT id FROM staff_accounts WHERE email = 'boss@xspeeria.test'"
    )
    with pytest.raises(Exception, match="not_own_request"):
        await _sql(
            db_settings,
            f"UPDATE reversals SET status = 'approved', decided_by = '{boss_id}', decided_at = now() WHERE id = '{rid}'",
        )
    with pytest.raises(Exception, match="cannot be rewritten"):
        await _sql(
            db_settings, f"UPDATE reversals SET reason = 'something else' WHERE id = '{rid}'"
        )
    r = await ops.post(
        f"/api/v1/admin/reversals/{rid}/approve", json={"note": "Checked the receipts"}, headers=H
    )
    assert r.status_code == 204, r.text
    assert (
        await ops.post(f"/api/v1/admin/reversals/{rid}/approve", json={}, headers=H)
    ).status_code == 409
    # The bank returns both escrows; nothing is paid out.
    await esc.tick(3)
    assert await _phase(db_settings) == "CLOSED_UNWOUND"
    assert await _sql(db_settings, "SELECT closure_reason FROM settlements") == "REVERSED"
    assert (
        await _sql(db_settings, "SELECT string_agg(DISTINCT state, ',') FROM settlement_legs")
        == "RETURNED"
    )
    assert (
        await _sql(db_settings, "SELECT count(*) FROM outbox_messages WHERE operation='RELEASE'")
        == 0
    )
    assert await _offer(db_settings) == ("open", 0)  # the deal's amount is back on the offer
    # The refund's hold is closed; only the dispute's remains until the case is closed.
    assert (
        await _sql(
            db_settings,
            "SELECT string_agg(type, ',') FROM settlement_holds WHERE closed_at IS NULL",
        )
        == "DISPUTE"
    )
    actions = await _sql(
        db_settings,
        "SELECT string_agg(action, ',' ORDER BY at, action) FROM staff_audit_log WHERE action LIKE '%refund%' OR action LIKE 'reversal%'",
    )
    for a in (
        "reversal_requested",
        "dispute_refund_requested",
        "reversal_approved",
        "dispute_refund_approved",
    ):
        assert a in actions
    event = await _sql(
        db_settings,
        "SELECT payload->>'reversal_id' FROM settlement_events WHERE event_type = 'ReversalApproved'",
    )
    assert event == rid  # the ledger points at the staff decision
    # Now the case can be closed.
    assert (
        await boss.post(
            f"/api/v1/admin/disputes/{did}/resolve", json={"outcome": "favor_initiator"}, headers=H
        )
    ).status_code == 204
    detail = (await ops.get(f"/api/v1/admin/reversals/{rid}", headers=H)).json()
    assert detail["status"] == "approved" and detail["decided_by"] == "New Person"
    assert detail["deal"]["closure_reason"] == "REVERSED"
    # Decided once: the database refuses a later change.
    with pytest.raises(Exception, match="already decided"):
        await _sql(
            db_settings,
            f"UPDATE reversals SET status = 'rejected', decision_note = 'x' WHERE id = '{rid}'",
        )


async def test_rejected_refund_lets_the_payout_go_ahead(
    db_settings: Settings,
    esc: Escrow,
    staff: Admin,
    boss: AsyncClient,
    owner: Party,
    taker: Party,
    deal: dict[str, Any],
) -> None:
    did = await _both_paid_and_disputed(esc, deal, owner, taker)
    ops = await _approver(staff, boss)
    rid = (
        await boss.post(
            f"/api/v1/admin/disputes/{did}/refund", json={"reason": "Customer asked"}, headers=H
        )
    ).json()["id"]
    # Someone without reversals.approve can't decide.
    agent = await staff.invite(boss, "agent@xspeeria.test", "support_agent")
    assert (
        await agent.post(
            f"/api/v1/admin/reversals/{rid}/reject", json={"note": "no no no"}, headers=H
        )
    ).status_code == 403
    # A reason is required to reject.
    assert (
        await ops.post(f"/api/v1/admin/reversals/{rid}/reject", json={}, headers=H)
    ).status_code == 422
    r = await ops.post(
        f"/api/v1/admin/reversals/{rid}/reject",
        json={"note": "Both sides paid; the deal stands"},
        headers=H,
    )
    assert r.status_code == 204, r.text
    # The dispute still holds the deal; closing it lets the payout go ahead.
    assert await _phase(db_settings) == "AWAITING_FUNDING"
    assert (
        await boss.post(
            f"/api/v1/admin/disputes/{did}/resolve",
            json={"outcome": "favor_counterparty"},
            headers=H,
        )
    ).status_code == 204
    assert await _phase(db_settings) == "RELEASING"
    await esc.tick(3)
    assert await _phase(db_settings) == "COMPLETED"
    assert (
        await _sql(db_settings, "SELECT count(*) FROM outbox_messages WHERE operation='RETURN'")
        == 0
    )
    stats = (await ops.get("/api/v1/admin/reversals/stats", headers=H)).json()
    assert stats["rejected"] == 1 and stats["pending"] == 0


async def test_closing_a_dispute_after_both_paid_pays_out_even_after_the_window(
    db_settings: Settings,
    esc: Escrow,
    staff: Admin,
    boss: AsyncClient,
    owner: Party,
    taker: Party,
    deal: dict[str, Any],
) -> None:
    """ADR-063 promised the escrow "continues under its own rules"; nothing re-checked it, and
    after the window it would have been returned instead of paid out (fixed in ADR-065)."""
    did = await _both_paid_and_disputed(esc, deal, owner, taker)
    esc.env.clock.advance(minutes=30)
    staff.clock.advance(minutes=30)
    await esc.tick(2)
    assert await _phase(db_settings) == "AWAITING_FUNDING"  # held: staff decide, not the clock
    async with staff.client() as again:
        from tests.integration.test_admin_staff import BOSS, BOSS_PW

        assert (await staff.login(again, BOSS, BOSS_PW)).status_code == 200
        r = await again.post(
            f"/api/v1/admin/disputes/{did}/resolve", json={"outcome": "no_fault"}, headers=H
        )
        assert r.status_code == 204, r.text
    assert await _phase(db_settings) == "RELEASING"
    await esc.tick(3)
    assert await _phase(db_settings) == "COMPLETED"


async def test_money_paid_in_after_approval_goes_back_too(
    db_settings: Settings,
    esc: Escrow,
    staff: Admin,
    boss: AsyncClient,
    owner: Party,
    taker: Party,
    deal: dict[str, Any],
) -> None:
    """Only the owner had paid in when the refund was approved; the taker pays in afterwards."""
    await _open(esc, deal, owner)
    await _pay(owner, deal["match_id"])
    did = (await _dispute(esc, deal, owner))["dispute_id"]
    ops = await _approver(staff, boss)
    rid = (
        await boss.post(
            f"/api/v1/admin/disputes/{did}/refund", json={"reason": "Wrong amount"}, headers=H
        )
    ).json()["id"]
    assert (
        await ops.post(f"/api/v1/admin/reversals/{rid}/approve", json={}, headers=H)
    ).status_code == 204
    assert await _phase(db_settings) == "UNWINDING"
    leg = await _sql(
        db_settings,
        "SELECT leg_id::text || ':' || (amount_minor + fee_minor)::text FROM settlement_legs WHERE state = 'ESCROW_PROVISIONED'",
    )
    leg_id, total = leg.split(":")
    import uuid

    esc.bank.simulate_pay_in(uuid.UUID(leg_id), int(total))
    await esc.tick(4)
    assert await _phase(db_settings) == "CLOSED_UNWOUND"
    assert await _sql(db_settings, "SELECT closure_reason FROM settlements") == "REVERSED"
    assert (
        await _sql(db_settings, "SELECT string_agg(DISTINCT state, ',') FROM settlement_legs")
        == "RETURNED"
    )
    assert (
        await _sql(db_settings, "SELECT count(*) FROM outbox_messages WHERE operation='RELEASE'")
        == 0
    )


async def test_a_request_must_start_pending_with_its_own_hold(
    db_settings: Settings,
    esc: Escrow,
    staff: Admin,
    boss: AsyncClient,
    owner: Party,
    taker: Party,
    deal: dict[str, Any],
) -> None:
    """Database guard: a row can't be inserted already decided, or pointing at another hold."""
    did = await _both_paid_and_disputed(esc, deal, owner, taker)
    boss_id = await _sql(
        db_settings, "SELECT id FROM staff_accounts WHERE email = 'boss@xspeeria.test'"
    )
    sid = await _sql(db_settings, "SELECT id FROM settlements")
    hold = await _sql(db_settings, "SELECT id FROM settlement_holds WHERE type = 'DISPUTE'")
    cols = "id, dispute_id, settlement_id, hold_id, status, reason, requested_by, requested_at"
    vals = f"gen_random_uuid(), '{did}', '{sid}', '{hold}'"
    with pytest.raises(Exception, match="starts as pending"):
        await _sql(
            db_settings,
            f"INSERT INTO reversals ({cols}, decided_at) "
            f"VALUES ({vals}, 'approved', 'sneaky', '{boss_id}', now(), now())",
        )
    with pytest.raises(Exception, match="REVERSAL hold"):
        await _sql(
            db_settings,
            f"INSERT INTO reversals ({cols}) VALUES ({vals}, 'pending', 'sneaky', '{boss_id}', now())",
        )


async def test_validation_and_access(
    db_settings: Settings,
    esc: Escrow,
    staff: Admin,
    boss: AsyncClient,
    owner: Party,
    taker: Party,
    deal: dict[str, Any],
) -> None:
    await _open(esc, deal, owner)
    did = (await _dispute(esc, deal, owner))["dispute_id"]
    # Nothing paid in yet: nothing to return.
    r = await boss.post(
        f"/api/v1/admin/disputes/{did}/refund", json={"reason": "Customer asked"}, headers=H
    )
    assert r.status_code == 409 and r.json()["error"]["details"]["problem"] == "nothing_paid_in"
    await _pay(owner, deal["match_id"])
    # A support agent can work disputes but not ask for refunds or see reversals.
    agent = await staff.invite(boss, "agent@xspeeria.test", "support_agent")
    assert (
        await agent.post(
            f"/api/v1/admin/disputes/{did}/refund", json={"reason": "x y z"}, headers=H
        )
    ).status_code == 403
    assert (await agent.get("/api/v1/admin/reversals", headers=H)).status_code == 403
    # Strict input: too short a reason, unknown fields, a made-up id.
    for body in ({"reason": "x"}, {"reason": "ok reason", "amount": "100"}):
        assert (
            await boss.post(f"/api/v1/admin/disputes/{did}/refund", json=body, headers=H)
        ).status_code == 422
    bad = "00000000-0000-0000-0000-000000000000"
    assert (await boss.get(f"/api/v1/admin/reversals/{bad}", headers=H)).status_code == 404
    assert (
        await boss.post(f"/api/v1/admin/reversals/{bad}/approve", json={}, headers=H)
    ).status_code == 404
    # Without the admin header nothing works.
    assert (await boss.get("/api/v1/admin/reversals")).status_code == 403
    # A resolved case can't ask for a refund any more.
    await boss.post(f"/api/v1/admin/disputes/{did}/resolve", json={"outcome": "split"}, headers=H)
    assert (
        await boss.post(
            f"/api/v1/admin/disputes/{did}/refund", json={"reason": "Too late"}, headers=H
        )
    ).status_code == 409


async def test_the_app_role_can_never_delete_a_reversal(db_settings: Settings) -> None:
    grants = await _sql(
        db_settings,
        "SELECT string_agg(privilege_type, ',' ORDER BY privilege_type) "
        "FROM information_schema.role_table_grants "
        "WHERE grantee = 'xspeeria_app' AND table_name = 'reversals'",
    )
    assert grants == "INSERT,SELECT,UPDATE"
