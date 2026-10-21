# ruff: noqa: F811  -- pytest fixtures are imported by name and used as parameters
"""ADR-057: disputes on deals (pause the escrow) and support cases (no deal). PostgreSQL."""

from __future__ import annotations

from typing import Any

import pytest

from app.core.config import Settings
from tests.integration.test_auth_api import _code, _sql, clean, migrated  # noqa: F401
from tests.integration.test_escrow_api import (  # noqa: F401
    Escrow,
    _open,
    _pay,
    _phase,
    _view,
    deal,
    esc,
    owner,
    partners,
    taker,
)
from tests.integration.test_matches_api import THIRD
from tests.integration.test_offers_api import currencies  # noqa: F401
from tests.integration.test_payouts_api import Party, _party

pytestmark = [pytest.mark.integration, pytest.mark.asyncio]


async def _open_case(p: Party, **body: Any) -> Any:
    return await p.env.client.post("/api/v1/disputes", json=body, headers=p._h())


async def _get(p: Party, path: str = "") -> Any:
    return await p.env.client.get(f"/api/v1/disputes{path}", headers=p._h())


async def _message(p: Party, dispute_id: str, text: str) -> Any:
    return await p.env.client.post(
        f"/api/v1/disputes/{dispute_id}/evidence", json={"message": text}, headers=p._h()
    )


async def _transaction(esc: Escrow, deal: dict[str, Any], owner: Party) -> str:
    v = await _open(esc, deal, owner)
    return str(v["transaction_id"])


async def test_dispute_pauses_the_escrow_and_tells_the_other_side(
    db_settings: Settings, esc: Escrow, owner: Party, taker: Party, deal: dict[str, Any]
) -> None:
    tx = await _transaction(esc, deal, owner)
    r = await _open_case(
        taker,
        transaction_id=tx,
        reason="funds_not_received",
        description="  I paid, nothing came.  ",
    )
    assert r.status_code == 201, r.text
    case = r.json()
    assert (case["kind"], case["status"], case["description"]) == (
        "dispute",
        "open",
        "I paid, nothing came.",
    )
    assert (await _view(owner, deal["match_id"])).json()["on_hold"] is True
    # Both pay in: the money is not released while the dispute is open.
    await _pay(owner, deal["match_id"])
    await _pay(taker, deal["match_id"])
    await esc.tick(2)
    assert await _phase(db_settings) == "AWAITING_FUNDING"
    assert (
        await _sql(db_settings, "SELECT count(*) FROM outbox_messages WHERE operation='RELEASE'")
        == 0
    )
    # The funding window does not time out either: staff decide.
    esc.env.clock.advance(minutes=10)
    await esc.tick()
    assert await _phase(db_settings) == "AWAITING_FUNDING"
    await owner.relogin()  # 10 minutes idle ended the sessions
    await taker.relogin()
    # The other side is told, and sees the case but not the opener's words or messages.
    note = await _sql(
        db_settings,
        "SELECT payload->>'event' FROM notifications WHERE type = 'dispute_update'",
    )
    assert note == "dispute.opened"
    await _message(taker, case["dispute_id"], "Bank reference 123.")
    seen = (await _get(owner, f"/{case['dispute_id']}")).json()
    assert seen["opened_by_you"] is False and seen["description"] is None
    assert seen["messages"] == []
    await _message(owner, case["dispute_id"], "I sent it on time.")
    mine = (await _get(taker, f"/{case['dispute_id']}")).json()
    assert [m["body"] for m in mine["messages"]] == ["Bank reference 123."]
    assert [m["author"] for m in mine["messages"]] == ["you"]
    assert [d["dispute_id"] for d in (await _get(owner)).json()] == [case["dispute_id"]]


async def test_one_open_dispute_per_deal_and_only_parties(
    esc: Escrow, owner: Party, taker: Party, deal: dict[str, Any]
) -> None:
    tx = await _transaction(esc, deal, owner)
    assert (
        await _open_case(owner, transaction_id=tx, reason="other", description="x")
    ).status_code == 201
    r = await _open_case(taker, transaction_id=tx, reason="wrong_amount", description="y")
    assert (r.status_code, _code(r)) == (409, "RES_409_DISPUTE_ALREADY_OPEN")
    stranger = await _party(esc.env, THIRD)
    r = await _open_case(stranger, transaction_id=tx, reason="other", description="z")
    assert (r.status_code, _code(r)) == (403, "AUTH_403_NOT_PARTY")
    case_id = (await _get(owner)).json()[0]["dispute_id"]
    assert (await _get(stranger, f"/{case_id}")).status_code == 404
    assert (await _message(stranger, case_id, "hi")).status_code == 404
    r = await _open_case(
        owner,
        transaction_id="00000000-0000-4000-8000-000000000000",
        reason="other",
        description="z",
    )
    assert r.status_code == 404


async def test_support_case_without_a_deal_pauses_nothing(
    db_settings: Settings, esc: Escrow, owner: Party, taker: Party, deal: dict[str, Any]
) -> None:
    await _open(esc, deal, owner)
    r = await _open_case(owner, reason="other", description="My ID check failed twice.")
    assert r.status_code == 201, r.text
    case = r.json()
    assert (case["kind"], case["transaction_id"]) == ("support", None)
    assert (await _view(owner, deal["match_id"])).json()["on_hold"] is False
    assert (await _get(taker)).json() == []  # nobody else sees a support case
    assert (await _get(taker, f"/{case['dispute_id']}")).status_code == 404
    r = await _message(owner, case["dispute_id"], "Here is more detail.")
    assert r.status_code == 201 and len(r.json()["messages"]) == 1


async def test_input_is_checked(owner: Party) -> None:
    for body in (
        {"reason": "other", "description": ""},
        {"reason": "other", "description": "   "},
        {"reason": "other", "description": "x" * 2001},
        {"reason": "angry", "description": "x"},
        {"reason": "other", "description": "x", "user_id": "me"},
        {"reason": "other", "description": "x", "status": "resolved"},
    ):
        r = await _open_case(owner, **body)
        assert r.status_code == 422, body
    case = (await _open_case(owner, reason="other", description="x")).json()
    assert (await _message(owner, case["dispute_id"], "")).status_code == 422


async def test_resolved_case_takes_no_messages(db_settings: Settings, owner: Party) -> None:
    case = (await _open_case(owner, reason="other", description="x")).json()
    await _sql(
        db_settings,
        "UPDATE disputes SET status = 'resolved', resolved_at = now() WHERE id = :i",
        i=case["dispute_id"],
    )
    r = await _message(owner, case["dispute_id"], "still there?")
    assert (r.status_code, _code(r)) == (409, "RES_409_DISPUTE_RESOLVED")


async def test_needs_a_session(esc: Escrow) -> None:
    r = await esc.env.client.post("/api/v1/disputes", json={"reason": "other", "description": "x"})
    assert r.status_code == 401


async def test_messages_are_append_only(db_settings: Settings) -> None:
    grants = await _sql(
        db_settings,
        "SELECT string_agg(privilege_type, ',' ORDER BY privilege_type) "
        "FROM information_schema.role_table_grants "
        "WHERE grantee = 'xspeeria_app' AND table_name = 'dispute_messages'",
    )
    assert grants == "INSERT,SELECT"
