"""Customer activity log — ADR-073 (owner 2026-10-27: kept 5 years, Super Admin only)

Owner: "audit log per user to track all what each users are doing on the app with their
timestamp, also audit log per transaction id"; "kept 5 years, Super Admin only".

* ``customer_activity``: one row per customer action, with time, outcome, device and links to
  the deal, offer or other record. Append-only: a trigger refuses every UPDATE, and refuses
  DELETE unless the row is more than 5 years old (the retention period).
* New permission module ``activity`` for Super Admin only.

Revision ID: 0034
Revises: 0033
Create Date: 2026-10-27 18:00:00

REVIEW CHECKLIST -- every migration on this project is read by a human before it runs:
  * No DROP of a table or column carrying financial state without explicit human approval.
  * Monetary columns are integer minor units (DECISION S4-1). (None added here.)
  * Constraints carry deterministic names from the `app.db.base` naming convention.
  * `downgrade()` is honest: dropping the activity log destroys audit history, so it refuses
    without explicit authorization.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import context, op
from sqlalchemy.dialects import postgresql

revision: str = "0034"
down_revision: str | None = "0033"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_ALL = [f"activity.{a}" for a in ("read", "create", "update", "delete", "approve")]

_GUARD = """
CREATE FUNCTION customer_activity_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'customer activity is append-only' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.at >= now() - interval '5 years' THEN
    RAISE EXCEPTION 'customer activity is kept for 5 years' USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END $$
"""


def upgrade() -> None:
    op.create_table(
        "customer_activity",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("action", sa.String(40), nullable=False),
        sa.Column("category", sa.String(12), nullable=False),
        sa.Column("outcome", sa.String(8), nullable=False),
        sa.Column("route", sa.String(120)),
        sa.Column("method", sa.String(8)),
        sa.Column("status", sa.SmallInteger()),
        sa.Column("match_id", postgresql.UUID(as_uuid=True)),
        sa.Column("offer_id", postgresql.UUID(as_uuid=True)),
        sa.Column("ref_id", postgresql.UUID(as_uuid=True)),
        sa.Column("detail", postgresql.JSONB()),
        sa.Column("device", sa.String(120)),
        sa.Column("country", sa.CHAR(2)),
        sa.Column("request_id", sa.String(64)),
        sa.CheckConstraint(
            "outcome IN ('done', 'refused', 'failed')",
            name=op.f("ck_customer_activity_outcome_allowed"),
        ),
        sa.CheckConstraint(
            "category IN ('account', 'security', 'identity', 'market', 'deal', 'payout', "
            "'dispute', 'other')",
            name=op.f("ck_customer_activity_category_allowed"),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_customer_activity_user_id_users"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_customer_activity")),
    )
    op.create_index("ix_customer_activity_user_at", "customer_activity", ["user_id", "at"])
    op.create_index("ix_customer_activity_match", "customer_activity", ["match_id"])
    op.create_index("ix_customer_activity_offer", "customer_activity", ["offer_id"])
    op.create_index("ix_customer_activity_at", "customer_activity", ["at"])
    op.execute(_GUARD)
    op.execute(
        "CREATE TRIGGER customer_activity_append_only BEFORE UPDATE OR DELETE ON "
        "customer_activity FOR EACH ROW EXECUTE FUNCTION customer_activity_append_only()"
    )
    op.execute("REVOKE ALL ON customer_activity FROM PUBLIC")
    op.execute("GRANT SELECT, INSERT, DELETE ON customer_activity TO xspeeria_app")
    op.get_bind().execute(
        sa.text(
            "UPDATE staff_roles SET permissions = ("
            " SELECT array_agg(DISTINCT p ORDER BY p)"
            " FROM unnest(permissions || CAST(:add AS varchar(40)[])) p"
            "), updated_at = now() WHERE name = 'super_admin'"
        ),
        {"add": _ALL},
    )


def downgrade() -> None:
    authorized = "authorized" in (
        context.get_x_argument(as_dictionary=True).get("records_downgrade"),
        context.config.attributes.get("records_downgrade"),
    )
    if not authorized:
        raise RuntimeError(
            "Refusing to drop the customer activity log. Pass -x records_downgrade=authorized "
            "only with explicit human authorization."
        )
    op.get_bind().execute(
        sa.text(
            "UPDATE staff_roles SET permissions = ("
            " SELECT coalesce(array_agg(p ORDER BY p), '{}') FROM unnest(permissions) p"
            " WHERE p NOT LIKE 'activity.%'), updated_at = now()"
        )
    )
    op.execute("DROP TABLE customer_activity")
    op.execute("DROP FUNCTION customer_activity_append_only()")
