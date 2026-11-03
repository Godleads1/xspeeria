# ruff: noqa: F811, E501  -- pytest fixtures are imported by name and used as parameters
"""Staff "hold this deal" from a fraud alert (ADR-092; owner 2026-11-03: "Yes").

Compliance holds one of the alerted customer's deals while they look; nothing is paid out of
it until they release it. The funding window still runs. Holding needs fraud_alerts.approve,
the deal must be the customer's, and an alert can't be resolved while it holds a deal.
"""

from __future__ import annotations

import uuid
from typing import Any

import pytest
from httpx import AsyncClient

from app.core.config import Settings
from tests.integration.test_admin_disputes import boss, staff  # noqa: F401
from tests.integration.test_admin_staff import Admin, H
from tests.integration.test_auth_api import _sql, clean, migrated  # noqa: F401
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
from tests.integration.test_offers_api import currencies  # noqa: F401
from tests.integration.test_payouts_api import Party

pytestmark = [pytest.mark.integration, pytest.mark.asyncio]

A = "/api/v1/admin/fraud-alerts"


async def _alert(db_settings: Settings, boss: AsyncClient, party: Party) -> str:
    uid = str(await _sql(db_settings, "SELECT id FROM users WHERE phone = :p", p=party.phone))
    r = await boss.post(
        A, json={"user_id": uid, "severity": "high", "note": "Odd pattern"}, headers=H
    )
    assert r.status_code == 201, r.text
    return str(r.json()["id"])


async def _settlement(db_settings: Settings) -> str:
    return str(await _sql(db_settings, "SELECT id FROM settlements"))


async def _owner_pays_in(db_settings: Settings, esc: Escrow, owner: Party) -> None:
    leg = await _sql(
        db_settings,
        "SELECT leg_id FROM settlement_legs l JOIN users u ON u.id = l.funder_user_id "
        "WHERE u.phone = :p",
        p=owner.phone,
    )
    total = await _sql(
        db_settings, "SELECT amount_minor + fee_minor FROM settlement_legs WHERE leg_id = :l", l=leg
    )
    esc.bank.simulate_pay_in(leg, total)


async def _open_holds(db_settings: Settings) -> int:
    return int(
        await _sql(db_settings, "SELECT count(*) FROM settlement_holds WHERE closed_at IS NULL")
    )


async def test_a_held_deal_pays_nothing_out_until_staff_release_it(
    db_settings: Settings,
    esc: Escrow,
    owner: Party,
    taker: Party,
    deal: dict[str, Any],
    staff: Admin,
    boss: AsyncClient,
) -> None:
    await _open(esc, deal, owner)
    alert = await _alert(db_settings, boss, owner)
    sid = await _settlement(db_settings)

    listed = (await boss.get(f"{A}/{alert}/deals", headers=H)).json()["items"]
    assert [(d["settlement_id"], d["held"], d["can_hold"]) for d in listed] == [(sid, False, True)]
    assert listed[0]["ref"] == str(deal["match_id"]).split("-")[0].upper()

    r = await boss.post(f"{A}/{alert}/hold-deal", json={"settlement_id": sid}, headers=H)
    assert r.status_code == 200, r.text
    # Pressing again changes nothing (one hold, one audit entry).
    assert (
        await boss.post(f"{A}/{alert}/hold-deal", json={"settlement_id": sid}, headers=H)
    ).status_code == 200
    assert await _open_holds(db_settings) == 1
    assert (
        await _sql(
            db_settings, "SELECT count(*) FROM staff_audit_log WHERE action = 'fraud_deal_held'"
        )
        == 1
    )
    assert await _sql(db_settings, "SELECT status FROM fraud_alerts") == "in_progress"

    # Both sides pay in, but nothing is released while the deal is held.
    assert (await _pay(taker, deal["match_id"])).status_code == 200
    await _owner_pays_in(db_settings, esc, owner)
    await esc.tick(2)
    assert await _phase(db_settings) == "AWAITING_FUNDING"
    assert (
        await _sql(
            db_settings,
            "SELECT count(*) FROM settlement_events WHERE event_type = 'ReleaseAuthorized'",
        )
        == 0
    )
    listed = (await boss.get(f"{A}/{alert}/deals", headers=H)).json()["items"]
    assert listed[0]["held"] is True

    # The alert can't be resolved while it holds the deal.
    r = await boss.post(
        f"{A}/{alert}/resolve", json={"resolution": "false_alarm", "note": "Fine"}, headers=H
    )
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "RES_409_DEALS_HELD"

    r = await boss.post(f"{A}/{alert}/release-deal", json={"settlement_id": sid}, headers=H)
    assert r.status_code == 200, r.text
    assert await _open_holds(db_settings) == 0
    await esc.tick(2)
    assert await _phase(db_settings) == "COMPLETED"
    # Releasing twice is refused plainly; resolving now works.
    r = await boss.post(f"{A}/{alert}/release-deal", json={"settlement_id": sid}, headers=H)
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "RES_409_NOT_HELD"
    r = await boss.post(
        f"{A}/{alert}/resolve", json={"resolution": "false_alarm", "note": "Fine"}, headers=H
    )
    assert r.status_code == 204, r.text
    actions = await _sql(
        db_settings,
        "SELECT string_agg(action, ',' ORDER BY at) FROM staff_audit_log "
        "WHERE action LIKE 'fraud_deal_%'",
    )
    assert actions == "fraud_deal_held,fraud_deal_released"


async def test_a_deal_already_paying_out_or_closed_cannot_be_held(
    db_settings: Settings,
    esc: Escrow,
    owner: Party,
    taker: Party,
    deal: dict[str, Any],
    staff: Admin,
    boss: AsyncClient,
) -> None:
    await _open(esc, deal, owner)
    assert (await _pay(taker, deal["match_id"])).status_code == 200
    await _owner_pays_in(db_settings, esc, owner)
    await esc.tick(2)
    assert await _phase(db_settings) == "COMPLETED"
    alert = await _alert(db_settings, boss, owner)
    assert (await boss.get(f"{A}/{alert}/deals", headers=H)).json()["items"] == []
    r = await boss.post(
        f"{A}/{alert}/hold-deal", json={"settlement_id": await _settlement(db_settings)}, headers=H
    )
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "RES_409_DEAL_NOT_HOLDABLE"
    assert await _open_holds(db_settings) == 0


async def test_only_the_customers_own_deals_and_only_approvers(
    db_settings: Settings,
    esc: Escrow,
    owner: Party,
    taker: Party,
    deal: dict[str, Any],
    staff: Admin,
    boss: AsyncClient,
) -> None:
    await _open(esc, deal, owner)
    alert = await _alert(db_settings, boss, owner)
    sid = await _settlement(db_settings)
    # A deal that isn't this customer's (here: one that doesn't exist) is not found.
    r = await boss.post(
        f"{A}/{alert}/hold-deal", json={"settlement_id": str(uuid.uuid4())}, headers=H
    )
    assert r.status_code == 404
    # Unknown alert.
    r = await boss.post(f"{A}/{uuid.uuid4()}/hold-deal", json={"settlement_id": sid}, headers=H)
    assert r.status_code == 404
    # Staff without fraud_alerts.approve can't hold or list.
    agent = await staff.invite(boss, "agent@xspeeria.test", "support_agent")
    assert (
        await agent.post(f"{A}/{alert}/hold-deal", json={"settlement_id": sid}, headers=H)
    ).status_code == 403
    assert (await agent.get(f"{A}/{alert}/deals", headers=H)).status_code == 403
    # A Compliance Officer can.
    officer = await staff.invite(boss, "officer@xspeeria.test", "compliance_officer")
    r = await officer.post(f"{A}/{alert}/hold-deal", json={"settlement_id": sid}, headers=H)
    assert r.status_code == 200, r.text
    # Extra fields are refused (strict body).
    r = await boss.post(
        f"{A}/{alert}/release-deal", json={"settlement_id": sid, "user_id": "x"}, headers=H
    )
    assert r.status_code == 422
    assert await _open_holds(db_settings) == 1


async def test_a_held_deal_left_unpaid_is_cancelled_not_paid_out(
    db_settings: Settings,
    esc: Escrow,
    owner: Party,
    taker: Party,
    deal: dict[str, Any],
    staff: Admin,
    boss: AsyncClient,
) -> None:
    await _open(esc, deal, owner)
    alert = await _alert(db_settings, boss, owner)
    r = await boss.post(
        f"{A}/{alert}/hold-deal", json={"settlement_id": await _settlement(db_settings)}, headers=H
    )
    assert r.status_code == 200
    assert (await _pay(taker, deal["match_id"])).status_code == 200
    esc.env.clock.advance(minutes=6)  # past the 5-minute funding window
    await esc.tick(3)
    assert await _phase(db_settings) in ("UNWINDING", "CLOSED_UNWOUND")
    assert (
        await _sql(
            db_settings,
            "SELECT count(*) FROM settlement_events WHERE event_type = 'ReleaseAuthorized'",
        )
        == 0
    )
