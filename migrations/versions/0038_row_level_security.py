"""Row-level security on customers' private tables — readiness review H-3, ADR-078

Owner (2026-11-02): "do these: Postgres row-level security is not enabled (readiness review
H-3) … this is a second lock, not the first. Every query is scoped to the signed-in user in
code and covered by tests."

Each table below gets ``ENABLE`` + ``FORCE ROW LEVEL SECURITY`` and one policy,
``xspeeria_owner_rows``, for every command:

* ``xspeeria.scope = 'system'`` (background jobs, staff routes, sign-in before the customer is
  known, command-line tools): every row.
* ``xspeeria.scope = 'user'``: only rows whose owner column equals ``xspeeria.user_id``, for
  reading and for writing (``WITH CHECK``), so a customer request can neither see nor create
  another customer's row.
* Neither set (a connection that bypasses ``app.db.row_scope``): **no rows**.
* ``notifications`` only: a customer request may *add* a message for someone else (taking an
  offer tells its owner), but reads, changes and deletes stay own-rows-only.

The application sets both values at the start of every transaction (``app/db/row_scope.py``).
``FORCE`` applies the policies to the table owner too, so they hold even if a deployment
connects with the migration role by mistake. Superusers and ``BYPASSRLS`` roles still bypass
them: the app must never use one (ADR-025 §1.4).

Only tables that are private to one customer **and** that a customer request never needs to
read for anyone else are covered. Shared tables (offers, matches, settlement legs, disputes,
push tokens, …) are read by both sides of a deal, or move between accounts, by design; they
stay protected by the code checks. The list, with reasons, is in
``backend/tests/integration/test_row_level_security.py``.

Revision ID: 0038
Revises: 0037
Create Date: 2026-11-02 15:00:00

REVIEW CHECKLIST -- every migration on this project is read by a human before it runs:
  * No column, row or constraint is changed; only policies. Downgrade removes them exactly.
  * Alembic connects through ``app.db.session.build_engine``, so migrations run in
    ``system`` scope. Hand-written SQL against these tables as a non-superuser must first run
    ``SELECT set_config('xspeeria.scope', 'system', true)`` or it will see no rows.
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0038"
down_revision: str | None = "0037"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

POLICY = "xspeeria_owner_rows"
#: Policy names created on a table in ``ADD_FOR_OTHERS`` (one per command).
SPLIT_POLICIES = ("select", "insert", "update", "delete")

#: table -> the column naming the customer the row belongs to.
OWNED_TABLES: dict[str, str] = {
    "auth_sessions": "user_id",
    "mfa_factors": "user_id",
    "mfa_challenges": "user_id",
    "recovery_codes": "user_id",
    "trusted_devices": "user_id",
    "step_up_grants": "user_id",
    "verification_checks": "user_id",
    "kyc_cases": "user_id",
    "idempotency_records": "user_id",
    "notifications": "user_id",
    "beneficiaries": "user_id",
    "tier_checks": "user_id",
    "customer_activity": "user_id",
    "fraud_alerts": "user_id",
}


#: Tables where a customer request may *add* a row for someone else, but still only read,
#: change or delete its own. Notifications: taking an offer tells the offer's owner, opening a
#: dispute tells the other party (ADR-044) -- in the same transaction as the fact.
ADD_FOR_OTHERS = {"notifications"}

_ANY_SCOPE = "(current_setting('xspeeria.scope', true) IN ('system', 'user'))"


def _rule(column: str) -> str:
    # NULLIF keeps an empty setting from being cast to uuid (which would raise).
    return (
        "(current_setting('xspeeria.scope', true) = 'system' "
        "OR (current_setting('xspeeria.scope', true) = 'user' "
        f"AND {column} = NULLIF(current_setting('xspeeria.user_id', true), '')::uuid))"
    )


def upgrade() -> None:
    for table, column in OWNED_TABLES.items():
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        rule = _rule(column)
        if table not in ADD_FOR_OTHERS:
            op.execute(f"CREATE POLICY {POLICY} ON {table} FOR ALL USING {rule} WITH CHECK {rule}")
            continue
        op.execute(f"CREATE POLICY {POLICY}_select ON {table} FOR SELECT USING {rule}")
        op.execute(f"CREATE POLICY {POLICY}_insert ON {table} FOR INSERT WITH CHECK {_ANY_SCOPE}")
        op.execute(
            f"CREATE POLICY {POLICY}_update ON {table} FOR UPDATE USING {rule} WITH CHECK {rule}"
        )
        op.execute(f"CREATE POLICY {POLICY}_delete ON {table} FOR DELETE USING {rule}")


def downgrade() -> None:
    for table in OWNED_TABLES:
        op.execute(f"DROP POLICY IF EXISTS {POLICY} ON {table}")
        for command in SPLIT_POLICIES:
            op.execute(f"DROP POLICY IF EXISTS {POLICY}_{command} ON {table}")
        op.execute(f"ALTER TABLE {table} NO FORCE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")
