"""Every API route needs a signed-in customer or staff member, except a short, named list.

Owner, 2026-11-02: "nobody must be able to access any private information without login".
A new route that is reachable without a login fails this test until it is added below with
the reason it holds no private information.
"""

from __future__ import annotations

from typing import Any

from fastapi.routing import APIRoute

from app.core.config import Settings
from app.main import create_app

#: Customer sign-in, staff sign-in and session dependencies (``app/api``).
_SIGNED_IN = {"current_principal", "current_staff", "current_staff_passive"}

#: Reachable without a login, and why that's safe.
PUBLIC_ROUTES = {
    ("GET", "/health"): "says only {'status': 'ok'}",
    ("POST", "/api/v1/auth/register"): "starts sign-up; same answer whether the number exists",
    ("POST", "/api/v1/auth/verify-phone"): "needs the SMS code",
    ("POST", "/api/v1/auth/login"): "needs the PIN; locks after 5 wrong tries",
    ("POST", "/api/v1/auth/checks/{check_id}/codes"): "needs the emailed/SMS codes for that check",
    ("POST", "/api/v1/auth/checks/{check_id}/face"): "starts the face check for that check",
    ("POST", "/api/v1/auth/checks/{check_id}/face/result"): "finishes the face check",
    ("POST", "/api/v1/auth/refresh"): "needs a valid refresh token",
    ("POST", "/api/v1/auth/pin-reset/start"): "same answer whether the account exists",
    ("POST", "/api/v1/auth/pin-reset/verify"): "needs the reset code",
    (
        "POST",
        "/api/v1/auth/pin-reset/confirm",
    ): "needs the reset code plus the email code or face check",
    (
        "POST",
        "/api/v1/auth/biometric/unlock",
    ): "needs the unlock key that Face ID/fingerprint releases on the phone",
    ("POST", "/api/v1/admin/auth/login"): "staff password; locks after 5 wrong tries",
    ("POST", "/api/v1/admin/auth/verify"): "needs the staff email code",
    ("POST", "/api/v1/admin/auth/forgot-password"): "same answer whether the email exists",
    ("POST", "/api/v1/admin/auth/reset-password"): "needs the reset code",
    ("POST", "/api/v1/webhooks/didit"): "signed by the identity-check provider (HMAC)",
    ("POST", "/api/v1/webhooks/partners/{partner_code}"): "signed by the partner bank (HMAC)",
}


def _names(dependant: Any, acc: set[str]) -> set[str]:
    for sub in dependant.dependencies:
        acc.add(getattr(sub.call, "__name__", ""))
        _names(sub, acc)
    return acc


def _routes() -> list[Any]:
    app = create_app(Settings(_env_file=None, app_env="production"))  # type: ignore[call-arg]
    found: list[Any] = []
    for r in app.routes:
        if isinstance(r, APIRoute):
            found.append(r)
        elif hasattr(r, "effective_candidates"):  # routers FastAPI includes lazily
            found.extend(r.effective_candidates())
    return found


def test_only_the_named_routes_work_without_a_login() -> None:
    routes = _routes()
    assert len(routes) > 100  # the walk really found the API
    public = set()
    for route in routes:
        if _names(route.dependant, set()) & _SIGNED_IN:
            continue
        for method in route.methods:
            public.add((method, route.path))
    assert public == set(PUBLIC_ROUTES), sorted(public ^ set(PUBLIC_ROUTES))


def test_production_has_no_api_docs() -> None:
    paths = {r.path for r in _routes()}
    assert not {"/docs", "/redoc", "/openapi.json"} & paths
