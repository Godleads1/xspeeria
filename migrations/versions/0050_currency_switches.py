"""Currency on/off switches — ADR-106 (owner 2026-11-10).

``currency_switches``: one row per currency a Super Admin has switched; no row means the
built-in default. Naira can't be switched (``naira_always_on``). No user column, so no row
policy; the app role reads and writes it (only the Super Admin route writes).

Revision ID: 0050
Revises: 0049
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0050"
down_revision: str | None = "0049"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "currency_switches",
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("reason", sa.String(length=300), nullable=False),
        sa.Column("changed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("changed_by_staff_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.CheckConstraint(
            "currency ~ '^[A-Z]{3}$'", name=op.f("ck_currency_switches_currency_code")
        ),
        sa.CheckConstraint("currency <> 'NGN'", name=op.f("ck_currency_switches_naira_always_on")),
        sa.CheckConstraint(
            "length(reason) BETWEEN 5 AND 300", name=op.f("ck_currency_switches_reason_length")
        ),
        sa.PrimaryKeyConstraint("currency", name=op.f("pk_currency_switches")),
    )
    op.execute("GRANT SELECT, INSERT, UPDATE ON currency_switches TO xspeeria_app")


def downgrade() -> None:
    op.drop_table("currency_switches")
