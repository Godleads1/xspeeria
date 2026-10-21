# ruff: noqa: E501
"""Disputes and support cases — ADR-057

* ``disputes``: a dispute on a deal whose escrow has started (data dictionary "Dispute"), or a
  support case with no deal (ADR-050). A dispute pauses its escrow through a DISPUTE row in
  ``settlement_holds``; it never changes money state.
* ``dispute_messages``: append-only messages (the app role may only INSERT and SELECT).

``downgrade()`` refuses unless ``-x records_downgrade=authorized``.

Revision ID: 0019
Revises: 0018
Create Date: 2026-10-20 17:30:00

REVIEW CHECKLIST -- every migration on this project is read by a human before it runs:
  * No DROP of a table or column carrying financial state without explicit human approval.
  * Monetary columns are integer minor units (DECISION S4-1): `amount_minor BIGINT` plus
    `currency`, `scale` and `currency_def_version`. Never NUMERIC/DECIMAL as authoritative
    money, never float.
  * Constraints carry deterministic names from the `app.db.base` naming convention.
  * `downgrade()` is honest: if a step cannot be reversed without losing financial
    history, it raises rather than pretending.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import context, op

revision: str = "0019"
down_revision: str | None = "0018"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "disputes",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("kind", sa.String(length=8), nullable=False),
        sa.Column("transaction_id", sa.UUID(), nullable=True),
        sa.Column("initiator_user_id", sa.UUID(), nullable=False),
        sa.Column("reason", sa.String(length=32), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("outcome", sa.String(length=24), nullable=True),
        sa.Column("hold_id", sa.UUID(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("kind IN ('dispute', 'support')", name=op.f("ck_disputes_kind_allowed")),
        sa.CheckConstraint(
            "reason IN ('funds_not_received', 'wrong_amount', 'counterparty_unresponsive', 'other')",
            name=op.f("ck_disputes_reason_allowed"),
        ),
        sa.CheckConstraint(
            "status IN ('open', 'under_review', 'resolved')",
            name=op.f("ck_disputes_status_allowed"),
        ),
        sa.CheckConstraint(
            "outcome IS NULL OR outcome IN ('favor_initiator', 'favor_counterparty', 'split', 'no_fault')",
            name=op.f("ck_disputes_outcome_allowed"),
        ),
        sa.CheckConstraint(
            "(kind = 'dispute') = (transaction_id IS NOT NULL)",
            name=op.f("ck_disputes_dispute_has_transaction"),
        ),
        sa.CheckConstraint(
            "kind = 'dispute' OR hold_id IS NULL", name=op.f("ck_disputes_support_holds_nothing")
        ),
        sa.CheckConstraint(
            "char_length(description) BETWEEN 1 AND 2000",
            name=op.f("ck_disputes_description_length"),
        ),
        sa.CheckConstraint(
            "(status = 'resolved') = (resolved_at IS NOT NULL)",
            name=op.f("ck_disputes_resolved_iff_at"),
        ),
        sa.CheckConstraint(
            "status = 'resolved' OR outcome IS NULL", name=op.f("ck_disputes_outcome_on_resolve")
        ),
        sa.ForeignKeyConstraint(
            ["transaction_id"],
            ["transactions.id"],
            name=op.f("fk_disputes_transaction_id_transactions"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["initiator_user_id"],
            ["users.id"],
            name=op.f("fk_disputes_initiator_user_id_users"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["hold_id"],
            ["settlement_holds.id"],
            name=op.f("fk_disputes_hold_id_settlement_holds"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_disputes")),
    )
    op.create_index(
        "uq_disputes_one_open_per_transaction",
        "disputes",
        ["transaction_id"],
        unique=True,
        postgresql_where=sa.text("kind = 'dispute' AND status <> 'resolved'"),
    )
    op.create_index("ix_disputes_initiator", "disputes", ["initiator_user_id", "created_at"])
    op.create_table(
        "dispute_messages",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("dispute_id", sa.UUID(), nullable=False),
        sa.Column("author_role", sa.String(length=8), nullable=False),
        sa.Column("author_user_id", sa.UUID(), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "author_role IN ('user', 'staff')", name=op.f("ck_dispute_messages_author_role_allowed")
        ),
        sa.CheckConstraint(
            "(author_role = 'user') = (author_user_id IS NOT NULL)",
            name=op.f("ck_dispute_messages_user_has_id"),
        ),
        sa.CheckConstraint(
            "char_length(body) BETWEEN 1 AND 2000", name=op.f("ck_dispute_messages_body_length")
        ),
        sa.ForeignKeyConstraint(
            ["dispute_id"],
            ["disputes.id"],
            name=op.f("fk_dispute_messages_dispute_id_disputes"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["author_user_id"],
            ["users.id"],
            name=op.f("fk_dispute_messages_author_user_id_users"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_dispute_messages")),
    )
    op.create_index("ix_dispute_messages_dispute", "dispute_messages", ["dispute_id", "created_at"])
    op.execute("GRANT SELECT, INSERT, UPDATE ON disputes TO xspeeria_app")
    op.execute("GRANT SELECT, INSERT ON dispute_messages TO xspeeria_app")


def downgrade() -> None:
    authorized = "authorized" in (
        context.get_x_argument(as_dictionary=True).get("records_downgrade"),
        context.config.attributes.get("records_downgrade"),
    )
    if not authorized:
        raise RuntimeError(
            "Refusing to drop disputes and their messages. Pass -x records_downgrade=authorized "
            "only with explicit human authorization."
        )
    op.drop_index("ix_dispute_messages_dispute", table_name="dispute_messages")
    op.drop_table("dispute_messages")
    op.drop_index("ix_disputes_initiator", table_name="disputes")
    op.drop_index("uq_disputes_one_open_per_transaction", table_name="disputes")
    op.drop_table("disputes")
