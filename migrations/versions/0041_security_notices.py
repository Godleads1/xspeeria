"""Security notice emails with a "this wasn't me" link — ADR-084 (owner 2026-11-02)

Owner: "for every login, and important process done on the app, xspeeria sends email to
notifies the users and add if you are not the one raise a fraud. this trigger an alert and
the admin can switch one the user accounts." Answers: every log-in, account changes, payout
accounts and deals; a link in the email; reporting freezes the account at once.

* ``security_notices``: one email to send (an outbox), written in the same transaction as the
  thing it reports. Holds only the kind and a shortened device name. The link's token is made
  when the email is sent; only its SHA-256 is kept, so the database can't rebuild a link.
* ``fraud_alerts.rule`` may now be ``customer_reported_not_me``.
* Row-level security (ADR-078): customers' rows, so the owner-rows policy applies.

Revision ID: 0041
Revises: 0040
Create Date: 2026-11-02 23:00:00

REVIEW CHECKLIST -- every migration on this project is read by a human before it runs:
  * One new table, and one more allowed value in an existing check; no existing row changes.
  * Downgrade drops the table (unsent notices and unused links are lost) and refuses while a
    ``customer_reported_not_me`` alert exists; downgrade only with explicit human
    authorization.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import context, op
from sqlalchemy.dialects import postgresql

revision: str = "0041"
down_revision: str | None = "0040"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

#: Same shape as 0038's list: these customer tables get the owner-rows policy.
OWNED_TABLES: dict[str, str] = {"security_notices": "user_id"}

_POLICY = "xspeeria_owner_rows"
_RULE = (
    "(current_setting('xspeeria.scope', true) = 'system' "
    "OR (current_setting('xspeeria.scope', true) = 'user' "
    "AND user_id = NULLIF(current_setting('xspeeria.user_id', true), '')::uuid))"
)
_RULES = "'pin_lockout', 'code_lockout', 'disputes_against', 'payout_name_mismatch', 'staff_report'"
_RULE_CHECK = "ck_fraud_alerts_rule_allowed"


def upgrade() -> None:
    op.create_table(
        "security_notices",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("kind", sa.String(length=40), nullable=False),
        sa.Column("device", sa.String(length=120), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("attempts", sa.SmallInteger(), nullable=False, server_default=sa.text("0")),
        sa.Column("next_try_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("gave_up_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("token_hash", sa.CHAR(length=64), nullable=True),
        sa.Column("token_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reported_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "attempts BETWEEN 0 AND 10", name=op.f("ck_security_notices_attempts_range")
        ),
        sa.CheckConstraint(
            "token_hash IS NULL OR token_hash ~ '^[0-9a-f]{64}$'",
            name=op.f("ck_security_notices_token_hash_format"),
        ),
        sa.CheckConstraint(
            "(token_hash IS NULL) = (token_expires_at IS NULL)",
            name=op.f("ck_security_notices_token_has_expiry"),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_security_notices_user_id_users"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_security_notices")),
        sa.UniqueConstraint("token_hash", name=op.f("uq_security_notices_token_hash")),
    )
    op.create_index(
        "ix_security_notices_unsent",
        "security_notices",
        ["created_at"],
        postgresql_where=sa.text("sent_at IS NULL AND gave_up_at IS NULL"),
    )
    op.create_index("ix_security_notices_user", "security_notices", ["user_id", "created_at"])
    op.execute("REVOKE ALL ON security_notices FROM PUBLIC")
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON security_notices TO xspeeria_app")
    for table in OWNED_TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(f"CREATE POLICY {_POLICY} ON {table} FOR ALL USING {_RULE} WITH CHECK {_RULE}")

    op.drop_constraint(op.f(_RULE_CHECK), "fraud_alerts", type_="check")
    op.create_check_constraint(
        op.f(_RULE_CHECK), "fraud_alerts", f"rule IN ({_RULES}, 'customer_reported_not_me')"
    )


def downgrade() -> None:
    authorized = "authorized" in (
        context.get_x_argument(as_dictionary=True).get("records_downgrade"),
        context.config.attributes.get("records_downgrade"),
    )
    if not authorized:
        raise RuntimeError(
            "Refusing to drop the security notices (unsent warnings and their links would be "
            "lost). Pass -x records_downgrade=authorized only with explicit human authorization."
        )
    reported = op.get_bind().scalar(
        sa.text("SELECT count(*) FROM fraud_alerts WHERE rule = 'customer_reported_not_me'")
    )
    if reported:
        raise RuntimeError(
            "Refusing to downgrade: fraud alerts from customers' 'this wasn't me' reports exist"
        )
    op.drop_constraint(op.f(_RULE_CHECK), "fraud_alerts", type_="check")
    op.create_check_constraint(op.f(_RULE_CHECK), "fraud_alerts", f"rule IN ({_RULES})")
    op.execute(f"DROP POLICY IF EXISTS {_POLICY} ON security_notices")
    op.drop_index("ix_security_notices_user", table_name="security_notices")
    op.drop_index("ix_security_notices_unsent", table_name="security_notices")
    op.drop_table("security_notices")
