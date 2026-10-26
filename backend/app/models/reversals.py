"""Reversals — ADR-065 (owner 2026-10-26: "Return escrow to payer"; ADR-051 decision 4).

A staff member asks for a deal's escrow to go back to whoever paid it in; a *different* staff
member with ``reversals.approve`` approves or rejects. **No money lives here**: approving moves
the settlement to ``UNWINDING`` and the partner bank returns each funded escrow in full (fee
included), exactly as when the funding window runs out. While a request is pending, a
``REVERSAL`` settlement hold stops the payout.

Decided once: a database trigger refuses any change after approval or rejection, and a CHECK
refuses an approver who is also the requester.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

__all__ = ["REVERSAL_STATUSES", "Reversal"]

REVERSAL_STATUSES = ("pending", "approved", "rejected")


class Reversal(Base):
    __tablename__ = "reversals"
    __table_args__ = (
        CheckConstraint("status IN ('pending', 'approved', 'rejected')", name="status_allowed"),
        CheckConstraint("char_length(btrim(reason)) BETWEEN 3 AND 500", name="reason_length"),
        CheckConstraint(
            "decision_note IS NULL OR char_length(decision_note) BETWEEN 1 AND 500",
            name="note_length",
        ),
        CheckConstraint("decided_by IS NULL OR decided_by <> requested_by", name="not_own_request"),
        CheckConstraint(
            "(status = 'pending') = (decided_by IS NULL AND decided_at IS NULL)",
            name="decided_has_who_and_when",
        ),
        CheckConstraint(
            "status <> 'rejected' OR decision_note IS NOT NULL", name="rejection_has_note"
        ),
        Index(
            "uq_reversals_one_pending",
            "settlement_id",
            unique=True,
            postgresql_where=text("status = 'pending'"),
        ),
        Index("ix_reversals_requested_at", "requested_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    dispute_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("disputes.id", ondelete="RESTRICT"), nullable=False
    )
    settlement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("settlements.id", ondelete="RESTRICT"), nullable=False
    )
    #: The REVERSAL hold that pauses the payout while the request waits.
    hold_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("settlement_holds.id", ondelete="RESTRICT"),
        nullable=False,
        unique=True,
    )
    status: Mapped[str] = mapped_column(
        String(10), nullable=False, server_default=text("'pending'")
    )
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    requested_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("staff_accounts.id", ondelete="RESTRICT"), nullable=False
    )
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    decided_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("staff_accounts.id", ondelete="RESTRICT")
    )
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    decision_note: Mapped[str | None] = mapped_column(Text)
