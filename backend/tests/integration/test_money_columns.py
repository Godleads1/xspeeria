"""The money schema primitives, executed against real PostgreSQL 16.

The unit suite proves `money_columns()` and `money_check_constraints()` *construct* the
right SQLAlchemy objects. That is not the same claim as "PostgreSQL enforces them": a
CHECK that Python declares but the database never applies is worth nothing on a money
path. These tests create real tables from the helper output and let PostgreSQL accept or
reject every row.

**No production model is registered.** The tables below live on an isolated `MetaData`, so
`app.db.base.Base.metadata` stays empty and the 4.1A drift guard keeps passing. The
repository naming convention is imported -- not `Base` -- so the constraint names in the
catalogue are the ones a real table would carry.

Scope is the structural binding only. No `CurrencyDefinition`, no foreign key, no domain
entity, no grouped-null invariant.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

import pytest
import pytest_asyncio
from sqlalchemy import MetaData, Table, insert, inspect
from sqlalchemy.exc import DataError, IntegrityError
from sqlalchemy.ext.asyncio import AsyncConnection

from app.db.base import naming_convention
from app.db.money import money_check_constraints, money_columns

pytestmark = pytest.mark.integration

#: Isolated from `Base.metadata` on purpose -- see the module docstring. The naming
#: convention is the real one, so rendered constraint names match production.
test_metadata = MetaData(naming_convention=naming_convention)

PLAIN = "_xspeeria_money_4_1b"
POSITIVE = "_xspeeria_money_pos_4_1b"
PREFIXED = "_xspeeria_money_fee_4_1b"

plain_table = Table(
    PLAIN,
    test_metadata,
    *(column.column for column in money_columns().values()),
    *money_check_constraints(),
)

positive_table = Table(
    POSITIVE,
    test_metadata,
    *(column.column for column in money_columns().values()),
    *money_check_constraints(positive=True),
)

prefixed_table = Table(
    PREFIXED,
    test_metadata,
    *(column.column for column in money_columns("fee_").values()),
    *money_check_constraints("fee_", positive=True),
)

VALID_ROW: dict[str, Any] = {
    "amount_minor": 0,
    "currency": "GBP",
    "scale": 2,
    "currency_def_version": "v1",
}

#: The SQLSTATE classes a structural violation in this module can legitimately carry.
#: `23502` not_null_violation and `23514` check_violation surface as `IntegrityError`;
#: `22001` string_data_right_truncation -- an over-length `CHAR(3)` or `VARCHAR(32)` --
#: surfaces as `DataError`. No violation exercised below can produce any other code, and a
#: connection or protocol failure produces none of them.
STRUCTURAL_REJECTION_SQLSTATES = frozenset({"22001", "23502", "23514"})


@pytest_asyncio.fixture
async def money_tables(connection: AsyncConnection) -> AsyncIterator[AsyncConnection]:
    """Create the three tables, hand back the connection, drop them again.

    The DDL is **committed** before any test runs. Constraint-violation tests roll back
    afterwards, and an uncommitted `CREATE TABLE` would be rolled back with them, taking
    the table out from under the next assertion.
    """
    await connection.run_sync(test_metadata.create_all)
    await connection.commit()
    try:
        yield connection
    finally:
        await connection.rollback()  # a failed test may leave the transaction poisoned
        await connection.run_sync(test_metadata.drop_all)
        await connection.commit()


async def _insert(connection: AsyncConnection, table: Table, **values: Any) -> None:
    """Insert and commit. Raises on violation, leaving the caller to roll back."""
    await connection.execute(insert(table).values(**values))
    await connection.commit()


def _sqlstate(error: BaseException) -> str | None:
    """Best-effort SQLSTATE for a refused statement, or `None` when not discoverable.

    asyncpg carries the five-character code on its own exception; SQLAlchemy wraps that
    exception and does not always re-expose the attribute on the wrapper. The chain is
    therefore walked -- `.orig`, then `__cause__` and `__context__` -- rather than any one
    driver shape being assumed, and the walk is cycle-safe.

    `None` means *not discoverable here*, never *no violation*. The caller treats it as
    unavailable and falls back to the exception class, which it asserts unconditionally.
    """
    seen: set[int] = set()
    pending: list[BaseException | None] = [error]
    while pending:
        current = pending.pop()
        if current is None or id(current) in seen:
            continue
        seen.add(id(current))
        for attribute in ("sqlstate", "pgcode"):
            code = getattr(current, attribute, None)
            if isinstance(code, str) and len(code) == 5:
                return code
        pending.append(getattr(current, "orig", None))
        pending.append(current.__cause__)
        pending.append(current.__context__)
    return None


async def _rejects(connection: AsyncConnection, table: Table, **values: Any) -> None:
    """Assert PostgreSQL refuses the row *for a structural reason*, then leave the
    transaction usable.

    The accepted classes are narrow deliberately. `IntegrityError` is a subclass of
    `DBAPIError`, so the former `(IntegrityError, DBAPIError)` tuple reduced to the parent
    alone -- and that parent also covers `OperationalError` and `InterfaceError`. A
    dropped connection would then have satisfied a rejection assertion with no constraint
    having fired. `IntegrityError` (`23502` not-null, `23514` check) and `DataError`
    (`22001` over-length) are the only classes the violations in this module can raise; a
    connection or protocol failure is neither, and now fails the test instead of passing
    it.

    SQLSTATE is additionally asserted **when the driver exposes it**, which distinguishes a
    genuine constraint refusal from any other. It is skipped, not failed, when the code
    cannot be recovered: the class assertion above already holds unconditionally, so
    requiring a particular exception shape would trade one brittleness for another.

    Without the rollback the aborted transaction poisons every later statement with
    `InFailedSqlTransaction`, and the next test would fail for the wrong reason.
    """
    with pytest.raises((IntegrityError, DataError)) as excinfo:
        await _insert(connection, table, **values)

    sqlstate = _sqlstate(excinfo.value)
    assert sqlstate is None or sqlstate in STRUCTURAL_REJECTION_SQLSTATES, (
        f"row refused with SQLSTATE {sqlstate!r}, which is not a structural violation; "
        f"expected one of {sorted(STRUCTURAL_REJECTION_SQLSTATES)}"
    )

    await connection.rollback()


# --- catalogue bridges -------------------------------------------------------------
#
# `Inspector` is a synchronous API and every accessor below issues real queries against
# `pg_catalog`. Handing one back out of `run_sync` and calling it later raises
# `MissingGreenlet`: the await bridge only exists inside the callback. So each helper
# performs its whole catalogue operation *within* the sync callback and returns plain
# data -- no `Inspector` escapes.

async def _table_names(connection: AsyncConnection) -> set[str]:
    return await connection.run_sync(lambda c: set(inspect(c).get_table_names()))


async def _column_types(connection: AsyncConnection, table: str) -> dict[str, str]:
    return await connection.run_sync(
        lambda c: {col["name"]: str(col["type"]) for col in inspect(c).get_columns(table)}
    )


async def _column_nullability(connection: AsyncConnection, table: str) -> dict[str, bool]:
    return await connection.run_sync(
        lambda c: {col["name"]: bool(col["nullable"]) for col in inspect(c).get_columns(table)}
    )


async def _check_constraint_names(connection: AsyncConnection, table: str) -> set[str]:
    return await connection.run_sync(
        lambda c: {str(con["name"]) for con in inspect(c).get_check_constraints(table)}
    )


async def _foreign_key_names(connection: AsyncConnection, table: str) -> list[str]:
    return await connection.run_sync(
        lambda c: [str(fk["name"]) for fk in inspect(c).get_foreign_keys(table)]
    )


async def _count(connection: AsyncConnection, table: Table) -> int:
    result = await connection.execute(table.select())
    return len(result.fetchall())


class TestDdlIsAcceptedByPostgres:
    """1. The generated DDL is valid PostgreSQL, not merely valid SQLAlchemy."""

    @pytest.mark.asyncio
    async def test_all_three_tables_exist(self, money_tables: AsyncConnection) -> None:
        assert {PLAIN, POSITIVE, PREFIXED} <= await _table_names(money_tables)


class TestPhysicalColumnTypes:
    """2. The types PostgreSQL actually stores, read back from the catalogue."""

    @pytest.mark.asyncio
    async def test_column_types(self, money_tables: AsyncConnection) -> None:
        assert await _column_types(money_tables, PLAIN) == {
            "amount_minor": "BIGINT",
            "currency": "CHAR(3)",
            "scale": "SMALLINT",
            "currency_def_version": "VARCHAR(32)",
        }

    @pytest.mark.asyncio
    async def test_amount_is_not_numeric_or_float(
        self, money_tables: AsyncConnection
    ) -> None:
        """DECISION S4-1: authoritative money is exact integer minor units. A NUMERIC or
        DOUBLE PRECISION column here would be a silent correctness regression."""
        types = await _column_types(money_tables, PLAIN)
        assert types["amount_minor"] == "BIGINT"


class TestNullability:
    """3. `nullable=False` is enforced by the database, not merely declared."""

    @pytest.mark.asyncio
    async def test_catalogue_reports_all_four_not_null(
        self, money_tables: AsyncConnection
    ) -> None:
        nullability = await _column_nullability(money_tables, PLAIN)
        assert set(nullability) == set(VALID_ROW)
        assert not any(nullability.values())

    @pytest.mark.asyncio
    @pytest.mark.parametrize("column", list(VALID_ROW))
    async def test_null_is_rejected_for_every_money_column(
        self, money_tables: AsyncConnection, column: str
    ) -> None:
        await _rejects(money_tables, plain_table, **{**VALID_ROW, column: None})


class TestValidRowsAreAccepted:
    """4. The constraints reject what they should and nothing more."""

    @pytest.mark.asyncio
    async def test_a_structurally_valid_row_is_accepted(
        self, money_tables: AsyncConnection
    ) -> None:
        await _insert(money_tables, plain_table, **VALID_ROW)
        assert await _count(money_tables, plain_table) == 1

    @pytest.mark.asyncio
    @pytest.mark.parametrize("currency", ["GBP", "NGN", "USD", "XAF"])
    async def test_any_well_formed_currency_code_is_accepted(
        self, money_tables: AsyncConnection, currency: str
    ) -> None:
        """The CHECK is structural. It must not encode which currencies Xspeeria
        supports -- that is policy held elsewhere."""
        await _insert(money_tables, plain_table, **{**VALID_ROW, "currency": currency})

    @pytest.mark.asyncio
    async def test_a_large_bigint_amount_round_trips_exactly(
        self, money_tables: AsyncConnection
    ) -> None:
        biggest = 9223372036854775807
        await _insert(money_tables, plain_table, **{**VALID_ROW, "amount_minor": biggest})
        result = await money_tables.execute(plain_table.select())
        row = result.fetchone()
        assert row is not None
        assert row.amount_minor == biggest


class TestCurrencyFormatConstraint:
    """5. The regex is enforced by PostgreSQL, not by application validation."""

    @pytest.mark.asyncio
    @pytest.mark.parametrize("currency", ["gbp", "GB", "GBPP", "G1P", "G-P", "   "])
    async def test_malformed_currency_is_rejected(
        self, money_tables: AsyncConnection, currency: str
    ) -> None:
        await _rejects(money_tables, plain_table, **{**VALID_ROW, "currency": currency})

    @pytest.mark.asyncio
    async def test_blank_padding_cannot_smuggle_a_short_code_past_char3(
        self, money_tables: AsyncConnection
    ) -> None:
        """`CHAR(3)` blank-pads, so `'GB'` is stored as `'GB '`. The regex is what closes
        that hole -- a space is not `[A-Z]`."""
        await _rejects(money_tables, plain_table, **{**VALID_ROW, "currency": "GB"})


class TestScaleRangeConstraint:
    """6. Scale bounds match `app.core.money`, enforced in the database."""

    @pytest.mark.asyncio
    @pytest.mark.parametrize("scale", [0, 8])
    async def test_boundary_values_are_accepted(
        self, money_tables: AsyncConnection, scale: int
    ) -> None:
        await _insert(money_tables, plain_table, **{**VALID_ROW, "scale": scale})

    @pytest.mark.asyncio
    @pytest.mark.parametrize("scale", [-1, 9])
    async def test_out_of_range_scale_is_rejected(
        self, money_tables: AsyncConnection, scale: int
    ) -> None:
        await _rejects(money_tables, plain_table, **{**VALID_ROW, "scale": scale})


class TestVersionNotEmptyConstraint:
    """7. An empty version is refused; its content is otherwise opaque."""

    @pytest.mark.asyncio
    async def test_empty_version_is_rejected(self, money_tables: AsyncConnection) -> None:
        await _rejects(money_tables, plain_table, **{**VALID_ROW, "currency_def_version": ""})

    @pytest.mark.asyncio
    @pytest.mark.parametrize("version", ["v1", "2024-01-01", "x" * 32])
    async def test_any_non_empty_version_shape_is_accepted(
        self, money_tables: AsyncConnection, version: str
    ) -> None:
        """No format is prescribed: the identifier is opaque and application-issued."""
        await _insert(
            money_tables, plain_table, **{**VALID_ROW, "currency_def_version": version}
        )

    @pytest.mark.asyncio
    async def test_a_version_longer_than_the_column_is_rejected(
        self, money_tables: AsyncConnection
    ) -> None:
        await _rejects(
            money_tables, plain_table, **{**VALID_ROW, "currency_def_version": "x" * 33}
        )


class TestPositiveFalse:
    """8. Without opt-in positivity, zero and negative amounts are structurally legal."""

    @pytest.mark.asyncio
    @pytest.mark.parametrize("amount_minor", [0, -1, -987654321])
    async def test_zero_and_negative_amounts_are_accepted(
        self, money_tables: AsyncConnection, amount_minor: int
    ) -> None:
        """Positivity is entity policy, not a property of money: a ledger line and a
        reconciliation delta are both legitimately non-positive."""
        await _insert(
            money_tables, plain_table, **{**VALID_ROW, "amount_minor": amount_minor}
        )


class TestPositiveTrue:
    """9. With opt-in positivity, PostgreSQL enforces a strict `> 0`."""

    @pytest.mark.asyncio
    @pytest.mark.parametrize("amount_minor", [1, 987654321])
    async def test_positive_amounts_are_accepted(
        self, money_tables: AsyncConnection, amount_minor: int
    ) -> None:
        await _insert(
            money_tables, positive_table, **{**VALID_ROW, "amount_minor": amount_minor}
        )

    @pytest.mark.asyncio
    @pytest.mark.parametrize("amount_minor", [0, -1])
    async def test_zero_and_negative_are_rejected(
        self, money_tables: AsyncConnection, amount_minor: int
    ) -> None:
        """Strict `> 0`, never `>= 0`: zero is invalid where positivity applies."""
        await _rejects(
            money_tables, positive_table, **{**VALID_ROW, "amount_minor": amount_minor}
        )


class TestPrefixedColumns:
    """10. A prefixed binding behaves identically under its own column names."""

    @pytest.mark.asyncio
    async def test_prefixed_column_names_exist_verbatim(
        self, money_tables: AsyncConnection
    ) -> None:
        assert set(await _column_types(money_tables, PREFIXED)) == {
            "fee_amount_minor",
            "fee_currency",
            "fee_scale",
            "fee_currency_def_version",
        }

    @pytest.mark.asyncio
    async def test_prefixed_types_match_the_unprefixed_binding(
        self, money_tables: AsyncConnection
    ) -> None:
        assert await _column_types(money_tables, PREFIXED) == {
            "fee_amount_minor": "BIGINT",
            "fee_currency": "CHAR(3)",
            "fee_scale": "SMALLINT",
            "fee_currency_def_version": "VARCHAR(32)",
        }

    @pytest.mark.asyncio
    async def test_a_valid_prefixed_row_is_accepted(
        self, money_tables: AsyncConnection
    ) -> None:
        await _insert(
            money_tables,
            prefixed_table,
            fee_amount_minor=250,
            fee_currency="GBP",
            fee_scale=2,
            fee_currency_def_version="v1",
        )

    @pytest.mark.asyncio
    async def test_prefixed_checks_are_enforced(self, money_tables: AsyncConnection) -> None:
        """The constraints follow the prefix -- they are not silently bound to the
        unprefixed column names."""
        await _rejects(
            money_tables,
            prefixed_table,
            fee_amount_minor=250,
            fee_currency="gbp",
            fee_scale=2,
            fee_currency_def_version="v1",
        )


class TestConstraintCatalogue:
    """PostgreSQL's own record of what it is enforcing.

    Names are asserted rather than expressions: PostgreSQL normalises a CHECK body when it
    stores it (`BETWEEN` becomes a pair of comparisons, literals gain casts), so asserting
    the exact text would be brittle without proving anything the insert tests do not.
    """

    @pytest.mark.asyncio
    async def test_plain_table_carries_the_three_default_checks(
        self, money_tables: AsyncConnection
    ) -> None:
        assert await _check_constraint_names(money_tables, PLAIN) == {
            f"ck_{PLAIN}_currency_format",
            f"ck_{PLAIN}_scale_range",
            f"ck_{PLAIN}_def_version_not_empty",
        }

    @pytest.mark.asyncio
    async def test_positive_table_carries_a_fourth_check(
        self, money_tables: AsyncConnection
    ) -> None:
        names = await _check_constraint_names(money_tables, POSITIVE)
        assert f"ck_{POSITIVE}_amount_minor_positive" in names
        assert len(names) == 4

    @pytest.mark.asyncio
    async def test_every_stored_constraint_name_is_within_the_identifier_limit(
        self, money_tables: AsyncConnection
    ) -> None:
        """PostgreSQL truncates past 63 bytes silently. A truncated name in the catalogue
        would not match the one a migration tries to drop."""
        for table in (PLAIN, POSITIVE, PREFIXED):
            for name in await _check_constraint_names(money_tables, table):
                assert len(name) <= 63, f"{name} is {len(name)} bytes"


class TestNoForeignKey:
    """11. The helper emits no foreign key -- confirmed against the database."""

    @pytest.mark.asyncio
    @pytest.mark.parametrize("table", [PLAIN, POSITIVE, PREFIXED])
    async def test_no_foreign_key_exists(
        self, money_tables: AsyncConnection, table: str
    ) -> None:
        """The three-column reference to `currency_definitions` is declared by the owning
        model with an explicitly short name; it is not this helper's to emit."""
        assert await _foreign_key_names(money_tables, table) == []
