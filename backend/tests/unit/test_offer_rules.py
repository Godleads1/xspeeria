"""Offer rules (ADR-020, ADR-029): pure functions, no database."""

from __future__ import annotations

from decimal import Decimal

import pytest

from app.domain.offer_rules import (
    MINIMUM_MINOR,
    OFFICIAL_RATE,
    OfferInputError,
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
        ("s", "t"), [("USD", "GBP"), ("NGN", "NGN"), ("JPY", "NGN"), ("NGN", "XXX")]
    )
    def test_other_pairs_refused(self, s: str, t: str) -> None:
        assert _code(parse_pair, s, t) == "VALIDATION_ERROR"


class TestAmount:
    def test_exact_minor_units(self) -> None:
        assert parse_amount_minor("12345.67", "NGN") == 1_234_567
        assert parse_amount_minor("10", "USD") == 1_000

    def test_minimums(self) -> None:
        assert MINIMUM_MINOR == {"NGN": 1_000_000, "USD": 1_000, "GBP": 1_000, "EUR": 1_000}
        assert _code(parse_amount_minor, "9999.99", "NGN") == "VAL_422_AMOUNT_BELOW_MINIMUM"
        assert _code(parse_amount_minor, "9.99", "EUR") == "VAL_422_AMOUNT_BELOW_MINIMUM"

    @pytest.mark.parametrize("text", ["10.001", "1e3", "-10", "", " 10", "10.", "1,000", "١٠"])
    def test_malformed_refused_never_rounded(self, text: str) -> None:
        assert _code(parse_amount_minor, text, "USD") == "VALIDATION_ERROR"


class TestRate:
    def test_parses_up_to_six_places(self) -> None:
        assert parse_rate("1320.123456") == Decimal("1320.123456")
        assert _code(parse_rate, "1.1234567") == "VALIDATION_ERROR"
        assert _code(parse_rate, "NaN") == "VALIDATION_ERROR"
        assert _code(parse_rate, "Infinity") == "VALIDATION_ERROR"

    def test_positivity_is_checked_before_the_ceiling(self) -> None:
        problem = rate_problem(Decimal("0"), "USD")
        assert problem is not None and problem.code == "VAL_422_RATE_NOT_POSITIVE"
        problem = rate_problem(Decimal("-5000"), "USD")
        assert problem is not None and problem.code == "VAL_422_RATE_NOT_POSITIVE"

    @pytest.mark.parametrize("foreign", ["USD", "GBP", "EUR"])
    def test_ceiling_is_the_official_rate(self, foreign: str) -> None:
        ceiling = OFFICIAL_RATE[foreign]
        assert rate_problem(ceiling, foreign) is None
        problem = rate_problem(ceiling + Decimal("0.000001"), foreign)
        assert problem is not None and problem.code == "VAL_422_RATE_ABOVE_CEILING"

    def test_unknown_currency_has_no_ceiling_so_is_refused(self) -> None:
        problem = rate_problem(Decimal("1"), "JPY")
        assert problem is not None and problem.code == "VAL_422_RATE_ABOVE_CEILING"
