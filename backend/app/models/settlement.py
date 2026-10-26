"""Escrow settlement records — Milestone 4.1F (ADR-001, ADR-002, ADR-037).

Xspeeria never holds money. A partner bank in each country holds the escrow; these tables record
Xspeeria's *decisions* (``Settlement.phase``) and the partner-confirmed *facts* about each leg
(``SettlementLeg.state``). No table here is a balance, wallet or cash ledger (ADR-002 L-9).

- ``Transaction``: one per Match (match_id UNIQUE). Its status is a read-only projection of the
  Settlement's phase, so no status column exists that could be written.
- ``Settlement`` / ``SettlementLeg``: projections of ``settlement_events`` (ADR-002 §2).
- ``SettlementEvent``: append-only root of accepted truth; the app role may only INSERT/SELECT.
- ``WebhookReceipt``: every partner message, with a verdict. Evidence only, append-only.
- ``PendingEvent``: valid evidence waiting for a prerequisite (never discarded).
- ``SettlementHold`` / ``ReconciliationException``: separate concerns that never rewrite state.
- ``OutboxMessage``: commands to partners, sent after commit with a deterministic key.
- ``PayoutExecution``: one payout instruction per chosen account (ADR-001 §14.7). Leg state is
  never derived from these children (data dictionary: open aggregate-semantics blocker).

**Simulation only** (product owner, 2026-10-19): the only partner is a pretend bank on a
developer's computer. Real partners need legal and compliance sign-off (ADR-001 §12).
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    CHAR,
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    LargeBinary,
    SmallInteger,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.money import CURRENCY_DEF_VERSION_LENGTH

__all__ = [
    "OutboxMessage",
    "Partner",
    "PayoutExecution",
    "PendingEvent",
    "ReconciliationException",
    "Settlement",
    "SettlementEvent",
    "SettlementHold",
    "SettlementLeg",
    "Transaction",
    "WebhookReceipt",
]

_PHASES = (
    "'INITIALIZING', 'AWAITING_FUNDING', 'RELEASING', 'COMPLETED', 'UNWINDING', "
    "'CLOSED_UNWOUND', 'RECOVERY_REQUIRED', 'CLOSED_RECOVERED', 'CLOSED_WITH_LOSS', 'CANCELLED'"
)
_LEG_STATES = (
    "'PENDING', 'ESCROW_PROVISIONED', 'FUNDED', 'RELEASE_SENT', 'PAID_OUT', 'RETURN_SENT', "
    "'RETURNED', 'PROVISION_FAILED', 'PAYOUT_FAILED'"
)


def _money_fk(table: str, cols: tuple[str, str, str]) -> ForeignKeyConstraint:
    return ForeignKeyConstraint(
        list(cols),
        [
            "currency_definitions.currency",
            "currency_definitions.currency_def_version",
            "currency_definitions.scale",
        ],
        name=f"fk_{table}_currency_definition",
        ondelete="RESTRICT",
    )


class Partner(Base):
    """A regulated bank partner for one jurisdiction and currency (adapter routing)."""

    __tablename__ = "partners"
    __table_args__ = (
        CheckConstraint("jurisdiction ~ '^[A-Z]{2}$'", name="jurisdiction_format"),
        CheckConstraint("currency ~ '^[A-Z]{3}$'", name="currency_format"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    code: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    jurisdiction: Mapped[str] = mapped_column(CHAR(2), nullable=False)
    currency: Mapped[str] = mapped_column(CHAR(3), nullable=False)
    #: True for the pretend bank. A simulated partner is never used outside APP_ENV=local.
    is_simulated: Mapped[bool] = mapped_column(Boolean, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    match_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("matches.id", ondelete="RESTRICT"),
        nullable=False,
        unique=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class Settlement(Base):
    __tablename__ = "settlements"
    __table_args__ = (
        CheckConstraint(f"phase IN ({_PHASES})", name="phase_allowed"),
        CheckConstraint(
            "closure_reason IS NULL OR closure_reason IN ('TIMEOUT', 'REMATCH', "
            "'PARTY_CANCELLED', 'PROVISION_FAILED', 'RECOVERED', 'LOSS_RECOGNIZED')",
            name="closure_reason_allowed",
        ),
        CheckConstraint(
            "phase NOT IN ('CANCELLED', 'CLOSED_UNWOUND', 'CLOSED_RECOVERED', 'CLOSED_WITH_LOSS') "
            "OR closure_reason IS NOT NULL",
            name="closure_reason_on_close",
        ),
        CheckConstraint(
            "phase NOT IN ('RELEASING', 'COMPLETED') OR release_authorized_at IS NOT NULL",
            name="release_needs_authorization",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    transaction_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("transactions.id", ondelete="RESTRICT"),
        nullable=False,
        unique=True,
    )
    phase: Mapped[str] = mapped_column(String(24), nullable=False)
    #: The release decision. Set once (database trigger); never cleared.
    release_authorized_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    closure_reason: Mapped[str | None] = mapped_column(String(24))
    #: ADR-021 §2: 5 minutes from both escrows being open. Null until then.
    funding_deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    #: ADR-059 Decision 4: the taker's one extra 5 minutes, set once (DB guard).
    funding_extended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rematched_to: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("settlements.id", ondelete="RESTRICT")
    )
    compensates_settlement_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("settlements.id", ondelete="RESTRICT")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class SettlementLeg(Base):
    __tablename__ = "settlement_legs"
    __table_args__ = (
        CheckConstraint(f"state IN ({_LEG_STATES})", name="state_allowed"),
        CheckConstraint("party_role IN ('REQUESTER', 'ACCEPTER')", name="party_role_allowed"),
        CheckConstraint("amount_minor > 0", name="amount_positive"),
        CheckConstraint("fee_minor >= 0", name="fee_not_negative"),
        CheckConstraint(
            "source_jurisdiction = destination_jurisdiction", name="domestic_only"
        ),  # F-8
        CheckConstraint("(state = 'FUNDED') <= (funded_at IS NOT NULL)", name="funded_has_time"),
        CheckConstraint("(state = 'PAID_OUT') = (paid_out_at IS NOT NULL)", name="paid_out_iff_at"),
        CheckConstraint("(state = 'RETURNED') = (returned_at IS NOT NULL)", name="returned_iff_at"),
        Index("uq_settlement_legs_settlement_role", "settlement_id", "party_role", unique=True),
        _money_fk("settlement_legs", ("currency", "currency_def_version", "scale")),
    )

    leg_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    settlement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("settlements.id", ondelete="RESTRICT"), nullable=False
    )
    #: REQUESTER = the offer's owner; ACCEPTER = the taker. The role's user funds this leg.
    party_role: Mapped[str] = mapped_column(String(12), nullable=False)
    #: Who pays into this escrow (server-set from the Match; never from a request).
    funder_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    #: Who is paid out from this escrow (the other party).
    payee_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    state: Mapped[str] = mapped_column(String(20), nullable=False)
    currency: Mapped[str] = mapped_column(CHAR(3), nullable=False)
    #: The amount paid out from this escrow (= Σ PayoutExecution.amount_minor).
    amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    #: PROPOSED (ADR-037): the funder's 1% fee, paid in on top (ADR-021 §1). Refunded with
    #: the amount on unwind (product owner, 2026-10-19).
    fee_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    scale: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    currency_def_version: Mapped[str] = mapped_column(
        String(CURRENCY_DEF_VERSION_LENGTH), nullable=False
    )
    source_jurisdiction: Mapped[str] = mapped_column(CHAR(2), nullable=False)
    destination_jurisdiction: Mapped[str] = mapped_column(CHAR(2), nullable=False)
    partner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("partners.id", ondelete="RESTRICT"), nullable=False
    )
    #: Partner-held escrow reference; never a raw account number.
    escrow_account_ref: Mapped[str | None] = mapped_column(String(255))
    #: All of the payee's chosen accounts were bank-confirmed (gate for release).
    beneficiary_validated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    funded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    paid_out_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    returned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class PayoutExecution(Base):
    __tablename__ = "payout_executions"
    __table_args__ = (
        CheckConstraint("amount_minor > 0", name="amount_positive"),
        _money_fk("payout_executions", ("currency", "currency_def_version", "scale")),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    leg_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("settlement_legs.leg_id", ondelete="RESTRICT"),
        nullable=False,
    )
    beneficiary_account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("beneficiaries.id", ondelete="RESTRICT"), nullable=False
    )
    amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    currency: Mapped[str] = mapped_column(CHAR(3), nullable=False)
    scale: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    currency_def_version: Mapped[str] = mapped_column(
        String(CURRENCY_DEF_VERSION_LENGTH), nullable=False
    )


class SettlementEvent(Base):
    """Append-only. Event types are Appendix D §7.2's list."""

    __tablename__ = "settlement_events"
    __table_args__ = (
        # Appendix D §8: inbound dedup key, enforced by the database.
        Index(
            "uq_settlement_events_partner_event",
            "settlement_id",
            "leg_id",
            "event_type",
            "provider_event_id",
            unique=True,
            postgresql_where=text("provider_event_id IS NOT NULL"),
        ),
        Index("ix_settlement_events_settlement", "settlement_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    settlement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("settlements.id", ondelete="RESTRICT"), nullable=False
    )
    leg_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("settlement_legs.leg_id", ondelete="RESTRICT")
    )
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    #: Never secrets or raw account data.
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    provider_event_id: Mapped[str | None] = mapped_column(String(255))
    receipt_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("webhook_receipts.id", ondelete="RESTRICT")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class WebhookReceipt(Base):
    """Every partner message received, with its verdict. Evidence only; append-only."""

    __tablename__ = "webhook_receipts"
    __table_args__ = (
        CheckConstraint(
            "verdict IN ('ACCEPTED', 'DUPLICATE', 'SIGNATURE_INVALID', 'REPLAY_SUSPECTED', "
            "'SCHEMA_INVALID', 'UNRESOLVABLE_LEG', 'QUARANTINED', 'CONTRADICTORY')",
            name="verdict_allowed",
        ),
        Index("ix_webhook_receipts_partner_event", "partner_id", "provider_event_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    #: Null only when the sender could not be identified (then it is evidence of a forgery).
    provider_event_id: Mapped[str | None] = mapped_column(String(255))
    partner_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("partners.id", ondelete="RESTRICT")
    )
    raw_body: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    verdict: Mapped[str] = mapped_column(String(20), nullable=False)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class PendingEvent(Base):
    __tablename__ = "pending_events"
    __table_args__ = (
        CheckConstraint("status IN ('PENDING', 'PROMOTED', 'ESCALATED')", name="status_allowed"),
        Index("ix_pending_events_open", "settlement_id", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    receipt_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("webhook_receipts.id", ondelete="RESTRICT"), nullable=False
    )
    settlement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("settlements.id", ondelete="RESTRICT"), nullable=False
    )
    leg_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("settlement_legs.leg_id", ondelete="RESTRICT")
    )
    missing_prerequisite: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(12), nullable=False)
    quarantined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class SettlementHold(Base):
    __tablename__ = "settlement_holds"
    __table_args__ = (
        CheckConstraint(
            "type IN ('COMPLIANCE', 'DISPUTE', 'RECONCILIATION', 'DISPATCH_FAILURE', 'RISK')",
            name="type_allowed",
        ),
        Index("ix_settlement_holds_open", "settlement_id", "closed_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    settlement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("settlements.id", ondelete="RESTRICT"), nullable=False
    )
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    blocks_progression: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("true")
    )
    reason: Mapped[str | None] = mapped_column(String(200))
    opened_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT")
    )
    closed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT")
    )
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ReconciliationException(Base):
    __tablename__ = "reconciliation_exceptions"
    __table_args__ = (
        CheckConstraint(
            "type IN ('MISSING_IN_PARTNER', 'MISSING_IN_XSPEERIA', 'AMOUNT_MISMATCH', "
            "'STATE_MISMATCH')",
            name="type_allowed",
        ),
        CheckConstraint("status IN ('OPEN', 'UNDER_REVIEW', 'RESOLVED')", name="status_allowed"),
        CheckConstraint(
            "(expected_amount_minor IS NULL AND observed_amount_minor IS NULL) = "
            "(currency IS NULL AND scale IS NULL AND currency_def_version IS NULL)",
            name="amount_binding",
        ),  # DECISION 4.1A-F4
        CheckConstraint(
            "status <> 'RESOLVED' OR resolution IS NOT NULL", name="resolution_required"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    settlement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("settlements.id", ondelete="RESTRICT"), nullable=False
    )
    leg_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("settlement_legs.leg_id", ondelete="RESTRICT")
    )
    receipt_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("webhook_receipts.id", ondelete="RESTRICT")
    )
    type: Mapped[str] = mapped_column(String(24), nullable=False)
    expected_amount_minor: Mapped[int | None] = mapped_column(BigInteger)
    observed_amount_minor: Mapped[int | None] = mapped_column(BigInteger)
    currency: Mapped[str | None] = mapped_column(CHAR(3))
    scale: Mapped[int | None] = mapped_column(SmallInteger)
    currency_def_version: Mapped[str | None] = mapped_column(String(CURRENCY_DEF_VERSION_LENGTH))
    detail: Mapped[str] = mapped_column(String(300), nullable=False)
    status: Mapped[str] = mapped_column(String(14), nullable=False)
    resolution: Mapped[str | None] = mapped_column(Text)
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class OutboxMessage(Base):
    """A command to a partner, sent after the deciding transaction commits (ADR-001 §6)."""

    __tablename__ = "outbox_messages"
    __table_args__ = (
        CheckConstraint(
            "operation IN ('PROVISION', 'RELEASE', 'RETURN')", name="operation_allowed"
        ),
        CheckConstraint("status IN ('PENDING', 'SENT', 'FAILED')", name="status_allowed"),
        Index("uq_outbox_messages_idempotency_key", "idempotency_key", unique=True),
        Index("ix_outbox_messages_due", "status", "next_attempt_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    settlement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("settlements.id", ondelete="RESTRICT"), nullable=False
    )
    leg_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("settlement_legs.leg_id", ondelete="RESTRICT"),
        nullable=False,
    )
    operation: Mapped[str] = mapped_column(String(12), nullable=False)
    #: sha256(settlement_id | leg_id | operation | decision time) — identical on every retry.
    idempotency_key: Mapped[str] = mapped_column(CHAR(64), nullable=False)
    status: Mapped[str] = mapped_column(String(8), nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    next_attempt_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_error: Mapped[str | None] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
