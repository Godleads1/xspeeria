"""Staff bell: when each staff member last opened the notification panel — ADR-070

The bell lists work waiting for the signed-in staff member, worked out live from the queues
(nothing is copied or stored per item). The badge counts what arrived since they last opened
the panel, so one timestamp per staff account is all that is kept.

Revision ID: 0032
Revises: 0031
Create Date: 2026-10-27 12:00:00

REVIEW CHECKLIST -- every migration on this project is read by a human before it runs:
  * No DROP of a table or column carrying financial state without explicit human approval.
  * Monetary columns are integer minor units (DECISION S4-1). (None added here.)
  * Constraints carry deterministic names from the `app.db.base` naming convention.
  * `downgrade()` is honest: if a step cannot be reversed without losing history, it raises.
    (Dropping this column loses only "last opened the bell" times, not records.)
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0032"
down_revision: str | None = "0031"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "staff_accounts",
        sa.Column("notifications_seen_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("staff_accounts", "notifications_seen_at")
