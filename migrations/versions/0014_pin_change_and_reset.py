# ruff: noqa: E501
"""PIN change and PIN reset (ADR-046)

* ``phone_verifications.purpose``: ``signup`` (existing rows) or ``pin_reset`` — a code sent
  for one purpose never works for the other.
* ``auth_sessions.revoke_reason`` also allows ``pin_change`` and ``pin_reset``.

``downgrade()`` refuses unless ``-x records_downgrade=authorized``; it fails if reset codes or
sessions ended by a PIN change/reset exist (their reasons would be lost).

Revision ID: 0014
Revises: 0013
Create Date: 2026-10-19 16:00:00

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

revision: str = "0014"
down_revision: str | None = "0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_REASONS_OLD = "revoke_reason IS NULL OR revoke_reason IN ('logout', 'revoked_by_user', 'token_reuse', 'replaced')"
_REASONS_NEW = "revoke_reason IS NULL OR revoke_reason IN ('logout', 'revoked_by_user', 'token_reuse', 'replaced', 'pin_change', 'pin_reset')"


def upgrade() -> None:
    op.add_column(
        "phone_verifications",
        sa.Column("purpose", sa.String(length=16), nullable=False, server_default="signup"),
    )
    op.create_check_constraint(
        op.f("ck_phone_verifications_purpose_allowed"),
        "phone_verifications",
        "purpose IN ('signup', 'pin_reset')",
    )
    op.drop_constraint(
        op.f("ck_auth_sessions_revoke_reason_allowed"), "auth_sessions", type_="check"
    )
    op.create_check_constraint(
        op.f("ck_auth_sessions_revoke_reason_allowed"), "auth_sessions", _REASONS_NEW
    )


def downgrade() -> None:
    authorized = "authorized" in (
        context.get_x_argument(as_dictionary=True).get("records_downgrade"),
        context.config.attributes.get("records_downgrade"),
    )
    if not authorized:
        raise RuntimeError(
            "Refusing to drop PIN reset records. Pass -x records_downgrade=authorized "
            "only with explicit human authorization."
        )
    op.drop_constraint(
        op.f("ck_auth_sessions_revoke_reason_allowed"), "auth_sessions", type_="check"
    )
    op.create_check_constraint(
        op.f("ck_auth_sessions_revoke_reason_allowed"), "auth_sessions", _REASONS_OLD
    )
    op.drop_constraint(
        op.f("ck_phone_verifications_purpose_allowed"), "phone_verifications", type_="check"
    )
    op.drop_column("phone_verifications", "purpose")
