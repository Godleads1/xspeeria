# ruff: noqa: E501
"""Gender from the ID check — ADR-055

* ``kyc_cases.gender``: "M" or "F" as read from the ID by the identity check, set when the
  check is approved; NULL otherwise. Shown only to the account holder.

``downgrade()`` refuses unless ``-x records_downgrade=authorized`` (it drops personal data).

Revision ID: 0018
Revises: 0017
Create Date: 2026-10-20 16:00:00

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

revision: str = "0018"
down_revision: str | None = "0017"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("kyc_cases", sa.Column("gender", sa.CHAR(length=1), nullable=True))
    op.create_check_constraint(
        op.f("ck_kyc_cases_gender_allowed"), "kyc_cases", "gender IS NULL OR gender IN ('M', 'F')"
    )


def downgrade() -> None:
    authorized = "authorized" in (
        context.get_x_argument(as_dictionary=True).get("records_downgrade"),
        context.config.attributes.get("records_downgrade"),
    )
    if not authorized:
        raise RuntimeError(
            "Refusing to drop kyc_cases.gender. Pass -x records_downgrade=authorized "
            "only with explicit human authorization."
        )
    op.drop_constraint(op.f("ck_kyc_cases_gender_allowed"), "kyc_cases", type_="check")
    op.drop_column("kyc_cases", "gender")
