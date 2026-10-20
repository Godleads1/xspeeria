# ruff: noqa: E501
"""N-1: in-app notifications (ADR-044)

* ``notifications`` (data dictionary Notification): one message per user per fact
  (``dedupe_key`` unique per user). Payload holds an event name and ids only.
* Guard trigger (XS004): only ``read_at`` may change; no deletes.
* Runtime role: SELECT, INSERT, UPDATE.

``downgrade()`` drops the table and refuses unless ``-x records_downgrade=authorized``.

Revision ID: 0013
Revises: 0012
Create Date: 2026-10-19 14:00:00

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
from sqlalchemy.dialects import postgresql

revision: str = "0013"
down_revision: str | None = "0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "notifications",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("seq", sa.BigInteger(), sa.Identity(always=True), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("type", sa.String(length=24), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("dedupe_key", sa.String(length=128), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "type IN ('kyc_status', 'match_found', 'settlement_update', 'dispute_update', 'system')",
            name=op.f("ck_notifications_type_allowed"),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_notifications_user_id_users"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_notifications")),
    )
    op.create_index("ix_notifications_user_seq", "notifications", ["user_id", "seq"], unique=False)
    op.create_index(
        "uq_notifications_user_dedupe", "notifications", ["user_id", "dedupe_key"], unique=True
    )
    op.execute(_GUARD)
    op.execute(
        "CREATE TRIGGER notifications_guard BEFORE UPDATE OR DELETE ON notifications "
        "FOR EACH ROW EXECUTE FUNCTION xspeeria_notification_guard()"
    )
    op.execute("GRANT SELECT, INSERT, UPDATE ON notifications TO xspeeria_app")


_GUARD = """
CREATE OR REPLACE FUNCTION xspeeria_notification_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'notifications are not deleted' USING ERRCODE = 'XS004';
    END IF;
    IF NEW.id <> OLD.id OR NEW.seq <> OLD.seq OR NEW.user_id <> OLD.user_id OR NEW.type <> OLD.type
       OR NEW.payload <> OLD.payload OR NEW.dedupe_key <> OLD.dedupe_key
       OR NEW.created_at <> OLD.created_at THEN
        RAISE EXCEPTION 'only read_at of a notification may change' USING ERRCODE = 'XS004';
    END IF;
    RETURN NEW;
END $$
"""


def downgrade() -> None:
    authorized = "authorized" in (
        context.get_x_argument(as_dictionary=True).get("records_downgrade"),
        context.config.attributes.get("records_downgrade"),
    )
    if not authorized:
        raise RuntimeError(
            "Refusing to drop notifications. Pass -x records_downgrade=authorized "
            "only with explicit human authorization."
        )
    op.drop_index("uq_notifications_user_dedupe", table_name="notifications")
    op.drop_index("ix_notifications_user_seq", table_name="notifications")
    op.drop_table("notifications")
    op.execute("DROP FUNCTION IF EXISTS xspeeria_notification_guard()")
