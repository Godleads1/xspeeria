"""A pretend partner bank for a developer's computer — ADR-037. **Simulation only.**

It behaves like the partner the Banking spec describes, so the real code paths are exercised:

* commands (open escrow, release, return) get a synchronous acknowledgement;
* money facts (funds arrived, paid out, returned) arrive later as **signed webhooks** —
  HMAC-SHA256 over the exact body bytes, ``X-Xspeeria-Signature`` / ``X-Xspeeria-Timestamp``
  (Banking spec §5.2) — and go through the same acceptance pipeline a real partner's would.

Nothing here moves money. State lives in memory and is lost on restart. The server refuses to
create it unless ``APP_ENV=local`` and ``PRETEND_BANK=true``. Real partners need legal and
compliance sign-off first (ADR-001 §12).
"""

from __future__ import annotations

import hashlib
import hmac
import json
import secrets
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import datetime

from app.core.api_metrics import track_outside

__all__ = ["LegCommand", "PartnerError", "PayInInstructions", "PayoutLine", "PretendBank", "sign"]

#: Pretend partner per (currency, country): (code, display name). Seeded by
#: `app.cli.pretend_bank`. The euro has one per served euro country (ADR-105).
PRETEND_PARTNERS: dict[tuple[str, str], tuple[str, str]] = {
    ("NGN", "NG"): ("pretend-ng", "Pretend Bank Nigeria"),
    ("USD", "US"): ("pretend-us", "Pretend Bank USA"),
    ("GBP", "GB"): ("pretend-gb", "Pretend Bank UK"),
    ("CAD", "CA"): ("pretend-ca", "Pretend Bank Canada"),  # ADR-100; simulation only
    ("EUR", "DE"): ("pretend-de", "Pretend Bank Germany"),  # ADR-105
    ("EUR", "FR"): ("pretend-fr", "Pretend Bank France"),  # ADR-105
    ("CNY", "CN"): ("pretend-cn", "Pretend Bank China"),  # ADR-105; behind CHINA_ENABLED
    # ADR-107: eleven African countries; Zimbabwe pays in US dollars.
    ("EGP", "EG"): ("pretend-eg", "Pretend Bank Egypt"),
    ("ZAR", "ZA"): ("pretend-za", "Pretend Bank South Africa"),
    ("MAD", "MA"): ("pretend-ma", "Pretend Bank Morocco"),
    ("ETB", "ET"): ("pretend-et", "Pretend Bank Ethiopia"),
    ("KES", "KE"): ("pretend-ke", "Pretend Bank Kenya"),
    ("XOF", "SN"): ("pretend-sn", "Pretend Bank Senegal"),
    ("GHS", "GH"): ("pretend-gh", "Pretend Bank Ghana"),
    ("USD", "ZW"): ("pretend-zw", "Pretend Bank Zimbabwe"),
    ("UGX", "UG"): ("pretend-ug", "Pretend Bank Uganda"),
    ("ZMW", "ZM"): ("pretend-zm", "Pretend Bank Zambia"),
    ("TZS", "TZ"): ("pretend-tz", "Pretend Bank Tanzania"),
}


class PartnerError(Exception):
    """The partner did not acknowledge a command; the outbox retries with the same key."""


@dataclass(frozen=True)
class LegCommand:
    partner_code: str
    settlement_id: uuid.UUID
    leg_id: uuid.UUID
    currency: str
    amount_minor: int
    fee_minor: int


@dataclass(frozen=True)
class PayoutLine:
    beneficiary_ref: str
    amount_minor: int


@dataclass(frozen=True)
class PayInInstructions:
    bank_name: str
    account_name: str
    account_number: str
    reference: str


def sign(secret: bytes, raw: bytes) -> str:
    return hmac.new(secret, raw, hashlib.sha256).hexdigest()


Deliver = Callable[[str, dict[str, str], bytes], Awaitable[object]]


@dataclass
class _Escrow:
    command: LegCommand
    ref: str
    instructions: PayInInstructions


@dataclass
class PretendBank:
    clock: Callable[[], datetime]
    _secrets: dict[str, bytes] = field(default_factory=dict)
    _escrows: dict[uuid.UUID, _Escrow] = field(default_factory=dict)
    _queue: list[tuple[str, dict[str, object]]] = field(default_factory=list)
    _seen_keys: set[str] = field(default_factory=set)
    #: Tests: make the next N commands of an operation fail ("PROVISION", "RELEASE", "RETURN").
    fail_next: dict[str, int] = field(default_factory=dict)

    def secret_for(self, partner_code: str) -> bytes | None:
        if partner_code not in {code for code, _ in PRETEND_PARTNERS.values()}:
            return None
        return self._secrets.setdefault(partner_code, secrets.token_bytes(32))

    def _maybe_fail(self, operation: str) -> None:
        left = self.fail_next.get(operation, 0)
        if left > 0:
            self.fail_next[operation] = left - 1
            raise PartnerError(f"pretend bank refused {operation}")

    # --- commands (synchronous acknowledgements) --------------------------------------------

    async def provision(self, cmd: LegCommand, key: str) -> str:
        async with track_outside("Pretend bank", "open escrow"):  # ADR-072
            self._maybe_fail("PROVISION")
            existing = self._escrows.get(cmd.leg_id)
            if existing is not None:  # same key again: same escrow (idempotent)
                return existing.ref
            digits = str(int(hashlib.sha256(cmd.leg_id.bytes).hexdigest(), 16))[-8:]
            name = next(n for c, n in PRETEND_PARTNERS.values() if c == cmd.partner_code)
            instructions = PayInInstructions(
                bank_name=name,
                account_name="Xspeeria Escrow (pretend)",
                account_number=f"99{digits}",
                reference=f"XSP-{cmd.leg_id.hex[:8].upper()}",
            )
            ref = f"pretend:{secrets.token_hex(12)}"
            self._escrows[cmd.leg_id] = _Escrow(cmd, ref, instructions)
            self._seen_keys.add(key)
            return ref

    def pay_in_instructions(self, leg_id: uuid.UUID) -> PayInInstructions | None:
        e = self._escrows.get(leg_id)
        return e.instructions if e else None

    async def release(self, cmd: LegCommand, payouts: list[PayoutLine], key: str) -> None:
        async with track_outside("Pretend bank", "pay out"):  # ADR-072
            self._maybe_fail("RELEASE")
            if key in self._seen_keys:
                return  # deduplicated by the partner: no second payout
            self._seen_keys.add(key)
            self._emit(cmd, "completed", sum(p.amount_minor for p in payouts))

    async def return_funds(self, cmd: LegCommand, key: str) -> None:
        async with track_outside("Pretend bank", "return funds"):  # ADR-072
            self._maybe_fail("RETURN")
            if key in self._seen_keys:
                return
            self._seen_keys.add(key)
            # Product owner, 2026-10-19: refunded in full, fee included.
            self._emit(cmd, "reversed", cmd.amount_minor + cmd.fee_minor)

    # --- the user's bank transfer (simulated) -------------------------------------------------

    def simulate_pay_in(self, leg_id: uuid.UUID, amount_minor: int) -> None:
        e = self._escrows.get(leg_id)
        if e is None:
            raise PartnerError("no escrow for that leg")
        self._emit(e.command, "verified", amount_minor)

    # --- webhooks ------------------------------------------------------------------------------

    def _emit(self, cmd: LegCommand, status: str, amount_minor: int) -> None:
        self._queue.append(
            (
                cmd.partner_code,
                {
                    "provider_event_id": f"evt_{secrets.token_hex(10)}",
                    "partner_code": cmd.partner_code,
                    "settlement_id": str(cmd.settlement_id),
                    "leg_id": str(cmd.leg_id),
                    "status": status,
                    "amount_minor": amount_minor,
                    "currency": cmd.currency,
                },
            )
        )

    def signed(self, partner_code: str, body: dict[str, object]) -> tuple[dict[str, str], bytes]:
        ts = int(self.clock().timestamp())
        raw = json.dumps({**body, "sent_at": ts}, separators=(",", ":")).encode()
        secret = self.secret_for(partner_code)
        if secret is None:  # pragma: no cover - only our own codes are queued
            raise PartnerError("unknown partner")
        return {"X-Xspeeria-Signature": sign(secret, raw), "X-Xspeeria-Timestamp": str(ts)}, raw

    async def deliver(self, to: Deliver) -> int:
        """Send queued webhooks, oldest first, through ``to`` (the real ingestion path)."""
        sent = 0
        while self._queue:
            code, body = self._queue.pop(0)
            headers, raw = self.signed(code, body)
            await to(code, headers, raw)
            sent += 1
        return sent
