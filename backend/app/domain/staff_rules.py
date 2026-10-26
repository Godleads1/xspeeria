"""Staff accounts, roles and permissions for the admin console (ADR-051, ADR-060).

Pure rules, no I/O.

* A permission is ``"<module>.<action>"``. Modules are the admin console's areas; actions follow
  ADR-051's Create Role screen: Read / Create / Update / Delete / Approve ("Full Access" is all
  five).
* Built-in roles follow the Technical Design Specification §11.2. ``super_admin`` holds every
  permission and cannot be edited, deleted or handed out by anyone but a Super Admin.
* No one can give a role, or a staff member, a permission they do not hold themselves
  (no privilege escalation, SEC-008).
"""

from __future__ import annotations

import re
from datetime import timedelta

__all__ = [
    "ACTIONS",
    "ALL_PERMISSIONS",
    "BUILTIN_ROLES",
    "CODE_TRIES",
    "CODE_TTL",
    "MAX_PASSWORD_TRIES",
    "MODULES",
    "PASSWORD_LOCK",
    "RESET_TTL",
    "SESSION_ABSOLUTE",
    "SESSION_IDLE",
    "SUPER_ADMIN",
    "normalise_email",
    "password_problem",
    "valid_permission_set",
]

MODULES = (
    "dashboard",
    "users",
    "kyc",
    "disputes",
    "reversals",
    "fraud_alerts",
    "outages",
    "adverts",
    "staff",
    "roles",
    "audit",
)
ACTIONS = ("read", "create", "update", "delete", "approve")
ALL_PERMISSIONS = frozenset(f"{m}.{a}" for m in MODULES for a in ACTIONS)

SUPER_ADMIN = "super_admin"


def _full(module: str) -> set[str]:
    return {f"{module}.{a}" for a in ACTIONS}


def _read_all() -> set[str]:
    return {f"{m}.read" for m in MODULES}


#: TDS §11.2. Only ``super_admin`` is locked; the others can be adjusted by staff allowed to
#: edit roles, within their own permissions.
BUILTIN_ROLES: dict[str, tuple[str, frozenset[str]]] = {
    SUPER_ADMIN: (
        "Full access. Hardware security key required before live money.",
        ALL_PERMISSIONS,
    ),
    "compliance_officer": (
        "Full identity-check and fraud (KYC/AML) access, read-only elsewhere.",
        frozenset(_read_all() | _full("kyc") | _full("fraud_alerts")),
    ),
    "ops_admin": (
        "Manual deal and settlement intervention; read-only identity checks.",
        frozenset(
            {"dashboard.read", "users.read", "kyc.read", "disputes.read", "audit.read"}
            | {"reversals.read", "reversals.create", "reversals.update", "reversals.approve"}
            | {"outages.read", "outages.create", "outages.update"}
        ),
    ),
    "support_agent": (
        "Customer support: read users, open and work on disputes.",
        frozenset(
            {"dashboard.read", "users.read", "disputes.read", "disputes.create", "disputes.update"}
        ),
    ),
}

# --- sign-in ---------------------------------------------------------------------------------

#: Same lock as the customer PIN (SEC-003): 5 wrong passwords, 15 minutes.
MAX_PASSWORD_TRIES = 5
PASSWORD_LOCK = timedelta(minutes=15)
#: Email code after the password (ADR-051 Decision 1).
CODE_TTL = timedelta(minutes=10)
CODE_TRIES = 5
#: Password reset code.
RESET_TTL = timedelta(minutes=30)
#: The session ends after 15 minutes without a request (as the 15-minute access token in the
#: API contract) and after 8 hours in any case.
SESSION_IDLE = timedelta(minutes=15)
SESSION_ABSOLUTE = timedelta(hours=8)

MIN_PASSWORD = 12
MAX_PASSWORD = 128
_EMAIL = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,190}\.[^@\s]{2,63}$")


def normalise_email(value: str) -> str | None:
    email = value.strip().lower()
    return email if len(email) <= 254 and _EMAIL.fullmatch(email) else None


def password_problem(password: str, *, email: str | None = None) -> str | None:
    """Why a new password is refused, or ``None``. NIST SP 800-63B: length over complexity."""
    if len(password) < MIN_PASSWORD:
        return f"Use at least {MIN_PASSWORD} characters."
    if len(password) > MAX_PASSWORD:
        return f"Use at most {MAX_PASSWORD} characters."
    if len(set(password)) < 5:
        return "Use a less repetitive password."
    if email and email.split("@")[0] and email.split("@")[0].lower() in password.lower():
        return "Don't use your email in your password."
    return None


def valid_permission_set(values: list[str]) -> bool:
    return all(v in ALL_PERMISSIONS for v in values)
