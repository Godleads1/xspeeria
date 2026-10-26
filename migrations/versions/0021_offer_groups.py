# ruff: noqa: E501
"""Buy requests in several currencies — ADR-059 Decision 5

* ``offer_groups``: one buy request offered in 2–5 currencies. Each currency is an ordinary
  offer (NGN → that currency, same naira amount, its own rate) pointing at the group.
* While a deal on one currency is unpaid the group is ``locked`` to that offer: the others are
  hidden and cannot be taken (the same naira cannot fund two deals). If the deal fails the
  group opens again; when it completes the group is ``done`` and the others are withdrawn.

No money columns are added (amounts stay on the offers). ``downgrade()`` refuses unless
``-x records_downgrade=authorized``.

Revision ID: 0021
Revises: 0020
Create Date: 2026-10-26 15:00:00

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

revision: str = "0021"
down_revision: str | None = "0020"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "offer_groups",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("status", sa.String(length=8), nullable=False),
        sa.Column("locked_offer_id", sa.UUID(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "status IN ('open', 'locked', 'done')", name=op.f("ck_offer_groups_status_allowed")
        ),
        sa.CheckConstraint(
            "(status = 'open') = (locked_offer_id IS NULL)",
            name=op.f("ck_offer_groups_locked_iff_offer"),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_offer_groups_user_id_users"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_offer_groups")),
    )
    op.create_index("ix_offer_groups_user_id", "offer_groups", ["user_id"])
    op.add_column("offers", sa.Column("group_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        op.f("fk_offers_group_id_offer_groups"),
        "offers",
        "offer_groups",
        ["group_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        op.f("fk_offer_groups_locked_offer_id_offers"),
        "offer_groups",
        "offers",
        ["locked_offer_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index(
        "ix_offers_group_id",
        "offers",
        ["group_id"],
        postgresql_where=sa.text("group_id IS NOT NULL"),
    )
    # Only buy requests (offers paying naira) may belong to a group (owner, 2026-10-21).
    op.create_check_constraint(
        op.f("ck_offers_group_only_naira"), "offers", "group_id IS NULL OR source_currency = 'NGN'"
    )
    op.execute("GRANT SELECT, INSERT, UPDATE ON offer_groups TO xspeeria_app")


def downgrade() -> None:
    authorized = "authorized" in (
        context.get_x_argument(as_dictionary=True).get("records_downgrade"),
        context.config.attributes.get("records_downgrade"),
    )
    if not authorized:
        raise RuntimeError(
            "Refusing to drop request groups. Pass -x records_downgrade=authorized only with "
            "explicit human authorization."
        )
    op.drop_constraint(op.f("ck_offers_group_only_naira"), "offers", type_="check")
    op.drop_index("ix_offers_group_id", table_name="offers")
    op.drop_constraint(
        op.f("fk_offer_groups_locked_offer_id_offers"), "offer_groups", type_="foreignkey"
    )
    op.drop_constraint(op.f("fk_offers_group_id_offer_groups"), "offers", type_="foreignkey")
    op.drop_column("offers", "group_id")
    op.drop_index("ix_offer_groups_user_id", table_name="offer_groups")
    op.drop_table("offer_groups")
