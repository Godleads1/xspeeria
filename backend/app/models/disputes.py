"""Disputes and support cases — ADR-057 (data dictionary "Dispute"; contract §3.8; ADR-050).

**No money lives here.** A dispute on a deal pauses that deal's escrow through a
``settlement_holds`` row of type ``DISPUTE`` (data dictionary); it never changes a settlement
phase, a leg or an amount. A support case (ADR-050) has no deal and pauses nothing.

Messages are append-only: the app role may insert and read them, never change or delete.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

__all__ = [
    "DISPUTE_OUTCOMES",
    "DISPUTE_REASONS",
    "DISPUTE_STATUSES",
    "Dispute",
    "DisputeMessage",
]

#: Data dictionary Dispute.reason.
DISPUTE_REASONS = ("funds_not_received", "wrong_amount", "counterparty_unresponsive", "other")
DISPUTE_STATUSES = ("open", "under_review", "resolved")
#: Contract §3.8 (set by staff on resolution; admin console, ADR-051).
DISPUTE_OUTCOMES = ("favor_initiator", "favor_counterparty", "split", "no_fault")


def _in(values: tuple[str, ...]) -> str:
    return ", ".join(f"'{v}'" for v in values)


class Dispute(Base):
    __tablename__ = "disputes"
    __table_args__ = (
        CheckConstraint("kind IN ('dispute', 'support')", name="kind_allowed"),
        CheckConstraint(f"reason IN ({_in(DISPUTE_REASONS)})", name="reason_allowed"),
        CheckConstraint(f"status IN ({_in(DISPUTE_STATUSES)})", name="status_allowed"),
        CheckConstraint(
            f"outcome IS NULL OR outcome IN ({_in(DISPUTE_OUTCOMES)})", name="outcome_allowed"
        ),
        # A dispute is on a deal whose escrow has started; a support case has no deal.
        CheckConstraint(
            "(kind = 'dispute') = (transaction_id IS NOT NULL)", name="dispute_has_transaction"
        ),
        CheckConstraint("kind = 'dispute' OR hold_id IS NULL", name="support_holds_nothing"),
        CheckConstraint("char_length(description) BETWEEN 1 AND 2000", name="description_length"),
        CheckConstraint(
            "(status = 'resolved') = (resolved_at IS NOT NULL)", name="resolved_iff_at"
        ),
        CheckConstraint("status = 'resolved' OR outcome IS NULL", name="outcome_on_resolve"),
        # Contract: RES_409_DISPUTE_ALREADY_OPEN — one unresolved dispute per transaction.
        Index(
            "uq_disputes_one_open_per_transaction",
            "transaction_id",
            unique=True,
            postgresql_where=text("kind = 'dispute' AND status <> 'resolved'"),
        ),
        Index("ix_disputes_initiator", "initiator_user_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    kind: Mapped[str] = mapped_column(String(8), nullable=False)
    transaction_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("transactions.id", ondelete="RESTRICT")
    )
    initiator_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    reason: Mapped[str] = mapped_column(String(32), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    outcome: Mapped[str | None] = mapped_column(String(24))
    #: The DISPUTE hold that pauses the escrow while this is unresolved.
    hold_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("settlement_holds.id", ondelete="RESTRICT")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class DisputeMessage(Base):
    """Contract "evidence" (message part). Files come with file storage (ADR-057)."""

    __tablename__ = "dispute_messages"
    __table_args__ = (
        CheckConstraint("author_role IN ('user', 'staff')", name="author_role_allowed"),
        CheckConstraint(
            "(author_role = 'user') = (author_user_id IS NOT NULL)", name="user_has_id"
        ),
        CheckConstraint("char_length(body) BETWEEN 1 AND 2000", name="body_length"),
        Index("ix_dispute_messages_dispute", "dispute_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    dispute_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("disputes.id", ondelete="RESTRICT"), nullable=False
    )
    author_role: Mapped[str] = mapped_column(String(8), nullable=False)
    author_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT")
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
