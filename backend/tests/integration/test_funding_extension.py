# ruff: noqa: F811  -- pytest fixtures are imported by name and used as parameters
"""ADR-059 Decision 4: the taker may ask once for 5 more minutes to pay into escrow."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

import pytest

from app.core.config import Settings
from tests.integration.test_auth_api import _code, _sql, clean, migrated  # noqa: F401
from tests.integration.test_escrow_api import (  # noqa: F401
    Escrow,
    _open,
    _view,
    deal,
    esc,
    owner,
    partners,
    taker,
)
from tests.integration.test_offers_api import currencies  # noqa: F401
from tests.integration.test_payouts_api import Party

pytestmark = [pytest.mark.integration, pytest.mark.asyncio]


async def _extend(p: Party, match_id: str) -> Any:
    return await p.env.client.post(f"/api/v1/matches/{match_id}/settlement/extend", headers=p._h())


async def test_the_taker_can_ask_once_for_five_more_minutes(
    db_settings: Settings, esc: Escrow, owner: Party, taker: Party, deal: dict[str, Any]
) -> None:
    v = await _open(esc, deal, owner)
    assert v["funding_extended"] is False and v["can_extend"] is False  # owner's view
    assert (await _view(taker, deal["match_id"])).json()["can_extend"] is True
    before = v["funding_deadline"]
    r = await _extend(owner, deal["match_id"])
    assert r.status_code == 403  # the offer's owner is not the taker
    r = await _extend(taker, deal["match_id"])
    assert r.status_code == 200, r.text
    after = r.json()
    assert after["funding_extended"] is True and after["can_extend"] is False
    gained = datetime.fromisoformat(after["funding_deadline"]) - datetime.fromisoformat(before)
    assert gained == timedelta(minutes=5)
    r = await _extend(taker, deal["match_id"])
    assert r.status_code == 409 and _code(r) == "RES_409_ALREADY_EXTENDED"
    # Both sides hear the new time.
    sent = await _sql(
        db_settings,
        "SELECT count(*) FROM notifications WHERE dedupe_key LIKE :k",
        k="settlement:%:extended",
    )
    assert sent == 2
    # The database refuses to undo it.
    with pytest.raises(Exception, match="set once"):
        await _sql(db_settings, "UPDATE settlements SET funding_extended_at = NULL")


async def test_the_window_really_is_longer(
    db_settings: Settings, esc: Escrow, owner: Party, taker: Party, deal: dict[str, Any]
) -> None:
    await _open(esc, deal, owner)
    assert (await _extend(taker, deal["match_id"])).status_code == 200
    esc.env.clock.advance(minutes=7)  # past the first 5 minutes, inside the extra 5
    await esc.tick()
    assert await _sql(db_settings, "SELECT phase FROM settlements") == "AWAITING_FUNDING"
    esc.env.clock.advance(minutes=4)  # now past 10 minutes
    await esc.tick()
    assert await _sql(db_settings, "SELECT phase FROM settlements") == "CANCELLED"


async def test_no_extension_after_the_time_is_up(
    esc: Escrow, owner: Party, taker: Party, deal: dict[str, Any]
) -> None:
    await _open(esc, deal, owner)
    esc.env.clock.advance(minutes=6)
    await taker.relogin()
    r = await _extend(taker, deal["match_id"])
    assert r.status_code == 409 and _code(r) == "RES_409_INVALID_SETTLEMENT_STATE"
    v = (await _view(taker, deal["match_id"])).json()
    assert v["funding_extended"] is False


async def test_strangers_cannot_extend(
    esc: Escrow, owner: Party, taker: Party, deal: dict[str, Any]
) -> None:
    await _open(esc, deal, owner)
    r = await _extend(taker, "00000000-0000-4000-8000-000000000000")
    assert r.status_code == 404
