# ruff: noqa: F811  -- pytest fixtures are imported by name and used as parameters
"""ADR-103: "Need help?" for people who can't log in, with a two-way thread (owner 2026-11-09).

No log-in: the phone holds a private key; reading or replying needs the request id and that
key. The form answers the same whether or not an account has that phone. Staff list, read,
reply and close with the dispute permissions; every reply and close is audited.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from typing import Any

import pytest
import pytest_asyncio
from httpx import Response
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import Settings
from app.core.exceptions import AppError
from app.db.session import build_engine
from app.services.help import MAX_UNANSWERED, HelpService
from app.services.staff import RequestInfo, StaffPrincipal
from tests.integration.test_auth_api import Env, _code, _sql, clean, migrated  # noqa: F401
from tests.integration.test_offers_api import _user, currencies, env  # noqa: F401

pytestmark = [pytest.mark.integration, pytest.mark.asyncio]

INFO = RequestInfo(ip_address="127.0.0.1", user_agent="test")


#: A real staff account (messages and audit rows name it): made per test by ``boss_id``.
_BOSS: dict[str, uuid.UUID] = {}


def _staff(*permissions: str) -> StaffPrincipal:
    return StaffPrincipal(
        staff_id=_BOSS.get("id", uuid.uuid4()),
        session_id=uuid.uuid4(),
        email="x@xspeeria.test",
        role_id=uuid.uuid4(),
        role_name="custom",
        permissions=frozenset(permissions),
    )


@pytest_asyncio.fixture
async def boss_id(env: Env, db_settings: Settings) -> AsyncIterator[uuid.UUID]:
    """Requested last in a test, so it is made after the fixtures that clear the staff tables."""
    from tests.integration.test_admin_staff import BOSS, BOSS_PW, Admin
    from tests.integration.test_auth_api import Clock, _runtime

    clock = Clock()
    await Admin(db_settings, clock, _runtime(clock, None, 10_000)).service_call(
        "create_first_super_admin", BOSS, "The Boss", BOSS_PW
    )
    _BOSS["id"] = uuid.UUID(
        await _sql(db_settings, "SELECT id::text FROM staff_accounts WHERE email = :e", e=BOSS)
    )
    yield _BOSS["id"]
    _BOSS.clear()


@pytest_asyncio.fixture
async def db(db_settings: Settings) -> AsyncIterator[AsyncSession]:
    engine = build_engine(db_settings)
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as s:
            yield s
    finally:
        await engine.dispose()


async def _open(env: Env, **body: Any) -> Response:
    payload = {
        "phone": "+2348038383838",
        "email": "david@example.com",
        "message": "Face check fails",
    }
    return await env.client.post("/api/v1/help/requests", json={**payload, **body})


async def _read(env: Env, rid: str, key: str | None) -> Response:
    headers = {"X-Help-Key": key} if key is not None else {}
    return await env.client.get(f"/api/v1/help/requests/{rid}", headers=headers)


async def _say(env: Env, rid: str, key: str, text: str) -> Response:
    return await env.client.post(
        f"/api/v1/help/requests/{rid}/messages", json={"message": text}, headers={"X-Help-Key": key}
    )


async def test_the_form_answers_the_same_with_or_without_an_account(env: Env) -> None:
    await _user(env)  # +2348038383838 has an account
    known = await _open(env)
    unknown = await _open(env, phone="+2348039999999", email="nobody@example.com")
    assert known.status_code == unknown.status_code == 201
    assert set(known.json()) == set(unknown.json()) == {"request_id", "key"}


@pytest.mark.parametrize(
    "bad",
    [
        {"phone": "08038383838"},  # not international
        {"email": "not-an-email"},
        {"message": "   "},
        {"message": "x" * 2001},
        {"extra": "field"},
    ],
)
async def test_bad_forms_are_refused(env: Env, bad: dict[str, str]) -> None:
    r = await _open(env, **bad)
    assert r.status_code == 422, r.text


async def test_only_the_phone_with_the_key_reads_and_replies(
    env: Env, db_settings: Settings
) -> None:
    opened = (await _open(env)).json()
    rid, key = opened["request_id"], opened["key"]
    body = (await _read(env, rid, key)).json()
    assert body["status"] == "open"
    assert [(m["author"], m["body"]) for m in body["messages"]] == [("you", "Face check fails")]
    assert (await _say(env, rid, key, "It says the selfie didn't match")).status_code == 204
    # Wrong key, someone else's id, no key: nothing is shown, and the answers look the same.
    assert (await _read(env, rid, key[:-2] + "xx")).status_code == 404
    assert (await _read(env, str(uuid.uuid4()), key)).status_code == 404
    assert (await _read(env, rid, None)).status_code == 422
    assert (await _say(env, rid, "x" * 40, "hello")).status_code == 404
    # Only the key's SHA-256 is kept.
    stored = await _sql(db_settings, "SELECT key_hash FROM help_requests")
    assert stored != key and len(stored) == 64


async def test_too_many_messages_without_an_answer_must_wait(
    env: Env, db: AsyncSession, boss_id: uuid.UUID
) -> None:
    opened = (await _open(env)).json()
    rid, key = opened["request_id"], opened["key"]
    for i in range(MAX_UNANSWERED - 1):  # the first message counts too
        assert (await _say(env, rid, key, f"again {i}")).status_code == 204
    r = await _say(env, rid, key, "one more")
    assert r.status_code == 429 and _code(r) == "BUS_429_HELP_WAIT"
    # A staff answer lets the customer write again.
    env.clock.advance(minutes=5)
    await HelpService(db, env.clock).staff_reply(
        _staff("disputes.update"), INFO, uuid.UUID(rid), "We're looking"
    )
    assert (await _say(env, rid, key, "thanks")).status_code == 204


async def test_staff_see_the_match_reply_and_close(
    env: Env, db: AsyncSession, db_settings: Settings, boss_id: uuid.UUID
) -> None:
    await _user(env)
    opened = (await _open(env)).json()
    other = (await _open(env, email="someone@else.com")).json()
    rid, key = opened["request_id"], opened["key"]
    svc = HelpService(db, env.clock)
    support = _staff("disputes.read", "disputes.update")
    items = {i["request_id"]: i for i in await svc.list_requests(support, "open")}
    assert items[rid]["matched_user_id"] is not None and items[rid]["email_matches_account"]
    assert not items[other["request_id"]]["email_matches_account"]  # phone matches, email doesn't
    env.clock.advance(minutes=5)
    await svc.staff_reply(support, INFO, uuid.UUID(rid), "Please try again in good light.")
    thread = (await _read(env, rid, key)).json()["messages"]
    assert [m["author"] for m in thread] == ["you", "staff"]
    assert "staff_id" not in thread[1]  # the customer never sees who on staff wrote
    await svc.close(support, INFO, uuid.UUID(rid))
    await svc.close(support, INFO, uuid.UUID(rid))  # closing twice changes nothing
    assert (await _read(env, rid, key)).json()["status"] == "closed"
    r = await _say(env, rid, key, "still stuck")
    assert r.status_code == 409 and _code(r) == "BUS_409_HELP_CLOSED"
    audited = await _sql(
        db_settings,
        "SELECT string_agg(action, ',' ORDER BY at) FROM staff_audit_log "
        "WHERE target_type = 'help_request'",
    )
    assert audited == "help_replied,help_closed"


async def test_staff_need_the_dispute_permissions(env: Env, db: AsyncSession) -> None:
    rid = uuid.UUID((await _open(env)).json()["request_id"])
    svc = HelpService(db, env.clock)
    reader = _staff("disputes.read")
    assert await svc.detail(reader, rid)
    with pytest.raises(AppError) as e:
        await svc.staff_reply(reader, INFO, rid, "hi")
    assert e.value.code == "AUTH_403_FORBIDDEN"
    with pytest.raises(AppError):
        await svc.close(reader, INFO, rid)
    with pytest.raises(AppError):
        await svc.list_requests(_staff(), None)
