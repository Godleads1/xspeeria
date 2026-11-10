"""Closed "Need help?" requests are deleted 12 hours after closing (owner 2026-11-10).

ADR-103 amendment: "it must be deleted on 12 hours". The app may now delete a help request
(its messages go with it, ``ON DELETE CASCADE``), and the database itself refuses to delete
one that is still open or was closed less than 12 hours ago, so no code path can remove a
request early. The staff audit log keeps that a request existed and who closed it, but none of
its contact details or messages.

Revision ID: 0052
Revises: 0051
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0052"
down_revision: str | None = "0051"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_GUARD = """
CREATE FUNCTION help_request_delete_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'closed' OR OLD.closed_at IS NULL
     OR OLD.closed_at > now() - interval '12 hours' THEN
    RAISE EXCEPTION 'a help request is deleted only 12 hours after it is closed'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END $$
"""


def upgrade() -> None:
    op.execute(_GUARD)
    op.execute(
        "CREATE TRIGGER help_request_delete_guard BEFORE DELETE ON help_requests "
        "FOR EACH ROW EXECUTE FUNCTION help_request_delete_guard()"
    )
    op.create_index(
        "ix_help_requests_closed_at",
        "help_requests",
        ["closed_at"],
        postgresql_where="status = 'closed'",
    )
    op.execute("GRANT DELETE ON help_requests TO xspeeria_app")


def downgrade() -> None:
    op.execute("REVOKE DELETE ON help_requests FROM xspeeria_app")
    op.drop_index("ix_help_requests_closed_at", table_name="help_requests")
    op.execute("DROP TRIGGER help_request_delete_guard ON help_requests")
    op.execute("DROP FUNCTION help_request_delete_guard()")
