"""Staff phone and photo — ADR-060 (owner decision 2026-10-26)

``staff_accounts.phone``: the staff member's phone number in international form (+ and
8–15 digits), required for new staff by the API; nullable so accounts made before this
change stay valid. ``staff_accounts.photo_key``: where the photo is kept in the photo store
(ADR-049) — never the photo itself.

Revision ID: 0024
Revises: 0023
Create Date: 2026-10-26 22:00:00

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

revision: str = "0024"
down_revision: str | None = "0023"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("staff_accounts", sa.Column("phone", sa.String(length=16), nullable=True))
    op.add_column("staff_accounts", sa.Column("photo_key", sa.String(length=64), nullable=True))
    op.create_check_constraint("phone_e164", "staff_accounts", r"phone ~ '^\+[1-9][0-9]{7,14}$'")


def downgrade() -> None:
    authorized = "authorized" in (
        context.get_x_argument(as_dictionary=True).get("records_downgrade"),
        context.config.attributes.get("records_downgrade"),
    )
    if not authorized:
        raise RuntimeError(
            "Refusing to drop staff phone numbers and photo links. Pass "
            "-x records_downgrade=authorized only with explicit human authorization."
        )
    op.drop_constraint("phone_e164", "staff_accounts", type_="check")
    op.drop_column("staff_accounts", "photo_key")
    op.drop_column("staff_accounts", "phone")
