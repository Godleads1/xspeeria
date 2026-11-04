"""Escrow rules and the pretend bank (Milestone 4.1F, ADR-037). Pure; no database."""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import uuid
from datetime import UTC, datetime

import pytest

from app.domain.settlement_rules import (
    FUNDING_WINDOW,
    LEG_TRANSITIONS,
    MONEY_FACTS,
    PHASE_TRANSITIONS,
    TERMINAL_PHASES,
)
from app.providers.pretend_bank import LegCommand, PartnerError, PayoutLine, PretendBank
from app.services.settlement import _key, _reachable

T0 = datetime(2026, 10, 19, 12, 0, tzinfo=UTC)


# The fee itself: tests/unit/test_fee_rules.py (ADR-098).


def test_window_is_five_minutes() -> None:
    assert FUNDING_WINDOW.total_seconds() == 300


def test_states_only_move_forward() -> None:
    assert ("FUNDED", "ESCROW_PROVISIONED") not in LEG_TRANSITIONS
    assert ("PAID_OUT", "RETURN_SENT") not in LEG_TRANSITIONS
    assert MONEY_FACTS == {"FUNDED", "PAID_OUT", "RETURNED"}
    for a, _ in PHASE_TRANSITIONS:
        assert a not in TERMINAL_PHASES


def test_reachability() -> None:
    assert _reachable("PENDING", "FUNDED")
    assert _reachable("ESCROW_PROVISIONED", "PAID_OUT")
    assert not _reachable("PAID_OUT", "FUNDED")
    assert not _reachable("RETURNED", "PAID_OUT")


def test_command_keys_are_deterministic_and_distinct() -> None:
    s, leg = uuid.uuid4(), uuid.uuid4()
    assert _key(s, leg, "RELEASE", T0) == _key(s, leg, "RELEASE", T0)
    assert _key(s, leg, "RELEASE", T0) != _key(s, leg, "RETURN", T0)
    assert len(_key(s, leg, "RELEASE", T0)) == 64


def _cmd(code: str = "pretend-us") -> LegCommand:
    return LegCommand(code, uuid.uuid4(), uuid.uuid4(), "USD", 20000, 200)


def test_pretend_bank_signs_exact_bytes_and_refuses_unknown_partners() -> None:
    bank = PretendBank(lambda: T0)
    assert bank.secret_for("real-bank") is None
    headers, raw = bank.signed("pretend-us", {"a": 1})
    secret = bank.secret_for("pretend-us")
    assert secret is not None
    expected = hmac.new(secret, raw, hashlib.sha256).hexdigest()
    assert headers["X-Xspeeria-Signature"] == expected
    assert json.loads(raw)["sent_at"] == int(T0.timestamp())


def test_pretend_bank_never_pays_twice_for_one_key() -> None:
    bank = PretendBank(lambda: T0)
    cmd = _cmd()

    async def run() -> int:
        await bank.provision(cmd, "p")
        await bank.release(cmd, [PayoutLine("b", 20000)], "k")
        await bank.release(cmd, [PayoutLine("b", 20000)], "k")
        seen: list[bytes] = []

        async def to(_c: str, _h: dict[str, str], raw: bytes) -> None:
            seen.append(raw)

        await bank.deliver(to)
        return len(seen)

    assert asyncio.run(run()) == 1


def test_pretend_refund_includes_the_fee_and_failures_are_injectable() -> None:
    bank = PretendBank(lambda: T0)
    cmd = _cmd()
    bank.fail_next["RETURN"] = 1

    async def run() -> dict[str, object]:
        with pytest.raises(PartnerError):
            await bank.return_funds(cmd, "r")
        await bank.return_funds(cmd, "r")
        out: list[dict[str, object]] = []

        async def to(_c: str, _h: dict[str, str], raw: bytes) -> None:
            out.append(json.loads(raw))

        await bank.deliver(to)
        return out[0]

    body = asyncio.run(run())
    assert body["status"] == "reversed" and body["amount_minor"] == 20200


def test_pay_in_needs_an_open_escrow() -> None:
    with pytest.raises(PartnerError):
        PretendBank(lambda: T0).simulate_pay_in(uuid.uuid4(), 1)
