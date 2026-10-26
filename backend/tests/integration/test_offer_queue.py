# ruff: noqa: F811  -- pytest fixtures are imported by name and used as parameters
"""ADR-059 Decision 4: waiting for an offer someone else is paying for; one extra 5 minutes."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.core.config import Settings
from app.db.session import build_engine
from app.services.matches import MatchService
from app.services.queue import QueueService
from tests.integration.test_auth_api import Env, _code, _sql, clean, migrated  # noqa: F401
from tests.integration.test_matches_api import (  # noqa: F401
    THIRD,
    Person,
    _person,
    offer,
    owner,
    taker,
)
from tests.integration.test_offers_api import currencies, env  # noqa: F401

pytestmark = [pytest.mark.integration, pytest.mark.asyncio]

FOURTH = ("+2348033333331", "fred@example.com")
FIFTH = ("+2348033333332", "gina@example.com")
SIXTH = ("+2348033333333", "hal@example.com")


async def _sweep(env: Env, db_settings: Settings) -> None:
    """What the background loop does: expire unpaid deals, then move the queue."""
    engine = build_engine(db_settings)
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as db:
            await MatchService(db, env.clock).expire_due()
            await QueueService(db, env.clock).sweep()
    finally:
        await engine.dispose()


async def _join(p: Person, offer_id: str) -> Any:
    return await p.env.client.post(f"/api/v1/offers/{offer_id}/queue", headers=p._h())


async def _leave(p: Person, offer_id: str) -> Any:
    return await p.env.client.delete(f"/api/v1/offers/{offer_id}/queue", headers=p._h())


async def _mine(p: Person) -> Any:
    return (await p.env.client.get("/api/v1/offers/queue/mine", headers=p._h())).json()


async def _row(p: Person, offer_id: str) -> dict[str, Any]:
    rows = (await p.listings()).json()["items"]
    return next(r for r in rows if r["offer_id"] == offer_id)


async def _unpaid_deal_runs_out(env: Env, db_settings: Settings, offer_id: str) -> None:
    """The taker's 30 minutes to choose payout accounts ran out (in the test clock's time)."""
    await _sql(
        db_settings,
        "UPDATE matches SET preparation_deadline = :t WHERE offer_id = :o",
        t=env.clock() - timedelta(minutes=1),
        o=offer_id,
    )


async def _taken(taker: Person, offer: dict[str, Any]) -> str:
    r = await taker.take(offer["offer_id"], "500.00")
    assert r.status_code == 201, r.text
    return str(offer["offer_id"])


# --- joining -------------------------------------------------------------------------------


async def test_waiting_offer_is_listed_and_can_be_queued(
    env: Env, taker: Person, offer: dict[str, Any]
) -> None:
    oid = await _taken(taker, offer)
    third = await _person(env, THIRD)
    row = await _row(third, oid)
    assert row["waiting"] is True and row["queue_length"] == 0 and row["in_queue"] is False
    r = await _join(third, oid)
    assert r.status_code == 200, r.text
    assert r.json() == {
        "offer_id": oid,
        "status": "waiting",
        "position": 1,
        "queue_length": 1,
        "turn_deadline": None,
    }
    row = await _row(third, oid)
    assert row["in_queue"] is True and row["queue_length"] == 1
    assert (await _mine(third))["position"] == 1
    # Joining again is harmless.
    assert (await _join(third, oid)).json()["queue_length"] == 1


async def test_cannot_queue_for_an_offer_you_can_take_now(env: Env, offer: dict[str, Any]) -> None:
    third = await _person(env, THIRD)
    r = await _join(third, offer["offer_id"])
    assert r.status_code == 409 and _code(r) == "RES_409_OFFER_AVAILABLE"


async def test_owner_and_the_taker_cannot_queue(
    owner: Person, taker: Person, offer: dict[str, Any]
) -> None:
    oid = await _taken(taker, offer)
    r = await _join(owner, oid)
    assert r.status_code == 403 and _code(r) == "AUTH_403_SELF_MATCH_FORBIDDEN"
    r = await _join(taker, oid)
    assert r.status_code == 409 and _code(r) == "RES_409_ALREADY_IN_DEAL"


async def test_at_most_three_people_wait(
    db_settings: Settings, env: Env, taker: Person, offer: dict[str, Any]
) -> None:
    oid = await _taken(taker, offer)
    people = [await _person(env, who) for who in (THIRD, FOURTH, FIFTH, SIXTH)]
    for p in people[:3]:
        assert (await _join(p, oid)).status_code == 200
    r = await _join(people[3], oid)
    assert r.status_code == 409 and _code(r) == "RES_409_QUEUE_FULL"
    assert await _sql(db_settings, "SELECT count(*) FROM offer_queue_entries") == 3


async def test_one_queue_per_person(
    env: Env, owner: Person, taker: Person, offer: dict[str, Any]
) -> None:
    oid = await _taken(taker, offer)
    second = (await owner.publish(source_amount="100.00", desired_rate="1320")).json()
    assert (await taker.take(second["offer_id"], "100.00")).status_code == 201
    third = await _person(env, THIRD)
    assert (await _join(third, oid)).status_code == 200
    r = await _join(third, second["offer_id"])
    assert r.status_code == 409 and _code(r) == "RES_409_ALREADY_IN_QUEUE"
    assert (await _leave(third, oid)).status_code == 204
    assert (await _join(third, second["offer_id"])).status_code == 200


async def test_queue_needs_sign_in_and_a_real_offer(env: Env, taker: Person) -> None:
    r = await env.client.post(
        "/api/v1/offers/00000000-0000-4000-8000-000000000000/queue", headers={}
    )
    assert r.status_code == 401
    r = await _join(taker, "00000000-0000-4000-8000-000000000000")
    assert r.status_code == 404
    assert (await _join(taker, "not-a-uuid")).status_code == 422


# --- turns ---------------------------------------------------------------------------------


async def test_when_the_deal_runs_out_the_first_person_gets_five_minutes(
    db_settings: Settings, env: Env, owner: Person, taker: Person, offer: dict[str, Any]
) -> None:
    oid = await _taken(taker, offer)
    third, fourth = await _person(env, THIRD), await _person(env, FOURTH)
    await _join(third, oid)
    env.clock.advance(seconds=1)  # joined later: second in line
    await _join(fourth, oid)
    await _unpaid_deal_runs_out(env, db_settings, oid)
    await _sweep(env, db_settings)

    mine = await _mine(third)
    assert mine["status"] == "notified"
    assert mine["turn_deadline"] == (env.clock() + timedelta(minutes=5)).isoformat()
    assert (
        await _sql(
            db_settings,
            "SELECT count(*) FROM notifications WHERE payload->>'event' = 'queue.your_turn'",
        )
        == 1
    )
    assert (await _row(third, oid))["your_turn"] is True
    assert (await _row(fourth, oid))["waiting"] is True  # held for someone else
    # Only the person whose turn it is may take it.
    r = await fourth.take(oid, "500.00")
    assert r.status_code == 409 and _code(r) == "RES_409_OFFER_RESERVED"
    r = await taker.take(oid, "500.00")
    assert r.status_code == 409 and _code(r) == "RES_409_OFFER_RESERVED"
    assert (await third.take(oid, "500.00")).status_code == 201
    assert (
        await _sql(db_settings, "SELECT status FROM offer_queue_entries WHERE status = 'taken'")
        == "taken"
    )
    assert (await _mine(fourth))["position"] == 1  # still waiting, now first


async def test_a_missed_turn_passes_to_the_next_person(
    db_settings: Settings, env: Env, taker: Person, offer: dict[str, Any]
) -> None:
    oid = await _taken(taker, offer)
    third, fourth = await _person(env, THIRD), await _person(env, FOURTH)
    await _join(third, oid)
    env.clock.advance(seconds=1)  # joined later: second in line
    await _join(fourth, oid)
    await _unpaid_deal_runs_out(env, db_settings, oid)
    await _sweep(env, db_settings)
    await _sql(
        db_settings,
        "UPDATE offer_queue_entries SET turn_deadline = :t WHERE status = 'notified'",
        t=env.clock() - timedelta(seconds=1),
    )
    await _sweep(env, db_settings)
    assert await _mine(third) is None
    assert (await _mine(fourth))["status"] == "notified"


async def test_when_nobody_is_left_the_offer_is_simply_available(
    db_settings: Settings, env: Env, taker: Person, offer: dict[str, Any]
) -> None:
    oid = await _taken(taker, offer)
    third, fourth = await _person(env, THIRD), await _person(env, FOURTH)
    await _join(third, oid)
    await _unpaid_deal_runs_out(env, db_settings, oid)
    await _sweep(env, db_settings)
    # Leaving during your turn passes it on at once — here, to nobody.
    assert (await _leave(third, oid)).status_code == 204
    assert (await _leave(third, oid)).status_code == 204  # repeat-safe
    row = await _row(fourth, oid)
    assert row["waiting"] is False and row["remaining_amount"] == "500.00"
    assert (await fourth.take(oid, "500.00")).status_code == 201


async def test_withdrawing_ends_the_queue(
    db_settings: Settings, env: Env, owner: Person, taker: Person, offer: dict[str, Any]
) -> None:
    oid = await _taken(taker, offer)
    third = await _person(env, THIRD)
    await _join(third, oid)
    await _unpaid_deal_runs_out(env, db_settings, oid)
    await _sweep(env, db_settings)
    assert (await owner.delete(oid)).status_code == 200
    assert await _mine(third) is None


async def test_one_turn_per_offer_is_enforced_by_the_database(
    db_settings: Settings, env: Env, taker: Person, offer: dict[str, Any]
) -> None:
    oid = await _taken(taker, offer)
    third, fourth = await _person(env, THIRD), await _person(env, FOURTH)
    await _join(third, oid)
    env.clock.advance(seconds=1)  # joined later: second in line
    await _join(fourth, oid)
    with pytest.raises(Exception, match="uq_offer_queue_entries_one_turn_per_offer"):
        await _sql(
            db_settings,
            "UPDATE offer_queue_entries SET status = 'notified', notified_at = now(), "
            "turn_deadline = now()",
        )
