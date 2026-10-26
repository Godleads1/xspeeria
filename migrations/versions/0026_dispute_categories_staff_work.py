"""Dispute categories staff manage, and staff work on disputes — ADR-063 (owner 2026-10-26)

* ``dispute_categories``: the list customers and staff choose from. Starts with the four the
  app already uses; staff with ``disputes.approve`` add, rename or switch them off. A
  category is never deleted (old disputes keep pointing at it).
* ``disputes.reason`` now refers to a category (foreign key) instead of a fixed list.
* ``disputes``: ``assigned_staff_id``, ``opened_by_staff_id`` (a staff member opened it for a
  customer, ADR-051 decision 6), ``priority``, ``desired_resolution``, ``escalated_at``.
* ``dispute_messages.author_staff_id``: which staff member wrote a staff reply.

Revision ID: 0026
Revises: 0025
Create Date: 2026-10-26 23:30:00

REVIEW CHECKLIST -- every migration on this project is read by a human before it runs:
  * No DROP of a table or column carrying financial state without explicit human approval.
  * Monetary columns are integer minor units (DECISION S4-1). (None added here.)
  * Constraints carry deterministic names from the `app.db.base` naming convention.
  * `downgrade()` is honest: if a step cannot be reversed without losing history, it raises.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, datetime

import sqlalchemy as sa
from alembic import context, op
from sqlalchemy.dialects import postgresql

revision: str = "0026"
down_revision: str | None = "0025"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_REASONS = "reason IN ('funds_not_received', 'wrong_amount', 'counterparty_unresponsive', 'other')"
SEED = (
    ("funds_not_received", "Funds not received", "I paid but the money hasn't arrived", 10),
    ("wrong_amount", "Wrong amount", "The amount received is wrong", 20),
    ("counterparty_unresponsive", "Other side not paying", "The other side isn't paying", 30),
    ("other", "Something else", "Other concerns and questions", 40),
)


def upgrade() -> None:
    op.create_table(
        "dispute_categories",
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=60), nullable=False),
        sa.Column("description", sa.String(length=200), nullable=False, server_default=""),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("sort_order", sa.SmallInteger(), nullable=False, server_default="100"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "code ~ '^[a-z][a-z0-9_]{1,31}$'", name=op.f("ck_dispute_categories_code_format")
        ),
        sa.CheckConstraint(
            "char_length(btrim(name)) >= 2", name=op.f("ck_dispute_categories_name_length")
        ),
        sa.PrimaryKeyConstraint("code", name=op.f("pk_dispute_categories")),
    )
    op.create_index(
        "uq_dispute_categories_name", "dispute_categories", [sa.text("lower(name)")], unique=True
    )
    # The app role reads, adds and changes categories; never deletes (old disputes point at them).
    op.execute("REVOKE ALL ON dispute_categories FROM PUBLIC")
    op.execute("GRANT SELECT, INSERT, UPDATE ON dispute_categories TO xspeeria_app")
    table = sa.table(
        "dispute_categories",
        sa.column("code", sa.String),
        sa.column("name", sa.String),
        sa.column("description", sa.String),
        sa.column("active", sa.Boolean),
        sa.column("sort_order", sa.SmallInteger),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )
    now = datetime.now(UTC)
    op.bulk_insert(
        table,
        [
            {
                "code": c,
                "name": n,
                "description": d,
                "active": True,
                "sort_order": o,
                "created_at": now,
                "updated_at": now,
            }
            for c, n, d, o in SEED
        ],
    )
    op.drop_constraint(op.f("ck_disputes_reason_allowed"), "disputes", type_="check")
    op.create_foreign_key(
        op.f("fk_disputes_reason_dispute_categories"),
        "disputes",
        "dispute_categories",
        ["reason"],
        ["code"],
        ondelete="RESTRICT",
    )
    op.add_column(
        "disputes",
        sa.Column("assigned_staff_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "disputes",
        sa.Column("opened_by_staff_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "disputes",
        sa.Column("priority", sa.String(length=8), nullable=False, server_default="medium"),
    )
    op.add_column("disputes", sa.Column("desired_resolution", sa.Text(), nullable=True))
    op.add_column("disputes", sa.Column("escalated_at", sa.DateTime(timezone=True), nullable=True))
    op.create_foreign_key(
        op.f("fk_disputes_assigned_staff_id_staff_accounts"),
        "disputes",
        "staff_accounts",
        ["assigned_staff_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        op.f("fk_disputes_opened_by_staff_id_staff_accounts"),
        "disputes",
        "staff_accounts",
        ["opened_by_staff_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_check_constraint(
        op.f("ck_disputes_priority_allowed"), "disputes", "priority IN ('low', 'medium', 'high')"
    )
    op.create_check_constraint(
        op.f("ck_disputes_desired_resolution_length"),
        "disputes",
        "desired_resolution IS NULL OR char_length(desired_resolution) BETWEEN 1 AND 1000",
    )
    op.add_column(
        "dispute_messages",
        sa.Column("author_staff_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        op.f("fk_dispute_messages_author_staff_id_staff_accounts"),
        "dispute_messages",
        "staff_accounts",
        ["author_staff_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_check_constraint(
        op.f("ck_dispute_messages_staff_has_id"),
        "dispute_messages",
        "author_role = 'user' OR author_staff_id IS NOT NULL",
    )


def downgrade() -> None:
    authorized = "authorized" in (
        context.get_x_argument(as_dictionary=True).get("records_downgrade"),
        context.config.attributes.get("records_downgrade"),
    )
    if not authorized:
        raise RuntimeError(
            "Refusing to drop dispute categories, assignments and staff replies. Pass "
            "-x records_downgrade=authorized only with explicit human authorization."
        )
    op.drop_constraint(op.f("ck_dispute_messages_staff_has_id"), "dispute_messages", type_="check")
    op.drop_constraint(
        op.f("fk_dispute_messages_author_staff_id_staff_accounts"),
        "dispute_messages",
        type_="foreignkey",
    )
    op.drop_column("dispute_messages", "author_staff_id")
    op.drop_constraint(op.f("ck_disputes_desired_resolution_length"), "disputes", type_="check")
    op.drop_constraint(op.f("ck_disputes_priority_allowed"), "disputes", type_="check")
    op.drop_constraint(
        op.f("fk_disputes_opened_by_staff_id_staff_accounts"), "disputes", type_="foreignkey"
    )
    op.drop_constraint(
        op.f("fk_disputes_assigned_staff_id_staff_accounts"), "disputes", type_="foreignkey"
    )
    for col in (
        "escalated_at",
        "desired_resolution",
        "priority",
        "opened_by_staff_id",
        "assigned_staff_id",
    ):
        op.drop_column("disputes", col)
    op.drop_constraint(
        op.f("fk_disputes_reason_dispute_categories"), "disputes", type_="foreignkey"
    )
    # Fails (as it should) if a dispute uses a category added by staff.
    op.create_check_constraint(op.f("ck_disputes_reason_allowed"), "disputes", _REASONS)
    op.drop_index("uq_dispute_categories_name", table_name="dispute_categories")
    op.drop_table("dispute_categories")
