"""Delete account — ADR-095 (owner 2026-11-03; record keeping DEC-106, 14-day grace).

* ``users.deletion_requested_at``: the customer asked to delete the account. The account is
  closed at once and can be restored by signing in within 14 days.
* ``users.deleted_at``: after the 14 days, the data with no legal reason to be kept was
  removed. The records the law requires stay 5 years (DEC-106).
* ``step_up_grants``: a new action, ``account.delete`` (the PIN-backed second check before
  deleting).
* ``notifications``: the guard (XS004, ADR-044) still refuses every delete, except the 14-day
  clean-up's: only once the customer's account is marked deleted (``deleted_at`` set). The
  owner's Delete-account rule (DEC-106) is the retention decision ADR-044 left open.
* The app role may now delete a customer's notifications and phone-push tokens (and their
  delivery records), which only that clean-up does.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0043"
down_revision: str | None = "0042"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_OLD = (
    "'beneficiary.add', 'beneficiary.remove', 'contact.change', 'pin.change', 'mfa.change', "
    "'recovery_codes.regenerate', 'trade.accept', 'payout.confirm', 'biometric.enable'"
)
_NEW = _OLD + ", 'account.delete'"
_CHECK = "ck_step_up_grants_action_allowed"

_GUARD = """
CREATE OR REPLACE FUNCTION xspeeria_notification_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF {allow_deleted} EXISTS (
            SELECT 1 FROM users u WHERE u.id = OLD.user_id AND u.deleted_at IS NOT NULL
        ) THEN
            RETURN OLD;
        END IF;
        RAISE EXCEPTION 'notifications are not deleted' USING ERRCODE = 'XS004';
    END IF;
    IF NEW.id <> OLD.id OR NEW.seq <> OLD.seq OR NEW.user_id <> OLD.user_id OR NEW.type <> OLD.type
       OR NEW.payload <> OLD.payload OR NEW.dedupe_key <> OLD.dedupe_key
       OR NEW.created_at <> OLD.created_at THEN
        RAISE EXCEPTION 'only read_at of a notification may change' USING ERRCODE = 'XS004';
    END IF;
    RETURN NEW;
END $$
"""


def upgrade() -> None:
    op.add_column("users", sa.Column("deletion_requested_at", sa.DateTime(timezone=True)))
    op.add_column("users", sa.Column("deleted_at", sa.DateTime(timezone=True)))
    op.create_check_constraint(
        op.f("ck_users_deletion_only_when_closed"),
        "users",
        "deletion_requested_at IS NULL OR status = 'closed'",
    )
    op.create_check_constraint(
        op.f("ck_users_deleted_after_request"),
        "users",
        "deleted_at IS NULL OR (deletion_requested_at IS NOT NULL "
        "AND deleted_at >= deletion_requested_at)",
    )
    op.create_index(
        "ix_users_deletion_due",
        "users",
        ["deletion_requested_at"],
        postgresql_where=sa.text("deletion_requested_at IS NOT NULL AND deleted_at IS NULL"),
    )
    op.drop_constraint(op.f(_CHECK), "step_up_grants", type_="check")
    op.create_check_constraint(op.f(_CHECK), "step_up_grants", f"action IN ({_NEW})")
    op.execute(_GUARD.format(allow_deleted=""))
    op.execute("GRANT DELETE ON notifications, push_tokens, push_deliveries TO xspeeria_app")


def downgrade() -> None:
    op.execute("REVOKE DELETE ON notifications, push_tokens, push_deliveries FROM xspeeria_app")
    op.execute(_GUARD.format(allow_deleted="FALSE AND"))
    op.execute("DELETE FROM step_up_grants WHERE action = 'account.delete'")
    op.drop_constraint(op.f(_CHECK), "step_up_grants", type_="check")
    op.create_check_constraint(op.f(_CHECK), "step_up_grants", f"action IN ({_OLD})")
    op.drop_index("ix_users_deletion_due", table_name="users")
    op.drop_constraint(op.f("ck_users_deleted_after_request"), "users", type_="check")
    op.drop_constraint(op.f("ck_users_deletion_only_when_closed"), "users", type_="check")
    op.drop_column("users", "deleted_at")
    op.drop_column("users", "deletion_requested_at")
