"""Operations alerts for Super Admins — ADR-074 (owner 2026-11-01)

Owner: "do this monitoring, alerts or incident plan", then chose: alerts go to **Super Admins**
(in the admin console now, by email once an email provider exists), Sentry wired in but off,
and alerts + the incident plan in this round. Meets SEC-037 (alerts on repeated sign-in
failures, privilege changes, unusual transaction activity and webhook anomalies).

* ``ops_alerts``: one row per alert a rule raised. Counts and references only: no customer
  name, phone, email, account number, PIN or code. A rule that keeps firing updates the open
  alert (``last_seen_at``, ``occurrences``) instead of opening another. Super Admins
  acknowledge it and resolve it with a note. Never deleted (no DELETE grant).

Revision ID: 0036
Revises: 0035
Create Date: 2026-11-01 18:30:00

REVIEW CHECKLIST -- every migration on this project is read by a human before it runs:
  * One new table; no existing data is changed. (No monetary column.)
  * Constraints carry deterministic names from the `app.db.base` naming convention.
  * `downgrade()` is honest: dropping the table loses alert history, so it refuses without
    explicit authorization.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import context, op
from sqlalchemy.dialects import postgresql

revision: str = "0036"
down_revision: str | None = "0035"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "ops_alerts",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("rule", sa.String(length=40), nullable=False),
        sa.Column("severity", sa.String(length=2), nullable=False),
        sa.Column("status", sa.String(length=12), nullable=False, server_default="open"),
        sa.Column("subject", sa.String(length=160), nullable=False),
        sa.Column("details", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("occurrences", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("first_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("notified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("acknowledged_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("resolution_note", sa.Text(), nullable=True),
        sa.CheckConstraint(
            "severity IN ('P1', 'P2', 'P3', 'P4')", name=op.f("ck_ops_alerts_severity_allowed")
        ),
        sa.CheckConstraint(
            "status IN ('open', 'acknowledged', 'resolved')",
            name=op.f("ck_ops_alerts_status_allowed"),
        ),
        sa.CheckConstraint("occurrences >= 1", name=op.f("ck_ops_alerts_occurrences_positive")),
        sa.CheckConstraint(
            "last_seen_at >= first_seen_at", name=op.f("ck_ops_alerts_seen_in_order")
        ),
        sa.CheckConstraint(
            "(acknowledged_at IS NULL) = (acknowledged_by IS NULL)",
            name=op.f("ck_ops_alerts_acknowledged_complete"),
        ),
        sa.CheckConstraint(
            "(status = 'resolved') = (resolved_at IS NOT NULL AND resolved_by IS NOT NULL "
            "AND resolution_note IS NOT NULL)",
            name=op.f("ck_ops_alerts_resolved_complete"),
        ),
        sa.CheckConstraint(
            "resolution_note IS NULL OR char_length(resolution_note) BETWEEN 5 AND 1000",
            name=op.f("ck_ops_alerts_resolution_note_length"),
        ),
        sa.ForeignKeyConstraint(
            ["acknowledged_by"],
            ["staff_accounts.id"],
            name=op.f("fk_ops_alerts_acknowledged_by_staff_accounts"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["resolved_by"],
            ["staff_accounts.id"],
            name=op.f("fk_ops_alerts_resolved_by_staff_accounts"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_ops_alerts")),
    )
    # One live alert per rule and subject; a resolved one never blocks a new one.
    op.create_index(
        "uq_ops_alerts_live_rule_subject",
        "ops_alerts",
        ["rule", "subject"],
        unique=True,
        postgresql_where=sa.text("status <> 'resolved'"),
    )
    op.create_index("ix_ops_alerts_rule_subject", "ops_alerts", ["rule", "subject"])
    op.create_index("ix_ops_alerts_status_last_seen", "ops_alerts", ["status", "last_seen_at"])
    op.execute("REVOKE ALL ON ops_alerts FROM PUBLIC")
    op.execute("GRANT SELECT, INSERT, UPDATE ON ops_alerts TO xspeeria_app")


def downgrade() -> None:
    authorized = "authorized" in (
        context.get_x_argument(as_dictionary=True).get("records_downgrade"),
        context.config.attributes.get("records_downgrade"),
    )
    if not authorized:
        raise RuntimeError(
            "Refusing to drop operations alerts. Pass -x records_downgrade=authorized only with "
            "explicit human authorization."
        )
    op.drop_index("ix_ops_alerts_status_last_seen", table_name="ops_alerts")
    op.drop_index("ix_ops_alerts_rule_subject", table_name="ops_alerts")
    op.drop_index("uq_ops_alerts_live_rule_subject", table_name="ops_alerts")
    op.drop_table("ops_alerts")
