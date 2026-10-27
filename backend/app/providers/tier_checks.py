"""BVN and proof-of-address checks for higher tiers (ADR-058), through Didit.

* BVN: Didit database validation, service ``nga_bank_verification_number`` (Didit's public
  page, 2026-10-26: multipart ``issuing_state``, ``services``, ``first_name``, ``last_name``,
  ``bvn``, optional ``date_of_birth``; top-level ``status`` Approved / In Review / Declined).
* Proof of address: Didit standalone ``POST /v3/poa/`` (public docs, 2026-10-26: multipart
  ``document`` plus ``expected_first_name`` / ``expected_last_name`` / ``expected_address`` /
  ``expected_country``; ``poa.status`` Approved / Declined with ``warnings``).

To confirm against Didit's API reference and the contract before going live. The BVN and the
document are passed straight through and never stored or logged. Fails closed: anything
unexpected is "in_review", never "approved".
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any, Protocol

import httpx

from app.core.api_metrics import tracked_transport
from app.core.logging import get_logger

#: How this service is named on the System Health page (ADR-072).
_MONITOR_NAME = "Didit BVN/address check"

__all__ = ["DevTierChecks", "DiditTierChecks", "TierCheckProvider", "TierOutcome"]

_logger = get_logger(__name__)
_STATUS = {"Approved": "approved", "Declined": "declined", "In Review": "in_review"}


@dataclass(frozen=True)
class TierOutcome:
    status: str  # approved | declined | in_review
    reason: str | None = None
    request_id: str | None = None


class TierCheckProvider(Protocol):
    async def bvn(
        self, *, first_name: str, last_name: str, bvn: str, date_of_birth: date | None
    ) -> TierOutcome: ...

    async def proof_of_address(
        self,
        *,
        document: bytes,
        filename: str,
        content_type: str,
        first_name: str,
        last_name: str,
        expected_address: str,
        expected_country: str,
    ) -> TierOutcome: ...


class DiditTierChecks:
    name = "didit"

    def __init__(
        self,
        api_key: str,
        base_url: str = "https://verification.didit.me",
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._key = api_key
        self._base = base_url.rstrip("/")
        self._transport = transport

    async def _post(
        self, path: str, data: dict[str, str], files: dict[str, Any] | None = None
    ) -> dict[str, Any] | None:
        try:
            async with httpx.AsyncClient(
                transport=tracked_transport(_MONITOR_NAME, self._transport), timeout=60
            ) as client:
                r = await client.post(
                    f"{self._base}{path}", headers={"x-api-key": self._key}, data=data, files=files
                )
        except httpx.HTTPError:
            _logger.warning("tier_check_unreachable", extra={"path": path})
            return None
        if r.status_code != 200:
            _logger.warning("tier_check_refused", extra={"path": path, "status": r.status_code})
            return None
        body = r.json()
        return body if isinstance(body, dict) else None

    async def bvn(
        self, *, first_name: str, last_name: str, bvn: str, date_of_birth: date | None
    ) -> TierOutcome:
        data = {
            "issuing_state": "NGA",
            "services": "nga_bank_verification_number",
            "first_name": first_name,
            "last_name": last_name,
            "bvn": bvn,
        }
        if date_of_birth is not None:
            data["date_of_birth"] = date_of_birth.isoformat()
        body = await self._post("/v3/database-validation/", data)
        if body is None:
            return TierOutcome("in_review", "PROVIDER_UNAVAILABLE")
        status = _STATUS.get(str(body.get("status")), "in_review")
        codes = [
            str(v.get("outcome_code"))
            for v in body.get("validations") or []
            if isinstance(v, dict) and v.get("outcome_code")
        ]
        # Fail closed: "Approved" only counts with a MATCH from the BVN service itself.
        if status == "approved" and "MATCH" not in codes:
            status = "in_review"
        return TierOutcome(status, ",".join(codes)[:128] or None, _rid(body))

    async def proof_of_address(
        self,
        *,
        document: bytes,
        filename: str,
        content_type: str,
        first_name: str,
        last_name: str,
        expected_address: str,
        expected_country: str,
    ) -> TierOutcome:
        data = {
            "expected_first_name": first_name,
            "expected_last_name": last_name,
            "expected_address": expected_address,
            "expected_country": expected_country,
        }
        body = await self._post(
            "/v3/poa/", data, files={"document": (filename, document, content_type)}
        )
        if body is None:
            return TierOutcome("in_review", "PROVIDER_UNAVAILABLE")
        raw = body.get("poa")
        poa: dict[str, Any] = raw if isinstance(raw, dict) else {}
        status = _STATUS.get(str(poa.get("status")), "in_review")
        warnings = [
            str(w.get("risk"))
            for w in poa.get("warnings") or []
            if isinstance(w, dict) and w.get("risk")
        ]
        return TierOutcome(status, ",".join(warnings)[:128] or None, _rid(body))


def _rid(body: dict[str, Any]) -> str | None:
    rid = body.get("request_id")
    return str(rid)[:64] if rid else None


class DevTierChecks:
    """Local development only (with the identity bypass): no Didit call, no charge.

    BVN 00000000000 is declined so the "declined" path can be tried by hand.
    """

    name = "dev"

    async def bvn(
        self, *, first_name: str, last_name: str, bvn: str, date_of_birth: date | None
    ) -> TierOutcome:
        if bvn == "00000000000":
            return TierOutcome("declined", "NO_MATCH")
        return TierOutcome("approved", "MATCH")

    async def proof_of_address(
        self,
        *,
        document: bytes,
        filename: str,
        content_type: str,
        first_name: str,
        last_name: str,
        expected_address: str,
        expected_country: str,
    ) -> TierOutcome:
        return TierOutcome("approved")
