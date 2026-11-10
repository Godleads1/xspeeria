"""ADR-107 (owner 2026-11-10): eleven African countries."""

from __future__ import annotations

from decimal import ROUND_DOWN, Decimal

import pytest

from app.domain.kyc_rules import COUNTRIES
from app.domain.offer_rules import (
    AFRICA_PER_USD,
    AFRICAN,
    OFFICIAL_RATE,
    SCALE,
    XOF_PER_EUR,
    OfferInputError,
    parse_amount_minor,
    with_derived,
)
from app.domain.settlement_rules import JURISDICTION, SHARED_CURRENCIES
from app.services import currency_switch


def test_countries_and_currencies() -> None:
    assert {"EG", "ZA", "MA", "ET", "KE", "SN", "GH", "ZW", "UG", "ZM", "TZ"} <= set(COUNTRIES)
    assert {JURISDICTION[c] for c in AFRICAN} == {
        "EG", "ZA", "MA", "ET", "KE", "SN", "GH", "UG", "ZM", "TZ"
    }  # fmt: skip
    # Zimbabwe pays in US dollars; the dollar is shared like the euro.
    assert SHARED_CURRENCIES["USD"] == ("US", "ZW")


def test_ceilings_follow_usd_and_the_xof_peg() -> None:
    usd, eur = OFFICIAL_RATE["USD"], OFFICIAL_RATE["EUR"]
    for c, per_usd in AFRICA_PER_USD.items():
        exact = usd / per_usd
        assert OFFICIAL_RATE[c] == exact.quantize(Decimal("0.001"), rounding=ROUND_DOWN)
        # Rounded down: the limit never exceeds the official rate.
        assert OFFICIAL_RATE[c] <= exact
    assert OFFICIAL_RATE["XOF"] == (eur / XOF_PER_EUR).quantize(
        Decimal("0.001"), rounding=ROUND_DOWN
    )
    # Owner: "3 decimal not 6" (a Ugandan shilling is about ₦0.31).
    assert OFFICIAL_RATE["UGX"] == Decimal("0.306") and OFFICIAL_RATE["XOF"] == Decimal("2.273")
    # No base ceiling, none derived.
    assert not AFRICAN & set(with_derived({"GBP": Decimal("1765")}))


def test_whole_units_where_there_are_no_cents() -> None:
    assert SCALE["UGX"] == SCALE["XOF"] == 0
    assert parse_amount_minor("5000", "UGX") == 5000
    with pytest.raises(OfferInputError):
        parse_amount_minor("5000.50", "UGX")
    assert parse_amount_minor("100.50", "KES") == 10050


def test_on_for_testing_off_when_live(monkeypatch: pytest.MonkeyPatch) -> None:
    class Fake:
        app_env = "production"

    assert not AFRICAN & currency_switch.default_off()
    monkeypatch.setattr(currency_switch, "get_settings", lambda: Fake())
    assert AFRICAN <= currency_switch.default_off()
    assert "CNY" in currency_switch.default_off()
