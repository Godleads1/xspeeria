# ruff: noqa: F811  -- pytest fixtures (`env`) are imported by name and used as parameters
"""Milestone 4.1D: taking an offer creates a Match (ADR-031), over HTTP, against PostgreSQL.

A Match is a record of who agreed to take how much at what rate — information, not money.
Normal, failure, abuse and concurrency cases from contract §3.5 and Standing Standards §7.
"""

from __future__ import annotations

import asyncio
import uuid
from typing import Any

import pytest
import pytest_asyncio
from httpx import Response

from app.core.config import Settings
from tests.integration.test_auth_api import Env, _code, _sql, clean, migrated  # noqa: F401
from tests.integration.test_offers_api import User, currencies, env  # noqa: F401

pytestmark = [pytest.mark.integration, pytest.mark.asyncio]

OWNER = ("+2348038383838", "david@example.com")
TAKER = ("+2348031111111", "ada@example.com")
THIRD = ("+2348032222222", "eve@example.com")


class Person(User):
    def __init__(self, env: Env, token: str, phone: str) -> None:
        super().__init__(env, token)
        self.phone = phone

    async def approve(self, action: str = "trade.accept") -> str:
        """One step-up approval with fingerprint/Face ID on this person's trusted phone."""
        return await self.env.approve(self.token, action, self.phone)

    async def accept(
        self,
        offer_id: str,
        amount: str | None = "100.00",
        *,
        key: uuid.UUID | None = None,
        token: str | None = None,
        body: dict[str, Any] | None = None,
    ) -> Response:
        headers = self._h(key or uuid.uuid4())
        if token:
            headers["X-Step-Up-Token"] = token
        payload = (
            body if body is not None else ({} if amount is None else {"accepted_amount": amount})
        )
        return await self.env.client.post(
            f"/api/v1/offers/{offer_id}/accept", json=payload, headers=headers
        )

    async def take(self, offer_id: str, amount: str = "100.00", **kw: Any) -> Response:
        return await self.accept(offer_id, amount, token=await self.approve(), **kw)

    async def match(self, match_id: str) -> Response:
        return await self.env.client.get(f"/api/v1/matches/{match_id}", headers=self._h())

    async def my_matches(self) -> Response:
        return await self.env.client.get("/api/v1/matches/mine", headers=self._h())


async def _person(env: Env, who: tuple[str, str]) -> Person:
    body = await env.sign_up(phone=who[0], email=who[1])
    return Person(env, body["access_token"], who[0])


@pytest_asyncio.fixture
async def owner(env: Env) -> Person:
    return await _person(env, OWNER)


@pytest_asyncio.fixture
async def taker(env: Env, owner: Person) -> Person:
    return await _person(env, TAKER)


@pytest_asyncio.fixture
async def offer(owner: Person) -> dict[str, Any]:
    r = await owner.publish(source_amount="500.00", desired_rate="1320.50")
    assert r.status_code == 201, r.text
    return dict(r.json())


async def _offer_row(db: Settings, offer_id: str) -> tuple[Any, ...]:
    status = await _sql(db, "SELECT status FROM offers WHERE id = :i", i=offer_id)
    matched = await _sql(db, "SELECT matched_amount_minor FROM offers WHERE id = :i", i=offer_id)
    return status, matched


# --- normal --------------------------------------------------------------------------------


async def test_taking_part_of_an_offer(
    db_settings: Settings, owner: Person, taker: Person, offer: dict[str, Any]
) -> None:
    r = await taker.take(offer["offer_id"], "200.00")
    assert r.status_code == 201, r.text
    m = r.json()
    assert m["allocated_amount"] == "200.00" and m["currency"] == "USD"
    assert m["counter_currency"] == "NGN" and m["agreed_rate"] == "1320.50"
    assert m["your_role"] == "taker" and int(m["server_order_key"]) > 0
    assert "user_id" not in str(m) and "counterparty" not in str(m)
    assert await _offer_row(db_settings, offer["offer_id"]) == ("partially_matched", 20_000)
    # The offer stays listed for what is left.
    listed = (await taker.listings()).json()["items"]
    assert [o["remaining_amount"] for o in listed] == ["300.00"]
    # The owner sees the same Match from the other side.
    seen = (await owner.match(m["match_id"])).json()
    assert seen["your_role"] == "offer_owner" and seen["allocated_amount"] == "200.00"


async def test_selling_to_a_buy_request(owner: Person, taker: Person) -> None:
    """ADR-056: a buy request is an offer paying naira. "Buy 1,000 USD at 1,330" is saved as
    NGN 1,330,000.00; a seller takes part of it in naira and the deal shows the USD side."""
    r = await owner.publish(
        source_currency="NGN",
        target_currency="USD",
        source_amount="1330000.00",
        desired_rate="1330.00",
    )
    assert r.status_code == 201, r.text
    request = r.json()
    listed = (await taker.listings("NGN/USD")).json()["items"]
    assert [o["offer_id"] for o in listed] == [request["offer_id"]]
    r = await taker.take(request["offer_id"], "532000.00")  # 400.00 USD at 1,330
    assert r.status_code == 201, r.text
    m = r.json()
    assert (m["currency"], m["allocated_amount"]) == ("NGN", "532000.00")
    assert (m["counter_currency"], m["you_receive_currency"], m["you_receive_amount"]) == (
        "USD",
        "NGN",
        "532000.00",
    )
    seen = (await owner.match(m["match_id"])).json()
    assert (seen["you_receive_currency"], seen["you_receive_amount"]) == ("USD", "400.00")
    left = (await taker.listings("NGN/USD")).json()["items"]
    assert [o["remaining_amount"] for o in left] == ["798000.00"]


async def test_taking_everything_closes_the_offer(
    db_settings: Settings, taker: Person, offer: dict[str, Any]
) -> None:
    assert (await taker.take(offer["offer_id"], "500")).status_code == 201
    assert await _offer_row(db_settings, offer["offer_id"]) == ("fully_matched", 50_000)
    # ADR-059 Decision 4: still listed, as waiting for payment (people may queue), not takeable.
    [row] = (await taker.listings()).json()["items"]
    assert row["waiting"] is True and row["waiting_amount"] == "500.00"
    assert row["remaining_amount"] == "0.00"
    r = await taker.take(offer["offer_id"], "10.00")
    assert r.status_code == 409 and _code(r) == "RES_409_OFFER_UNAVAILABLE"


async def test_the_rest_may_be_below_the_minimum(
    db_settings: Settings, taker: Person, offer: dict[str, Any]
) -> None:
    assert (await taker.take(offer["offer_id"], "495.00")).status_code == 201
    r = await taker.take(offer["offer_id"], "4.00")
    assert r.status_code == 422 and _code(r) == "VAL_422_AMOUNT_BELOW_MINIMUM"
    assert (await taker.take(offer["offer_id"], "5.00")).status_code == 201  # exactly the rest
    assert await _offer_row(db_settings, offer["offer_id"]) == ("fully_matched", 50_000)


async def test_rate_is_locked_on_the_match(
    db_settings: Settings, taker: Person, offer: dict[str, Any]
) -> None:
    m = (await taker.take(offer["offer_id"])).json()
    await _sql(
        db_settings, "UPDATE offers SET desired_rate = 1300 WHERE id = :i", i=offer["offer_id"]
    )
    assert (await taker.match(m["match_id"])).json()["agreed_rate"] == "1320.50"


async def test_matches_mine_for_both_sides(
    owner: Person, taker: Person, offer: dict[str, Any]
) -> None:
    await taker.take(offer["offer_id"])
    assert [m["your_role"] for m in (await taker.my_matches()).json()] == ["taker"]
    assert [m["your_role"] for m in (await owner.my_matches()).json()] == ["offer_owner"]


# --- failure -------------------------------------------------------------------------------


async def test_more_than_is_left_is_refused_never_clamped(
    db_settings: Settings, taker: Person, offer: dict[str, Any]
) -> None:
    r = await taker.take(offer["offer_id"], "500.01")
    assert r.status_code == 409 and _code(r) == "RES_409_INSUFFICIENT_REMAINING"
    assert await _offer_row(db_settings, offer["offer_id"]) == ("open", 0)
    assert await _sql(db_settings, "SELECT count(*) FROM matches") == 0


@pytest.mark.parametrize(
    ("amount", "code"),
    [
        ("100.001", "VALIDATION_ERROR"),
        ("0", "VALIDATION_ERROR"),
        ("-5", "VALIDATION_ERROR"),
        ("1e2", "VALIDATION_ERROR"),
        ("9.99", "VAL_422_AMOUNT_BELOW_MINIMUM"),
    ],
)
async def test_bad_amounts(taker: Person, offer: dict[str, Any], amount: str, code: str) -> None:
    r = await taker.take(offer["offer_id"], amount)
    assert r.status_code == 422 and _code(r) == code


async def test_missing_amount_is_never_take_everything(
    db_settings: Settings, taker: Person, offer: dict[str, Any]
) -> None:
    r = await taker.accept(offer["offer_id"], None, token=await taker.approve())
    assert r.status_code == 422 and _code(r) == "VAL_422_MISSING_FIELD"
    assert await _sql(db_settings, "SELECT count(*) FROM matches") == 0


async def test_number_amount_and_extra_fields_refused(taker: Person, offer: dict[str, Any]) -> None:
    token = await taker.approve()
    for body in ({"accepted_amount": 100}, {"accepted_amount": "100", "agreed_rate": "1"}):
        r = await taker.accept(offer["offer_id"], body=body, token=token)
        assert r.status_code == 422


async def test_withdrawn_or_over_ceiling_offer_is_unavailable(
    db_settings: Settings, owner: Person, taker: Person, offer: dict[str, Any]
) -> None:
    await _sql(
        db_settings, "UPDATE offers SET desired_rate = 1400 WHERE id = :i", i=offer["offer_id"]
    )
    r = await taker.take(offer["offer_id"])
    assert r.status_code == 409 and _code(r) == "RES_409_OFFER_UNAVAILABLE"
    await _sql(
        db_settings, "UPDATE offers SET desired_rate = 1320 WHERE id = :i", i=offer["offer_id"]
    )
    await owner.delete(offer["offer_id"])
    r = await taker.take(offer["offer_id"])
    assert r.status_code == 409 and _code(r) == "RES_409_OFFER_UNAVAILABLE"


async def test_unknown_offer_is_404(taker: Person) -> None:
    r = await taker.take(str(uuid.uuid4()))
    assert r.status_code == 404


async def test_match_lookup(env: Env, owner: Person, taker: Person, offer: dict[str, Any]) -> None:
    m = (await taker.take(offer["offer_id"])).json()
    third = await _person(env, THIRD)
    r = await third.match(m["match_id"])
    assert r.status_code == 403 and _code(r) == "AUTH_403_FORBIDDEN"
    r = await taker.match(str(uuid.uuid4()))
    assert r.status_code == 404 and _code(r) == "RES_404_MATCH_NOT_FOUND"
    assert (await third.my_matches()).json() == []


# --- abuse ---------------------------------------------------------------------------------


async def test_owner_cannot_take_own_offer(owner: Person, offer: dict[str, Any]) -> None:
    r = await owner.take(offer["offer_id"])
    assert r.status_code == 403 and _code(r) == "AUTH_403_SELF_MATCH_FORBIDDEN"


async def test_taking_needs_a_fresh_authenticator_approval(
    db_settings: Settings, taker: Person, offer: dict[str, Any]
) -> None:
    r = await taker.accept(offer["offer_id"])
    assert r.status_code == 403 and _code(r) == "AUTH_403_FORBIDDEN"
    wrong = await taker.approve("pin.change")
    r = await taker.accept(offer["offer_id"], token=wrong)
    assert r.status_code == 403
    token = await taker.approve()
    assert (await taker.accept(offer["offer_id"], token=token)).status_code == 201
    r = await taker.accept(offer["offer_id"], token=token)  # new key, spent approval
    assert r.status_code == 403
    assert await _sql(db_settings, "SELECT count(*) FROM matches") == 1


async def test_another_users_approval_does_not_work(
    env: Env, owner: Person, taker: Person, offer: dict[str, Any]
) -> None:
    third = await _person(env, THIRD)
    token = await third.approve()
    r = await taker.accept(offer["offer_id"], token=token)
    assert r.status_code == 403


# --- idempotency ---------------------------------------------------------------------------


async def test_retry_with_same_key_replays_without_a_new_approval(
    db_settings: Settings, taker: Person, offer: dict[str, Any]
) -> None:
    key = uuid.uuid4()
    first = await taker.take(offer["offer_id"], "500.00", key=key)
    assert first.status_code == 201
    # The offer is now full; a retry still gets the original answer, not "insufficient".
    again = await taker.accept(offer["offer_id"], "500", key=key)
    assert again.status_code == 201 and again.json() == first.json()
    assert await _sql(db_settings, "SELECT count(*) FROM matches") == 1


async def test_same_key_different_amount_is_refused(
    db_settings: Settings, taker: Person, offer: dict[str, Any]
) -> None:
    key = uuid.uuid4()
    assert (await taker.take(offer["offer_id"], "100.00", key=key)).status_code == 201
    r = await taker.take(offer["offer_id"], "200.00", key=key)
    assert r.status_code == 409 and _code(r) == "SYS_409_IDEMPOTENCY_KEY_REUSED"
    assert await _offer_row(db_settings, offer["offer_id"]) == ("partially_matched", 10_000)


# --- concurrency ---------------------------------------------------------------------------


async def test_racing_takers_never_exceed_the_offer(
    db_settings: Settings, env: Env, taker: Person, offer: dict[str, Any]
) -> None:
    third = await _person(env, THIRD)
    t1, t2 = await taker.approve(), await third.approve()
    a, b = await asyncio.gather(
        taker.accept(offer["offer_id"], "300.00", token=t1),
        third.accept(offer["offer_id"], "300.00", token=t2),
    )
    assert sorted([a.status_code, b.status_code]) == [201, 409]
    loser = a if a.status_code == 409 else b
    assert _code(loser) == "RES_409_INSUFFICIENT_REMAINING"
    assert await _offer_row(db_settings, offer["offer_id"]) == ("partially_matched", 30_000)


async def test_same_key_twice_at_once_makes_one_match(
    db_settings: Settings, taker: Person, offer: dict[str, Any]
) -> None:
    key, token = uuid.uuid4(), await taker.approve()
    a, b = await asyncio.gather(
        taker.accept(offer["offer_id"], "100.00", key=key, token=token),
        taker.accept(offer["offer_id"], "100.00", key=key, token=token),
    )
    assert a.status_code == b.status_code == 201
    assert a.json() == b.json()
    assert await _sql(db_settings, "SELECT count(*) FROM matches") == 1
    assert await _offer_row(db_settings, offer["offer_id"]) == ("partially_matched", 10_000)


async def test_order_keys_follow_acceptance_order(taker: Person, offer: dict[str, Any]) -> None:
    keys = [
        int((await taker.take(offer["offer_id"], "100")).json()["server_order_key"])
        for _ in range(3)
    ]
    assert keys == sorted(keys) and len(set(keys)) == 3


# --- database guarantees -------------------------------------------------------------------


async def test_app_role_can_only_read_and_add_matches(db_settings: Settings) -> None:
    grants = await _sql(
        db_settings,
        "SELECT string_agg(privilege_type, ',' ORDER BY privilege_type) "
        "FROM information_schema.role_table_grants "
        "WHERE grantee = 'xspeeria_app' AND table_name = 'matches'",
    )
    assert grants == "INSERT,SELECT"


async def test_server_order_key_cannot_be_supplied(
    db_settings: Settings, taker: Person, offer: dict[str, Any]
) -> None:
    m = (await taker.take(offer["offer_id"])).json()
    with pytest.raises(Exception, match="(?i)generated always|cannot insert"):
        await _sql(
            db_settings,
            "INSERT INTO matches (id, offer_id, counterparty_user_id, allocated_amount_minor, "
            "currency, scale, currency_def_version, server_order_key, agreed_rate, accepted_at) "
            "SELECT gen_random_uuid(), offer_id, counterparty_user_id, 1, currency, scale, "
            "currency_def_version, 999999, agreed_rate, accepted_at FROM matches WHERE id = :i",
            i=m["match_id"],
        )


async def test_a_match_needs_a_positive_amount(
    db_settings: Settings, taker: Person, offer: dict[str, Any]
) -> None:
    m = (await taker.take(offer["offer_id"])).json()
    with pytest.raises(Exception, match="allocated_amount_positive"):
        await _sql(
            db_settings,
            "INSERT INTO matches (id, offer_id, counterparty_user_id, allocated_amount_minor, "
            "currency, scale, currency_def_version, agreed_rate, accepted_at) "
            "SELECT gen_random_uuid(), offer_id, counterparty_user_id, 0, currency, scale, "
            "currency_def_version, agreed_rate, accepted_at FROM matches WHERE id = :i",
            i=m["match_id"],
        )
