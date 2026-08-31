"""STEP 9 -- dedicated PostgreSQL verification of the real `currency_definitions` table.

**Why this module exists separately from everything already green.** PR #8's integration
suite proves two adjacent things: `test_money_columns.py` proves the *helpers* in
`app.db.money` emit constraints PostgreSQL enforces -- but on throwaway tables built from
an isolated `MetaData`, never on `currency_definitions` -- and `test_migrations.py` proves
the migration *chain* upgrades, round-trips and does not drift at the level of *which
tables exist*. Neither one asserts a single thing about the constraints PostgreSQL is
actually enforcing on the migrated `currency_definitions` table. A migration that declared
a two-column UNIQUE, or dropped a CHECK, or ordered the primary key the other way round
would pass both suites unchanged. That gap is Step 9, and it is why a green PR #8 CI run
does not discharge it.

**What is proved here, and how.** Every assertion below reads PostgreSQL's own catalogue
(`pg_constraint`, `pg_index`, `pg_attribute`, `information_schema.columns`) or watches
PostgreSQL accept and refuse real rows in the real table. Nothing is proved by reading the
migration source and believing it -- except the *expected* CHECK set, which is derived from
the tracked migration precisely so this module cannot drift from it by remembering a
constraint that was renamed.

**Scope: verification only.** Nothing here creates a table, alters a constraint, seeds a
currency, or emits a foreign key. The three-column UNIQUE exists to be a future composite
FK target (DECISION 4.1B-CD2), but that FK is gated behind GATE 4.1B-CD3 and Milestone
4.1C, so this module proves the candidate key from the catalogue and deliberately does not
probe it by creating a referencing table.

**Rows never persist.** Writes run on the `connection` fixture without committing, so the
outer transaction is rolled back on teardown; a refused statement is contained in a
SAVEPOINT so the transaction stays usable for the assertion that follows it.
"""

from __future__ import annotations

import re
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
import pytest_asyncio
from alembic import command
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncConnection

# The SQLSTATE walker is imported rather than restated. It is the module that CI proved
# necessary -- the asyncpg dialect does not map `DataError`, so the exception *class* is a
# useless discriminator on this stack and only the five-character code is reliable. A
# second copy here would be a second thing to keep correct.
from tests.integration.test_money_columns import _sqlstate

pytestmark = pytest.mark.integration

REPO_ROOT = Path(__file__).resolve().parents[3]
ALEMBIC_INI = REPO_ROOT / "alembic.ini"
MIGRATIONS_DIR = REPO_ROOT / "migrations"
MIGRATION_0002 = MIGRATIONS_DIR / "versions" / "0002_currency_definitions.py"

#: The approved head this verification is performed against. Pinned, not read from the
#: chain: Step 9 is a claim about revision 0002's observable result, and a later revision
#: must not silently inherit the pass.
EXPECTED_HEAD = "0002"

TABLE = "currency_definitions"
PK_NAME = "pk_currency_definitions"
UQ_NAME = "uq_currency_definitions_currency_currency_def_version_scale"

PK_COLUMNS = ["currency", "currency_def_version"]
UQ_COLUMNS = ["currency", "currency_def_version", "scale"]

#: A structurally valid row. Every rejection case below is this row with exactly one field
#: made invalid, so the constraint under test is the only thing that can refuse it.
VALID_ROW: dict[str, Any] = {
    "currency": "GBP",
    "currency_def_version": "v1",
    "scale": 2,
}

INSERT_SQL = text(
    "INSERT INTO currency_definitions (currency, currency_def_version, scale) "
    "VALUES (:currency, :currency_def_version, :scale)"
)


# --- expected contract, derived from the tracked migration --------------------------


def _declared_check_names() -> frozenset[str]:
    """The CHECK names migration 0002 declares, read from the file.

    Deriving them beats listing them: a constraint renamed in the migration and forgotten
    here would otherwise leave this module asserting the existence of a name PostgreSQL no
    longer carries -- which fails loudly -- *or*, worse, silently stop covering a
    constraint that was added. Reading the source makes the expected set follow the
    migration by construction.
    """
    source = MIGRATION_0002.read_text(encoding="utf-8")
    names = frozenset(re.findall(r'name=op\.f\("(ck_currency_definitions_[a-z_]+)"\)', source))
    assert names, f"no CHECK constraint names found in {MIGRATION_0002}"
    return names


DECLARED_CHECKS = _declared_check_names()


# --- clean database at head ---------------------------------------------------------


def _config(database_url: str) -> Config:
    """Real Alembic config, with the URL passed the way `-x database_url=...` passes it."""
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("script_location", str(MIGRATIONS_DIR))
    config.cmd_opts = None
    config.attributes["database_url"] = database_url
    return config


@pytest.fixture(scope="module", autouse=True)
def migrated_from_clean(database_url: str) -> Iterator[str]:
    """Take the database to base, then `upgrade head`, before any assertion runs.

    Step 9 requires the schema under test to be the one a clean
    `alembic upgrade head` produces -- not whatever a developer database happens to hold.
    Downgrading to base first is what makes "clean" true regardless of the starting state,
    and is the same operator path `test_migrations.py` drives (through `alembic.ini` and
    the real async `env.py`, never by importing the revision modules).

    Synchronous on purpose: `env.py` owns its own event loop via `asyncio.run`, so driving
    it from an async fixture would nest loops. Module-scoped and autouse, so it completes
    before the function-scoped async fixtures that the tests use.
    """
    command.downgrade(_config(database_url), "base")
    command.upgrade(_config(database_url), "head")
    yield database_url


# --- catalogue helpers --------------------------------------------------------------
#
# Raw `pg_catalog` SQL rather than SQLAlchemy's `Inspector`. Two of the five Step 9
# conditions are about *ordered* key columns, and the Inspector's constraint reflection is
# a normalised view: it is the right tool for "which constraints exist" and the wrong one
# for "prove PostgreSQL holds them in this order". `unnest(conkey) WITH ORDINALITY` is the
# authoritative answer, straight from the catalogue row PostgreSQL enforces against.


async def _scalar(connection: AsyncConnection, sql: str, **params: Any) -> Any:
    return (await connection.execute(text(sql), params)).scalar()


async def _constraints(connection: AsyncConnection, contype: str) -> dict[str, list[str]]:
    """`{constraint name: ordered key columns}` for one `pg_constraint.contype`."""
    # `contype` is PostgreSQL's single-byte `"char"` type, and asyncpg requires a
    # `bytes` argument for it -- binding `'p'` as a `str` raises `DataError` before the
    # catalogue is read at all. The cast is on the *column* side deliberately: casting
    # the parameter instead would leave asyncpg inferring `"char"` for it again. Matching
    # is unaffected; only the comparison's type is.
    result = await connection.execute(
        text(
            """
            SELECT c.conname,
                   (SELECT array_agg(a.attname ORDER BY k.ord)
                      FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
                      JOIN pg_attribute a
                        ON a.attrelid = c.conrelid AND a.attnum = k.attnum) AS cols
              FROM pg_constraint c
             WHERE c.conrelid = 'public.currency_definitions'::regclass
               AND c.contype::text = :contype
            """
        ),
        {"contype": contype},
    )
    return {row.conname: list(row.cols) for row in result}


async def _check_definitions(connection: AsyncConnection) -> dict[str, str]:
    """`{constraint name: PostgreSQL's own normalised expression}`.

    The expression is recorded for the report, not asserted verbatim: PostgreSQL rewrites a
    CHECK body when it stores it (`BETWEEN` becomes two comparisons, literals gain casts),
    so pinning the text would be brittle without proving anything the behavioural tests do
    not already prove.
    """
    result = await connection.execute(
        text(
            "SELECT conname, pg_get_constraintdef(oid) AS condef FROM pg_constraint "
            "WHERE conrelid = 'public.currency_definitions'::regclass AND contype = 'c'"
        )
    )
    return {row.conname: row.condef for row in result}


async def _columns(connection: AsyncConnection) -> dict[str, dict[str, Any]]:
    """The column contract as `information_schema` reports it."""
    result = await connection.execute(
        text(
            """
            SELECT column_name, data_type, character_maximum_length,
                   is_nullable, column_default, ordinal_position
              FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'currency_definitions'
             ORDER BY ordinal_position
            """
        )
    )
    return {
        row.column_name: {
            "data_type": row.data_type,
            "max_length": row.character_maximum_length,
            "is_nullable": row.is_nullable,
            "default": row.column_default,
            "position": row.ordinal_position,
        }
        for row in result
    }


async def _index(connection: AsyncConnection, name: str) -> dict[str, Any] | None:
    """The `pg_index` row backing a named constraint, or `None`."""
    result = await connection.execute(
        text(
            """
            SELECT i.relname AS index_name, x.indisunique, x.indisprimary,
                   x.indisvalid, x.indisready, x.indislive,
                   (SELECT array_agg(a.attname ORDER BY k.ord)
                      FROM unnest(x.indkey::int2[]) WITH ORDINALITY AS k(attnum, ord)
                      JOIN pg_attribute a
                        ON a.attrelid = x.indrelid AND a.attnum = k.attnum) AS cols
              FROM pg_constraint c
              JOIN pg_index x ON x.indexrelid = c.conindid
              JOIN pg_class i ON i.oid = x.indexrelid
             WHERE c.conrelid = 'public.currency_definitions'::regclass
               AND c.conname = :name
            """
        ),
        {"name": name},
    )
    row = result.fetchone()
    if row is None:
        return None
    return {
        "index_name": row.index_name,
        "unique": row.indisunique,
        "primary": row.indisprimary,
        "valid": row.indisvalid,
        "ready": row.indisready,
        "live": row.indislive,
        "columns": list(row.cols),
    }


# --- write helpers ------------------------------------------------------------------


@pytest_asyncio.fixture
async def db(connection: AsyncConnection) -> AsyncConnection:
    """The migrated table, on an uncommitted transaction.

    Nothing written by a test survives it: the `connection` fixture disposes without
    committing, so PostgreSQL rolls the whole thing back. `currency_definitions` holds no
    approved seed data, and Step 9 is not authorised to introduce any.
    """
    return connection


async def _insert(connection: AsyncConnection, **values: Any) -> None:
    """Insert one row. Uncommitted, so it is visible to this transaction and no other."""
    await connection.execute(INSERT_SQL, {**VALID_ROW, **values})


async def _rejects(connection: AsyncConnection, expected: str, **values: Any) -> str:
    """Assert PostgreSQL refuses the row with exactly `expected` SQLSTATE.

    **The code is the assertion, not the exception class.** `DBAPIError` is the common
    parent of every rejection here *and* of `OperationalError`/`InterfaceError`, so
    catching the class alone would let a dropped connection masquerade as a constraint
    doing its job. Requiring one specific five-character code also stops a test from
    passing for the wrong reason -- a `23505` where a `23514` was intended means the row
    was refused by uniqueness before the CHECK ever ran, and Step 9 explicitly must not
    credit a CHECK with a rejection some other constraint caused. `08xxx` and `None` both
    fail, which is the safe direction.

    The failing statement runs inside a SAVEPOINT so the aborted subtransaction does not
    poison the outer one; without it every later statement would raise
    `InFailedSqlTransaction` and the next assertion would fail for an unrelated reason.
    """
    error: DBAPIError | None = None
    try:
        # The context manager releases the SAVEPOINT on success and rolls it back on
        # failure. Doing it by hand would leave the transaction deactivated after the
        # driver error, and the explicit rollback would then raise instead of recovering.
        async with connection.begin_nested():
            await _insert(connection, **values)
    except DBAPIError as caught:
        error = caught

    assert error is not None, f"PostgreSQL accepted a row it must refuse: {values}"

    sqlstate = _sqlstate(error)
    assert sqlstate == expected, (
        f"row refused with SQLSTATE {sqlstate!r}, expected {expected!r}. "
        f"Underlying error: {error.orig!r}"
    )
    return sqlstate


# --- 1. constraints exist after a clean upgrade -------------------------------------


class TestCleanUpgradeState:
    """Condition 1: the schema under test is what `alembic upgrade head` produced."""

    @pytest.mark.asyncio
    async def test_alembic_is_at_the_approved_head(self, db: AsyncConnection) -> None:
        assert await _scalar(db, "SELECT version_num FROM alembic_version") == EXPECTED_HEAD

    @pytest.mark.asyncio
    async def test_postgres_is_major_version_16(self, db: AsyncConnection) -> None:
        """DECISION S4-3. A different major version would make every observation below a
        statement about a database this project does not run."""
        major = await _scalar(db, "SHOW server_version_num")
        assert 160000 <= int(major) < 170000, f"server_version_num={major}"

    @pytest.mark.asyncio
    async def test_the_table_exists(self, db: AsyncConnection) -> None:
        assert await _scalar(db, "SELECT to_regclass('public.currency_definitions')") == TABLE

    @pytest.mark.asyncio
    async def test_the_table_is_empty(self, db: AsyncConnection) -> None:
        """A clean upgrade seeds nothing. Which currencies Xspeeria supports is policy held
        elsewhere; a seeded row here would make this table a supported-currency authority."""
        assert await _scalar(db, "SELECT count(*) FROM currency_definitions") == 0


# --- 2. composite primary key -------------------------------------------------------


class TestCompositePrimaryKey:
    """Condition 2: `(currency, currency_def_version)`, structurally and behaviourally."""

    @pytest.mark.asyncio
    async def test_exactly_one_primary_key_exists_with_the_approved_name(
        self, db: AsyncConnection
    ) -> None:
        assert list(await _constraints(db, "p")) == [PK_NAME]

    @pytest.mark.asyncio
    async def test_primary_key_columns_are_exact_and_ordered(self, db: AsyncConnection) -> None:
        """Order is asserted, not membership. A primary key over the same two columns in
        the other order is a different index with different leading-column behaviour, and
        is not the approved contract."""
        assert (await _constraints(db, "p"))[PK_NAME] == PK_COLUMNS

    @pytest.mark.asyncio
    async def test_primary_key_is_backed_by_a_valid_unique_index(self, db: AsyncConnection) -> None:
        index = await _index(db, PK_NAME)
        assert index is not None
        assert index["unique"] and index["primary"]
        assert index["valid"] and index["ready"] and index["live"]
        assert index["columns"] == PK_COLUMNS

    @pytest.mark.asyncio
    async def test_a_valid_pair_is_accepted(self, db: AsyncConnection) -> None:
        await _insert(db)
        assert await _scalar(db, "SELECT count(*) FROM currency_definitions") == 1

    @pytest.mark.asyncio
    async def test_a_duplicate_pair_is_rejected(self, db: AsyncConnection) -> None:
        await _insert(db)
        await _rejects(db, "23505")

    @pytest.mark.asyncio
    async def test_the_same_version_under_a_different_currency_is_accepted(
        self, db: AsyncConnection
    ) -> None:
        """Versioning is **per currency**: `USD` and `EUR` may each carry a `v1`. A
        rejection here would mean the key is narrower than the approved contract."""
        await _insert(db, currency="USD")
        await _insert(db, currency="EUR")
        assert await _scalar(db, "SELECT count(*) FROM currency_definitions") == 2

    @pytest.mark.asyncio
    async def test_a_second_version_of_one_currency_is_accepted(self, db: AsyncConnection) -> None:
        """The immutability contract works by *adding* a version, never editing a row. If
        the key refused a second version of the same currency, that contract would be
        unimplementable."""
        await _insert(db, currency_def_version="v1")
        await _insert(db, currency_def_version="v2")
        assert await _scalar(db, "SELECT count(*) FROM currency_definitions") == 2


# --- 3. three-column UNIQUE candidate key -------------------------------------------


class TestThreeColumnUniqueCandidateKey:
    """Condition 3: `(currency, currency_def_version, scale)` -- DECISION 4.1B-CD2.

    **The behavioural half cannot be isolated, and that is a property of the schema, not a
    gap in the test.** The primary key covers `(currency, currency_def_version)`, a strict
    prefix of this key, so every row that would duplicate the triple already duplicates the
    pair -- the primary key refuses it first and the UNIQUE constraint never gets the
    chance to. Isolating it would require dropping or deferring the primary key, which is a
    schema change this authorisation prohibits.

    So the catalogue is the authoritative proof here, and it is a strong one: a UNIQUE
    constraint over exactly these three ordered columns, backed by an index PostgreSQL
    reports as unique, valid, ready and live -- i.e. one it is enforcing now, not one left
    behind invalid by a failed build. The tests below record that, plus the one behavioural
    fact that *is* attributable: a differing `scale` does not create a new key, because the
    scale is not part of the primary key.
    """

    @pytest.mark.asyncio
    async def test_the_unique_constraint_exists_with_the_convention_rendered_name(
        self, db: AsyncConnection
    ) -> None:
        """The name proves the `uq` naming convention rendered it. A bare identifier here
        would mean an explicit `name=` bypassed the convention -- the exact mistake the
        model's comment documents -- leaving a later migration unable to drop what it
        cannot name."""
        assert UQ_NAME in await _constraints(db, "u")

    @pytest.mark.asyncio
    async def test_unique_columns_are_exact_and_ordered(self, db: AsyncConnection) -> None:
        assert (await _constraints(db, "u"))[UQ_NAME] == UQ_COLUMNS

    @pytest.mark.asyncio
    async def test_it_is_the_only_unique_constraint(self, db: AsyncConnection) -> None:
        assert list(await _constraints(db, "u")) == [UQ_NAME]

    @pytest.mark.asyncio
    async def test_unique_is_backed_by_a_live_enforcing_index(self, db: AsyncConnection) -> None:
        """`indisvalid AND indisready AND indislive` is the catalogue's statement that
        PostgreSQL is enforcing this index right now."""
        index = await _index(db, UQ_NAME)
        assert index is not None
        assert index["unique"] and not index["primary"]
        assert index["valid"] and index["ready"] and index["live"]
        assert index["columns"] == UQ_COLUMNS

    @pytest.mark.asyncio
    async def test_the_name_fits_postgres_identifier_limit(self, db: AsyncConnection) -> None:
        """PostgreSQL truncates past 63 bytes *silently*, leaving the database holding a
        different name from the one the migration knows. 59 bytes, with no margin to
        spare -- worth asserting rather than assuming."""
        assert len(UQ_NAME.encode("utf-8")) <= 63

    @pytest.mark.asyncio
    async def test_a_differing_scale_does_not_create_a_distinct_key(
        self, db: AsyncConnection
    ) -> None:
        """The only behavioural fact attributable without isolating the UNIQUE: the triple
        is *not* the identity. Changing only `scale` still collides, because the primary
        key is the pair -- which is precisely why the redundant three-column UNIQUE has to
        be declared separately for a future FK to target."""
        await _insert(db, scale=2)
        await _rejects(db, "23505", scale=3)


# --- 4. CHECK constraints -----------------------------------------------------------


class TestCheckConstraints:
    """Condition 4: every CHECK migration 0002 declares exists and refuses its own case."""

    @pytest.mark.asyncio
    async def test_postgres_carries_exactly_the_declared_checks(self, db: AsyncConnection) -> None:
        """Exact set equality: a CHECK in the database that the migration does not declare
        is drift in the same way a missing one is."""
        assert set(await _check_definitions(db)) == set(DECLARED_CHECKS)

    @pytest.mark.asyncio
    @pytest.mark.parametrize("name", sorted(DECLARED_CHECKS))
    async def test_each_declared_check_is_present_and_is_a_check(
        self, db: AsyncConnection, name: str
    ) -> None:
        definitions = await _check_definitions(db)
        assert name in definitions
        assert definitions[name].startswith("CHECK")

    # -- currency_format --

    @pytest.mark.asyncio
    @pytest.mark.parametrize("currency", ["GBP", "NGN", "USD", "XAF", "AAA", "ZZZ"])
    async def test_currency_format_accepts_any_three_upper_case_letters(
        self, db: AsyncConnection, currency: str
    ) -> None:
        """Structural only. This CHECK must never encode which currencies Xspeeria
        supports -- that is policy held elsewhere, and a column constraint that refused
        `XAF` would quietly make this table an eligibility authority."""
        await _insert(db, currency=currency)

    @pytest.mark.asyncio
    @pytest.mark.parametrize("currency", ["gbp", "Gbp", "G1P", "G-P", "   ", "G P"])
    async def test_currency_format_rejects_malformed_codes(
        self, db: AsyncConnection, currency: str
    ) -> None:
        await _rejects(db, "23514", currency=currency)

    @pytest.mark.asyncio
    async def test_blank_padding_cannot_smuggle_a_short_code_past_char3(
        self, db: AsyncConnection
    ) -> None:
        """`CHAR(3)` blank-pads, so `'GB'` is stored as `'GB '` and the length check alone
        would let it through. The regex is what closes the hole -- a space is not
        `[A-Z]` -- so this rejection must be `23514`, not `22001`."""
        await _rejects(db, "23514", currency="GB")

    # -- scale_range --

    @pytest.mark.asyncio
    @pytest.mark.parametrize("scale", [0, 1, 2, 4, 8])
    async def test_scale_range_accepts_the_approved_span_including_both_bounds(
        self, db: AsyncConnection, scale: int
    ) -> None:
        await _insert(db, scale=scale)

    @pytest.mark.asyncio
    @pytest.mark.parametrize("scale", [-1, 9, 100])
    async def test_scale_range_rejects_values_outside_it(
        self, db: AsyncConnection, scale: int
    ) -> None:
        """The bounds match `app.core.money`, so a row this table accepts can always
        interpret an amount the money columns accept."""
        await _rejects(db, "23514", scale=scale)

    # -- def_version_not_empty --

    @pytest.mark.asyncio
    async def test_def_version_not_empty_rejects_the_empty_string(
        self, db: AsyncConnection
    ) -> None:
        await _rejects(db, "23514", currency_def_version="")

    @pytest.mark.asyncio
    @pytest.mark.parametrize("version", ["v1", "iso4217-2024a", "2024-01-01", " ", "x" * 32])
    async def test_def_version_accepts_any_non_empty_shape_including_the_full_length(
        self, db: AsyncConnection, version: str
    ) -> None:
        """The identifier is opaque and application-issued: no format is prescribed and
        only emptiness is refused. A single space is genuinely non-empty -- `VARCHAR` does
        not blank-pad, so it is not the `CHAR(3)` case above."""
        await _insert(db, currency_def_version=version)


# --- 5. column contract, NOT NULL and length ----------------------------------------


class TestColumnContract:
    """Condition 5, first half: the columns PostgreSQL actually holds."""

    @pytest.mark.asyncio
    async def test_the_table_has_exactly_the_approved_columns_in_order(
        self, db: AsyncConnection
    ) -> None:
        assert list(await _columns(db)) == [
            "currency",
            "currency_def_version",
            "scale",
            "created_at",
        ]

    @pytest.mark.asyncio
    async def test_physical_types_and_lengths(self, db: AsyncConnection) -> None:
        columns = await _columns(db)
        assert columns["currency"]["data_type"] == "character"
        assert columns["currency"]["max_length"] == 3
        assert columns["currency_def_version"]["data_type"] == "character varying"
        assert columns["currency_def_version"]["max_length"] == 32
        assert columns["scale"]["data_type"] == "smallint"
        assert columns["created_at"]["data_type"] == "timestamp with time zone"

    @pytest.mark.asyncio
    async def test_no_column_is_numeric_or_floating_point(self, db: AsyncConnection) -> None:
        """DECISION S4-1. `scale` is an exponent and `currency_def_version` an opaque
        identifier; neither may become a binary float or a NUMERIC by a later edit."""
        types = {c["data_type"] for c in (await _columns(db)).values()}
        assert not types & {"numeric", "double precision", "real"}

    @pytest.mark.asyncio
    async def test_every_column_is_not_null(self, db: AsyncConnection) -> None:
        assert {c["is_nullable"] for c in (await _columns(db)).values()} == {"NO"}

    @pytest.mark.asyncio
    async def test_created_at_defaults_to_the_server_clock(self, db: AsyncConnection) -> None:
        """Server-set so the value is the database's clock rather than an application
        host's, and so no caller can choose it."""
        assert "now()" in (await _columns(db))["created_at"]["default"]

    @pytest.mark.asyncio
    async def test_there_is_no_updated_at_or_soft_delete_column(self, db: AsyncConnection) -> None:
        """Rows are immutable historical definitions. An `updated_at`, `is_active` or
        `deleted_at` column would imply a row can be revised or retired in place -- exactly
        what must not happen to a definition that persisted amounts already point at."""
        present = set(await _columns(db))
        assert not present & {"updated_at", "is_active", "deleted_at", "retired_at"}

    @pytest.mark.asyncio
    async def test_the_table_holds_no_foreign_key(self, db: AsyncConnection) -> None:
        """`currency_definitions` references nothing. It is the target of a future
        three-column FK, not the holder of one."""
        assert await _constraints(db, "f") == {}


class TestStructuralRejections:
    """Condition 5, second half: NOT NULL and declared lengths, enforced by PostgreSQL."""

    @pytest.mark.asyncio
    @pytest.mark.parametrize("column", sorted(VALID_ROW))
    async def test_null_is_rejected_in_every_required_column(
        self, db: AsyncConnection, column: str
    ) -> None:
        await _rejects(db, "23502", **{column: None})

    @pytest.mark.asyncio
    async def test_an_over_length_currency_is_rejected_by_the_column_not_the_check(
        self, db: AsyncConnection
    ) -> None:
        """`22001`, not `23514`: the value cannot be coerced into `CHAR(3)` at all, so the
        cast fails before the regex is ever evaluated. Asserting the precise code is what
        keeps this test honest about which rule fired."""
        await _rejects(db, "22001", currency="GBPP")

    @pytest.mark.asyncio
    async def test_a_version_longer_than_the_column_is_rejected(self, db: AsyncConnection) -> None:
        await _rejects(db, "22001", currency_def_version="x" * 33)
