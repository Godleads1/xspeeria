# ruff: noqa: E501
"""Phone push — Milestone N-3 (ADR-052)

* ``push_tokens`` (data dictionary "Devices"): a phone's Expo push token, bound to the session
  that registered it, so pushes stop when that session ends.
* ``push_deliveries``: one row per notification the push sender handled; stops double sends.

``downgrade()`` refuses unless ``-x records_downgrade=authorized``.

Revision ID: 0016
Revises: 0015
Create Date: 2026-10-19 22:30:00

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

revision: str = "0016"
down_revision: str | None = "0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "push_tokens",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("session_id", sa.UUID(), nullable=False),
        sa.Column("token", sa.String(length=255), nullable=False),
        sa.Column("platform", sa.String(length=8), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("disabled_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "platform IN ('ios', 'android')", name=op.f("ck_push_tokens_platform_allowed")
        ),
        sa.CheckConstraint(
            "token ~ '^(Expo|Exponent)PushToken\\[[A-Za-z0-9_-]{10,200}\\]$'",
            name=op.f("ck_push_tokens_token_format"),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_push_tokens_user_id_users"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["session_id"],
            ["auth_sessions.id"],
            name=op.f("fk_push_tokens_session_id_auth_sessions"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_push_tokens")),
    )
    op.create_index("uq_push_tokens_token", "push_tokens", ["token"], unique=True)
    op.create_index("ix_push_tokens_user_id", "push_tokens", ["user_id"], unique=False)
    op.create_table(
        "push_deliveries",
        sa.Column("notification_id", sa.UUID(), nullable=False),
        sa.Column("state", sa.String(length=12), nullable=False),
        sa.Column("devices", sa.Integer(), nullable=False),
        sa.Column("handled_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "state IN ('sent', 'no_device', 'failed')",
            name=op.f("ck_push_deliveries_state_allowed"),
        ),
        sa.CheckConstraint("devices >= 0", name=op.f("ck_push_deliveries_devices_not_negative")),
        sa.ForeignKeyConstraint(
            ["notification_id"],
            ["notifications.id"],
            name=op.f("fk_push_deliveries_notification_id_notifications"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("notification_id", name=op.f("pk_push_deliveries")),
    )
    op.execute("GRANT SELECT, INSERT, UPDATE ON push_tokens TO xspeeria_app")
    op.execute("GRANT SELECT, INSERT ON push_deliveries TO xspeeria_app")


def downgrade() -> None:
    authorized = "authorized" in (
        context.get_x_argument(as_dictionary=True).get("records_downgrade"),
        context.config.attributes.get("records_downgrade"),
    )
    if not authorized:
        raise RuntimeError(
            "Refusing to drop push tokens and delivery records. Pass -x records_downgrade=authorized "
            "only with explicit human authorization."
        )
    op.drop_table("push_deliveries")
    op.drop_index("ix_push_tokens_user_id", table_name="push_tokens")
    op.drop_index("uq_push_tokens_token", table_name="push_tokens")
    op.drop_table("push_tokens")
