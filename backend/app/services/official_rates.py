"""Rate ceilings from the automatic CBN feed — ADR-102 (owner 2026-11-09).

* ``refresh``: fetch USD, GBP and EUR from the feed and store one ``official_rates`` row each
  (run hourly by the background jobs when ``OFFICIAL_RATE_FEED=frankfurter``). Any failure
  makes the job fail, which raises the existing "background job failing" alert (ADR-074).
* ``current_ceilings``: the maximum rate per currency right now.

  - **Before the feed has ever stored a rate** (a developer's computer, tests, or the feed
    off): the reviewed snapshot in ``offer_rules.OFFICIAL_RATE``.
  - **After that:** each currency's latest stored rate, **if it was fetched within the last
    3 days** (owner: "Last rate for 3 days, then stop"). Older than that, the currency has no
    ceiling, so new offers in it are refused and none are listed (fail closed) until a fetch
    works again.
  - **CAD** is always the USD ceiling ÷ the Bank of Canada rate (ADR-101), so it follows USD.
"""

from __future__ import annotations

import uuid
from collections.abc import Callable
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Protocol

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.domain.offer_rules import OFFICIAL_RATE, with_derived
from app.models.official_rates import OfficialRate
from app.providers.frankfurter import RateFeedError, RateQuote
from app.services.currency_switch import switched_off

__all__ = ["FED_CURRENCIES", "STALE_AFTER", "OfficialRateService", "current_ceilings"]

_logger = get_logger(__name__)

#: Fetched from the feed. CAD is derived (ADR-101).
FED_CURRENCIES = ("USD", "GBP", "EUR")
#: Owner, 2026-11-09: keep the last good rate for 3 days, then stop.
STALE_AFTER = timedelta(days=3)


class RateFeed(Protocol):
    name: str

    async def fetch(self, currency: str, today: date) -> RateQuote: ...


async def current_ceilings(db: AsyncSession, now: datetime) -> dict[str, Decimal]:
    """Naira per 1 unit, per foreign currency, that no rate may exceed right now.

    A currency switched off (ADR-106) has none: its offers leave the market and can't be
    taken, queued for or re-priced; deals already matched don't use this and finish.
    """
    off = await switched_off(db)
    return {c: v for c, v in (await _ceilings(db, now)).items() if c not in off}


async def _ceilings(db: AsyncSession, now: datetime) -> dict[str, Decimal]:
    fed_ever = await db.scalar(select(OfficialRate.id).limit(1))
    if not fed_ever:
        return dict(OFFICIAL_RATE)
    latest = (
        select(
            OfficialRate.currency,
            OfficialRate.rate,
            func.row_number()
            .over(partition_by=OfficialRate.currency, order_by=OfficialRate.fetched_at.desc())
            .label("n"),
        )
        .where(OfficialRate.fetched_at >= now - STALE_AFTER)
        .subquery()
    )
    rows = (await db.execute(select(latest.c.currency, latest.c.rate).where(latest.c.n == 1))).all()
    return with_derived({str(c): Decimal(r) for c, r in rows if c in FED_CURRENCIES})


class OfficialRateService:
    def __init__(self, db: AsyncSession, clock: Callable[[], datetime], feed: RateFeed) -> None:
        self._db, self._clock, self._feed = db, clock, feed

    async def refresh(self) -> list[str]:
        """Fetch and store each currency. Raises if any failed (the others are still kept)."""
        now = self._clock()
        stored: list[str] = []
        failed: list[str] = []
        for currency in FED_CURRENCIES:
            try:
                q = await self._feed.fetch(currency, now.date())
            except RateFeedError as exc:
                _logger.warning(
                    "official_rate_fetch_failed", extra={"currency": currency, "why": str(exc)}
                )
                failed.append(currency)
                continue
            self._db.add(
                OfficialRate(
                    id=uuid.uuid4(),
                    currency=currency,
                    rate=q.rate,
                    rate_date=q.rate_date,
                    source=self._feed.name,
                    fetched_at=now,
                )
            )
            stored.append(currency)
        await self._db.commit()
        if stored:
            _logger.info("official_rates_stored", extra={"currencies": stored})
        if failed:
            raise RateFeedError(f"no fresh rate for {', '.join(failed)}")
        return stored
