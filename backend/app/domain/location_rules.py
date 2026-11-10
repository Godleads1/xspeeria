"""Who sees what in the marketplace (ADR-059 Decision 2, rule A, every country).

Nobody sees listings that SELL their own country's currency: a user in Nigeria does not see
buy requests (which sell naira); a user in the US does not see offers selling US dollars.
Nothing else is hidden by location.

This is a VISIBILITY rule only. The country comes from the phone's location (a hint the user
can fake) or, failing that, from the user's approved identity check. It never decides money,
limits or permissions — those stay with KYC and the server.
"""

from __future__ import annotations

__all__ = ["currency_of", "device_country"]

#: Euro area members (ISO 3166-1 alpha-2), including Bulgaria from 1 January 2026.
EURO_AREA = frozenset(
    {
        "AT", "BE", "BG", "CY", "DE", "EE", "ES", "FI", "FR", "GR", "HR",
        "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PT", "SI", "SK",
    }
)  # fmt: skip

_OWN: dict[str, str] = {"NG": "NGN", "US": "USD", "GB": "GBP", "CA": "CAD", "CN": "CNY"}


def currency_of(country: str | None) -> str | None:
    """The currency a user in ``country`` may not see listings selling, or None."""
    if country is None:
        return None
    if country in EURO_AREA:
        return "EUR"
    return _OWN.get(country)


def device_country(raw: str | None) -> str | None:
    """The app's ``X-Device-Country`` header: two letters, or None. Anything else is ignored."""
    if raw is None:
        return None
    code = raw.strip().upper()
    return code if len(code) == 2 and code.isascii() and code.isalpha() else None
