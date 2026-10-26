"""Fraud alerts — ADR-068 (owner 2026-10-26: "Simple rules + staff flag")

* ``fraud_alerts``: an alert about one customer, raised either by a simple rule over data
  Xspeeria already has, or by a staff member. Staff work it (open → in progress → resolved,
  with an outcome: confirmed or false alarm). Never deleted.
* A rule alert names what it was about (``subject``), unique per rule, so the same lock-out,
  the same set of disputes or the same payout account is raised once, even after it is
  resolved; something new raises a new alert.

Revision ID: 0030
Revises: 0029
Create Date: 2026-10-27 12:00:00

REVIEW CHECKLIST -- every migration on this project is read by a human before it runs:
  * No DROP of a table or column carrying financial state without explicit human approval.
  * Monetary columns are integer minor units (DECISION S4-1). (None added here.)
  * Constraints carry deterministic names from the `app.db.base` naming convention.
  * `downgrade()` is honest: if a step cannot be reversed without losing history, it raises.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import context, op
from sqlalchemy.dialects import postgresql

revision: str = "0030"
down_revision: str | None = "0029"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_RULES = "'pin_lockout', 'code_lockout', 'disputes_against', 'payout_name_mismatch', 'staff_report'"


def upgrade() -> None:
    op.create_table(
        "fraud_alerts",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("rule", sa.String(length=24), nullable=False),
        sa.Column("severity", sa.String(length=8), nullable=False),
        sa.Column("status", sa.String(length=12), nullable=False, server_default="open"),
        sa.Column("subject", sa.String(length=120), nullable=True),
        sa.Column("details", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("raised_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("resolution", sa.String(length=12), nullable=True),
        sa.Column("resolution_note", sa.Text(), nullable=True),
        sa.CheckConstraint(f"rule IN ({_RULES})", name=op.f("ck_fraud_alerts_rule_allowed")),
        sa.CheckConstraint(
            "severity IN ('low', 'medium', 'high')", name=op.f("ck_fraud_alerts_severity_allowed")
        ),
        sa.CheckConstraint(
            "status IN ('open', 'in_progress', 'resolved')",
            name=op.f("ck_fraud_alerts_status_allowed"),
        ),
        sa.CheckConstraint(
            "(rule = 'staff_report') = (raised_by IS NOT NULL)",
            name=op.f("ck_fraud_alerts_staff_report_has_staff"),
        ),
        sa.CheckConstraint(
            "(rule = 'staff_report') OR subject IS NOT NULL",
            name=op.f("ck_fraud_alerts_rule_has_subject"),
        ),
        sa.CheckConstraint(
            "(status = 'resolved') = (resolved_at IS NOT NULL AND resolved_by IS NOT NULL "
            "AND resolution IS NOT NULL)",
            name=op.f("ck_fraud_alerts_resolved_complete"),
        ),
        sa.CheckConstraint(
            "resolution IS NULL OR resolution IN ('confirmed', 'false_alarm')",
            name=op.f("ck_fraud_alerts_resolution_allowed"),
        ),
        sa.CheckConstraint(
            "note IS NULL OR char_length(note) BETWEEN 1 AND 1000",
            name=op.f("ck_fraud_alerts_note_length"),
        ),
        sa.CheckConstraint(
            "resolution_note IS NULL OR char_length(resolution_note) BETWEEN 1 AND 1000",
            name=op.f("ck_fraud_alerts_resolution_note_length"),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_fraud_alerts_user_id_users"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["raised_by"],
            ["staff_accounts.id"],
            name=op.f("fk_fraud_alerts_raised_by_staff_accounts"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["resolved_by"],
            ["staff_accounts.id"],
            name=op.f("fk_fraud_alerts_resolved_by_staff_accounts"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_fraud_alerts")),
    )
    op.create_index(
        "uq_fraud_alerts_rule_subject",
        "fraud_alerts",
        ["rule", "subject"],
        unique=True,
        postgresql_where=sa.text("subject IS NOT NULL"),
    )
    op.create_index("ix_fraud_alerts_status_created", "fraud_alerts", ["status", "created_at"])
    op.create_index("ix_fraud_alerts_user", "fraud_alerts", ["user_id"])
    op.execute("REVOKE ALL ON fraud_alerts FROM PUBLIC")
    op.execute("GRANT SELECT, INSERT, UPDATE ON fraud_alerts TO xspeeria_app")


def downgrade() -> None:
    authorized = "authorized" in (
        context.get_x_argument(as_dictionary=True).get("records_downgrade"),
        context.config.attributes.get("records_downgrade"),
    )
    if not authorized:
        raise RuntimeError(
            "Refusing to drop fraud alerts. Pass -x records_downgrade=authorized only with "
            "explicit human authorization."
        )
    op.drop_index("ix_fraud_alerts_user", table_name="fraud_alerts")
    op.drop_index("ix_fraud_alerts_status_created", table_name="fraud_alerts")
    op.drop_index("uq_fraud_alerts_rule_subject", table_name="fraud_alerts")
    op.drop_table("fraud_alerts")
