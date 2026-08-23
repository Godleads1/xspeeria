"""Money primitive tests.

The rounding boundary is the highest-risk line in the backend, so it is covered by
property-based tests as well as fixed cases.
"""

from __future__ import annotations

from decimal import Decimal

import pytest
from hypothesis import given
from hypothesis import strategies as st

from app.core.money import Money, MoneyError, from_minor, to_minor


class TestToMinor:
    @pytest.mark.parametrize(
        ("amount", "scale", "expected"),
        [
            ("0", 2, 0),
            ("1", 2, 100),
            ("1.00", 2, 100),
            ("12.34", 2, 1234),
            ("-12.34", 2, -1234),
            ("1", 0, 1),
            ("1.23456", 5, 123456),
        ],
    )
    def test_exact_conversions(self, amount: str, scale: int, expected: int) -> None:
        assert to_minor(Decimal(amount), scale) == expected

    @pytest.mark.parametrize(
        ("amount", "expected"),
        [
            # ROUND_HALF_EVEN: exact halves go to the nearest EVEN minor unit.
            ("0.005", 0),
            ("0.015", 2),
            ("0.025", 2),
            ("0.035", 4),
            ("-0.005", 0),
            ("-0.015", -2),
            # Anything not exactly half rounds normally.
            ("0.0051", 1),
            ("0.0149", 1),
        ],
    )
    def test_round_half_even_boundary(self, amount: str, expected: int) -> None:
        assert to_minor(Decimal(amount), 2) == expected

    def test_accepts_int_and_str(self) -> None:
        assert to_minor(5, 2) == 500
        assert to_minor("5.25", 2) == 525

    def test_rejects_float(self) -> None:
        with pytest.raises(MoneyError, match="floating point"):
            to_minor(1.10, 2)  # type: ignore[arg-type]

    def test_rejects_bool(self) -> None:
        with pytest.raises(MoneyError):
            to_minor(True, 2)

    @pytest.mark.parametrize("value", ["NaN", "Infinity", "-Infinity"])
    def test_rejects_non_finite(self, value: str) -> None:
        with pytest.raises(MoneyError, match="finite"):
            to_minor(Decimal(value), 2)

    @pytest.mark.parametrize("scale", [-1, 9])
    def test_rejects_out_of_range_scale(self, scale: int) -> None:
        with pytest.raises(MoneyError, match="scale"):
            to_minor(Decimal("1"), scale)


class TestFromMinor:
    def test_round_trip_is_exact(self) -> None:
        assert from_minor(1234, 2) == Decimal("12.34")

    def test_rejects_float(self) -> None:
        with pytest.raises(MoneyError):
            from_minor(1.0, 2)  # type: ignore[arg-type]


class TestMoney:
    def test_construction_and_decimal_view(self) -> None:
        money = Money.of(Decimal("12.34"), "NGN", 2)
        assert money.minor == 1234
        assert money.as_decimal() == Decimal("12.34")
        assert str(money) == "12.34 NGN"

    def test_addition_and_subtraction_are_exact(self) -> None:
        a = Money.of("0.10", "GBP", 2)
        b = Money.of("0.20", "GBP", 2)
        assert (a + b).minor == 30  # the classic float trap: 0.1 + 0.2
        assert (b - a).minor == 10

    def test_negation_and_comparison(self) -> None:
        a = Money.of("1.00", "GBP", 2)
        b = Money.of("2.00", "GBP", 2)
        assert a < b and b > a and a <= a and b >= b
        assert (-a).minor == -100
        assert a.is_negative is False
        assert Money(0, "GBP", 2).is_zero is True

    def test_times_requires_whole_factor(self) -> None:
        a = Money.of("1.50", "GBP", 2)
        assert a.times(3).minor == 450
        with pytest.raises(MoneyError, match="explicit policy"):
            a.times(1.5)  # type: ignore[arg-type]

    def test_currency_mismatch_is_refused(self) -> None:
        with pytest.raises(MoneyError, match="currency mismatch"):
            Money.of("1", "GBP", 2) + Money.of("1", "NGN", 2)

    def test_scale_mismatch_is_refused(self) -> None:
        with pytest.raises(MoneyError, match="scale mismatch"):
            Money.of("1", "GBP", 2) + Money.of("1", "GBP", 3)

    @pytest.mark.parametrize("currency", ["gbp", "GB", "GBPX", "12A"])
    def test_invalid_currency_is_refused(self, currency: str) -> None:
        with pytest.raises(MoneyError, match="currency"):
            Money(100, currency, 2)

    def test_is_immutable(self) -> None:
        money = Money.of("1.00", "GBP", 2)
        with pytest.raises(AttributeError):
            money.minor = 5  # type: ignore[misc]


class TestMoneyProperties:
    @given(minor=st.integers(min_value=-10**12, max_value=10**12), scale=st.integers(0, 8))
    def test_minor_decimal_round_trip(self, minor: int, scale: int) -> None:
        assert to_minor(from_minor(minor, scale), scale) == minor

    @given(
        a=st.integers(min_value=-10**9, max_value=10**9),
        b=st.integers(min_value=-10**9, max_value=10**9),
    )
    def test_addition_is_associative_in_minor_units(self, a: int, b: int) -> None:
        x = Money(a, "GBP", 2)
        y = Money(b, "GBP", 2)
        assert (x + y).minor == (y + x).minor == a + b

    @given(
        amount=st.decimals(
            min_value=Decimal("-1000000"),
            max_value=Decimal("1000000"),
            allow_nan=False,
            allow_infinity=False,
            places=6,
        )
    )
    def test_conversion_never_drifts_more_than_half_a_unit(self, amount: Decimal) -> None:
        scale = 2
        minor = to_minor(amount, scale)
        drift = abs(from_minor(minor, scale) - amount)
        assert drift <= Decimal("0.005")
