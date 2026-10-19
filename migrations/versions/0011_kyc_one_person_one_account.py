# ruff: noqa: E501
"""KYC: one verified account per person (ADR-041)

* ``kyc_cases.identity_key``: HMAC-SHA256 (hex) of the ID document, set once. Never the
  document number itself.
* ``kyc_cases.review_reason``: why a case is held for a person (internal).
* Partial unique index: one *approved* case per identity key (backstop to the advisory lock).
* Guard trigger (XS003) also keeps ``identity_key`` set-once.

``downgrade()`` drops the two columns (no money, no history of decisions lost: status,
decision_reason and the identity fields stay) but refuses unless
``-x records_downgrade=authorized``.

Revision ID: 0011
Revises: 0010
Create Date: 2026-10-19 12:40:00

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

revision: str = "0011"
down_revision: str | None = "0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("kyc_cases", sa.Column("identity_key", sa.CHAR(length=64), nullable=True))
    op.add_column("kyc_cases", sa.Column("review_reason", sa.String(length=32), nullable=True))
    op.create_check_constraint(
        op.f("ck_kyc_cases_review_reason_allowed"),
        "kyc_cases",
        "review_reason IS NULL OR review_reason IN ('DUPLICATE_IDENTITY', 'CHECKS_INCOMPLETE')",
    )
    op.create_index(
        "uq_kyc_cases_identity_approved",
        "kyc_cases",
        ["identity_key"],
        unique=True,
        postgresql_where=sa.text("status = 'approved' AND identity_key IS NOT NULL"),
    )
    op.create_index("ix_kyc_cases_identity_key", "kyc_cases", ["identity_key"], unique=False)
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
       OR NEW.created_at <> OLD.created_at THEN
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

# The 0010 guard, restored on downgrade.
_GUARD_0010 = _GUARD.replace(
    """    IF OLD.identity_key IS NOT NULL AND NEW.identity_key IS DISTINCT FROM OLD.identity_key THEN
        RAISE EXCEPTION 'identity key is set once' USING ERRCODE = 'XS003';
    END IF;
""",
    "",
)


def downgrade() -> None:
    authorized = "authorized" in (
        context.get_x_argument(as_dictionary=True).get("records_downgrade"),
        context.config.attributes.get("records_downgrade"),
    )
    if not authorized:
        raise RuntimeError(
            "Refusing to drop identity keys. Pass -x records_downgrade=authorized "
            "only with explicit human authorization."
        )
    op.execute(_GUARD_0010)
    op.drop_index("ix_kyc_cases_identity_key", table_name="kyc_cases")
    op.drop_index(
        "uq_kyc_cases_identity_approved",
        table_name="kyc_cases",
        postgresql_where=sa.text("status = 'approved' AND identity_key IS NOT NULL"),
    )
    op.drop_constraint(op.f("ck_kyc_cases_review_reason_allowed"), "kyc_cases", type_="check")
    op.drop_column("kyc_cases", "review_reason")
    op.drop_column("kyc_cases", "identity_key")
