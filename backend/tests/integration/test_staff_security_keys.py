# ruff: noqa: F811  -- pytest fixtures are imported by name and used as parameters
"""Super Admin hardware security keys (ADR-051 Decision 2, ADR-081), against PostgreSQL.

A software key (``tests/soft_key.py``) signs exactly like a FIDO2 key, so these run the real
py_webauthn checks: right site, right challenge, right key, counter going up.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

import pytest
import pytest_asyncio
from httpx import AsyncClient

from app.cli.staff_keys import list_keys, remove_keys
from app.core.config import Settings
from app.db.session import dispose_engine
from app.main import build_auth_runtime
from app.services.ops_alerts import _STAFF_ACCESS_ACTIONS
from tests.integration.test_admin_staff import BOSS, BOSS_PW, Admin, H, admin, boss  # noqa: F401
from tests.integration.test_auth_api import _code, _sql, migrated  # noqa: F401
from tests.soft_key import SoftKey

pytestmark = [pytest.mark.integration, pytest.mark.asyncio]


@pytest_asyncio.fixture(autouse=True)
async def _fresh_engine(db_settings: Settings) -> AsyncIterator[None]:
    """Each test runs on its own event loop; never hand the next one this loop's engine.
    And start with no staff, whatever an earlier module left behind."""
    await dispose_engine()
    await _sql(
        db_settings,
        "TRUNCATE rate_limit_hits, deal_pauses, ops_alerts, api_metrics, job_status, "
        "customer_activity, kyc_reviews, fraud_alerts, adverts, service_outages, reversals, "
        "dispute_messages, disputes, staff_audit_log, staff_sessions, staff_codes, "
        "staff_key_challenges, staff_security_keys, staff_accounts",
    )
    yield
    await dispose_engine()


KEYS = "/api/v1/admin/me/security-keys"


async def _add_key(c: AsyncClient, key: SoftKey, name: str = "Blue YubiKey") -> Any:
    r = await c.post(f"{KEYS}/options", headers=H)
    assert r.status_code == 200, r.text
    body = r.json()
    opts = body["options"]
    assert opts["rp"]["id"] == "localhost"
    assert opts["authenticatorSelection"]["authenticatorAttachment"] == "cross-platform"
    return await c.post(
        KEYS,
        json={
            "key_challenge_id": body["key_challenge_id"],
            "name": name,
            "credential": key.register(opts),
        },
        headers=H,
    )


async def _password_and_code(admin: Admin, c: AsyncClient, email: str, pw: str) -> Any:
    r = await admin.login(c, email, pw)
    assert r.status_code == 200, r.text
    return r.json()


async def _touch(c: AsyncClient, step: dict[str, Any], answer: dict[str, Any]) -> Any:
    return await c.post(
        "/api/v1/admin/auth/key",
        json={"key_challenge_id": step["key_challenge_id"], "credential": answer},
        headers=H,
    )


async def test_after_adding_a_key_sign_in_needs_it(admin: Admin, boss: AsyncClient) -> None:
    key = SoftKey()
    r = await _add_key(boss, key)
    assert r.status_code == 201, r.text
    listed = (await boss.get(KEYS, headers=H)).json()
    assert [k["name"] for k in listed["keys"]] == ["Blue YubiKey"] and listed["can_add"]

    async with admin.client() as c:
        step = await _password_and_code(admin, c, BOSS, BOSS_PW)
        # Password and email code are no longer enough: no session yet.
        assert step["key_required"] is True and "set-cookie" not in step
        assert (await c.get("/api/v1/admin/me", headers=H)).status_code == 401
        r = await _touch(c, step, key.sign_in(step["options"]))
        assert r.status_code == 200, r.text
        assert r.json()["role"] == "super_admin"
        assert (await c.get("/api/v1/admin/staff", headers=H)).status_code == 200
    actions = await _sql(
        admin.db_settings,
        "SELECT string_agg(action, ',' ORDER BY id) FROM staff_audit_log "
        "WHERE action IN ('security_key_added', 'login_key_requested')",
    )
    assert actions == "security_key_added,login_key_requested"
    assert {"security_key_added", "security_key_removed"} <= set(_STAFF_ACCESS_ACTIONS)


async def test_a_look_alike_site_or_the_wrong_key_is_refused(
    admin: Admin, boss: AsyncClient
) -> None:
    key = SoftKey()
    assert (await _add_key(boss, key)).status_code == 201
    async with admin.client() as c:
        # A phishing page on another address: the key signs that address, which doesn't match.
        step = await _password_and_code(admin, c, BOSS, BOSS_PW)
        r = await _touch(c, step, key.sign_in(step["options"], origin="https://xspeeria-login.com"))
        assert (r.status_code, _code(r)) == (401, "ADMIN_401_KEY_CHECK_FAILED")
        # The challenge is spent: the real answer can't be sent afterwards.
        r = await _touch(c, step, key.sign_in(step["options"]))
        assert r.status_code == 401
        # A key that isn't registered.
        step = await _password_and_code(admin, c, BOSS, BOSS_PW)
        stranger = SoftKey()
        answer = stranger.sign_in({**step["options"], "allowCredentials": []})
        assert (await _touch(c, step, answer)).status_code == 401
        # Another site's key identity (relying party).
        step = await _password_and_code(admin, c, BOSS, BOSS_PW)
        r = await _touch(c, step, key.sign_in(step["options"], rp_id="evil.example"))
        assert r.status_code == 401
        assert (await c.get("/api/v1/admin/me", headers=H)).status_code == 401


async def test_a_replayed_or_copied_key_answer_is_refused(admin: Admin, boss: AsyncClient) -> None:
    key = SoftKey()
    assert (await _add_key(boss, key)).status_code == 201
    async with admin.client() as c:
        step = await _password_and_code(admin, c, BOSS, BOSS_PW)
        answer = key.sign_in(step["options"])
        assert (await _touch(c, step, answer)).status_code == 200
        assert (await _touch(c, step, answer)).status_code == 401  # replay
    async with admin.client() as c:
        # A copy of the key whose counter didn't go up.
        step = await _password_and_code(admin, c, BOSS, BOSS_PW)
        r = await _touch(c, step, key.sign_in(step["options"], counter_step=0))
        assert r.status_code == 401


async def test_the_key_step_expires_after_five_minutes(admin: Admin, boss: AsyncClient) -> None:
    key = SoftKey()
    assert (await _add_key(boss, key)).status_code == 201
    async with admin.client() as c:
        step = await _password_and_code(admin, c, BOSS, BOSS_PW)
        admin.clock.advance(minutes=5, seconds=1)
        assert (await _touch(c, step, key.sign_in(step["options"]))).status_code == 401


async def test_when_keys_are_required_a_super_admin_without_one_can_only_add_one(
    admin: Admin,
) -> None:
    admin.runtime.super_admin_key_required = True
    async with admin.client() as c:
        r = await admin.login(c, BOSS, BOSS_PW)
        assert r.status_code == 200 and r.json()["key_setup_only"] is True
        assert (await c.get("/api/v1/admin/me", headers=H)).json()["key_setup_only"] is True
        for path in ("/api/v1/admin/staff", "/api/v1/admin/users", "/api/v1/admin/notifications"):
            r = await c.get(path, headers=H)
            assert (r.status_code, _code(r)) == (403, "ADMIN_403_KEY_SETUP_REQUIRED"), path
        assert (await c.get(KEYS, headers=H)).json()["required"] is True
        key = SoftKey()
        assert (await _add_key(c, key)).status_code == 201
        # Adding the key opens the console for this session.
        assert (await c.get("/api/v1/admin/staff", headers=H)).status_code == 200
        # The only key can't be removed while keys are required.
        key_id = (await c.get(KEYS, headers=H)).json()["keys"][0]["id"]
        r = await c.delete(f"{KEYS}/{key_id}", headers=H)
        assert (r.status_code, _code(r)) == (409, "ADMIN_409_LAST_KEY")


async def test_only_super_admins_add_keys_and_other_staff_sign_in_as_before(
    admin: Admin, boss: AsyncClient
) -> None:
    admin.runtime.super_admin_key_required = True
    agent = await admin.invite(boss, "agent@xspeeria.test", "support_agent")
    r = await agent.post(f"{KEYS}/options", headers=H)
    assert (r.status_code, _code(r)) == (403, "ADMIN_403_SUPER_ADMIN_ONLY")
    assert (await agent.get("/api/v1/admin/me", headers=H)).json()["key_setup_only"] is False


async def test_removing_my_spare_key(admin: Admin, boss: AsyncClient) -> None:
    main, spare = SoftKey(), SoftKey()
    assert (await _add_key(boss, main, "Main")).status_code == 201
    assert (await _add_key(boss, spare, "Spare")).status_code == 201
    # The same physical key twice is refused.
    r = await _add_key(boss, spare, "Spare again")
    assert (r.status_code, _code(r)) == (409, "ADMIN_409_KEY_ALREADY_ADDED")
    keys = (await boss.get(KEYS, headers=H)).json()["keys"]
    spare_id = next(k["id"] for k in keys if k["name"] == "Spare")
    assert (await boss.delete(f"{KEYS}/{spare_id}", headers=H)).status_code == 204
    assert [k["name"] for k in (await boss.get(KEYS, headers=H)).json()["keys"]] == ["Main"]


async def test_another_super_admin_removes_a_lost_key(admin: Admin, boss: AsyncClient) -> None:
    second = await admin.invite(boss, "second@xspeeria.test", "super_admin")
    lost = SoftKey()
    assert (await _add_key(second, lost)).status_code == 201
    second_id = (await second.get("/api/v1/admin/me", headers=H)).json()["id"]
    r = await boss.post(
        f"/api/v1/admin/staff/{second_id}/security-keys/remove",
        json={"reason": "Key lost on a trip"},
        headers=H,
    )
    assert r.status_code == 200 and r.json() == {"removed": 1}
    assert (await second.get("/api/v1/admin/me", headers=H)).status_code == 401  # signed out
    # Not your own keys this way, and a reason is required.
    boss_id = (await boss.get("/api/v1/admin/me", headers=H)).json()["id"]
    r = await boss.post(
        f"/api/v1/admin/staff/{boss_id}/security-keys/remove", json={"reason": "testing"}, headers=H
    )
    assert r.status_code == 409
    r = await boss.post(
        f"/api/v1/admin/staff/{second_id}/security-keys/remove", json={"reason": "x"}, headers=H
    )
    assert r.status_code == 422
    # Without a key, the second Super Admin signs in with password and code again.
    async with admin.client() as c:
        r = await admin.login(c, "second@xspeeria.test", "another long passphrase 42")
        assert r.status_code == 200 and "role" in r.json()


async def test_the_server_command_removes_keys_when_no_one_else_can(
    admin: Admin, boss: AsyncClient, db_settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    assert (await _add_key(boss, SoftKey(), "Only key")).status_code == 201
    monkeypatch.setenv("DATABASE_URL", str(db_settings.database_url))
    from app.core.config import get_settings

    get_settings.cache_clear()
    try:
        assert [n for n, _ in await list_keys(BOSS)] == ["Only key"]
        assert await remove_keys(BOSS, "Lost, no other Super Admin") == 1
    finally:
        get_settings.cache_clear()
    assert (await boss.get("/api/v1/admin/me", headers=H)).status_code == 401
    detail = await _sql(
        db_settings,
        "SELECT detail->>'via' FROM staff_audit_log WHERE action = 'security_key_removed'",
    )
    assert detail == "server command"


async def test_production_refuses_to_start_without_required_keys() -> None:
    base = {"_env_file": None, "app_env": "production", "database_url": None}
    with pytest.raises(ValueError, match="SUPER_ADMIN_KEY_REQUIRED"):
        build_auth_runtime(Settings(**base))  # type: ignore[arg-type]
    with pytest.raises(ValueError, match="STAFF_KEY_RP_ID"):
        build_auth_runtime(Settings(**base, super_admin_key_required=True))  # type: ignore[arg-type]
