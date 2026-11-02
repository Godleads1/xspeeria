"""Demo autopilot: the robot demo customers trade back (owner 2026-10-27, local testing only).

Owner: "the other user should be controlled by you not me. i will only login to communicate
with it. just like you are playing fifa with computer". With ``DEMO_AUTOPILOT=true`` (refused
unless APP_ENV=local) the server plays the robot demo customers from ``app.cli.seed_demo``
(Ben, Chloe, Kemi). The person testing plays anyone else (Ada, Dan, or their own sign-up).

Every few seconds the robots:

1. **take your offers** they can pay for (the currency's country verified, an account in the
   currency they'd receive), the whole remaining amount, after a short pause;
2. **choose their payout account** on any deal they are in;
3. **pay their side into the pretend escrow** (the same pretend transfer as the app's
   "Simulate my transfer" button; the pretend bank confirms it through the normal pipeline);
4. **re-post their own offer** when it has been taken, so the market never runs dry.

They go through the same services and rules as people do (limits, rate ceiling, one payout
account per currency, idempotency). Their approvals (step-up) are skipped because nobody holds
a robot's phone; that is the only shortcut, and it exists only on a developer's computer.
"""

from __future__ import annotations

import uuid
from collections.abc import Callable
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.exceptions import AppError
from app.core.logging import get_logger
from app.domain.settlement_rules import JURISDICTION
from app.models.identity import User
from app.models.kyc import KycCase
from app.models.marketplace import Offer
from app.models.payouts import Beneficiary
from app.providers.pretend_bank import PretendBank
from app.services.auth import Principal
from app.services.deal_pause import deals_paused
from app.services.matches import MatchService, PayoutChoice
from app.services.offers import OfferService
from app.services.settlement import SettlementService

__all__ = ["THINK", "DemoAutopilot", "bot_phones"]

_log = get_logger(__name__)

#: How long a robot "thinks" before acting, so the person sees each step happen.
THINK = timedelta(seconds=8)
#: After an action fails (a limit, a rule), leave that item alone for this long.
_BACK_OFF = timedelta(minutes=5)

# Remembered between rounds while the server runs (a restart simply starts fresh).
_first_seen: dict[str, datetime] = {}
_failed: dict[str, datetime] = {}


def bot_phones() -> dict[str, tuple[tuple[str, str, str, str], ...]]:
    """Robot phone -> its standing offers (from the demo data)."""
    from app.cli.seed_demo import CUSTOMERS

    return {c.phone: c.offers for c in CUSTOMERS if c.robot}


async def _no_step_up() -> None:
    """Robots have no phone to approve on (see the module note)."""


def _minor_to_text(minor: int, scale: int) -> str:
    return f"{Decimal(minor).scaleb(-scale):.{scale}f}"


class DemoAutopilot:
    def __init__(
        self,
        db: AsyncSession,
        clock: Callable[[], datetime],
        bank: PretendBank | None,
        settings: Settings,
    ) -> None:
        self._db = db
        self._clock = clock
        self._bank = bank
        self._settings = settings

    def _ready(self, key: str, now: datetime) -> bool:
        """True once ``key`` has been waiting THINK long and hasn't just failed."""
        failed = _failed.get(key)
        if failed is not None and now - failed < _BACK_OFF:
            return False
        first = _first_seen.setdefault(key, now)
        return now - first >= THINK

    def _done(self, key: str) -> None:
        _first_seen.pop(key, None)

    def _fail(self, key: str, now: datetime, error: Exception) -> None:
        _failed[key] = now
        _first_seen.pop(key, None)
        code = error.code if isinstance(error, AppError) else type(error).__name__
        _log.info("demo_robot_skipped", extra={"item": key.split(":")[0], "reason": code})

    async def run_once(self) -> None:
        if await deals_paused(self._db):  # ADR-075: the robots stop too
            await self._db.rollback()
            return
        robots = await self._robots()
        if not robots:
            return
        now = self._clock()
        for user_id in robots:
            await self._finish_deals(user_id, now)
        await self._take_offers(robots, now)
        for user_id, offers in robots.items():
            await self._keep_listed(user_id, offers, now)

    async def _robots(self) -> dict[uuid.UUID, tuple[tuple[str, str, str, str], ...]]:
        phones = bot_phones()
        rows = (
            await self._db.execute(
                select(User.id, User.phone).where(
                    User.phone.in_(list(phones)), User.status == "active"
                )
            )
        ).all()
        await self._db.rollback()
        return {uid: phones[phone] for uid, phone in rows}

    def _matches(self) -> MatchService:
        return MatchService(self._db, self._clock, self._bank, self._settings)

    async def _account(self, user_id: uuid.UUID, currency: str) -> uuid.UUID | None:
        found = await self._db.scalar(
            select(Beneficiary.id)
            .where(
                Beneficiary.user_id == user_id,
                Beneficiary.currency == currency,
                Beneficiary.removed_at.is_(None),
                Beneficiary.validation_state == "validated",
            )
            .order_by(Beneficiary.created_at)
            .limit(1)
        )
        await self._db.rollback()
        return found

    async def _finish_deals(self, user_id: uuid.UUID, now: datetime) -> None:
        me = Principal(user_id=user_id, session_id=uuid.uuid4())
        try:
            deals: list[dict[str, Any]] = await self._matches().mine(me)
        except AppError:
            await self._db.rollback()
            return
        for deal in deals:
            match_id = deal["match_id"]
            if deal.get("preparation_state") == "awaiting_payout_accounts" and not deal.get(
                "you_chose_payout_accounts"
            ):
                key = f"payout:{match_id}:{user_id}"
                if not self._ready(key, now):
                    continue
                account = await self._account(user_id, deal["you_receive_currency"])
                if account is None:
                    self._fail(key, now, AppError("NO_ACCOUNT", "no account", status_code=409))
                    continue
                try:
                    await self._matches().choose_payout_accounts(
                        me,
                        match_id,
                        [PayoutChoice(account, str(deal["you_receive_amount"]))],
                        _no_step_up,
                    )
                    self._done(key)
                    _log.info("demo_robot_chose_payout", extra={"match_id": str(match_id)})
                except AppError as e:
                    await self._db.rollback()
                    self._fail(key, now, e)
            elif deal.get("settlement_phase") == "AWAITING_FUNDING" and self._bank is not None:
                key = f"fund:{match_id}:{user_id}"
                service = SettlementService(self._db, self._clock, self._bank)
                try:
                    view = await service.view(me, match_id)
                except AppError:
                    await self._db.rollback()
                    continue
                if (view.get("you_pay") or {}).get("state") != "ESCROW_PROVISIONED":
                    self._done(key)
                    continue
                if not self._ready(key, now):
                    continue
                try:
                    await service.simulate_transfer(me, match_id)
                    self._done(key)
                    _log.info("demo_robot_paid_in", extra={"match_id": str(match_id)})
                except AppError as e:
                    await self._db.rollback()
                    self._fail(key, now, e)

    async def _verified_in(self, user_id: uuid.UUID) -> set[str]:
        rows = await self._db.scalars(
            select(KycCase.country).where(KycCase.user_id == user_id, KycCase.status == "approved")
        )
        found = set(rows.all())
        await self._db.rollback()
        return found

    async def _take_offers(
        self, robots: dict[uuid.UUID, tuple[tuple[str, str, str, str], ...]], now: datetime
    ) -> None:
        # Plain values, not ORM objects: the rollbacks below would expire them.
        offers = (
            await self._db.execute(
                select(
                    Offer.id,
                    Offer.source_currency,
                    Offer.target_currency,
                    Offer.source_amount_minor,
                    Offer.matched_amount_minor,
                    Offer.scale,
                )
                .where(
                    Offer.status.in_(("open", "partially_matched")),
                    Offer.user_id.not_in(list(robots)),
                )
                .order_by(Offer.created_at)
                .limit(20)
            )
        ).all()
        await self._db.rollback()
        countries = {uid: await self._verified_in(uid) for uid in robots}
        for offer in offers:
            key = f"take:{offer.id}"
            if not self._ready(key, now):
                continue
            # The taker pays the offer's target currency and receives its source currency.
            pays_in = JURISDICTION.get(offer.target_currency)
            taker = None
            for uid in robots:
                if pays_in in countries[uid] and await self._account(uid, offer.source_currency):
                    taker = uid
                    break
            if taker is None:
                self._fail(key, now, AppError("NO_ROBOT", "no robot can pay", status_code=409))
                continue
            remaining = offer.source_amount_minor - offer.matched_amount_minor
            if remaining <= 0:
                self._done(key)
                continue
            try:
                await self._matches().accept(
                    Principal(user_id=taker, session_id=uuid.uuid4()),
                    offer.id,
                    uuid.uuid4(),
                    _minor_to_text(remaining, offer.scale),
                    _no_step_up,
                )
                self._done(key)
                _log.info("demo_robot_took_offer", extra={"offer_id": str(offer.id)})
            except AppError as e:
                await self._db.rollback()
                self._fail(key, now, e)

    async def _keep_listed(
        self, user_id: uuid.UUID, offers: tuple[tuple[str, str, str, str], ...], now: datetime
    ) -> None:
        if not offers:
            return
        has_open = await self._db.scalar(
            select(Offer.id)
            .where(Offer.user_id == user_id, Offer.status.in_(("open", "partially_matched")))
            .limit(1)
        )
        await self._db.rollback()
        if has_open is not None:
            self._done(f"list:{user_id}")
            return
        key = f"list:{user_id}"
        if not self._ready(key, now):
            return
        source, target, amount, rate = offers[0]
        try:
            await OfferService(self._db, self._clock).create(
                Principal(user_id=user_id, session_id=uuid.uuid4()),
                uuid.uuid4(),
                source,
                target,
                amount,
                rate,
            )
            self._done(key)
            _log.info("demo_robot_listed_offer", extra={"currency": source})
        except AppError as e:
            await self._db.rollback()
            self._fail(key, now, e)
