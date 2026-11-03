# ruff: noqa: F811, E501  -- pytest fixtures are imported by name and used as parameters
"""Delete account (ADR-095; owner 2026-11-03: record keeping DEC-106, 14 days to undo).

The customer asks with a second check; the account closes at once (sessions, trusted phones,
payout accounts, phone push off; open offers withdrawn). Logging in with the PIN within 14
days can restore it, still behind the second check. After 14 days the clean-up removes what
there is no legal reason to keep; the legal records stay.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.core.config import Settings
from app.db.session import build_engine
from app.models.notifications import NOTIFICATION_TYPES
from app.services.account_deletion import AccountDeletionService
from tests.integration.test_admin_disputes import boss, staff  # noqa: F401
from tests.integration.test_admin_staff import Admin, H
from tests.integration.test_auth_api import PIN, Env, _code, _sql, clean, migrated  # noqa: F401
from tests.integration.test_escrow_api import (  # noqa: F401
    Escrow,
    _open,
    deal,
    esc,
    owner,
    partners,
    taker,
)
from tests.integration.test_matches_api import OWNER, TAKER
from tests.integration.test_offers_api import User, _user, currencies, env  # noqa: F401
from tests.integration.test_payouts_api import Party

pytestmark = [pytest.mark.integration, pytest.mark.asyncio]

PHONE, EMAIL = "+2348038383838", "david@example.com"
D = "/users/me/delete-account"


async def _delete(env: Env, user: User, *, approve: bool = True) -> Any:
    headers = {"Authorization": f"Bearer {user.token}"}
    if approve:
        headers["X-Step-Up-Token"] = await env.approve(user.token, "account.delete", PHONE)
    return await env.client.post(f"/api/v1{D}", headers=headers)


async def _purge(db_settings: Settings, env: Env) -> int:
    engine = build_engine(db_settings)
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as db:
            return await AccountDeletionService(db, env.clock).purge_due()
    finally:
        await engine.dispose()


async def test_deleting_closes_at_once_and_signing_in_within_14_days_restores(
    db_settings: Settings, env: Env
) -> None:
    david = await _user(env)
    offer = await david.publish()
    assert offer.status_code == 201, offer.text
    r = await env.get(D, david.token)
    assert r.status_code == 200 and r.json() == {"blockers": [], "restore_days": 14}

    # The second check is required.
    r = await _delete(env, david, approve=False)
    assert r.status_code == 403, r.text
    assert await _sql(db_settings, "SELECT status FROM users") == "active"

    r = await _delete(env, david)
    assert r.status_code == 200, r.text
    until = datetime.fromisoformat(r.json()["restore_until"])
    assert until == env.clock() + timedelta(days=14)

    # Closed at once: the session ends, the offer leaves the market, trusted phones are off.
    assert (await env.get("/users/me", david.token)).status_code == 401
    assert await _sql(db_settings, "SELECT status FROM users") == "closed"
    assert await _sql(db_settings, "SELECT status FROM offers") == "withdrawn"
    assert (
        await _sql(db_settings, "SELECT count(*) FROM trusted_devices WHERE revoked_at IS NULL")
        == 0
    )
    # The email says what happens and how to undo it; it carries no "this wasn't me" link.
    await env.send_notices()
    sent = [e for e in env.email.sent if e.alert == "account_deletion_requested"]
    assert len(sent) == 1 and sent[0].link is None

    # A wrong PIN looks like any wrong PIN; the right one says it can be restored.
    r = await env.login(PHONE, "999999")
    assert _code(r) == "AUTH_401_INVALID_CREDENTIALS"
    r = await env.login(PHONE)
    assert r.status_code == 403 and _code(r) == "AUTH_403_ACCOUNT_DELETING"
    assert r.json()["error"]["details"]["restore_until"]
    # By email too.
    assert _code(await env.login(EMAIL)) == "AUTH_403_ACCOUNT_DELETING"

    # Restore: the account reopens and the second check still runs (trusted phone is off).
    r = await env.post("/auth/login", {"identifier": PHONE, "pin": PIN, "restore_account": True})
    assert r.status_code == 200, r.text
    check = r.json()
    assert check["check_required"] is True
    assert await _sql(db_settings, "SELECT status FROM users") == "active"
    assert await _sql(db_settings, "SELECT deletion_requested_at IS NULL FROM users") is True
    codes = {"email_code": env.email_code(EMAIL)}
    if check["method"] != "email":  # before the identity check: SMS and email codes
        codes["sms_code"] = str(env.sms.last_code_for(PHONE))
    r = await env.post(f"/auth/checks/{check['check_id']}/codes", codes)
    assert r.status_code == 200, r.text
    await env.send_notices()
    restored = [e for e in env.email.sent if e.alert == "account_restored"]
    assert len(restored) == 1 and restored[0].link is not None  # "this wasn't me" works again


async def test_after_14_days_it_cannot_be_restored_and_the_clean_up_runs(
    db_settings: Settings, env: Env
) -> None:
    david = await _user(env)
    assert (await _delete(env, david)).status_code == 200
    uid = await _sql(db_settings, "SELECT id FROM users")
    await _sql(
        db_settings,
        "INSERT INTO notifications (id, user_id, type, payload, dedupe_key, created_at) "
        "VALUES (:id, :u, :t, '{}', 'test', now())",
        id=uuid.uuid4(),
        u=uid,
        t=NOTIFICATION_TYPES[0],
    )
    assert await _purge(db_settings, env) == 0  # not yet
    # The notifications guard (ADR-044) still refuses a delete before the clean-up.
    with pytest.raises(DBAPIError, match="notifications are not deleted"):
        await _sql(db_settings, "DELETE FROM notifications")
    env.clock.advance(days=14, seconds=1)
    # Past the 14 days the account looks like any unknown one.
    assert _code(await env.login(PHONE)) == "AUTH_401_INVALID_CREDENTIALS"
    r = await env.post("/auth/login", {"identifier": PHONE, "pin": PIN, "restore_account": True})
    assert _code(r) == "AUTH_401_INVALID_CREDENTIALS"

    assert await _purge(db_settings, env) == 1
    assert await _purge(db_settings, env) == 0  # once only
    assert await _sql(db_settings, "SELECT count(*) FROM notifications") == 0
    assert await _sql(db_settings, "SELECT count(*) FROM push_tokens") == 0
    assert (
        await _sql(db_settings, "SELECT count(*) FROM trusted_devices WHERE user_agent IS NOT NULL")
        == 0
    )
    assert await _sql(db_settings, "SELECT deleted_at IS NOT NULL FROM users") is True
    # Kept (DEC-106): the account row, its identity and the activity log.
    assert await _sql(db_settings, "SELECT phone FROM users") == PHONE
    assert (
        await _sql(
            db_settings,
            "SELECT count(*) FROM customer_activity WHERE action = 'account_deleted'",
        )
        == 1
    )


async def test_refused_while_a_deal_is_open(
    db_settings: Settings, esc: Escrow, owner: Party, taker: Party, deal: dict[str, Any]
) -> None:
    await _open(esc, deal, owner)
    r = await esc.env.get(D, owner.token)
    assert r.json()["blockers"] == ["deal_in_progress"]
    headers = owner._h() | {"X-Step-Up-Token": await owner.approve("account.delete")}
    r = await esc.env.client.post(f"/api/v1{D}", headers=headers)
    assert r.status_code == 409, r.text
    assert r.json()["error"]["code"] == "RES_409_ACCOUNT_DELETE_BLOCKED"
    assert r.json()["error"]["details"]["blockers"] == ["deal_in_progress"]
    assert (
        await _sql(db_settings, "SELECT status FROM users WHERE phone = :p", p=owner.phone)
        == "active"
    )
    # The other side is blocked too.
    assert (await esc.env.get(D, taker.token)).json()["blockers"] == ["deal_in_progress"]


async def test_refused_while_under_a_fraud_review(db_settings: Settings, env: Env) -> None:
    david = await _user(env)
    uid = await _sql(db_settings, "SELECT id FROM users")
    await _sql(
        db_settings,
        "INSERT INTO fraud_alerts (id, user_id, rule, severity, status, subject, details, "
        "created_at, updated_at) VALUES (:id, :u, 'pin_lockout', 'low', 'open', 'x', '{}', "
        "now(), now())",
        id=uuid.uuid4(),
        u=uid,
    )
    assert (await env.get(D, david.token)).json()["blockers"] == ["under_review"]
    assert (await _delete(env, david)).status_code == 409
    assert await _sql(db_settings, "SELECT status FROM users") == "active"


async def test_a_staff_closed_account_can_never_be_restored(
    db_settings: Settings, env: Env
) -> None:
    await _user(env)
    await _sql(db_settings, "UPDATE users SET status = 'closed'")
    r = await env.post("/auth/login", {"identifier": PHONE, "pin": PIN, "restore_account": True})
    assert _code(r) == "AUTH_401_INVALID_CREDENTIALS"
    assert await _sql(db_settings, "SELECT status FROM users") == "closed"


async def test_the_body_is_strict_and_the_route_needs_a_session(env: Env) -> None:
    assert (await env.client.post(f"/api/v1{D}")).status_code == 401
    assert (await env.client.get(f"/api/v1{D}")).status_code == 401
    r = await env.post("/auth/login", {"identifier": PHONE, "pin": PIN, "restore_account": "x"})
    assert r.status_code == 422


async def test_the_console_hides_a_deleted_accounts_details_outside_compliance(
    db_settings: Settings, esc: Escrow, owner: Party, taker: Party, staff: Admin, boss: AsyncClient
) -> None:
    headers = owner._h() | {"X-Step-Up-Token": await owner.approve("account.delete")}
    assert (await esc.env.client.post(f"/api/v1{D}", headers=headers)).status_code == 200
    email = OWNER[1]
    agent = await staff.invite(boss, "agent@xspeeria.test", "support_agent")
    rows = (await agent.get("/api/v1/admin/users", headers=H)).json()["items"]
    gone = [r for r in rows if r["deletion"] is not None]
    assert len(gone) == 1
    assert (gone[0]["email"], gone[0]["phone"], gone[0]["name"]) == (None, None, None)
    assert gone[0]["deletion"]["state"] == "deleting"
    # The other customer is shown as usual.
    assert any(r["email"] == TAKER[1] for r in rows)
    # Nor can they find it by its email.
    found = (await agent.get("/api/v1/admin/users", params={"q": email}, headers=H)).json()
    assert found["total"] == 0
    # The Super Admin (who has kyc.read) sees the kept records.
    row = (await boss.get("/api/v1/admin/users", params={"q": email}, headers=H)).json()["items"][0]
    assert row["email"] == email and row["deletion"]["state"] == "deleting"
    # The activity view of a deleted account is for Compliance only: a role that may read
    # activity but has no kyc.read is refused; the Super Admin isn't.
    role = f"activity_reader_{uuid.uuid4().hex[:8]}"  # custom roles are kept between tests
    r = await boss.post(
        "/api/v1/admin/roles",
        json={"name": role, "permissions": ["users.read", "activity.read"]},
        headers=H,
    )
    assert r.status_code == 201, r.text
    reader = await staff.invite(boss, "reader@xspeeria.test", role)
    uid = row["id"]
    assert (await reader.get(f"/api/v1/admin/users/{uid}/activity", headers=H)).status_code == 403
    assert (await boss.get(f"/api/v1/admin/users/{uid}/activity", headers=H)).status_code == 200
