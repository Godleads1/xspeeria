"""Offer rules (ADR-020, ADR-029): pure functions, no database."""

from __future__ import annotations

from decimal import Decimal

import pytest

from app.domain.offer_rules import (
    CAD_PER_USD,
    CAD_PER_USD_AS_OF,
    MINIMUM_MINOR,
    OFFICIAL_RATE,
    STORED_RATE_PLACES,
    OfferInputError,
    below_minimum,
    parse_amount_minor,
    parse_pair,
    parse_rate,
    rate_problem,
)


def _code(fn: object, *args: object) -> str:
    with pytest.raises(OfferInputError) as e:
        fn(*args)  # type: ignore[operator]
    return e.value.code


class TestPair:
    @pytest.mark.parametrize(
        ("s", "t", "foreign"), [("USD", "NGN", "USD"), ("ngn", "eur", "EUR"), ("GBP", "NGN", "GBP")]
    )
    def test_naira_with_one_foreign(self, s: str, t: str, foreign: str) -> None:
        assert parse_pair(s, t).foreign == foreign

    @pytest.mark.parametrize(
        ("s", "t"), [("USD", "USD"), ("NGN", "NGN"), ("JPY", "NGN"), ("NGN", "XXX"), ("GBP", "JPY")]
    )
    def test_other_pairs_refused(self, s: str, t: str) -> None:
        assert _code(parse_pair, s, t) == "VALIDATION_ERROR"


class TestAmount:
    def test_exact_minor_units(self) -> None:
        assert parse_amount_minor("12345.67", "NGN") == 1_234_567
        assert parse_amount_minor("10", "USD") == 1_000

    def test_minimums(self) -> None:
        assert MINIMUM_MINOR == {
            "NGN": 1_000_000,
            "USD": 1_000,
            "GBP": 1_000,
            "EUR": 1_000,
            "CAD": 1_000,
            "CNY": 1_000,
            # ADR-107: 10 units; whole units where there are no cents.
            **{c: 1_000 for c in ("EGP", "ZAR", "MAD", "ETB", "KES", "GHS", "ZMW", "TZS")},
            "XOF": 10,
            "UGX": 10,
        }
        assert _code(parse_amount_minor, "9999.99", "NGN") == "VAL_422_AMOUNT_BELOW_MINIMUM"
        assert _code(parse_amount_minor, "9.99", "EUR") == "VAL_422_AMOUNT_BELOW_MINIMUM"

    @pytest.mark.parametrize("text", ["10.001", "1e3", "-10", "", " 10", "10.", "1,000", "١٠"])
    def test_malformed_refused_never_rounded(self, text: str) -> None:
        assert _code(parse_amount_minor, text, "USD") == "VALIDATION_ERROR"


class TestAcceptAmount:
    def test_without_minimum_only_positive_is_checked(self) -> None:
        assert parse_amount_minor("4.00", "USD", minimum=False) == 400
        assert _code(parse_amount_minor, "0.00", "USD") == "VALIDATION_ERROR"

    def test_below_minimum_names_the_currency(self) -> None:
        e = below_minimum("NGN")
        assert e.code == "VAL_422_AMOUNT_BELOW_MINIMUM" and "10,000.00 NGN" in e.message


class TestRate:
    def test_parses_up_to_three_places(self) -> None:
        # Owner 2026-11-10: "3 decimal not 6". More decimals are refused, never rounded.
        assert parse_rate("1320.123") == Decimal("1320.123")
        assert parse_rate("0.306") == Decimal("0.306")
        assert _code(parse_rate, "1320.1234") == "VALIDATION_ERROR"
        assert _code(parse_rate, "1.123456") == "VALIDATION_ERROR"
        # Reading back a rate the server showed: an older stored rate may have 6 decimals.
        assert parse_rate("1320.123456", STORED_RATE_PLACES) == Decimal("1320.123456")
        assert _code(parse_rate, "1.1234567") == "VALIDATION_ERROR"
        assert _code(parse_rate, "NaN") == "VALIDATION_ERROR"
        assert _code(parse_rate, "Infinity") == "VALIDATION_ERROR"

    def test_positivity_is_checked_before_the_ceiling(self) -> None:
        problem = rate_problem(Decimal("0"), "USD")
        assert problem is not None and problem.code == "VAL_422_RATE_NOT_POSITIVE"
        problem = rate_problem(Decimal("-5000"), "USD")
        assert problem is not None and problem.code == "VAL_422_RATE_NOT_POSITIVE"

    @pytest.mark.parametrize("foreign", ["USD", "GBP", "EUR", "CAD"])
    def test_ceiling_is_the_official_rate(self, foreign: str) -> None:
        ceiling = OFFICIAL_RATE[foreign]
        assert rate_problem(ceiling, foreign) is None
        problem = rate_problem(ceiling + Decimal("0.001"), foreign)
        assert problem is not None and problem.code == "VAL_422_RATE_ABOVE_CEILING"

    def test_unknown_currency_has_no_ceiling_so_is_refused(self) -> None:
        problem = rate_problem(Decimal("1"), "JPY")
        assert problem is not None and problem.code == "VAL_422_RATE_ABOVE_CEILING"

    def test_cad_ceiling_is_derived_from_the_usd_one(self) -> None:
        """ADR-101: USD ceiling ÷ Bank of Canada USD/CAD (6 Nov 2026: 1.4113)."""
        assert CAD_PER_USD == Decimal("1.4113") and CAD_PER_USD_AS_OF == "2026-11-06"
        assert OFFICIAL_RATE["CAD"] == Decimal("944.70")  # 1,333.26 ÷ 1.4113 = 944.6964…
        assert rate_problem(Decimal("944.70"), "CAD") is None
        problem = rate_problem(Decimal("944.71"), "CAD")
        assert problem is not None and problem.code == "VAL_422_RATE_ABOVE_CEILING"
