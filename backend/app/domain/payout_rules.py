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

from app.domain.offer_rules import AFRICAN, FORMAT_ERROR, OfferInputError

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
#: Product owner, 2026-10-19 (DEC-044): a new account can be paid at once (was 24 hours,
#: ADR-008/022). Adding it and choosing it for a deal each need an authenticator code.
NEW_ACCOUNT_HOLD = timedelta(0)
#: PROPOSED (ADR-035): an upper bound on one request, not a product limit.
MAX_PAYOUT_ACCOUNTS_PER_DEAL = 10

#: PROPOSED literals (ADR-035) for the data dictionary's `Match.preparation_state`.
PREPARATION_STATES = ("awaiting_payout_accounts", "funding_ready", "expired")

#: Account formats the app collects (ADR-022, `BANK_FORMS`). EUR: the IBAN only, no BIC
#: (owner, 2026-11-08, ADR-099).
#: CNY (ADR-105, owner 2026-11-10): bank name, the 16–19 digit card or account number and the
#: branch's 12-digit CNAPS code; the holder's name comes from the bank's own check, as for
#: every currency.
#: ADR-107 (owner 2026-11-10: "Bank and mobile money"): the African currencies take a bank
#: account (``account_type="bank"``: bank name, account number or IBAN of 5–34 letters and
#: digits, optional bank/branch code) or, where mobile money is common, a mobile-money wallet
#: (``account_type="mobile_money"``: the provider's name and the wallet's phone number in
#: that country). A Zimbabwean US-dollar account uses the same two forms.
PAYOUT_CURRENCIES = frozenset({"NGN", "USD", "GBP", "EUR", "CAD", "CNY"}) | AFRICAN
_ACCOUNT_TYPES = frozenset({"Checking", "Savings"})
#: Mobile money: the wallet phone's country calling code per currency (ADR-107).
MOBILE_MONEY_PREFIX: dict[str, str] = {
    "KES": "254",  # Kenya
    "GHS": "233",  # Ghana
    "UGX": "256",  # Uganda
    "TZS": "255",  # Tanzania
    "ZMW": "260",  # Zambia
    "XOF": "221",  # Senegal
    "USD": "263",  # Zimbabwe (US dollars)
}
_GENERIC_KINDS = frozenset({"bank", "mobile_money"})


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


def normalize_iban(v: str) -> str:
    """Spaces removed and letters upper-cased, as an IBAN is usually written in groups of 4."""
    return v.replace(" ", "").upper()


def is_valid_iban(v: str) -> bool:
    """ISO 13616: 2-letter country, 2 check digits, up to 30 letters/digits; mod 97 == 1.

    Format and checksum only (it catches typos); the partner bank confirms the account.
    """
    if not re.fullmatch(r"[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}", v):
        return False
    moved = v[4:] + v[:4]
    digits = "".join(str(int(c, 36)) for c in moved)
    return int(digits) % 97 == 1


def _bad(message: str) -> OfferInputError:
    return OfferInputError(FORMAT_ERROR, message)


def parse_account_details(
    currency: str,
    bank_name: str,
    account_number: str,
    routing_number: str | None,
    sort_code: str | None,
    account_type: str | None,
    institution_number: str | None = None,
    transit_number: str | None = None,
    cnaps_code: str | None = None,
    branch_code: str | None = None,
) -> AccountDetails:
    c = currency.upper()
    if c not in PAYOUT_CURRENCIES:
        raise _bad("Payout accounts can't be in that currency yet.")
    if branch_code and account_type != "bank":
        raise _bad("A branch code is only used for a bank account in Africa.")
    if c != "CAD" and (institution_number or transit_number):
        raise _bad("Institution and transit numbers are only used for CAD.")
    if c != "CNY" and cnaps_code:
        raise _bad("A CNAPS code is only used for CNY.")
    name = bank_name.strip()
    if not 2 <= len(name) <= 60 or not re.fullmatch(r"[A-Za-z0-9 .,&'()\-]+", name):
        raise _bad("Enter the bank name.")
    if c in AFRICAN or (c == "USD" and account_type in _GENERIC_KINDS):
        return _african(
            c, name, account_number, routing_number, sort_code, account_type, branch_code
        )
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
    if c == "EUR":
        iban = normalize_iban(account_number)
        if not is_valid_iban(iban):
            raise _bad("Enter a valid IBAN.")
        if routing_number or sort_code or account_type:
            raise _bad("Only the bank name and IBAN are needed for EUR.")
        return AccountDetails(c, name, iban, None, None)
    if c == "CAD":
        # ADR-100 (owner, 2026-11-09): institution number (3 digits), transit number
        # (5 digits) and an account number of any length (digits; up to 17, as the form).
        if not institution_number or not re.fullmatch(r"[0-9]{3}", institution_number):
            raise _bad("Institution number is 3 digits.")
        if not transit_number or not re.fullmatch(r"[0-9]{5}", transit_number):
            raise _bad("Transit number is 5 digits.")
        if not re.fullmatch(r"[0-9]{1,17}", account_number):
            raise _bad("Enter a valid account number.")
        if routing_number or sort_code or account_type:
            raise _bad(
                "Only the bank name, institution, transit and account numbers are needed for CAD."
            )
        return AccountDetails(c, name, account_number, institution_number + transit_number, None)
    if c == "CNY":
        if not re.fullmatch(r"[0-9]{16,19}", account_number):
            raise _bad("Chinese bank card and account numbers are 16 to 19 digits.")
        if not cnaps_code or not re.fullmatch(r"[0-9]{12}", cnaps_code):
            raise _bad("The CNAPS code is 12 digits.")
        if routing_number or sort_code or account_type:
            raise _bad("Only the bank name, account number and CNAPS code are needed for CNY.")
        return AccountDetails(c, name, account_number, cnaps_code, None)
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


def _african(
    c: str,
    name: str,
    account_number: str,
    routing_number: str | None,
    sort_code: str | None,
    kind: str | None,
    branch_code: str | None,
) -> AccountDetails:
    """ADR-107: a bank account or a mobile-money wallet (see ``PAYOUT_CURRENCIES``)."""
    if routing_number or sort_code:
        raise _bad("Routing numbers and sort codes aren't used here.")
    if kind == "mobile_money":
        prefix = MOBILE_MONEY_PREFIX.get(c)
        if prefix is None:
            raise _bad("Mobile money isn't available for this currency; add a bank account.")
        phone = re.sub(r"[\s\-]", "", account_number).removeprefix("+")
        if not re.fullmatch(rf"{prefix}[1-9][0-9]{{7,9}}", phone):
            raise _bad(f"Enter the wallet's phone number, starting +{prefix}.")
        return AccountDetails(c, name, phone, None, "mobile_money")
    if kind != "bank":
        raise _bad("Choose a bank account or mobile money.")
    number = re.sub(r"[\s\-]", "", account_number).upper()
    if not re.fullmatch(r"[A-Z0-9]{5,34}", number):
        raise _bad("Enter the account number (5 to 34 letters and digits).")
    code = (branch_code or "").strip().upper() or None
    if code is not None and not re.fullmatch(r"[A-Z0-9]{2,11}", code):
        raise _bad("The bank or branch code is 2 to 11 letters and digits.")
    return AccountDetails(c, name, number, code, "bank")


def _half_even_div(numerator: int, divisor: int) -> int:
    q, r = divmod(numerator, divisor)
    if 2 * r > divisor or (2 * r == divisor and q % 2 == 1):
        q += 1
    return q


def counter_amount_minor(
    amount_minor: int, currency: str, rate: Decimal, counter_currency: str
) -> int:
    """The other side of a deal in the counter currency's minor units, half to even (ADR-019 §2).

    The rate is the pair's quote currency per 1 unit of its base (ADR-111): naira per 1 USD,
    or cedis per 1 USD for a pair without naira. A base amount gives quote = amount × rate; a
    quote amount gives base = amount ÷ rate. Each side uses its own currency's minor units
    (``offer_rules.SCALE``): the CFA franc and the Ugandan shilling have none, so 1,000 UGX at
    ₦0.306 is ₦306.00 (30,600 kobo), not ₦3.06.
    """
    from app.domain.offer_rules import SCALE, Pair  # local: offer_rules imports nothing here

    micro = int((rate * 1_000_000).to_integral_exact())  # NUMERIC(12,6): exact
    if micro <= 0:
        raise ValueError("rate must be positive")
    # 10^(scale of what we get − scale of what we have): units are matched exactly.
    shift = SCALE[counter_currency] - SCALE[currency]
    up, down = (10**shift, 1) if shift >= 0 else (1, 10**-shift)
    if currency == Pair(currency, counter_currency).quote:
        return _half_even_div(amount_minor * 1_000_000 * up, micro * down)
    return _half_even_div(amount_minor * micro * up, 1_000_000 * down)
