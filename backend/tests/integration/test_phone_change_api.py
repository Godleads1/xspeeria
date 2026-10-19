# ruff: noqa: F811  -- pytest fixtures are imported by name and used as parameters
"""ADR-047: change my phone number — approval, code to the NEW number bound to me, then the
change. Against PostgreSQL."""

from __future__ import annotations

from typing import Any

import pytest

from tests.integration.test_auth_api import PHONE, Env, _code, clean, env, migrated  # noqa: F401
from tests.integration.test_pin_api import _approve

pytestmark = [pytest.mark.integration, pytest.mark.asyncio]

NEW_PHONE = "+447700900123"


async def _start(env: Env, token: str, phone: str, approval: str | None) -> Any:
    headers = {"Authorization": f"Bearer {token}"}
    if approval:
        headers["X-Step-Up-Token"] = approval
    return await env.client.post(
        "/api/v1/users/me/phone/start", json={"new_phone": phone}, headers=headers
    )


async def test_new_number_is_confirmed_by_its_own_code(env: Env) -> None:
    me = (await env.sign_up())["access_token"]
    r = await _start(env, me, NEW_PHONE, await _approve(env, me, "contact.change"))
    assert r.status_code == 202, r.text
    code = env.sms.last_code_for(NEW_PHONE)
    assert code is not None
    r = await env.post("/users/me/phone/confirm", {"new_phone": NEW_PHONE, "code": code}, token=me)
    assert r.status_code == 200 and r.json() == {"phone": NEW_PHONE}
    assert (await env.get("/users/me", token=me)).json()["phone"] == NEW_PHONE
    # Log in with the new number from now on (the old one no longer finds the account).
    assert (await env.login(identifier=NEW_PHONE, trusted=False)).status_code == 200


async def test_needs_approval_and_a_different_valid_number(env: Env) -> None:
    me = (await env.sign_up())["access_token"]
    assert (await _start(env, me, NEW_PHONE, None)).status_code == 403
    r = await _start(env, me, PHONE, await _approve(env, me, "contact.change"))
    assert r.status_code == 422 and "already your" in r.json()["error"]["message"]
    r = await _start(env, me, "0803", await _approve(env, me, "contact.change"))
    assert r.status_code == 422


async def test_wrong_code_or_someone_elses_code_changes_nothing(env: Env) -> None:
    me = (await env.sign_up())["access_token"]
    other = (await env.sign_up(phone="+2348031111111", email="ada@example.com"))["access_token"]
    await _start(env, me, NEW_PHONE, await _approve(env, me, "contact.change"))
    code = env.sms.last_code_for(NEW_PHONE)
    r = await env.post("/users/me/phone/confirm", {"new_phone": NEW_PHONE, "code": "000000"}, token=me)
    assert r.status_code == 401
    # The code is bound to the user who asked for it.
    r = await env.post("/users/me/phone/confirm", {"new_phone": NEW_PHONE, "code": code}, token=other)
    assert r.status_code == 401
    assert (await env.get("/users/me", token=me)).json()["phone"] == PHONE


async def test_number_of_another_account_is_refused_after_the_code(env: Env) -> None:
    taken = "+2348031111111"
    await env.sign_up(phone=taken, email="ada@example.com")
    me = (await env.sign_up())["access_token"]
    env.clock.advance(seconds=61)
    await _start(env, me, taken, await _approve(env, me, "contact.change"))
    code = env.sms.last_code_for(taken)
    r = await env.post("/users/me/phone/confirm", {"new_phone": taken, "code": code}, token=me)
    assert r.status_code == 409 and _code(r) == "AUTH_409_PHONE_TAKEN"
    assert (await env.get("/users/me", token=me)).json()["phone"] == PHONE
