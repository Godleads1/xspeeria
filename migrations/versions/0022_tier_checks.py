# ruff: noqa: E501
"""Higher-tier checks — ADR-058 Tier 2 and Tier 3

``tier_checks``: one row per check a user submits for a higher tier — BVN (Didit database
validation), home address (as given), proof of address (Didit, uploaded through our server)
and the source-of-funds answer. The BVN number itself and the uploaded document are NEVER
stored: only the result. At most one approved check of each kind per user (unique index).

``downgrade()`` refuses unless ``-x records_downgrade=authorized``.

Revision ID: 0022
Revises: 0021
Create Date: 2026-10-26 18:00:00

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

revision: str = "0022"
down_revision: str | None = "0021"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "tier_checks",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("status", sa.String(length=12), nullable=False),
        sa.Column("reason", sa.String(length=128), nullable=True),
        sa.Column("provider_request_id", sa.String(length=64), nullable=True),
        sa.Column("detail", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "kind IN ('bvn', 'address', 'proof_of_address', 'source_of_funds')",
            name=op.f("ck_tier_checks_kind_allowed"),
        ),
        sa.CheckConstraint(
            "status IN ('approved', 'declined', 'in_review')",
            name=op.f("ck_tier_checks_status_allowed"),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_tier_checks_user_id_users"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_tier_checks")),
    )
    op.create_index(
        "uq_tier_checks_one_approved_per_kind",
        "tier_checks",
        ["user_id", "kind"],
        unique=True,
        postgresql_where=sa.text("status = 'approved'"),
    )
    op.create_index("ix_tier_checks_user", "tier_checks", ["user_id", "kind", "created_at"])
    op.execute("GRANT SELECT, INSERT, UPDATE ON tier_checks TO xspeeria_app")


def downgrade() -> None:
    authorized = "authorized" in (
        context.get_x_argument(as_dictionary=True).get("records_downgrade"),
        context.config.attributes.get("records_downgrade"),
    )
    if not authorized:
        raise RuntimeError(
            "Refusing to drop tier checks. Pass -x records_downgrade=authorized only with "
            "explicit human authorization."
        )
    op.drop_index("ix_tier_checks_user", table_name="tier_checks")
    op.drop_index("uq_tier_checks_one_approved_per_kind", table_name="tier_checks")
    op.drop_table("tier_checks")
