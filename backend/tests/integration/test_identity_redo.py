# ruff: noqa: F811  -- pytest fixtures are imported by name and used as parameters
"""ADR-104: the "redo identity check" button (owner 2026-11-09: "Yes."; "Same ID, else staff").

Compliance asks for a new identity check; the customer's next log-in on a new phone opens a
full Didit identity check instead of the face check. The same ID document counts at once; a
different one waits for two staff (recommend, confirm). Didit is a fake (test_kyc_api).
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
from tests.integration.test_kyc_api import K, _approved, _status, _verify, k  # noqa: F401
from tests.integration.test_matches_api import OWNER, TAKER

pytestmark = [pytest.mark.integration, pytest.mark.asyncio]

REASON = {"reason": "Face check keeps failing; customer called Support"}


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


async def _redo(boss: AsyncClient, uid: str, cancel: bool = False) -> Any:
    path = f"/api/v1/admin/users/{uid}/identity-redo" + ("/cancel" if cancel else "")
    return await boss.post(path, json=REASON, headers=H)


async def _new_phone(k: K, who: tuple[str, str] = OWNER) -> dict[str, Any]:
    r = await k.env.login(who[0], trusted=False)
    assert r.status_code == 200, r.text
    body: dict[str, Any] = r.json()
    assert body["check_required"] is True and "access_token" not in body
    return body


async def _cases(db_settings: Settings, uid: str) -> str:
    return str(
        await _sql(
            db_settings,
            "SELECT string_agg(purpose || ':' || status, ',' ORDER BY created_at) "
            "FROM kyc_cases WHERE user_id = CAST(:u AS uuid)",
            u=uid,
        )
    )


async def _ready(k: K, boss: AsyncClient, who: tuple[str, str] = OWNER) -> tuple[str, str]:
    """A verified customer whom Compliance asked for a new identity check."""
    token, uid, _ = await _verify(k, who)
    k.didit.finish(uid)  # Didit's first session is over: the next one is new
    r = await _redo(boss, uid)
    assert r.status_code == 200, r.text
    return token, uid


async def test_same_document_lets_the_customer_in_and_replaces_the_old_check(
    db_settings: Settings, k: K, boss: AsyncClient
) -> None:
    token, uid = await _ready(k, boss)
    check = await _new_phone(k)
    assert (check["method"], check["email_hint"]) == ("kyc", None)
    cid = check["check_id"]
    # Codes and the face check can't finish it; the result needs the check started first.
    r = await k.env.post(f"/auth/checks/{cid}/codes", {"email_code": "123456"})
    assert _code(r) == "AUTH_401_INVALID_OTP"
    assert _code(await k.env.post(f"/auth/checks/{cid}/face")) == "AUTH_401_INVALID_OTP"
    r = await k.env.post(f"/auth/checks/{cid}/kyc/result", {})
    assert (r.status_code, _code(r)) == (409, "AUTH_409_FACE_CHECK_NOT_STARTED")
    r = await k.env.post(f"/auth/checks/{cid}/kyc")
    assert r.status_code == 200 and r.json()["url"].startswith("https://"), r.text
    # While it runs, the account still shows its approved check.
    assert await _status(k, token) == "approved"
    assert await _cases(db_settings, uid) == "standard:approved,redo:pending_documents"
    r = await k.env.post(f"/auth/checks/{cid}/kyc/result", {})
    assert (r.status_code, _code(r)) == (409, "AUTH_409_FACE_CHECK_PENDING")
    # Didit approves the same passport: it counts at once.
    r = await k.post_webhook(_approved(k.didit.sessions[uid], uid))
    assert r.json()["verdict"] == "APPLIED"
    assert await _cases(db_settings, uid) == "standard:expired,redo:approved"
    r = await k.env.post(f"/auth/checks/{cid}/kyc/result", {})
    assert r.status_code == 200 and r.json()["device_token"], r.text
    assert await _sql(
        db_settings,
        "SELECT identity_redo_requested_at IS NULL FROM users WHERE id = CAST(:u AS uuid)",
        u=uid,
    )
    assert await _status(k, token) == "approved"
    # Used once; the next new phone is back to the face check.
    assert _code(await k.env.post(f"/auth/checks/{cid}/kyc/result", {})) == "AUTH_401_INVALID_OTP"
    assert (await _new_phone(k))["method"] == "face"


async def test_a_different_document_waits_for_two_staff(
    db_settings: Settings, k: K, staff: Admin, boss: AsyncClient
) -> None:
    _, uid = await _ready(k, boss)
    cid = (await _new_phone(k))["check_id"]
    assert (await k.env.post(f"/auth/checks/{cid}/kyc")).status_code == 200
    # A renewed passport (another number): never let in automatically.
    r = await k.post_webhook(_approved(k.didit.sessions[uid], uid, document="B99999999"))
    assert r.json()["verdict"] == "APPLIED"
    assert await _cases(db_settings, uid) == "standard:approved,redo:under_review"
    assert (
        await _sql(
            db_settings,
            "SELECT review_reason FROM kyc_cases "
            "WHERE purpose = 'redo' AND user_id = CAST(:u AS uuid)",
            u=uid,
        )
        == "REDO_NEW_DOCUMENT"
    )
    r = await k.env.post(f"/auth/checks/{cid}/kyc/result", {})
    assert (r.status_code, _code(r)) == (409, "AUTH_409_KYC_IN_REVIEW")
    case_id = await _sql(
        db_settings,
        "SELECT id::text FROM kyc_cases WHERE purpose = 'redo' AND user_id = CAST(:u AS uuid)",
        u=uid,
    )
    r = await boss.post(
        f"/api/v1/admin/kyc/cases/{case_id}/recommend",
        json={"reason": "Renewed passport; same name, birth date and face as before"},
        headers=H,
    )
    assert r.status_code == 204, r.text
    officer = await staff.invite(boss, "officer@xspeeria.test", "compliance_officer")
    r = await officer.post(f"/api/v1/admin/kyc/cases/{case_id}/confirm", json={}, headers=H)
    assert r.status_code == 204, r.text
    assert await _cases(db_settings, uid) == "standard:expired,redo:approved"
    # A log-in started after the approval still uses this check (the request stays until then).
    cid2 = (await _new_phone(k))["check_id"]
    r = await k.env.post(f"/auth/checks/{cid2}/kyc")
    assert r.status_code == 200 and r.json()["url"] is None, r.text
    r = await k.env.post(f"/auth/checks/{cid2}/kyc/result", {})
    assert r.status_code == 200, r.text


async def test_a_different_name_or_birth_date_is_held_too(
    db_settings: Settings, k: K, boss: AsyncClient
) -> None:
    _, uid = await _ready(k, boss)
    cid = (await _new_phone(k))["check_id"]
    await k.env.post(f"/auth/checks/{cid}/kyc")
    # Same document number but another person's details: held, not let in.
    await k.post_webhook(_approved(k.didit.sessions[uid], uid, dob="1985-01-01"))
    assert await _cases(db_settings, uid) == "standard:approved,redo:under_review"
    r = await k.env.post(f"/auth/checks/{cid}/kyc/result", {})
    assert _code(r) == "AUTH_409_KYC_IN_REVIEW"


async def test_a_declined_check_is_a_failure_and_can_be_taken_again(
    db_settings: Settings, k: K, boss: AsyncClient
) -> None:
    _, uid = await _ready(k, boss)
    cid = (await _new_phone(k))["check_id"]
    await k.env.post(f"/auth/checks/{cid}/kyc")
    sid = k.didit.sessions[uid]
    await k.post_webhook(_approved(sid, uid, status="Declined"))
    k.didit.finish(uid)
    r = await k.env.post(f"/auth/checks/{cid}/kyc/result", {})
    assert (r.status_code, _code(r)) == (401, "AUTH_401_KYC_NOT_APPROVED")
    # The account's approved check is untouched; a new Didit session can be started.
    assert await _cases(db_settings, uid) == "standard:approved,redo:rejected"
    r = await k.env.post(f"/auth/checks/{cid}/kyc")
    assert r.status_code == 200 and r.json()["url"].startswith("https://"), r.text
    assert k.didit.sessions[uid] != sid


async def test_only_compliance_asks_and_it_is_audited(
    db_settings: Settings, k: K, staff: Admin, boss: AsyncClient
) -> None:
    _, uid, _ = await _verify(k, OWNER)
    agent = await staff.invite(boss, "agent@xspeeria.test", "support_agent")
    r = await _redo(agent, uid)
    assert r.status_code == 403
    # Needs a reason, and an approved identity check to redo.
    r = await boss.post(f"/api/v1/admin/users/{uid}/identity-redo", json={"reason": "x"}, headers=H)
    assert r.status_code == 422
    unverified = await k.env.sign_up(phone=TAKER[0], email=TAKER[1])
    me = (await k.env.get("/users/me", token=unverified["access_token"])).json()
    r = await _redo(boss, str(me.get("user_id") or me.get("id")))
    assert (r.status_code, _code(r)) == (409, "RES_409_INVALID_STATE")
    assert (await _redo(boss, uid)).status_code == 200
    listed = (await boss.get("/api/v1/admin/users", headers=H)).json()["items"]
    mine = next(i for i in listed if i["id"] == uid)
    assert mine["identity_redo_requested_at"] is not None and mine["kyc_status"] == "approved"
    assert (await _new_phone(k))["method"] == "kyc"
    # Cancelled: back to the face check.
    assert (await _redo(boss, uid, cancel=True)).status_code == 200
    assert (await _new_phone(k))["method"] == "face"
    actions = await _sql(
        db_settings,
        "SELECT string_agg(action, ',' ORDER BY action) FROM staff_audit_log "
        "WHERE target_type = 'customer'",
    )
    assert actions == "identity_redo_cancelled,identity_redo_requested"


async def test_the_purpose_of_a_check_cannot_be_changed(
    db_settings: Settings, k: K, boss: AsyncClient
) -> None:
    _, uid = await _ready(k, boss)
    with pytest.raises(Exception, match="immutable"):
        await _sql(
            db_settings,
            "UPDATE kyc_cases SET purpose = 'redo' WHERE user_id = CAST(:u AS uuid)",
            u=uid,
        )
