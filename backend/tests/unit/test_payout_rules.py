"""Payout rules (ADR-035): pure functions."""

from __future__ import annotations

from decimal import Decimal

import pytest

from app.domain.offer_rules import OfferInputError
from app.domain.payout_rules import (
    PREPARATION_WINDOW,
    counter_amount_minor,
    is_valid_iban,
    is_valid_routing_number,
    parse_account_details,
)


def test_window_is_30_minutes() -> None:
    assert PREPARATION_WINDOW.total_seconds() == 1800


class TestCounterAmount:
    def test_foreign_to_naira_half_even(self) -> None:
        assert counter_amount_minor(20_000, "USD", Decimal("1320.50")) == 26_410_000
        assert counter_amount_minor(1, "USD", Decimal("1320.005")) == 1320  # 1320.005 → even
        assert counter_amount_minor(1, "USD", Decimal("1321.005")) == 1321
        assert counter_amount_minor(1, "USD", Decimal("1320.500001")) == 1321

    def test_naira_to_foreign_half_even(self) -> None:
        assert counter_amount_minor(26_410_000, "NGN", Decimal("1320.50")) == 20_000
        assert counter_amount_minor(1_000_000, "NGN", Decimal("1333.26")) == 750  # 7.5005… → 750

    def test_rate_must_be_positive(self) -> None:
        with pytest.raises(ValueError):
            counter_amount_minor(1, "USD", Decimal("0"))


class TestAccounts:
    def test_routing_checksum(self) -> None:
        assert is_valid_routing_number("021000021")
        assert not is_valid_routing_number("021000022")
        assert not is_valid_routing_number("000000000")
        assert not is_valid_routing_number("02100002１")

    def test_last4_and_fields(self) -> None:
        d = parse_account_details("ngn", " Zenith Bank ", "0123456789", None, None, None)
        assert (d.currency, d.bank_name, d.last4, d.bank_code) == (
            "NGN",
            "Zenith Bank",
            "6789",
            None,
        )
        g = parse_account_details("GBP", "Barclays", "12345678", None, "200000", None)
        assert g.bank_code == "200000"

    @pytest.mark.parametrize(
        "args",
        [
            ("EUR", "ING", "12345678", None, None, None),
            ("NGN", "Zenith", "0123456789", "021000021", None, None),
            ("GBP", "Barclays", "12345678", None, "20000", None),
            ("USD", "Chase", "123", "021000021", None, "Checking"),
            ("USD", "Chase", "1234", "021000021", None, "Business"),
        ],
    )
    def test_refused(self, args: tuple[str, str, str, str | None, str | None, str | None]) -> None:
        with pytest.raises(OfferInputError):
            parse_account_details(*args)


class TestEuroIban:
    """ADR-099 (owner, 2026-11-08): EUR payout accounts take the IBAN only, no BIC."""

    @pytest.mark.parametrize(
        "iban",
        [
            "DE89370400440532013000",
            "FR1420041010050500013M02606",
            "NL91ABNA0417164300",
            "MT84MALT011000012345MTLCAST001S",  # ends in a letter
        ],
    )
    def test_valid(self, iban: str) -> None:
        assert is_valid_iban(iban)

    @pytest.mark.parametrize(
        "iban",
        [
            "DE89370400440532013001",  # one digit wrong: checksum fails
            "de89370400440532013000",  # must be normalised first
            "DE8937040044",  # too short
            "1289370400440532013000",  # no country
            "DE89 3704 0044 0532 0130 00",  # spaces: normalised first
            "",
        ],
    )
    def test_invalid(self, iban: str) -> None:
        assert not is_valid_iban(iban)

    def test_written_in_groups_is_accepted_and_stored_without_spaces(self) -> None:
        d = parse_account_details("EUR", "ING", "de89 3704 0044 0532 0130 00", None, None, None)
        assert (d.account_number, d.last4, d.bank_code) == ("DE89370400440532013000", "3000", None)
        assert (
            parse_account_details(
                "EUR", "Bank of Valletta", "MT84MALT011000012345MTLCAST001S", None, None, None
            ).last4
            == "001S"
        )

    @pytest.mark.parametrize(
        "extra",
        [("COBADEFFXXX", None, None), (None, "200000", None), (None, None, "Checking")],
    )
    def test_nothing_but_the_iban(self, extra: tuple[str | None, str | None, str | None]) -> None:
        with pytest.raises(OfferInputError):
            parse_account_details("EUR", "ING", "DE89370400440532013000", *extra)


class TestCanadianAccount:
    """ADR-100 (owner, 2026-11-09): institution (3 digits), transit (5 digits), any account."""

    def test_valid(self) -> None:
        d = parse_account_details("CAD", "RBC", "1234567", None, None, None, "003", "12345")
        assert (d.currency, d.account_number, d.bank_code, d.last4) == (
            "CAD",
            "1234567",
            "00312345",
            "4567",
        )
        assert parse_account_details("CAD", "TD", "12", None, None, None, "004", "00011").last4

    @pytest.mark.parametrize(
        ("account", "inst", "transit"),
        [
            ("1234567", "03", "12345"),  # institution too short
            ("1234567", "0031", "12345"),
            ("1234567", "003", "1234"),  # transit too short
            ("1234567", "003", None),
            ("1234567", None, "12345"),
            ("12a4567", "003", "12345"),  # not digits
            ("1" * 18, "003", "12345"),  # longer than the form allows
        ],
    )
    def test_invalid(self, account: str, inst: str | None, transit: str | None) -> None:
        with pytest.raises(OfferInputError):
            parse_account_details("CAD", "RBC", account, None, None, None, inst, transit)

    def test_nothing_else_and_only_for_cad(self) -> None:
        with pytest.raises(OfferInputError):
            parse_account_details("CAD", "RBC", "1234567", "021000021", None, None, "003", "12345")
        with pytest.raises(OfferInputError):
            parse_account_details("NGN", "GTBank", "0123456789", None, None, None, "003", None)
