"""Recording the customer activity log (ADR-073).

Two ways in:

* **Every signed-in customer request that changes something** (not GET) is recorded by the
  request middleware once the answer is known, by route template: done, refused (4xx) or failed
  (5xx). The route's IDs (deal, offer, dispute, account) are kept as links; nothing from the
  body, query or headers is read.
* **Steps before the customer is known** (sign-up, sign-in, a wrong PIN, PIN reset, fingerprint
  unlock) are recorded where they happen, with :func:`entry`.

The device (the app or browser, shortened) and country (when the hosting provides it) come from
the current request through context variables.
"""

from __future__ import annotations

import uuid
from contextvars import ContextVar
from datetime import UTC, datetime
from typing import Any

from app.models.activity import CustomerActivity

__all__ = ["ROUTE_ACTIONS", "current_country", "current_device", "current_request", "entry"]

current_device: ContextVar[str | None] = ContextVar("activity_device", default=None)
current_country: ContextVar[str | None] = ContextVar("activity_country", default=None)
current_request: ContextVar[str | None] = ContextVar("activity_request", default=None)

#: (method, route template) -> (action, category). Unlisted changes are kept as "other".
ROUTE_ACTIONS: dict[tuple[str, str], tuple[str, str]] = {
    ("POST", "/api/v1/auth/logout"): ("signed_out", "account"),
    ("POST", "/api/v1/auth/biometric"): ("fingerprint_turned_on", "security"),
    ("DELETE", "/api/v1/auth/biometric"): ("fingerprint_turned_off", "security"),
    ("POST", "/api/v1/auth/step-up"): ("approved_with_fingerprint", "security"),
    ("POST", "/api/v1/auth/step-up/checks"): ("approval_started", "security"),
    ("POST", "/api/v1/auth/step-up/checks/{check_id}/code"): ("approved_with_code", "security"),
    ("POST", "/api/v1/auth/step-up/checks/{check_id}/face"): ("face_check_started", "security"),
    ("POST", "/api/v1/auth/step-up/checks/{check_id}/face/result"): (
        "approved_with_face",
        "security",
    ),
    ("POST", "/api/v1/users/me/pin"): ("pin_changed", "security"),
    ("POST", "/api/v1/users/me/phone/start"): ("phone_change_started", "security"),
    ("POST", "/api/v1/users/me/phone/confirm"): ("phone_changed", "security"),
    ("DELETE", "/api/v1/users/me/sessions/{session_id}"): ("session_ended", "security"),
    ("DELETE", "/api/v1/users/me/trusted-devices/{trusted_device_id}"): (
        "trusted_phone_removed",
        "security",
    ),
    ("PUT", "/api/v1/users/me/push-token"): ("push_turned_on", "account"),
    ("DELETE", "/api/v1/users/me/push-token"): ("push_turned_off", "account"),
    ("PATCH", "/api/v1/notifications/{notification_id}"): ("notification_read", "account"),
    ("POST", "/api/v1/kyc/cases"): ("identity_check_started", "identity"),
    ("POST", "/api/v1/users/me/tier-checks/bvn"): ("bvn_submitted", "identity"),
    ("POST", "/api/v1/users/me/tier-checks/address"): ("address_submitted", "identity"),
    ("POST", "/api/v1/users/me/tier-checks/proof-of-address"): (
        "proof_of_address_submitted",
        "identity",
    ),
    ("POST", "/api/v1/users/me/tier-checks/source-of-funds"): (
        "source_of_funds_submitted",
        "identity",
    ),
    ("POST", "/api/v1/offers"): ("offer_posted", "market"),
    ("POST", "/api/v1/offers/requests"): ("request_posted", "market"),
    ("PATCH", "/api/v1/offers/{offer_id}"): ("offer_edited", "market"),
    ("DELETE", "/api/v1/offers/{offer_id}"): ("offer_withdrawn", "market"),
    ("POST", "/api/v1/offers/{offer_id}/accept"): ("offer_taken", "deal"),
    ("POST", "/api/v1/offers/{offer_id}/queue"): ("queue_joined", "market"),
    ("DELETE", "/api/v1/offers/{offer_id}/queue"): ("queue_left", "market"),
    ("PUT", "/api/v1/matches/{match_id}/payout-accounts"): ("payout_accounts_chosen", "deal"),
    ("POST", "/api/v1/matches/{match_id}/settlement/extend"): ("payment_time_extended", "deal"),
    ("POST", "/api/v1/dev/matches/{match_id}/simulate-transfer"): (
        "paid_into_escrow_pretend",
        "deal",
    ),
    ("POST", "/api/v1/payout-accounts"): ("payout_account_added", "payout"),
    ("DELETE", "/api/v1/payout-accounts/{payout_account_id}"): (
        "payout_account_removed",
        "payout",
    ),
    ("POST", "/api/v1/disputes"): ("dispute_opened", "dispute"),
    ("POST", "/api/v1/disputes/{dispute_id}/evidence"): ("dispute_message_sent", "dispute"),
}

#: Path parameters kept as links (all others are ignored).
_REF_PARAMS = (
    "dispute_id",
    "payout_account_id",
    "session_id",
    "trusted_device_id",
    "check_id",
    "notification_id",
)


def _uuid(value: object) -> uuid.UUID | None:
    try:
        return uuid.UUID(str(value))
    except (TypeError, ValueError):
        return None


def entry(
    user_id: uuid.UUID,
    action: str,
    category: str,
    *,
    outcome: str = "done",
    detail: dict[str, Any] | None = None,
    route: str | None = None,
    method: str | None = None,
    status: int | None = None,
    path_params: dict[str, Any] | None = None,
    at: datetime | None = None,
) -> CustomerActivity:
    """A row for the activity log; the caller adds it to its own transaction."""
    params = path_params or {}
    ref = next((_uuid(params[k]) for k in _REF_PARAMS if k in params), None)
    return CustomerActivity(
        id=uuid.uuid4(),
        user_id=user_id,
        at=at or datetime.now(UTC),
        action=action[:40],
        category=category,
        outcome=outcome,
        route=route[:120] if route else None,
        method=method,
        status=status,
        match_id=_uuid(params.get("match_id")) if "match_id" in params else None,
        offer_id=_uuid(params.get("offer_id")) if "offer_id" in params else None,
        ref_id=ref,
        detail=detail,
        device=current_device.get(),
        country=current_country.get(),
        request_id=current_request.get(),
    )


def for_request(
    user_id: uuid.UUID, method: str, route: str, status: int, path_params: dict[str, Any]
) -> CustomerActivity:
    action, category = ROUTE_ACTIONS.get((method, route), ("other", "other"))
    outcome = "done" if status < 400 else ("refused" if status < 500 else "failed")
    return entry(
        user_id,
        action,
        category,
        outcome=outcome,
        route=route,
        method=method,
        status=status,
        path_params=path_params,
    )


def short_device(user_agent: str | None) -> str | None:
    """Enough to tell the app from a browser, never the whole header."""
    if not user_agent:
        return None
    ua = user_agent.strip()
    for marker, name in (
        ("Expo", "Xspeeria app"),
        ("okhttp", "Xspeeria app (Android)"),
        ("CFNetwork", "Xspeeria app (iPhone)"),
        ("Edg/", "Edge browser"),
        ("Chrome/", "Chrome browser"),
        ("Firefox/", "Firefox browser"),
        ("Safari/", "Safari browser"),
    ):
        if marker in ua:
            return name
    return ua[:60]
