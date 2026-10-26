"""Staff review of identity checks Xspeeria holds — ADR-069 (owner 2026-10-27)

Owner: Didit's own "In Review" cases stay in Didit's console; a case Xspeeria holds (same person
on another account, second-country ID that doesn't match, checks incomplete) may be approved
only by **two people** — one recommends with a reason, a different one confirms. Rejecting
needs one person and a reason (shown to the customer).

* ``kyc_reviews``: one approval recommendation per row (pending → confirmed or declined),
  decided once (trigger), the confirmer never the recommender (CHECK), one pending per case.

Revision ID: 0031
Revises: 0030
Create Date: 2026-10-27 01:00:00

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

revision: str = "0031"
down_revision: str | None = "0030"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_GUARD = """
CREATE FUNCTION kyc_reviews_decided_once() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'pending' OR NEW.decided_by IS NOT NULL OR NEW.decided_at IS NOT NULL THEN
      RAISE EXCEPTION 'a review starts as pending' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'review % is already decided', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.id <> OLD.id OR NEW.kyc_case_id <> OLD.kyc_case_id OR NEW.reason <> OLD.reason
     OR NEW.recommended_by <> OLD.recommended_by OR NEW.recommended_at <> OLD.recommended_at THEN
    RAISE EXCEPTION 'a review cannot be rewritten' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$
"""
_TRIGGER = (
    "CREATE TRIGGER trg_kyc_reviews_decided_once BEFORE INSERT OR UPDATE ON kyc_reviews "
    "FOR EACH ROW EXECUTE FUNCTION kyc_reviews_decided_once()"
)


def upgrade() -> None:
    op.create_table(
        "kyc_reviews",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("kyc_case_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(length=10), nullable=False, server_default="pending"),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("recommended_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("recommended_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("decided_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("decision_note", sa.Text(), nullable=True),
        sa.CheckConstraint(
            "status IN ('pending', 'confirmed', 'declined')",
            name=op.f("ck_kyc_reviews_status_allowed"),
        ),
        sa.CheckConstraint(
            "char_length(btrim(reason)) BETWEEN 5 AND 1000",
            name=op.f("ck_kyc_reviews_reason_length"),
        ),
        sa.CheckConstraint(
            "decision_note IS NULL OR char_length(decision_note) BETWEEN 1 AND 1000",
            name=op.f("ck_kyc_reviews_note_length"),
        ),
        # Owner 2026-10-27: two people approve a held identity check.
        sa.CheckConstraint(
            "decided_by IS NULL OR decided_by <> recommended_by",
            name=op.f("ck_kyc_reviews_second_person"),
        ),
        sa.CheckConstraint(
            "(status = 'pending') = (decided_by IS NULL AND decided_at IS NULL)",
            name=op.f("ck_kyc_reviews_decided_has_who_and_when"),
        ),
        sa.CheckConstraint(
            "status <> 'declined' OR decision_note IS NOT NULL",
            name=op.f("ck_kyc_reviews_decline_has_note"),
        ),
        sa.ForeignKeyConstraint(
            ["kyc_case_id"],
            ["kyc_cases.id"],
            name=op.f("fk_kyc_reviews_kyc_case_id_kyc_cases"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["recommended_by"],
            ["staff_accounts.id"],
            name=op.f("fk_kyc_reviews_recommended_by_staff_accounts"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["decided_by"],
            ["staff_accounts.id"],
            name=op.f("fk_kyc_reviews_decided_by_staff_accounts"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_kyc_reviews")),
    )
    op.create_index(
        "uq_kyc_reviews_one_pending",
        "kyc_reviews",
        ["kyc_case_id"],
        unique=True,
        postgresql_where=sa.text("status = 'pending'"),
    )
    op.execute(_GUARD)
    op.execute(_TRIGGER)
    op.execute("REVOKE ALL ON kyc_reviews FROM PUBLIC")
    op.execute("GRANT SELECT, INSERT, UPDATE ON kyc_reviews TO xspeeria_app")


def downgrade() -> None:
    authorized = "authorized" in (
        context.get_x_argument(as_dictionary=True).get("records_downgrade"),
        context.config.attributes.get("records_downgrade"),
    )
    if not authorized:
        raise RuntimeError(
            "Refusing to drop identity-check reviews. Pass -x records_downgrade=authorized only "
            "with explicit human authorization."
        )
    op.execute("DROP TRIGGER IF EXISTS trg_kyc_reviews_decided_once ON kyc_reviews")
    op.execute("DROP FUNCTION IF EXISTS kyc_reviews_decided_once()")
    op.drop_index("uq_kyc_reviews_one_pending", table_name="kyc_reviews")
    op.drop_table("kyc_reviews")
