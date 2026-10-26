# ruff: noqa: F811, E501  -- pytest fixtures are imported by name and used as parameters
"""Identity-check review (ADR-069; owner 2026-10-27).

Owner: Didit's own "In Review" cases stay in Didit's console (read-only here); a case Xspeeria
holds may be approved only by two people (one recommends, a different one confirms); rejecting
needs one person and a reason the customer reads.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from httpx import AsyncClient

from app.core.config import Settings
from tests.integration.test_admin_staff import BOSS, BOSS_PW, Admin, H
from tests.integration.test_auth_api import Clock, _runtime, _sql, clean, migrated  # noqa: F401
from tests.integration.test_kyc_api import K, _approved, _start, _status, _user, _verify, k  # noqa: F401
from tests.integration.test_matches_api import OWNER, TAKER

pytestmark = [pytest.mark.integration, pytest.mark.asyncio]


@pytest_asyncio.fixture
async def staff(db_settings: Settings, k: K) -> AsyncIterator[Admin]:
    """Made after the customer app: its setup clears every table first."""
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


async def _case_id(db_settings: Settings, uid: str) -> str:
    return str(
        await _sql(
            db_settings,
            "SELECT id FROM kyc_cases WHERE user_id = CAST(:u AS uuid) ORDER BY created_at DESC LIMIT 1",
            u=uid,
        )
    )


async def test_two_people_approve_a_held_check(
    db_settings: Settings, k: K, staff: Admin, boss: AsyncClient
) -> None:
    # Didit saw this face/document on another account: Xspeeria holds the approval.
    token, uid, _ = await _verify(k, OWNER, document="C1", seen_for=str(uuid.uuid4()))
    assert await _status(k, token) == "under_review"
    cid = await _case_id(db_settings, uid)
    # The identity facts are kept for the reviewers, never shown to the customer yet.
    me = (await k.env.get("/kyc/cases/current", token=token)).json()
    assert me["legal_name"] is None
    listed = (await boss.get("/api/v1/admin/kyc/cases?queue=held", headers=H)).json()
    assert listed["held"] == 1 and listed["items"][0]["review_reason"] == "DUPLICATE_IDENTITY"
    case = (await boss.get(f"/api/v1/admin/kyc/cases/{cid}", headers=H)).json()
    assert (
        case["identity"]["legal_name"] == "Ada Obi"
        and case["identity"]["date_of_birth"] == "1990-05-17"
    )
    assert case["can_approve"] is True and case["in_didit"] is False
    # Step 1: recommend (reason required).
    assert (
        await boss.post(f"/api/v1/admin/kyc/cases/{cid}/recommend", json={"reason": "x"}, headers=H)
    ).status_code == 422
    r = await boss.post(
        f"/api/v1/admin/kyc/cases/{cid}/recommend",
        json={"reason": "Old account was a test sign-up; same person, checked by phone"},
        headers=H,
    )
    assert r.status_code == 204, r.text
    assert (
        await boss.post(
            f"/api/v1/admin/kyc/cases/{cid}/recommend", json={"reason": "again please"}, headers=H
        )
    ).status_code == 409
    # Never your own: the recommender can't confirm (server and database).
    r = await boss.post(f"/api/v1/admin/kyc/cases/{cid}/confirm", json={}, headers=H)
    assert r.status_code == 403 and r.json()["error"]["code"] == "AUTH_403_OWN_REQUEST"
    boss_id = await _sql(db_settings, "SELECT id FROM staff_accounts WHERE email = :e", e=BOSS)
    with pytest.raises(Exception, match="second_person"):
        await _sql(
            db_settings,
            f"UPDATE kyc_reviews SET status = 'confirmed', decided_by = '{boss_id}', decided_at = now()",
        )
    # Step 2: a compliance officer confirms; the customer is verified and told.
    officer = await staff.invite(boss, "officer@xspeeria.test", "compliance_officer")
    r = await officer.post(
        f"/api/v1/admin/kyc/cases/{cid}/confirm", json={"note": "Agree"}, headers=H
    )
    assert r.status_code == 204, r.text
    assert await _status(k, token) == "approved"
    assert (
        await _sql(
            db_settings,
            "SELECT count(*) FROM notifications WHERE payload->>'event' = 'kyc.approved'",
        )
        == 1
    )
    case = (await officer.get(f"/api/v1/admin/kyc/cases/{cid}", headers=H)).json()
    assert [r["status"] for r in case["reviews"]] == ["confirmed"]
    assert case["reviews"][0]["recommended_by"] == "The Boss"
    assert case["reviews"][0]["decided_by"] == "New Person"
    # Decided once.
    with pytest.raises(Exception, match="already decided"):
        await _sql(db_settings, "UPDATE kyc_reviews SET decision_note = 'changed'")
    actions = await _sql(
        db_settings,
        "SELECT string_agg(action, ',' ORDER BY at, action) FROM staff_audit_log WHERE target_type = 'kyc_case'",
    )
    assert "kyc_approval_recommended" in actions and "kyc_approved" in actions
    assert (await boss.get("/api/v1/admin/kyc/cases?queue=decided", headers=H)).json()["total"] == 1


async def test_same_document_still_verified_elsewhere_cannot_be_approved(
    db_settings: Settings, k: K, staff: Admin, boss: AsyncClient
) -> None:
    await _verify(k, OWNER)
    token, uid, _ = await _verify(k, TAKER)  # same passport
    cid = await _case_id(db_settings, uid)
    case = (await boss.get(f"/api/v1/admin/kyc/cases/{cid}", headers=H)).json()
    assert case["same_document_elsewhere"][0]["check_status"] == "approved"
    await boss.post(
        f"/api/v1/admin/kyc/cases/{cid}/recommend",
        json={"reason": "Customer says lost access"},
        headers=H,
    )
    officer = await staff.invite(boss, "officer@xspeeria.test", "compliance_officer")
    r = await officer.post(f"/api/v1/admin/kyc/cases/{cid}/confirm", json={}, headers=H)
    assert r.status_code == 409 and r.json()["error"]["code"] == "RES_409_DOCUMENT_ALREADY_VERIFIED"
    assert await _status(k, token) == "under_review"
    # The recommender can't reject over their own waiting recommendation...
    assert (
        await boss.post(
            f"/api/v1/admin/kyc/cases/{cid}/reject",
            json={"reason": "This ID is already verified on another account."},
            headers=H,
        )
    ).status_code == 409
    # ...a second person can; the customer reads the reason.
    r = await officer.post(
        f"/api/v1/admin/kyc/cases/{cid}/reject",
        json={"reason": "This ID is already verified on another Xspeeria account."},
        headers=H,
    )
    assert r.status_code == 204, r.text
    me = (await k.env.get("/kyc/cases/current", token=token)).json()
    assert me["status"] == "rejected"
    assert me["message"] == "This ID is already verified on another Xspeeria account."
    case = (await officer.get(f"/api/v1/admin/kyc/cases/{cid}", headers=H)).json()
    assert [r["status"] for r in case["reviews"]] == ["declined"]


async def test_decline_then_reject(
    db_settings: Settings, k: K, staff: Admin, boss: AsyncClient
) -> None:
    _, uid, _ = await _verify(k, OWNER, document="C2", seen_for=str(uuid.uuid4()))
    cid = await _case_id(db_settings, uid)
    await boss.post(
        f"/api/v1/admin/kyc/cases/{cid}/recommend", json={"reason": "Looks fine to me"}, headers=H
    )
    officer = await staff.invite(boss, "officer@xspeeria.test", "compliance_officer")
    assert (
        await officer.post(f"/api/v1/admin/kyc/cases/{cid}/decline", json={}, headers=H)
    ).status_code == 422
    assert (
        await officer.post(
            f"/api/v1/admin/kyc/cases/{cid}/decline", json={"note": "Need a call first"}, headers=H
        )
    ).status_code == 204
    # Still held; the boss may now reject it alone.
    assert (
        await boss.post(
            f"/api/v1/admin/kyc/cases/{cid}/reject",
            json={"reason": "We could not confirm this is you. Please contact support."},
            headers=H,
        )
    ).status_code == 204


async def test_didit_review_stays_in_didit_and_missing_facts_cannot_be_approved(
    db_settings: Settings, k: K, staff: Admin, boss: AsyncClient
) -> None:
    # Didit is reviewing: read-only here.
    token, uid = await _user(k, OWNER)
    await _start(k, token)
    sid = k.didit.sessions[uid]
    await k.post_webhook({**_approved(sid, uid, status="In Review"), "decision": None})
    cid = await _case_id(db_settings, uid)
    listed = (await boss.get("/api/v1/admin/kyc/cases?queue=in_didit", headers=H)).json()
    assert listed["in_didit"] == 1 and listed["items"][0]["id"] == cid
    case = (await boss.get(f"/api/v1/admin/kyc/cases/{cid}", headers=H)).json()
    assert case["in_didit"] is True and case["can_approve"] is False
    for action, body in (
        ("recommend", {"reason": "please approve"}),
        ("reject", {"reason": "please reject"}),
    ):
        r = await boss.post(f"/api/v1/admin/kyc/cases/{cid}/{action}", json=body, headers=H)
        assert r.status_code == 409 and r.json()["error"]["code"] == "RES_409_DECIDED_IN_DIDIT"
    # No readable date of birth: held, but it can't be approved (only rejected).
    token2, uid2, _ = await _verify(k, TAKER, dob="")
    cid2 = await _case_id(db_settings, uid2)
    case2 = (await boss.get(f"/api/v1/admin/kyc/cases/{cid2}", headers=H)).json()
    assert case2["review_reason"] == "CHECKS_INCOMPLETE" and case2["can_approve"] is False
    r = await boss.post(
        f"/api/v1/admin/kyc/cases/{cid2}/recommend", json={"reason": "please approve"}, headers=H
    )
    assert r.status_code == 409 and r.json()["error"]["code"] == "RES_409_IDENTITY_MISSING"


async def test_access(db_settings: Settings, k: K, staff: Admin, boss: AsyncClient) -> None:
    _, uid, _ = await _verify(k, OWNER, document="C3", seen_for=str(uuid.uuid4()))
    cid = await _case_id(db_settings, uid)
    agent = await staff.invite(boss, "agent@xspeeria.test", "support_agent")
    assert (await agent.get("/api/v1/admin/kyc/cases", headers=H)).status_code == 403
    ops = await staff.invite(boss, "ops@xspeeria.test", "ops_admin")  # kyc.read only
    assert (await ops.get(f"/api/v1/admin/kyc/cases/{cid}", headers=H)).status_code == 200
    assert (
        await ops.post(
            f"/api/v1/admin/kyc/cases/{cid}/recommend", json={"reason": "fine by me"}, headers=H
        )
    ).status_code == 403
    missing = "00000000-0000-0000-0000-000000000000"
    assert (await boss.get(f"/api/v1/admin/kyc/cases/{missing}", headers=H)).status_code == 404
    assert (
        await boss.post(
            f"/api/v1/admin/kyc/cases/{cid}/recommend",
            json={"reason": "fine by me", "decision": "approved"},
            headers=H,
        )
    ).status_code == 422
    grants = await _sql(
        db_settings,
        "SELECT string_agg(privilege_type, ',' ORDER BY privilege_type) "
        "FROM information_schema.role_table_grants "
        "WHERE grantee = 'xspeeria_app' AND table_name = 'kyc_reviews'",
    )
    assert grants == "INSERT,SELECT,UPDATE"
