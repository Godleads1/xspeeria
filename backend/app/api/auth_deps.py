"""FastAPI dependencies for sign-in and authorization (ADR-025, S-2).

Deny by default: a route gets a ``Principal`` only through ``current_principal``, which
verifies the access token and the live session row on every request. Routes never read a
user ID, role or session from the request body or query.

**Database session exposure.** ``app.db.session`` deliberately offered no route-level
session dependency until the unit-of-work batch. AUTH-1 adds ``get_db_session`` for the
auth service only: the route still never touches the session; the service owns every
commit and rollback.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import timedelta
from typing import Annotated

from fastapi import Depends, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_app_settings
from app.core.config import Settings
from app.core.exceptions import AppError
from app.db.row_scope import scope_to_user
from app.db.session import get_sessionmaker
from app.services.auth import AuthRuntime, AuthService, DeviceInfo, Principal, sms_unavailable

__all__ = [
    "BearerToken",
    "CurrentPrincipal",
    "current_principal",
    "device_info",
    "get_auth_runtime",
    "get_auth_service",
    "get_db_session",
    "limit_by_address",
]

_bearer = HTTPBearer(auto_error=False)


def get_auth_runtime(request: Request) -> AuthRuntime:
    runtime = getattr(request.app.state, "auth", None)
    if not isinstance(runtime, AuthRuntime) or runtime.keys is None:
        # No signing key configured: sign-in is switched off, not half-working.
        raise sms_unavailable()
    return runtime


def client_address(request: Request) -> str:
    """The direct peer address. Proxy headers are NOT trusted (ADR-025 §4)."""
    return request.client.host if request.client else "unknown"


async def limit_by_address(
    request: Request, runtime: Annotated[AuthRuntime, Depends(get_auth_runtime)]
) -> None:
    if not await runtime.address_limiter.hit("addr:" + client_address(request), runtime.clock()):
        raise AppError(
            "AUTH_429_RATE_LIMITED",
            "Too many attempts. Please wait and try again.",
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            details={"retry_after_seconds": int(timedelta(minutes=1).total_seconds())},
        )


async def get_db_session(
    settings: Annotated[Settings, Depends(get_app_settings)],
) -> AsyncIterator[AsyncSession]:
    factory = get_sessionmaker(settings)
    async with factory() as session:
        yield session


async def get_auth_service(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    runtime: Annotated[AuthRuntime, Depends(get_auth_runtime)],
) -> AuthService:
    return AuthService(db, runtime)


def _unauthorized() -> AppError:
    return AppError(
        "AUTH_401_UNAUTHORIZED",
        "Please log in again.",
        status_code=status.HTTP_401_UNAUTHORIZED,
    )


async def bearer_token(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> str:
    if credentials is None or credentials.scheme.lower() != "bearer" or not credentials.credentials:
        raise _unauthorized()
    return credentials.credentials


BearerToken = Annotated[str, Depends(bearer_token)]


async def current_principal(
    request: Request,
    token: BearerToken,
    service: Annotated[AuthService, Depends(get_auth_service)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> Principal:
    principal = await service.authenticate(token)
    # ADR-078: from here on the database only shows this customer their own private rows.
    # `db` is the same per-request session the service and the route use (FastAPI caches it).
    await scope_to_user(db, principal.user_id)
    # For the request log only (ADR-025 §1.8 allows the user ID).
    request.state.user_id = str(principal.user_id)
    return principal


CurrentPrincipal = Annotated[Principal, Depends(current_principal)]


async def limit_by_account(
    principal: CurrentPrincipal, runtime: Annotated[AuthRuntime, Depends(get_auth_runtime)]
) -> None:
    """Signed-in account routes: limited per customer, not per network address (owner,
    2026-11-03). Many phones in Nigeria share one mobile-network address, so a per-address
    limit would refuse real customers behind a busy one."""
    if not await runtime.user_limiter.hit(f"account:{principal.user_id}", runtime.clock()):
        raise AppError(
            "AUTH_429_RATE_LIMITED",
            "Too many requests. Please wait a moment and try again.",
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            details={"retry_after_seconds": 60},
        )


def device_info(request: Request, device_id: str | None) -> DeviceInfo:
    agent = request.headers.get("user-agent")
    return DeviceInfo(
        device_id=device_id,
        user_agent=agent[:256] if agent else None,
        ip_address=client_address(request)[:45],
    )
