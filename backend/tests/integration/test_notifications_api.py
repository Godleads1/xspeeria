# ruff: noqa: F811  -- pytest fixtures are imported by name and used as parameters
"""Milestone N-1: in-app notifications (ADR-044), against PostgreSQL.

Messages are written in the same transaction as the fact they report: identity-check results,
someone taking my offer, and each escrow phase of a deal (both parties).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

import pytest

from app.core.config import Settings
from app.db.session import build_engine
from app.services.notifications import notify
from tests.integration.test_auth_api import _sql, clean, migrated  # noqa: F401
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
from tests.integration.test_kyc_api import K, _approved, _start, _user, k  # noqa: F401
from tests.integration.test_matches_api import TAKER
from tests.integration.test_offers_api import currencies  # noqa: F401
from tests.integration.test_payouts_api import Party

pytestmark = [pytest.mark.integration, pytest.mark.asyncio]


async def _inbox(client: Any, token: str, **params: Any) -> Any:
    r = await client.get(
        "/api/v1/notifications", params=params, headers={"Authorization": f"Bearer {token}"}
    )
    assert r.status_code == 200, r.text
    return r.json()


async def _events_of(p: Party) -> list[str]:
    body = await _inbox(p.env.client, p.token, limit=50)
    return [i["event"] for i in body["items"]]


# --- identity checks ------------------------------------------------------------------------


async def test_identity_result_is_notified_once(k: K) -> None:
    token, uid = await _user(k)
    assert (await _inbox(k.env.client, token)) == {
        "items": [],
        "unread_count": 0,
        "next_before": None,
    }
    case = (await _start(k, token)).json()
    sid = k.didit.sessions[uid]
    await k.post_webhook({**_approved(sid, uid, status="In Progress"), "decision": None})
    assert (await _inbox(k.env.client, token))["items"] == []  # nothing to say yet
    await k.post_webhook(_approved(sid, uid))
    await k.post_webhook(_approved(sid, uid))  # a second "Approved" says nothing new
    body = await _inbox(k.env.client, token)
    assert body["unread_count"] == 1
    [item] = body["items"]
    assert item["type"] == "kyc_status" and item["event"] == "kyc.approved"
    assert item["data"] == {"kyc_case_id": case["kyc_case_id"], "country": "NG"}
    assert item["read"] is False
    assert "Ada" not in str(body)  # no personal data in messages


async def test_refused_and_expired_checks_are_notified(k: K) -> None:
    token, uid = await _user(k)
    await _start(k, token)
    sid = k.didit.sessions[uid]
    await k.post_webhook({**_approved(sid, uid, status="In Review"), "decision": None})
    await k.post_webhook({**_approved(sid, uid, status="Declined")})
    events = [i["event"] for i in (await _inbox(k.env.client, token))["items"]]
    assert events == ["kyc.rejected", "kyc.in_review"]


# --- deals ----------------------------------------------------------------------------------


async def test_offer_owner_hears_when_someone_takes_it(
    owner: Party, taker: Party, deal: dict[str, Any]
) -> None:
    events = await _events_of(owner)
    assert events == ["match.created"]
    item = (await _inbox(owner.env.client, owner.token))["items"][0]
    assert item["type"] == "match_found"
    assert item["data"] == {"match_id": deal["match_id"], "offer_id": deal["offer_id"]}
    assert await _events_of(taker) == []  # the taker did it themselves


async def test_both_parties_hear_each_escrow_step(
    esc: Escrow, owner: Party, taker: Party, deal: dict[str, Any]
) -> None:
    await _open(esc, deal, owner)
    await _pay(owner, deal["match_id"])
    await _pay(taker, deal["match_id"])
    want = ["settlement.completed", "settlement.releasing", "settlement.awaiting_funding"]
    assert (await _events_of(owner))[:3] == want
    assert await _events_of(taker) == want
    item = (await _inbox(taker.env.client, taker.token))["items"][-1]
    assert item["data"]["match_id"] == deal["match_id"]
    assert datetime.fromisoformat(item["data"]["deadline"]) > datetime.now(UTC).replace(year=2000)
    await esc.tick(3)  # repeated jobs never repeat messages
    assert len(await _events_of(taker)) == 3


async def test_cancelled_and_refunded_deals_are_notified(
    esc: Escrow, owner: Party, taker: Party, deal: dict[str, Any]
) -> None:
    await _open(esc, deal, owner)
    await _pay(owner, deal["match_id"])
    esc.env.clock.advance(minutes=5, seconds=1)
    await esc.tick(3)
    await owner.relogin()
    await taker.relogin()
    events = await _events_of(owner)
    assert events[:2] == ["settlement.refunded", "settlement.unwinding"]
    assert (await _events_of(taker))[:2] == ["settlement.refunded", "settlement.unwinding"]


async def test_nobody_pays_is_notified_as_cancelled(
    esc: Escrow, owner: Party, taker: Party, deal: dict[str, Any]
) -> None:
    await _open(esc, deal, owner)
    esc.env.clock.advance(minutes=5, seconds=1)
    await esc.tick()
    await taker.relogin()
    assert (await _events_of(taker))[0] == "settlement.cancelled"


# --- reading, marking, paging -----------------------------------------------------------------


async def _seed(db_settings: Settings, user_id: str, n: int) -> None:
    engine = build_engine(db_settings)
    try:
        async with engine.begin() as conn:
            from sqlalchemy.ext.asyncio import AsyncSession

            async with AsyncSession(bind=conn) as db:
                for i in range(n):
                    await notify(
                        db,
                        user_id=uuid.UUID(user_id),
                        event="kyc.in_review",
                        dedupe_key=f"test:{i}",
                        now=datetime(2026, 10, 19, 12, i, tzinfo=UTC),
                        kyc_case_id=str(i),
                        country="NG",
                    )
                # The same fact again is ignored, never an error.
                await notify(
                    db,
                    user_id=uuid.UUID(user_id),
                    event="kyc.in_review",
                    dedupe_key="test:0",
                    now=datetime(2026, 10, 19, 13, 0, tzinfo=UTC),
                    kyc_case_id="0",
                    country="NG",
                )
                await db.flush()
    finally:
        await engine.dispose()


async def test_mark_read_unread_and_filter(db_settings: Settings, k: K) -> None:
    token, uid = await _user(k)
    await _seed(db_settings, uid, 3)
    body = await _inbox(k.env.client, token)
    assert body["unread_count"] == 3 and len(body["items"]) == 3
    first = body["items"][0]["notification_id"]
    h = {"Authorization": f"Bearer {token}"}
    r = await k.env.client.patch(f"/api/v1/notifications/{first}", json={"read": True}, headers=h)
    assert r.status_code == 200 and r.json()["read"] is True
    assert (await _inbox(k.env.client, token))["unread_count"] == 2
    assert [
        i["notification_id"]
        for i in (await _inbox(k.env.client, token, **{"filter[read]": "true"}))["items"]
    ] == [first]
    assert len((await _inbox(k.env.client, token, **{"filter[read]": "false"}))["items"]) == 2
    r = await k.env.client.patch(f"/api/v1/notifications/{first}", json={"read": False}, headers=h)
    assert r.json()["read"] is False
    assert (await _inbox(k.env.client, token))["unread_count"] == 3


async def test_pages_newest_first(db_settings: Settings, k: K) -> None:
    token, uid = await _user(k)
    await _seed(db_settings, uid, 5)
    page1 = await _inbox(k.env.client, token, limit=2)
    assert [i["data"]["kyc_case_id"] for i in page1["items"]] == ["4", "3"]
    page2 = await _inbox(k.env.client, token, limit=2, before=page1["next_before"])
    assert [i["data"]["kyc_case_id"] for i in page2["items"]] == ["2", "1"]
    page3 = await _inbox(k.env.client, token, limit=2, before=page2["next_before"])
    assert [i["data"]["kyc_case_id"] for i in page3["items"]] == ["0"]
    assert page3["next_before"] is None
    h = {"Authorization": f"Bearer {token}"}
    for bad in ({"limit": 0}, {"limit": 51}, {"before": "nope"}, {"filter[read]": "maybe"}):
        r = await k.env.client.get("/api/v1/notifications", params=bad, headers=h)
        assert r.status_code == 422, bad


async def test_nobody_can_read_or_mark_someone_elses(db_settings: Settings, k: K) -> None:
    token, uid = await _user(k)
    other, _ = await _user(k, TAKER)
    await _seed(db_settings, uid, 1)
    mine = (await _inbox(k.env.client, token))["items"][0]["notification_id"]
    assert (await _inbox(k.env.client, other))["items"] == []
    h = {"Authorization": f"Bearer {other}"}
    r = await k.env.client.patch(f"/api/v1/notifications/{mine}", json={"read": True}, headers=h)
    assert r.status_code == 404
    r = await k.env.client.patch(
        f"/api/v1/notifications/{uuid.uuid4()}", json={"read": True}, headers=h
    )
    assert r.status_code == 404
    # Someone else's id as a page anchor is also "not found".
    r = await k.env.client.get("/api/v1/notifications", params={"before": mine}, headers=h)
    assert r.status_code == 404
    assert (await _inbox(k.env.client, token))["unread_count"] == 1


async def test_input_is_checked_and_sign_in_needed(db_settings: Settings, k: K) -> None:
    token, uid = await _user(k)
    await _seed(db_settings, uid, 1)
    nid = (await _inbox(k.env.client, token))["items"][0]["notification_id"]
    h = {"Authorization": f"Bearer {token}"}
    for body in ({}, {"read": "yes"}, {"read": True, "user_id": uid}):
        r = await k.env.client.patch(f"/api/v1/notifications/{nid}", json=body, headers=h)
        assert r.status_code == 422, body
    assert (await k.env.client.get("/api/v1/notifications")).status_code == 401
    r = await k.env.client.patch(f"/api/v1/notifications/{nid}", json={"read": True})
    assert r.status_code == 401


# --- database guarantees -------------------------------------------------------------------


async def test_only_read_at_can_change_and_nothing_is_deleted(db_settings: Settings, k: K) -> None:
    _, uid = await _user(k)
    await _seed(db_settings, uid, 1)
    await _sql(db_settings, "UPDATE notifications SET read_at = now()")
    with pytest.raises(Exception, match="only read_at"):
        await _sql(db_settings, "UPDATE notifications SET payload = '{}'::jsonb")
    with pytest.raises(Exception, match="not deleted"):
        await _sql(db_settings, "DELETE FROM notifications")
    grants = await _sql(
        db_settings,
        "SELECT string_agg(privilege_type, ',' ORDER BY privilege_type) "
        "FROM information_schema.role_table_grants "
        "WHERE grantee = 'xspeeria_app' AND table_name = 'notifications'",
    )
    # ADR-095: DELETE exists only for the 14-day clean-up of a deleted account; the guard
    # above still refuses every other delete (tested in test_account_deletion.py too).
    assert grants == "DELETE,INSERT,SELECT,UPDATE"
