"""`PersistedMoney` -- the persistence binding around the arithmetic `Money` primitive.

These tests cover the value contract only: field preservation, the two explicit
conversions, the amount-free repr, and the deliberate absence of arithmetic. Column types
and CHECK constraints are a later batch's concern and are not asserted here.
"""

from __future__ import annotations

from dataclasses import FrozenInstanceError
from typing import Any

import pytest

from app.core.money import Money, MoneyError
from app.db.money import PersistedMoney

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
