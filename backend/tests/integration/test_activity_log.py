# ruff: noqa: F811, E501  -- pytest fixtures are imported by name and used as parameters
"""Customer activity log and deal timelines (ADR-073; owner 2026-10-27: 5 years, Super Admin)."""

from __future__ import annotations

import re
from typing import Any

import pytest
from httpx import AsyncClient

from app.core.config import Settings
from tests.integration.test_admin_disputes import boss, staff  # noqa: F401
from tests.integration.test_admin_staff import Admin, H
from tests.integration.test_auth_api import Clock, _runtime, _sql, clean, migrated  # noqa: F401
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

SECRETS = re.compile(r"\b\d{6}\b|0123456789|123456789012")


async def _uid(db: Settings, phone: str) -> str:
    return str(await _sql(db, "SELECT id FROM users WHERE phone = :p", p=phone))


async def _finished_deal(esc: Escrow, deal: dict[str, Any], owner: Party, taker: Party) -> None:
    await _open(esc, deal, owner)
    assert (await _pay(owner, deal["match_id"])).status_code == 200
    assert (await _pay(taker, deal["match_id"])).status_code == 200
    for _ in range(3):
        await esc.tick()
    assert await _phase(esc.db_settings) == "COMPLETED"


async def test_a_deal_timeline_from_offer_to_payout(
    db_settings: Settings,
    esc: Escrow,
    staff: Admin,
    boss: AsyncClient,
    owner: Party,
    taker: Party,
    deal: dict[str, Any],
) -> None:
    await _finished_deal(esc, deal, owner, taker)
    mid = deal["match_id"]
    ref = mid.split("-")[0].upper()
    # Found by the reference the app shows, or by either customer's email.
    for q in (ref.lower(), "ada@example", mid):
        found = (await boss.get(f"/api/v1/admin/deals?q={q}", headers=H)).json()
        assert [d["match_id"] for d in found["items"]] == [mid], q
    d = (await boss.get(f"/api/v1/admin/deals/{mid}", headers=H)).json()
    assert d["ref"] == ref and d["phase"] == "COMPLETED"
    assert d["amount"] == "200.00" and d["currency"] == "USD" and d["rate"] == "1320.500000"
    kinds = [e["kind"] for e in d["events"]]
    for expected in (
        "offer_posted",
        "offer_taken",
        "payout_accounts_chosen",
        "SettlementCreated",
        "EscrowProvisioned",
        "EscrowFunded",
        "SettlementCompleted",
        "customer:payout_accounts_chosen",
        "customer:paid_into_escrow_pretend",
    ):
        assert expected in kinds, (expected, kinds)
    # The escrow's own steps are in order (the test escrow runs on its own fake clock, so only
    # steps from the same source are compared here; on a server they share one clock).
    escrow = [k for k in kinds if k[0].isupper()]
    assert (
        escrow.index("SettlementCreated")
        < escrow.index("EscrowFunded")
        < escrow.index("SettlementCompleted")
    )
    # Both sides' payments are attributed; amounts are exact text.
    funded = [e for e in d["events"] if e["kind"] == "EscrowFunded"]
    assert {e["by"] for e in funded} == {"offer_owner", "taker"}
    assert {e["amount"] for e in funded} == {"200.00", "264100.00"}
    times = [e["at"] for e in d["events"]]
    assert times == sorted(times)


async def test_everything_a_customer_did_with_staff_actions_merged(
    db_settings: Settings,
    esc: Escrow,
    staff: Admin,
    boss: AsyncClient,
    owner: Party,
    taker: Party,
    deal: dict[str, Any],
) -> None:
    await _finished_deal(esc, deal, owner, taker)
    # A wrong PIN is recorded too (before the customer is signed in).
    r = await taker.env.client.post(
        "/api/v1/auth/login", json={"identifier": TAKER[0], "pin": "135792"}
    )
    assert r.status_code == 401
    uid = await _uid(db_settings, TAKER[0])
    # Staff suspend and reactivate the customer: shown in the same list.
    for action in ("suspend", "reactivate"):
        r = await boss.post(
            f"/api/v1/admin/users/{uid}/{action}", json={"reason": "Checking a report"}, headers=H
        )
        assert r.status_code in (200, 204), r.text
    log = (await boss.get(f"/api/v1/admin/users/{uid}/activity?limit=200", headers=H)).json()
    assert log["customer"]["email"] == TAKER[1]
    actions = [(i["source"], i["action"], i["outcome"]) for i in log["items"]]
    for expected in (
        ("customer", "signed_up", "done"),
        ("customer", "payout_account_added", "done"),
        ("customer", "offer_taken", "done"),
        ("customer", "payout_accounts_chosen", "done"),
        ("customer", "paid_into_escrow_pretend", "done"),
        ("customer", "sign_in_failed", "refused"),
        ("staff", "customer_suspended", "done"),
        ("staff", "customer_reactivated", "done"),
    ):
        assert expected in actions, (expected, actions)
    taken = next(i for i in log["items"] if i["action"] == "payout_accounts_chosen")
    assert taken["deal_ref"] == deal["match_id"].split("-")[0].upper()
    assert taken["route"] == "/api/v1/matches/{match_id}/payout-accounts"
    times = [i["at"] for i in log["items"]]
    assert times == sorted(times, reverse=True)  # newest first
    # Never a PIN, a code or an account number.
    assert not SECRETS.search(str(log["items"]))
    stored = await _sql(
        db_settings,
        "SELECT string_agg(coalesce(detail::text, '') || coalesce(route, ''), ' ') FROM customer_activity",
    )
    assert not SECRETS.search(stored or "")
    # Filters.
    only = (await boss.get(f"/api/v1/admin/users/{uid}/activity?category=deal", headers=H)).json()
    assert only["items"] and all(i["category"] == "deal" for i in only["items"])
    staff_only = (
        await boss.get(f"/api/v1/admin/users/{uid}/activity?category=staff", headers=H)
    ).json()
    assert {i["source"] for i in staff_only["items"]} == {"staff"}
    owner_log = (
        await boss.get(
            f"/api/v1/admin/users/{await _uid(db_settings, OWNER[0])}/activity", headers=H
        )
    ).json()
    assert "offer_posted" in [i["action"] for i in owner_log["items"]]


async def test_the_log_is_append_only_and_kept_five_years(
    db_settings: Settings, esc: Escrow, owner: Party
) -> None:
    uid = await _uid(db_settings, OWNER[0])
    with pytest.raises(Exception, match="append-only"):
        await _sql(db_settings, "UPDATE customer_activity SET action = 'changed'")
    with pytest.raises(Exception, match="kept for 5 years"):
        await _sql(db_settings, "DELETE FROM customer_activity")
    await _sql(
        db_settings,
        "INSERT INTO customer_activity (id, user_id, at, action, category, outcome) VALUES "
        "(gen_random_uuid(), CAST(:u AS uuid), now() - interval '5 years 1 day', 'old', 'other', 'done')",
        u=uid,
    )
    await _sql(db_settings, "DELETE FROM customer_activity WHERE at < now() - interval '5 years'")
    assert (
        await _sql(db_settings, "SELECT count(*) FROM customer_activity WHERE action = 'old'") == 0
    )
    assert await _sql(db_settings, "SELECT count(*) FROM customer_activity") > 0
    grants = await _sql(
        db_settings,
        "SELECT string_agg(privilege_type, ',' ORDER BY privilege_type) "
        "FROM information_schema.role_table_grants "
        "WHERE grantee = 'xspeeria_app' AND table_name = 'customer_activity'",
    )
    assert grants == "DELETE,INSERT,SELECT"


async def test_only_the_super_admin_sees_activity_and_deals(
    db_settings: Settings, esc: Escrow, staff: Admin, boss: AsyncClient, owner: Party
) -> None:
    uid = await _uid(db_settings, OWNER[0])
    for role in ("ops_admin", "support_agent", "compliance_officer"):
        other = await staff.invite(boss, f"{role.split('_')[0]}@xspeeria.test", role)
        for url in (f"/api/v1/admin/users/{uid}/activity", "/api/v1/admin/deals"):
            assert (await other.get(url, headers=H)).status_code == 403, (role, url)
    missing = "00000000-0000-0000-0000-000000000000"
    assert (await boss.get(f"/api/v1/admin/users/{missing}/activity", headers=H)).status_code == 404
    assert (await boss.get(f"/api/v1/admin/deals/{missing}", headers=H)).status_code == 404
    assert (
        await boss.get(f"/api/v1/admin/users/{uid}/activity?category=money", headers=H)
    ).status_code == 422
    assert (
        await boss.get(f"/api/v1/admin/users/{uid}/activity?limit=501", headers=H)
    ).status_code == 422
    async with staff.client() as anon:
        assert (await anon.get("/api/v1/admin/deals", headers=H)).status_code == 401
