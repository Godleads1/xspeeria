"""CD3: currency definitions are permanent; separate runtime role (ADR-028)

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-18

REVIEW CHECKLIST -- every migration on this project is read by a human before it runs:
  * No DROP of a table or column carrying financial state without explicit human approval.
  * Monetary columns are integer minor units (DECISION S4-1).
  * Constraints carry deterministic names from the `app.db.base` naming convention.
  * `downgrade()` is honest: if a step cannot be reversed without losing financial
    history, it raises rather than pretending.

DECISION 4.1B-CD3 (HUMAN-APPROVED 2026-09-01), implementation authorized 2026-10-18 (ADR-028).

Stage 1 -- database-level enforcement (H1-H5):
  * every UPDATE and DELETE on `currency_definitions` is refused by a row trigger, referenced
    and unreferenced rows alike, every column including `created_at` (whole-row);
  * TRUNCATE is refused by its own statement trigger (H4: row triggers do not cover it);
  * INSERT stays permitted (new versions are how corrections are made: version-only).
  Refusals raise SQLSTATE `XS001` with a message beginning `CD3:` -- a fixed, searchable
  signature PostgreSQL writes to its server log, so it can be alerted on (H7).

Stage 2 -- privilege separation (H6):
  * a NOLOGIN group role `xspeeria_app` is the only role the running application should use
    (deployments create a LOGIN user that is a member of it);
  * on `currency_definitions` it may SELECT and INSERT only -- no UPDATE, DELETE, TRUNCATE,
    and as a non-owner it cannot disable the triggers or alter the table;
  * on the AUTH tables it gets exactly what the sign-in service needs.
  The migration (owner) role keeps ownership. Every future table must grant to
  `xspeeria_app` explicitly; a test enforces that.

H9 -- no routine override: `downgrade()` removes the protection, so it refuses to run unless
the operator passes `-x cd3_downgrade=authorized` (or sets the config attribute). Using it
outside a developer's own database needs separate explicit human authorization.

Residual risk (acknowledged in the ruling, not claimed away): a PostgreSQL superuser, or the
owner role, can still drop the triggers. Infrastructure controls are outside this migration.
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import context, op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

APP_ROLE = "xspeeria_app"
#: Tables the AUTH-1/AUTH-2 service reads and writes (ADR-025, ADR-026).
AUTH_TABLES = (
    "users",
    "auth_sessions",
    "auth_refresh_tokens",
    "phone_verifications",
    "mfa_factors",
    "mfa_challenges",
    "recovery_codes",
    "trusted_devices",
    "step_up_grants",
)


#: Fixed text; ``__ROLE__`` is replaced with the module constant ``APP_ROLE``, never input.
_CREATE_ROLE_SQL = """
DO $do$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '__ROLE__') THEN
        CREATE ROLE __ROLE__ NOLOGIN;
    END IF;
END
$do$;
"""


def upgrade() -> None:
    # --- Stage 1: triggers --------------------------------------------------------------
    op.execute(
        """
        CREATE FUNCTION cd3_currency_definitions_refuse() RETURNS trigger
        LANGUAGE plpgsql AS $fn$
        BEGIN
            RAISE EXCEPTION USING
                ERRCODE = 'XS001',
                MESSAGE = format(
                    'CD3: currency_definitions rows are permanent; %s refused', TG_OP
                ),
                HINT = 'Insert a new currency_def_version instead (version-only correction).';
        END
        $fn$;
        """
    )
    op.execute(
        """
        CREATE TRIGGER cd3_refuse_update_delete
        BEFORE UPDATE OR DELETE ON currency_definitions
        FOR EACH ROW EXECUTE FUNCTION cd3_currency_definitions_refuse();
        """
    )
    op.execute(
        """
        CREATE TRIGGER cd3_refuse_truncate
        BEFORE TRUNCATE ON currency_definitions
        FOR EACH STATEMENT EXECUTE FUNCTION cd3_currency_definitions_refuse();
        """
    )

    # --- Stage 2: the non-owning runtime role --------------------------------------------
    op.execute(_CREATE_ROLE_SQL.replace("__ROLE__", APP_ROLE))
    op.execute(f"GRANT USAGE ON SCHEMA public TO {APP_ROLE}")
    op.execute(f"REVOKE ALL ON currency_definitions FROM PUBLIC, {APP_ROLE}")
    op.execute(f"GRANT SELECT, INSERT ON currency_definitions TO {APP_ROLE}")
    for table in AUTH_TABLES:
        op.execute(f"REVOKE ALL ON {table} FROM PUBLIC")
        op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON {table} TO {APP_ROLE}")


def _downgrade_authorized() -> bool:
    x_args = context.get_x_argument(as_dictionary=True)
    attribute = context.config.attributes.get("cd3_downgrade")
    return "authorized" in (x_args.get("cd3_downgrade"), attribute)


def downgrade() -> None:
    if not _downgrade_authorized():
        raise RuntimeError(
            "Refusing to remove the CD3 protection (H9: no routine override). Pass "
            "-x cd3_downgrade=authorized only with explicit human authorization."
        )
    for table in AUTH_TABLES:
        op.execute(f"REVOKE ALL ON {table} FROM {APP_ROLE}")
    op.execute(f"REVOKE ALL ON currency_definitions FROM {APP_ROLE}")
    op.execute(f"REVOKE USAGE ON SCHEMA public FROM {APP_ROLE}")
    # The role itself is cluster-wide and may serve other databases; it is left in place.
    op.execute("DROP TRIGGER cd3_refuse_truncate ON currency_definitions")
    op.execute("DROP TRIGGER cd3_refuse_update_delete ON currency_definitions")
    op.execute("DROP FUNCTION cd3_currency_definitions_refuse()")
