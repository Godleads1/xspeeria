"""Complete the app role's grants — ADR-094 (owner 2026-11-03: "Yes").

The server can log in as the non-owning ``xspeeria_app`` role (ADR-025 §1.4, ADR-028)
instead of the tables' owner. Running the whole integration suite with every app connection
as that role (3 Nov 2026) found what it lacked; each grant below is the least that fixes it.

* ``idempotency_records``: the app locks a record before deciding (``SELECT … FOR UPDATE``),
  which PostgreSQL allows only with UPDATE rights on at least one column. The app never
  changes these rows, so UPDATE is granted on ``expires_at`` only; the app could already
  delete a record, so this adds no power.
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0042"
down_revision: str | None = "0041"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("GRANT UPDATE (expires_at) ON idempotency_records TO xspeeria_app")


def downgrade() -> None:
    op.execute("REVOKE UPDATE (expires_at) ON idempotency_records FROM xspeeria_app")
