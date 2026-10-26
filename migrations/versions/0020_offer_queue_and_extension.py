# ruff: noqa: E501
"""Waiting queue and one funding extension — ADR-059 Decision 4

* ``offer_queue_entries``: people waiting for an offer someone else is paying for. At most 3
  active per offer (checked under the offer's row lock) and one active queue per person (a
  unique index). Rows are never deleted; they end as taken / left / passed / ended.
* ``settlements.funding_extended_at``: the taker may ask once for 5 more minutes to pay. The
  existing settlement guard is extended so the extension can be set once and never undone.

No money columns are added. ``downgrade()`` refuses unless ``-x records_downgrade=authorized``.

Revision ID: 0020
Revises: 0019
Create Date: 2026-10-26 12:00:00

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

revision: str = "0020"
down_revision: str | None = "0019"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_STATUSES = "'waiting', 'notified', 'taken', 'left', 'passed', 'ended'"


def upgrade() -> None:
    op.create_table(
        "offer_queue_entries",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("offer_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("status", sa.String(length=12), nullable=False),
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("notified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("turn_deadline", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            f"status IN ({_STATUSES})", name=op.f("ck_offer_queue_entries_status_allowed")
        ),
        sa.CheckConstraint(
            "status <> 'notified' OR (notified_at IS NOT NULL AND turn_deadline IS NOT NULL)",
            name=op.f("ck_offer_queue_entries_turn_when_notified"),
        ),
        sa.CheckConstraint(
            "(status IN ('waiting', 'notified')) = (ended_at IS NULL)",
            name=op.f("ck_offer_queue_entries_ended_iff_closed"),
        ),
        sa.ForeignKeyConstraint(
            ["offer_id"],
            ["offers.id"],
            name=op.f("fk_offer_queue_entries_offer_id_offers"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_offer_queue_entries_user_id_users"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_offer_queue_entries")),
    )
    # One active queue per person (owner decision, 2026-10-21).
    op.create_index(
        "uq_offer_queue_entries_one_active_per_user",
        "offer_queue_entries",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("status IN ('waiting', 'notified')"),
    )
    # At most one person's turn at a time on an offer.
    op.create_index(
        "uq_offer_queue_entries_one_turn_per_offer",
        "offer_queue_entries",
        ["offer_id"],
        unique=True,
        postgresql_where=sa.text("status = 'notified'"),
    )
    op.create_index(
        "ix_offer_queue_entries_offer", "offer_queue_entries", ["offer_id", "status", "joined_at"]
    )
    op.create_index(
        "ix_offer_queue_entries_turn_due",
        "offer_queue_entries",
        ["turn_deadline"],
        postgresql_where=sa.text("status = 'notified'"),
    )
    op.execute("GRANT SELECT, INSERT, UPDATE ON offer_queue_entries TO xspeeria_app")

    op.add_column(
        "settlements", sa.Column("funding_extended_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.execute(
        """
        CREATE FUNCTION xspeeria_settlement_extension_guard() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            IF OLD.funding_extended_at IS NOT NULL
               AND NEW.funding_extended_at IS DISTINCT FROM OLD.funding_extended_at THEN
                RAISE EXCEPTION 'funding_extended_at is set once (ADR-059)' USING ERRCODE = 'XS002';
            END IF;
            RETURN NEW;
        END $$
        """
    )
    op.execute(
        "CREATE TRIGGER settlements_extension_guard BEFORE UPDATE ON settlements "
        "FOR EACH ROW EXECUTE FUNCTION xspeeria_settlement_extension_guard()"
    )


def downgrade() -> None:
    authorized = "authorized" in (
        context.get_x_argument(as_dictionary=True).get("records_downgrade"),
        context.config.attributes.get("records_downgrade"),
    )
    if not authorized:
        raise RuntimeError(
            "Refusing to drop the waiting queue and extension history. Pass "
            "-x records_downgrade=authorized only with explicit human authorization."
        )
    op.execute("DROP TRIGGER settlements_extension_guard ON settlements")
    op.execute("DROP FUNCTION xspeeria_settlement_extension_guard()")
    op.drop_column("settlements", "funding_extended_at")
    op.drop_index("ix_offer_queue_entries_turn_due", table_name="offer_queue_entries")
    op.drop_index("ix_offer_queue_entries_offer", table_name="offer_queue_entries")
    op.drop_index("uq_offer_queue_entries_one_turn_per_offer", table_name="offer_queue_entries")
    op.drop_index("uq_offer_queue_entries_one_active_per_user", table_name="offer_queue_entries")
    op.drop_table("offer_queue_entries")
