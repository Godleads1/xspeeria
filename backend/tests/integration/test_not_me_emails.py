# ruff: noqa: F811, E501  -- pytest fixtures are imported by name and used as parameters
"""Security notice emails with a "this wasn't me" link (ADR-084; owner 2026-11-02). PostgreSQL.

Every log-in, account change, payout account change and deal step emails the customer, with a
one-time link. Opening the link changes nothing; pressing its button freezes the account at
once (sessions and trusted phones end, deals not yet released are held, a high fraud alert is
raised, a confirmation is emailed). A Super Admin switching the account back on lifts the holds.
"""

from __future__ import annotations

import hashlib
import re
from typing import Any

import pytest
from httpx import AsyncClient

from app.core.config import Settings
from app.providers.email import RecordingEmailSender
from app.services.security_notices import MAX_ATTEMPTS
from tests.integration.test_admin_disputes import boss, staff  # noqa: F401
from tests.integration.test_admin_staff import Admin, H
from tests.integration.test_auth_api import EMAIL, PHONE, Env, _sql, clean, migrated  # noqa: F401
from tests.integration.test_escrow_api import (  # noqa: F401
    Escrow,
    _open,
    _pay,
    _phase,
    deal,
    esc,
    owner,
    partners,
    taker,
)
from tests.integration.test_matches_api import OWNER
from tests.integration.test_offers_api import currencies, env  # noqa: F401
from tests.integration.test_payouts_api import Party

pytestmark = [pytest.mark.integration, pytest.mark.asyncio]

_LINK = re.compile(r"^https?://[^/]+/api/v1/security/not-me/([A-Za-z0-9_-]{43})$")


def _path(link: str) -> str:
    m = _LINK.match(link)
    assert m, link
    return "/api/v1/security/not-me/" + m.group(1)


async def _signed_up(env: Env) -> str:
    tokens = await env.sign_up()
    return str(tokens["access_token"])


async def _last_link(env: Env, email: str = EMAIL) -> str:
    await env.send_notices()
    links = env.email.links_for(email)
    assert links, env.email.sent
    return links[-1]


async def test_every_log_in_is_emailed_with_a_one_time_link(
    db_settings: Settings, env: Env
) -> None:
    await _signed_up(env)
    await env.send_notices()
    assert env.email.alerts_for(EMAIL) == []  # signing up is not a log-in
    r = await env.login()
    assert r.status_code == 200, r.text
    link = await _last_link(env)
    assert env.email.alerts_for(EMAIL) == ["signed_in"]
    token = _path(link).rsplit("/", 1)[1]
    # Only the hash is stored; the database can't rebuild the link.
    stored = await _sql(db_settings, "SELECT token_hash FROM security_notices")
    assert stored == hashlib.sha256(token.encode()).hexdigest()
    assert (
        await _sql(
            db_settings, "SELECT count(*) FROM security_notices WHERE token_hash = :t", t=token
        )
        == 0
    )
    # Sent once.
    assert await env.send_notices() == 0
    assert env.email.alerts_for(EMAIL) == ["signed_in"]


async def test_account_changes_are_emailed_and_refused_attempts_are_not(env: Env) -> None:
    access = await _signed_up(env)
    await env.approve(access, "beneficiary.add")  # turns fingerprint log-in on
    r = await env.client.post(
        "/api/v1/users/me/pin",
        json={"current_pin": "000000", "new_pin": "736195"},
        headers={"Authorization": f"Bearer {access}"},
    )
    assert r.status_code >= 400  # a wrong current PIN changes nothing
    await env.send_notices()
    assert env.email.alerts_for(EMAIL) == ["fingerprint_turned_on"]


async def test_opening_the_link_changes_nothing(db_settings: Settings, env: Env) -> None:
    await _signed_up(env)
    access = (await env.login()).json()["access_token"]
    path = _path(await _last_link(env))
    r = await env.client.get(path)
    assert r.status_code == 200
    assert "Freeze my account" in r.text and "New log-in to your Xspeeria account" in r.text
    assert r.headers["referrer-policy"] == "no-referrer"
    assert r.headers["cache-control"] == "no-store"
    assert "default-src 'none'" in r.headers["content-security-policy"]
    assert "frame-ancestors 'none'" in r.headers["content-security-policy"]
    # No name, phone number or email on the page.
    assert EMAIL not in r.text and PHONE[-4:] not in r.text
    assert await _sql(db_settings, "SELECT status FROM users") == "active"
    assert (await env.get("/users/me", access)).status_code == 200


async def test_pressing_the_button_freezes_the_account_at_once(
    db_settings: Settings, env: Env
) -> None:
    await _signed_up(env)
    access = (await env.login()).json()["access_token"]
    path = _path(await _last_link(env))
    r = await env.client.post(path)
    assert r.status_code == 200 and "Your account is frozen" in r.text, r.text
    assert await _sql(db_settings, "SELECT status FROM users") == "suspended"
    # Every session and trusted phone ended: the app is logged out and can't log in again.
    assert (await env.get("/users/me", access)).status_code == 401
    assert (
        await _sql(db_settings, "SELECT count(*) FROM auth_sessions WHERE revoked_at IS NULL") == 0
    )
    assert (
        await _sql(db_settings, "SELECT count(*) FROM trusted_devices WHERE revoked_at IS NULL")
        == 0
    )
    assert (await env.login()).status_code != 200
    # A high fraud alert for staff.
    rule, severity, status = (
        await _sql(db_settings, "SELECT rule FROM fraud_alerts"),
        await _sql(db_settings, "SELECT severity FROM fraud_alerts"),
        await _sql(db_settings, "SELECT status FROM fraud_alerts"),
    )
    assert (rule, severity, status) == ("customer_reported_not_me", "high", "open")
    assert await _sql(db_settings, "SELECT details->>'kind' FROM fraud_alerts") == "signed_in"
    assert (
        await _sql(
            db_settings, "SELECT count(*) FROM customer_activity WHERE action = 'reported_not_me'"
        )
        == 1
    )
    # The confirmation email, with no link.
    await env.send_notices()
    assert env.email.alerts_for(EMAIL)[-1] == "account_frozen"
    assert env.email.sent[-1].link is None
    # Pressing again (or a scanner replaying it) changes nothing more.
    r = await env.client.post(path)
    assert r.status_code == 200 and "Your account is frozen" in r.text
    assert await _sql(db_settings, "SELECT count(*) FROM fraud_alerts") == 1


async def test_a_wrong_or_expired_link_does_nothing(db_settings: Settings, env: Env) -> None:
    await _signed_up(env)
    await env.login()
    path = _path(await _last_link(env))
    for bad in ("/api/v1/security/not-me/" + "A" * 43, "/api/v1/security/not-me/short"):
        for method in ("GET", "POST"):
            r = await env.client.request(method, bad)
            assert r.status_code == 200 and "This link doesn't work" in r.text
    env.clock.advance(days=7, seconds=1)
    r = await env.client.post(path)
    assert "This link doesn't work" in r.text
    assert await _sql(db_settings, "SELECT status FROM users") == "active"
    assert await _sql(db_settings, "SELECT count(*) FROM fraud_alerts") == 0


class _Down(RecordingEmailSender):
    async def send_alert(
        self, email: str, kind: str, device: str | None, report_url: str | None = None
    ) -> None:
        raise RuntimeError("email service down")


async def test_a_failed_email_is_tried_again_then_given_up(db_settings: Settings, env: Env) -> None:
    await _signed_up(env)
    await env.login()
    working = env.runtime.email
    env.runtime.email = _Down()
    try:
        for _ in range(MAX_ATTEMPTS):
            assert await env.send_notices() == 0
            env.clock.advance(hours=1)
    finally:
        env.runtime.email = working
    assert await _sql(db_settings, "SELECT attempts FROM security_notices") == MAX_ATTEMPTS
    assert (
        await _sql(
            db_settings, "SELECT count(*) FROM security_notices WHERE gave_up_at IS NOT NULL"
        )
        == 1
    )
    # A given-up notice has no working link left.
    assert await _sql(db_settings, "SELECT token_hash FROM security_notices") is None
    assert await env.send_notices() == 0


async def test_payout_account_and_deal_steps_are_emailed(
    esc: Escrow, owner: Party, taker: Party, deal: dict[str, Any]
) -> None:
    await esc.env.send_notices()
    kinds = esc.env.email.alerts_for(OWNER[1])
    for kind in ("offer_posted", "payout_account_added", "payout_accounts_chosen"):
        assert kind in kinds, kinds


async def _act(boss: AsyncClient, user_id: str, action: str) -> Any:
    return await boss.post(
        f"/api/v1/admin/users/{user_id}/{action}",
        json={"reason": "Checked with the customer by phone"},
        headers=H,
    )


async def test_a_freeze_holds_the_deal_until_staff_switch_the_account_back_on(
    db_settings: Settings,
    esc: Escrow,
    owner: Party,
    taker: Party,
    deal: dict[str, Any],
    staff: Admin,
    boss: AsyncClient,
) -> None:
    await _open(esc, deal, owner)
    assert (await _pay(taker, deal["match_id"])).status_code == 200
    path = _path(await _last_link(esc.env, OWNER[1]))
    r = await esc.env.client.post(path)
    assert "Your account is frozen" in r.text
    assert await _sql(db_settings, "SELECT details->>'deals_held' FROM fraud_alerts") == "1"
    # The owner pays in (the bank accepts money whatever happens in the app) ...
    owner_leg = await _sql(
        db_settings,
        "SELECT leg_id FROM settlement_legs l JOIN users u ON u.id = l.funder_user_id "
        "WHERE u.phone = :p",
        p=owner.phone,
    )
    total = await _sql(
        db_settings,
        "SELECT amount_minor + fee_minor FROM settlement_legs WHERE leg_id = :l",
        l=owner_leg,
    )
    esc.bank.simulate_pay_in(owner_leg, total)
    await esc.tick(2)
    # ... but nothing is paid out while the account is frozen.
    assert await _phase(db_settings) == "AWAITING_FUNDING"
    assert (
        await _sql(
            db_settings,
            "SELECT count(*) FROM settlement_holds WHERE type = 'RISK' AND closed_at IS NULL",
        )
        == 1
    )
    uid = str(await _sql(db_settings, "SELECT id FROM users WHERE phone = :p", p=owner.phone))
    r = await _act(boss, uid, "reactivate")
    assert r.status_code == 200, r.text
    assert (
        await _sql(db_settings, "SELECT count(*) FROM settlement_holds WHERE closed_at IS NULL")
        == 0
    )
    detail = await _sql(
        db_settings,
        "SELECT detail->>'deals_released' FROM staff_audit_log WHERE action = 'customer_reactivated'",
    )
    assert detail == "1"
    await esc.tick(2)
    assert await _phase(db_settings) == "COMPLETED"


async def test_a_frozen_deal_left_unpaid_is_cancelled_not_paid_out(
    db_settings: Settings, esc: Escrow, owner: Party, taker: Party, deal: dict[str, Any]
) -> None:
    await _open(esc, deal, owner)
    assert (await _pay(taker, deal["match_id"])).status_code == 200
    r = await esc.env.client.post(_path(await _last_link(esc.env, OWNER[1])))
    assert "Your account is frozen" in r.text
    esc.env.clock.advance(minutes=6)  # past the 5-minute funding window
    await esc.tick(3)
    # The taker's money goes back where it came from; no payout to anyone.
    assert await _phase(db_settings) in ("UNWINDING", "CLOSED_UNWOUND")
    assert (
        await _sql(
            db_settings,
            "SELECT count(*) FROM settlement_events WHERE event_type = 'ReleaseAuthorized'",
        )
        == 0
    )


async def test_the_email_never_carries_words_chosen_by_whoever_logged_in(
    db_settings: Settings, env: Env
) -> None:
    """The device line uses our own fixed names only; a made-up user agent can't put a phone
    number or 'call support' into the customer's email."""
    await _signed_up(env)
    env.client.headers["User-Agent"] = "Call Xspeeria support on +234 800 000 0000"
    try:
        assert (await env.login()).status_code == 200
    finally:
        env.client.headers["User-Agent"] = "Expo/1.0"
    await env.send_notices()
    assert (
        await _sql(db_settings, "SELECT device FROM security_notices WHERE kind = 'signed_in'")
        == "Another app or browser"
    )
