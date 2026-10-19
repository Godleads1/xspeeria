"""Bank account name check (ADR-035).

The partner bank confirms that an account exists and whose name it is in (Banking spec §3.3).
No partner bank is connected yet, so the only implementation is a **pretend** check for a
developer's computer: it approves every account. The server refuses to start with it unless
``APP_ENV=local`` (``BANK_CHECK_DEV=true``). Without any checker, new accounts stay
``pending`` and cannot be used for a deal (fail closed).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from app.domain.payout_rules import AccountDetails

__all__ = ["DevNameCheck", "NameCheck", "NameCheckResult"]


@dataclass(frozen=True)
class NameCheckResult:
    validated: bool
    #: The account holder's name as the bank returned it, when validated.
    account_name: str | None


class NameCheck(Protocol):
    async def check(self, details: AccountDetails) -> NameCheckResult: ...


class DevNameCheck:
    """Local development only. Approves every account under a fixed, obviously fake name."""

    async def check(self, details: AccountDetails) -> NameCheckResult:
        return NameCheckResult(validated=True, account_name="DEV ACCOUNT HOLDER")
