"""Identity-check rules — Milestone KYC-1 (ADR-039). Pure: no I/O, no clock.

The provider (Didit) runs the check on its own screens; these rules decide what its result
means for Xspeeria. The product owner (2026-10-19) chose: ID document + liveness + face match +
sanctions/PEP screening, and **18 or older**, enforced here on the server from the date of
birth on the ID — never from the provider's own ``age`` figure or anything the app sends.

What a user is told never says *why* a sanctions check failed: naming it could tip off a
listed person. Every refusal uses plain, generic words.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any

__all__ = [
    "ACTIVE_STATUSES",
    "KYC_STATUSES",
    "KYC_TRANSITIONS",
    "MIN_AGE",
    "Outcome",
    "age_on",
    "evaluate",
]

#: Data dictionary KYCCases.status, plus ``expired`` (PROPOSED, ADR-039): an abandoned or
#: timed-out check, or an approval the provider has since expired. The user may start again.
KYC_STATUSES = ("pending_documents", "under_review", "approved", "rejected", "expired")
#: "A user may hold only one non-terminal KYC case at a time" (contract §3.3).
ACTIVE_STATUSES = frozenset({"pending_documents", "under_review"})
#: Forward only. ``approved → expired`` is the provider's "Kyc Expired".
KYC_TRANSITIONS: frozenset[tuple[str, str]] = frozenset(
    {
        ("pending_documents", "under_review"),
        ("pending_documents", "approved"),
        ("pending_documents", "rejected"),
        ("pending_documents", "expired"),
        ("under_review", "approved"),
        ("under_review", "rejected"),
        ("under_review", "expired"),
        ("approved", "expired"),
    }
)
MIN_AGE = 18

#: Didit status → our status, for statuses that need no decision to interpret.
_PLAIN = {
    "Not Started": "pending_documents",
    "In Progress": "pending_documents",
    "Awaiting User": "pending_documents",
    "Resubmitted": "pending_documents",
    "In Review": "under_review",
    "Abandoned": "expired",
    "Expired": "expired",
    "Kyc Expired": "expired",
}
#: Didit document_type → data dictionary id_type (anything else is "other").
_ID_TYPES = {
    "Passport": "passport",
    "Identity Card": "national_id",
    "Driver's License": "drivers_license",
}

DECLINED = "We could not verify your identity. Please try again with a valid ID document."
UNDERAGE = "You must be 18 or older to use Xspeeria."
EXPIRED = "Your identity check was not finished in time. Please start again."
KYC_EXPIRED = "Your identity check has expired. Please verify again."


@dataclass(frozen=True)
class Outcome:
    status: str
    #: Shown to the user verbatim (data dictionary); never names a sanctions hit.
    reason: str | None = None
    legal_name: str | None = None
    date_of_birth: date | None = None
    id_type: str | None = None
    issuing_country: str | None = None
    #: For the server log only (never shown, never personal data).
    note: str | None = None


def age_on(born: date, today: date) -> int:
    years = today.year - born.year
    return years - 1 if (today.month, today.day) < (born.month, born.day) else years


def _first(decision: dict[str, Any], key: str) -> dict[str, Any] | None:
    items = decision.get(key)
    if isinstance(items, list) and items and isinstance(items[0], dict):
        return items[0]
    return None


def _all_approved(decision: dict[str, Any], key: str) -> bool:
    items = decision.get(key)
    return (
        isinstance(items, list)
        and len(items) > 0
        and all(isinstance(i, dict) and i.get("status") == "Approved" for i in items)
    )


def evaluate(status: str, decision: dict[str, Any] | None, today: date) -> Outcome | None:
    """What a provider status (and its decision, when present) means. None = unknown status."""
    if status == "Kyc Expired":
        return Outcome("expired", KYC_EXPIRED)
    if status in ("Abandoned", "Expired"):
        return Outcome("expired", EXPIRED)
    if status == "Declined":
        return Outcome("rejected", DECLINED, note="provider declined")
    if status in _PLAIN:
        return Outcome(_PLAIN[status])
    if status != "Approved":
        return None

    # Approved by the provider: check it ourselves before we trust it.
    d = decision or {}
    idv = _first(d, "id_verifications")
    for key in ("id_verifications", "liveness_checks", "face_matches", "aml_screenings"):
        if not _all_approved(d, key):
            # The workflow is missing a check the product owner requires, or one is not
            # approved: hold for a person instead of approving (configuration error).
            return Outcome("under_review", note=f"{key} missing or not approved")
    if idv is None:  # pragma: no cover - _all_approved above guarantees one
        return Outcome("under_review", note="no id verification")
    try:
        born = date.fromisoformat(str(idv.get("date_of_birth") or ""))
    except ValueError:
        return Outcome("under_review", note="no readable date of birth")
    name = (
        str(idv.get("full_name") or "").strip()
        or " ".join(str(idv.get(k) or "").strip() for k in ("first_name", "last_name")).strip()
    )
    if not name:
        return Outcome("under_review", note="no legal name")
    country = idv.get("issuing_state")
    if age_on(born, today) < MIN_AGE:
        # Keep nothing about a minor beyond the refusal itself (data minimisation).
        return Outcome("rejected", UNDERAGE, note="under 18")
    return Outcome(
        "approved",
        legal_name=name[:255],
        date_of_birth=born,
        id_type=_ID_TYPES.get(str(idv.get("document_type")), "other"),
        issuing_country=country if isinstance(country, str) and len(country) == 3 else None,
    )
