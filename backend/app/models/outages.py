"""Service outage notices — ADR-066 (owner 2026-10-26: "Show a notice only").

Staff record an outage and the words every signed-in app user sees in a banner until it is
resolved. A notice blocks nothing. Rows are the outage history: never deleted.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

__all__ = ["OUTAGE_SEVERITIES", "OUTAGE_STATUSES", "ServiceOutage"]

OUTAGE_SEVERITIES = ("low", "medium", "high")
OUTAGE_STATUSES = ("open", "in_progress", "resolved")


class ServiceOutage(Base):
    __tablename__ = "service_outages"
    __table_args__ = (
        CheckConstraint("char_length(btrim(service)) BETWEEN 2 AND 60", name="service_length"),
        CheckConstraint("char_length(btrim(message)) BETWEEN 5 AND 300", name="message_length"),
        CheckConstraint("severity IN ('low', 'medium', 'high')", name="severity_allowed"),
        CheckConstraint("status IN ('open', 'in_progress', 'resolved')", name="status_allowed"),
        CheckConstraint(
            "(status = 'resolved') = (resolved_at IS NOT NULL)", name="resolved_iff_at"
        ),
        CheckConstraint(
            "expected_end_at IS NULL OR expected_end_at > started_at", name="end_after_start"
        ),
        CheckConstraint(
            "resolved_at IS NULL OR resolved_at >= started_at", name="resolved_after_start"
        ),
        Index("ix_service_outages_status_started", "status", "started_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    service: Mapped[str] = mapped_column(String(60), nullable=False)
    #: What app users read in the banner (staff's words; shown as written).
    message: Mapped[str] = mapped_column(Text, nullable=False)
    severity: Mapped[str] = mapped_column(String(8), nullable=False)
    status: Mapped[str] = mapped_column(String(12), nullable=False, server_default=text("'open'"))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expected_end_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("staff_accounts.id", ondelete="RESTRICT"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
