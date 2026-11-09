# ruff: noqa: F811  -- pytest fixtures are imported by name and used as parameters
"""ADR-059 Decision 2: nobody sees listings selling their own country's currency (rule A)."""

from __future__ import annotations

import pytest

from app.core.config import Settings
from app.domain.location_rules import currency_of, device_country
from tests.integration.test_auth_api import _sql, clean, migrated  # noqa: F401
from tests.integration.test_offers_api import (  # noqa: F401
    OTHER_PHONE,
    User,
    ada,
    currencies,
    david,
    env,
)

pytestmark = [pytest.mark.integration, pytest.mark.asyncio]


async def _both_sides(u: User) -> None:
    await u.publish(source_currency="USD", desired_rate="1320")
    await u.publish(source_currency="GBP", desired_rate="1700")
    await u.publish(
        source_currency="NGN", target_currency="USD", source_amount="660000", desired_rate="1320"
    )


async def _approve_kyc(db_settings: Settings, phone: str, country: str) -> None:
    await _sql(
        db_settings,
        "INSERT INTO kyc_cases (id, user_id, provider, country, provider_session_id, "
        "provider_status, status, legal_name, date_of_birth, decided_at, created_at, updated_at) "
        "SELECT gen_random_uuid(), id, 'didit', :c, 'kyc-1', 'Approved', 'approved', "
        "'Ada Test', DATE '1990-01-01', now(), now(), now() FROM users WHERE phone = :p",
        p=phone,
        c=country,
    )


def test_currency_of_each_country() -> None:
    assert currency_of("NG") == "NGN"
    assert currency_of("US") == "USD"
    assert currency_of("GB") == "GBP"
    assert currency_of("DE") == "EUR" and currency_of("BG") == "EUR"
    assert currency_of("CA") == "CAD"  # ADR-100
    assert currency_of("JP") is None and currency_of(None) is None


@pytest.mark.parametrize(
    ("raw", "expected"),
    [("NG", "NG"), (" ng ", "NG"), ("ZZZ", None), ("N1", None), ("<s>", None), ("", None)],
)
def test_device_country_header_is_checked(raw: str, expected: str | None) -> None:
    assert device_country(raw) == expected


async def test_nigeria_does_not_see_requests_selling_naira(david: User, ada: User) -> None:
    await _both_sides(david)
    offers = (await ada.listings("USD/NGN", country="NG")).json()
    assert len(offers["items"]) == 1 and offers["viewer_country"] == "NG"
    requests = (await ada.listings("NGN/USD", country="NG")).json()
    assert requests["hidden"] is True and requests["items"] == []
    # Searching and the Success list obey the same rule.
    for params in ({"sort": "newest"}, {"filter[status]": "success"}):
        r = (await ada.listings("NGN/USD", country="NG", **params)).json()
        assert r["hidden"] is True and r["items"] == [] and r["trades"] == []


async def test_us_does_not_see_offers_selling_dollars(david: User, ada: User) -> None:
    await _both_sides(david)
    assert (await ada.listings("USD/NGN", country="US")).json()["hidden"] is True
    assert len((await ada.listings("NGN/USD", country="US")).json()["items"]) == 1
    # Other currencies are not hidden for a US user.
    assert len((await ada.listings("GBP/NGN", country="US")).json()["items"]) == 1


async def test_uk_and_euro_area(david: User, ada: User) -> None:
    await _both_sides(david)
    assert (await ada.listings("GBP/NGN", country="GB")).json()["hidden"] is True
    assert len((await ada.listings("USD/NGN", country="GB")).json()["items"]) == 1
    assert (await ada.listings("EUR/NGN", country="FR")).json()["hidden"] is True


async def test_no_location_falls_back_to_the_approved_check(
    db_settings: Settings, david: User, ada: User
) -> None:
    await _both_sides(david)
    r = (await ada.listings("USD/NGN", country=None)).json()
    assert r["needs_location"] is True and r["items"] == []
    await _approve_kyc(db_settings, OTHER_PHONE, "NG")
    r = (await ada.listings("NGN/USD", country=None)).json()
    assert r["viewer_country"] == "NG" and r["hidden"] is True
    assert len((await ada.listings("USD/NGN", country=None)).json()["items"]) == 1
    # A junk header is ignored, so the approved check still decides.
    r = (await ada.listings("NGN/USD", country="<script>")).json()
    assert r["viewer_country"] == "NG" and r["hidden"] is True


async def test_the_phone_location_wins_over_the_check(
    db_settings: Settings, david: User, ada: User
) -> None:
    await _both_sides(david)
    await _approve_kyc(db_settings, OTHER_PHONE, "NG")
    # A Nigerian travelling in the US sees the US view while there.
    assert (await ada.listings("USD/NGN", country="US")).json()["hidden"] is True
    assert len((await ada.listings("NGN/USD", country="US")).json()["items"]) == 1


async def test_location_never_unlocks_anything(david: User, ada: User) -> None:
    """The rule only hides; a country header cannot reveal withdrawn or over-ceiling offers."""
    offer = (await david.publish(desired_rate="1320")).json()
    await david.delete(offer["offer_id"])
    for country in ("NG", "US", "GB", "CA", "DE"):
        assert (await ada.listings("USD/NGN", country=country)).json()["items"] == []
