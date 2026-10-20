"""Identity checks — Milestone KYC-1 (ADR-039).

* ``start``: open (or resume) a Didit session for me and hand back its link once. The call to
  Didit happens outside any database transaction; Didit returns the same unfinished session
  for the same user, and a unique index stops two cases for one session.
* ``current``: my latest check, in plain words.
* ``ingest``: a Didit webhook. Signature and 5-minute window first, then the event id once,
  then the session must be ours **and** belong to the user named in ``vendor_data``. Status
  only moves forward (``KYC_TRANSITIONS``); an Approved result is checked again here
  (all required checks approved, readable date of birth, 18+) before the user is approved.
  One person, one verified account (ADR-041): an approval that matches a person already
  verified on another account — same ID document (keyed hash) or a Didit face/document match —
  is held for review instead.
* Per country (ADR-042): each check verifies one country (NG, GB, US) with an ID issued
  there; a second country's check must match the identity already on the account.
* ``is_approved``: what offers, deals and payouts require (contract: AUTH_403_KYC_REQUIRED).

Nothing personal is logged: no names, dates of birth, document data or provider payloads.
"""

from __future__ import annotations

import json
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from fastapi import status
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError
from app.core.logging import get_logger
from app.domain.kyc_rules import (
    ACTIVE_STATUSES,
    CHECKS_INCOMPLETE,
    COUNTRIES,
    DUPLICATE_IDENTITY,
    IDENTITY_MISMATCH,
    KYC_TRANSITIONS,
    Outcome,
    evaluate,
    identity_key,
    names_match,
    other_account_matches,
)
from app.models.kyc import KycCase, KycWebhookEvent
from app.providers.didit import KycProviderError, KycSessionProvider, verify_signature
from app.services.auth import Principal
from app.services.notifications import notify

__all__ = ["KycService", "WebhookResult", "case_view"]

_logger = get_logger(__name__)


def _unavailable() -> AppError:
    return AppError(
        "SYS_503_SERVICE_UNAVAILABLE",
        "Identity checks are not available right now. Please try again later.",
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
    )


def _other_check_open() -> AppError:
    return AppError(
        "KYC_409_CASE_ALREADY_ACTIVE",
        "Finish your other identity check first.",
        status_code=status.HTTP_409_CONFLICT,
    )


#: ADR-044: which status changes the user hears about.
_NOTIFY = {
    "approved": "kyc.approved",
    "rejected": "kyc.rejected",
    "under_review": "kyc.in_review",
    "expired": "kyc.expired",
}

_WORDS = {
    "pending_documents": "Not finished yet. Continue your identity check.",
    "under_review": "Being reviewed. We will let you know the result.",
    "approved": "Verified.",
    "rejected": None,  # decision_reason is shown instead
    "expired": None,
}


def case_view(case: KycCase | None, url: str | None = None, country: str = "NG") -> dict[str, Any]:
    if case is None:
        return {
            "kyc_case_id": None,
            "country": country,
            "status": "not_started",
            "message": "Verify your identity to trade.",
            "verification_url": None,
            "legal_name": None,
        }
    return {
        "kyc_case_id": str(case.id),
        "country": case.country,
        "status": case.status,
        "message": _WORDS.get(case.status) or case.decision_reason,
        "verification_url": url,
        "legal_name": case.legal_name if case.status == "approved" else None,
    }


@dataclass(frozen=True)
class WebhookResult:
    http_status: int
    verdict: str


class KycService:
    def __init__(
        self,
        db: AsyncSession,
        clock: Callable[[], datetime],
        provider: KycSessionProvider | None,
        identity_secret: bytes | None = None,
    ) -> None:
        self._db = db
        self._clock = clock
        self._provider = provider
        #: ADR-041: key for the ID-document hash. Without it no approval goes through.
        self._identity_secret = identity_secret

    async def _latest(self, user_id: uuid.UUID, country: str) -> KycCase | None:
        case: KycCase | None = await self._db.scalar(
            select(KycCase)
            .where(KycCase.user_id == user_id, KycCase.country == country)
            .order_by(KycCase.created_at.desc())
            .limit(1)
        )
        return case

    async def is_approved(self, user_id: uuid.UUID, country: str | None = None) -> bool:
        """Approved in ``country``; with no country, approved in at least one (ADR-042)."""
        query = select(KycCase.id).where(KycCase.user_id == user_id, KycCase.status == "approved")
        if country is not None:
            query = query.where(KycCase.country == country)
        found = await self._db.scalar(query.limit(1))
        return found is not None

    async def current(self, principal: Principal, country: str = "NG") -> dict[str, Any]:
        case = await self._latest(principal.user_id, country)
        view = case_view(case, country=country)
        await self._db.rollback()
        return view

    async def regions(self, principal: Principal, seen_country: str | None) -> dict[str, Any]:
        """Each country's status, and a country to suggest (ADR-042 rule 4).

        ``seen_country`` comes from a trusted proxy header; it only ever causes a suggestion.
        """
        items = []
        for code in COUNTRIES:
            case = await self._latest(principal.user_id, code)
            items.append({"country": code, "status": case.status if case else "not_started"})
        await self._db.rollback()
        by_code = {i["country"]: i["status"] for i in items}
        suggest = (
            seen_country
            if seen_country in COUNTRIES
            and by_code[seen_country] not in ("approved", *ACTIVE_STATUSES)
            and any(st == "approved" for st in by_code.values())
            else None
        )
        return {"regions": items, "suggested_country": suggest}

    async def start(self, principal: Principal, country: str = "NG") -> dict[str, Any]:
        if self._provider is None:
            raise _unavailable()
        if country not in COUNTRIES:  # pragma: no cover - the API validates first
            raise _unavailable()
        latest = await self._latest(principal.user_id, country)
        if latest is not None and latest.status == "approved":
            view = case_view(latest)
            await self._db.rollback()
            return view
        old_id = latest.id if latest is not None and latest.status in ACTIVE_STATUSES else None
        elsewhere = await self._db.scalar(
            select(KycCase.id).where(
                KycCase.user_id == principal.user_id,
                KycCase.country != country,
                KycCase.status.in_(tuple(ACTIVE_STATUSES)),
            )
        )
        await self._db.rollback()  # no transaction is held across the call to Didit
        if elsewhere is not None:
            # Didit resumes one unfinished session per user: finish that one first.
            raise _other_check_open()
        try:
            session = await self._provider.create_session(str(principal.user_id), {})
        except KycProviderError as exc:
            _logger.warning("kyc_provider_error", extra={"error": str(exc)})
            raise _unavailable() from None

        existing = await self._db.scalar(
            select(KycCase).where(
                KycCase.provider == self._provider.name,
                KycCase.provider_session_id == session.session_id,
            )
        )
        if existing is not None:
            if existing.user_id != principal.user_id:  # pragma: no cover - vendor_data is ours
                await self._db.rollback()
                raise _unavailable()
            if existing.country != country:  # pragma: no cover - checked above; a race only
                await self._db.rollback()
                raise _other_check_open()
            view = case_view(existing, session.url if existing.status in ACTIVE_STATUSES else None)
            await self._db.rollback()
            return view
        now = self._clock()
        try:
            if old_id is not None:
                # Didit gave a new session (the old one ended there): the old case is over.
                old = await self._db.scalar(
                    select(KycCase).where(KycCase.id == old_id).with_for_update()
                )
                if old is not None and old.status in ACTIVE_STATUSES:
                    old.status = "expired"
                    old.decision_reason = "Replaced by a new identity check."
                    old.updated_at = now
                    await self._db.flush()
            case = KycCase(
                id=uuid.uuid4(),
                user_id=principal.user_id,
                provider=self._provider.name,
                country=country,
                provider_session_id=session.session_id,
                provider_status=session.status[:32],
                status="pending_documents",
                created_at=now,
                updated_at=now,
            )
            self._db.add(case)
            await self._db.commit()
        except IntegrityError:
            # A concurrent start recorded it first; show that one.
            await self._db.rollback()
            other = await self._latest(principal.user_id, country)
            active = other is not None and other.status in ACTIVE_STATUSES
            view = case_view(other, session.url if active else None)
            await self._db.rollback()
            return view
        _logger.info(
            "kyc_started",
            extra={
                "user_id": str(principal.user_id),
                "kyc_case_id": str(case.id),
                "country": country,
            },
        )
        return case_view(case, session.url)

    async def _one_account(
        self, case: KycCase, outcome: Outcome, decision: dict[str, Any] | None
    ) -> tuple[Outcome, str | None]:
        """ADR-041: hold an approval that matches a person verified on another account."""
        if self._identity_secret is None or outcome.document_ref is None:
            held = Outcome(
                "under_review", note="identity key unavailable", review_reason=CHECKS_INCOMPLETE
            )
            return held, None
        key = identity_key(self._identity_secret, outcome.document_ref)
        # Two approvals of the same document at once must see each other: serialise on the key.
        await self._db.execute(
            text("SELECT pg_advisory_xact_lock(:k)"),
            {"k": int.from_bytes(bytes.fromhex(key[:16]), "big", signed=True)},
        )
        other = await self._db.scalar(
            select(KycCase.id)
            .where(
                KycCase.identity_key == key,
                KycCase.user_id != case.user_id,
                KycCase.status.in_(("approved", "expired")),
            )
            .limit(1)
        )
        if other is not None or other_account_matches(decision, str(case.user_id)):
            source = "document" if other is not None else "provider match"
            return (
                Outcome(
                    "under_review",
                    note=f"duplicate identity ({source})",
                    review_reason=DUPLICATE_IDENTITY,
                ),
                key,
            )
        return outcome, key

    async def _same_person(self, case: KycCase, outcome: Outcome) -> Outcome:
        """ADR-042 rule 6: a second country's approval must match the account's identity."""
        known = (
            await self._db.scalars(
                select(KycCase).where(
                    KycCase.user_id == case.user_id,
                    KycCase.id != case.id,
                    KycCase.legal_name.is_not(None),
                    KycCase.status.in_(("approved", "expired")),
                )
            )
        ).all()
        for other in known:
            if other.date_of_birth != outcome.date_of_birth or not names_match(
                str(other.legal_name), str(outcome.legal_name)
            ):
                return Outcome(
                    "under_review",
                    note="identity differs from the account's",
                    review_reason=IDENTITY_MISMATCH,
                )
        return outcome

    async def ingest(self, headers: dict[str, str], raw: bytes) -> WebhookResult:
        if self._provider is None:
            return WebhookResult(404, "NOT_CONFIGURED")
        try:
            payload = json.loads(raw)
        except (ValueError, UnicodeDecodeError):
            return WebhookResult(401, "SIGNATURE_INVALID")
        now = self._clock()
        if not verify_signature(
            payload,
            headers.get("X-Signature-V2", ""),
            headers.get("X-Timestamp", ""),
            self._provider.webhook_secret(),
            int(now.timestamp()),
        ):
            _logger.warning("kyc_webhook_signature_invalid")
            return WebhookResult(401, "SIGNATURE_INVALID")
        if not isinstance(payload, dict):
            return WebhookResult(422, "SCHEMA_INVALID")
        event_id = payload.get("event_id")
        session_id = payload.get("session_id")
        provider_status = payload.get("status")
        if not (
            isinstance(event_id, str)
            and isinstance(session_id, str)
            and isinstance(provider_status, str)
            and 0 < len(event_id) <= 128
            and 0 < len(session_id) <= 64
            and 0 < len(provider_status) <= 32
        ):
            return WebhookResult(422, "SCHEMA_INVALID")
        vendor_data = payload.get("vendor_data")
        decision = payload.get("decision") if isinstance(payload.get("decision"), dict) else None

        if await self._db.scalar(
            select(KycWebhookEvent.id).where(
                KycWebhookEvent.provider == self._provider.name,
                KycWebhookEvent.event_id == event_id,
            )
        ):
            await self._db.rollback()
            return WebhookResult(200, "DUPLICATE")

        case = await self._db.scalar(
            select(KycCase)
            .where(
                KycCase.provider == self._provider.name,
                KycCase.provider_session_id == session_id,
            )
            .with_for_update()
        )
        verdict = "APPLIED"
        if case is None:
            verdict = "IGNORED_UNKNOWN_SESSION"
        elif vendor_data != str(case.user_id):
            verdict = "IGNORED_WRONG_USER"
        else:
            outcome = evaluate(provider_status, decision, now.date(), case.country)
            key: str | None = None
            if outcome is not None and outcome.status == "approved":
                outcome, key = await self._one_account(case, outcome, decision)
            if outcome is not None and outcome.status == "approved":
                outcome = await self._same_person(case, outcome)
            if key is not None and case.identity_key is None and outcome is not None:
                if outcome.status in ("approved", "under_review"):
                    case.identity_key = key
            if outcome is None:
                verdict = "IGNORED_UNKNOWN_STATUS"
            elif outcome.status == case.status:
                case.provider_status = provider_status[:32]
                case.updated_at = now
                if outcome.review_reason is not None:
                    case.review_reason = outcome.review_reason
            elif (case.status, outcome.status) not in KYC_TRANSITIONS:
                verdict = "IGNORED_STALE"
            else:
                case.status = outcome.status
                case.provider_status = provider_status[:32]
                case.updated_at = now
                if outcome.review_reason is not None:
                    case.review_reason = outcome.review_reason
                if outcome.status in ("approved", "rejected"):
                    case.decided_at = now
                    case.decision_reason = outcome.reason
                if outcome.status == "approved":
                    case.legal_name = outcome.legal_name
                    case.date_of_birth = outcome.date_of_birth
                    case.gender = outcome.gender
                    case.id_type = outcome.id_type
                    case.issuing_country = outcome.issuing_country
                if outcome.status == "expired":
                    case.decision_reason = outcome.reason
                if outcome.note:
                    log = (
                        _logger.error
                        if outcome.review_reason == CHECKS_INCOMPLETE
                        else _logger.warning
                        if outcome.review_reason in (DUPLICATE_IDENTITY, IDENTITY_MISMATCH)
                        else _logger.info
                    )
                    log(
                        "kyc_outcome_note",
                        extra={"kyc_case_id": str(case.id), "note": outcome.note},
                    )
                event = _NOTIFY.get(outcome.status)
                if event is not None:
                    # ADR-044: in the same transaction as the status change; once per status.
                    await notify(
                        self._db,
                        user_id=case.user_id,
                        event=event,
                        dedupe_key=f"kyc:{case.id}:{outcome.status}",
                        now=now,
                        kyc_case_id=str(case.id),
                        country=case.country,
                    )
                _logger.info(
                    "kyc_status_changed",
                    extra={"kyc_case_id": str(case.id), "status": outcome.status},
                )
        self._db.add(
            KycWebhookEvent(
                id=uuid.uuid4(),
                provider=self._provider.name,
                event_id=event_id,
                provider_session_id=session_id[:64],
                provider_status=provider_status[:32],
                verdict=verdict,
                received_at=now,
            )
        )
        try:
            await self._db.commit()
        except IntegrityError as exc:
            await self._db.rollback()
            if "uq_kyc_cases_identity_approved" in str(exc.orig):
                # Backstop only (the advisory lock normally prevents it): ask Didit to send
                # it again; the next attempt sees the other approval and holds this one.
                _logger.warning("kyc_identity_race")
                return WebhookResult(503, "RETRY")
            return WebhookResult(200, "DUPLICATE")  # the same event raced in: already handled
        if verdict != "APPLIED":
            _logger.warning("kyc_webhook_ignored", extra={"verdict": verdict})
        return WebhookResult(200, verdict)
