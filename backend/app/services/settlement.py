"""Escrow settlement orchestration — Milestone 4.1F (ADR-001, ADR-002, ADR-037). SIMULATION ONLY.

Xspeeria never holds money. For each ready deal it records two **legs**, one per country:

* the REQUESTER leg — the offer's owner pays the offer amount + 1% into escrow in that
  currency; the bank pays it out to the taker's chosen accounts;
* the ACCEPTER leg — the taker pays the counter amount + 1% into escrow in the other currency;
  the bank pays it out to the owner's chosen accounts.

What may happen is decided here; what *did* happen with money comes only from the partner:

* ``FUNDED`` / ``PAID_OUT`` / ``RETURNED`` are set only by a signature-verified, in-window
  partner webhook that passes the ADR-002 §3 pipeline (F-6, F-7). Every message is kept in
  ``webhook_receipts`` with a verdict; premature ones are quarantined, impossible ones open a
  reconciliation exception and a blocking hold — none is discarded (L-20, L-22).
* Release is one atomic decision (ADR-001 §6): both legs FUNDED, both payees' accounts
  bank-confirmed, no blocking hold, ``release_authorized_at`` unset → set it, RELEASING, the
  ``ReleaseAuthorized`` event and two outbox rows, in one transaction.
* Partner commands go out from the outbox **after** commit, with a deterministic key, and never
  inside a financial transaction (ADR-002 L-19). A failed dispatch retries with the same key;
  after the limit a DISPATCH_FAILURE hold opens and no financial state changes.
* 5 minutes after both escrows open (ADR-021 §2): none funded → CANCELLED; some funded →
  UNWINDING, the funded escrows are returned **in full, fee included** (product owner,
  2026-10-19), then CLOSED_UNWOUND. Either way the deal's amount goes back on the offer.

Locks are taken settlement first, then its legs in ``leg_id`` order (ADR-001 §5.1), and the leg
state is always re-read inside the lock (F-15).

Not built (recorded in ADR-037): the accounting ledger (finance policy P-1/P-2 not approved),
admin transitions (8, 11–13), RECOVERY_REQUIRED entry (no "permanent failure" rule yet), the
advisory ``confirm-funds`` endpoint, referral fee discounts.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

from fastapi import status
from pydantic import BaseModel, ConfigDict, ValidationError
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError
from app.core.logging import get_logger
from app.domain.payout_rules import counter_amount_minor
from app.domain.settlement_rules import (
    DISPATCH_MAX_ATTEMPTS,
    FUNDING_WINDOW,
    JURISDICTION,
    LEG_TRANSITIONS,
    PARTNER_VOCABULARY,
    REPLAY_WINDOW,
    TERMINAL_PHASES,
    coordination_fee_minor,
)
from app.models.marketplace import Match, Offer
from app.models.payouts import Beneficiary, MatchPayoutSelection
from app.models.settlement import (
    OutboxMessage,
    Partner,
    PayoutExecution,
    PendingEvent,
    ReconciliationException,
    Settlement,
    SettlementEvent,
    SettlementHold,
    SettlementLeg,
    Transaction,
    WebhookReceipt,
)
from app.providers.pretend_bank import LegCommand, PartnerError, PayoutLine, PretendBank
from app.services.auth import Principal
from app.services.notifications import notify_settlement
from app.services.offers import money_text

__all__ = ["IngestResult", "SettlementService", "settlement_view"]

_logger = get_logger(__name__)

#: Leg state → the Appendix D §7.2 event that records it.
_EVENT_FOR_STATE = {
    "ESCROW_PROVISIONED": "EscrowProvisioned",
    "PROVISION_FAILED": "EscrowProvisioningFailed",
    "FUNDED": "EscrowFunded",
    "RELEASE_SENT": "ReleaseSent",
    "PAID_OUT": "PayoutConfirmed",
    "PAYOUT_FAILED": "PayoutFailed",
    "RETURN_SENT": "EscrowReturnInitiated",
    "RETURNED": "EscrowReturned",
}
_ACK_STATE = {"PROVISION": "ESCROW_PROVISIONED", "RELEASE": "RELEASE_SENT", "RETURN": "RETURN_SENT"}
_LEASE = timedelta(seconds=30)


def _reachable(start: str, target: str) -> bool:
    """Whether ``target`` can still be reached from ``start`` through allowed leg moves."""
    seen, todo = {start}, [start]
    while todo:
        s = todo.pop()
        for a, b in LEG_TRANSITIONS:
            if a == s and b not in seen:
                if b == target:
                    return True
                seen.add(b)
                todo.append(b)
    return False


def _key(settlement_id: uuid.UUID, leg_id: uuid.UUID, op: str, decided_at: datetime) -> str:
    """ADR-001 §6(b): sha256(settlement_id | leg_id | operation | decision time)."""
    raw = f"{settlement_id}|{leg_id}|{op}|{decided_at.isoformat()}"
    return hashlib.sha256(raw.encode()).hexdigest()


class _PartnerMessage(BaseModel):
    """ADR-002 §3.1 stage 5: strict schema, unknown fields refused."""

    model_config = ConfigDict(extra="forbid", strict=True)

    provider_event_id: str
    partner_code: str
    settlement_id: str
    leg_id: str
    status: Literal["verified", "completed", "reversed", "failed"]
    amount_minor: int
    currency: str
    sent_at: int


@dataclass(frozen=True)
class IngestResult:
    http_status: int
    verdict: str


class SettlementService:
    def __init__(
        self, db: AsyncSession, clock: Callable[[], datetime], bank: PretendBank | None
    ) -> None:
        self._db = db
        self._clock = clock
        self._bank = bank

    # --- helpers ----------------------------------------------------------------------------

    def _event(
        self,
        settlement_id: uuid.UUID,
        leg_id: uuid.UUID | None,
        event_type: str,
        payload: dict[str, Any],
        *,
        provider_event_id: str | None = None,
        receipt_id: uuid.UUID | None = None,
    ) -> None:
        self._db.add(
            SettlementEvent(
                id=uuid.uuid4(),
                settlement_id=settlement_id,
                leg_id=leg_id,
                event_type=event_type,
                payload=payload,
                provider_event_id=provider_event_id,
                receipt_id=receipt_id,
                created_at=self._clock(),
            )
        )

    async def _lock(self, settlement_id: uuid.UUID) -> tuple[Settlement, list[SettlementLeg]]:
        settlement = await self._db.scalar(
            select(Settlement).where(Settlement.id == settlement_id).with_for_update()
        )
        if settlement is None:  # pragma: no cover - callers pass existing ids
            raise LookupError("settlement")
        legs = list(
            (
                await self._db.scalars(
                    select(SettlementLeg)
                    .where(SettlementLeg.settlement_id == settlement_id)
                    .order_by(SettlementLeg.leg_id)
                    .with_for_update()
                    .execution_options(populate_existing=True)
                )
            ).all()
        )
        return settlement, legs

    async def _set_phase(
        self, settlement: Settlement, phase: str, reason: str | None = None
    ) -> None:
        settlement.phase = phase
        if reason is not None:
            settlement.closure_reason = reason
        settlement.updated_at = self._clock()
        # ADR-044: both parties hear about it, in the same transaction as the change.
        await notify_settlement(self._db, settlement, self._clock())

    def _move_leg(self, leg: SettlementLeg, state: str) -> None:
        if (leg.state, state) not in LEG_TRANSITIONS:  # pragma: no cover - callers check first
            raise ValueError(f"leg {leg.state} -> {state}")
        now = self._clock()
        leg.state = state
        if state == "FUNDED":
            leg.funded_at = now
        elif state == "PAID_OUT":
            leg.paid_out_at = now
        elif state == "RETURNED":
            leg.returned_at = now

    def _outbox(
        self, settlement: Settlement, leg: SettlementLeg, op: str, decided_at: datetime
    ) -> None:
        self._db.add(
            OutboxMessage(
                id=uuid.uuid4(),
                settlement_id=settlement.id,
                leg_id=leg.leg_id,
                operation=op,
                idempotency_key=_key(settlement.id, leg.leg_id, op, decided_at),
                status="PENDING",
                attempts=0,
                next_attempt_at=self._clock(),
                created_at=self._clock(),
            )
        )

    async def _blocking_holds(self, settlement_id: uuid.UUID) -> int:
        rows = await self._db.scalars(
            select(SettlementHold.id).where(
                SettlementHold.settlement_id == settlement_id,
                SettlementHold.closed_at.is_(None),
                SettlementHold.blocks_progression.is_(True),
            )
        )
        return len(rows.all())

    def _hold(self, settlement_id: uuid.UUID, kind: str, reason: str) -> None:
        self._db.add(
            SettlementHold(
                id=uuid.uuid4(),
                settlement_id=settlement_id,
                type=kind,
                blocks_progression=True,
                reason=reason[:200],
                opened_at=self._clock(),
            )
        )
        self._event(settlement_id, None, "HoldOpened", {"type": kind, "reason": reason[:200]})

    async def _return_capacity(self, settlement: Settlement) -> None:
        """A cancelled or unwound deal no longer counts towards its offer (Standing Std §7.5)."""
        match = await self._db.scalar(
            select(Match)
            .join(Transaction, Transaction.match_id == Match.id)
            .where(Transaction.id == settlement.transaction_id)
        )
        if match is None:  # pragma: no cover
            return
        offer = await self._db.scalar(
            select(Offer).where(Offer.id == match.offer_id).with_for_update()
        )
        if offer is None:  # pragma: no cover
            return
        offer.matched_amount_minor -= match.allocated_amount_minor
        if offer.status in ("partially_matched", "fully_matched"):
            offer.status = "open" if offer.matched_amount_minor == 0 else "partially_matched"
        offer.version += 1

    # --- 1. a ready deal becomes a settlement ------------------------------------------------

    async def create_for_match(self, match: Match, offer: Offer) -> Settlement | None:
        """Inside the caller's transaction, right after the deal became ``funding_ready``.

        Returns None (and changes nothing) when no partner serves a leg's country — e.g. EUR,
        or any real deployment before a partner exists (fail closed).
        """
        if self._bank is None:
            return None  # simulation only (ADR-037): no real partner exists yet
        now = self._clock()
        counter_currency = offer.target_currency
        counter_minor = counter_amount_minor(
            match.allocated_amount_minor, match.currency, match.agreed_rate
        )
        plan = [
            # (role, funder, payee, currency, amount)
            (
                "REQUESTER",
                offer.user_id,
                match.counterparty_user_id,
                match.currency,
                match.allocated_amount_minor,
            ),
            (
                "ACCEPTER",
                match.counterparty_user_id,
                offer.user_id,
                counter_currency,
                counter_minor,
            ),
        ]
        partners: dict[str, Partner] = {}
        for _, _, _, currency, _ in plan:
            jurisdiction = JURISDICTION.get(currency)
            partner = (
                await self._db.scalar(
                    select(Partner).where(
                        Partner.currency == currency,
                        Partner.jurisdiction == jurisdiction,
                        Partner.is_simulated.is_(True),
                    )
                )
                if jurisdiction
                else None
            )
            if partner is None:
                _logger.warning(
                    "settlement_not_created_no_partner",
                    extra={"match_id": str(match.id), "currency": currency},
                )
                return None
            partners[currency] = partner

        transaction = Transaction(id=uuid.uuid4(), match_id=match.id, created_at=now)
        settlement = Settlement(
            id=uuid.uuid4(),
            transaction_id=transaction.id,
            phase="INITIALIZING",
            created_at=now,
            updated_at=now,
        )
        self._db.add(transaction)
        await self._db.flush()
        self._db.add(settlement)
        await self._db.flush()
        self._event(settlement.id, None, "SettlementCreated", {"match_id": str(match.id)})
        for role, funder, payee, currency, amount in plan:
            partner = partners[currency]
            choices = (
                await self._db.execute(
                    select(MatchPayoutSelection, Beneficiary)
                    .join(Beneficiary, Beneficiary.id == MatchPayoutSelection.beneficiary_id)
                    .where(
                        MatchPayoutSelection.match_id == match.id,
                        MatchPayoutSelection.user_id == payee,
                    )
                )
            ).all()
            all_confirmed = bool(choices) and all(
                b.validation_state == "validated" and b.currency == currency for _, b in choices
            )
            if (
                not choices
                or sum(s.amount_minor for s, _ in choices) != amount
                or len({(s.currency, s.scale, s.currency_def_version) for s, _ in choices}) != 1
                or choices[0][0].currency != currency
            ):  # pragma: no cover - enforced on choose
                raise ValueError("payout choices do not match the leg")
            # The leg's own currency definition (the counter currency differs from the match's).
            scale, def_version = choices[0][0].scale, choices[0][0].currency_def_version
            leg = SettlementLeg(
                leg_id=uuid.uuid4(),
                settlement_id=settlement.id,
                party_role=role,
                funder_user_id=funder,
                payee_user_id=payee,
                state="PENDING",
                currency=currency,
                amount_minor=amount,
                fee_minor=coordination_fee_minor(amount),
                scale=scale,
                currency_def_version=def_version,
                source_jurisdiction=partner.jurisdiction,
                destination_jurisdiction=partner.jurisdiction,
                partner_id=partner.id,
                beneficiary_validated_at=now if all_confirmed else None,
            )
            self._db.add(leg)
            await self._db.flush()
            for sel, b in choices:
                self._db.add(
                    PayoutExecution(
                        id=uuid.uuid4(),
                        leg_id=leg.leg_id,
                        beneficiary_account_id=b.id,
                        amount_minor=sel.amount_minor,
                        currency=currency,
                        scale=leg.scale,
                        currency_def_version=leg.currency_def_version,
                    )
                )
            self._outbox(settlement, leg, "PROVISION", now)
        await self._db.flush()
        _logger.info("settlement_created", extra={"settlement_id": str(settlement.id)})
        return settlement

    # --- 2. commands to the partner (outbox) -------------------------------------------------

    async def _command(self, leg: SettlementLeg) -> LegCommand:
        code = await self._db.scalar(select(Partner.code).where(Partner.id == leg.partner_id))
        return LegCommand(
            partner_code=str(code),
            settlement_id=leg.settlement_id,
            leg_id=leg.leg_id,
            currency=leg.currency,
            amount_minor=leg.amount_minor,
            fee_minor=leg.fee_minor,
        )

    async def dispatch_due(self, *, limit: int = 20) -> int:
        """Send due outbox commands. Claim (lease) → commit → call partner → record result."""
        if self._bank is None:
            return 0
        done = 0
        for _ in range(limit):
            now = self._clock()
            msg = await self._db.scalar(
                select(OutboxMessage)
                .where(OutboxMessage.status == "PENDING", OutboxMessage.next_attempt_at <= now)
                .order_by(OutboxMessage.created_at)
                .limit(1)
                .with_for_update(skip_locked=True)
            )
            if msg is None:
                await self._db.rollback()
                break
            msg.next_attempt_at = now + _LEASE  # lease: no other dispatcher takes it meanwhile
            msg_id, op, key = msg.id, msg.operation, msg.idempotency_key
            leg = await self._db.scalar(
                select(SettlementLeg).where(SettlementLeg.leg_id == msg.leg_id)
            )
            if leg is None:  # pragma: no cover
                await self._db.rollback()
                break
            cmd = await self._command(leg)
            payouts: list[PayoutLine] = []
            if op == "RELEASE":
                rows = (
                    await self._db.scalars(
                        select(PayoutExecution).where(PayoutExecution.leg_id == leg.leg_id)
                    )
                ).all()
                payouts = [
                    PayoutLine(f"beneficiary:{p.beneficiary_account_id}", p.amount_minor)
                    for p in rows
                ]
                accounts = (
                    await self._db.scalars(
                        select(Beneficiary).where(
                            Beneficiary.id.in_([p.beneficiary_account_id for p in rows])
                        )
                    )
                ).all()
                if len(accounts) != len(rows) or any(
                    b.removed_at is not None or b.validation_state != "validated" for b in accounts
                ):
                    # The payee's account changed after release was decided: never pay it
                    # blindly, never unwind on our own. A person must decide (ADR-001 §6c).
                    msg.status = "FAILED"
                    msg.last_error = "payout account no longer usable"
                    self._hold(leg.settlement_id, "RISK", "payout account removed or unconfirmed")
                    await self._db.commit()
                    done += 1
                    continue
            await self._db.commit()  # no network call inside a transaction (L-19)

            escrow_ref: str | None = None
            error: str | None = None
            try:
                if op == "PROVISION":
                    escrow_ref = await self._bank.provision(cmd, key)
                elif op == "RELEASE":
                    await self._bank.release(cmd, payouts, key)
                else:
                    await self._bank.return_funds(cmd, key)
            except PartnerError as exc:
                error = str(exc)[:200]
            await self._record_dispatch(msg_id, cmd, op, error, escrow_ref)
            done += 1
        return done

    async def _record_dispatch(
        self, msg_id: uuid.UUID, cmd: LegCommand, op: str, error: str | None, escrow_ref: str | None
    ) -> None:
        settlement, legs = await self._lock(cmd.settlement_id)
        msg = await self._db.scalar(
            select(OutboxMessage).where(OutboxMessage.id == msg_id).with_for_update()
        )
        if msg is None or msg.status != "PENDING":  # pragma: no cover
            await self._db.rollback()
            return
        leg = next(item for item in legs if item.leg_id == cmd.leg_id)
        now = self._clock()
        msg.attempts += 1
        if error is not None:
            msg.last_error = error
            if msg.attempts < DISPATCH_MAX_ATTEMPTS:
                msg.next_attempt_at = now + timedelta(seconds=2 ** min(msg.attempts, 8))
            else:
                msg.status = "FAILED"
                if op == "PROVISION" and leg.state == "PENDING":
                    self._move_leg(leg, "PROVISION_FAILED")
                    self._event(
                        settlement.id, leg.leg_id, "EscrowProvisioningFailed", {"error": error}
                    )
                    if settlement.phase == "INITIALIZING" and not any(
                        x.state == "FUNDED" for x in legs
                    ):
                        await self._set_phase(settlement, "CANCELLED", "PROVISION_FAILED")
                        self._event(
                            settlement.id,
                            None,
                            "SettlementCancelled",
                            {"reason": "PROVISION_FAILED"},
                        )
                        await self._return_capacity(settlement)
                else:
                    # ADR-001 §6(c): never unwind; open a hold and alert. No financial change.
                    self._hold(
                        settlement.id, "DISPATCH_FAILURE", f"{op} failed {msg.attempts} times"
                    )
                    _logger.error(
                        "dispatch_failed",
                        extra={"settlement_id": str(settlement.id), "operation": op},
                    )
            await self._db.commit()
            return
        msg.status = "SENT"
        target = _ACK_STATE[op]
        if (leg.state, target) in LEG_TRANSITIONS:
            self._move_leg(leg, target)
            if op == "PROVISION":
                leg.escrow_account_ref = escrow_ref
            self._event(settlement.id, leg.leg_id, _EVENT_FOR_STATE[target], {"operation": op})
        await self._advance(settlement, legs)
        await self._db.commit()
        await self._promote_pending(settlement.id)

    # --- 3. partner evidence (ADR-002 §3) --------------------------------------------------------

    def _secret(self, code: str) -> bytes | None:
        return self._bank.secret_for(code) if self._bank is not None else None

    def _receipt(
        self, raw: bytes, verdict: str, partner_id: uuid.UUID | None, provider_event_id: str | None
    ) -> WebhookReceipt:
        r = WebhookReceipt(
            id=uuid.uuid4(),
            provider_event_id=provider_event_id,
            partner_id=partner_id,
            raw_body=raw,
            verdict=verdict,
            received_at=self._clock(),
        )
        self._db.add(r)
        return r

    async def ingest(self, partner_code: str, headers: dict[str, str], raw: bytes) -> IngestResult:
        """ADR-002 §3.1 pipeline. Every message from a known partner is kept with its verdict."""
        now = self._clock()
        partner = await self._db.scalar(select(Partner).where(Partner.code == partner_code[:32]))
        secret = self._secret(partner_code)
        if partner is None or secret is None:
            # No partner to attribute it to: nothing to keep as evidence (ADR-037).
            await self._db.rollback()
            _logger.warning("webhook_unknown_partner")
            return IngestResult(404, "UNKNOWN_PARTNER")
        partner_id = partner.id  # read now: a rollback expires ORM attributes
        signature = headers.get("X-Xspeeria-Signature", "")
        expected = hmac.new(secret, raw, hashlib.sha256).hexdigest()
        # Stage 2: authenticate (constant-time). Retained as evidence, never promoted.
        if not hmac.compare_digest(signature.encode(), expected.encode()):
            self._receipt(raw, "SIGNATURE_INVALID", partner_id, None)
            await self._db.commit()
            _logger.warning("webhook_signature_invalid", extra={"partner_code": partner_code})
            return IngestResult(401, "SIGNATURE_INVALID")
        try:
            sent = int(headers.get("X-Xspeeria-Timestamp", ""))
            skew = abs((now - datetime.fromtimestamp(sent, tz=UTC)).total_seconds())
        except (ValueError, OverflowError, OSError):
            sent, skew = 0, float("inf")
        if skew > REPLAY_WINDOW.total_seconds():
            self._receipt(raw, "REPLAY_SUSPECTED", partner_id, None)
            await self._db.commit()
            _logger.warning("webhook_replay_suspected", extra={"partner_code": partner_code})
            return IngestResult(401, "REPLAY_SUSPECTED")
        # Stage 5: schema (strict). The body's own time and sender must match the headers.
        try:
            msg = _PartnerMessage.model_validate(json.loads(raw))
            if msg.sent_at != sent or msg.partner_code != partner_code:
                raise ValueError("header/body mismatch")
            if not 1 <= len(msg.provider_event_id) <= 128 or msg.amount_minor < 0:
                raise ValueError("field out of range")
            settlement_id, leg_id = uuid.UUID(msg.settlement_id), uuid.UUID(msg.leg_id)
        except (ValidationError, ValueError, UnicodeDecodeError):
            self._receipt(raw, "SCHEMA_INVALID", partner_id, None)
            await self._db.commit()
            return IngestResult(422, "SCHEMA_INVALID")
        # Stage 3: duplicate (this partner event was already decided).
        seen = await self._db.scalar(
            select(WebhookReceipt.id).where(
                WebhookReceipt.partner_id == partner_id,
                WebhookReceipt.provider_event_id == msg.provider_event_id,
                WebhookReceipt.verdict.in_(("ACCEPTED", "QUARANTINED", "CONTRADICTORY")),
            )
        )
        if seen is not None:
            self._receipt(raw, "DUPLICATE", partner_id, msg.provider_event_id)
            await self._db.commit()
            return IngestResult(200, "DUPLICATE")
        # Stage 6: correlate to a leg held by this partner (F-14). Never defaulted.
        owner = await self._db.scalar(
            select(SettlementLeg.partner_id).where(
                and_(SettlementLeg.leg_id == leg_id, SettlementLeg.settlement_id == settlement_id)
            )
        )
        if owner is None or owner != partner_id:
            self._receipt(raw, "UNRESOLVABLE_LEG", partner_id, msg.provider_event_id)
            await self._db.commit()
            return IngestResult(422, "UNRESOLVABLE_LEG")
        await self._db.rollback()

        # Stages 7–8 under the settlement lock (settlement, then legs in leg_id order).
        settlement, legs = await self._lock(settlement_id)
        # Stage 3 again, under the lock: two deliveries of one event racing each other.
        if await self._db.scalar(
            select(WebhookReceipt.id).where(
                WebhookReceipt.partner_id == partner_id,
                WebhookReceipt.provider_event_id == msg.provider_event_id,
                WebhookReceipt.verdict.in_(("ACCEPTED", "QUARANTINED", "CONTRADICTORY")),
            )
        ):
            self._receipt(raw, "DUPLICATE", partner_id, msg.provider_event_id)
            await self._db.commit()
            return IngestResult(200, "DUPLICATE")
        receipt = WebhookReceipt(
            id=uuid.uuid4(),
            provider_event_id=msg.provider_event_id,
            partner_id=partner_id,
            raw_body=raw,
            verdict="PENDING_DECISION",  # replaced by _evaluate before the row is written
            received_at=now,
        )
        verdict = await self._evaluate(settlement, legs, leg_id, msg, receipt)
        await self._db.commit()
        if verdict == "ACCEPTED":
            await self._promote_pending(settlement_id)
        return IngestResult(200, verdict)

    async def _evaluate(
        self,
        settlement: Settlement,
        legs: list[SettlementLeg],
        leg_id: uuid.UUID,
        msg: _PartnerMessage,
        receipt: WebhookReceipt,
        pending: PendingEvent | None = None,
    ) -> str:
        """Stage 7: transition + invariant validation. Legs are locked. Returns the verdict.

        A new ``receipt`` (``pending is None``) is not yet in the session: its verdict is set
        here first and the row written once, because receipts are append-only.
        """
        leg = next(item for item in legs if item.leg_id == leg_id)
        target = PARTNER_VOCABULARY[msg.status]
        expected = {
            "FUNDED": leg.amount_minor + leg.fee_minor,
            "PAID_OUT": leg.amount_minor,
            "RETURNED": leg.amount_minor + leg.fee_minor,
        }.get(target)
        terminal = settlement.phase in TERMINAL_PHASES
        mismatch = msg.currency != leg.currency or (
            expected is not None and msg.amount_minor != expected
        )
        # Money counts only once both escrows are open (INITIALIZING → AWAITING_FUNDING).
        early = target == "FUNDED" and settlement.phase == "INITIALIZING"
        allowed = (leg.state, target) in LEG_TRANSITIONS and not early and not terminal
        if mismatch:
            verdict = "CONTRADICTORY"
        elif allowed:
            verdict = "ACCEPTED"
        elif not terminal and (early or _reachable(leg.state, target)):
            verdict = "QUARANTINED"
        else:
            verdict = "CONTRADICTORY"

        if pending is None:
            receipt.verdict = verdict
            self._db.add(receipt)
        await self._db.flush()  # the receipt row must exist before anything references it

        if verdict == "ACCEPTED":
            self._move_leg(leg, target)
            self._event(
                settlement.id,
                leg.leg_id,
                _EVENT_FOR_STATE[target],
                {"amount_minor": msg.amount_minor, "currency": msg.currency},
                provider_event_id=msg.provider_event_id,
                receipt_id=receipt.id,
            )
            await self._advance(settlement, legs)
        elif verdict == "QUARANTINED":
            if pending is None:
                self._db.add(
                    PendingEvent(
                        id=uuid.uuid4(),
                        receipt_id=receipt.id,
                        settlement_id=settlement.id,
                        leg_id=leg.leg_id,
                        missing_prerequisite=f"{target} needs leg past {leg.state}"[:64],
                        status="PENDING",
                        quarantined_at=self._clock(),
                    )
                )
        else:
            # Money in an escrow that is already closed would be stranded (F-9); an amount the
            # leg does not expect is never accepted. A human must decide (L-22).
            self._db.add(
                ReconciliationException(
                    id=uuid.uuid4(),
                    settlement_id=settlement.id,
                    leg_id=leg.leg_id,
                    receipt_id=receipt.id,
                    type="AMOUNT_MISMATCH" if mismatch else "STATE_MISMATCH",
                    expected_amount_minor=expected if mismatch else None,
                    observed_amount_minor=msg.amount_minor if mismatch else None,
                    currency=leg.currency if mismatch else None,
                    scale=leg.scale if mismatch else None,
                    currency_def_version=leg.currency_def_version if mismatch else None,
                    detail=f"{msg.status} while leg {leg.state}, settlement {settlement.phase}",
                    status="OPEN",
                    opened_at=self._clock(),
                )
            )
            if not terminal:
                self._hold(settlement.id, "RECONCILIATION", "contradictory partner evidence")
            self._event(
                settlement.id, leg.leg_id, "ReconciliationMismatchDetected", {"status": msg.status}
            )
            _logger.error("webhook_contradictory", extra={"settlement_id": str(settlement.id)})
        return verdict

    async def _promote_pending(self, settlement_id: uuid.UUID) -> None:
        """ADR-002 §3.2: re-evaluate quarantined evidence after every acceptance."""
        for _ in range(10):
            row = await self._db.scalar(
                select(PendingEvent)
                .where(
                    PendingEvent.settlement_id == settlement_id, PendingEvent.status == "PENDING"
                )
                .order_by(PendingEvent.quarantined_at)
                .limit(1)
                .with_for_update(skip_locked=True)
            )
            if row is None:
                await self._db.rollback()
                return
            receipt = await self._db.scalar(
                select(WebhookReceipt).where(WebhookReceipt.id == row.receipt_id)
            )
            if receipt is None or row.leg_id is None:  # pragma: no cover
                await self._db.rollback()
                return
            msg = _PartnerMessage.model_validate(json.loads(receipt.raw_body))
            settlement, legs = await self._lock(settlement_id)
            verdict = await self._evaluate(settlement, legs, row.leg_id, msg, receipt, pending=row)
            if verdict == "QUARANTINED":
                await self._db.rollback()
                return
            row.status = "PROMOTED" if verdict == "ACCEPTED" else "ESCALATED"
            await self._db.commit()

    # --- 4. Xspeeria's decisions (phases) -----------------------------------------------------

    async def _advance(self, settlement: Settlement, legs: list[SettlementLeg]) -> None:
        """Apply every phase move whose gate now holds (ADR-001 §5.1). Legs are locked."""
        now = self._clock()
        states = [leg.state for leg in legs]
        if settlement.phase == "INITIALIZING" and all(s == "ESCROW_PROVISIONED" for s in states):
            settlement.funding_deadline = now + FUNDING_WINDOW
            await self._set_phase(settlement, "AWAITING_FUNDING")
        if (
            settlement.phase == "AWAITING_FUNDING"
            and all(s == "FUNDED" for s in states)
            and all(leg.beneficiary_validated_at is not None for leg in legs)
            and settlement.release_authorized_at is None
            and await self._blocking_holds(settlement.id) == 0
        ):
            # ADR-001 §6(a): one atomic decision.
            settlement.release_authorized_at = now
            await self._set_phase(settlement, "RELEASING")
            self._event(settlement.id, None, "ReleaseAuthorized", {"at": now.isoformat()})
            for leg in legs:
                self._outbox(settlement, leg, "RELEASE", now)
        if settlement.phase == "RELEASING" and all(s == "PAID_OUT" for s in states):
            await self._set_phase(settlement, "COMPLETED")
            self._event(settlement.id, None, "SettlementCompleted", {})
        if settlement.phase == "UNWINDING":
            for leg in legs:  # money that arrives while unwinding goes straight back
                if leg.state == "FUNDED" and not await self._has_outbox(leg.leg_id, "RETURN"):
                    self._outbox(settlement, leg, "RETURN", now)
            if not any(s in ("FUNDED", "RETURN_SENT") for s in states):
                await self._set_phase(settlement, "CLOSED_UNWOUND", "TIMEOUT")
                self._event(settlement.id, None, "SettlementUnwound", {})
                await self._return_capacity(settlement)

    async def _has_outbox(self, leg_id: uuid.UUID, op: str) -> bool:
        return (
            await self._db.scalar(
                select(OutboxMessage.id).where(
                    OutboxMessage.leg_id == leg_id, OutboxMessage.operation == op
                )
            )
        ) is not None

    async def expire_funding_windows(self, *, limit: int = 50) -> int:
        """ADR-001 transitions 5 and 6, after the 5-minute window (ADR-021 §2)."""
        now = self._clock()
        ids = (
            await self._db.scalars(
                select(Settlement.id)
                .where(Settlement.phase == "AWAITING_FUNDING", Settlement.funding_deadline <= now)
                .limit(limit)
            )
        ).all()
        await self._db.rollback()
        done = 0
        for sid in ids:
            settlement, legs = await self._lock(sid)
            if (
                settlement.phase != "AWAITING_FUNDING"
                or settlement.funding_deadline is None
                or settlement.funding_deadline > now
            ):
                await self._db.rollback()
                continue
            self._event(settlement.id, None, "FundingWindowExpired", {})
            if any(leg.state == "FUNDED" for leg in legs):
                await self._set_phase(settlement, "UNWINDING")
                for leg in legs:
                    if leg.state == "FUNDED":
                        self._outbox(settlement, leg, "RETURN", now)
            else:
                await self._set_phase(settlement, "CANCELLED", "TIMEOUT")
                self._event(settlement.id, None, "SettlementCancelled", {"reason": "TIMEOUT"})
                await self._return_capacity(settlement)
            await self._db.commit()
            done += 1
        return done

    # --- 5. what a party may see and do --------------------------------------------------------

    async def _for_party(self, principal: Principal, match_id: uuid.UUID) -> Settlement:
        parties = (
            await self._db.execute(
                select(Match.counterparty_user_id, Offer.user_id)
                .join(Offer, Offer.id == Match.offer_id)
                .where(Match.id == match_id)
            )
        ).first()
        if parties is None:
            raise AppError("RES_404_MATCH_NOT_FOUND", "That match was not found.", status_code=404)
        if principal.user_id not in tuple(parties):
            raise AppError(
                "AUTH_403_FORBIDDEN",
                "You are not part of this match.",
                status_code=status.HTTP_403_FORBIDDEN,
            )
        settlement = await self._db.scalar(
            select(Settlement)
            .join(Transaction, Transaction.id == Settlement.transaction_id)
            .where(Transaction.match_id == match_id)
        )
        if settlement is None:
            raise AppError(
                "RES_404_SETTLEMENT_NOT_FOUND",
                "The escrow steps for this deal have not started.",
                status_code=404,
            )
        return settlement

    async def view(self, principal: Principal, match_id: uuid.UUID) -> dict[str, Any]:
        settlement = await self._for_party(principal, match_id)
        out = await settlement_view(self._db, settlement, principal.user_id, self._bank)
        await self._db.rollback()
        if out is None:  # pragma: no cover
            raise AppError("RES_404_SETTLEMENT_NOT_FOUND", "Not found.", status_code=404)
        return out

    async def simulate_transfer(self, principal: Principal, match_id: uuid.UUID) -> dict[str, Any]:
        """Dev only (ADR-037): pretend I made my bank transfer of amount + fee into escrow.

        The pretend bank then sends its signed "verified" message through the normal pipeline;
        nothing here sets FUNDED directly.
        """
        if self._bank is None:  # pragma: no cover - the route exists only with the bank
            raise AppError("SYS_503_SERVICE_UNAVAILABLE", "Not available.", status_code=503)
        settlement = await self._for_party(principal, match_id)
        mine = await self._db.scalar(
            select(SettlementLeg).where(
                SettlementLeg.settlement_id == settlement.id,
                SettlementLeg.funder_user_id == principal.user_id,
            )
        )
        if (
            mine is None
            or settlement.phase != "AWAITING_FUNDING"
            or mine.state != "ESCROW_PROVISIONED"
        ):
            await self._db.rollback()
            raise AppError(
                "RES_409_INVALID_SETTLEMENT_STATE",
                "There is nothing to pay into escrow for this deal right now.",
                status_code=status.HTTP_409_CONFLICT,
            )
        leg_id, total = mine.leg_id, mine.amount_minor + mine.fee_minor
        await self._db.rollback()
        self._bank.simulate_pay_in(leg_id, total)
        await self._bank.deliver(self.ingest)
        await self.dispatch_due()
        await self._bank.deliver(self.ingest)
        return await self.view(principal, match_id)

    async def tick(self) -> None:
        """One pass of background work: windows, commands, then the pretend bank's messages."""
        await self.expire_funding_windows()
        await self.dispatch_due()
        if self._bank is not None:
            await self._bank.deliver(self.ingest)


async def settlement_view(
    db: AsyncSession, settlement: Settlement, viewer: uuid.UUID, bank: PretendBank | None
) -> dict[str, Any] | None:
    """The escrow steps as one party sees them. Never the other party's identity or accounts."""
    legs = (
        await db.scalars(select(SettlementLeg).where(SettlementLeg.settlement_id == settlement.id))
    ).all()
    mine = next((leg for leg in legs if leg.funder_user_id == viewer), None)
    theirs = next((leg for leg in legs if leg.funder_user_id != viewer), None)
    if mine is None or theirs is None:  # pragma: no cover - callers check the party first
        return None
    instructions = bank.pay_in_instructions(mine.leg_id) if bank is not None else None
    show_pay_in = (
        instructions is not None
        and mine.state == "ESCROW_PROVISIONED"
        and settlement.phase == "AWAITING_FUNDING"
    )
    return {
        "settlement_id": str(settlement.id),
        "phase": settlement.phase,
        "closure_reason": settlement.closure_reason,
        "simulated": bank is not None,
        "funding_deadline": (
            settlement.funding_deadline.isoformat() if settlement.funding_deadline else None
        ),
        "on_hold": (
            await db.scalar(
                select(SettlementHold.id)
                .where(
                    SettlementHold.settlement_id == settlement.id,
                    SettlementHold.closed_at.is_(None),
                )
                .limit(1)
            )
        )
        is not None,
        "you_pay": {
            "leg_id": str(mine.leg_id),
            "currency": mine.currency,
            "amount": money_text(mine.amount_minor, mine.scale),
            "fee": money_text(mine.fee_minor, mine.scale),
            "total": money_text(mine.amount_minor + mine.fee_minor, mine.scale),
            "state": mine.state,
            "pay_in": (
                {
                    "bank_name": instructions.bank_name,
                    "account_name": instructions.account_name,
                    "account_number": instructions.account_number,
                    "reference": instructions.reference,
                }
                if show_pay_in and instructions is not None
                else None
            ),
        },
        "you_receive": {
            "currency": theirs.currency,
            "amount": money_text(theirs.amount_minor, theirs.scale),
            "state": theirs.state,
        },
    }
