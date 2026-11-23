"""Fixes from the 40-point security check (owner, 2026-11-23: "go").

* ``signup_pauses``: the emergency switch that pauses new sign-ups and text-message codes
  (B&A 39). Same shape as ``deal_pauses`` (ADR-075): at most one open, kept forever.
* ``auth_sessions.revoke_reason`` may be ``phone_change``: a new phone number now signs out
  every other session (security check 13).
* A unique index on accepted partner events (B&A 06): two copies of one bank message can
  never both be accepted, even if the locked re-check in ``SettlementService.ingest`` were
  bypassed. Duplicates are still *recorded* (verdict ``DUPLICATE``); only the verdicts that
  change money are unique.

Revision ID: 0053
Revises: 0052

REVIEW CHECKLIST -- every migration on this project is read by a human before it runs:
  * New table only; no existing row changes. The unique index fails to build if a database
    already holds two accepted copies of one partner event -- that would itself be a finding.
  * Downgrade removes exactly what upgrade adds (a ``phone_change`` session row must be
    cleared first; the downgrade refuses otherwise, as the constraint would).
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0053"
down_revision: str | None = "0052"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_CHECK = "ck_auth_sessions_revoke_reason_allowed"
_REASONS = (
    "'logout', 'revoked_by_user', 'token_reuse', 'replaced', 'pin_change', 'pin_reset', "
    "'unlock_failed', 'account_suspended', 'account_closed', 'incident'"
)
_ACCEPTED = "verdict IN ('ACCEPTED', 'QUARANTINED', 'CONTRADICTORY')"


def upgrade() -> None:
    op.create_table(
        "signup_pauses",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("started_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("end_reason", sa.Text(), nullable=True),
        sa.CheckConstraint(
            "char_length(reason) BETWEEN 5 AND 500", name=op.f("ck_signup_pauses_reason_length")
        ),
        sa.CheckConstraint(
            "(ended_at IS NULL) = (ended_by IS NULL) AND (ended_at IS NULL) = (end_reason IS NULL)",
            name=op.f("ck_signup_pauses_ended_complete"),
        ),
        sa.CheckConstraint(
            "end_reason IS NULL OR char_length(end_reason) BETWEEN 5 AND 500",
            name=op.f("ck_signup_pauses_end_reason_length"),
        ),
        sa.CheckConstraint(
            "ended_at IS NULL OR ended_at >= started_at", name=op.f("ck_signup_pauses_ends_after")
        ),
        sa.ForeignKeyConstraint(
            ["started_by"],
            ["staff_accounts.id"],
            name=op.f("fk_signup_pauses_started_by_staff_accounts"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["ended_by"],
            ["staff_accounts.id"],
            name=op.f("fk_signup_pauses_ended_by_staff_accounts"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_signup_pauses")),
    )
    op.create_index(
        "uq_signup_pauses_one_open",
        "signup_pauses",
        [sa.text("(true)")],
        unique=True,
        postgresql_where=sa.text("ended_at IS NULL"),
    )
    op.execute("REVOKE ALL ON signup_pauses FROM PUBLIC")
    op.execute("GRANT SELECT, INSERT, UPDATE ON signup_pauses TO xspeeria_app")

    op.drop_constraint(op.f(_CHECK), "auth_sessions", type_="check")
    op.create_check_constraint(
        op.f(_CHECK),
        "auth_sessions",
        f"revoke_reason IS NULL OR revoke_reason IN ({_REASONS}, 'phone_change')",
    )

    op.create_index(
        "uq_webhook_receipts_accepted_event",
        "webhook_receipts",
        ["partner_id", "provider_event_id"],
        unique=True,
        postgresql_where=sa.text(_ACCEPTED),
    )


def downgrade() -> None:
    op.drop_index("uq_webhook_receipts_accepted_event", table_name="webhook_receipts")
    op.drop_constraint(op.f(_CHECK), "auth_sessions", type_="check")
    op.create_check_constraint(
        op.f(_CHECK), "auth_sessions", f"revoke_reason IS NULL OR revoke_reason IN ({_REASONS})"
    )
    op.drop_index("uq_signup_pauses_one_open", table_name="signup_pauses")
    op.drop_table("signup_pauses")
