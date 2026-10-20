# ruff: noqa: E501
"""Face check, fingerprint and email codes replace the authenticator — ADR-054

* ``verification_checks``: one row per second check after the PIN (sign-up, log-in on a new
  phone, a confirmation, a PIN reset). Codes are kept only as keyed digests; the face check
  keeps only the provider session id and the approved/declined result.

The authenticator tables (``mfa_factors``, ``recovery_codes``, ``mfa_challenges``) are kept,
unused, so no history is dropped.

``downgrade()`` refuses unless ``-x records_downgrade=authorized``.

Revision ID: 0017
Revises: 0016
Create Date: 2026-10-20 10:00:00

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

revision: str = "0017"
down_revision: str | None = "0016"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "verification_checks",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("purpose", sa.String(length=12), nullable=False),
        sa.Column("method", sa.String(length=12), nullable=False),
        sa.Column("action", sa.String(length=48), nullable=True),
        sa.Column("session_id", sa.UUID(), nullable=True),
        sa.Column("email_code_digest", sa.CHAR(length=64), nullable=True),
        sa.Column("sms_code_digest", sa.CHAR(length=64), nullable=True),
        sa.Column("face_session_id", sa.String(length=64), nullable=True),
        sa.Column("face_result", sa.String(length=10), nullable=True),
        sa.Column("device_id", sa.String(length=128), nullable=True),
        sa.Column("user_agent", sa.String(length=256), nullable=True),
        sa.Column("ip_address", sa.String(length=45), nullable=True),
        sa.Column("attempts", sa.SmallInteger(), server_default=sa.text("0"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "purpose IN ('signup', 'login', 'step_up', 'pin_reset')",
            name=op.f("ck_verification_checks_purpose_allowed"),
        ),
        sa.CheckConstraint(
            "method IN ('email', 'sms_email', 'face')",
            name=op.f("ck_verification_checks_method_allowed"),
        ),
        sa.CheckConstraint(
            "attempts BETWEEN 0 AND 5", name=op.f("ck_verification_checks_attempts_range")
        ),
        sa.CheckConstraint(
            "expires_at > created_at", name=op.f("ck_verification_checks_expires_after_created")
        ),
        sa.CheckConstraint(
            "(purpose = 'step_up') = (action IS NOT NULL AND session_id IS NOT NULL)",
            name=op.f("ck_verification_checks_step_up_has_action"),
        ),
        sa.CheckConstraint(
            "method <> 'face' OR (email_code_digest IS NULL AND sms_code_digest IS NULL)",
            name=op.f("ck_verification_checks_face_has_no_codes"),
        ),
        sa.CheckConstraint(
            "face_result IS NULL OR face_result IN ('approved', 'declined')",
            name=op.f("ck_verification_checks_face_result_allowed"),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_verification_checks_user_id_users"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["session_id"],
            ["auth_sessions.id"],
            name=op.f("fk_verification_checks_session_id_auth_sessions"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_verification_checks")),
    )
    op.create_index(
        "ix_verification_checks_user_id", "verification_checks", ["user_id"], unique=False
    )
    op.execute("GRANT SELECT, INSERT, UPDATE ON verification_checks TO xspeeria_app")


def downgrade() -> None:
    authorized = "authorized" in (
        context.get_x_argument(as_dictionary=True).get("records_downgrade"),
        context.config.attributes.get("records_downgrade"),
    )
    if not authorized:
        raise RuntimeError(
            "Refusing to drop verification check records. Pass -x records_downgrade=authorized "
            "only with explicit human authorization."
        )
    op.drop_index("ix_verification_checks_user_id", table_name="verification_checks")
    op.drop_table("verification_checks")
