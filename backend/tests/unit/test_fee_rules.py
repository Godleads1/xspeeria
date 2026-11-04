"""ADR-098: the Xspeeria Fair Fee, pinned to the owner's figures (2026-11-04)."""

from __future__ import annotations

import pytest

from app.domain.fee_rules import MAKER_DISCOUNT_BPS, SCHEDULES, side_fee_minor


def test_the_decided_figures() -> None:
    assert MAKER_DISCOUNT_BPS == 2_500
    usd = SCHEDULES["USD"]
    assert usd.bands == ((100_000, 100), (500_000, 60), (None, 30))
    assert (usd.minimum_minor, usd.maximum_minor) == (50, 3_000)
    ngn = SCHEDULES["NGN"]
    assert ngn.bands == ((160_000_000, 100), (800_000_000, 60), (None, 30))
    assert (ngn.minimum_minor, ngn.maximum_minor) == (80_000, 4_800_000)
    assert SCHEDULES["GBP"] == SCHEDULES["EUR"] == usd


@pytest.mark.parametrize(
    ("dollars", "taker_cents", "maker_cents"),
    [
        (20, 50, 50),  # 1% = $0.20 → minimum $0.50 for both sides
        (100, 100, 75),  # the worked example: taker $1, maker $0.75
        (1_000, 1_000, 750),  # taker $10, maker $7.50
        (2_000, 1_600, 1_200),  # $10 on the first 1,000 + 0.6% of 1,000 = $16
        (5_000, 3_000, 2_250),  # $10 + $24 = $34 → capped at $30; maker $22.50
        (20_000, 3_000, 2_250),  # capped
    ],
)
def test_dollar_side(dollars: int, taker_cents: int, maker_cents: int) -> None:
    assert side_fee_minor(dollars * 100, "USD", "taker") == taker_cents
    assert side_fee_minor(dollars * 100, "USD", "maker") == maker_cents


@pytest.mark.parametrize(
    ("naira", "taker_kobo", "maker_kobo"),
    [
        (5_000, 80_000, 80_000),  # 1% = ₦50 → minimum ₦800
        (160_000, 160_000, 120_000),  # ₦1,600 / ₦1,200
        (1_600_000, 1_600_000, 1_200_000),  # Chidi: ₦16,000 (₦12,000 as maker)
        (8_000_000, 4_800_000, 3_600_000),  # ₦16,000 + ₦38,400 = ₦54,400 → cap ₦48,000
    ],
)
def test_naira_side_in_naira(naira: int, taker_kobo: int, maker_kobo: int) -> None:
    assert side_fee_minor(naira * 100, "NGN", "taker") == taker_kobo
    assert side_fee_minor(naira * 100, "NGN", "maker") == maker_kobo


def test_band_edges_and_rounding() -> None:
    # Exactly at the first edge: 1% of $1,000; one cent above: + 0.6% of $0.01 (rounds to 0).
    assert side_fee_minor(100_000, "USD", "taker") == 1_000
    assert side_fee_minor(100_001, "USD", "taker") == 1_000
    # Half a cent rounds to even: 1% of $0.50 × … covered by the minimum; use a mid value.
    assert side_fee_minor(123_456, "USD", "taker") == 1_000 + 141  # 0.6% of 234.56 = 1.40736
    assert side_fee_minor(0, "USD", "taker") == 0


def test_refuses_what_it_does_not_know() -> None:
    with pytest.raises(ValueError):
        side_fee_minor(-1, "USD", "taker")
    with pytest.raises(ValueError):
        side_fee_minor(100, "JPY", "taker")
