# ruff: noqa: F811  -- pytest fixtures are imported by name and used as parameters
"""ADR-059 Decision 5: a buy request in 2–5 currencies; only one of them can ever be paid."""

from __future__ import annotations

import uuid
from datetime import timedelta
from typing import Any

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.core.config import Settings
from app.db.session import build_engine
from app.services.matches import MatchService
from app.services.queue import QueueService
from tests.integration.test_auth_api import _code, _sql, clean, migrated  # noqa: F401
from tests.integration.test_escrow_api import (  # noqa: F401
    Escrow,
    _pay,
    esc,
    owner,
    partners,
    taker,
)
from tests.integration.test_matches_api import THIRD
from tests.integration.test_offers_api import currencies  # noqa: F401
from tests.integration.test_payouts_api import Party, _party

pytestmark = [pytest.mark.integration, pytest.mark.asyncio]

#: 1,320,500 naira: 1,000.00 USD at 1,320.50, or 754.57 GBP at 1,750.00.
NAIRA = "1320500.00"
CURRENCIES = [
    {"currency": "USD", "desired_rate": "1320.50"},
    {"currency": "GBP", "desired_rate": "1750.00"},
    {"currency": "EUR", "desired_rate": "1480.00"},
]


async def _group(p: Party, body: dict[str, Any] | None = None, key: uuid.UUID | None = None) -> Any:
    return await p.env.client.post(
        "/api/v1/offers/requests",
        json=body or {"source_amount": NAIRA, "currencies": CURRENCIES},
        headers=p._h(key or uuid.uuid4()),
    )


def _by_currency(body: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {o["target_currency"]: o for o in body["offers"]}


async def _visible(p: Party, currency: str) -> list[dict[str, Any]]:
    return list((await p.listings(f"NGN/{currency}")).json()["items"])


async def _sweep(esc: Escrow) -> None:
    engine = build_engine(esc.db_settings)
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as db:
            await MatchService(db, esc.env.clock).expire_due()
            await QueueService(db, esc.env.clock).sweep()
    finally:
        await engine.dispose()


# --- publishing ----------------------------------------------------------------------------


async def test_one_request_in_three_currencies(owner: Party, taker: Party) -> None:
    r = await _group(owner)
    assert r.status_code == 201, r.text
    offers = _by_currency(r.json())
    assert set(offers) == {"USD", "GBP", "EUR"}
    assert {o["source_amount"] for o in offers.values()} == {NAIRA}
    assert {o["group_id"] for o in offers.values()} == {r.json()["group_id"]}
    assert all(o["whole_only"] and o["source_currency"] == "NGN" for o in offers.values())
    for code in ("USD", "GBP"):
        [row] = await _visible(taker, code)
        assert row["whole_only"] is True and row["desired_rate"] == offers[code]["desired_rate"]


@pytest.mark.parametrize(
    ("body", "status_code"),
    [
        ({"source_amount": NAIRA, "currencies": CURRENCIES[:1]}, 422),
        ({"source_amount": NAIRA, "currencies": [CURRENCIES[0], CURRENCIES[0]]}, 422),
        (
            {
                "source_amount": NAIRA,
                "currencies": [*CURRENCIES, {"currency": "CAD", "desired_rate": "900"}],
            },
            422,
        ),
        (
            {
                "source_amount": NAIRA,
                "currencies": [CURRENCIES[0], {"currency": "GBP", "desired_rate": "9999"}],
            },
            422,
        ),
        ({"source_amount": "5000.00", "currencies": CURRENCIES}, 422),
        ({"source_amount": "1e6", "currencies": CURRENCIES}, 422),
        ({"source_amount": NAIRA, "currencies": CURRENCIES, "user_id": "x"}, 422),
        (
            {"source_amount": NAIRA, "currencies": [{"currency": "NGN", "desired_rate": "1"}] * 2},
            422,
        ),
        (
            {
                "source_amount": NAIRA,
                "currencies": [{"currency": "usd", "desired_rate": "1300"}] * 2,
            },
            422,
        ),
    ],
)
async def test_bad_requests_are_refused(
    db_settings: Settings, owner: Party, body: dict[str, Any], status_code: int
) -> None:
    r = await _group(owner, body)
    assert r.status_code == status_code, r.text
    assert await _sql(db_settings, "SELECT count(*) FROM offers") == 0
    assert await _sql(db_settings, "SELECT count(*) FROM offer_groups") == 0


async def test_six_currencies_are_too_many(owner: Party) -> None:
    six = [{"currency": c, "desired_rate": "1300"} for c in ("USD", "GBP", "EUR")] * 2
    assert (await _group(owner, {"source_amount": NAIRA, "currencies": six})).status_code == 422


async def test_same_key_replays(db_settings: Settings, owner: Party) -> None:
    key = uuid.uuid4()
    first = await _group(owner, key=key)
    again = await _group(owner, key=key)
    assert again.status_code == 201 and again.json() == first.json()
    assert await _sql(db_settings, "SELECT count(*) FROM offer_groups") == 1
    other = await _group(owner, {"source_amount": "2000000.00", "currencies": CURRENCIES}, key)
    assert other.status_code == 409


# --- taking one currency -------------------------------------------------------------------


async def test_whole_amount_only(owner: Party, taker: Party) -> None:
    usd = _by_currency((await _group(owner)).json())["USD"]
    r = await taker.take(usd["offer_id"], "660250.00")
    assert r.status_code == 422 and _code(r) == "VAL_422_WHOLE_AMOUNT_ONLY"


async def test_taking_one_hides_and_blocks_the_others(
    esc: Escrow, owner: Party, taker: Party
) -> None:
    offers = _by_currency((await _group(owner)).json())
    assert (await taker.take(offers["USD"]["offer_id"], NAIRA)).status_code == 201
    assert await _visible(taker, "GBP") == []
    [usd] = await _visible(taker, "USD")
    assert usd["waiting"] is True  # someone is paying for it
    third = await _party(esc.env, THIRD)
    r = await third.take(offers["GBP"]["offer_id"], NAIRA)
    assert r.status_code == 409 and _code(r) == "RES_409_OFFER_UNAVAILABLE"


async def test_two_people_cannot_take_two_currencies(
    db_settings: Settings, esc: Escrow, owner: Party, taker: Party
) -> None:
    offers = _by_currency((await _group(owner)).json())
    third = await _party(esc.env, THIRD)
    first = await taker.take(offers["USD"]["offer_id"], NAIRA)
    second = await third.take(offers["EUR"]["offer_id"], NAIRA)
    assert sorted([first.status_code, second.status_code]) == [201, 409]
    assert await _sql(db_settings, "SELECT count(*) FROM matches") == 1


async def test_an_unpaid_deal_brings_the_others_back(
    db_settings: Settings, esc: Escrow, owner: Party, taker: Party
) -> None:
    offers = _by_currency((await _group(owner)).json())
    assert (await taker.take(offers["USD"]["offer_id"], NAIRA)).status_code == 201
    await _sql(
        db_settings,
        "UPDATE matches SET preparation_deadline = :t",
        t=esc.env.clock() - timedelta(minutes=1),
    )
    await _sweep(esc)
    assert len(await _visible(taker, "GBP")) == 1
    assert await _sql(db_settings, "SELECT status FROM offer_groups") == "open"
    assert (await taker.take(offers["GBP"]["offer_id"], NAIRA)).status_code == 201


async def test_a_completed_deal_removes_the_others(
    db_settings: Settings, esc: Escrow, owner: Party, taker: Party
) -> None:
    offers = _by_currency((await _group(owner)).json())
    r = await taker.take(offers["USD"]["offer_id"], NAIRA)
    assert r.status_code == 201, r.text
    match_id = r.json()["match_id"]
    # The maker receives dollars; the taker receives naira.
    assert (await owner.choose(match_id, [(await owner.usd(), "1000.00")])).status_code == 200
    r = await taker.choose(match_id, [(await taker.ngn(), NAIRA)])
    assert r.status_code == 200, r.text
    await esc.tick()
    assert (await _pay(owner, match_id)).status_code == 200
    assert (await _pay(taker, match_id)).status_code == 200
    assert await _sql(db_settings, "SELECT phase FROM settlements") == "COMPLETED"
    assert await _sql(db_settings, "SELECT status FROM offer_groups") == "done"
    gbp = await _sql(
        db_settings, "SELECT status FROM offers WHERE id = :i", i=offers["GBP"]["offer_id"]
    )
    assert gbp == "withdrawn"
    assert await _visible(taker, "GBP") == [] and await _visible(taker, "USD") == []


# --- owner changes -------------------------------------------------------------------------


async def test_rate_can_change_but_not_the_amount(owner: Party) -> None:
    usd = _by_currency((await _group(owner)).json())["USD"]
    r = await owner.patch(usd["offer_id"], {"desired_rate": "1321"})
    assert r.status_code == 200
    r = await owner.patch(usd["offer_id"], {"source_amount": "1000000.00"})
    assert r.status_code == 422 and "several currencies" in r.json()["error"]["message"]


async def test_withdrawing_one_currency_keeps_the_others(owner: Party, taker: Party) -> None:
    offers = _by_currency((await _group(owner)).json())
    assert (await owner.delete(offers["EUR"]["offer_id"])).status_code == 200
    assert len(await _visible(taker, "USD")) == 1 and len(await _visible(taker, "GBP")) == 1


async def test_database_keeps_groups_for_naira_requests_only(
    db_settings: Settings, owner: Party
) -> None:
    group = (await _group(owner)).json()["group_id"]
    sell = (await owner.publish(source_amount="500.00", desired_rate="1320.50")).json()
    with pytest.raises(Exception, match="group_only_naira"):
        await _sql(
            db_settings,
            "UPDATE offers SET group_id = :g WHERE id = :i",
            g=group,
            i=sell["offer_id"],
        )
