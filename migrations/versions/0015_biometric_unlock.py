# ruff: noqa: E501
"""Biometric unlock after the idle lock (ADR-048)

* ``auth_sessions.unlock_key_hash`` — SHA-256 of a random key the phone keeps behind Face ID
  or fingerprint; ``auth_sessions.unlock_device_id`` — the trusted device it was issued to.
  Both set or both empty.
* ``auth_sessions.revoke_reason`` also allows ``unlock_failed`` (a wrong key ends the session).

``downgrade()`` refuses unless ``-x records_downgrade=authorized``; it fails if sessions ended
by a failed unlock exist (their reason would be lost).

Revision ID: 0015
Revises: 0014
Create Date: 2026-10-19 22:00:00

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
from sqlalchemy.dialects import postgresql

revision: str = "0015"
down_revision: str | None = "0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_REASONS_OLD = "revoke_reason IS NULL OR revoke_reason IN ('logout', 'revoked_by_user', 'token_reuse', 'replaced', 'pin_change', 'pin_reset')"
_REASONS_NEW = "revoke_reason IS NULL OR revoke_reason IN ('logout', 'revoked_by_user', 'token_reuse', 'replaced', 'pin_change', 'pin_reset', 'unlock_failed')"


def upgrade() -> None:
    op.add_column("auth_sessions", sa.Column("unlock_key_hash", sa.CHAR(length=64), nullable=True))
    op.add_column(
        "auth_sessions",
        sa.Column("unlock_device_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        op.f("fk_auth_sessions_unlock_device_id_trusted_devices"),
        "auth_sessions",
        "trusted_devices",
        ["unlock_device_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_check_constraint(
        op.f("ck_auth_sessions_unlock_key_hash_format"),
        "auth_sessions",
        "unlock_key_hash IS NULL OR unlock_key_hash ~ '^[0-9a-f]{64}$'",
    )
    op.create_check_constraint(
        op.f("ck_auth_sessions_unlock_key_has_device"),
        "auth_sessions",
        "(unlock_key_hash IS NULL) = (unlock_device_id IS NULL)",
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
            "Refusing to drop biometric unlock records. Pass -x records_downgrade=authorized "
            "only with explicit human authorization."
        )
    op.drop_constraint(
        op.f("ck_auth_sessions_revoke_reason_allowed"), "auth_sessions", type_="check"
    )
    op.create_check_constraint(
        op.f("ck_auth_sessions_revoke_reason_allowed"), "auth_sessions", _REASONS_OLD
    )
    op.drop_constraint(
        op.f("ck_auth_sessions_unlock_key_has_device"), "auth_sessions", type_="check"
    )
    op.drop_constraint(
        op.f("ck_auth_sessions_unlock_key_hash_format"), "auth_sessions", type_="check"
    )
    op.drop_constraint(
        op.f("fk_auth_sessions_unlock_device_id_trusted_devices"),
        "auth_sessions",
        type_="foreignkey",
    )
    op.drop_column("auth_sessions", "unlock_device_id")
    op.drop_column("auth_sessions", "unlock_key_hash")
