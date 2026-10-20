# ruff: noqa: E501
"""KYC: identity checks per country — NG, GB, US (ADR-042, ADR-043)

* ``kyc_cases.country CHAR(2)`` — the country a check verifies. Existing rows were the
  Nigerian check: set to ``NG``. Set once (guard trigger XS003).
* One open check per user **per country** (replaces one per user).
* ``review_reason`` also allows ``IDENTITY_MISMATCH``.

``downgrade()`` refuses unless ``-x records_downgrade=authorized``; it fails if a user has
open checks in two countries (the old one-per-user index cannot hold them).

Revision ID: 0012
Revises: 0011
Create Date: 2026-10-19 13:10:00

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

revision: str = "0012"
down_revision: str | None = "0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_ACTIVE = "status IN ('pending_documents', 'under_review')"
_REASONS_0011 = (
    "review_reason IS NULL OR review_reason IN ('DUPLICATE_IDENTITY', 'CHECKS_INCOMPLETE')"
)
_REASONS_0012 = "review_reason IS NULL OR review_reason IN ('DUPLICATE_IDENTITY', 'CHECKS_INCOMPLETE', 'IDENTITY_MISMATCH')"


def upgrade() -> None:
    op.add_column("kyc_cases", sa.Column("country", sa.CHAR(length=2), nullable=True))
    # The guard trigger allows this: country is new, nothing else changes.
    op.execute("UPDATE kyc_cases SET country = 'NG'")
    op.alter_column("kyc_cases", "country", nullable=False)
    op.create_check_constraint(
        op.f("ck_kyc_cases_country_allowed"), "kyc_cases", "country IN ('NG', 'GB', 'US')"
    )
    op.drop_index(
        "uq_kyc_cases_one_active", table_name="kyc_cases", postgresql_where=sa.text(_ACTIVE)
    )
    op.create_index(
        "uq_kyc_cases_one_active",
        "kyc_cases",
        ["user_id", "country"],
        unique=True,
        postgresql_where=sa.text(_ACTIVE),
    )
    op.drop_constraint(op.f("ck_kyc_cases_review_reason_allowed"), "kyc_cases", type_="check")
    op.create_check_constraint(
        op.f("ck_kyc_cases_review_reason_allowed"), "kyc_cases", _REASONS_0012
    )
    op.execute(_GUARD)


_GUARD = """
CREATE OR REPLACE FUNCTION xspeeria_kyc_case_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'kyc cases are never deleted' USING ERRCODE = 'XS003';
    END IF;
    IF NEW.user_id <> OLD.user_id OR NEW.provider <> OLD.provider
       OR NEW.provider_session_id <> OLD.provider_session_id
       OR NEW.created_at <> OLD.created_at
       OR NEW.country IS DISTINCT FROM OLD.country THEN
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

# The 0011 guard (without the country rule), restored on downgrade.
_GUARD_0011 = _GUARD.replace(
    """       OR NEW.created_at <> OLD.created_at
       OR NEW.country IS DISTINCT FROM OLD.country THEN""",
    """       OR NEW.created_at <> OLD.created_at THEN""",
)


def downgrade() -> None:
    authorized = "authorized" in (
        context.get_x_argument(as_dictionary=True).get("records_downgrade"),
        context.config.attributes.get("records_downgrade"),
    )
    if not authorized:
        raise RuntimeError(
            "Refusing to drop the country of identity checks. Pass -x records_downgrade=authorized "
            "only with explicit human authorization."
        )
    op.execute(_GUARD_0011)
    op.drop_constraint(op.f("ck_kyc_cases_review_reason_allowed"), "kyc_cases", type_="check")
    op.create_check_constraint(
        op.f("ck_kyc_cases_review_reason_allowed"), "kyc_cases", _REASONS_0011
    )
    op.drop_index(
        "uq_kyc_cases_one_active", table_name="kyc_cases", postgresql_where=sa.text(_ACTIVE)
    )
    op.create_index(
        "uq_kyc_cases_one_active",
        "kyc_cases",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text(_ACTIVE),
    )
    op.drop_constraint(op.f("ck_kyc_cases_country_allowed"), "kyc_cases", type_="check")
    op.drop_column("kyc_cases", "country")
