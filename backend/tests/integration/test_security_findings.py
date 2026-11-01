# ruff: noqa: F811  -- pytest fixtures are imported by name and used as parameters
"""Regression tests for the verified security review findings (F-006, F-010, F-012, F-015).

Each test reproduces the problem first and checks the fix, using the real PostgreSQL database.
"""

from __future__ import annotations

from dataclasses import replace
from decimal import Decimal
from typing import Any

import pytest

from app.core.config import Settings
from tests.integration.test_admin_disputes import boss, staff  # noqa: F401
from tests.integration.test_admin_staff import H
from tests.integration.test_auth_api import _code, _sql, clean, migrated  # noqa: F401
from tests.integration.test_disputes_api import _open_case, _transaction
from tests.integration.test_escrow_api import (  # noqa: F401
    Escrow,
    _open,
    deal,
    esc,
    owner,
    partners,
    taker,
)
from tests.integration.test_matches_api import THIRD
from tests.integration.test_offers_api import currencies  # noqa: F401
from tests.integration.test_payouts_api import Party, _party
from tests.integration.test_tier_checks import (  # noqa: F401
    ADDRESS,
    PNG,
    FakeDidit,
    _post,
    _tier,
    _tier2,
    didit_env,
)

pytestmark = [pytest.mark.integration, pytest.mark.asyncio]


async def _extend(p: Party, match_id: str) -> Any:
    return await p.env.client.post(f"/api/v1/matches/{match_id}/settlement/extend", headers=p._h())


# --- F-010: the rate the taker was shown is the rate they take -------------------------------


async def test_an_owner_cannot_change_the_rate_under_a_taker(
    db_settings: Settings, esc: Escrow, owner: Party, taker: Party
) -> None:
    offer = (await owner.publish(source_amount="500.00", desired_rate="1320.50")).json()
    oid = offer["offer_id"]
    # Product rule: the rate is fixed once posted, so the owner's change is refused.
    edit = await owner.env.client.patch(
        f"/api/v1/offers/{oid}",
        json={"desired_rate": "1330.00"},
        headers=owner._h(),
    )
    assert edit.status_code == 422, edit.text
    assert _code(edit) == "VALIDATION_ERROR"
    # The taker takes the rate they were shown, and it is the rate agreed.
    fresh = await taker.accept(
        oid,
        "200.00",
        token=await taker.approve(),
        body={"accepted_amount": "200.00", "expected_rate": "1320.50"},
    )
    assert fresh.status_code == 201, fresh.text
    agreed = await _sql(db_settings, "SELECT agreed_rate FROM matches")
    assert Decimal(str(agreed)) == Decimal("1320.50")


# --- F-012: a disputed deal's payment window can't be extended -------------------------------


async def test_a_disputed_deal_cannot_have_its_time_extended(
    db_settings: Settings, esc: Escrow, owner: Party, taker: Party, deal: dict[str, Any]
) -> None:
    tx = await _transaction(esc, deal, owner)
    opened = await _open_case(
        taker, transaction_id=tx, reason="funds_not_received", description="I paid."
    )
    assert opened.status_code == 201, opened.text
    r = await _extend(taker, deal["match_id"])
    assert r.status_code == 409, r.text
    assert _code(r) == "RES_409_DISPUTE_OPEN"
    assert await _sql(db_settings, "SELECT funding_extended_at FROM settlements") is None


# --- F-006: the timeline shows only the two people on the deal ------------------------------


async def test_a_stranger_refused_request_is_not_shown_as_the_takers(
    db_settings: Settings,
    esc: Escrow,
    boss: Any,
    owner: Party,
    taker: Party,
    deal: dict[str, Any],
) -> None:
    await _open(esc, deal, owner)
    mid = deal["match_id"]
    stranger = await _party(esc.env, THIRD)
    refused = await _extend(stranger, mid)
    assert refused.status_code in (403, 404), refused.text
    # The refusal is recorded in the activity log (the row exists) ...
    recorded = await _sql(
        db_settings,
        "SELECT count(*) FROM customer_activity WHERE action = 'payment_time_extended' "
        "AND outcome = 'refused'",
    )
    assert recorded == 1
    # ... but the deal's timeline does not show it as anybody's step on this deal.
    events = (await boss.get(f"/api/v1/admin/deals/{mid}", headers=H)).json()["events"]
    assert not [e for e in events if e["kind"] == "customer:payment_time_extended"]
    # The taker's own extension still shows, attributed to the taker.
    ok = await _extend(taker, mid)
    assert ok.status_code == 200, ok.text
    events = (await boss.get(f"/api/v1/admin/deals/{mid}", headers=H)).json()["events"]
    mine = [e for e in events if e["kind"] == "customer:payment_time_extended"]
    assert [e["by"] for e in mine] == ["taker"]


# --- F-015: an address changed during the proof check is not approved ----------------------


class _RacingDidit(FakeDidit):
    """Fake Didit that runs `during` while the document is being checked."""

    def __init__(self, during: Any) -> None:
        super().__init__()
        self.during = during

    async def proof_of_address(self, **kw: Any) -> Any:
        self.calls.append(("poa", kw))
        await self.during()
        return self.poa_outcome


async def test_an_address_changed_during_the_proof_check_is_not_approved(
    db_settings: Settings, didit_env: tuple[Any, FakeDidit]
) -> None:
    env, _fake = didit_env
    user = await _tier2(env, db_settings)

    async def change_address() -> None:
        r = await _post(user, "address", {**ADDRESS, "line1": "1 Other Street"})
        assert r.status_code == 200, r.text

    app = env.client._transport.app
    app.state.auth = replace(app.state.auth, tier_checks=_RacingDidit(change_address))
    r = await _post(user, "proof-of-address", {"document": PNG, "content_type": "image/png"})
    assert r.status_code == 409, r.text
    assert _code(r) == "RES_409_ADDRESS_CHANGED"
    approved = await _sql(
        db_settings,
        "SELECT count(*) FROM tier_checks WHERE kind = 'proof_of_address' AND status = 'approved'",
    )
    assert approved == 0
    assert await _tier(user) == 2
