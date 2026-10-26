# ruff: noqa: E501
"""Admin console staff — ADR-051 A-1, ADR-060

Staff accounts separate from customers: ``staff_roles`` (permissions per role; the four
built-in roles of TDS §11.2 are inserted here), ``staff_accounts`` (password as an Argon2id
hash), ``staff_codes`` (emailed codes as keyed HMACs), ``staff_sessions`` (cookie as SHA-256)
and ``staff_audit_log`` — append-only: a trigger refuses UPDATE and DELETE, and the app role
may only read and insert.

``downgrade()`` refuses unless ``-x records_downgrade=authorized`` (it would delete the audit log).

Revision ID: 0023
Revises: 0022
Create Date: 2026-10-26 20:00:00

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
from sqlalchemy.dialects import postgresql

revision: str = "0023"
down_revision: str | None = "0022"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TS = sa.DateTime(timezone=True)

#: TDS §11.2 built-in roles as of this migration (a copy, so later rule changes don't
#: rewrite history; later changes need their own migration).
_ROLES = {
    "super_admin": (
        "Full access. Hardware security key required before live money.",
        [
            "audit.approve",
            "audit.create",
            "audit.delete",
            "audit.read",
            "audit.update",
            "dashboard.approve",
            "dashboard.create",
            "dashboard.delete",
            "dashboard.read",
            "dashboard.update",
            "disputes.approve",
            "disputes.create",
            "disputes.delete",
            "disputes.read",
            "disputes.update",
            "fraud_alerts.approve",
            "fraud_alerts.create",
            "fraud_alerts.delete",
            "fraud_alerts.read",
            "fraud_alerts.update",
            "kyc.approve",
            "kyc.create",
            "kyc.delete",
            "kyc.read",
            "kyc.update",
            "outages.approve",
            "outages.create",
            "outages.delete",
            "outages.read",
            "outages.update",
            "reversals.approve",
            "reversals.create",
            "reversals.delete",
            "reversals.read",
            "reversals.update",
            "roles.approve",
            "roles.create",
            "roles.delete",
            "roles.read",
            "roles.update",
            "staff.approve",
            "staff.create",
            "staff.delete",
            "staff.read",
            "staff.update",
            "users.approve",
            "users.create",
            "users.delete",
            "users.read",
            "users.update",
        ],
    ),
    "compliance_officer": (
        "Full identity-check and fraud (KYC/AML) access, read-only elsewhere.",
        [
            "audit.read",
            "dashboard.read",
            "disputes.read",
            "fraud_alerts.approve",
            "fraud_alerts.create",
            "fraud_alerts.delete",
            "fraud_alerts.read",
            "fraud_alerts.update",
            "kyc.approve",
            "kyc.create",
            "kyc.delete",
            "kyc.read",
            "kyc.update",
            "outages.read",
            "reversals.read",
            "roles.read",
            "staff.read",
            "users.read",
        ],
    ),
    "ops_admin": (
        "Manual deal and settlement intervention; read-only identity checks.",
        [
            "audit.read",
            "dashboard.read",
            "disputes.read",
            "kyc.read",
            "outages.create",
            "outages.read",
            "outages.update",
            "reversals.approve",
            "reversals.create",
            "reversals.read",
            "reversals.update",
            "users.read",
        ],
    ),
    "support_agent": (
        "Customer support: read users, open and work on disputes.",
        ["dashboard.read", "disputes.create", "disputes.read", "disputes.update", "users.read"],
    ),
}


def upgrade() -> None:
    op.create_table(
        "staff_roles",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(length=40), nullable=False),
        sa.Column("description", sa.String(length=200), server_default="", nullable=False),
        sa.Column("permissions", postgresql.ARRAY(sa.String(length=40)), nullable=False),
        sa.Column("builtin", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("created_at", _TS, nullable=False),
        sa.Column("updated_at", _TS, nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_staff_roles")),
        sa.UniqueConstraint("name", name=op.f("uq_staff_roles_name")),
    )
    op.create_table(
        "staff_accounts",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("email", sa.String(length=254), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("role_id", sa.UUID(), nullable=False),
        sa.Column("status", sa.String(length=10), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=True),
        sa.Column("failed_logins", sa.SmallInteger(), server_default="0", nullable=False),
        sa.Column("locked_until", _TS, nullable=True),
        sa.Column("password_changed_at", _TS, nullable=True),
        sa.Column("last_login_at", _TS, nullable=True),
        sa.Column("created_by", sa.UUID(), nullable=True),
        sa.Column("created_at", _TS, nullable=False),
        sa.Column("updated_at", _TS, nullable=False),
        sa.CheckConstraint(
            "status IN ('active', 'disabled')", name=op.f("ck_staff_accounts_status_allowed")
        ),
        sa.CheckConstraint("email = lower(email)", name=op.f("ck_staff_accounts_email_lowercase")),
        sa.ForeignKeyConstraint(
            ["role_id"],
            ["staff_roles.id"],
            name=op.f("fk_staff_accounts_role_id_staff_roles"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["staff_accounts.id"],
            name=op.f("fk_staff_accounts_created_by_staff_accounts"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_staff_accounts")),
        sa.UniqueConstraint("email", name=op.f("uq_staff_accounts_email")),
    )
    op.create_table(
        "staff_codes",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("staff_id", sa.UUID(), nullable=True),
        sa.Column("purpose", sa.String(length=10), nullable=False),
        sa.Column("code_digest", sa.String(length=64), nullable=False),
        sa.Column("tries", sa.SmallInteger(), server_default="0", nullable=False),
        sa.Column("expires_at", _TS, nullable=False),
        sa.Column("used_at", _TS, nullable=True),
        sa.Column("created_at", _TS, nullable=False),
        sa.CheckConstraint(
            "purpose IN ('login', 'password')", name=op.f("ck_staff_codes_purpose_allowed")
        ),
        sa.ForeignKeyConstraint(
            ["staff_id"],
            ["staff_accounts.id"],
            name=op.f("fk_staff_codes_staff_id_staff_accounts"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_staff_codes")),
    )
    op.create_index("ix_staff_codes_staff", "staff_codes", ["staff_id", "purpose", "created_at"])
    op.create_table(
        "staff_sessions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("staff_id", sa.UUID(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("created_at", _TS, nullable=False),
        sa.Column("last_seen_at", _TS, nullable=False),
        sa.Column("expires_at", _TS, nullable=False),
        sa.Column("revoked_at", _TS, nullable=True),
        sa.Column("ip_address", sa.String(length=45), nullable=True),
        sa.Column("user_agent", sa.String(length=256), nullable=True),
        sa.ForeignKeyConstraint(
            ["staff_id"],
            ["staff_accounts.id"],
            name=op.f("fk_staff_sessions_staff_id_staff_accounts"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_staff_sessions")),
        sa.UniqueConstraint("token_hash", name=op.f("uq_staff_sessions_token_hash")),
    )
    op.create_index("ix_staff_sessions_staff", "staff_sessions", ["staff_id"])
    op.create_table(
        "staff_audit_log",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), nullable=False),
        sa.Column("at", _TS, nullable=False),
        sa.Column("staff_id", sa.UUID(), nullable=True),
        sa.Column("action", sa.String(length=48), nullable=False),
        sa.Column("target_type", sa.String(length=24), nullable=True),
        sa.Column("target_id", sa.String(length=64), nullable=True),
        sa.Column("detail", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("ip_address", sa.String(length=45), nullable=True),
        sa.Column("user_agent", sa.String(length=256), nullable=True),
        sa.ForeignKeyConstraint(
            ["staff_id"],
            ["staff_accounts.id"],
            name=op.f("fk_staff_audit_log_staff_id_staff_accounts"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_staff_audit_log")),
    )
    op.create_index("ix_staff_audit_log_at", "staff_audit_log", ["at"])
    op.create_index("ix_staff_audit_log_staff", "staff_audit_log", ["staff_id", "at"])
    op.execute(
        """
        CREATE FUNCTION staff_audit_log_append_only() RETURNS trigger
        LANGUAGE plpgsql AS $$
        BEGIN
            RAISE EXCEPTION 'staff_audit_log is append-only';
        END;
        $$;
        """
    )
    op.execute(
        "CREATE TRIGGER trg_staff_audit_log_append_only BEFORE UPDATE OR DELETE ON staff_audit_log "
        "FOR EACH ROW EXECUTE FUNCTION staff_audit_log_append_only()"
    )

    bind = op.get_bind()
    for name, (description, permissions) in _ROLES.items():
        bind.execute(
            sa.text(
                "INSERT INTO staff_roles (id, name, description, permissions, builtin, created_at, updated_at) "
                "VALUES (gen_random_uuid(), :name, :description, :permissions, true, now(), now())"
            ),
            {"name": name, "description": description, "permissions": permissions},
        )

    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON staff_roles TO xspeeria_app")
    op.execute(
        "GRANT SELECT, INSERT, UPDATE ON staff_accounts, staff_codes, staff_sessions TO xspeeria_app"
    )
    op.execute("GRANT SELECT, INSERT ON staff_audit_log TO xspeeria_app")


def downgrade() -> None:
    authorized = "authorized" in (
        context.get_x_argument(as_dictionary=True).get("records_downgrade"),
        context.config.attributes.get("records_downgrade"),
    )
    if not authorized:
        raise RuntimeError(
            "Refusing to drop the staff tables and their audit log. Pass "
            "-x records_downgrade=authorized only with explicit human authorization."
        )
    op.execute("DROP TRIGGER trg_staff_audit_log_append_only ON staff_audit_log")
    op.execute("DROP FUNCTION staff_audit_log_append_only()")
    op.drop_index("ix_staff_audit_log_staff", table_name="staff_audit_log")
    op.drop_index("ix_staff_audit_log_at", table_name="staff_audit_log")
    op.drop_table("staff_audit_log")
    op.drop_index("ix_staff_sessions_staff", table_name="staff_sessions")
    op.drop_table("staff_sessions")
    op.drop_index("ix_staff_codes_staff", table_name="staff_codes")
    op.drop_table("staff_codes")
    op.drop_table("staff_accounts")
    op.drop_table("staff_roles")
