"""Staff review of identity checks Xspeeria holds — ADR-069 (owner 2026-10-27: two people).

One row is one approval recommendation: pending → confirmed (the case is approved) or declined.
The confirmer is never the recommender (CHECK); a row is decided once (trigger).
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

__all__ = ["KycReview"]


class KycReview(Base):
    __tablename__ = "kyc_reviews"
    __table_args__ = (
        CheckConstraint("status IN ('pending', 'confirmed', 'declined')", name="status_allowed"),
        CheckConstraint("char_length(btrim(reason)) BETWEEN 5 AND 1000", name="reason_length"),
        CheckConstraint(
            "decision_note IS NULL OR char_length(decision_note) BETWEEN 1 AND 1000",
            name="note_length",
        ),
        CheckConstraint("decided_by IS NULL OR decided_by <> recommended_by", name="second_person"),
        CheckConstraint(
            "(status = 'pending') = (decided_by IS NULL AND decided_at IS NULL)",
            name="decided_has_who_and_when",
        ),
        CheckConstraint(
            "status <> 'declined' OR decision_note IS NOT NULL", name="decline_has_note"
        ),
        Index(
            "uq_kyc_reviews_one_pending",
            "kyc_case_id",
            unique=True,
            postgresql_where=text("status = 'pending'"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    kyc_case_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("kyc_cases.id", ondelete="RESTRICT"), nullable=False
    )
    status: Mapped[str] = mapped_column(
        String(10), nullable=False, server_default=text("'pending'")
    )
    #: Why the recommender thinks the case should be approved (internal; staff only).
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    recommended_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("staff_accounts.id", ondelete="RESTRICT"), nullable=False
    )
    recommended_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    decided_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("staff_accounts.id", ondelete="RESTRICT")
    )
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    decision_note: Mapped[str | None] = mapped_column(Text)
