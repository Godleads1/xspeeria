"""Which country a payer pays a currency in (ADR-042, ADR-105).

Every leg is domestic (F-8). For most currencies the currency fixes the country. A shared
currency's payer pays from the country they are verified in (owner 2026-11-10: "User's
verified country"): the euro (Germany, France; ADR-105) and the US dollar (the US, Zimbabwe;
ADR-107). Verified in several: the first one they were approved in.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.settlement_rules import JURISDICTION, SHARED_CURRENCIES
from app.models.kyc import KycCase

__all__ = ["pay_country"]


async def pay_country(
    db: AsyncSession, user_id: uuid.UUID, currency: str, *, verified_only: bool = False
) -> str | None:
    """The country ``user_id`` pays ``currency`` in, or None if they can't pay it there.

    For a shared currency: the country of an approved identity check among its countries.
    ``verified_only=True`` (the pay check) returns None without one; otherwise (choosing the
    escrow bank) it falls back to the currency's home country, if any.
    """
    c = currency.upper()
    countries = SHARED_CURRENCIES.get(c)
    if countries is None:
        return JURISDICTION.get(c)
    country: str | None = await db.scalar(
        select(KycCase.country)
        .where(
            KycCase.user_id == user_id,
            KycCase.status == "approved",
            KycCase.country.in_(countries),
        )
        .order_by(KycCase.decided_at.asc().nulls_last(), KycCase.created_at.asc())
        .limit(1)
    )
    # Verified in none of them: the currency's home country if it has one (the US for the
    # dollar, as before ADR-107); the euro has none, so it fails closed. Paying still needs
    # the identity check (``require_pay_country``); this only picks the escrow's country.
    if country is not None or verified_only:
        return country
    return JURISDICTION.get(c)
