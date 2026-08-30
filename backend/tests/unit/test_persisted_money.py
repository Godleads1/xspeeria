"""`PersistedMoney` and the reusable money schema primitives.

Two concerns, kept apart:

* the **value contract** -- field preservation, the two explicit conversions, the
  amount-free repr, and the deliberate absence of arithmetic;
* the **schema primitives** -- the four columns and the structural CHECK constraints that
  every money-bearing table will share.

The schema tests assert the *declarations* only. Whether PostgreSQL actually enforces them
is proven against a real database in the integration suite, not here.
"""

from __future__ import annotations

from dataclasses import FrozenInstanceError
from typing import Any

import pytest
from sqlalchemy import CHAR, BigInteger, CheckConstraint, SmallInteger, String

from app.core.money import Money, MoneyError
from app.db.money import (
    CURRENCY_DEF_VERSION_LENGTH,
    MAX_SCALE,
    MIN_SCALE,
    PersistedMoney,
    money_check_constraints,
    money_columns,
)

LOGICAL_FIELDS = ("amount_minor", "currency", "scale", "currency_def_version")

# Distinctive digits that appear in no other field below, so the repr assertions cannot
# pass or fail by coincidence.
AMOUNT_MINOR = 987654321
CURRENCY = "GBP"
SCALE = 2
VERSION = "iso4217-2024a"


@pytest.fixture
def persisted() -> PersistedMoney:
    return PersistedMoney(
        amount_minor=AMOUNT_MINOR,
        currency=CURRENCY,
        scale=SCALE,
        currency_def_version=VERSION,
    )


class TestConstruction:
    def test_all_four_elements_are_preserved(self, persisted: PersistedMoney) -> None:
        assert persisted.amount_minor == AMOUNT_MINOR
        assert persisted.currency == CURRENCY
        assert persisted.scale == SCALE
        assert persisted.currency_def_version == VERSION

    def test_is_immutable(self, persisted: PersistedMoney) -> None:
        """S4-1 binds the four elements at establishment; they do not change afterwards."""
        with pytest.raises(FrozenInstanceError):
            persisted.amount_minor = 1  # type: ignore[misc]

    def test_equality_is_by_value_across_all_four_elements(
        self, persisted: PersistedMoney
    ) -> None:
        same = PersistedMoney(AMOUNT_MINOR, CURRENCY, SCALE, VERSION)
        assert persisted == same

    def test_a_different_version_is_a_different_value(self, persisted: PersistedMoney) -> None:
        """The version is part of identity: the same digits under another definition are
        not the same money."""
        other = PersistedMoney(AMOUNT_MINOR, CURRENCY, SCALE, "iso4217-2025a")
        assert persisted != other

    @pytest.mark.parametrize(
        ("amount_minor", "currency", "scale"),
        [
            (1.5, CURRENCY, SCALE),  # binary floating point
            (AMOUNT_MINOR, "gbp", SCALE),  # lower case
            (AMOUNT_MINOR, "GB", SCALE),  # wrong length
            (AMOUNT_MINOR, CURRENCY, -1),  # scale below range
            (AMOUNT_MINOR, CURRENCY, 9),  # scale above range
        ],
    )
    def test_invalid_amounts_are_refused(
        self, amount_minor: Any, currency: str, scale: int
    ) -> None:
        """Validation is delegated to `Money`, not restated -- these assert the delegation
        actually happens, so an invalid amount cannot be constructed and later persisted
        without ever passing through a conversion."""
        with pytest.raises(MoneyError):
            PersistedMoney(amount_minor, currency, scale, VERSION)

    def test_currency_def_version_carries_no_format_rule(self) -> None:
        """It is an opaque application-issued identifier. Non-empty and bounded length are
        schema constraints belonging to a later batch, not to this carrier."""
        assert PersistedMoney(1, CURRENCY, SCALE, "").currency_def_version == ""


class TestToMoney:
    def test_returns_a_money(self, persisted: PersistedMoney) -> None:
        assert isinstance(persisted.to_money(), Money)

    def test_preserves_minor_currency_and_scale(self, persisted: PersistedMoney) -> None:
        money = persisted.to_money()
        assert money.minor == AMOUNT_MINOR
        assert money.currency == CURRENCY
        assert money.scale == SCALE

    def test_the_version_is_not_carried_onto_money(self, persisted: PersistedMoney) -> None:
        """`Money` is the arithmetic primitive and must stay version-free, or operands
        bound to different definitions could be combined without anything noticing."""
        money = persisted.to_money()
        assert not hasattr(money, "currency_def_version")


class TestFromMoney:
    def test_maps_minor_to_amount_minor_and_preserves_the_rest(self) -> None:
        money = Money(minor=AMOUNT_MINOR, currency=CURRENCY, scale=SCALE)
        persisted = PersistedMoney.from_money(money, VERSION)
        assert persisted.amount_minor == AMOUNT_MINOR
        assert persisted.currency == CURRENCY
        assert persisted.scale == SCALE

    def test_the_supplied_version_is_preserved_verbatim(self) -> None:
        money = Money(minor=1, currency=CURRENCY, scale=SCALE)
        assert PersistedMoney.from_money(money, "definition-7").currency_def_version == (
            "definition-7"
        )

    def test_the_version_is_required(self) -> None:
        """Never inferred, defaulted or looked up: which definition interprets an amount
        is a fact about when it was established."""
        money = Money(minor=1, currency=CURRENCY, scale=SCALE)
        with pytest.raises(TypeError):
            PersistedMoney.from_money(money)  # type: ignore[call-arg]


class TestRoundTrip:
    def test_money_survives_the_round_trip(self) -> None:
        original = Money(minor=AMOUNT_MINOR, currency=CURRENCY, scale=SCALE)
        assert PersistedMoney.from_money(original, VERSION).to_money() == original

    @pytest.mark.parametrize("minor", [0, 1, -1, 987654321, -987654321])
    def test_round_trip_is_exact_across_signs_and_zero(self, minor: int) -> None:
        """No positivity rule is asserted -- that is a per-entity schema constraint, not a
        property of the carrier."""
        original = Money(minor=minor, currency=CURRENCY, scale=SCALE)
        assert PersistedMoney.from_money(original, VERSION).to_money() == original


class TestReprDoesNotDiscloseTheAmount:
    def test_repr_omits_the_amount(self, persisted: PersistedMoney) -> None:
        rendered = repr(persisted)
        assert str(AMOUNT_MINOR) not in rendered
        assert "amount_minor" not in rendered

    def test_repr_carries_enough_structural_identity_to_debug(
        self, persisted: PersistedMoney
    ) -> None:
        rendered = repr(persisted)
        assert "PersistedMoney" in rendered
        assert CURRENCY in rendered
        assert VERSION in rendered
        assert f"scale={SCALE!r}" in rendered

    def test_str_does_not_disclose_the_amount_either(self, persisted: PersistedMoney) -> None:
        """No `__str__` is defined, so it falls back to the safe repr. This guards against
        one being added later that formats the amount."""
        assert str(AMOUNT_MINOR) not in str(persisted)

    def test_the_amount_stays_out_of_a_formatted_message(self, persisted: PersistedMoney) -> None:
        """The realistic leak: an f-string in a log line or an exception message."""
        assert str(AMOUNT_MINOR) not in f"rejected {persisted}"


class TestNoArithmeticSurface:
    """Arithmetic belongs to `Money`. Summing two `PersistedMoney` values bound to
    different `currency_def_version`s would produce a number with no defined
    interpretation, so the operators are absent rather than guarded."""

    def test_addition_is_unsupported(self, persisted: PersistedMoney) -> None:
        with pytest.raises(TypeError):
            _ = persisted + persisted  # type: ignore[operator]

    def test_subtraction_is_unsupported(self, persisted: PersistedMoney) -> None:
        with pytest.raises(TypeError):
            _ = persisted - persisted  # type: ignore[operator]

    def test_negation_is_unsupported(self, persisted: PersistedMoney) -> None:
        with pytest.raises(TypeError):
            _ = -persisted  # type: ignore[operator]

    def test_multiplication_is_unsupported(self, persisted: PersistedMoney) -> None:
        with pytest.raises(TypeError):
            _ = persisted * 2  # type: ignore[operator]

    @pytest.mark.parametrize("op", ["__lt__", "__le__", "__gt__", "__ge__"])
    def test_ordering_is_unsupported(self, persisted: PersistedMoney, op: str) -> None:
        """Ordering two amounts under different definitions is as meaningless as adding
        them."""
        other = PersistedMoney(1, CURRENCY, SCALE, VERSION)
        assert getattr(persisted, op)(other) is NotImplemented

    def test_no_arithmetic_method_is_defined(self) -> None:
        """A blanket guard: catches an operator added later without a matching test."""
        arithmetic = {
            "__add__", "__radd__", "__sub__", "__rsub__", "__mul__", "__rmul__",
            "__neg__", "__abs__", "__truediv__", "__floordiv__", "times",
        }
        assert not (arithmetic & set(vars(PersistedMoney)))


class TestMoneyColumns:
    """A. The four columns of one persisted money binding."""

    def test_exactly_four_logical_fields(self) -> None:
        assert len(money_columns()) == 4

    def test_default_names(self) -> None:
        assert set(money_columns()) == set(LOGICAL_FIELDS)

    @pytest.mark.parametrize("prefix", ["fee_", "source_", "expected_", "x"])
    def test_prefix_is_applied_exactly(self, prefix: str) -> None:
        """The caller owns the separator -- no underscore is inserted or removed."""
        assert set(money_columns(prefix)) == {f"{prefix}{f}" for f in LOGICAL_FIELDS}

    def test_column_name_matches_the_key(self) -> None:
        """The dict key is the database column name, not merely a lookup handle."""
        for name, column in money_columns("fee_").items():
            assert column.column.name == name

    def test_sql_types(self) -> None:
        columns = money_columns()
        assert isinstance(columns["amount_minor"].column.type, BigInteger)
        assert isinstance(columns["currency"].column.type, CHAR)
        assert isinstance(columns["scale"].column.type, SmallInteger)
        assert isinstance(columns["currency_def_version"].column.type, String)

    def test_char_length_is_three(self) -> None:
        column_type = money_columns()["currency"].column.type
        assert isinstance(column_type, CHAR)
        assert column_type.length == 3

    def test_varchar_length_is_thirty_two(self) -> None:
        column_type = money_columns()["currency_def_version"].column.type
        assert isinstance(column_type, String)
        assert column_type.length == 32
        assert column_type.length == CURRENCY_DEF_VERSION_LENGTH

    def test_amount_is_bigint_not_numeric(self) -> None:
        """S4-1: authoritative money is exact integer minor units, never NUMERIC or float."""
        assert str(money_columns()["amount_minor"].column.type) == "BIGINT"

    def test_not_nullable_by_default(self) -> None:
        assert all(c.column.nullable is False for c in money_columns().values())

    def test_nullable_true_applies_to_all_four(self) -> None:
        assert all(c.column.nullable is True for c in money_columns(nullable=True).values())

    def test_repeated_calls_produce_distinct_objects(self) -> None:
        """A `MappedColumn` is claimed by the first table that maps it; a shared instance
        would silently rebind and corrupt whichever model mapped second."""
        first, second = money_columns(), money_columns()
        for name in LOGICAL_FIELDS:
            assert first[name] is not second[name]
            assert first[name].column is not second[name].column

    def test_no_foreign_key_is_generated(self) -> None:
        """The three-column reference to `currency_definitions` is declared by the owning
        model, with an explicitly short name -- the repository `fk` convention overflows
        PostgreSQL's identifier limit for every realistic consumer table."""
        assert all(not c.column.foreign_keys for c in money_columns().values())

    def test_no_default_or_index_is_generated(self) -> None:
        for column in (c.column for c in money_columns().values()):
            assert column.default is None
            assert column.server_default is None
            assert column.index is None
            assert column.unique is None


class TestMoneyCheckConstraints:
    """B. The structural CHECK constraints for one persisted money binding."""

    @staticmethod
    def _by_name(prefix: str = "", positive: bool = False) -> dict[str, str]:
        return {
            str(c.name): str(c.sqltext) for c in money_check_constraints(prefix, positive)
        }

    def test_default_set_is_exactly_three(self) -> None:
        assert len(money_check_constraints()) == 3

    def test_default_names(self) -> None:
        assert set(self._by_name()) == {
            "currency_format",
            "scale_range",
            "def_version_not_empty",
        }

    def test_currency_format_expression(self) -> None:
        assert self._by_name()["currency_format"] == "currency ~ '^[A-Z]{3}$'"

    def test_scale_range_expression(self) -> None:
        assert self._by_name()["scale_range"] == f"scale BETWEEN {MIN_SCALE} AND {MAX_SCALE}"

    def test_scale_range_is_the_approved_range(self) -> None:
        """Pins the approved bounds themselves.

        The two behavioural tests below prove `app.db.money` and `app.core.money` agree.
        Agreement alone is not enough: widening both in lockstep would keep them passing
        while silently changing what Xspeeria persists. This pins the range that was
        actually approved, so that change fails here instead of passing as a
        still-consistent pair.
        """
        assert (MIN_SCALE, MAX_SCALE) == (0, 8)

    @pytest.mark.parametrize("scale", [MIN_SCALE, MAX_SCALE])
    def test_money_accepts_every_scale_the_database_accepts(self, scale: int) -> None:
        """Forward direction: a row PostgreSQL admits must always convert to a `Money`.

        The boundaries are read from `app.db.money` and exercised against the real
        `app.core.money` primitive, not compared to a literal. `app.core.money`'s accepted
        range is enforced by a private module constant that nothing outside it references,
        so a literal comparison here asserted the parity claim through no code at all:
        narrowing that constant left this passing, the CHECK unchanged, and PostgreSQL
        holding rows the domain would refuse to load. Exercising the constructor is what
        makes the two ranges actually coupled.
        """
        assert Money(minor=1, currency=CURRENCY, scale=scale).scale == scale

    @pytest.mark.parametrize("scale", [MIN_SCALE - 1, MAX_SCALE + 1])
    def test_money_rejects_every_scale_the_database_rejects(self, scale: int) -> None:
        """Reverse direction -- the half no comparison of constants can express.

        Widening `app.core.money` without widening the CHECK fails here: the domain would
        admit a scale the database refuses to store, and on a money path that surfaces at
        flush time rather than at construction.
        """
        with pytest.raises(MoneyError):
            Money(minor=1, currency=CURRENCY, scale=scale)

    def test_version_not_empty_expression(self) -> None:
        assert self._by_name()["def_version_not_empty"] == "currency_def_version <> ''"

    def test_positive_false_adds_no_positivity_check(self) -> None:
        """Zero and negative amounts stay structurally legal: positivity is entity policy,
        not a property of money."""
        joined = " ".join(self._by_name(positive=False).values())
        assert "> 0" not in joined
        assert "amount_minor" not in joined

    def test_positive_true_adds_exactly_one_more(self) -> None:
        assert len(money_check_constraints(positive=True)) == 4

    def test_positive_true_is_strictly_greater_than_zero(self) -> None:
        """Strict `> 0`, never `>= 0`: zero is invalid where positivity applies."""
        expression = self._by_name(positive=True)["amount_minor_positive"]
        assert expression == "amount_minor > 0"
        assert ">=" not in expression

    @pytest.mark.parametrize("prefix", ["fee_", "expected_"])
    def test_prefix_is_reflected_in_names(self, prefix: str) -> None:
        assert set(self._by_name(prefix, positive=True)) == {
            f"{prefix}currency_format",
            f"{prefix}scale_range",
            f"{prefix}def_version_not_empty",
            f"{prefix}amount_minor_positive",
        }

    @pytest.mark.parametrize("prefix", ["fee_", "expected_"])
    def test_prefix_is_reflected_in_expressions(self, prefix: str) -> None:
        for expression in self._by_name(prefix, positive=True).values():
            assert expression.startswith(prefix)

    def test_every_constraint_is_explicitly_named(self) -> None:
        """Never left to SQLAlchemy: an unnamed CHECK renders as `ck_<table>_None`, and a
        constraint nobody can name is a constraint nobody can drop or alter."""
        assert all(c.name for c in money_check_constraints(positive=True))

    def test_names_fit_postgresql_identifier_limit(self) -> None:
        """Rendered through the `ck_%(table_name)s_%(constraint_name)s` convention, against
        the longest expected table and prefix. PostgreSQL truncates silently at 63 bytes,
        leaving the database holding a different name from the one migrations know."""
        longest_table = "reconciliation_exceptions"
        for constraint in money_check_constraints("expected_", positive=True):
            rendered = f"ck_{longest_table}_{constraint.name}"
            assert len(rendered) <= 63, f"{rendered} is {len(rendered)} bytes"

    def test_repeated_calls_produce_distinct_objects(self) -> None:
        first, second = money_check_constraints(), money_check_constraints()
        for a, b in zip(first, second, strict=True):
            assert a is not b

    def test_names_are_stable_across_calls(self) -> None:
        assert [c.name for c in money_check_constraints(positive=True)] == [
            c.name for c in money_check_constraints(positive=True)
        ]

    def test_returns_only_check_constraints(self) -> None:
        """No foreign key, index or other schema object is smuggled in."""
        assert all(
            isinstance(c, CheckConstraint) for c in money_check_constraints(positive=True)
        )
