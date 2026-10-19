"""Identity-check rules — Milestone KYC-1 (ADR-039). Pure: no I/O, no clock.

The provider (Didit) runs the check on its own screens; these rules decide what its result
means for Xspeeria. The product owner (2026-10-19) chose: ID document + liveness + face match +
sanctions/PEP screening, and **18 or older**, enforced here on the server from the date of
birth on the ID — never from the provider's own ``age`` figure or anything the app sends.

What a user is told never says *why* a sanctions check failed: naming it could tip off a
listed person. Every refusal uses plain, generic words.
"""

from __future__ import annotations

import hashlib
import hmac
import re
import unicodedata
from dataclasses import dataclass
from datetime import date
from typing import Any

__all__ = [
    "ACTIVE_STATUSES",
    "CHECKS_INCOMPLETE",
    "COUNTRIES",
    "DUPLICATE_IDENTITY",
    "IDENTITY_MISMATCH",
    "KYC_STATUSES",
    "KYC_TRANSITIONS",
    "MIN_AGE",
    "REVIEW_REASONS",
    "Outcome",
    "age_on",
    "evaluate",
    "identity_key",
    "names_match",
    "other_account_matches",
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
#: Why a case is held for a person (ADR-041). Internal only — never shown to the user.
DUPLICATE_IDENTITY = "DUPLICATE_IDENTITY"
CHECKS_INCOMPLETE = "CHECKS_INCOMPLETE"
#: ADR-042: a second country's check does not match the identity already on the account.
IDENTITY_MISMATCH = "IDENTITY_MISMATCH"
REVIEW_REASONS = (DUPLICATE_IDENTITY, CHECKS_INCOMPLETE, IDENTITY_MISMATCH)

#: ADR-042/043: countries a user can be verified in (MVP corridors), ISO alpha-2 → the
#: alpha-3 code Didit reports as the ID's ``issuing_state``, and the name shown to users.
COUNTRIES: dict[str, tuple[str, str]] = {
    "NG": ("NGA", "Nigeria"),
    "GB": ("GBR", "the United Kingdom"),
    "US": ("USA", "the United States"),
}

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
WRONG_COUNTRY = "Please use an ID issued by {country}."


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
    #: Internal reason a case is held for review (ADR-041); None for the provider's own review.
    review_reason: str | None = None
    #: "country|id type|document number" — only to compute ``identity_key``; never stored.
    document_ref: str | None = None

    def __repr__(self) -> str:  # never print the document reference or identity fields
        return f"Outcome(status={self.status!r}, review_reason={self.review_reason!r})"


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


def evaluate(
    status: str, decision: dict[str, Any] | None, today: date, country: str = "NG"
) -> Outcome | None:
    """What a provider status (and its decision, when present) means. None = unknown status.

    ``country`` is the country this check verifies (ADR-042): the ID must be issued there.
    """
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
            return Outcome(
                "under_review",
                note=f"{key} missing or not approved",
                review_reason=CHECKS_INCOMPLETE,
            )
    if idv is None:  # pragma: no cover - _all_approved above guarantees one
        return Outcome("under_review", note="no id verification", review_reason=CHECKS_INCOMPLETE)
    try:
        born = date.fromisoformat(str(idv.get("date_of_birth") or ""))
    except ValueError:
        return Outcome(
            "under_review", note="no readable date of birth", review_reason=CHECKS_INCOMPLETE
        )
    name = (
        str(idv.get("full_name") or "").strip()
        or " ".join(str(idv.get(k) or "").strip() for k in ("first_name", "last_name")).strip()
    )
    if not name:
        return Outcome("under_review", note="no legal name", review_reason=CHECKS_INCOMPLETE)
    issuing = idv.get("issuing_state")
    if age_on(born, today) < MIN_AGE:
        # Keep nothing about a minor beyond the refusal itself (data minimisation).
        return Outcome("rejected", UNDERAGE, note="under 18")
    id_type = _ID_TYPES.get(str(idv.get("document_type")), "other")
    issuer = issuing if isinstance(issuing, str) and len(issuing) == 3 else None
    expected, country_name = COUNTRIES[country]
    if issuer is None:
        return Outcome("under_review", note="no issuing country", review_reason=CHECKS_INCOMPLETE)
    if issuer != expected:
        # ADR-042: proof for a country is an ID issued by that country. Nothing is kept.
        return Outcome(
            "rejected", WRONG_COUNTRY.format(country=country_name), note="id from another country"
        )
    number = re.sub(r"[^A-Z0-9]", "", str(idv.get("document_number") or "").upper())
    if not number:
        # Without the document number the one-account check (ADR-041) cannot run.
        return Outcome("under_review", note="no document number", review_reason=CHECKS_INCOMPLETE)
    return Outcome(
        "approved",
        legal_name=name[:255],
        date_of_birth=born,
        id_type=id_type,
        issuing_country=issuer,
        document_ref=f"{issuer or ''}|{id_type}|{number[:64]}",
    )


def _name_tokens(name: str) -> set[str]:
    plain = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return set(re.findall(r"[a-z]+", plain.casefold()))


def names_match(a: str, b: str) -> bool:
    """Same person's name on two IDs (ADR-042): the shorter name's words all appear in the
    longer one (middle names may be missing) and it has at least two words — unless both are
    a single, identical word. Accents and letter case are ignored. Anything else goes to a
    person."""
    ta, tb = _name_tokens(a), _name_tokens(b)
    if ta == tb:
        return bool(ta)
    small, large = (ta, tb) if len(ta) <= len(tb) else (tb, ta)
    return len(small) >= 2 and small <= large


def identity_key(secret: bytes, document_ref: str) -> str:
    """Keyed hash of one ID document (ADR-041). Not reversible without the secret."""
    return hmac.new(secret, f"v1|{document_ref}".encode(), hashlib.sha256).hexdigest()


def other_account_matches(decision: dict[str, Any] | None, user_id: str) -> bool:
    """Didit found this face or document in an approved session of another account (ADR-041).

    Uses ``matches`` under ``id_verifications`` and ``liveness_checks`` only; device and IP
    matches are ignored (families and offices share phones and networks).
    """
    for key in ("id_verifications", "liveness_checks"):
        items = (decision or {}).get(key)
        if not isinstance(items, list):
            continue
        for item in items:
            matches = item.get("matches") if isinstance(item, dict) else None
            if not isinstance(matches, list):
                continue
            for m in matches:
                if (
                    isinstance(m, dict)
                    and m.get("status") == "Approved"
                    and m.get("vendor_data") != user_id
                ):
                    return True
    return False
