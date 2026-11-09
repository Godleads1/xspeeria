"""Redo identity check — ADR-104 (owner 2026-11-09).

Owner: build the "redo identity check" button ("Yes."); the new check counts automatically
only for the same ID document, otherwise Compliance decides ("Same ID, else staff").

* ``users.identity_redo_requested_at`` / ``identity_redo_reason``: set by Compliance; the next
  log-in on a new phone asks for a full identity check instead of the face check. Who set it
  is in the staff audit log (no foreign key to staff, so staff rows can be cleared alone).
* ``kyc_cases.purpose``: ``standard`` or ``redo`` (set once; the guard now refuses a change).
* ``kyc_cases.review_reason`` may be ``REDO_NEW_DOCUMENT``: a redo on a different document.
* ``verification_checks.method`` may be ``kyc``, with ``kyc_case_id`` naming the redo case.

Revision ID: 0048
Revises: 0047
Create Date: 2026-11-09 18:00:00

REVIEW CHECKLIST -- every migration on this project is read by a human before it runs:
  * New nullable columns, and ``purpose`` with default ``standard`` for existing cases.
  * Two check constraints widened; the KYC guard trigger also protects ``purpose``.
  * Downgrade refuses if any redo case or ``kyc`` check exists (it would delete history).
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0048"
down_revision: str | None = "0047"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_REASONS_OLD = (
    "review_reason IS NULL OR review_reason IN "
    "('DUPLICATE_IDENTITY', 'CHECKS_INCOMPLETE', 'IDENTITY_MISMATCH')"
)
_REASONS_NEW = (
    "review_reason IS NULL OR review_reason IN "
    "('DUPLICATE_IDENTITY', 'CHECKS_INCOMPLETE', 'IDENTITY_MISMATCH', 'REDO_NEW_DOCUMENT')"
)
_METHODS_OLD = "method IN ('email', 'sms_email', 'face')"
_METHODS_NEW = "method IN ('email', 'sms_email', 'face', 'kyc')"

_GUARD_BODY = """
CREATE OR REPLACE FUNCTION xspeeria_kyc_case_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'kyc cases are never deleted' USING ERRCODE = 'XS003';
    END IF;
    IF NEW.user_id <> OLD.user_id OR NEW.provider <> OLD.provider
       OR NEW.provider_session_id <> OLD.provider_session_id
       OR NEW.created_at <> OLD.created_at
       OR NEW.country IS DISTINCT FROM OLD.country{purpose} THEN
        RAISE EXCEPTION 'kyc case identity is immutable' USING ERRCODE = 'XS003';
    END IF;
    IF OLD.legal_name IS NOT NULL AND (
         NEW.legal_name IS DISTINCT FROM OLD.legal_name
         OR NEW.date_of_birth IS DISTINCT FROM OLD.date_of_birth
         OR NEW.id_type IS DISTINCT FROM OLD.id_type
         OR NEW.issuing_country IS DISTINCT FROM OLD.issuing_country) THEN
        RAISE EXCEPTION 'verified identity is set once' USING ERRCODE = 'XS003';
    END IF;
    IF OLD.identity_key IS NOT NULL AND NEW.identity_key IS DISTINCT FROM OLD.identity_key THEN
        RAISE EXCEPTION 'identity key is set once' USING ERRCODE = 'XS003';
    END IF;
    IF NEW.status <> OLD.status AND NOT (
         (OLD.status = 'pending_documents'
            AND NEW.status IN ('under_review', 'approved', 'rejected', 'expired'))
      OR (OLD.status = 'under_review' AND NEW.status IN ('approved', 'rejected', 'expired'))
      OR (OLD.status = 'approved' AND NEW.status = 'expired')) THEN
        RAISE EXCEPTION 'kyc status % -> % is not allowed', OLD.status, NEW.status
            USING ERRCODE = 'XS003';
    END IF;
    RETURN NEW;
END $$
"""
_GUARD = _GUARD_BODY.replace("{purpose}", "\n       OR NEW.purpose IS DISTINCT FROM OLD.purpose")
_GUARD_0012 = _GUARD_BODY.replace("{purpose}", "")


def upgrade() -> None:
    op.add_column("users", sa.Column("identity_redo_requested_at", sa.DateTime(timezone=True)))
    op.add_column("users", sa.Column("identity_redo_reason", sa.String(length=500)))
    op.create_check_constraint(
        op.f("ck_users_identity_redo_reason_with_request"),
        "users",
        "(identity_redo_requested_at IS NULL) = (identity_redo_reason IS NULL)",
    )

    op.add_column(
        "kyc_cases",
        sa.Column(
            "purpose", sa.String(length=8), nullable=False, server_default=sa.text("'standard'")
        ),
    )
    op.create_check_constraint(
        op.f("ck_kyc_cases_purpose_allowed"), "kyc_cases", "purpose IN ('standard', 'redo')"
    )
    op.drop_constraint(op.f("ck_kyc_cases_review_reason_allowed"), "kyc_cases", type_="check")
    op.create_check_constraint(
        op.f("ck_kyc_cases_review_reason_allowed"), "kyc_cases", _REASONS_NEW
    )
    op.execute(_GUARD)

    op.add_column(
        "verification_checks",
        sa.Column(
            "kyc_case_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(
                "kyc_cases.id",
                name=op.f("fk_verification_checks_kyc_case_id_kyc_cases"),
                ondelete="RESTRICT",
            ),
        ),
    )
    op.drop_constraint(
        op.f("ck_verification_checks_method_allowed"), "verification_checks", type_="check"
    )
    op.create_check_constraint(
        op.f("ck_verification_checks_method_allowed"), "verification_checks", _METHODS_NEW
    )
    op.create_check_constraint(
        op.f("ck_verification_checks_kyc_case_only_for_kyc"),
        "verification_checks",
        "kyc_case_id IS NULL OR method = 'kyc'",
    )
    op.create_check_constraint(
        op.f("ck_verification_checks_kyc_has_no_codes"),
        "verification_checks",
        "method <> 'kyc' OR (email_code_digest IS NULL AND sms_code_digest IS NULL)",
    )


def downgrade() -> None:
    bind = op.get_bind()
    used = bind.execute(
        sa.text(
            "SELECT (SELECT count(*) FROM kyc_cases WHERE purpose = 'redo')"
            " + (SELECT count(*) FROM verification_checks WHERE method = 'kyc')"
        )
    ).scalar_one()
    if used:
        raise RuntimeError(
            "Refusing to downgrade 0048: redo identity checks exist and would lose their record."
        )
    op.drop_constraint(
        op.f("ck_verification_checks_kyc_has_no_codes"), "verification_checks", type_="check"
    )
    op.drop_constraint(
        op.f("ck_verification_checks_kyc_case_only_for_kyc"), "verification_checks", type_="check"
    )
    op.drop_constraint(
        op.f("ck_verification_checks_method_allowed"), "verification_checks", type_="check"
    )
    op.create_check_constraint(
        op.f("ck_verification_checks_method_allowed"), "verification_checks", _METHODS_OLD
    )
    op.drop_column("verification_checks", "kyc_case_id")
    op.execute(_GUARD_0012)
    op.drop_constraint(op.f("ck_kyc_cases_review_reason_allowed"), "kyc_cases", type_="check")
    op.create_check_constraint(
        op.f("ck_kyc_cases_review_reason_allowed"), "kyc_cases", _REASONS_OLD
    )
    op.drop_constraint(op.f("ck_kyc_cases_purpose_allowed"), "kyc_cases", type_="check")
    op.drop_column("kyc_cases", "purpose")
    op.drop_constraint(op.f("ck_users_identity_redo_reason_with_request"), "users", type_="check")
    op.drop_column("users", "identity_redo_reason")
    op.drop_column("users", "identity_redo_requested_at")
