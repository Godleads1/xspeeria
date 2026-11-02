"""Pause all deals — the emergency switch (SEC-039, ADR-075; owner 2026-11-02).

One row per pause, kept forever as the record of when deals were stopped, by whom and why, and
how much time each open deal was given back. At most one pause is open at a time.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

__all__ = ["DealPause"]


class DealPause(Base):
    __tablename__ = "deal_pauses"
    __table_args__ = (
        CheckConstraint("char_length(reason) BETWEEN 5 AND 500", name="reason_length"),
        CheckConstraint(
            "(ended_at IS NULL) = (ended_by IS NULL) AND (ended_at IS NULL) = (end_reason IS NULL)",
            name="ended_complete",
        ),
        CheckConstraint(
            "end_reason IS NULL OR char_length(end_reason) BETWEEN 5 AND 500",
            name="end_reason_length",
        ),
        CheckConstraint("ended_at IS NULL OR ended_at >= started_at", name="ends_after"),
        Index(
            "uq_deal_pauses_one_open",
            text("(true)"),
            unique=True,
            postgresql_where=text("ended_at IS NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    started_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("staff_accounts.id", ondelete="RESTRICT"), nullable=False
    )
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ended_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("staff_accounts.id", ondelete="RESTRICT")
    )
    end_reason: Mapped[str | None] = mapped_column(Text)
    #: On resume: how much time was given back and to how many windows.
    details: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'")
    )
