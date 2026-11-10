# ruff: noqa: F811  -- pytest fixtures are imported by name and used as parameters
"""ADR-110: every day, each finished deal's money in matches its money out (owner 2026-11-10).

Real deals through the pretend bank (signed partner messages), then the check. A difference
becomes a reconciliation exception for staff and a P1 alert; running again opens nothing new.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from typing import Any

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import Settings
from app.db.session import build_engine
from app.services.ops_alerts import OpsAlertService
from app.services.reconciliation import ReconciliationService
from tests.integration.test_auth_api import _sql, clean, migrated  # noqa: F401
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
from tests.integration.test_offers_api import currencies  # noqa: F401
from tests.integration.test_payouts_api import Party

pytestmark = [pytest.mark.integration, pytest.mark.asyncio]


@pytest_asyncio.fixture
async def db(db_settings: Settings) -> AsyncIterator[AsyncSession]:
    engine = build_engine(db_settings)
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as s:
            yield s
    finally:
        await engine.dispose()


async def _exceptions(db_settings: Settings) -> list[str]:
    text = await _sql(
        db_settings,
        "SELECT string_agg(type || ' ' || detail, ' | ' ORDER BY detail) "
        "FROM reconciliation_exceptions",
    )
    return [] if text is None else str(text).split(" | ")


async def _completed(esc: Escrow, owner: Party, taker: Party, deal: dict[str, Any]) -> None:
    await _open(esc, deal, owner)
    assert (await _pay(owner, deal["match_id"])).status_code == 200
    assert (await _pay(taker, deal["match_id"])).status_code == 200


async def test_a_completed_deal_reconciles(
    db_settings: Settings,
    db: AsyncSession,
    esc: Escrow,
    owner: Party,
    taker: Party,
    deal: dict[str, Any],
) -> None:
    await _completed(esc, owner, taker, deal)
    assert await _phase(db_settings) == "COMPLETED"
    assert await ReconciliationService(db, esc.env.clock).run() == (1, 0)
    assert await _exceptions(db_settings) == []


async def test_an_extra_payout_is_found_once_and_alerts_staff(
    db_settings: Settings,
    db: AsyncSession,
    esc: Escrow,
    owner: Party,
    taker: Party,
    deal: dict[str, Any],
) -> None:
    await _completed(esc, owner, taker, deal)
    # A second payout confirmation on the dollar escrow: more money out than came in.
    await _sql(
        db_settings,
        "INSERT INTO settlement_events "
        "(id, settlement_id, leg_id, event_type, payload, created_at) "
        "SELECT :id, settlement_id, leg_id, 'PayoutConfirmed', "
        "jsonb_build_object('amount_minor', 500, 'currency', currency), now() "
        "FROM settlement_legs WHERE currency = 'USD'",
        id=str(uuid.uuid4()),
    )
    svc = ReconciliationService(db, esc.env.clock)
    assert await svc.run() == (1, 1)
    assert await _exceptions(db_settings) == [
        "AMOUNT_MISMATCH Daily check: paid out: expected 20000, recorded 20500 (minor units)"
    ]
    row = await _sql(
        db_settings,
        "SELECT expected_amount_minor || '/' || observed_amount_minor || ' ' || currency "
        "|| ' ' || status FROM reconciliation_exceptions",
    )
    assert row == "20000/20500 USD OPEN"
    # Running again (the next day) opens nothing new while it is still open.
    assert await svc.run() == (1, 0)
    # Super Admins get a P1 alert.
    raised = await OpsAlertService(db, esc.env.clock).scan()
    assert ("books_mismatch", "P1") in {(a.rule, a.severity) for a in raised}
    assert all(a.rule != "books_mismatch" for a in await OpsAlertService(db, esc.env.clock).scan())
    # Once staff resolve it, a deal that is still wrong is opened again.
    await _sql(
        db_settings,
        "UPDATE reconciliation_exceptions SET status = 'RESOLVED', resolution = 'Checked'",
    )
    assert await svc.run() == (1, 1)


async def test_a_one_sided_payment_is_returned_in_full(
    db_settings: Settings, db: AsyncSession, esc: Escrow, owner: Party, deal: dict[str, Any]
) -> None:
    await _open(esc, deal, owner)
    assert (await _pay(owner, deal["match_id"])).status_code == 200
    esc.env.clock.advance(minutes=5, seconds=1)
    await esc.tick(3)
    assert await _phase(db_settings) == "CLOSED_UNWOUND"
    assert await ReconciliationService(db, esc.env.clock).run() == (1, 0)


async def test_money_kept_after_a_cancelled_deal_is_found(
    db_settings: Settings, db: AsyncSession, esc: Escrow, owner: Party, deal: dict[str, Any]
) -> None:
    await _open(esc, deal, owner)
    esc.env.clock.advance(minutes=5, seconds=1)
    await esc.tick()
    assert await _phase(db_settings) == "CANCELLED"
    svc = ReconciliationService(db, esc.env.clock)
    assert await svc.run() == (1, 0)  # nobody paid: nothing in, nothing out
    # A recorded payment that was never returned.
    await _sql(
        db_settings,
        "INSERT INTO settlement_events "
        "(id, settlement_id, leg_id, event_type, payload, created_at) "
        "SELECT :id, settlement_id, leg_id, 'EscrowFunded', "
        "jsonb_build_object('amount_minor', amount_minor + fee_minor, 'currency', currency), now() "
        "FROM settlement_legs WHERE currency = 'NGN'",
        id=str(uuid.uuid4()),
    )
    assert await svc.run() == (1, 2)
    found = await _exceptions(db_settings)
    assert any(f.startswith("AMOUNT_MISMATCH Daily check: returned: expected") for f in found)
    assert any("STATE_MISMATCH Daily check: deal ended, money received" in f for f in found)


async def test_the_daily_run_looks_at_recent_deals_only(
    db_settings: Settings,
    db: AsyncSession,
    esc: Escrow,
    owner: Party,
    taker: Party,
    deal: dict[str, Any],
) -> None:
    await _completed(esc, owner, taker, deal)
    assert await ReconciliationService(db, esc.env.clock).daily() == (1, 0)
    esc.env.clock.advance(days=3)
    assert await ReconciliationService(db, esc.env.clock).daily() == (0, 0)
    assert await ReconciliationService(db, esc.env.clock).run() == (1, 0)  # full run
