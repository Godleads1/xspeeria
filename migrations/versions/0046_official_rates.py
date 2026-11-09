"""Official naira rates fetched automatically — ADR-102 (owner 2026-11-09).

Owner: "dollar, pound and euro lets do an automatic update", with Frankfurter as the source
and "last rate for 3 days, then stop".

* ``official_rates``: one row per successful fetch of one currency's CBN central rate (from the
  Frankfurter API's CBN provider). Append-only: the record of which ceiling applied when.
* No customer rows, so no row policy (ADR-078). The app role may read and add, never change.

Revision ID: 0046
Revises: 0045
Create Date: 2026-11-09 13:00:00

REVIEW CHECKLIST -- every migration on this project is read by a human before it runs:
  * One new table; no existing row changes.
  * Downgrade drops the table and its history; downgrade only with explicit human
    authorization.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0046"
down_revision: str | None = "0045"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "official_rates",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("rate", sa.Numeric(12, 6), nullable=False),
        sa.Column("rate_date", sa.Date(), nullable=False),
        sa.Column("source", sa.String(length=40), nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "currency ~ '^[A-Z]{3}$'", name=op.f("ck_official_rates_currency_format")
        ),
        sa.CheckConstraint("rate > 0", name=op.f("ck_official_rates_rate_positive")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_official_rates")),
    )
    op.create_index(
        "ix_official_rates_currency_fetched", "official_rates", ["currency", "fetched_at"]
    )
    # The same guard as the settlement facts (0009): nothing may change or remove a row.
    op.execute(
        "CREATE TRIGGER official_rates_append_only BEFORE UPDATE OR DELETE ON official_rates "
        "FOR EACH ROW EXECUTE FUNCTION xspeeria_append_only()"
    )
    op.execute("GRANT SELECT, INSERT ON official_rates TO xspeeria_app")


def downgrade() -> None:
    op.execute("REVOKE ALL ON official_rates FROM xspeeria_app")
    op.drop_table("official_rates")
