"""Payout accounts — Milestone 4.1E (ADR-035).

A user's own accounts the partner bank pays into from escrow (ADR-021 §3). Xspeeria never
holds money; it records where each user wants to be paid.

- Adding or removing an account needs a fresh authenticator approval (ADR-008:
  ``beneficiary.add`` / ``beneficiary.remove``).
- The account number is sealed with AES-256-GCM, bound to the row id; only the last 4 digits
  are ever readable or returned (ADR-022). No raw number is logged.
- The bank's name check decides ``validated`` or ``failed``. Without a checker (no partner
  bank yet) the account stays ``pending`` and cannot be chosen for a deal.
- No waiting period: a new account can be paid at once (DEC-044); adding it needs a code.
"""

from __future__ import annotations

import secrets
import uuid
from collections.abc import Awaitable, Callable
from datetime import datetime
from typing import Any

from fastapi import status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError
from app.core.logging import get_logger
from app.core.mfa import SecretBox
from app.domain.offer_rules import OfferInputError
from app.domain.payout_rules import NEW_ACCOUNT_HOLD, parse_account_details
from app.models.payouts import Beneficiary
from app.providers.bank_check import NameCheck
from app.services.auth import Principal

__all__ = ["PayoutAccountService", "account_view"]

_logger = get_logger(__name__)


def _err(code: str, message: str, http: int) -> AppError:
    return AppError(code, message, status_code=http)


def account_view(b: Beneficiary) -> dict[str, Any]:
    """Never the account number: the last 4 digits only."""
    return {
        "payout_account_id": str(b.id),
        "currency": b.currency,
        "bank_name": b.bank_name,
        "account_last4": b.account_last4,
        "account_type": b.account_type,
        "account_name": b.account_name,
        "validation_state": b.validation_state,
        "payout_hold_until": b.payout_hold_until.isoformat(),
        "created_at": b.created_at.isoformat(),
    }


class PayoutAccountService:
    def __init__(
        self,
        db: AsyncSession,
        clock: Callable[[], datetime],
        box: SecretBox | None,
        name_check: NameCheck | None,
    ) -> None:
        self._db = db
        self._clock = clock
        self._box = box
        self._name_check = name_check

    async def add(
        self,
        principal: Principal,
        *,
        currency: str,
        bank_name: str,
        account_number: str,
        routing_number: str | None,
        sort_code: str | None,
        account_type: str | None,
        confirm_step_up: Callable[[], Awaitable[None]],
        institution_number: str | None = None,
        transit_number: str | None = None,
    ) -> dict[str, Any]:
        if self._box is None:
            raise _err(
                "SYS_503_SERVICE_UNAVAILABLE",
                "Payout accounts are not available right now.",
                status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        try:
            details = parse_account_details(
                currency,
                bank_name,
                account_number,
                routing_number,
                sort_code,
                account_type,
                institution_number,
                transit_number,
            )
        except OfferInputError as e:
            raise _err(e.code, e.message, status.HTTP_422_UNPROCESSABLE_CONTENT) from None

        await confirm_step_up()  # ADR-008: beneficiary.add

        now = self._clock()
        account_id = uuid.uuid4()
        result = await self._name_check.check(details) if self._name_check else None
        validated = result is not None and result.validated
        row = Beneficiary(
            id=account_id,
            user_id=principal.user_id,
            currency=details.currency,
            # A local placeholder until the partner bank issues its own reference.
            account_ref=f"local:{secrets.token_hex(16)}",
            account_number_sealed=self._box.seal(details.account_number, bound_to=str(account_id)),
            account_last4=details.last4,
            bank_name=details.bank_name,
            bank_code=details.bank_code,
            account_type=details.account_type,
            account_name=result.account_name if validated and result else None,
            validation_state=(
                "validated" if validated else ("failed" if result is not None else "pending")
            ),
            validated_at=now if validated else None,
            payout_hold_until=now + NEW_ACCOUNT_HOLD,
            created_at=now,
        )
        self._db.add(row)
        view = account_view(row)
        await self._db.commit()
        _logger.info(
            "payout_account_added",
            extra={
                "user_id": str(principal.user_id),
                "payout_account_id": str(account_id),
                "validation_state": row.validation_state,
            },
        )
        return view

    async def mine(self, principal: Principal) -> list[dict[str, Any]]:
        rows = (
            await self._db.scalars(
                select(Beneficiary)
                .where(Beneficiary.user_id == principal.user_id, Beneficiary.removed_at.is_(None))
                .order_by(Beneficiary.created_at.desc())
                .limit(100)
            )
        ).all()
        return [account_view(b) for b in rows]

    async def remove(
        self,
        principal: Principal,
        account_id: uuid.UUID,
        confirm_step_up: Callable[[], Awaitable[None]],
    ) -> None:
        """Hide it from my list. Deals that already chose it still pay it (ADR-035)."""
        row = await self._db.scalar(
            select(Beneficiary).where(Beneficiary.id == account_id).with_for_update()
        )
        if row is None or row.user_id != principal.user_id or row.removed_at is not None:
            await self._db.rollback()
            raise _err(
                "RES_404_NOT_FOUND", "That payout account was not found.", status.HTTP_404_NOT_FOUND
            )
        await confirm_step_up()  # ADR-008: beneficiary.remove
        row.removed_at = self._clock()
        await self._db.commit()
