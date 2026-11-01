"""Operations alerts — ADR-074 (owner 2026-11-01: alerts go to Super Admins).

An alert a rule raised about the running system: sign-in attacks, staff permission changes,
unusual deal activity, webhook problems, failing services or jobs. Counts and references only;
never a customer's name, contact details, account number, PIN or code. Never deleted.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

__all__ = ["OpsAlert"]


class OpsAlert(Base):
    __tablename__ = "ops_alerts"
    __table_args__ = (
        CheckConstraint("severity IN ('P1', 'P2', 'P3', 'P4')", name="severity_allowed"),
        CheckConstraint("status IN ('open', 'acknowledged', 'resolved')", name="status_allowed"),
        CheckConstraint("occurrences >= 1", name="occurrences_positive"),
        CheckConstraint("last_seen_at >= first_seen_at", name="seen_in_order"),
        CheckConstraint(
            "(acknowledged_at IS NULL) = (acknowledged_by IS NULL)", name="acknowledged_complete"
        ),
        CheckConstraint(
            "(status = 'resolved') = (resolved_at IS NOT NULL AND resolved_by IS NOT NULL "
            "AND resolution_note IS NOT NULL)",
            name="resolved_complete",
        ),
        CheckConstraint(
            "resolution_note IS NULL OR char_length(resolution_note) BETWEEN 5 AND 1000",
            name="resolution_note_length",
        ),
        Index(
            "uq_ops_alerts_live_rule_subject",
            "rule",
            "subject",
            unique=True,
            postgresql_where=text("status <> 'resolved'"),
        ),
        Index("ix_ops_alerts_rule_subject", "rule", "subject"),
        Index("ix_ops_alerts_status_last_seen", "status", "last_seen_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    rule: Mapped[str] = mapped_column(String(40), nullable=False)
    #: P1 critical … P4 low (Infrastructure Handbook §6.3).
    severity: Mapped[str] = mapped_column(String(2), nullable=False)
    status: Mapped[str] = mapped_column(String(12), nullable=False, server_default=text("'open'"))
    #: What the alert is about, unique per rule while it is live (an API, a job, an audit entry).
    subject: Mapped[str] = mapped_column(String(160), nullable=False)
    #: Counts and references only.
    details: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'")
    )
    occurrences: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("1"))
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    #: When Super Admins were emailed (P1/P2 only, once per alert).
    notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    acknowledged_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("staff_accounts.id", ondelete="RESTRICT")
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("staff_accounts.id", ondelete="RESTRICT")
    )
    resolution_note: Mapped[str | None] = mapped_column(Text)
