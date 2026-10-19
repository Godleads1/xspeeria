"""Payout accounts and deal preparation — pure rules (ADR-035). No I/O, no clock.

A payout account is where the partner bank pays a user from escrow. Xspeeria never holds the
money; it stores where the user wants to be paid and tells the bank. Account numbers are
format-checked here for the user's convenience only — the partner bank is authoritative.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import timedelta
from decimal import Decimal

from app.domain.offer_rules import FORMAT_ERROR, OfferInputError

__all__ = [
    "PAYOUT_CURRENCIES",
    "PREPARATION_STATES",
    "PREPARATION_WINDOW",
    "MAX_PAYOUT_ACCOUNTS_PER_DEAL",
    "NEW_ACCOUNT_HOLD",
    "AccountDetails",
    "counter_amount_minor",
    "is_valid_routing_number",
    "parse_account_details",
]

#: Product owner, 2026-10-18: "30 minutes" to choose payout accounts after a deal.
PREPARATION_WINDOW = timedelta(minutes=30)
#: ADR-008 / ADR-022: a new payout account is paid only after a 24-hour security hold.
NEW_ACCOUNT_HOLD = timedelta(hours=24)
#: PROPOSED (ADR-035): an upper bound on one request, not a product limit.
MAX_PAYOUT_ACCOUNTS_PER_DEAL = 10

#: PROPOSED literals (ADR-035) for the data dictionary's `Match.preparation_state`.
PREPARATION_STATES = ("awaiting_payout_accounts", "funding_ready", "expired")

#: Account formats the app already collects (ADR-022, `BANK_FORMS`). EUR has no approved
#: form yet, so EUR payout accounts are refused (fail closed).
PAYOUT_CURRENCIES = frozenset({"NGN", "USD", "GBP"})
_ACCOUNT_TYPES = frozenset({"Checking", "Savings"})


@dataclass(frozen=True)
class AccountDetails:
    currency: str
    bank_name: str
    account_number: str
    #: USD routing number or GBP sort code; not secret, stored as entered.
    bank_code: str | None
    account_type: str | None

    @property
    def last4(self) -> str:
        return self.account_number[-4:]


def is_valid_routing_number(v: str) -> bool:
    """ABA routing number: prefix ranges and the 3-7-1 checksum (same as the app)."""
    if not re.fullmatch(r"[0-9]{9}", v) or v == "000000000":
        return False
    prefix = int(v[:2])
    if not (prefix <= 12 or 21 <= prefix <= 32 or 61 <= prefix <= 72 or prefix == 80):
        return False
    d = [int(c) for c in v]
    return (3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8])) % 10 == 0


def _bad(message: str) -> OfferInputError:
    return OfferInputError(FORMAT_ERROR, message)


def parse_account_details(
    currency: str,
    bank_name: str,
    account_number: str,
    routing_number: str | None,
    sort_code: str | None,
    account_type: str | None,
) -> AccountDetails:
    c = currency.upper()
    if c not in PAYOUT_CURRENCIES:
        raise _bad("Payout accounts can be in NGN, USD or GBP for now.")
    name = bank_name.strip()
    if not 2 <= len(name) <= 60 or not re.fullmatch(r"[A-Za-z0-9 .,&'()\-]+", name):
        raise _bad("Enter the bank name.")
    if c == "NGN":
        if not re.fullmatch(r"[0-9]{10}", account_number):
            raise _bad("Nigerian account numbers are 10 digits.")
        if routing_number or sort_code or account_type:
            raise _bad("Only the bank name and account number are needed for NGN.")
        return AccountDetails(c, name, account_number, None, None)
    if c == "GBP":
        if not re.fullmatch(r"[0-9]{8}", account_number):
            raise _bad("UK account numbers are 8 digits.")
        if not sort_code or not re.fullmatch(r"[0-9]{6}", sort_code):
            raise _bad("Sort code is 6 digits.")
        if routing_number or account_type:
            raise _bad("Only the sort code, bank name and account number are needed for GBP.")
        return AccountDetails(c, name, account_number, sort_code, None)
    # USD
    if not re.fullmatch(r"[0-9]{4,17}", account_number):
        raise _bad("Enter a valid account number.")
    if not routing_number or not is_valid_routing_number(routing_number):
        raise _bad("Enter a valid 9-digit routing number.")
    if account_type not in _ACCOUNT_TYPES:
        raise _bad("Choose an account type.")
    if sort_code:
        raise _bad("A sort code is not used for USD.")
    return AccountDetails(c, name, account_number, routing_number, account_type)


def _half_even_div(numerator: int, divisor: int) -> int:
    q, r = divmod(numerator, divisor)
    if 2 * r > divisor or (2 * r == divisor and q % 2 == 1):
        q += 1
    return q


def counter_amount_minor(amount_minor: int, currency: str, rate: Decimal) -> int:
    """The other side of a deal in minor units, rounded half to even (ADR-019 §2).

    The rate is NGN per 1 unit of the foreign currency (both scale 2). A foreign amount gives
    NGN = amount × rate; an NGN amount gives foreign = amount ÷ rate.
    """
    micro = int((rate * 1_000_000).to_integral_exact())  # NUMERIC(12,6): exact
    if micro <= 0:
        raise ValueError("rate must be positive")
    if currency == "NGN":
        return _half_even_div(amount_minor * 1_000_000, micro)
    return _half_even_div(amount_minor * micro, 1_000_000)
