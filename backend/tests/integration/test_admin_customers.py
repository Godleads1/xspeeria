# ruff: noqa: F811, E501  -- pytest fixtures are imported by name and used as parameters
"""Admin console customers (ADR-062): list, counts, suspend / reactivate / close.

Owner decisions 2026-10-26: Suspend = temporary, Close = for good; Super Admin only.
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
    PIN,
    Clock,
    Env,
    _code,
    _runtime,
    _sql,
    clean,
    migrated,
)
from tests.integration.test_matches_api import (  # noqa: F401
    OWNER,
    TAKER,
    Person,
    offer,
    owner,
    taker,
)
from tests.integration.test_offers_api import currencies, env  # noqa: F401

pytestmark = [pytest.mark.integration, pytest.mark.asyncio]


@pytest_asyncio.fixture
async def staff(db_settings: Settings, owner: Person, taker: Person) -> AsyncIterator[Admin]:
    """Made after the customers: their setup clears the staff tables first."""
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


async def _id(db: Settings, phone: str) -> str:
    return str(await _sql(db, "SELECT id FROM users WHERE phone = :p", p=phone))


async def _act(
    boss: AsyncClient, user_id: str, action: str, reason: str = "Fraud check pending"
) -> Any:
    return await boss.post(
        f"/api/v1/admin/users/{user_id}/{action}", json={"reason": reason}, headers=H
    )


async def test_list_search_and_counts(db_settings: Settings, boss: AsyncClient) -> None:
    r = await boss.get("/api/v1/admin/users", headers=H)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"] == 2 and {i["email"] for i in body["items"]} == {OWNER[1], TAKER[1]}
    assert all(i["status"] == "active" and i["last_login_at"] for i in body["items"])
    one = (await boss.get("/api/v1/admin/users", params={"q": "DAVID@"}, headers=H)).json()
    assert [i["email"] for i in one["items"]] == [OWNER[1]]
    by_phone = (await boss.get("/api/v1/admin/users", params={"q": "8383838"}, headers=H)).json()
    assert [i["email"] for i in by_phone["items"]] == [OWNER[1]]
    stats = (await boss.get("/api/v1/admin/users/stats", headers=H)).json()
    assert stats["total"] == 2 and stats["active_30_days"] == 2 and stats["suspended"] == 0
    assert (
        await boss.get("/api/v1/admin/users", params={"status": "pending_verification"}, headers=H)
    ).status_code == 422


async def test_suspend_logs_out_hides_offers_and_reactivate_restores(
    db_settings: Settings,
    env: Env,
    boss: AsyncClient,
    owner: Person,
    taker: Person,
    offer: dict[str, Any],
) -> None:
    uid = await _id(db_settings, OWNER[0])
    r = await _act(boss, uid, "suspend")
    assert r.status_code == 200 and r.json()["status"] == "suspended", r.text
    # Sessions end at once; logging in again is refused.
    assert (await owner.get("/mine")).status_code == 401
    assert (await env.login(OWNER[0])).status_code != 200
    # The offer leaves the market and can't be taken.
    listed = (await taker.listings()).json()
    assert offer["offer_id"] not in str(listed)
    assert (await taker.take(offer["offer_id"])).status_code == 404
    # Suspending twice is refused.
    assert (await _act(boss, uid, "suspend")).status_code == 409
    # Lifted: logs in again, offer is back.
    assert (await _act(boss, uid, "reactivate", "Checked, all fine")).status_code == 200
    assert (await env.login(OWNER[0])).status_code == 200
    assert offer["offer_id"] in str((await taker.listings()).json())
    page = (await boss.get("/api/v1/admin/audit-log", headers=H)).json()
    actions = [(i["action"], i["detail"]) for i in page["items"] if i["target_type"] == "customer"]
    assert actions[0] == (
        "customer_reactivated",
        {"from": "suspended", "to": "active", "reason": "Checked, all fine"},
    )
    assert actions[1][0] == "customer_suspended"


async def test_closed_is_for_good_and_sign_up_cannot_take_it_over(
    db_settings: Settings, env: Env, boss: AsyncClient, owner: Person
) -> None:
    uid = await _id(db_settings, OWNER[0])
    assert (await _act(boss, uid, "close", "Customer asked to close")).status_code == 200
    assert (await _act(boss, uid, "reactivate")).status_code == 409
    assert (await _act(boss, uid, "suspend")).status_code == 409
    assert (await env.login(OWNER[0])).status_code != 200
    # A new sign-up with the same phone or email does not replace the closed account.
    await env.post("/auth/register", {"phone": OWNER[0], "email": "new@example.com", "pin": PIN})
    assert await _sql(db_settings, "SELECT status FROM users WHERE id = :i", i=uid) == "closed"
    assert await _sql(db_settings, "SELECT email FROM users WHERE id = :i", i=uid) == OWNER[1]
    r = await env.post("/auth/register", {"phone": "+2348039999999", "email": OWNER[1], "pin": PIN})
    assert r.status_code == 400 and r.json()["error"]["code"] == "AUTH_400_EMAIL_TAKEN"


async def test_only_a_super_admin_changes_customers_and_a_reason_is_required(
    db_settings: Settings, staff: Admin, boss: AsyncClient
) -> None:
    uid = await _id(db_settings, OWNER[0])
    agent = await staff.invite(boss, "agent@xspeeria.test", "support_agent")
    assert (await agent.get("/api/v1/admin/users", headers=H)).status_code == 200
    assert (await _act(agent, uid, "suspend")).status_code == 403
    comp = await staff.invite(boss, "comp@xspeeria.test", "compliance_officer")
    assert (await _act(comp, uid, "suspend")).status_code == 403
    assert (await _act(boss, uid, "suspend", "  no ")).status_code == 422
    assert (await _act(boss, uid, "delete")).status_code == 422
    assert (await _act(boss, "00000000-0000-0000-0000-000000000000", "suspend")).status_code == 404
    assert await _sql(db_settings, "SELECT status FROM users WHERE id = :i", i=uid) == "active"
    async with staff.client() as stranger:
        assert (await stranger.get("/api/v1/admin/users", headers=H)).status_code == 401
    assert (await boss.get("/api/v1/admin/users")).status_code == 403
