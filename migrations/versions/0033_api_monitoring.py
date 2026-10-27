"""API monitoring: per-minute call figures and background job status — ADR-072 (owner 2026-10-27)

Owner: "build an api monitoring features to help track api health, process etc … all api used
should be monitored".

* ``api_metrics``: per minute, per API (Xspeeria's own routes, webhooks we receive, and every
  outside system we call): calls, client errors, server errors, no-answer errors, total and
  longest time, slow calls. Counts and timings only — no user, body, query or identifiers.
  Kept 30 days (the server deletes older rows).
* ``job_status``: one row per background job: when it last ran, worked or failed, the error's
  type only, how long it took, runs and failures.
* New permission module ``monitoring``, given to Super Admin only (owner: "Super Admin see it").

Revision ID: 0033
Revises: 0032
Create Date: 2026-10-27 16:00:00

REVIEW CHECKLIST -- every migration on this project is read by a human before it runs:
  * No DROP of a table or column carrying financial state without explicit human approval.
  * Monetary columns are integer minor units (DECISION S4-1). (None added here.)
  * Constraints carry deterministic names from the `app.db.base` naming convention.
  * `downgrade()` is honest: dropping these tables loses only monitoring figures, not records.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0033"
down_revision: str | None = "0032"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

#: Super Admin holds every permission (ADR-060). Owner 2026-10-27: "Super Admin see it" —
#: no other built-in role gets monitoring.
_ALL = [f"monitoring.{a}" for a in ("read", "create", "update", "delete", "approve")]


def upgrade() -> None:
    op.create_table(
        "api_metrics",
        sa.Column("minute", sa.DateTime(timezone=True), nullable=False),
        sa.Column("kind", sa.String(8), nullable=False),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("method", sa.String(8), nullable=False),
        sa.Column("calls", sa.Integer(), nullable=False),
        sa.Column("client_errors", sa.Integer(), nullable=False),
        sa.Column("server_errors", sa.Integer(), nullable=False),
        sa.Column("network_errors", sa.Integer(), nullable=False),
        sa.Column("total_ms", sa.BigInteger(), nullable=False),
        sa.Column("max_ms", sa.Integer(), nullable=False),
        sa.Column("slow_calls", sa.Integer(), nullable=False),
        sa.CheckConstraint(
            "kind IN ('own', 'webhook', 'outside')", name=op.f("ck_api_metrics_kind_allowed")
        ),
        sa.CheckConstraint(
            "calls >= 0 AND client_errors >= 0 AND server_errors >= 0 AND network_errors >= 0 "
            "AND total_ms >= 0 AND max_ms >= 0 AND slow_calls >= 0",
            name=op.f("ck_api_metrics_not_negative"),
        ),
        sa.PrimaryKeyConstraint("minute", "kind", "name", "method", name=op.f("pk_api_metrics")),
    )
    op.create_index("ix_api_metrics_kind_minute", "api_metrics", ["kind", "minute"])
    op.create_table(
        "job_status",
        sa.Column("name", sa.String(40), nullable=False),
        sa.Column("interval_s", sa.Integer(), nullable=False),
        sa.Column("runs", sa.BigInteger(), nullable=False),
        sa.Column("failures", sa.BigInteger(), nullable=False),
        sa.Column("last_started_at", sa.DateTime(timezone=True)),
        sa.Column("last_ok_at", sa.DateTime(timezone=True)),
        sa.Column("last_failed_at", sa.DateTime(timezone=True)),
        sa.Column("last_error", sa.String(80)),
        sa.Column("last_duration_ms", sa.Integer()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("name", name=op.f("pk_job_status")),
    )
    op.execute("REVOKE ALL ON api_metrics, job_status FROM PUBLIC")
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON api_metrics TO xspeeria_app")
    op.execute("GRANT SELECT, INSERT, UPDATE ON job_status TO xspeeria_app")
    for role, add in (("super_admin", _ALL),):
        op.get_bind().execute(
            sa.text(
                "UPDATE staff_roles SET permissions = ("
                " SELECT array_agg(DISTINCT p ORDER BY p)"
                " FROM unnest(permissions || CAST(:add AS varchar(40)[])) p"
                "), updated_at = now() WHERE name = :role"
            ),
            {"add": add, "role": role},
        )


def downgrade() -> None:
    op.get_bind().execute(
        sa.text(
            "UPDATE staff_roles SET permissions = ("
            " SELECT coalesce(array_agg(p ORDER BY p), '{}') FROM unnest(permissions) p"
            " WHERE p NOT LIKE 'monitoring.%'), updated_at = now()"
        )
    )
    op.drop_table("job_status")
    op.drop_index("ix_api_metrics_kind_minute", table_name="api_metrics")
    op.drop_table("api_metrics")
