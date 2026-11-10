# ruff: noqa: F811  -- pytest fixtures are imported by name and used as parameters
"""Milestone 4.1F: escrow steps with the pretend partner bank (ADR-037). SIMULATION ONLY.

Each side pays amount + 1% into a partner escrow in its own country; the bank pays out to the
other side's chosen accounts. Money facts come only from signed partner messages. Normal,
failure, abuse, timing and database cases, against PostgreSQL.
"""

from __future__ import annotations

import dataclasses
import json
import uuid
from collections.abc import AsyncIterator
from typing import Any

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.core.config import Settings
from app.core.mfa import SecretBox
from app.db.session import build_engine
from app.main import create_app
from app.providers.bank_check import DevNameCheck
from app.providers.pretend_bank import PretendBank, sign
from app.providers.sms import RecordingSmsSender
from app.services.auth import AuthRuntime
from app.services.settlement import SettlementService
from tests.integration.test_auth_api import (  # noqa: F401
    Clock,
    Env,
    _code,
    _runtime,
    _sql,
    clean,
    migrated,
)
from tests.integration.test_matches_api import OWNER, TAKER, THIRD
from tests.integration.test_offers_api import currencies  # noqa: F401
from tests.integration.test_payouts_api import BOX_KEY, Party, _party

pytestmark = [pytest.mark.integration, pytest.mark.asyncio]


@dataclasses.dataclass
class Escrow:
    env: Env
    runtime: AuthRuntime
    db_settings: Settings

    @property
    def bank(self) -> PretendBank:
        assert self.runtime.pretend_bank is not None
        return self.runtime.pretend_bank

    async def tick(self, times: int = 1) -> None:
        engine = build_engine(self.db_settings)
        try:
            maker = async_sessionmaker(engine, expire_on_commit=False)
            for _ in range(times):
                async with maker() as db:
                    await SettlementService(
                        db, self.runtime.clock, self.runtime.pretend_bank
                    ).tick()
        finally:
            await engine.dispose()

    async def post(
        self, code: str, body: dict[str, Any], *, secret: bytes | None = None, ts: int | None = None
    ) -> Any:
        stamp = ts if ts is not None else int(self.env.clock().timestamp())
        raw = json.dumps({**body, "sent_at": body.get("sent_at", stamp)}).encode()
        key = secret if secret is not None else self.bank.secret_for(code)
        assert key is not None
        return await self.env.client.post(
            f"/api/v1/webhooks/partners/{code}",
            content=raw,
            headers={
                "X-Xspeeria-Signature": sign(key, raw),
                "X-Xspeeria-Timestamp": str(stamp),
                "Content-Type": "application/json",
            },
        )


async def _make(db_settings: Settings, *, bank: bool = True) -> AsyncIterator[Escrow]:
    clock = Clock()
    runtime = dataclasses.replace(
        _runtime(clock, RecordingSmsSender(), 10_000),
        beneficiary_box=SecretBox(BOX_KEY, name="BENEFICIARY_ENCRYPTION_KEY"),
        name_check=DevNameCheck(),
        pretend_bank=PretendBank(clock) if bank else None,
    )
    settings = Settings(  # type: ignore[call-arg]
        _env_file=None,
        database_url=db_settings.database_url,
        app_env="local",
        kyc_dev_bypass=True,
        pretend_bank=bank,
    )
    app = create_app(settings, auth_runtime=runtime)
    from httpx import ASGITransport, AsyncClient

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield Escrow(Env(client, clock, runtime.sms), runtime, db_settings)  # type: ignore[arg-type]


@pytest_asyncio.fixture
async def partners(db_settings: Settings, clean: None) -> None:
    from app.cli.pretend_bank import ensure_pretend_partners

    engine = build_engine(db_settings)
    try:
        async with engine.begin() as conn:
            # NG, GB, US, CA (ADR-100); DE, FR (euro) and CN (ADR-105)
            # ADR-107: eleven African countries (Zimbabwe in US dollars).
            assert len(await ensure_pretend_partners(conn)) == 18
            assert await ensure_pretend_partners(conn) == []  # insert-only, repeat-safe
    finally:
        await engine.dispose()


@pytest_asyncio.fixture
async def esc(db_settings: Settings, partners: None) -> AsyncIterator[Escrow]:
    async for e in _make(db_settings):
        yield e


@pytest_asyncio.fixture
async def owner(esc: Escrow) -> Party:
    return await _party(esc.env, OWNER)


@pytest_asyncio.fixture
async def taker(esc: Escrow, owner: Party) -> Party:
    return await _party(esc.env, TAKER)


async def _ready(owner: Party, taker: Party) -> dict[str, Any]:
    """Owner sells 500 USD at 1,320.50; taker takes 200 → owner receives NGN 264,100.00."""
    offer = (await owner.publish(source_amount="500.00", desired_rate="1320.50")).json()
    r = await taker.take(offer["offer_id"], "200.00")
    assert r.status_code == 201, r.text
    deal = {"offer_id": offer["offer_id"], **r.json()}
    ngn, usd = await owner.ngn(), await taker.usd()
    assert (await owner.choose(deal["match_id"], [(ngn, "264100.00")])).status_code == 200
    r = await taker.choose(deal["match_id"], [(usd, "200.00")])
    assert r.status_code == 200 and r.json()["preparation_state"] == "funding_ready", r.text
    return deal


@pytest_asyncio.fixture
async def deal(owner: Party, taker: Party) -> dict[str, Any]:
    return await _ready(owner, taker)


async def _view(p: Party, match_id: str) -> Any:
    return await p.env.client.get(f"/api/v1/matches/{match_id}/settlement", headers=p._h())


async def _pay(p: Party, match_id: str) -> Any:
    return await p.env.client.post(
        f"/api/v1/dev/matches/{match_id}/simulate-transfer", headers=p._h()
    )


async def _phase(db_settings: Settings) -> str:
    return str(await _sql(db_settings, "SELECT phase FROM settlements"))


async def _events(db_settings: Settings) -> list[str]:
    raw = await _sql(
        db_settings,
        "SELECT string_agg(event_type, ',' ORDER BY created_at, event_type) FROM settlement_events",
    )
    return str(raw or "").split(",")


async def _open(esc: Escrow, deal: dict[str, Any], owner: Party) -> dict[str, Any]:
    await esc.tick()
    v: dict[str, Any] = (await _view(owner, deal["match_id"])).json()
    assert v["phase"] == "AWAITING_FUNDING", v
    return v


async def _offer(db_settings: Settings) -> tuple[str, int]:
    return (
        str(await _sql(db_settings, "SELECT status FROM offers")),
        int(await _sql(db_settings, "SELECT matched_amount_minor FROM offers")),
    )


# --- normal path ---------------------------------------------------------------------------


async def test_ready_deal_opens_two_escrows_with_fees(
    db_settings: Settings, esc: Escrow, owner: Party, taker: Party, deal: dict[str, Any]
) -> None:
    assert await _phase(db_settings) == "INITIALIZING"
    v = await _open(esc, deal, owner)
    # Owner pays the 200.00 USD they sell, plus 1%; receives NGN 264,100.00.
    assert v["you_pay"] | {"pay_in": None, "leg_id": None} == {
        "leg_id": None,
        "currency": "USD",
        "amount": "200.00",
        "fee": "2.00",
        "total": "202.00",
        "state": "ESCROW_PROVISIONED",
        "pay_in": None,
    }
    assert v["you_receive"]["currency"] == "NGN" and v["you_receive"]["amount"] == "264100.00"
    pay_in = v["you_pay"]["pay_in"]
    assert pay_in["bank_name"] == "Pretend Bank USA" and pay_in["reference"].startswith("XSP-")
    assert v["simulated"] is True and v["funding_deadline"] is not None
    t = (await _view(taker, deal["match_id"])).json()
    assert (t["you_pay"]["currency"], t["you_pay"]["total"]) == ("NGN", "266741.00")
    # Neither side sees the other's identity or accounts.
    assert OWNER[0] not in json.dumps(t) and "beneficiar" not in json.dumps(t)


async def test_both_pay_then_bank_pays_out_at_once(
    db_settings: Settings, esc: Escrow, owner: Party, taker: Party, deal: dict[str, Any]
) -> None:
    await _open(esc, deal, owner)
    r = await _pay(owner, deal["match_id"])
    assert r.status_code == 200 and r.json()["you_pay"]["state"] == "FUNDED", r.text
    assert r.json()["you_pay"]["pay_in"] is None
    r = await _pay(taker, deal["match_id"])
    assert r.status_code == 200, r.text
    # DEC-044: paid out as soon as both sides have paid in, even to brand-new accounts.
    assert await _phase(db_settings) == "COMPLETED"
    v = (await _view(owner, deal["match_id"])).json()
    assert v["you_receive"]["state"] == "PAID_OUT" and v["you_pay"]["state"] == "PAID_OUT"
    events = await _events(db_settings)
    for name in (
        "SettlementCreated",
        "EscrowProvisioned",
        "EscrowFunded",
        "ReleaseAuthorized",
        "ReleaseSent",
        "PayoutConfirmed",
        "SettlementCompleted",
    ):
        assert name in events, events
    assert events.count("PayoutConfirmed") == 2
    assert await _offer(db_settings) == ("partially_matched", 20000)  # the deal stands
    assert await _sql(db_settings, "SELECT count(*) FROM settlement_holds") == 0


async def test_release_is_decided_once(
    db_settings: Settings, esc: Escrow, owner: Party, taker: Party, deal: dict[str, Any]
) -> None:
    await _open(esc, deal, owner)
    await _pay(owner, deal["match_id"])
    await _pay(taker, deal["match_id"])
    await esc.tick(3)
    assert (
        await _sql(db_settings, "SELECT count(*) FROM outbox_messages WHERE operation='RELEASE'")
        == 2
    )
    assert (
        await _sql(
            db_settings,
            "SELECT count(*) FROM settlement_events WHERE event_type='ReleaseAuthorized'",
        )
        == 1
    )


# --- the 5-minute funding window -------------------------------------------------------------


async def test_nobody_pays_deal_is_cancelled_and_amount_returns(
    db_settings: Settings, esc: Escrow, owner: Party, deal: dict[str, Any]
) -> None:
    await _open(esc, deal, owner)
    esc.env.clock.advance(minutes=4, seconds=59)
    await esc.tick()
    assert await _phase(db_settings) == "AWAITING_FUNDING"
    esc.env.clock.advance(seconds=2)
    await esc.tick()
    assert await _phase(db_settings) == "CANCELLED"
    assert await _sql(db_settings, "SELECT closure_reason FROM settlements") == "TIMEOUT"
    assert await _offer(db_settings) == ("open", 0)
    await owner.relogin()
    assert (await _pay(owner, deal["match_id"])).status_code == 409


async def test_one_side_pays_is_refunded_in_full_including_fee(
    db_settings: Settings, esc: Escrow, owner: Party, deal: dict[str, Any]
) -> None:
    await _open(esc, deal, owner)
    assert (await _pay(owner, deal["match_id"])).status_code == 200
    esc.env.clock.advance(minutes=5, seconds=1)
    await esc.tick(3)
    assert await _phase(db_settings) == "CLOSED_UNWOUND"
    await owner.relogin()
    v = (await _view(owner, deal["match_id"])).json()
    assert v["you_pay"]["state"] == "RETURNED" and v["closure_reason"] == "TIMEOUT"
    returned = await _sql(
        db_settings,
        "SELECT payload->>'amount_minor' FROM settlement_events WHERE event_type='EscrowReturned'",
    )
    assert returned == "20200"  # 200.00 + the 2.00 fee (product owner, 2026-10-19)
    assert await _offer(db_settings) == ("open", 0)


async def test_late_money_after_cancel_is_kept_for_a_person(
    db_settings: Settings, esc: Escrow, owner: Party, deal: dict[str, Any]
) -> None:
    await _open(esc, deal, owner)
    leg = str(await _sql(db_settings, "SELECT leg_id FROM settlement_legs WHERE currency='USD'"))
    esc.env.clock.advance(minutes=6)
    await esc.tick()
    assert await _phase(db_settings) == "CANCELLED"
    esc.bank.simulate_pay_in(uuid.UUID(leg), 20200)
    await esc.tick()
    assert await _phase(db_settings) == "CANCELLED"
    assert await _sql(
        db_settings, "SELECT state FROM settlement_legs WHERE leg_id = :l", l=leg
    ) == ("ESCROW_PROVISIONED")
    assert await _sql(db_settings, "SELECT type FROM reconciliation_exceptions") == "STATE_MISMATCH"
    assert await _sql(db_settings, "SELECT verdict FROM webhook_receipts") == "CONTRADICTORY"
    # ADR-099: the person who paid is told, once, and only them; nothing moves on its own.
    funder = await _sql(
        db_settings, "SELECT funder_user_id::text FROM settlement_legs WHERE leg_id = :l", l=leg
    )
    late = await _sql(
        db_settings,
        "SELECT count(*) FROM notifications WHERE payload->>'event' = 'settlement.late_money'",
    )
    to = await _sql(
        db_settings,
        "SELECT user_id::text FROM notifications WHERE payload->>'event' = 'settlement.late_money'",
    )
    assert (late, to) == (1, funder)
    returned = await _sql(
        db_settings, "SELECT count(*) FROM settlement_events WHERE event_type='EscrowReturned'"
    )
    assert returned == 0  # never sent back on its own


# --- partner messages: abuse --------------------------------------------------------------------


async def _leg(db_settings: Settings, currency: str) -> tuple[str, str]:
    return (
        str(
            await _sql(
                db_settings,
                "SELECT settlement_id FROM settlement_legs WHERE currency=:c",
                c=currency,
            )
        ),
        str(
            await _sql(
                db_settings, "SELECT leg_id FROM settlement_legs WHERE currency=:c", c=currency
            )
        ),
    )


def _funded(sid: str, lid: str, amount: int = 20200, code: str = "pretend-us") -> dict[str, Any]:
    return {
        "provider_event_id": f"evt_{uuid.uuid4().hex[:12]}",
        "partner_code": code,
        "settlement_id": sid,
        "leg_id": lid,
        "status": "verified",
        "amount_minor": amount,
        "currency": "USD",
    }


async def test_forged_signature_is_kept_but_changes_nothing(
    db_settings: Settings, esc: Escrow, owner: Party, deal: dict[str, Any]
) -> None:
    await _open(esc, deal, owner)
    sid, lid = await _leg(db_settings, "USD")
    r = await esc.post("pretend-us", _funded(sid, lid), secret=b"x" * 32)
    assert r.status_code == 401 and r.json()["verdict"] == "SIGNATURE_INVALID"
    assert await _sql(db_settings, "SELECT state FROM settlement_legs WHERE leg_id=:l", l=lid) == (
        "ESCROW_PROVISIONED"
    )
    assert await _sql(db_settings, "SELECT verdict FROM webhook_receipts") == "SIGNATURE_INVALID"


async def test_old_message_is_replay_suspected(
    db_settings: Settings, esc: Escrow, owner: Party, deal: dict[str, Any]
) -> None:
    await _open(esc, deal, owner)
    sid, lid = await _leg(db_settings, "USD")
    old = int(esc.env.clock().timestamp()) - 301
    r = await esc.post("pretend-us", _funded(sid, lid), ts=old)
    assert r.status_code == 401 and r.json()["verdict"] == "REPLAY_SUSPECTED"
    body = _funded(sid, lid) | {"sent_at": old}  # body time must match the header too
    r = await esc.post("pretend-us", body)
    assert r.status_code == 422 and r.json()["verdict"] == "SCHEMA_INVALID"


@pytest.mark.parametrize(
    "change",
    [
        {"extra": "field"},
        {"amount_minor": "20200"},
        {"amount_minor": 20200.0},
        {"status": "FUNDED"},
        {"leg_id": "not-a-uuid"},
        {"partner_code": "pretend-ng"},
    ],
)
async def test_malformed_message_is_refused(
    db_settings: Settings, esc: Escrow, owner: Party, deal: dict[str, Any], change: dict[str, Any]
) -> None:
    await _open(esc, deal, owner)
    sid, lid = await _leg(db_settings, "USD")
    r = await esc.post("pretend-us", _funded(sid, lid) | change)
    assert r.status_code == 422 and r.json()["verdict"] == "SCHEMA_INVALID"
    assert (
        await _sql(db_settings, "SELECT funded_at FROM settlement_legs WHERE leg_id=:l", l=lid)
        is None
    )


async def test_partner_cannot_speak_for_another_partners_leg(
    db_settings: Settings, esc: Escrow, owner: Party, deal: dict[str, Any]
) -> None:
    await _open(esc, deal, owner)
    sid, lid = await _leg(db_settings, "USD")
    r = await esc.post("pretend-ng", _funded(sid, lid, code="pretend-ng"))
    assert r.status_code == 422 and r.json()["verdict"] == "UNRESOLVABLE_LEG"
    r = await esc.post("pretend-us", _funded(sid, str(uuid.uuid4())))
    assert r.json()["verdict"] == "UNRESOLVABLE_LEG"
    r = await esc.post("nobody", _funded(sid, lid, code="nobody"), secret=b"k" * 32)
    assert r.status_code == 404
    assert (
        await _sql(
            db_settings, "SELECT count(*) FROM settlement_events WHERE event_type='EscrowFunded'"
        )
        == 0
    )


async def test_duplicate_message_counts_once(
    db_settings: Settings, esc: Escrow, owner: Party, deal: dict[str, Any]
) -> None:
    await _open(esc, deal, owner)
    sid, lid = await _leg(db_settings, "USD")
    body = _funded(sid, lid)
    assert (await esc.post("pretend-us", body)).json()["verdict"] == "ACCEPTED"
    esc.env.clock.advance(seconds=1)
    assert (await esc.post("pretend-us", body)).json()["verdict"] == "DUPLICATE"
    assert (
        await _sql(
            db_settings, "SELECT count(*) FROM settlement_events WHERE event_type='EscrowFunded'"
        )
        == 1
    )
    assert await _sql(db_settings, "SELECT count(*) FROM webhook_receipts") == 2


@pytest.mark.parametrize("amount", [20000, 20199, 20201, 0])
async def test_wrong_amount_is_never_accepted_and_blocks_release(
    db_settings: Settings,
    esc: Escrow,
    owner: Party,
    taker: Party,
    deal: dict[str, Any],
    amount: int,
) -> None:
    await _open(esc, deal, owner)
    sid, lid = await _leg(db_settings, "USD")
    r = await esc.post("pretend-us", _funded(sid, lid, amount))
    assert r.status_code == 200 and r.json()["verdict"] == "CONTRADICTORY"
    exc_type = await _sql(db_settings, "SELECT type FROM reconciliation_exceptions")
    assert exc_type == "AMOUNT_MISMATCH"
    assert (
        await _sql(db_settings, "SELECT observed_amount_minor FROM reconciliation_exceptions")
        == amount
    )
    # The correct transfer is still accepted, but the open hold stops any release.
    await _pay(owner, deal["match_id"])
    await _pay(taker, deal["match_id"])
    assert await _phase(db_settings) == "AWAITING_FUNDING"
    v = (await _view(owner, deal["match_id"])).json()
    assert v["on_hold"] is True
    assert (
        await _sql(db_settings, "SELECT count(*) FROM outbox_messages WHERE operation='RELEASE'")
        == 0
    )


async def test_early_money_waits_in_quarantine_then_counts(
    db_settings: Settings, esc: Escrow, owner: Party, deal: dict[str, Any]
) -> None:
    esc.bank.fail_next["PROVISION"] = 1  # one escrow opens late
    await esc.tick()
    assert await _phase(db_settings) == "INITIALIZING"
    opened = str(
        await _sql(
            db_settings, "SELECT leg_id FROM settlement_legs WHERE state='ESCROW_PROVISIONED'"
        )
    )
    esc.bank.simulate_pay_in(
        uuid.UUID(opened),
        int(
            await _sql(
                db_settings,
                "SELECT amount_minor + fee_minor FROM settlement_legs WHERE leg_id=:l",
                l=opened,
            )
        ),
    )
    await esc.tick()
    assert await _sql(db_settings, "SELECT verdict FROM webhook_receipts") == "QUARANTINED"
    assert await _sql(db_settings, "SELECT status FROM pending_events") == "PENDING"
    esc.env.clock.advance(seconds=3)  # the retry is due
    await esc.tick()
    assert await _phase(db_settings) == "AWAITING_FUNDING"
    assert await _sql(db_settings, "SELECT status FROM pending_events") == "PROMOTED"
    assert (
        await _sql(db_settings, "SELECT state FROM settlement_legs WHERE leg_id=:l", l=opened)
        == "FUNDED"
    )


# --- partner command failures -------------------------------------------------------------------


async def test_escrow_that_never_opens_cancels_the_deal(
    db_settings: Settings, esc: Escrow, deal: dict[str, Any]
) -> None:
    esc.bank.fail_next["PROVISION"] = 99
    for _ in range(6):
        await esc.tick()
        esc.env.clock.advance(minutes=5)
    assert await _phase(db_settings) == "CANCELLED"
    assert await _sql(db_settings, "SELECT closure_reason FROM settlements") == "PROVISION_FAILED"
    assert await _offer(db_settings) == ("open", 0)


async def test_failed_release_opens_a_hold_and_never_unwinds(
    db_settings: Settings, esc: Escrow, owner: Party, taker: Party, deal: dict[str, Any]
) -> None:
    await _open(esc, deal, owner)
    await _pay(owner, deal["match_id"])
    esc.bank.fail_next["RELEASE"] = 99
    await _pay(taker, deal["match_id"])
    for _ in range(7):
        await esc.tick()
        esc.env.clock.advance(minutes=10)
    assert await _phase(db_settings) == "RELEASING"
    assert (
        await _sql(db_settings, "SELECT type FROM settlement_holds LIMIT 1") == "DISPATCH_FAILURE"
    )
    assert (
        await _sql(db_settings, "SELECT count(*) FROM outbox_messages WHERE status='FAILED'") == 2
    )
    assert (
        await _sql(db_settings, "SELECT count(*) FROM outbox_messages WHERE operation='RETURN'")
        == 0
    )


async def test_removed_payout_account_is_never_paid(
    db_settings: Settings, esc: Escrow, owner: Party, taker: Party, deal: dict[str, Any]
) -> None:
    await _open(esc, deal, owner)
    await _pay(owner, deal["match_id"])
    await _sql(db_settings, "UPDATE beneficiaries SET removed_at = now() WHERE currency='USD'")
    await _pay(taker, deal["match_id"])
    await esc.tick(2)
    assert await _sql(db_settings, "SELECT type FROM settlement_holds") == "RISK"
    assert (
        await _sql(db_settings, "SELECT state FROM settlement_legs WHERE currency='USD'")
        == "FUNDED"
    )


# --- who may see and do what ------------------------------------------------------------------


async def test_only_the_two_parties_see_the_escrow(
    esc: Escrow, owner: Party, taker: Party, deal: dict[str, Any]
) -> None:
    await _open(esc, deal, owner)
    eve = await _party(esc.env, THIRD)
    assert (await _view(eve, deal["match_id"])).status_code == 403
    assert (await _pay(eve, deal["match_id"])).status_code == 403
    assert (await _view(eve, str(uuid.uuid4()))).status_code == 404
    assert (
        await esc.env.client.get(f"/api/v1/matches/{deal['match_id']}/settlement")
    ).status_code == 401


async def test_cannot_pay_twice(esc: Escrow, owner: Party, deal: dict[str, Any]) -> None:
    await _open(esc, deal, owner)
    assert (await _pay(owner, deal["match_id"])).status_code == 200
    r = await _pay(owner, deal["match_id"])
    assert r.status_code == 409 and _code(r) == "RES_409_INVALID_SETTLEMENT_STATE"


async def test_cannot_pay_before_escrow_opens(
    esc: Escrow, owner: Party, deal: dict[str, Any]
) -> None:
    assert (await _pay(owner, deal["match_id"])).status_code == 409


async def test_without_pretend_bank_no_escrow_and_no_dev_route(
    db_settings: Settings, partners: None
) -> None:
    async for e in _make(db_settings, bank=False):
        o, t = await _party(e.env, OWNER), await _party(e.env, TAKER)
        deal = await _ready(o, t)
        assert await _sql(db_settings, "SELECT count(*) FROM settlements") == 0
        r = await _view(o, deal["match_id"])
        assert r.status_code == 404 and _code(r) == "RES_404_SETTLEMENT_NOT_FOUND"
        assert (await _pay(o, deal["match_id"])).status_code == 404
        r = await e.env.client.post("/api/v1/webhooks/partners/pretend-us", content=b"{}")
        assert r.status_code == 404


def test_pretend_bank_refused_outside_local() -> None:
    from app.main import build_auth_runtime

    with pytest.raises(ValueError, match="PRETEND_BANK"):
        build_auth_runtime(
            Settings(_env_file=None, app_env="staging", pretend_bank=True)  # type: ignore[call-arg]
        )


async def test_oversized_webhook_is_refused(esc: Escrow) -> None:
    r = await esc.env.client.post(
        "/api/v1/webhooks/partners/pretend-us", content=b"x" * (16 * 1024 + 1)
    )
    assert r.status_code == 413


# --- database guarantees ------------------------------------------------------------------------


async def test_phase_cannot_go_backwards(
    db_settings: Settings, esc: Escrow, owner: Party, deal: dict[str, Any]
) -> None:
    await _open(esc, deal, owner)
    with pytest.raises(Exception, match="not allowed"):
        await _sql(db_settings, "UPDATE settlements SET phase = 'INITIALIZING'")
    with pytest.raises(Exception, match="never deleted"):
        await _sql(db_settings, "DELETE FROM settlement_legs")
    with pytest.raises(Exception, match="immutable"):
        await _sql(db_settings, "UPDATE settlement_legs SET amount_minor = amount_minor + 1")


async def test_evidence_is_append_only(
    db_settings: Settings, esc: Escrow, owner: Party, deal: dict[str, Any]
) -> None:
    await _open(esc, deal, owner)
    await _pay(owner, deal["match_id"])
    for table in ("settlement_events", "webhook_receipts"):
        with pytest.raises(Exception, match="append-only|never"):
            await _sql(
                db_settings,
                f"UPDATE {table} SET created_at = created_at"
                if table == "settlement_events"
                else f"UPDATE {table} SET verdict = 'DUPLICATE'",
            )  # noqa: S608
        with pytest.raises(Exception, match="append-only|never"):
            await _sql(db_settings, f"DELETE FROM {table}")  # noqa: S608


async def test_escrow_grants(db_settings: Settings) -> None:
    async def grants(table: str) -> Any:
        return await _sql(
            db_settings,
            "SELECT string_agg(privilege_type, ',' ORDER BY privilege_type) "
            "FROM information_schema.role_table_grants "
            "WHERE grantee = 'xspeeria_app' AND table_name = :t",
            t=table,
        )

    assert await grants("partners") == "SELECT"
    for table in ("settlement_events", "webhook_receipts", "payout_executions", "transactions"):
        assert await grants(table) == "INSERT,SELECT", table
    for table in ("settlements", "settlement_legs", "outbox_messages", "settlement_holds"):
        assert await grants(table) == "INSERT,SELECT,UPDATE", table


async def test_racing_duplicate_deliveries_count_once(
    db_settings: Settings, esc: Escrow, owner: Party, deal: dict[str, Any]
) -> None:
    import asyncio

    await _open(esc, deal, owner)
    sid, lid = await _leg(db_settings, "USD")
    body = _funded(sid, lid)
    a, b = await asyncio.gather(esc.post("pretend-us", body), esc.post("pretend-us", body))
    assert sorted([a.json()["verdict"], b.json()["verdict"]]) == ["ACCEPTED", "DUPLICATE"]
    assert await _sql(db_settings, "SELECT count(*) FROM settlement_holds") == 0


async def test_my_deals_show_both_amounts_and_the_escrow_phase(
    esc: Escrow, owner: Party, taker: Party, deal: dict[str, Any]
) -> None:
    """ADR-045: History needs the other currency's amount and where the escrow is."""

    async def mine(p: Party) -> dict[str, Any]:
        r = await p.env.client.get("/api/v1/matches/mine", headers=p._h())
        assert r.status_code == 200, r.text
        [m] = [x for x in r.json() if x["match_id"] == deal["match_id"]]
        return dict(m)

    before = await mine(owner)
    assert before["settlement_phase"] == "INITIALIZING"
    assert before["allocated_amount"] == "200.00" and before["counter_amount"] == "264100.00"
    await _open(esc, deal, owner)
    await _pay(owner, deal["match_id"])
    await _pay(taker, deal["match_id"])
    assert (await mine(owner))["settlement_phase"] == "COMPLETED"
    assert (await mine(taker))["settlement_phase"] == "COMPLETED"
