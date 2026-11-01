# ruff: noqa: F811, E501  -- pytest fixtures are imported by name and used as parameters
"""Admin console staff: sign-in, sessions, roles, escalation and the audit log (ADR-060)."""

from __future__ import annotations

import base64
import uuid
from collections.abc import AsyncIterator
from typing import Any

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient, Response
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.core.config import Settings
from app.db.session import build_engine
from app.domain.staff_rules import ALL_PERMISSIONS
from app.main import create_app
from app.providers.email import RecordingEmailSender
from app.providers.object_store import LocalFolderStore
from app.services.auth import AuthRuntime
from app.services.staff import StaffService
from tests.integration.test_auth_api import (  # noqa: F401
    Clock,
    _code,
    _runtime,
    _sql,
    clean,
    migrated,
)
from tests.unit.test_image_rules import SECRET, _png_chunk, png

pytestmark = [pytest.mark.integration, pytest.mark.asyncio]

H = {"X-Xspeeria-Admin": "1"}
BOSS = "boss@xspeeria.test"
BOSS_PW = "correct horse battery staple"
NEW_PW = "another long passphrase 42"


class Admin:
    def __init__(self, db_settings: Settings, clock: Clock, runtime: AuthRuntime) -> None:
        self.db_settings, self.clock, self.runtime = db_settings, clock, runtime
        app = create_app(
            Settings(_env_file=None, database_url=db_settings.database_url),  # type: ignore[call-arg]
            auth_runtime=runtime,
        )
        self.app = app
        #: Clients handed out by ``invite``; closed when the test ends.
        self.opened: list[AsyncClient] = []

    def client(self) -> AsyncClient:
        return AsyncClient(transport=ASGITransport(app=self.app), base_url="http://test.local")

    @property
    def mail(self) -> RecordingEmailSender:
        assert isinstance(self.runtime.email, RecordingEmailSender)
        return self.runtime.email

    async def service_call(self, fn: str, *args: Any) -> Any:
        engine = build_engine(self.db_settings)
        try:
            async with async_sessionmaker(engine, expire_on_commit=False)() as db:
                return await getattr(StaffService(db, self.runtime), fn)(*args)
        finally:
            await engine.dispose()

    async def login(self, c: AsyncClient, email: str, password: str) -> Response:
        r = await c.post(
            "/api/v1/admin/auth/login", json={"email": email, "password": password}, headers=H
        )
        if r.status_code != 200:
            return r
        code = self.mail.last_code_for(email)
        return await c.post(
            "/api/v1/admin/auth/verify",
            json={"challenge_id": r.json()["challenge_id"], "code": code},
            headers=H,
        )

    async def role_id(self, name: str) -> str:
        return str(
            await _sql(self.db_settings, "SELECT id FROM staff_roles WHERE name = :n", n=name)
        )

    async def invite(
        self, c: AsyncClient, email: str, role: str, password: str = NEW_PW
    ) -> AsyncClient:
        """Invite through ``c``; the new person sets a password; returns their logged-in client."""
        r = await c.post(
            "/api/v1/admin/staff",
            json={
                "email": email,
                "name": "New Person",
                "phone": "+2348031234567",
                "role_id": await self.role_id(role),
            },
            headers=H,
        )
        assert r.status_code == 201, r.text
        other = self.client()
        self.opened.append(other)
        r2 = await other.post(
            "/api/v1/admin/auth/reset-password",
            json={
                "reset_id": r.json()["invite_id"],
                "code": self.mail.last_code_for(email),
                "new_password": password,
            },
            headers=H,
        )
        assert r2.status_code == 204, r2.text
        assert (await self.login(other, email, password)).status_code == 200
        return other


@pytest_asyncio.fixture
async def admin(db_settings: Settings) -> AsyncIterator[Admin]:
    await _sql(db_settings, "DELETE FROM staff_roles WHERE NOT builtin")
    clock = Clock()
    a = Admin(db_settings, clock, _runtime(clock, None, 10_000))
    await a.service_call("create_first_super_admin", BOSS, "The Boss", BOSS_PW)
    yield a
    for c in a.opened:
        await c.aclose()
    await _sql(
        db_settings,
        "TRUNCATE ops_alerts, api_metrics, job_status, customer_activity, kyc_reviews, fraud_alerts, adverts, service_outages, reversals, dispute_messages, disputes, staff_audit_log, staff_sessions, staff_codes, staff_accounts",
    )
    await _sql(db_settings, "DELETE FROM staff_roles WHERE NOT builtin")


@pytest_asyncio.fixture
async def boss(admin: Admin) -> AsyncIterator[AsyncClient]:
    async with admin.client() as c:
        r = await admin.login(c, BOSS, BOSS_PW)
        assert r.status_code == 200, r.text
        yield c


# --- sign-in -----------------------------------------------------------------------------------


async def test_password_then_email_code_opens_a_session(admin: Admin) -> None:
    async with admin.client() as c:
        r = await c.post(
            "/api/v1/admin/auth/login", json={"email": BOSS, "password": BOSS_PW}, headers=H
        )
        assert r.status_code == 200 and r.json()["email"] == "b***@xspeeria.test"
        assert (await c.get("/api/v1/admin/me", headers=H)).status_code == 401  # no session yet
        code = admin.mail.last_code_for(BOSS)
        r = await c.post(
            "/api/v1/admin/auth/verify",
            json={"challenge_id": r.json()["challenge_id"], "code": code},
            headers=H,
        )
        assert r.status_code == 200 and r.json()["role"] == "super_admin"
        cookie = r.headers["set-cookie"].lower()
        assert (
            "httponly" in cookie and "samesite=strict" in cookie and "path=/api/v1/admin" in cookie
        )
        me = (await c.get("/api/v1/admin/me", headers=H)).json()
        assert set(me["permissions"]) == ALL_PERMISSIONS and "password_hash" not in me


async def test_every_admin_route_needs_the_admin_header(boss: AsyncClient) -> None:
    assert (await boss.get("/api/v1/admin/me", headers=H)).status_code == 200
    r = await boss.get("/api/v1/admin/me")
    assert r.status_code == 403 and _code(r) == "AUTH_403_FORBIDDEN"
    r = await boss.post("/api/v1/admin/auth/login", json={"email": BOSS, "password": BOSS_PW})
    assert r.status_code == 403


async def test_the_cookie_is_secure_outside_a_developer_computer(db_settings: Settings) -> None:
    await _sql(db_settings, "DELETE FROM staff_roles WHERE NOT builtin")
    clock = Clock()
    runtime = _runtime(clock, None, 10_000)
    staging = Settings(_env_file=None, database_url=db_settings.database_url, app_env="staging")  # type: ignore[call-arg]
    a = Admin(db_settings, clock, runtime)
    a.app = create_app(staging, auth_runtime=runtime)
    await a.service_call("create_first_super_admin", BOSS, "The Boss", BOSS_PW)
    try:
        async with a.client() as c:
            r = await a.login(c, BOSS, BOSS_PW)
            assert "secure" in r.headers["set-cookie"].lower()
    finally:
        await _sql(
            db_settings,
            "TRUNCATE ops_alerts, api_metrics, job_status, customer_activity, kyc_reviews, fraud_alerts, adverts, service_outages, reversals, dispute_messages, disputes, staff_audit_log, staff_sessions, staff_codes, staff_accounts",
        )


async def test_wrong_passwords_lock_and_unknown_emails_look_the_same(admin: Admin) -> None:
    async with admin.client() as c:
        for _ in range(4):
            r = await admin.login(c, BOSS, "wrong password here")
            assert r.status_code == 401 and _code(r) == "AUTH_401_INVALID_CREDENTIALS"
        r = await admin.login(c, BOSS, "wrong password here")
        assert r.status_code == 429
        # Locked: even the right password waits.
        assert (await admin.login(c, BOSS, BOSS_PW)).status_code == 429
        admin.clock.advance(minutes=16)
        assert (await admin.login(c, BOSS, BOSS_PW)).status_code == 200
        # An unknown email answers exactly like a wrong password, then locks the same way.
        for _ in range(4):
            r = await admin.login(c, "nobody@xspeeria.test", "whatever password")
            assert (
                r.status_code == 401
                and r.json()["error"]["message"] == "The email or password is incorrect."
            )
        assert (
            await admin.login(c, "nobody@xspeeria.test", "whatever password")
        ).status_code == 429
        assert admin.mail.last_code_for("nobody@xspeeria.test") is None


async def test_email_codes_are_single_use_limited_and_expire(admin: Admin) -> None:
    async with admin.client() as c:

        async def start() -> str:
            r = await c.post(
                "/api/v1/admin/auth/login", json={"email": BOSS, "password": BOSS_PW}, headers=H
            )
            return str(r.json()["challenge_id"])

        async def verify(cid: str, code: str | None) -> Response:
            return await c.post(
                "/api/v1/admin/auth/verify", json={"challenge_id": cid, "code": code}, headers=H
            )

        cid = await start()
        good = admin.mail.last_code_for(BOSS)
        bad = "000000" if good != "000000" else "111111"
        for _ in range(4):
            assert _code(await verify(cid, bad)) == "AUTH_401_INVALID_OTP"
        assert _code(await verify(cid, bad)) == "AUTH_410_CHALLENGE_EXPIRED"
        assert _code(await verify(cid, good)) == "AUTH_410_CHALLENGE_EXPIRED"  # 5 tries used up

        cid = await start()
        admin.clock.advance(minutes=11)
        assert (
            _code(await verify(cid, admin.mail.last_code_for(BOSS))) == "AUTH_410_CHALLENGE_EXPIRED"
        )

        cid = await start()
        good = admin.mail.last_code_for(BOSS)
        assert (await verify(cid, good)).status_code == 200
        assert _code(await verify(cid, good)) == "AUTH_410_CHALLENGE_EXPIRED"  # used
        # A random challenge id gives nothing away.
        assert _code(await verify(str(uuid.uuid4()), good)) == "AUTH_401_INVALID_OTP"


async def test_sessions_end_when_idle_after_8_hours_and_at_log_out(
    admin: Admin, boss: AsyncClient
) -> None:
    admin.clock.advance(minutes=14)
    assert (await boss.get("/api/v1/admin/me", headers=H)).status_code == 200  # keeps it alive
    admin.clock.advance(minutes=14)
    assert (await boss.get("/api/v1/admin/me", headers=H)).status_code == 200
    admin.clock.advance(minutes=16)
    assert (await boss.get("/api/v1/admin/me", headers=H)).status_code == 401  # idle

    async with admin.client() as c:
        await admin.login(c, BOSS, BOSS_PW)
        for _ in range(36):  # 36 × 14 min > 8 hours
            admin.clock.advance(minutes=14)
            last = await c.get("/api/v1/admin/me", headers=H)
        assert last.status_code == 401  # 8 hours in any case

    async with admin.client() as c:
        await admin.login(c, BOSS, BOSS_PW)
        token = c.cookies.get("xsp_admin_session")
        assert (await c.post("/api/v1/admin/auth/logout", headers=H)).status_code == 204
        async with admin.client() as thief:  # the old cookie is dead, not just forgotten
            thief.cookies.set("xsp_admin_session", str(token), path="/api/v1/admin")
            assert (await thief.get("/api/v1/admin/me", headers=H)).status_code == 401
    count = await _sql(
        admin.db_settings, "SELECT count(*) FROM staff_sessions WHERE token_hash = :t", t=token
    )
    assert count == 0  # stored only as a hash


# --- staff and roles ---------------------------------------------------------------------------


async def test_invited_staff_set_their_own_password_and_get_only_their_role(
    admin: Admin, boss: AsyncClient
) -> None:
    agent = await admin.invite(boss, "agent@xspeeria.test", "support_agent")
    me = (await agent.get("/api/v1/admin/me", headers=H)).json()
    assert me["role"] == "support_agent" and "staff.read" not in me["permissions"]
    for path in ("/api/v1/admin/staff", "/api/v1/admin/roles", "/api/v1/admin/audit-log"):
        r = await agent.get(path, headers=H)
        assert r.status_code == 403 and _code(r) == "AUTH_403_FORBIDDEN", path
    r = await agent.post(
        "/api/v1/admin/roles", json={"name": "sneaky", "permissions": ["users.read"]}, headers=H
    )
    assert r.status_code == 403
    staff = (await boss.get("/api/v1/admin/staff", headers=H)).json()
    assert {s["email"] for s in staff} == {BOSS, "agent@xspeeria.test"}


async def test_no_one_can_grant_more_than_they_have(admin: Admin, boss: AsyncClient) -> None:
    # A staff manager who may manage staff and roles but not read the audit log.
    perms = sorted(
        {f"staff.{a}" for a in ("read", "create", "update")}
        | {f"roles.{a}" for a in ("read", "create", "update", "delete")}
        | {"users.read", "dashboard.read"}
    )
    r = await boss.post(
        "/api/v1/admin/roles", json={"name": "staff_manager", "permissions": perms}, headers=H
    )
    assert r.status_code == 201, r.text
    manager = await admin.invite(boss, "manager@xspeeria.test", "staff_manager")
    # Can't create a role with a permission they lack.
    r = await manager.post(
        "/api/v1/admin/roles", json={"name": "auditor", "permissions": ["audit.read"]}, headers=H
    )
    assert r.status_code == 403
    # Can't edit their own role (even to add what they have).
    own = await admin.role_id("staff_manager")
    r = await manager.patch(
        f"/api/v1/admin/roles/{own}", json={"permissions": perms[:1]}, headers=H
    )
    assert r.status_code == 403
    # Can't hand out a role with more than they have, or Super Admin.
    for role in ("compliance_officer", "super_admin"):
        r = await manager.post(
            "/api/v1/admin/staff",
            json={
                "email": f"{role}@xspeeria.test",
                "name": "Someone",
                "phone": "+2348031234567",
                "role_id": await admin.role_id(role),
            },
            headers=H,
        )
        assert r.status_code == 403, role
    # Can't touch a Super Admin or their own account.
    boss_id = await _sql(
        admin.db_settings, "SELECT id FROM staff_accounts WHERE email = :e", e=BOSS
    )
    assert (
        await manager.patch(
            f"/api/v1/admin/staff/{boss_id}", json={"status": "disabled"}, headers=H
        )
    ).status_code == 403
    me = (await manager.get("/api/v1/admin/me", headers=H)).json()
    r = await manager.patch(f"/api/v1/admin/staff/{me['id']}", json={"name": "Renamed"}, headers=H)
    assert r.status_code == 403
    # Unknown permission names are refused, and unknown fields too.
    r = await manager.post(
        "/api/v1/admin/roles", json={"name": "odd", "permissions": ["money.print"]}, headers=H
    )
    assert r.status_code == 422
    r = await manager.post(
        "/api/v1/admin/roles", json={"name": "odd", "permissions": [], "builtin": True}, headers=H
    )
    assert r.status_code == 422
    # Can't weaken a role, or act on a person, that has more than they do.
    cid = await admin.role_id("compliance_officer")
    r = await manager.patch(
        f"/api/v1/admin/roles/{cid}", json={"permissions": ["users.read"]}, headers=H
    )
    assert r.status_code == 403
    officer = await admin.invite(boss, "officer@xspeeria.test", "compliance_officer")
    officer_id = (await officer.get("/api/v1/admin/me", headers=H)).json()["id"]
    r = await manager.patch(
        f"/api/v1/admin/staff/{officer_id}", json={"status": "disabled"}, headers=H
    )
    assert r.status_code == 403
    # Within their own permissions, all fine.
    r = await manager.post(
        "/api/v1/admin/roles", json={"name": "viewer", "permissions": ["users.read"]}, headers=H
    )
    assert r.status_code == 201


async def test_super_admin_role_cannot_be_edited_or_deleted(
    admin: Admin, boss: AsyncClient
) -> None:
    sid = await admin.role_id("super_admin")
    assert (
        await boss.patch(f"/api/v1/admin/roles/{sid}", json={"permissions": []}, headers=H)
    ).status_code == 403
    assert (await boss.delete(f"/api/v1/admin/roles/{sid}", headers=H)).status_code == 403
    cid = await admin.role_id("compliance_officer")
    assert (
        await boss.delete(f"/api/v1/admin/roles/{cid}", headers=H)
    ).status_code == 403  # built in
    r = await boss.post(
        "/api/v1/admin/roles", json={"name": "temp", "permissions": ["users.read"]}, headers=H
    )
    temp = r.json()["id"]
    await admin.invite(boss, "temp@xspeeria.test", "temp")
    r = await boss.delete(f"/api/v1/admin/roles/{temp}", headers=H)
    assert r.status_code == 409 and _code(r) == "RES_409_ROLE_IN_USE"


async def test_role_changes_apply_at_once_and_disabling_ends_sessions(
    admin: Admin, boss: AsyncClient
) -> None:
    agent = await admin.invite(boss, "agent@xspeeria.test", "support_agent")
    agent_id = (await agent.get("/api/v1/admin/me", headers=H)).json()["id"]
    r = await boss.patch(
        f"/api/v1/admin/staff/{agent_id}",
        json={"role_id": await admin.role_id("ops_admin")},
        headers=H,
    )
    assert r.status_code == 200 and r.json()["role"] == "ops_admin"
    # A role change logs them out, so they sign in again with the new role.
    assert (await agent.get("/api/v1/admin/me", headers=H)).status_code == 401
    assert (await admin.login(agent, "agent@xspeeria.test", NEW_PW)).status_code == 200
    assert (await agent.get("/api/v1/admin/me", headers=H)).json()["role"] == "ops_admin"
    r = await boss.patch(f"/api/v1/admin/staff/{agent_id}", json={"status": "disabled"}, headers=H)
    assert r.status_code == 200
    assert (await agent.get("/api/v1/admin/me", headers=H)).status_code == 401
    assert (await admin.login(agent, "agent@xspeeria.test", NEW_PW)).status_code == 401


# --- passwords ---------------------------------------------------------------------------------


async def test_forgot_password_looks_the_same_for_unknown_emails(admin: Admin) -> None:
    async with admin.client() as c:
        r = await c.post(
            "/api/v1/admin/auth/forgot-password", json={"email": "nobody@xspeeria.test"}, headers=H
        )
        assert r.status_code == 200 and "reset_id" in r.json()
        assert admin.mail.last_code_for("nobody@xspeeria.test") is None
        r = await c.post(
            "/api/v1/admin/auth/reset-password",
            json={"reset_id": r.json()["reset_id"], "code": "123456", "new_password": NEW_PW},
            headers=H,
        )
        assert r.status_code == 401


async def test_reset_password_checks_strength_and_ends_sessions(
    admin: Admin, boss: AsyncClient
) -> None:
    async with admin.client() as c:
        r = await c.post("/api/v1/admin/auth/forgot-password", json={"email": BOSS}, headers=H)
        rid, code = r.json()["reset_id"], admin.mail.last_code_for(BOSS)
        for weak in ("short", "aaaaaaaaaaaaaaaa", "boss-is-my-password-ok"):
            r = await c.post(
                "/api/v1/admin/auth/reset-password",
                json={"reset_id": rid, "code": code, "new_password": weak},
                headers=H,
            )
            assert r.status_code == 422 and _code(r) == "VAL_422_WEAK_PASSWORD", weak
        # A weak try doesn't use up the code.
        r = await c.post(
            "/api/v1/admin/auth/reset-password",
            json={"reset_id": rid, "code": code, "new_password": NEW_PW},
            headers=H,
        )
        assert r.status_code == 204
    assert (await boss.get("/api/v1/admin/me", headers=H)).status_code == 401
    async with admin.client() as c:
        assert (await admin.login(c, BOSS, BOSS_PW)).status_code == 401
        assert (await admin.login(c, BOSS, NEW_PW)).status_code == 200


async def test_changing_my_password_keeps_this_session_only(
    admin: Admin, boss: AsyncClient
) -> None:
    async with admin.client() as other:
        await admin.login(other, BOSS, BOSS_PW)
        r = await boss.post(
            "/api/v1/admin/me/password",
            json={"current_password": "wrong one entirely", "new_password": NEW_PW},
            headers=H,
        )
        assert r.status_code == 401
        r = await boss.post(
            "/api/v1/admin/me/password",
            json={"current_password": BOSS_PW, "new_password": NEW_PW},
            headers=H,
        )
        assert r.status_code == 204
        assert (await boss.get("/api/v1/admin/me", headers=H)).status_code == 200
        assert (await other.get("/api/v1/admin/me", headers=H)).status_code == 401


async def test_i_can_change_my_own_name_and_phone_only(admin: Admin, boss: AsyncClient) -> None:
    r = await boss.patch(
        "/api/v1/admin/me", json={"name": "  Godleads Boss ", "phone": "+44 7700 900123"}, headers=H
    )
    assert r.status_code == 200, r.text
    assert r.json()["name"] == "Godleads Boss" and r.json()["phone"] == "+447700900123"
    # Email, role and status are not mine to change: refused, nothing saved.
    me = (await boss.get("/api/v1/admin/me", headers=H)).json()
    for extra in (
        {"email": "taken@xspeeria.test"},
        {"role_id": await admin.role_id("support_agent")},
        {"status": "disabled"},
        {"permissions": ["staff.update"]},
    ):
        r = await boss.patch("/api/v1/admin/me", json={"name": "Hacker", **extra}, headers=H)
        assert r.status_code == 422, extra
    assert (await boss.get("/api/v1/admin/me", headers=H)).json() == me
    # A bad phone is refused; a blank name is refused.
    assert (
        await boss.patch("/api/v1/admin/me", json={"phone": "not a phone"}, headers=H)
    ).status_code == 422
    assert (
        await boss.patch("/api/v1/admin/me", json={"name": "  a "}, headers=H)
    ).status_code == 422
    # The audit records that it changed, never the number.
    page = (await boss.get("/api/v1/admin/audit-log?action=profile_updated", headers=H)).json()
    assert len(page["items"]) == 1
    assert page["items"][0]["detail"] == {"name": True, "phone": True}
    assert "7700900123" not in str(page)
    # Saving the same values again writes no new audit entry.
    await boss.patch("/api/v1/admin/me", json={"name": "Godleads Boss"}, headers=H)
    page = (await boss.get("/api/v1/admin/audit-log?action=profile_updated", headers=H)).json()
    assert len(page["items"]) == 1


async def test_my_profile_needs_a_session_and_the_admin_header(
    admin: Admin, boss: AsyncClient
) -> None:
    async with admin.client() as stranger:
        assert (
            await stranger.patch("/api/v1/admin/me", json={"name": "X Y"}, headers=H)
        ).status_code == 401
    assert (await boss.patch("/api/v1/admin/me", json={"name": "X Y"})).status_code == 403


async def test_a_support_agent_can_change_their_own_name(admin: Admin, boss: AsyncClient) -> None:
    agent = await admin.invite(boss, "agent@xspeeria.test", "support_agent")
    r = await agent.patch("/api/v1/admin/me", json={"name": "Agent Smith"}, headers=H)
    assert r.status_code == 200 and r.json()["name"] == "Agent Smith"
    assert r.json()["role"] == "support_agent"


# --- audit log ---------------------------------------------------------------------------------


async def test_audit_log_records_changes_without_secrets_and_cannot_be_edited(
    admin: Admin, boss: AsyncClient
) -> None:
    async with admin.client() as c:
        await admin.login(c, BOSS, "a wrong password")
    await boss.post(
        "/api/v1/admin/roles", json={"name": "viewer", "permissions": ["users.read"]}, headers=H
    )
    page = (await boss.get("/api/v1/admin/audit-log", headers=H)).json()
    actions = [i["action"] for i in page["items"]]
    assert actions[0] == "role_created" and "login" in actions and "login_failed" in actions
    assert "first_super_admin_created" in actions
    dump = str(page)
    assert BOSS_PW not in dump and "a wrong password" not in dump
    for code in {c.code for c in admin.mail.sent if c.code}:
        assert code not in dump
    one = (await boss.get("/api/v1/admin/audit-log?limit=1&action=login", headers=H)).json()
    assert len(one["items"]) == 1 and one["items"][0]["action"] == "login"
    with pytest.raises(DBAPIError, match="append-only"):
        await _sql(admin.db_settings, "UPDATE staff_audit_log SET action = 'nothing'")
    with pytest.raises(DBAPIError, match="append-only"):
        await _sql(admin.db_settings, "DELETE FROM staff_audit_log")


async def test_only_one_first_super_admin(admin: Admin) -> None:
    with pytest.raises(ValueError, match="already exists"):
        await admin.service_call("create_first_super_admin", "second@xspeeria.test", "Two", BOSS_PW)
    with pytest.raises(ValueError):
        await admin.service_call("create_first_super_admin", "x@xspeeria.test", "X", "short")


# --- phone and photo (owner decision 2026-10-26) ------------------------------------------------


async def test_new_staff_need_a_valid_phone_and_changes_are_audited_without_it(
    admin: Admin, boss: AsyncClient
) -> None:
    body = {
        "email": "p@xspeeria.test",
        "name": "Pat",
        "role_id": await admin.role_id("support_agent"),
    }
    assert (await boss.post("/api/v1/admin/staff", json=body, headers=H)).status_code == 422
    for bad in ("08031234567", "+234 abc", "+0234803123"):
        r = await boss.post("/api/v1/admin/staff", json={**body, "phone": bad}, headers=H)
        assert r.status_code == 422, bad
    r = await boss.post(
        "/api/v1/admin/staff", json={**body, "phone": "+234 803 123 4567"}, headers=H
    )
    assert r.status_code == 201 and r.json()["phone"] == "+2348031234567"
    sid = r.json()["id"]
    r = await boss.patch(f"/api/v1/admin/staff/{sid}", json={"phone": "+447700900123"}, headers=H)
    assert r.status_code == 200 and r.json()["phone"] == "+447700900123"
    log = (await boss.get("/api/v1/admin/audit-log?action=staff_updated", headers=H)).json()
    assert log["items"][0]["detail"] == {"phone": True}
    assert "447700900123" not in str(log)


@pytest_asyncio.fixture
async def photos(admin: Admin, tmp_path: Any) -> LocalFolderStore:
    store = LocalFolderStore(tmp_path)
    admin.runtime.object_store = store
    return store


async def test_photos_are_cleaned_stored_outside_the_database_and_served_safely(
    admin: Admin, boss: AsyncClient, photos: LocalFolderStore, tmp_path: Any
) -> None:
    me = (await boss.get("/api/v1/admin/me", headers=H)).json()
    dirty = png(_png_chunk(b"tEXt", b"Comment\x00" + SECRET))
    r = await boss.put(
        f"/api/v1/admin/staff/{me['id']}/photo",
        json={"photo": base64.b64encode(dirty).decode()},
        headers=H,
    )
    assert r.status_code == 200 and r.json()["has_photo"] is True
    got = await boss.get(f"/api/v1/admin/staff/{me['id']}/photo", headers=H)
    assert got.status_code == 200 and got.headers["content-type"] == "image/png"
    assert got.content == png() and SECRET not in got.content
    assert got.headers["x-content-type-options"] == "nosniff"
    assert "sandbox" in got.headers["content-security-policy"]
    # Kept in the photo store, never in the database.
    key = await _sql(
        admin.db_settings, "SELECT photo_key FROM staff_accounts WHERE id = :i", i=me["id"]
    )
    assert key.startswith("staff/") and (tmp_path / key).read_bytes() == png()
    # Replacing deletes the old file; removing deletes the new one.
    await boss.put(
        f"/api/v1/admin/staff/{me['id']}/photo",
        json={"photo": base64.b64encode(png()).decode()},
        headers=H,
    )
    assert not (tmp_path / key).exists()
    assert (
        await boss.delete(f"/api/v1/admin/staff/{me['id']}/photo", headers=H)
    ).status_code == 204
    assert (await boss.get(f"/api/v1/admin/staff/{me['id']}/photo", headers=H)).status_code == 404
    assert not any(p.is_file() for p in tmp_path.rglob("*"))


@pytest.mark.parametrize(
    "photo", [base64.b64encode(b"<svg onload=alert(1)>").decode(), "not base64!!"]
)
async def test_non_photos_are_refused(
    boss: AsyncClient, photos: LocalFolderStore, photo: str
) -> None:
    me = (await boss.get("/api/v1/admin/me", headers=H)).json()
    r = await boss.put(f"/api/v1/admin/staff/{me['id']}/photo", json={"photo": photo}, headers=H)
    assert r.status_code == 422


async def test_who_may_see_and_change_photos(
    admin: Admin, boss: AsyncClient, photos: LocalFolderStore
) -> None:
    agent = await admin.invite(boss, "agent@xspeeria.test", "support_agent")
    boss_id = (await boss.get("/api/v1/admin/me", headers=H)).json()["id"]
    agent_id = (await agent.get("/api/v1/admin/me", headers=H)).json()["id"]
    pic = {"photo": base64.b64encode(png()).decode()}
    assert (
        await boss.put(f"/api/v1/admin/staff/{boss_id}/photo", json=pic, headers=H)
    ).status_code == 200
    # Anyone may set their own photo.
    assert (
        await agent.put(f"/api/v1/admin/staff/{agent_id}/photo", json=pic, headers=H)
    ).status_code == 200
    # A support agent (no staff.read) can't see or change someone else's.
    assert (await agent.get(f"/api/v1/admin/staff/{boss_id}/photo", headers=H)).status_code == 403
    assert (
        await agent.put(f"/api/v1/admin/staff/{boss_id}/photo", json=pic, headers=H)
    ).status_code == 403
    assert (
        await agent.delete(f"/api/v1/admin/staff/{boss_id}/photo", headers=H)
    ).status_code == 403
    # The Super Admin can manage the agent's photo.
    assert (await boss.get(f"/api/v1/admin/staff/{agent_id}/photo", headers=H)).status_code == 200
    assert (
        await boss.delete(f"/api/v1/admin/staff/{agent_id}/photo", headers=H)
    ).status_code == 204


async def test_photos_off_without_a_store(admin: Admin, boss: AsyncClient) -> None:
    me = (await boss.get("/api/v1/admin/me", headers=H)).json()
    r = await boss.put(
        f"/api/v1/admin/staff/{me['id']}/photo",
        json={"photo": base64.b64encode(png()).decode()},
        headers=H,
    )
    assert r.status_code == 503


# --- security review findings (2026-10-28) ---------------------------------------------------


async def test_codes_issued_before_a_password_change_stop_working(admin: Admin) -> None:
    """F-003: an older sign-in or reset code can't be used once the password has changed."""
    async with admin.client() as c:
        r = await c.post(
            "/api/v1/admin/auth/login", json={"email": BOSS, "password": BOSS_PW}, headers=H
        )
        login_id, login_code = r.json()["challenge_id"], admin.mail.last_code_for(BOSS)
        r = await c.post("/api/v1/admin/auth/forgot-password", json={"email": BOSS}, headers=H)
        old_id, old_code = r.json()["reset_id"], admin.mail.last_code_for(BOSS)
        admin.clock.advance(minutes=2)
        r = await c.post("/api/v1/admin/auth/forgot-password", json={"email": BOSS}, headers=H)
        new_id, new_code = r.json()["reset_id"], admin.mail.last_code_for(BOSS)
        assert old_id != new_id
        r = await c.post(
            "/api/v1/admin/auth/reset-password",
            json={"reset_id": new_id, "code": new_code, "new_password": NEW_PW},
            headers=H,
        )
        assert r.status_code == 204, r.text
        admin.clock.advance(seconds=1)
        # The older reset code can't set the password again ...
        r = await c.post(
            "/api/v1/admin/auth/reset-password",
            json={
                "reset_id": old_id,
                "code": old_code,
                "new_password": "a third long passphrase 7",
            },
            headers=H,
        )
        assert r.status_code == 410 and _code(r) == "AUTH_410_CHALLENGE_EXPIRED", r.text
        # ... and the sign-in started under the old password can't finish.
        r = await c.post(
            "/api/v1/admin/auth/verify",
            json={"challenge_id": login_id, "code": login_code},
            headers=H,
        )
        assert r.status_code == 410 and _code(r) == "AUTH_410_CHALLENGE_EXPIRED", r.text
    async with admin.client() as c:
        assert (await admin.login(c, BOSS, NEW_PW)).status_code == 200


async def test_a_locked_account_and_an_unknown_email_give_the_same_wait(admin: Admin) -> None:
    """F-013: the retry time doesn't reveal that an email is a real, locked staff account."""

    async def wait_for(c: AsyncClient, email: str) -> int:
        for _ in range(5):
            r = await admin.login(c, email, "wrong password here")
        assert r.status_code == 429
        admin.clock.advance(minutes=5)
        r = await admin.login(c, email, "wrong password here")
        assert r.status_code == 429, r.text
        return int(r.json()["error"]["details"]["retry_after_seconds"])

    async with admin.client() as c:
        known = await wait_for(c, BOSS)
        unknown = await wait_for(c, "nobody@xspeeria.test")
    assert known == unknown


async def test_a_role_with_powers_i_lack_cannot_be_deleted(admin: Admin, boss: AsyncClient) -> None:
    """F-014: deleting a role needs authority over every permission it holds."""
    perms = sorted(
        {f"staff.{a}" for a in ("read", "create", "update")}
        | {f"roles.{a}" for a in ("read", "create", "update", "delete")}
        | {"users.read", "dashboard.read"}
    )
    r = await boss.post(
        "/api/v1/admin/roles", json={"name": "staff_manager", "permissions": perms}, headers=H
    )
    assert r.status_code == 201, r.text
    manager = await admin.invite(boss, "manager@xspeeria.test", "staff_manager")
    r = await boss.post(
        "/api/v1/admin/roles", json={"name": "auditor", "permissions": ["audit.read"]}, headers=H
    )
    auditor = r.json()["id"]
    r = await boss.post(
        "/api/v1/admin/roles", json={"name": "viewer", "permissions": ["users.read"]}, headers=H
    )
    viewer = r.json()["id"]
    r = await manager.delete(f"/api/v1/admin/roles/{auditor}", headers=H)
    assert r.status_code == 403 and _code(r) == "AUTH_403_FORBIDDEN"
    assert (
        await _sql(admin.db_settings, "SELECT count(*) FROM staff_roles WHERE name = 'auditor'")
        == 1
    )
    # A role within the manager's own powers can still be deleted.
    assert (await manager.delete(f"/api/v1/admin/roles/{viewer}", headers=H)).status_code == 204
    assert (await boss.delete(f"/api/v1/admin/roles/{auditor}", headers=H)).status_code == 204
