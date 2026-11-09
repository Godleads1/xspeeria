"""Redo identity check — ADR-104 (owner 2026-11-09: "Yes."; "Same ID, else staff").

For a customer who can't pass the face check on a new phone (ADR-054), Compliance asks for a
new identity check. The next log-in on a new phone then opens a full Didit identity check (ID
document + live selfie) instead of the face check.

* **Same ID document as the approved check** (same keyed document hash, ADR-041) → it counts
  at once: the old check ends ("expired"), the new one is the account's check, the request is
  cleared, and the log-in can finish.
* **A different document** (a renewed passport, another ID type) → held with
  ``REDO_NEW_DOCUMENT``; two staff (recommend, then confirm) compare it before it counts. A
  thief passing an identity check with their own ID is therefore never let in automatically.
* The usual rules still apply first: a document verified on another account, or a name or
  birth date that differs from the account's, is held (ADR-041, ADR-042).

Whether Didit then compares later face checks with the new selfie or the old one is
**NOT VERIFIED** (its documents don't say; sandbox sessions store no face).

Nothing here imports the auth service, so the auth and KYC services can both use it.
"""

from __future__ import annotations

import uuid
from dataclasses import replace
from datetime import datetime

from fastapi import status
from sqlalchemy import or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError
from app.core.logging import get_logger
from app.domain.kyc_rules import ACTIVE_STATUSES, REDO_NEW_DOCUMENT, Outcome, identity_key
from app.models.identity import User
from app.models.kyc import KycCase
from app.providers.didit import KycProviderError, KycSessionProvider

__all__ = ["finish_redo", "latest_redo", "same_document", "start_redo"]

_logger = get_logger(__name__)


def _err(code: str, message: str, status_code: int) -> AppError:
    return AppError(code, message, status_code=status_code)


async def start_redo(
    db: AsyncSession, provider: KycSessionProvider | None, user: User, now: datetime
) -> tuple[KycCase, str]:
    """Open (or resume) the redo identity check. Returns the case and Didit's page link.

    The caller holds no lock across the call to Didit; the case row is added after it.
    """
    if provider is None:
        raise _err(
            "SYS_503_SERVICE_UNAVAILABLE",
            "Identity checks are not available right now. Please try again later.",
            status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    approved = await db.scalar(
        select(KycCase)
        .where(KycCase.user_id == user.id, KycCase.status == "approved")
        .order_by(KycCase.decided_at.desc().nulls_last(), KycCase.created_at.desc())
        .limit(1)
    )
    if approved is None:
        raise _err(
            "AUTH_409_NO_FACE_ON_FILE",
            "We have no identity check to compare with. Please contact Support.",
            status.HTTP_409_CONFLICT,
        )
    country = approved.country
    active = (
        await db.scalars(
            select(KycCase).where(
                KycCase.user_id == user.id, KycCase.status.in_(tuple(ACTIVE_STATUSES))
            )
        )
    ).all()
    # Didit resumes one unfinished session per person: any other open check must end first.
    if any(c.purpose != "redo" or c.country != country for c in active):
        raise _err(
            "KYC_409_CASE_ALREADY_ACTIVE",
            "Finish your other identity check first.",
            status.HTTP_409_CONFLICT,
        )
    try:
        session = await provider.create_session(str(user.id), {"purpose": "redo"})
    except KycProviderError as exc:
        _logger.warning("kyc_provider_error", extra={"error": str(exc)})
        raise _err(
            "SYS_503_SERVICE_UNAVAILABLE",
            "Identity checks are not available right now. Please try again later.",
            status.HTTP_503_SERVICE_UNAVAILABLE,
        ) from None
    existing = await db.scalar(
        select(KycCase).where(
            KycCase.provider == provider.name, KycCase.provider_session_id == session.session_id
        )
    )
    if existing is not None:
        if existing.user_id != user.id or existing.purpose != "redo":
            raise _err(
                "KYC_409_CASE_ALREADY_ACTIVE",
                "Finish your other identity check first.",
                status.HTTP_409_CONFLICT,
            )
        return existing, session.url
    for old in active:
        # Didit gave a new session: the unfinished redo it replaces is over.
        old.status, old.updated_at = "expired", now
        old.decision_reason = "Replaced by a new identity check."
    await db.flush()
    case = KycCase(
        id=uuid.uuid4(),
        user_id=user.id,
        provider=provider.name,
        country=country,
        provider_session_id=session.session_id,
        provider_status=session.status[:32],
        status="pending_documents",
        purpose="redo",
        created_at=now,
        updated_at=now,
    )
    db.add(case)
    await db.flush()
    _logger.info("kyc_redo_started", extra={"user_id": str(user.id), "kyc_case_id": str(case.id)})
    return case, session.url


async def latest_redo(db: AsyncSession, user: User) -> KycCase | None:
    """The newest redo check started since Compliance's current request, if any."""
    if user.identity_redo_requested_at is None:
        return None
    case: KycCase | None = await db.scalar(
        select(KycCase)
        .where(
            KycCase.user_id == user.id,
            KycCase.purpose == "redo",
            KycCase.created_at >= user.identity_redo_requested_at,
        )
        .order_by(KycCase.created_at.desc())
        .limit(1)
    )
    return case


async def same_document(
    db: AsyncSession,
    case: KycCase,
    outcome: Outcome,
    secret: bytes | None,
    secret_previous: bytes | None,
) -> Outcome:
    """A redo approval counts only for the ID document already approved on the account."""
    if outcome.status != "approved":
        return outcome
    keys: set[str] = set()
    if outcome.document_ref is not None:
        for s in (secret, secret_previous):
            if s is not None:
                keys.add(identity_key(s, outcome.document_ref))
    approved_keys = set(
        (
            await db.scalars(
                select(KycCase.identity_key).where(
                    KycCase.user_id == case.user_id,
                    KycCase.id != case.id,
                    KycCase.status == "approved",
                    KycCase.identity_key.is_not(None),
                )
            )
        ).all()
    )
    if keys & approved_keys:
        return outcome
    return replace(
        outcome,
        status="under_review",
        reason=None,
        note="redo on a different document",
        review_reason=REDO_NEW_DOCUMENT,
    )


async def finish_redo(db: AsyncSession, case: KycCase, now: datetime) -> None:
    """``case`` (a redo) is about to be approved: the account's older checks in that country
    end. Compliance's request stays until the log-in that waited for it finishes, so a log-in
    started after the approval still uses this check rather than the face check.

    Runs before the case's own change is written: the older check must stop being "approved"
    first, because one ID document may have only one approved check (ADR-041).
    """
    with db.no_autoflush:
        await db.execute(
            update(KycCase)
            .where(
                KycCase.user_id == case.user_id,
                KycCase.id != case.id,
                or_(KycCase.status == "approved", KycCase.status.in_(tuple(ACTIVE_STATUSES))),
                KycCase.country == case.country,
            )
            .values(
                status="expired",
                decision_reason="Replaced by a new identity check.",
                updated_at=now,
            )
            .execution_options(synchronize_session=False)
        )
    _logger.info(
        "kyc_redo_approved", extra={"user_id": str(case.user_id), "kyc_case_id": str(case.id)}
    )
