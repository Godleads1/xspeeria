"""Marketplace records — Milestone 4.1C (ADR-028, ADR-029).

An ``Offer`` is a record of what a user is willing to exchange: **information, not money**.
Amounts are exact integer minor units bound to ``scale`` and ``currency_def_version`` (S4-1),
and the composite foreign key ties them to a permanent currency definition (CD3), so the
meaning of a stored amount can never change underneath it.

``IdempotencyRecord`` remembers a request so a retried publish or acceptance is answered, not
repeated.

``Match`` (Milestone 4.1D, ADR-031) is one accepted allocation of one Offer by one counterparty:
a record of who agreed to take how much at what rate. It is information, not money; no funds
move when it is created.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    CHAR,
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Identity,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    String,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.money import CURRENCY_DEF_VERSION_LENGTH

__all__ = ["ACTIVE_STATUSES", "OFFER_STATUSES", "IdempotencyRecord", "Match", "Offer"]

#: Contract (HUMAN-APPROVED 2026-08-25). `expired` is unused: offers do not expire (ADR-029).
OFFER_STATUSES = ("open", "partially_matched", "fully_matched", "withdrawn", "cancelled", "expired")
#: Listed and acceptable ("marketplace-active"), subject to the rate ceiling.
ACTIVE_STATUSES = ("open", "partially_matched")


class Offer(Base):
    __tablename__ = "offers"
    __table_args__ = (
        CheckConstraint("source_amount_minor > 0", name="source_amount_positive"),
        CheckConstraint(
            "matched_amount_minor >= 0 AND matched_amount_minor <= source_amount_minor",
            name="matched_within_source",
        ),
        CheckConstraint("desired_rate > 0", name="rate_positive"),
        CheckConstraint("source_currency <> target_currency", name="currencies_differ"),
        CheckConstraint("source_currency ~ '^[A-Z]{3}$'", name="source_currency_format"),
        CheckConstraint("target_currency ~ '^[A-Z]{3}$'", name="target_currency_format"),
        CheckConstraint(
            "status IN ('open', 'partially_matched', 'fully_matched', 'withdrawn', "
            "'cancelled', 'expired')",
            name="status_allowed",
        ),
        CheckConstraint("version >= 1", name="version_positive"),
        CheckConstraint(
            "(status = 'withdrawn') = (withdrawn_at IS NOT NULL)", name="withdrawn_iff_at"
        ),
        # The amount's meaning is pinned to a permanent currency definition (S4-1, CD3).
        ForeignKeyConstraint(
            ["source_currency", "currency_def_version", "scale"],
            [
                "currency_definitions.currency",
                "currency_definitions.currency_def_version",
                "currency_definitions.scale",
            ],
            name="fk_offers_source_currency_definition",
            ondelete="RESTRICT",
        ),
        Index("ix_offers_listing", "source_currency", "target_currency", "status", "desired_rate"),
        Index("ix_offers_user_id", "user_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    source_currency: Mapped[str] = mapped_column(CHAR(3), nullable=False)
    target_currency: Mapped[str] = mapped_column(CHAR(3), nullable=False)
    source_amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    #: Maintained under the acceptance row lock, never recomputed from history (contract).
    matched_amount_minor: Mapped[int] = mapped_column(
        BigInteger, nullable=False, server_default=text("0")
    )
    scale: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    currency_def_version: Mapped[str] = mapped_column(
        String(CURRENCY_DEF_VERSION_LENGTH), nullable=False
    )
    #: NGN per 1 unit of the foreign currency (ADR-020). Not an amount.
    desired_rate: Mapped[Decimal] = mapped_column(Numeric(12, 6), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    #: Optimistic concurrency (TDS §9): every change bumps it.
    version: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("1"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    rate_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    withdrawn_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class IdempotencyRecord(Base):
    """One remembered request (ADR-029: 24 hours). Bound to user + operation + key."""

    __tablename__ = "idempotency_records"
    __table_args__ = (
        CheckConstraint("request_hash ~ '^[0-9a-f]{64}$'", name="request_hash_format"),
        CheckConstraint("expires_at > created_at", name="expires_after_created"),
        CheckConstraint("response_status BETWEEN 200 AND 599", name="status_range"),
        Index(
            "uq_idempotency_records_user_operation_key",
            "user_id",
            "operation",
            "idempotency_key",
            unique=True,
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    operation: Mapped[str] = mapped_column(String(32), nullable=False)
    idempotency_key: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    request_hash: Mapped[str] = mapped_column(CHAR(64), nullable=False)
    response_status: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    response_body: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class Match(Base):
    """One accepted allocation (data dictionary "Match", ADR-031).

    Rows are immutable to the running app: it may only SELECT and INSERT (migration 0007).
    Preparation/funding fields, Transaction and Settlement come with later milestones
    (product owner, 2026-10-18: "Match only").
    """

    __tablename__ = "matches"
    __table_args__ = (
        CheckConstraint("allocated_amount_minor > 0", name="allocated_amount_positive"),
        CheckConstraint("agreed_rate > 0", name="agreed_rate_positive"),
        CheckConstraint("currency ~ '^[A-Z]{3}$'", name="currency_format"),
        ForeignKeyConstraint(
            ["currency", "currency_def_version", "scale"],
            [
                "currency_definitions.currency",
                "currency_definitions.currency_def_version",
                "currency_definitions.scale",
            ],
            name="fk_matches_currency_definition",
            ondelete="RESTRICT",
        ),
        CheckConstraint(
            "preparation_state IN ('awaiting_payout_accounts', 'funding_ready', 'expired')",
            name="preparation_state_allowed",
        ),
        CheckConstraint(
            "(preparation_state = 'awaiting_payout_accounts') = (preparation_ended_at IS NULL)",
            name="preparation_ended_iff_not_awaiting",
        ),
        CheckConstraint(
            "(preparation_state = 'expired') = (termination_cause IS NOT NULL)",
            name="expired_iff_cause",
        ),
        Index("ix_matches_offer_order", "offer_id", "accepted_at", "server_order_key"),
        Index("ix_matches_preparation_due", "preparation_state", "preparation_deadline"),
        Index("ix_matches_counterparty_user_id", "counterparty_user_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    offer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("offers.id", ondelete="RESTRICT"), nullable=False
    )
    counterparty_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    allocated_amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    currency: Mapped[str] = mapped_column(CHAR(3), nullable=False)
    scale: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    currency_def_version: Mapped[str] = mapped_column(
        String(CURRENCY_DEF_VERSION_LENGTH), nullable=False
    )
    #: DECISION S4-2: server-generated, unique, never client-supplied. Gaps are fine.
    server_order_key: Mapped[int] = mapped_column(
        BigInteger, Identity(always=True), nullable=False, unique=True
    )
    #: NGN per 1 unit of the foreign currency, locked at acceptance; never re-priced.
    agreed_rate: Mapped[Decimal] = mapped_column(Numeric(12, 6), nullable=False)
    #: Trusted server time; with server_order_key, the acceptance order.
    accepted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    #: ADR-035 (PROPOSED literals): awaiting_payout_accounts → funding_ready | expired.
    preparation_state: Mapped[str] = mapped_column(
        String(32), nullable=False, server_default=text("'awaiting_payout_accounts'")
    )
    #: accepted_at + 30 minutes (product owner, 2026-10-18).
    preparation_deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    preparation_ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    #: The attributable cause when preparation ends without readiness (ADR-001 §14.5).
    termination_cause: Mapped[str | None] = mapped_column(String(64))
