"""Fraud alerts — ADR-068 (owner 2026-10-26: "Simple rules + staff flag").

An alert about one customer, raised by a simple rule over data Xspeeria already has or by a
staff member. Staff work it to an outcome. Never deleted. **No money lives here**: an alert
never blocks, moves or reverses anything by itself; staff act through the existing screens
(suspend a customer, ask for a refund).
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

__all__ = ["FRAUD_RULES", "FraudAlert"]

FRAUD_RULES = (
    "pin_lockout",
    "code_lockout",
    "disputes_against",
    "payout_name_mismatch",
    "staff_report",
    # ADR-084: the customer pressed "this wasn't me" in a security email.
    "customer_reported_not_me",
)


class FraudAlert(Base):
    __tablename__ = "fraud_alerts"
    __table_args__ = (
        CheckConstraint(
            "rule IN ('pin_lockout', 'code_lockout', 'disputes_against', "
            "'payout_name_mismatch', 'staff_report', 'customer_reported_not_me')",
            name="rule_allowed",
        ),
        CheckConstraint("severity IN ('low', 'medium', 'high')", name="severity_allowed"),
        CheckConstraint("status IN ('open', 'in_progress', 'resolved')", name="status_allowed"),
        CheckConstraint(
            "(rule = 'staff_report') = (raised_by IS NOT NULL)", name="staff_report_has_staff"
        ),
        CheckConstraint("(rule = 'staff_report') OR subject IS NOT NULL", name="rule_has_subject"),
        CheckConstraint(
            "(status = 'resolved') = (resolved_at IS NOT NULL AND resolved_by IS NOT NULL "
            "AND resolution IS NOT NULL)",
            name="resolved_complete",
        ),
        CheckConstraint(
            "resolution IS NULL OR resolution IN ('confirmed', 'false_alarm')",
            name="resolution_allowed",
        ),
        CheckConstraint("note IS NULL OR char_length(note) BETWEEN 1 AND 1000", name="note_length"),
        CheckConstraint(
            "resolution_note IS NULL OR char_length(resolution_note) BETWEEN 1 AND 1000",
            name="resolution_note_length",
        ),
        Index(
            "uq_fraud_alerts_rule_subject",
            "rule",
            "subject",
            unique=True,
            postgresql_where=text("subject IS NOT NULL"),
        ),
        Index("ix_fraud_alerts_status_created", "status", "created_at"),
        Index("ix_fraud_alerts_user", "user_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    rule: Mapped[str] = mapped_column(String(24), nullable=False)
    severity: Mapped[str] = mapped_column(String(8), nullable=False)
    status: Mapped[str] = mapped_column(String(12), nullable=False, server_default=text("'open'"))
    #: What a rule alert was about (unique per rule), so it is raised once.
    subject: Mapped[str | None] = mapped_column(String(120))
    #: Counts and references only — never account numbers, PINs or codes.
    details: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'")
    )
    #: A staff member's words when they raise one by hand.
    note: Mapped[str | None] = mapped_column(Text)
    raised_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("staff_accounts.id", ondelete="RESTRICT")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("staff_accounts.id", ondelete="RESTRICT")
    )
    resolution: Mapped[str | None] = mapped_column(String(12))
    resolution_note: Mapped[str | None] = mapped_column(Text)
