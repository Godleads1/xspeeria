"""Customer activity log (ADR-073; owner 2026-10-27: kept 5 years, Super Admin only).

One row per thing a customer did: every signed-in request that changes something (by route), plus
sign-up, sign-in (and failed PINs), PIN reset and fingerprint unlock. Append-only (database
trigger); a row may only be deleted once it is more than 5 years old. Never a PIN, code, full
account number, ID number, BVN, document or message text — only references.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import CHAR, CheckConstraint, DateTime, ForeignKey, Index, SmallInteger, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

__all__ = ["CustomerActivity"]


class CustomerActivity(Base):
    __tablename__ = "customer_activity"
    __table_args__ = (
        CheckConstraint("outcome IN ('done', 'refused', 'failed')", name="outcome_allowed"),
        CheckConstraint(
            "category IN ('account', 'security', 'identity', 'market', 'deal', 'payout', "
            "'dispute', 'other')",
            name="category_allowed",
        ),
        Index("ix_customer_activity_user_at", "user_id", "at"),
        Index("ix_customer_activity_match", "match_id"),
        Index("ix_customer_activity_offer", "offer_id"),
        Index("ix_customer_activity_at", "at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    action: Mapped[str] = mapped_column(String(40), nullable=False)
    category: Mapped[str] = mapped_column(String(12), nullable=False)
    outcome: Mapped[str] = mapped_column(String(8), nullable=False)
    #: The route template and answer, for request-based entries.
    route: Mapped[str | None] = mapped_column(String(120))
    method: Mapped[str | None] = mapped_column(String(8))
    status: Mapped[int | None] = mapped_column(SmallInteger)
    match_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    offer_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    #: Another record the action was about (a dispute, payout account, session, check).
    ref_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    #: Small, safe facts only (e.g. {"how": "face"}).
    detail: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    #: The app or browser, shortened; the country when the hosting provides it.
    device: Mapped[str | None] = mapped_column(String(120))
    country: Mapped[str | None] = mapped_column(CHAR(2))
    request_id: Mapped[str | None] = mapped_column(String(64))
