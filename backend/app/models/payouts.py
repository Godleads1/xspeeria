"""Payout accounts and per-deal payout choices — Milestone 4.1E (ADR-035).

``Beneficiary`` (data dictionary "BeneficiaryAccount", persisted as ``beneficiaries``) is a
user's own account the partner bank pays into from escrow. The account number is never stored
in plain text: it is sealed with AES-256-GCM bound to the row's id, and only the last 4 digits
are kept readable. ``account_ref`` is a local placeholder until the partner bank issues its
own reference token.

``MatchPayoutSelection`` records which of their accounts a party chose for one deal and how
much each gets; the amounts add up exactly to what that party receives (ADR-021 §3).
Information only: no money moves here.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    CHAR,
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    LargeBinary,
    SmallInteger,
    String,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.money import CURRENCY_DEF_VERSION_LENGTH

__all__ = ["VALIDATION_STATES", "Beneficiary", "MatchPayoutSelection"]

#: Data dictionary: must express pending, validated, failed/rejected, invalidated.
VALIDATION_STATES = ("pending", "validated", "failed", "invalidated")


class Beneficiary(Base):
    __tablename__ = "beneficiaries"
    __table_args__ = (
        CheckConstraint("currency ~ '^[A-Z]{3}$'", name="currency_format"),
        # An IBAN can end in letters (ADR-099).
        CheckConstraint("account_last4 ~ '^[0-9A-Z]{4}$'", name="last4_format"),
        CheckConstraint(
            "validation_state IN ('pending', 'validated', 'failed', 'invalidated')",
            name="validation_state_allowed",
        ),
        CheckConstraint(
            "(validation_state = 'validated') = (validated_at IS NOT NULL)",
            name="validated_iff_at",
        ),
        Index("ix_beneficiaries_user_id", "user_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    currency: Mapped[str] = mapped_column(CHAR(3), nullable=False)
    #: Tokenised reference; a local placeholder until the partner bank issues one. Never the
    #: account number.
    account_ref: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    #: AES-256-GCM, bound to this row's id. Never logged or returned.
    account_number_sealed: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    account_last4: Mapped[str] = mapped_column(CHAR(4), nullable=False)
    bank_name: Mapped[str] = mapped_column(String(60), nullable=False)
    #: USD routing number or GBP sort code (not secret).
    bank_code: Mapped[str | None] = mapped_column(String(16))
    account_type: Mapped[str | None] = mapped_column(String(16))
    #: The holder's name as the bank's name check returned it.
    account_name: Mapped[str | None] = mapped_column(String(120))
    validation_state: Mapped[str] = mapped_column(String(16), nullable=False)
    validated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    #: ADR-008/022: a new account is paid only after a 24-hour hold.
    payout_hold_until: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    #: Removed from the user's list; kept for deals that already chose it.
    removed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class MatchPayoutSelection(Base):
    __tablename__ = "match_payout_selections"
    __table_args__ = (
        CheckConstraint("amount_minor > 0", name="amount_positive"),
        CheckConstraint("currency ~ '^[A-Z]{3}$'", name="currency_format"),
        ForeignKeyConstraint(
            ["currency", "currency_def_version", "scale"],
            [
                "currency_definitions.currency",
                "currency_definitions.currency_def_version",
                "currency_definitions.scale",
            ],
            name="fk_match_payout_selections_currency_definition",
            ondelete="RESTRICT",
        ),
        Index(
            "uq_match_payout_selections_match_beneficiary",
            "match_id",
            "beneficiary_id",
            unique=True,
        ),
        Index("ix_match_payout_selections_match_user", "match_id", "user_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    match_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("matches.id", ondelete="RESTRICT"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    beneficiary_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("beneficiaries.id", ondelete="RESTRICT"), nullable=False
    )
    amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    currency: Mapped[str] = mapped_column(CHAR(3), nullable=False)
    scale: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    currency_def_version: Mapped[str] = mapped_column(
        String(CURRENCY_DEF_VERSION_LENGTH), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
