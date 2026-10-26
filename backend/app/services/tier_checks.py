"""Checks for higher tiers (ADR-058 Tier 2 and Tier 3).

* Tier 2 = Tier 1 + BVN (Didit, matched to the name and date of birth from the approved
  Nigeria identity check) + home address (as given).
* Tier 3 = Tier 2 + proof of address (uploaded through our server to Didit, matched to the
  same name and the given address) + the source-of-funds answer.

The BVN and the document pass straight through to Didit and are never stored or logged. Each
paid check is limited to 3 tries per Lagos day per person (each costs Xspeeria money).
"""

from __future__ import annotations

import base64
import binascii
import re
import uuid
from collections.abc import Callable
from datetime import datetime
from typing import Any

from fastapi import status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.exceptions import AppError
from app.core.logging import get_logger
from app.domain.kyc_rules import COUNTRIES
from app.domain.tier_rules import day_start
from app.models.kyc import KycCase
from app.models.tiers import TierCheck
from app.providers.tier_checks import TierCheckProvider
from app.services.auth import Principal
from app.services.limits import tier_of

__all__ = ["SOURCES", "TierCheckService"]

_logger = get_logger(__name__)

#: Answers to "Where does the money you trade come from?"
SOURCES = ("salary", "business", "savings", "investments", "gift", "other")
#: Cost control: tries per Lagos day for the checks Xspeeria pays for.
PAID_TRIES_PER_DAY = 3
#: Proof-of-address file (Didit accepts up to 15 MB; phone photos are far smaller).
MAX_DOCUMENT_BYTES = 10 * 1024 * 1024
DOCUMENT_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "application/pdf": "pdf",
}
_BVN = re.compile(r"^[0-9]{11}$")


def _err(code: str, message: str, http: int) -> AppError:
    return AppError(code, message, status_code=http)


def _split_name(legal_name: str | None) -> tuple[str, str]:
    """First and last word of the name on the ID (Didit matches names fuzzily)."""
    parts = (legal_name or "").split()
    if not parts:
        return "", ""
    return parts[0], parts[-1]


def _address_text(a: dict[str, Any]) -> str:
    keys = ("line1", "line2", "city", "state", "postcode")
    return ", ".join(str(a[k]) for k in keys if a.get(k))


class TierCheckService:
    def __init__(
        self,
        db: AsyncSession,
        clock: Callable[[], datetime],
        provider: TierCheckProvider | None,
        settings: Settings,
    ) -> None:
        self._db = db
        self._clock = clock
        self._provider = provider
        self._settings = settings

    # --- reading ----------------------------------------------------------------------------

    async def _latest(self, user_id: uuid.UUID, kind: str) -> TierCheck | None:
        approved: TierCheck | None = await self._db.scalar(
            select(TierCheck).where(
                TierCheck.user_id == user_id, TierCheck.kind == kind, TierCheck.status == "approved"
            )
        )
        if approved is not None:
            return approved
        latest: TierCheck | None = await self._db.scalar(
            select(TierCheck)
            .where(TierCheck.user_id == user_id, TierCheck.kind == kind)
            .order_by(TierCheck.created_at.desc())
            .limit(1)
        )
        return latest

    async def view(self, principal: Principal) -> dict[str, Any]:
        uid = principal.user_id
        bvn = await self._latest(uid, "bvn")
        address = await self._latest(uid, "address")
        poa = await self._latest(uid, "proof_of_address")
        sof = await self._latest(uid, "source_of_funds")
        out = {
            "tier": await tier_of(self._db, uid, self._settings),
            "bvn": bvn.status if bvn else None,
            "address": address.detail if address and address.status == "approved" else None,
            "proof_of_address": poa.status if poa else None,
            "source_of_funds": (sof.detail or {}).get("source") if sof else None,
        }
        await self._db.rollback()
        return out

    # --- helpers ----------------------------------------------------------------------------

    async def _need_tier(self, principal: Principal, at_least: int, message: str) -> None:
        if await tier_of(self._db, principal.user_id, self._settings) < at_least:
            await self._db.rollback()
            raise _err("AUTH_403_TIER_REQUIRED", message, status.HTTP_403_FORBIDDEN)

    async def _not_done(self, user_id: uuid.UUID, kind: str) -> None:
        done = await self._db.scalar(
            select(TierCheck.id).where(
                TierCheck.user_id == user_id, TierCheck.kind == kind, TierCheck.status == "approved"
            )
        )
        if done is not None:
            await self._db.rollback()
            raise _err(
                "RES_409_ALREADY_VERIFIED", "This is already verified.", status.HTTP_409_CONFLICT
            )

    async def _tries_left(self, user_id: uuid.UUID, kind: str) -> None:
        used = await self._db.scalar(
            select(func.count(TierCheck.id)).where(
                TierCheck.user_id == user_id,
                TierCheck.kind == kind,
                TierCheck.created_at >= day_start(self._clock()),
            )
        )
        if int(used or 0) >= PAID_TRIES_PER_DAY:
            await self._db.rollback()
            raise _err(
                "AUTH_429_RATE_LIMITED",
                "You have tried this 3 times today. Please try again tomorrow.",
                status.HTTP_429_TOO_MANY_REQUESTS,
            )

    def _provider_or_503(self) -> TierCheckProvider:
        if self._provider is None:
            raise _err(
                "SYS_503_SERVICE_UNAVAILABLE",
                "This check is not available right now. Please try again later.",
                status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return self._provider

    async def _identity(self, user_id: uuid.UUID) -> KycCase | None:
        case: KycCase | None = await self._db.scalar(
            select(KycCase)
            .where(KycCase.user_id == user_id, KycCase.status == "approved")
            .order_by(KycCase.country != "NG", KycCase.decided_at.desc())
            .limit(1)
        )
        return case

    async def _save(
        self,
        user_id: uuid.UUID,
        kind: str,
        status_: str,
        *,
        reason: str | None = None,
        request_id: str | None = None,
        detail: dict[str, Any] | None = None,
    ) -> None:
        self._db.add(
            TierCheck(
                id=uuid.uuid4(),
                user_id=user_id,
                kind=kind,
                status=status_,
                reason=reason,
                provider_request_id=request_id,
                detail=detail,
                created_at=self._clock(),
            )
        )
        try:
            await self._db.commit()
        except IntegrityError:
            # Approved twice at the same moment: the unique index keeps one.
            await self._db.rollback()
            raise _err(
                "RES_409_ALREADY_VERIFIED", "This is already verified.", status.HTTP_409_CONFLICT
            ) from None
        _logger.info(
            "tier_check_recorded", extra={"user_id": str(user_id), "kind": kind, "status": status_}
        )

    # --- Tier 2 -----------------------------------------------------------------------------

    async def submit_bvn(self, principal: Principal, bvn: str) -> dict[str, Any]:
        uid = principal.user_id
        if not _BVN.fullmatch(bvn):
            raise _err("VALIDATION_ERROR", "Enter your 11-digit BVN.", 422)
        await self._need_tier(principal, 1, "Verify your identity first.")
        await self._not_done(uid, "bvn")
        await self._tries_left(uid, "bvn")
        provider = self._provider_or_503()
        case = await self._identity(uid)
        local = self._settings.kyc_dev_bypass and self._settings.app_env == "local"
        if case is None and not local:
            await self._db.rollback()
            raise _err(
                "AUTH_403_TIER_REQUIRED",
                "Verify your identity for Nigeria first.",
                status.HTTP_403_FORBIDDEN,
            )
        first, last = _split_name(case.legal_name if case else "Local Tester")
        dob = case.date_of_birth if case else None
        await self._db.rollback()  # no transaction is held across the provider call
        outcome = await provider.bvn(first_name=first, last_name=last, bvn=bvn, date_of_birth=dob)
        await self._save(
            uid, "bvn", outcome.status, reason=outcome.reason, request_id=outcome.request_id
        )
        return await self.view(principal)

    async def submit_address(self, principal: Principal, address: dict[str, str]) -> dict[str, Any]:
        uid = principal.user_id
        if address.get("country") not in COUNTRIES:
            raise _err(
                "VALIDATION_ERROR", "Choose Nigeria, the United Kingdom or the United States.", 422
            )
        await self._need_tier(principal, 1, "Verify your identity first.")
        poa_done = await self._db.scalar(
            select(TierCheck.id).where(
                TierCheck.user_id == uid,
                TierCheck.kind == "proof_of_address",
                TierCheck.status == "approved",
            )
        )
        if poa_done is not None:
            await self._db.rollback()
            raise _err(
                "RES_409_ALREADY_VERIFIED",
                "Your address is already verified. Contact support to change it.",
                status.HTTP_409_CONFLICT,
            )
        current = await self._db.scalar(
            select(TierCheck)
            .where(
                TierCheck.user_id == uid,
                TierCheck.kind == "address",
                TierCheck.status == "approved",
            )
            .with_for_update()
        )
        clean = {k: v.strip() for k, v in address.items() if v and v.strip()}
        if current is not None:
            current.detail = clean  # a new address replaces the old (not yet proven) one
            await self._db.commit()
            _logger.info("tier_address_updated", extra={"user_id": str(uid)})
            return await self.view(principal)
        await self._save(uid, "address", "approved", detail=clean)
        return await self.view(principal)

    # --- Tier 3 -----------------------------------------------------------------------------

    async def submit_proof_of_address(
        self, principal: Principal, document_b64: str, content_type: str
    ) -> dict[str, Any]:
        uid = principal.user_id
        extension = DOCUMENT_TYPES.get(content_type)
        if extension is None:
            raise _err("VALIDATION_ERROR", "Upload a photo (JPG or PNG) or a PDF.", 422)
        try:
            document = base64.b64decode(document_b64, validate=True)
        except (binascii.Error, ValueError):
            raise _err("VALIDATION_ERROR", "That file could not be read.", 422) from None
        if not document or len(document) > MAX_DOCUMENT_BYTES:
            raise _err("VALIDATION_ERROR", "The file must be smaller than 10 MB.", 422)
        await self._need_tier(principal, 2, "Finish Tier 2 first (BVN and home address).")
        await self._not_done(uid, "proof_of_address")
        await self._tries_left(uid, "proof_of_address")
        provider = self._provider_or_503()
        address = await self._latest(uid, "address")
        case = await self._identity(uid)
        first, last = _split_name(case.legal_name if case else "Local Tester")
        detail = address.detail if address and address.detail else {}
        country = COUNTRIES.get(str(detail.get("country")), ("NGA", ""))[0]
        await self._db.rollback()  # no transaction is held across the provider call
        outcome = await provider.proof_of_address(
            document=document,
            filename=f"proof-of-address.{extension}",
            content_type=content_type,
            first_name=first,
            last_name=last,
            expected_address=_address_text(detail),
            expected_country=country,
        )
        await self._save(
            uid,
            "proof_of_address",
            outcome.status,
            reason=outcome.reason,
            request_id=outcome.request_id,
        )
        return await self.view(principal)

    async def submit_source_of_funds(
        self, principal: Principal, source: str, note: str | None
    ) -> dict[str, Any]:
        uid = principal.user_id
        if source not in SOURCES:
            raise _err("VALIDATION_ERROR", "Choose where the money comes from.", 422)
        await self._need_tier(principal, 2, "Finish Tier 2 first (BVN and home address).")
        await self._not_done(uid, "source_of_funds")
        detail = {"source": source, **({"note": note.strip()} if note and note.strip() else {})}
        await self._save(uid, "source_of_funds", "approved", detail=detail)
        return await self.view(principal)
