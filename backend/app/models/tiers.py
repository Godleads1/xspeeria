"""Higher-tier checks (ADR-058 Tier 2 and Tier 3).

Never stores the BVN number or the uploaded proof-of-address document — only the result.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

__all__ = ["TIER_CHECK_KINDS", "TierCheck"]

TIER_CHECK_KINDS = ("bvn", "address", "proof_of_address", "source_of_funds")


class TierCheck(Base):
    __tablename__ = "tier_checks"
    __table_args__ = (
        CheckConstraint(
            "kind IN ('bvn', 'address', 'proof_of_address', 'source_of_funds')",
            name="kind_allowed",
        ),
        CheckConstraint("status IN ('approved', 'declined', 'in_review')", name="status_allowed"),
        Index(
            "uq_tier_checks_one_approved_per_kind",
            "user_id",
            "kind",
            unique=True,
            postgresql_where=text("status = 'approved'"),
        ),
        Index("ix_tier_checks_user", "user_id", "kind", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(12), nullable=False)
    #: Provider outcome or warning codes (never personal data).
    reason: Mapped[str | None] = mapped_column(String(128))
    provider_request_id: Mapped[str | None] = mapped_column(String(64))
    #: address: the address as given; source_of_funds: the answer. Nothing else.
    detail: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
