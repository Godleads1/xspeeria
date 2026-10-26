"""Reversals: staff ask, a different staff member approves, the escrow goes back — ADR-065

Owner decision 2026-10-26 ("Return escrow to payer"): a refund returns money that is still in
escrow, before any payout, to whoever paid it in. ADR-051 decision 4: one approver with the
Approve permission, never the person who asked.

* ``reversals``: one request per row, tied to a dispute and its settlement. Decided once: a
  database guard refuses any change after approval or rejection, and the approver can never be
  the requester (also a CHECK). At most one pending request per settlement.
* ``settlement_holds.type`` gains ``REVERSAL``: a pending request pauses the payout.
* ``settlements.closure_reason`` gains ``REVERSED``.

Revision ID: 0027
Revises: 0026
Create Date: 2026-10-27 09:00:00

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

revision: str = "0027"
down_revision: str | None = "0026"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_HOLDS_OLD = "type IN ('COMPLIANCE', 'DISPUTE', 'RECONCILIATION', 'DISPATCH_FAILURE', 'RISK')"
_HOLDS_NEW = (
    "type IN ('COMPLIANCE', 'DISPUTE', 'RECONCILIATION', 'DISPATCH_FAILURE', 'RISK', 'REVERSAL')"
)
_CLOSE_OLD = (
    "closure_reason IS NULL OR closure_reason IN ('TIMEOUT', 'REMATCH', "
    "'PARTY_CANCELLED', 'PROVISION_FAILED', 'RECOVERED', 'LOSS_RECOGNIZED')"
)
_CLOSE_NEW = (
    "closure_reason IS NULL OR closure_reason IN ('TIMEOUT', 'REMATCH', "
    "'PARTY_CANCELLED', 'PROVISION_FAILED', 'RECOVERED', 'LOSS_RECOGNIZED', 'REVERSED')"
)

_GUARD = """
CREATE FUNCTION reversals_decided_once() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'reversal % is already decided', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.id <> OLD.id OR NEW.dispute_id <> OLD.dispute_id
     OR NEW.settlement_id <> OLD.settlement_id OR NEW.hold_id <> OLD.hold_id
     OR NEW.reason <> OLD.reason OR NEW.requested_by <> OLD.requested_by
     OR NEW.requested_at <> OLD.requested_at THEN
    RAISE EXCEPTION 'a reversal request cannot be rewritten' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$
"""
_TRIGGER = (
    "CREATE TRIGGER trg_reversals_decided_once BEFORE UPDATE ON reversals "
    "FOR EACH ROW EXECUTE FUNCTION reversals_decided_once()"
)


def upgrade() -> None:
    op.drop_constraint(op.f("ck_settlement_holds_type_allowed"), "settlement_holds", type_="check")
    op.create_check_constraint(
        op.f("ck_settlement_holds_type_allowed"), "settlement_holds", _HOLDS_NEW
    )
    op.drop_constraint(op.f("ck_settlements_closure_reason_allowed"), "settlements", type_="check")
    op.create_check_constraint(
        op.f("ck_settlements_closure_reason_allowed"), "settlements", _CLOSE_NEW
    )
    op.create_table(
        "reversals",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("dispute_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("settlement_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("hold_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(length=10), nullable=False, server_default="pending"),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("requested_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("requested_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("decided_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("decision_note", sa.Text(), nullable=True),
        sa.CheckConstraint(
            "status IN ('pending', 'approved', 'rejected')",
            name=op.f("ck_reversals_status_allowed"),
        ),
        sa.CheckConstraint(
            "char_length(btrim(reason)) BETWEEN 3 AND 500", name=op.f("ck_reversals_reason_length")
        ),
        sa.CheckConstraint(
            "decision_note IS NULL OR char_length(decision_note) BETWEEN 1 AND 500",
            name=op.f("ck_reversals_note_length"),
        ),
        # ADR-051 decision 4 / SEC-008: never on your own request.
        sa.CheckConstraint(
            "decided_by IS NULL OR decided_by <> requested_by",
            name=op.f("ck_reversals_not_own_request"),
        ),
        sa.CheckConstraint(
            "(status = 'pending') = (decided_by IS NULL AND decided_at IS NULL)",
            name=op.f("ck_reversals_decided_has_who_and_when"),
        ),
        sa.CheckConstraint(
            "status <> 'rejected' OR decision_note IS NOT NULL",
            name=op.f("ck_reversals_rejection_has_note"),
        ),
        sa.ForeignKeyConstraint(
            ["dispute_id"],
            ["disputes.id"],
            name=op.f("fk_reversals_dispute_id_disputes"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["settlement_id"],
            ["settlements.id"],
            name=op.f("fk_reversals_settlement_id_settlements"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["hold_id"],
            ["settlement_holds.id"],
            name=op.f("fk_reversals_hold_id_settlement_holds"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["requested_by"],
            ["staff_accounts.id"],
            name=op.f("fk_reversals_requested_by_staff_accounts"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["decided_by"],
            ["staff_accounts.id"],
            name=op.f("fk_reversals_decided_by_staff_accounts"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_reversals")),
        sa.UniqueConstraint("hold_id", name=op.f("uq_reversals_hold_id")),
    )
    op.create_index(
        "uq_reversals_one_pending",
        "reversals",
        ["settlement_id"],
        unique=True,
        postgresql_where=sa.text("status = 'pending'"),
    )
    op.create_index("ix_reversals_requested_at", "reversals", ["requested_at"])
    op.execute(_GUARD)
    op.execute(_TRIGGER)
    # The app role reads, adds and decides requests; never deletes them.
    op.execute("REVOKE ALL ON reversals FROM PUBLIC")
    op.execute("GRANT SELECT, INSERT, UPDATE ON reversals TO xspeeria_app")


def downgrade() -> None:
    authorized = "authorized" in (
        context.get_x_argument(as_dictionary=True).get("records_downgrade"),
        context.config.attributes.get("records_downgrade"),
    )
    if not authorized:
        raise RuntimeError(
            "Refusing to drop reversal records. Pass -x records_downgrade=authorized only with "
            "explicit human authorization."
        )
    op.execute("DROP TRIGGER IF EXISTS trg_reversals_decided_once ON reversals")
    op.execute("DROP FUNCTION IF EXISTS reversals_decided_once()")
    op.drop_index("ix_reversals_requested_at", table_name="reversals")
    op.drop_index("uq_reversals_one_pending", table_name="reversals")
    op.drop_table("reversals")
    # Fails (as it should) if a settlement was closed as REVERSED or holds a REVERSAL hold.
    op.drop_constraint(op.f("ck_settlements_closure_reason_allowed"), "settlements", type_="check")
    op.create_check_constraint(
        op.f("ck_settlements_closure_reason_allowed"), "settlements", _CLOSE_OLD
    )
    op.drop_constraint(op.f("ck_settlement_holds_type_allowed"), "settlement_holds", type_="check")
    op.create_check_constraint(
        op.f("ck_settlement_holds_type_allowed"), "settlement_holds", _HOLDS_OLD
    )
