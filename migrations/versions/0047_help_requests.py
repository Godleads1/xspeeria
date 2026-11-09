"""Help requests from people who can't log in — ADR-103 (owner 2026-11-09).

Owner: the face-check support procedure is approved; locked-out customers reach staff with a
"Need help?" form on the log-in screen, and "Reply through the form": a two-way thread.

* ``help_requests``: phone and email as typed, the matching account (if any, for staff),
  the SHA-256 of the private key the phone holds, open/closed.
* ``help_messages``: the thread (customer or staff, 1–2000 characters).
* Neither has a customer-owned ``user_id`` (the writer is not signed in), so no row policy
  (ADR-078): the public routes reach a request only by its id **and** the phone's key.
* The app role may read, add and close requests, and read and add messages.

Revision ID: 0047
Revises: 0046
Create Date: 2026-11-09 17:00:00

REVIEW CHECKLIST -- every migration on this project is read by a human before it runs:
  * Two new tables; no existing row changes.
  * Downgrade drops both tables and their contents; only with explicit human authorization.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0047"
down_revision: str | None = "0046"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "help_requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("phone", sa.String(length=16), nullable=False),
        sa.Column("email", sa.String(length=254), nullable=False),
        sa.Column("matched_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("key_hash", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_message_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("closed_by_staff_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.CheckConstraint(
            r"phone ~ '^\+[1-9][0-9]{7,14}$'", name=op.f("ck_help_requests_phone_e164")
        ),
        sa.CheckConstraint(
            "email = lower(email) AND email <> ''", name=op.f("ck_help_requests_email_normalised")
        ),
        sa.CheckConstraint(
            "status IN ('open', 'closed')", name=op.f("ck_help_requests_status_allowed")
        ),
        sa.CheckConstraint("length(key_hash) = 64", name=op.f("ck_help_requests_key_hash_sha256")),
        sa.ForeignKeyConstraint(
            ["matched_user_id"],
            ["users.id"],
            name=op.f("fk_help_requests_matched_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["closed_by_staff_id"],
            ["staff_accounts.id"],
            name=op.f("fk_help_requests_closed_by_staff_id_staff_accounts"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_help_requests")),
    )
    op.create_index("ix_help_requests_status_last", "help_requests", ["status", "last_message_at"])
    op.create_table(
        "help_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("request_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("author", sa.String(length=16), nullable=False),
        sa.Column("staff_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "author IN ('customer', 'staff')", name=op.f("ck_help_messages_author_allowed")
        ),
        sa.CheckConstraint(
            "(author = 'staff') = (staff_id IS NOT NULL)",
            name=op.f("ck_help_messages_staff_author_named"),
        ),
        sa.CheckConstraint(
            "length(body) BETWEEN 1 AND 2000", name=op.f("ck_help_messages_body_length")
        ),
        sa.ForeignKeyConstraint(
            ["request_id"],
            ["help_requests.id"],
            name=op.f("fk_help_messages_request_id_help_requests"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["staff_id"],
            ["staff_accounts.id"],
            name=op.f("fk_help_messages_staff_id_staff_accounts"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_help_messages")),
    )
    op.create_index("ix_help_messages_request", "help_messages", ["request_id", "created_at"])
    op.execute("GRANT SELECT, INSERT, UPDATE ON help_requests TO xspeeria_app")
    op.execute("GRANT SELECT, INSERT ON help_messages TO xspeeria_app")


def downgrade() -> None:
    op.execute("REVOKE ALL ON help_messages FROM xspeeria_app")
    op.execute("REVOKE ALL ON help_requests FROM xspeeria_app")
    op.drop_table("help_messages")
    op.drop_table("help_requests")
