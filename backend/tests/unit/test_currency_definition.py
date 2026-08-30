"""The `CurrencyDefinition` mapping -- declaration only.

These assert what the model *declares*: column types, the composite key, the constraints
and, just as importantly, the columns that must never appear. Whether PostgreSQL enforces
any of it is proven against a real database in a later step, not here.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path
from typing import cast

import pytest
from sqlalchemy import (
    CHAR,
    CheckConstraint,
    DateTime,
    SmallInteger,
    String,
    Table,
    UniqueConstraint,
)
from sqlalchemy.schema import ForeignKeyConstraint

from app.core.money import Money, MoneyError
from app.db.base import Base
from app.db.money import CURRENCY_DEF_VERSION_LENGTH, MAX_SCALE, MIN_SCALE
from app.models.currency_definition import CurrencyDefinition

# `__table__` is typed as `FromClause` on the declarative class; narrowed once here so
# every assertion below can reach `.constraints`, `.columns` and `.info`.
TABLE: Table = cast(Table, CurrencyDefinition.__table__)
EXPECTED_COLUMNS = {"currency", "currency_def_version", "scale", "created_at"}

#: Anything implying a row can be revised, retired, or made to carry pricing or
#: eligibility. Each would change what this table *is*.
FORBIDDEN_COLUMNS = {
    "id",
    "uuid",
    "updated_at",
    "deleted_at",
    "is_active",
    "active",
    "enabled",
    "rate",
    "exchange_rate",
    "reference_rate",
    "provider",
    "corridor",
    "jurisdiction",
    "country",
    "liquidity",
    "spread",
    "policy",
    "market_price",
}


def _check(short_name: str) -> CheckConstraint:
    """Look up a CHECK by its RENDERED name.

    The `ck` convention interpolates `%(constraint_name)s`, so by the time the table
    exists the short name passed at declaration has already become
    `ck_<table>_<short_name>`.
    """
    name = f"ck_currency_definitions_{short_name}"
    matches = [
        c
        for c in TABLE.constraints
        if isinstance(c, CheckConstraint) and c.name == name
    ]
    if not matches:
        found = sorted(str(c.name) for c in TABLE.constraints)
        raise AssertionError(f"no CHECK named {name!r}; found {found}")
    return matches[0]


class TestTableIdentity:
    def test_tablename(self) -> None:
        assert CurrencyDefinition.__tablename__ == "currency_definitions"

    def test_columns_are_exactly_the_four_approved(self) -> None:
        assert set(TABLE.columns.keys()) == EXPECTED_COLUMNS

    @pytest.mark.parametrize("forbidden", sorted(FORBIDDEN_COLUMNS))
    def test_forbidden_column_is_absent(self, forbidden: str) -> None:
        """Covers requirements 8, 14, 15 and 16 in one place: no surrogate key, no
        mutation or lifecycle flag, and no rate/provider/corridor/policy field."""
        assert forbidden not in TABLE.columns


class TestColumnTypes:
    def test_currency_is_char3_not_null(self) -> None:
        column = TABLE.columns["currency"]
        assert isinstance(column.type, CHAR)
        assert column.type.length == 3
        assert column.nullable is False

    def test_version_is_varchar32_not_null(self) -> None:
        column = TABLE.columns["currency_def_version"]
        assert isinstance(column.type, String)
        assert column.type.length == 32
        assert column.type.length == CURRENCY_DEF_VERSION_LENGTH
        assert column.nullable is False

    def test_scale_is_smallint_not_null(self) -> None:
        column = TABLE.columns["scale"]
        assert isinstance(column.type, SmallInteger)
        assert column.nullable is False


class TestCreatedAt:
    def test_is_timezone_aware(self) -> None:
        """Naive timestamps on a money-adjacent table are a correctness hazard: the same
        instant would read differently depending on the writer's clock zone."""
        column_type = TABLE.columns["created_at"].type
        assert isinstance(column_type, DateTime)
        assert column_type.timezone is True

    def test_is_not_nullable(self) -> None:
        assert TABLE.columns["created_at"].nullable is False

    def test_has_a_server_default(self) -> None:
        assert TABLE.columns["created_at"].server_default is not None

    def test_the_default_is_server_side_not_application_side(self) -> None:
        """The database clock, not an application host's, and not a value a caller can
        choose."""
        column = TABLE.columns["created_at"]
        assert column.default is None
        assert "now()" in str(column.server_default.arg).lower()  # type: ignore[union-attr]


class TestPrimaryKey:
    def test_is_exactly_the_composite_pair(self) -> None:
        assert [c.name for c in TABLE.primary_key.columns] == [
            "currency",
            "currency_def_version",
        ]

    def test_versioning_is_per_currency(self) -> None:
        """Because `currency` is part of the key, `USD v1` and `EUR v1` coexist."""
        assert "currency" in TABLE.primary_key.columns

    def test_no_surrogate_key_column(self) -> None:
        assert not any(c.autoincrement is True for c in TABLE.primary_key.columns)


class TestUniqueConstraint:
    def test_three_column_unique_exists(self) -> None:
        uniques = [c for c in TABLE.constraints if isinstance(c, UniqueConstraint)]
        assert len(uniques) == 1
        assert [c.name for c in uniques[0].columns] == [
            "currency",
            "currency_def_version",
            "scale",
        ]

    def test_it_is_named_for_use_as_a_foreign_key_target(self) -> None:
        """DECISION 4.1B-CD2: PostgreSQL needs a UNIQUE over exactly these columns before
        a future money-bearing table can bind all three as a composite FK."""
        unique = next(c for c in TABLE.constraints if isinstance(c, UniqueConstraint))
        assert unique.name == "uq_currency_definitions_currency_currency_def_version_scale"


class TestCheckConstraints:
    def test_currency_format_check(self) -> None:
        assert str(_check("currency_format").sqltext) == "currency ~ '^[A-Z]{3}$'"

    def test_scale_range_check(self) -> None:
        expected = f"scale BETWEEN {MIN_SCALE} AND {MAX_SCALE}"
        assert str(_check("scale_range").sqltext) == expected

    def test_scale_range_is_the_approved_range(self) -> None:
        """Pins the approved bounds, which agreement between modules cannot pin.

        The two behavioural tests below couple this table's CHECK to `app.core.money`.
        Widening both in lockstep would keep them passing while silently changing the
        scale range Xspeeria persists; that change fails here instead.
        """
        assert (MIN_SCALE, MAX_SCALE) == (0, 8)

    @pytest.mark.parametrize("scale", [MIN_SCALE, MAX_SCALE])
    def test_money_accepts_every_scale_this_table_accepts(self, scale: int) -> None:
        """A `scale` this table stores must always interpret an amount `Money` accepts.

        `currency_definitions` exists to say what a persisted `amount_minor` means, so a
        definition row carrying a scale the domain primitive rejects would be an
        uninterpretable interpretation record. The bound is exercised against the real
        constructor rather than compared to a literal, because `app.core.money`'s range
        lives in a private constant that nothing outside that module references -- a
        literal comparison proved the claim through no code at all.
        """
        assert Money(minor=1, currency="GBP", scale=scale).scale == scale

    @pytest.mark.parametrize("scale", [MIN_SCALE - 1, MAX_SCALE + 1])
    def test_money_rejects_every_scale_this_table_rejects(self, scale: int) -> None:
        """The reverse direction: what the CHECK refuses, `Money` must refuse too."""
        with pytest.raises(MoneyError):
            Money(minor=1, currency="GBP", scale=scale)

    def test_version_not_empty_check(self) -> None:
        assert str(_check("def_version_not_empty").sqltext) == "currency_def_version <> ''"

    def test_exactly_three_checks(self) -> None:
        checks = [c for c in TABLE.constraints if isinstance(c, CheckConstraint)]
        assert {str(c.name) for c in checks} == {
            "ck_currency_definitions_currency_format",
            "ck_currency_definitions_scale_range",
            "ck_currency_definitions_def_version_not_empty",
        }

    def test_no_check_encodes_a_supported_currency_list(self) -> None:
        """The format check is structural. Which currencies Xspeeria supports is policy
        held elsewhere and must not be frozen into a column constraint."""
        checks = [c for c in TABLE.constraints if isinstance(c, CheckConstraint)]
        joined = " ".join(str(c.sqltext) for c in checks)
        for code in ("USD", "GBP", "EUR", "NGN"):
            assert code not in joined


class TestConstraintNaming:
    def test_every_constraint_is_explicitly_named(self) -> None:
        assert all(c.name for c in TABLE.constraints)

    def test_rendered_names(self) -> None:
        """The identifiers PostgreSQL will actually hold, after the repository convention
        in `app.db.base` is applied."""
        rendered = {str(c.name) for c in TABLE.constraints}
        assert rendered == {
            "pk_currency_definitions",
            "uq_currency_definitions_currency_currency_def_version_scale",
            "ck_currency_definitions_currency_format",
            "ck_currency_definitions_scale_range",
            "ck_currency_definitions_def_version_not_empty",
        }

    def test_rendered_names_fit_the_identifier_limit(self) -> None:
        """PostgreSQL truncates past 63 bytes silently, leaving the catalogue holding a
        different name from the one a migration would try to drop."""
        for constraint in TABLE.constraints:
            name = str(constraint.name)
            assert len(name) <= 63, f"{name} is {len(name)} bytes"


class TestNoForeignKeys:
    def test_the_table_declares_no_foreign_key(self) -> None:
        """This table is the FK *target*. The three-column reference is declared by the
        owning money-bearing model, with an explicitly short name."""
        assert TABLE.foreign_keys == set()

    def test_no_foreign_key_constraint_object(self) -> None:
        assert not [c for c in TABLE.constraints if isinstance(c, ForeignKeyConstraint)]


class TestNoRuntimeImmutabilityMechanismYet:
    def test_no_trigger_or_ddl_event_is_attached(self) -> None:
        """GATE 4.1B-CD3: the enforcement mechanism is deliberately unchosen and needs
        human approval before the first money-bearing FK exists."""
        assert TABLE.info.get("triggers") is None
        assert not any("trigger" in str(c.name).lower() for c in TABLE.constraints)


class TestNoSeedDataOrEnums:
    def test_module_defines_only_the_model(self) -> None:
        import app.models.currency_definition as module

        assert module.__all__ == ["CurrencyDefinition"]

    def test_no_seed_rows_are_declared(self) -> None:
        """No insert, no defaults table, no bootstrap list -- an unapproved currency
        definition shipped as data would be policy smuggled in as code."""
        import app.models.currency_definition as module

        exported = {
            name: value
            for name, value in vars(module).items()
            if not name.startswith("_") and isinstance(value, (list, tuple, dict, set))
        }
        assert exported == {"__all__": ["CurrencyDefinition"]} or all(
            name == "__all__" for name in exported
        )

    def test_no_business_enum_is_defined(self) -> None:
        import enum

        import app.models.currency_definition as module

        assert not [
            value
            for value in vars(module).values()
            if isinstance(value, type) and issubclass(value, enum.Enum)
        ]


class TestRepr:
    def test_repr_identifies_the_definition(self) -> None:
        definition = CurrencyDefinition(
            currency="GBP", currency_def_version="v1", scale=2
        )
        rendered = repr(definition)
        assert "CurrencyDefinition" in rendered
        assert "GBP" in rendered
        assert "v1" in rendered


class TestPackageRegistration:
    """STEP 7. `import app.models` must register the table on `Base.metadata`.

    This is the property Alembic depends on: `migrations/env.py` compares against
    `Base.metadata`, so a model the package does not import is one autogenerate cannot
    see -- and one it would propose dropping from a schema that already has it.
    """

    def test_currency_definition_is_exported_from_the_package(self) -> None:
        import app.models

        assert "CurrencyDefinition" in app.models.__all__
        assert hasattr(app.models, "CurrencyDefinition")

    def test_the_export_is_the_same_class_object(self) -> None:
        """Not a re-declaration: one class, one table, one mapper."""
        import app.models
        import app.models.currency_definition as module

        assert app.models.CurrencyDefinition is module.CurrencyDefinition
        assert app.models.CurrencyDefinition is CurrencyDefinition

    def test_metadata_contains_exactly_the_approved_tables(self) -> None:
        import app.models  # noqa: F401  -- imported for its registration side effect

        assert set(Base.metadata.tables) == {"currency_definitions"}

    @pytest.mark.parametrize(
        "future_table",
        [
            "offers",
            "matches",
            "transactions",
            "settlements",
            "settlement_legs",
            "payout_executions",
            "kyc_cases",
            "kyc_profiles",
            "beneficiary_accounts",
            "idempotency_records",
            "users",
        ],
    )
    def test_no_future_batch_table_is_registered(self, future_table: str) -> None:
        """4.1C-4.1H entities must not appear ahead of their approved batch."""
        import app.models  # noqa: F401

        assert future_table not in Base.metadata.tables

    def test_importing_the_package_alone_registers_the_table(self) -> None:
        """Proven in a *subprocess*, because this test module already imports the model
        directly -- in-process the table would be registered either way, so the assertion
        would pass without the package import doing anything.
        """
        backend_root = Path(__file__).resolve().parents[2]
        result = subprocess.run(
            [
                sys.executable,
                "-c",
                "import app.models; from app.db.base import Base; "
                "print(sorted(Base.metadata.tables))",
            ],
            capture_output=True,
            text=True,
            check=False,
            env={**os.environ, "PYTHONPATH": str(backend_root)},
        )
        assert result.returncode == 0, result.stderr
        assert result.stdout.strip() == "['currency_definitions']"

    def test_registration_opens_no_connection(self) -> None:
        """Metadata registration only. If importing models built an engine, the
        application could no longer boot without a database -- which `app.db.session`
        exists to guarantee it can."""
        backend_root = Path(__file__).resolve().parents[2]
        result = subprocess.run(
            [
                sys.executable,
                "-c",
                "import app.models; import app.db.session as s; "
                "print(s._engine is None, s._sessionmaker is None)",
            ],
            capture_output=True,
            text=True,
            check=False,
            env={**os.environ, "PYTHONPATH": str(backend_root)},
        )
        assert result.returncode == 0, result.stderr
        assert result.stdout.strip() == "True True"

    def test_the_migration_chain_is_exactly_the_approved_set(self) -> None:
        """An exact-set guard over `migrations/versions/`.

        Written in Step 7 as `== ["0001_baseline.py"]`, to prove that package
        registration alone created no migration. Step 8 then legitimately generated
        `0002_currency_definitions.py`, so the expected set advances with the approved
        chain -- a lifecycle-stage update, not a weakening.

        It stays an **exact** equality deliberately: a subset or `in` check would let an
        unreviewed revision appear in the directory without anything noticing, and an
        unapproved migration is exactly what this guard exists to catch.
        """
        repo_root = Path(__file__).resolve().parents[3]
        versions = sorted(p.name for p in (repo_root / "migrations" / "versions").glob("*.py"))
        assert versions == [
            "0001_baseline.py",
            "0002_currency_definitions.py",
        ]
