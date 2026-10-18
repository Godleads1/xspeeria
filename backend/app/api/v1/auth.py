"""Auth and current-user endpoints — Milestone AUTH-1 (ADR-025 §1.7).

Routes only translate HTTP to the service; every rule lives in ``app.services.auth``.
Every route here passes through the per-address limit (10 per minute, ADR-025 §1.2).
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response, status

from app.api.auth_deps import (
    BearerToken,
    CurrentPrincipal,
    device_info,
    get_auth_service,
    limit_by_address,
)
from app.schemas.auth import (
    LoginRequest,
    ProfileResponse,
    RegisterRequest,
    RegisterResponse,
    SessionResponse,
    TokenResponse,
    VerifyPhoneRequest,
)
from app.services.auth import AuthService, TokenPair

__all__ = ["router"]

router = APIRouter(prefix="/api/v1", dependencies=[Depends(limit_by_address)])

Service = Annotated[AuthService, Depends(get_auth_service)]


def _tokens(pair: TokenPair) -> TokenResponse:
    return TokenResponse(access_token=pair.access_token, refresh_token=pair.refresh_token)


@router.post(
    "/auth/register",
    status_code=status.HTTP_201_CREATED,
    response_model=RegisterResponse,
    tags=["auth"],
    summary="Start sign-up: create an unverified account and send an SMS code",
)
async def register(body: RegisterRequest, service: Service) -> RegisterResponse:
    await service.register(body.phone, body.email, body.pin)
    return RegisterResponse()


@router.post(
    "/auth/verify-phone",
    response_model=TokenResponse,
    tags=["auth"],
    summary="Confirm the SMS code, activate the account and sign in",
)
async def verify_phone(
    body: VerifyPhoneRequest, request: Request, service: Service
) -> TokenResponse:
    return _tokens(
        await service.verify_phone(body.phone, body.code, device_info(request, body.device_id))
    )


@router.post("/auth/login", response_model=TokenResponse, tags=["auth"], summary="Log in")
async def login(body: LoginRequest, request: Request, service: Service) -> TokenResponse:
    return _tokens(
        await service.login(body.identifier, body.pin, device_info(request, body.device_id))
    )


@router.post(
    "/auth/refresh",
    response_model=TokenResponse,
    tags=["auth"],
    summary="Exchange a refresh token (Authorization: Bearer) for a new pair",
)
async def refresh(token: BearerToken, service: Service) -> TokenResponse:
    return _tokens(await service.refresh(token))


@router.post(
    "/auth/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["auth"],
    summary="End the current session",
)
async def logout(principal: CurrentPrincipal, service: Service) -> Response:
    await service.logout(principal)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/users/me", response_model=ProfileResponse, tags=["users"], summary="My profile")
async def me(principal: CurrentPrincipal, service: Service) -> ProfileResponse:
    user = await service.me(principal)
    return ProfileResponse(
        user_id=user.id,
        phone=user.phone,
        email=user.email,
        status=user.status,
        created_at=user.created_at,
    )


@router.get(
    "/users/me/sessions",
    response_model=list[SessionResponse],
    tags=["users"],
    summary="My signed-in devices",
)
async def my_sessions(principal: CurrentPrincipal, service: Service) -> list[SessionResponse]:
    return [
        SessionResponse(
            session_id=s.id,
            device_id=s.device_id,
            user_agent=s.user_agent,
            ip_address=s.ip_address,
            created_at=s.created_at,
            last_active_at=s.last_active_at,
            expires_at=s.expires_at,
            current=s.id == principal.session_id,
        )
        for s in await service.sessions(principal)
    ]


@router.delete(
    "/users/me/sessions/{session_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["users"],
    summary="Sign out another device",
)
async def revoke_session(
    session_id: uuid.UUID, principal: CurrentPrincipal, service: Service
) -> Response:
    await service.revoke_session(principal, session_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
