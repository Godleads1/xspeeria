"""Shared rate limits: one row per attempt — readiness review H-1, ADR-080 (owner 2026-11-02)

Owner: "go" (2026-11-02) on building the shared rate limiter so limits survive restarts and
are the same on every server.

* ``rate_limit_hits``: one row per attempt on a limited action. The key is a SHA-256 hash
  (no network address, phone number or email is stored). Rows are deleted after an hour by
  the hourly job; nothing else reads them.

Revision ID: 0039
Revises: 0038
Create Date: 2026-11-02 19:30:00

REVIEW CHECKLIST -- every migration on this project is read by a human before it runs:
  * One new table; no existing data is changed. (No monetary column, no customer column.)
  * Downgrade drops the table: it only holds counts for the last hour.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0039"
down_revision: str | None = "0038"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "rate_limit_hits",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), nullable=False),
        sa.Column("limiter", sa.String(length=32), nullable=False),
        sa.Column("key_hash", sa.LargeBinary(), nullable=False),
        sa.Column("at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "octet_length(key_hash) = 32", name=op.f("ck_rate_limit_hits_key_hash_sha256")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_rate_limit_hits")),
    )
    op.create_index("ix_rate_limit_hits_key_at", "rate_limit_hits", ["limiter", "key_hash", "at"])
    op.create_index("ix_rate_limit_hits_at", "rate_limit_hits", ["at"])
    op.execute("REVOKE ALL ON rate_limit_hits FROM PUBLIC")
    op.execute("GRANT SELECT, INSERT, DELETE ON rate_limit_hits TO xspeeria_app")


def downgrade() -> None:
    op.drop_index("ix_rate_limit_hits_at", table_name="rate_limit_hits")
    op.drop_index("ix_rate_limit_hits_key_at", table_name="rate_limit_hits")
    op.drop_table("rate_limit_hits")
