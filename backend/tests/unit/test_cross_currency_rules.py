"""ADR-111: pairs without naira — which way they are quoted, their limits, deal sizes."""

from __future__ import annotations

from decimal import Decimal

import pytest

from app.domain.offer_rules import (
    FED_SNAPSHOT,
    FOREIGN,
    STRENGTH,
    OfferInputError,
    ceiling_key,
    cross_ceilings,
    naira_values,
    parse_pair,
    rate_problem,
)
from app.domain.payout_rules import counter_amount_minor
from app.domain.tier_rules import deal_kobo


def test_every_currency_has_a_place_in_the_quote_order() -> None:
    assert set(STRENGTH) == set(FOREIGN) and len(STRENGTH) == len(FOREIGN)


@pytest.mark.parametrize(
    ("source", "target", "base", "quote", "key"),
    [
        ("USD", "NGN", "USD", "NGN", "USD"),  # unchanged: naira per dollar
        ("NGN", "USD", "USD", "NGN", "USD"),
        ("USD", "GHS", "USD", "GHS", "USD/GHS"),
        ("GHS", "USD", "USD", "GHS", "USD/GHS"),  # same quote whichever side sells
        ("USD", "EUR", "EUR", "USD", "EUR/USD"),
        ("KES", "UGX", "KES", "UGX", "KES/UGX"),
    ],
)
def test_a_pair_is_always_quoted_the_same_way(
    source: str, target: str, base: str, quote: str, key: str
) -> None:
    p = parse_pair(source, target)
    assert (p.base, p.quote, ceiling_key(p)) == (base, quote, key)
    assert p.sells_quote == (source == quote)


@pytest.mark.parametrize(("s", "t"), [("USD", "USD"), ("USD", "JPY"), ("XXX", "NGN")])
def test_unknown_or_same_currencies_are_refused(s: str, t: str) -> None:
    with pytest.raises(OfferInputError):
        parse_pair(s, t)


def test_cross_limits_come_from_unrounded_naira_values_cut_down() -> None:
    limits = cross_ceilings(FED_SNAPSHOT)
    assert len(limits) == len(STRENGTH) * (len(STRENGTH) - 1) // 2  # every pair, once
    values = naira_values(FED_SNAPSHOT)
    for key, limit in limits.items():
        base, quote = key.split("/")
        exact = values[base] / values[quote]
        assert limit <= exact < limit + Decimal("0.001")
        assert limit.as_tuple().exponent >= -3
    # From the unrounded shilling value (₦0.30690…), not the rounded ₦0.306 limit.
    assert limits["GBP/UGX"] == Decimal("5751.347")


def test_the_limit_message_names_the_pair() -> None:
    problem = rate_problem(Decimal("11.605"), "USD/GHS")
    assert problem is not None and problem.message.endswith("(GHS 11.604 per USD).")
    assert rate_problem(Decimal("11.604"), "USD/GHS") is None
    naira = rate_problem(Decimal("2000"), "USD")
    assert naira is not None and "(NGN 1,333.26 per USD)" in naira.message


def test_the_other_side_of_a_deal_without_naira() -> None:
    # 100.00 USD at 11.604 cedis = 1,160.40 GHS, and back.
    assert counter_amount_minor(10_000, "USD", Decimal("11.604"), "GHS") == 116_040
    assert counter_amount_minor(116_040, "GHS", Decimal("11.604"), "USD") == 10_000
    # 1 KES at 33.4 UGX (no cents in UGX) = 33 UGX; 100 UGX → 2.99 KES (half to even).
    assert counter_amount_minor(100, "KES", Decimal("33.4"), "UGX") == 33
    assert counter_amount_minor(100, "UGX", Decimal("33.4"), "KES") == 299


def test_a_deal_without_naira_counts_its_naira_value_for_the_limits() -> None:
    # 100.00 USD of a dollars-for-cedis deal counts as ₦133,326.00 (the reviewed USD value).
    assert deal_kobo("USD", "GHS", 10_000, Decimal("11.5")) == 13_332_600
    # Naira deals are unchanged.
    assert deal_kobo("USD", "NGN", 10_000, Decimal("1320.50")) == 13_205_000
    assert deal_kobo("NGN", "USD", 13_205_000, Decimal("1320.50")) == 13_205_000
