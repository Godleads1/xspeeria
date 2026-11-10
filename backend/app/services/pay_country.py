"""Which country a payer pays a currency in (ADR-042, ADR-105).

Every leg is domestic (F-8). For most currencies the currency fixes the country. The euro is
shared by Germany and France, so a euro payer's country is the euro country they are
verified in (owner 2026-11-10: "User's verified country"). Verified in both: the first one
they were approved in.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.settlement_rules import EURO_COUNTRIES, JURISDICTION
from app.models.kyc import KycCase

__all__ = ["pay_country"]


async def pay_country(db: AsyncSession, user_id: uuid.UUID, currency: str) -> str | None:
    """The country ``user_id`` pays ``currency`` in, or None if they can't pay it there.

    For the euro this needs an approved identity check in a served euro country; for every
    other currency the answer doesn't depend on the payer (the caller checks verification).
    """
    c = currency.upper()
    if c != "EUR":
        return JURISDICTION.get(c)
    country: str | None = await db.scalar(
        select(KycCase.country)
        .where(
            KycCase.user_id == user_id,
            KycCase.status == "approved",
            KycCase.country.in_(EURO_COUNTRIES),
        )
        .order_by(KycCase.decided_at.asc().nulls_last(), KycCase.created_at.asc())
        .limit(1)
    )
    return country
