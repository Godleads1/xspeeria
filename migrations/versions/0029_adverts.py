"""Adverts in the app's advert slot — ADR-067 (ADR-056 decision 2; owner 2026-10-20)

Owner: "the place advert here is done from the web admin, and then everyone using the app sees
it in that same location. the size must fit the advert placeholder."

* ``adverts``: a name, the picture (kept in the object store, never in PostgreSQL — ADR-049;
  only its key, type and pixel size here), when it shows (from / until), an optional https
  link, and an on/off switch. Never deleted (the history of what was shown).
* A new permission module ``adverts`` (read, create, update, delete, approve). The Super Admin
  role gets all of it; other roles get it only when staff choose to (role setup).

Revision ID: 0029
Revises: 0028
Create Date: 2026-10-27 11:00:00

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
from sqlalchemy.dialects import postgresql

revision: str = "0029"
down_revision: str | None = "0028"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_ADVERTS = ["adverts.read", "adverts.create", "adverts.update", "adverts.delete", "adverts.approve"]


def upgrade() -> None:
    op.create_table(
        "adverts",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=60), nullable=False),
        sa.Column("image_key", sa.String(length=80), nullable=False),
        sa.Column("content_type", sa.String(length=16), nullable=False),
        sa.Column("width", sa.Integer(), nullable=False),
        sa.Column("height", sa.Integer(), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("link_url", sa.String(length=500), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "char_length(btrim(name)) BETWEEN 2 AND 60", name=op.f("ck_adverts_name_length")
        ),
        sa.CheckConstraint(
            "content_type IN ('image/jpeg', 'image/png', 'image/webp')",
            name=op.f("ck_adverts_content_type_allowed"),
        ),
        sa.CheckConstraint("width > 0 AND height > 0", name=op.f("ck_adverts_size_positive")),
        sa.CheckConstraint("ends_at > starts_at", name=op.f("ck_adverts_end_after_start")),
        sa.CheckConstraint(
            "link_url IS NULL OR link_url ~ '^https://[^\\s<>\"]+$'",
            name=op.f("ck_adverts_link_https"),
        ),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["staff_accounts.id"],
            name=op.f("fk_adverts_created_by_staff_accounts"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_adverts")),
        sa.UniqueConstraint("image_key", name=op.f("uq_adverts_image_key")),
    )
    op.create_index("ix_adverts_window", "adverts", ["active", "starts_at", "ends_at"])
    op.execute("REVOKE ALL ON adverts FROM PUBLIC")
    op.execute("GRANT SELECT, INSERT, UPDATE ON adverts TO xspeeria_app")
    op.get_bind().execute(
        sa.text(
            "UPDATE staff_roles SET permissions = ("
            " SELECT array_agg(DISTINCT p ORDER BY p)"
            " FROM unnest(permissions || CAST(:add AS varchar(40)[])) p"
            "), updated_at = now() WHERE name = 'super_admin'"
        ),
        {"add": _ADVERTS},
    )


def downgrade() -> None:
    authorized = "authorized" in (
        context.get_x_argument(as_dictionary=True).get("records_downgrade"),
        context.config.attributes.get("records_downgrade"),
    )
    if not authorized:
        raise RuntimeError(
            "Refusing to drop the advert history. Pass -x records_downgrade=authorized only with "
            "explicit human authorization."
        )
    op.get_bind().execute(
        sa.text(
            "UPDATE staff_roles SET permissions = ("
            " SELECT coalesce(array_agg(p ORDER BY p), '{}') FROM unnest(permissions) p"
            " WHERE p NOT LIKE 'adverts.%'), updated_at = now()"
        )
    )
    op.drop_index("ix_adverts_window", table_name="adverts")
    op.drop_table("adverts")
