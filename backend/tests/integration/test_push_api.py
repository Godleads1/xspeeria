# ruff: noqa: F811  -- pytest fixtures are imported by name and used as parameters
"""Milestone N-3: phone push (ADR-052), against PostgreSQL.

Tokens are bound to the signed-in session; each notification is pushed at most once, only to
live sessions, only while fresh, and never carries personal details.
"""

from __future__ import annotations

import uuid
from datetime import timedelta
from typing import Any

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.db.session import build_engine
from app.providers.push import RecordingPushSender
from app.services.notifications import notify
from app.services.push import PushDispatcher
from tests.integration.test_auth_api import (  # noqa: F401
    Env,
    _sql,
    clean,
    env,
    migrated,
)

pytestmark = [pytest.mark.integration, pytest.mark.asyncio]

TOKEN = "ExponentPushToken[abcdefghijklmnop1234]"
OTHER = "ExponentPushToken[zyxwvutsrqponm98765]"


async def _put(env: Env, access: str, token: str = TOKEN, platform: str = "android") -> Any:
    return await env.client.put(
        "/api/v1/users/me/push-token",
        json={"token": token, "platform": platform},
        headers={"Authorization": f"Bearer {access}"},
    )


async def _user_id(env: Env, access: str) -> uuid.UUID:
    return uuid.UUID((await env.get("/users/me", token=access)).json()["user_id"])


async def _notify(db_settings: Settings, env: Env, user_id: uuid.UUID, key: str) -> None:
    engine = build_engine(db_settings)
    try:
        async with engine.begin() as conn, AsyncSession(bind=conn) as db:
            await notify(
                db,
                user_id=user_id,
                event="kyc.approved",
                dedupe_key=key,
                now=env.clock.now,
                kyc_case_id=str(uuid.uuid4()),
                country="GB",
            )
            await db.flush()
    finally:
        await engine.dispose()


async def _round(db_settings: Settings, env: Env, sender: RecordingPushSender) -> int:
    engine = build_engine(db_settings)
    try:
        async with AsyncSession(bind=engine) as db:
            return await PushDispatcher(db, env.clock, sender).run_once()
    finally:
        await engine.dispose()


async def test_pushes_once_without_personal_details(db_settings: Settings, env: Env) -> None:
    me = (await env.sign_up())["access_token"]
    assert (await _put(env, me)).status_code == 204
    uid = await _user_id(env, me)
    await _notify(db_settings, env, uid, "n1")
    sender = RecordingPushSender()
    assert await _round(db_settings, env, sender) == 1
    [m] = sender.sent
    assert m.token == TOKEN
    assert m.title == "Identity verified"
    assert set(m.data) == {"notification_id", "event", "data"}
    assert set(m.data["data"]) == {"kyc_case_id", "country"}
    # Never again, and the delivery is recorded.
    assert await _round(db_settings, env, sender) == 0
    assert len(sender.sent) == 1
    assert await _sql(db_settings, "SELECT count(*) FROM push_deliveries WHERE state='sent'") == 1


async def test_only_live_sessions_get_pushes(db_settings: Settings, env: Env) -> None:
    me = (await env.sign_up())["access_token"]
    await _put(env, me)
    uid = await _user_id(env, me)
    assert (await env.post("/auth/logout", token=me)).status_code == 204
    await _notify(db_settings, env, uid, "after-logout")
    sender = RecordingPushSender()
    assert await _round(db_settings, env, sender) == 1
    assert sender.sent == []
    assert (
        await _sql(db_settings, "SELECT count(*) FROM push_deliveries WHERE state='no_device'") == 1
    )


async def test_turned_off_and_unregistered_tokens_stop(db_settings: Settings, env: Env) -> None:
    me = (await env.sign_up())["access_token"]
    uid = await _user_id(env, me)
    await _put(env, me)
    r = await env.client.delete(
        "/api/v1/users/me/push-token", headers={"Authorization": f"Bearer {me}"}
    )
    assert r.status_code == 204
    await _notify(db_settings, env, uid, "off")
    sender = RecordingPushSender()
    await _round(db_settings, env, sender)
    assert sender.sent == []

    await _put(env, me, OTHER)
    sender.unregistered.add(OTHER)
    await _notify(db_settings, env, uid, "gone")
    await _round(db_settings, env, sender)
    assert len(sender.sent) == 1
    assert (
        await _sql(db_settings, "SELECT count(*) FROM push_tokens WHERE disabled_at IS NOT NULL")
        == 2
    )


async def test_a_token_moves_with_the_phone(db_settings: Settings, env: Env) -> None:
    a = (await env.sign_up())["access_token"]
    b = (await env.sign_up(phone="+2348031111111", email="ada@example.com"))["access_token"]
    await _put(env, a)
    await _put(env, b)  # the same phone, now signed in as someone else
    assert await _sql(db_settings, "SELECT count(*) FROM push_tokens") == 1
    await _notify(db_settings, env, await _user_id(env, a), "for-a")
    sender = RecordingPushSender()
    await _round(db_settings, env, sender)
    assert sender.sent == []  # A's message never reaches B's phone


async def test_failure_retries_and_stale_messages_are_not_pushed(
    db_settings: Settings, env: Env
) -> None:
    me = (await env.sign_up())["access_token"]
    await _put(env, me)
    uid = await _user_id(env, me)
    await _notify(db_settings, env, uid, "retry")
    down = RecordingPushSender(fail=True)
    with pytest.raises(Exception):  # noqa: B017 - the transport error reaches the loop
        await _round(db_settings, env, down)
    assert await _sql(db_settings, "SELECT count(*) FROM push_deliveries") == 0
    up = RecordingPushSender()
    assert await _round(db_settings, env, up) == 1
    assert len(up.sent) == 1

    await _notify(db_settings, env, uid, "old")
    env.clock.advance(hours=2)
    later = RecordingPushSender()
    assert await _round(db_settings, env, later) == 0
    assert later.sent == []
    assert timedelta(hours=2)  # older than an hour: in-app only


async def test_token_is_checked(env: Env) -> None:
    me = (await env.sign_up())["access_token"]
    assert (await _put(env, me, token="not-a-token")).status_code == 422
    assert (await _put(env, me, platform="web")).status_code == 422
    r = await env.client.put(
        "/api/v1/users/me/push-token",
        json={"token": TOKEN, "platform": "ios", "user_id": str(uuid.uuid4())},
        headers={"Authorization": f"Bearer {me}"},
    )
    assert r.status_code == 422
    r = await env.client.put(
        "/api/v1/users/me/push-token", json={"token": TOKEN, "platform": "ios"}
    )
    assert r.status_code == 401
