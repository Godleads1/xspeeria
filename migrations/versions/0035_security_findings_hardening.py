"""Security review hardening — findings F-001, F-007 and F-008 (scan of 2026-10-28)

* F-001: a sign-in or PIN-reset check started under the old PIN must not be usable after the
  PIN changes. ``users.pin_changed_at`` is set whenever the PIN is changed or reset; a check
  created before it is refused.
* F-007: a new step-up action, ``biometric.enable``, so turning on Face ID/fingerprint after
  the sign-in can require a fresh "Confirm it's you". The allowed-action CHECK is widened.
* F-008: ``kyc_cases.matched_user_ids`` keeps which other accounts Didit matched to a held
  check, so confirming it can see approvals made before the document key existed.

Revision ID: 0035
Revises: 0034
Create Date: 2026-11-01 17:30:00

REVIEW CHECKLIST -- every migration on this project is read by a human before it runs:
  * Adds two nullable columns; no data is changed or removed. (No monetary column.)
  * Widens one CHECK by one value; existing rows still satisfy it.
  * `downgrade()` drops only those columns, which hold no financial or audit state, and
    narrows the CHECK back (it fails if any ``biometric.enable`` approval rows exist).
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0035"
down_revision: str | None = "0034"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_OLD = (
    "'beneficiary.add', 'beneficiary.remove', 'contact.change', 'pin.change', 'mfa.change', "
    "'recovery_codes.regenerate', 'trade.accept', 'payout.confirm'"
)
_NEW = _OLD + ", 'biometric.enable'"
_CHECK = "ck_step_up_grants_action_allowed"


def upgrade() -> None:
    op.add_column("users", sa.Column("pin_changed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "kyc_cases",
        sa.Column("matched_user_ids", postgresql.ARRAY(sa.UUID()), nullable=True),
    )
    op.drop_constraint(op.f(_CHECK), "step_up_grants", type_="check")
    op.create_check_constraint(op.f(_CHECK), "step_up_grants", f"action IN ({_NEW})")


def downgrade() -> None:
    op.drop_constraint(op.f(_CHECK), "step_up_grants", type_="check")
    op.create_check_constraint(op.f(_CHECK), "step_up_grants", f"action IN ({_OLD})")
    op.drop_column("kyc_cases", "matched_user_ids")
    op.drop_column("users", "pin_changed_at")
