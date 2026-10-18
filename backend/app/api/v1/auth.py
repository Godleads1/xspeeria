"""Auth and current-user endpoints — Milestones AUTH-1 and AUTH-2 (ADR-025 §1.7, ADR-026 §3).

Routes only translate HTTP to the service; every rule lives in ``app.services.auth``.
Every route here passes through the per-address limit (10 per minute, ADR-025 §1.2).
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Request, Response, status

from app.api.auth_deps import (
    BearerToken,
    CurrentPrincipal,
    device_info,
    get_auth_service,
    limit_by_address,
)
from app.domain.auth_rules import STEP_UP_TTL
from app.schemas.auth import (
    ChallengeRequest,
    ChallengeResponse,
    EnrolConfirmRequest,
    EnrolConfirmResponse,
    EnrolStartResponse,
    LoginRequest,
    MfaVerifyRequest,
    OtpCodeRequest,
    ProfileResponse,
    RecoveryCodesResponse,
    RegisterRequest,
    RegisterResponse,
    SessionResponse,
    StepUpRequest,
    StepUpResponse,
    TokenResponse,
    TrustedDeviceResponse,
    VerifyPhoneRequest,
)
from app.services.auth import AuthService, Challenge, SignedIn, TokenPair

__all__ = ["router"]

router = APIRouter(prefix="/api/v1", dependencies=[Depends(limit_by_address)])

Service = Annotated[AuthService, Depends(get_auth_service)]


StepUpToken = Annotated[str | None, Header(alias="X-Step-Up-Token", max_length=128)]


def _tokens(pair: TokenPair, device_token: str | None = None) -> TokenResponse:
    return TokenResponse(
        access_token=pair.access_token,
        refresh_token=pair.refresh_token,
        device_token=device_token,
    )


def _challenge(c: Challenge) -> ChallengeResponse:
    return ChallengeResponse(
        mfa_challenge_id=c.challenge_id, enrolment_required=c.enrolment_required
    )


def _signed_in(result: SignedIn) -> TokenResponse:
    return _tokens(result.tokens, result.device_token)


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
    response_model=ChallengeResponse,
    tags=["auth"],
    summary="Confirm the SMS code; next, add an authenticator (2FA at sign-up, ADR-026)",
)
async def verify_phone(
    body: VerifyPhoneRequest, request: Request, service: Service
) -> ChallengeResponse:
    device = device_info(request, body.device_id)
    return _challenge(await service.verify_phone(body.phone, body.code, device))


@router.post(
    "/auth/login",
    response_model=TokenResponse | ChallengeResponse,
    tags=["auth"],
    summary="Log in: a session on a trusted device, otherwise a 2FA challenge",
)
async def login(
    body: LoginRequest, request: Request, service: Service
) -> TokenResponse | ChallengeResponse:
    device = device_info(request, body.device_id)
    result = await service.login(body.identifier, body.pin, device, body.device_token)
    return _signed_in(result) if isinstance(result, SignedIn) else _challenge(result)


@router.post(
    "/auth/mfa/enrol/start",
    response_model=EnrolStartResponse,
    tags=["auth"],
    summary="Get the authenticator secret for this sign-up (shown once)",
)
async def enrol_start(body: ChallengeRequest, service: Service) -> EnrolStartResponse:
    secret, uri = await service.enrol_start(body.mfa_challenge_id)
    return EnrolStartResponse(secret=secret, otpauth_uri=uri)


@router.post(
    "/auth/mfa/enrol/confirm",
    response_model=EnrolConfirmResponse,
    tags=["auth"],
    summary="Confirm the first authenticator code: 2FA on, signed in, recovery codes",
)
async def enrol_confirm(
    body: EnrolConfirmRequest, request: Request, service: Service
) -> EnrolConfirmResponse:
    device = device_info(request, body.device_id)
    done = await service.enrol_confirm(body.mfa_challenge_id, body.otp_code, device)
    tokens = done.signed_in.tokens
    return EnrolConfirmResponse(
        access_token=tokens.access_token,
        refresh_token=tokens.refresh_token,
        device_token=done.signed_in.device_token,
        recovery_codes=done.recovery_codes,
    )


@router.post(
    "/auth/mfa/verify",
    response_model=TokenResponse,
    tags=["auth"],
    summary="Finish log-in with an authenticator code or a recovery code",
)
async def mfa_verify(body: MfaVerifyRequest, request: Request, service: Service) -> TokenResponse:
    device = device_info(request, body.device_id)
    result = await service.mfa_verify(
        body.mfa_challenge_id,
        device,
        otp_code=body.otp_code,
        recovery_code=body.recovery_code,
    )
    return _signed_in(result)


@router.post(
    "/auth/step-up",
    response_model=StepUpResponse,
    tags=["auth"],
    summary="Approve one sensitive action with a fresh authenticator code (5 minutes)",
)
async def step_up(
    body: StepUpRequest, principal: CurrentPrincipal, service: Service
) -> StepUpResponse:
    token = await service.step_up(principal, body.action, body.otp_code)
    return StepUpResponse(
        step_up_token=token,
        action=body.action,
        expires_in_seconds=int(STEP_UP_TTL.total_seconds()),
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


@router.post(
    "/users/me/recovery-codes",
    response_model=RecoveryCodesResponse,
    tags=["users"],
    summary="Replace all recovery codes (step-up: recovery_codes.regenerate)",
)
async def regenerate_recovery_codes(
    principal: CurrentPrincipal, service: Service, step_up_token: StepUpToken = None
) -> RecoveryCodesResponse:
    codes = await service.regenerate_recovery_codes(principal, step_up_token)
    return RecoveryCodesResponse(recovery_codes=codes)


@router.post(
    "/users/me/mfa/replace/start",
    response_model=EnrolStartResponse,
    tags=["users"],
    summary="Start replacing the authenticator (step-up: mfa.change)",
)
async def replace_start(
    principal: CurrentPrincipal, service: Service, step_up_token: StepUpToken = None
) -> EnrolStartResponse:
    secret, uri = await service.replace_start(principal, step_up_token)
    return EnrolStartResponse(secret=secret, otpauth_uri=uri)


@router.post(
    "/users/me/mfa/replace/confirm",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["users"],
    summary="Confirm the new authenticator's first code",
)
async def replace_confirm(
    body: OtpCodeRequest, principal: CurrentPrincipal, service: Service
) -> Response:
    await service.replace_confirm(principal, body.otp_code)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/users/me/trusted-devices",
    response_model=list[TrustedDeviceResponse],
    tags=["users"],
    summary="Devices that can log in with the PIN only (30 days)",
)
async def trusted_devices(
    principal: CurrentPrincipal, service: Service
) -> list[TrustedDeviceResponse]:
    return [
        TrustedDeviceResponse(
            trusted_device_id=d.id,
            device_id=d.device_id,
            user_agent=d.user_agent,
            created_at=d.created_at,
            expires_at=d.expires_at,
            last_used_at=d.last_used_at,
        )
        for d in await service.trusted_devices(principal)
    ]


@router.delete(
    "/users/me/trusted-devices/{trusted_device_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["users"],
    summary="Stop trusting a device",
)
async def revoke_trusted_device(
    trusted_device_id: uuid.UUID, principal: CurrentPrincipal, service: Service
) -> Response:
    await service.revoke_trusted_device(principal, trusted_device_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
