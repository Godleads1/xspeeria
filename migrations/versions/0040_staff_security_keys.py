"""Super Admin hardware security keys — ADR-051 Decision 2, ADR-081 (owner 2026-11-02)

Owner: "go" (2026-11-02) on item 6, "Super Admin hardware key isn't built yet (required before
live money)". ADR-051 Decision 2: "Release gate: Super Admin must use a hardware security key
before real customer money goes live."

* ``staff_security_keys``: one row per registered WebAuthn/FIDO2 key. Only the public key is
  stored. Deleting a key removes the row (the audit log keeps who did it and why).
* ``staff_key_challenges``: one-time challenges (register a key, or the key step of a log-in),
  valid for 5 minutes.
* ``staff_sessions.key_setup_only``: a Super Admin who must use a key but has none gets a
  session that can only register one.

Revision ID: 0040
Revises: 0039
Create Date: 2026-11-02 20:00:00

REVIEW CHECKLIST -- every migration on this project is read by a human before it runs:
  * Two new tables and one new column with a default; no existing data is changed.
  * Downgrade drops them: anyone with a registered key would sign in with the email code
    alone again, so downgrade only with explicit human authorization.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import context, op
from sqlalchemy.dialects import postgresql

revision: str = "0040"
down_revision: str | None = "0039"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "staff_sessions",
        sa.Column("key_setup_only", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.create_table(
        "staff_security_keys",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("staff_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("credential_id", sa.LargeBinary(), nullable=False),
        sa.Column("public_key", sa.LargeBinary(), nullable=False),
        sa.Column("sign_count", sa.BigInteger(), nullable=False),
        sa.Column("name", sa.String(length=60), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "char_length(name) BETWEEN 1 AND 60", name=op.f("ck_staff_security_keys_name_length")
        ),
        sa.CheckConstraint(
            "sign_count >= 0", name=op.f("ck_staff_security_keys_sign_count_positive")
        ),
        sa.ForeignKeyConstraint(
            ["staff_id"],
            ["staff_accounts.id"],
            name=op.f("fk_staff_security_keys_staff_id_staff_accounts"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_staff_security_keys")),
        sa.UniqueConstraint("credential_id", name=op.f("uq_staff_security_keys_credential_id")),
    )
    op.create_index("ix_staff_security_keys_staff", "staff_security_keys", ["staff_id"])
    op.create_table(
        "staff_key_challenges",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("staff_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("purpose", sa.String(length=10), nullable=False),
        sa.Column("challenge", sa.LargeBinary(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "purpose IN ('register', 'login')",
            name=op.f("ck_staff_key_challenges_purpose_allowed"),
        ),
        sa.ForeignKeyConstraint(
            ["staff_id"],
            ["staff_accounts.id"],
            name=op.f("fk_staff_key_challenges_staff_id_staff_accounts"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_staff_key_challenges")),
    )
    op.create_index(
        "ix_staff_key_challenges_staff", "staff_key_challenges", ["staff_id", "created_at"]
    )
    for table in ("staff_security_keys", "staff_key_challenges"):
        op.execute(f"REVOKE ALL ON {table} FROM PUBLIC")
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON staff_security_keys TO xspeeria_app")
    op.execute("GRANT SELECT, INSERT, UPDATE ON staff_key_challenges TO xspeeria_app")


def downgrade() -> None:
    authorized = "authorized" in (
        context.get_x_argument(as_dictionary=True).get("records_downgrade"),
        context.config.attributes.get("records_downgrade"),
    )
    if not authorized:
        raise RuntimeError(
            "Refusing to drop the staff security keys (Super Admins would sign in without "
            "them). Pass -x records_downgrade=authorized only with explicit human authorization."
        )
    op.drop_index("ix_staff_key_challenges_staff", table_name="staff_key_challenges")
    op.drop_table("staff_key_challenges")
    op.drop_index("ix_staff_security_keys_staff", table_name="staff_security_keys")
    op.drop_table("staff_security_keys")
    op.drop_column("staff_sessions", "key_setup_only")
