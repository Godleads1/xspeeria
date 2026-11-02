"""Emergency controls: pause all deals, end every session — SEC-039, ADR-075 (owner 2026-11-02)

Owner: "do these" (pause-all-deals switch, end-every-session action), and chose: **freeze the
clocks** (no new offers, takes or payout choices; bank commands held; open windows get the
paused time back on resume) and **any Super Admin, reason required**.

* ``deal_pauses``: one row per pause, kept forever. At most one is open (``ended_at`` NULL).
* ``auth_sessions.revoke_reason`` may now be ``incident`` (every customer session ended by a
  Super Admin during an incident).

Revision ID: 0037
Revises: 0036
Create Date: 2026-11-02 14:00:00

REVIEW CHECKLIST -- every migration on this project is read by a human before it runs:
  * One new table and one widened CHECK; no existing data is changed. (No monetary column.)
  * `downgrade()` refuses without explicit authorization (pause history is an audit record),
    and narrowing the CHECK fails if any session was ended with reason ``incident``.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import context, op
from sqlalchemy.dialects import postgresql

revision: str = "0037"
down_revision: str | None = "0036"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_REASONS = (
    "'logout', 'revoked_by_user', 'token_reuse', 'replaced', 'pin_change', 'pin_reset', "
    "'unlock_failed', 'account_suspended', 'account_closed'"
)
_CHECK = "ck_auth_sessions_revoke_reason_allowed"


def upgrade() -> None:
    op.create_table(
        "deal_pauses",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("started_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("end_reason", sa.Text(), nullable=True),
        sa.Column("details", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'")),
        sa.CheckConstraint(
            "char_length(reason) BETWEEN 5 AND 500", name=op.f("ck_deal_pauses_reason_length")
        ),
        sa.CheckConstraint(
            "(ended_at IS NULL) = (ended_by IS NULL) AND (ended_at IS NULL) = (end_reason IS NULL)",
            name=op.f("ck_deal_pauses_ended_complete"),
        ),
        sa.CheckConstraint(
            "end_reason IS NULL OR char_length(end_reason) BETWEEN 5 AND 500",
            name=op.f("ck_deal_pauses_end_reason_length"),
        ),
        sa.CheckConstraint(
            "ended_at IS NULL OR ended_at >= started_at", name=op.f("ck_deal_pauses_ends_after")
        ),
        sa.ForeignKeyConstraint(
            ["started_by"],
            ["staff_accounts.id"],
            name=op.f("fk_deal_pauses_started_by_staff_accounts"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["ended_by"],
            ["staff_accounts.id"],
            name=op.f("fk_deal_pauses_ended_by_staff_accounts"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_deal_pauses")),
    )
    op.create_index(
        "uq_deal_pauses_one_open",
        "deal_pauses",
        [sa.text("(true)")],
        unique=True,
        postgresql_where=sa.text("ended_at IS NULL"),
    )
    op.execute("REVOKE ALL ON deal_pauses FROM PUBLIC")
    op.execute("GRANT SELECT, INSERT, UPDATE ON deal_pauses TO xspeeria_app")
    op.drop_constraint(op.f(_CHECK), "auth_sessions", type_="check")
    op.create_check_constraint(
        op.f(_CHECK),
        "auth_sessions",
        f"revoke_reason IS NULL OR revoke_reason IN ({_REASONS}, 'incident')",
    )


def downgrade() -> None:
    authorized = "authorized" in (
        context.get_x_argument(as_dictionary=True).get("records_downgrade"),
        context.config.attributes.get("records_downgrade"),
    )
    if not authorized:
        raise RuntimeError(
            "Refusing to drop the deal pause history. Pass -x records_downgrade=authorized only "
            "with explicit human authorization."
        )
    op.drop_constraint(op.f(_CHECK), "auth_sessions", type_="check")
    op.create_check_constraint(
        op.f(_CHECK), "auth_sessions", f"revoke_reason IS NULL OR revoke_reason IN ({_REASONS})"
    )
    op.drop_index("uq_deal_pauses_one_open", table_name="deal_pauses")
    op.drop_table("deal_pauses")
