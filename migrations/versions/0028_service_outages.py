"""Service outage notices — ADR-066 (owner 2026-10-26: "Show a notice only")

* ``service_outages``: staff record an outage (which service, how serious, when it started, when
  it is expected to end) and the words every signed-in app user sees in a banner until staff
  mark it resolved. **Nothing is blocked**: trades, sign-in and payouts carry on.

Revision ID: 0028
Revises: 0027
Create Date: 2026-10-27 10:00:00

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

revision: str = "0028"
down_revision: str | None = "0027"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "service_outages",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("service", sa.String(length=60), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("severity", sa.String(length=8), nullable=False),
        sa.Column("status", sa.String(length=12), nullable=False, server_default="open"),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expected_end_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "char_length(btrim(service)) BETWEEN 2 AND 60",
            name=op.f("ck_service_outages_service_length"),
        ),
        sa.CheckConstraint(
            "char_length(btrim(message)) BETWEEN 5 AND 300",
            name=op.f("ck_service_outages_message_length"),
        ),
        sa.CheckConstraint(
            "severity IN ('low', 'medium', 'high')",
            name=op.f("ck_service_outages_severity_allowed"),
        ),
        sa.CheckConstraint(
            "status IN ('open', 'in_progress', 'resolved')",
            name=op.f("ck_service_outages_status_allowed"),
        ),
        sa.CheckConstraint(
            "(status = 'resolved') = (resolved_at IS NOT NULL)",
            name=op.f("ck_service_outages_resolved_iff_at"),
        ),
        sa.CheckConstraint(
            "expected_end_at IS NULL OR expected_end_at > started_at",
            name=op.f("ck_service_outages_end_after_start"),
        ),
        sa.CheckConstraint(
            "resolved_at IS NULL OR resolved_at >= started_at",
            name=op.f("ck_service_outages_resolved_after_start"),
        ),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["staff_accounts.id"],
            name=op.f("fk_service_outages_created_by_staff_accounts"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_service_outages")),
    )
    op.create_index(
        "ix_service_outages_status_started", "service_outages", ["status", "started_at"]
    )
    # The app role reads, adds and updates notices; never deletes (they are the outage history).
    op.execute("REVOKE ALL ON service_outages FROM PUBLIC")
    op.execute("GRANT SELECT, INSERT, UPDATE ON service_outages TO xspeeria_app")


def downgrade() -> None:
    authorized = "authorized" in (
        context.get_x_argument(as_dictionary=True).get("records_downgrade"),
        context.config.attributes.get("records_downgrade"),
    )
    if not authorized:
        raise RuntimeError(
            "Refusing to drop the outage history. Pass -x records_downgrade=authorized only with "
            "explicit human authorization."
        )
    op.drop_index("ix_service_outages_status_started", table_name="service_outages")
    op.drop_table("service_outages")
