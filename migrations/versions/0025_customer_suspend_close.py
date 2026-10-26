"""Customer accounts can be suspended or closed — ADR-062 (owner decision 2026-10-26)

* ``users.status`` also allows ``suspended`` (temporary; staff can lift it) and ``closed``
  (for good). Both count as verified accounts: ``phone_verified_at`` stays set.
* The email stays taken by a suspended or closed account (it was unique among active accounts
  only), so a new sign-up can never take over the address of a suspended customer.
* ``auth_sessions.revoke_reason`` also allows ``account_suspended`` and ``account_closed``.

Revision ID: 0025
Revises: 0024
Create Date: 2026-10-26 23:00:00

REVIEW CHECKLIST -- every migration on this project is read by a human before it runs:
  * No DROP of a table or column carrying financial state without explicit human approval.
  * Monetary columns are integer minor units (DECISION S4-1). (None added here.)
  * Constraints carry deterministic names from the `app.db.base` naming convention.
  * `downgrade()` is honest: if a step cannot be reversed without losing history, it raises.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0025"
down_revision: str | None = "0024"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_STATUS_OLD = "status IN ('pending_verification', 'active')"
_STATUS_NEW = "status IN ('pending_verification', 'active', 'suspended', 'closed')"
_VERIFIED_OLD = "(status = 'active') = (phone_verified_at IS NOT NULL)"
_VERIFIED_NEW = "(status = 'pending_verification') = (phone_verified_at IS NULL)"
_REASONS_OLD = (
    "revoke_reason IS NULL OR revoke_reason IN ('logout', 'revoked_by_user', 'token_reuse', "
    "'replaced', 'pin_change', 'pin_reset', 'unlock_failed')"
)
_REASONS_NEW = (
    "revoke_reason IS NULL OR revoke_reason IN ('logout', 'revoked_by_user', 'token_reuse', "
    "'replaced', 'pin_change', 'pin_reset', 'unlock_failed', 'account_suspended', "
    "'account_closed')"
)


def _swap(table: str, name: str, sql: str) -> None:
    op.drop_constraint(op.f(f"ck_{table}_{name}"), table, type_="check")
    op.create_check_constraint(op.f(f"ck_{table}_{name}"), table, sql)


def upgrade() -> None:
    _swap("users", "status_allowed", _STATUS_NEW)
    _swap("users", "active_iff_verified", _VERIFIED_NEW)
    op.drop_index("uq_users_email_active", table_name="users")
    op.create_index(
        "uq_users_email_active",
        "users",
        ["email"],
        unique=True,
        postgresql_where=sa.text("status <> 'pending_verification'"),
    )
    _swap("auth_sessions", "revoke_reason_allowed", _REASONS_NEW)


def downgrade() -> None:
    # Refuses (the old constraints fail) while any account is suspended or closed: those
    # must be reactivated or reviewed by a person first, never silently changed.
    _swap("auth_sessions", "revoke_reason_allowed", _REASONS_OLD)
    op.drop_index("uq_users_email_active", table_name="users")
    op.create_index(
        "uq_users_email_active",
        "users",
        ["email"],
        unique=True,
        postgresql_where=sa.text("status = 'active'"),
    )
    _swap("users", "active_iff_verified", _VERIFIED_OLD)
    _swap("users", "status_allowed", _STATUS_OLD)
