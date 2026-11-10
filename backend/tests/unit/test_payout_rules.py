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


class TestCny:
    """ADR-105 (owner 2026-11-10): bank name, 16–19 digit card/account number, 12-digit CNAPS."""

    def test_valid(self) -> None:
        d = parse_account_details(
            "cny", "Bank of China", "6217000010012345678", None, None, None,
            cnaps_code="104100000004",
        )  # fmt: skip
        assert (d.currency, d.bank_code, d.last4) == ("CNY", "104100000004", "5678")

    @pytest.mark.parametrize(
        ("number", "cnaps", "extra"),
        [
            ("621700001001234", "104100000004", {}),  # 15 digits
            ("62170000100123456789", "104100000004", {}),  # 20 digits
            ("6217000010012345678", None, {}),
            ("6217000010012345678", "10410000000", {}),  # 11-digit CNAPS
            ("6217000010012345678", "104100000004", {"sort_code": "123456"}),
        ],
    )
    def test_refused(self, number: str, cnaps: str | None, extra: dict[str, str]) -> None:
        with pytest.raises(OfferInputError):
            parse_account_details(
                "CNY",
                "Bank of China",
                number,
                None,
                extra.get("sort_code"),
                None,
                cnaps_code=cnaps,
            )

    def test_cnaps_only_for_cny(self) -> None:
        with pytest.raises(OfferInputError):
            parse_account_details(
                "NGN", "Zenith Bank", "0123456789", None, None, None, cnaps_code="104100000004"
            )


class TestAfrica:
    """ADR-107 (owner 2026-11-10: "Bank and mobile money")."""

    def test_bank_account(self) -> None:
        d = parse_account_details(
            "KES", "Equity Bank", "0123 4567 8901", None, None, "bank", branch_code="068"
        )
        assert (d.currency, d.account_number, d.bank_code, d.account_type) == (
            "KES", "012345678901", "068", "bank",
        )  # fmt: skip
        # An Egyptian IBAN is letters and digits too.
        d = parse_account_details("EGP", "CIB", "EG380019000500000000263180002", None, None, "bank")
        assert d.bank_code is None and d.last4 == "0002"

    def test_mobile_money(self) -> None:
        d = parse_account_details("GHS", "MTN MoMo", "+233 24 123 4567", None, None, "mobile_money")
        assert (d.account_number, d.account_type, d.bank_code) == (
            "233241234567",
            "mobile_money",
            None,
        )
        # Zimbabwe pays in US dollars: a Zimbabwean wallet is a USD payout account.
        d = parse_account_details("USD", "EcoCash", "+263771234567", None, None, "mobile_money")
        assert d.currency == "USD" and d.account_number == "263771234567"

    @pytest.mark.parametrize(
        ("currency", "number", "kind", "extra"),
        [
            ("GHS", "+254712345678", "mobile_money", {}),  # a Kenyan number for Ghana
            ("EGP", "+201001234567", "mobile_money", {}),  # no mobile money for EGP
            ("KES", "12", "bank", {}),  # too short
            ("KES", "0123456789", None, {}),  # must choose bank or mobile money
            ("KES", "0123456789", "bank", {"branch_code": "0"}),  # code too short
            ("ZAR", "1234567890", "bank", {"sort_code": "123456"}),
            ("KES", "+254712345678", "mobile_money", {"branch_code": "068"}),
        ],
    )
    def test_refused(
        self, currency: str, number: str, kind: str | None, extra: dict[str, str]
    ) -> None:
        with pytest.raises(OfferInputError):
            parse_account_details(
                currency,
                "Some Bank",
                number,
                None,
                extra.get("sort_code"),
                kind,
                branch_code=extra.get("branch_code"),
            )

    def test_us_accounts_unchanged(self) -> None:
        d = parse_account_details("USD", "Chase", "123456789012", "021000021", None, "Checking")
        assert d.account_type == "Checking"
