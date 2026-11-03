"""Auth and current-user endpoints — AUTH-1/AUTH-2 (ADR-025, ADR-026); second check ADR-054.

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
    limit_by_account,
    limit_by_address,
)
from app.domain.auth_rules import STEP_UP_TTL
from app.schemas.auth import (
    BiometricEnableRequest,
    BiometricEnableResponse,
    BiometricUnlockRequest,
    ChangePinRequest,
    CheckCodesRequest,
    CheckResponse,
    DeviceRequest,
    EmailCodeRequest,
    FaceStartResponse,
    LoginRequest,
    PhoneChangeConfirmRequest,
    PhoneChangeStartRequest,
    PinResetConfirmRequest,
    PinResetStartRequest,
    PinResetVerifyRequest,
    ProfileResponse,
    RegisterRequest,
    RegisterResponse,
    SessionResponse,
    StepUpCheckRequest,
    StepUpRequest,
    StepUpResponse,
    TokenResponse,
    TrustedDeviceResponse,
    VerifyPhoneRequest,
)
from app.services.auth import AuthService, CheckStarted, SignedIn, TokenPair

__all__ = ["account_router", "router"]

#: Before sign-in (sign-up, log-in, codes, PIN reset, token refresh, fingerprint unlock):
#: limited per network address, and each account also locks after 5 wrong PINs or checks.
router = APIRouter(prefix="/api/v1", dependencies=[Depends(limit_by_address)])
#: Signed-in account routes: limited per customer (owner, 2026-11-03: many phones in Nigeria
#: share one network address).
account_router = APIRouter(prefix="/api/v1", dependencies=[Depends(limit_by_account)])

Service = Annotated[AuthService, Depends(get_auth_service)]


StepUpToken = Annotated[str | None, Header(alias="X-Step-Up-Token", max_length=128)]


def _tokens(pair: TokenPair, device_token: str | None = None) -> TokenResponse:
    return TokenResponse(
        access_token=pair.access_token,
        refresh_token=pair.refresh_token,
        device_token=device_token,
    )


def _check(c: CheckStarted) -> CheckResponse:
    return CheckResponse.model_validate(
        {
            "check_id": c.check_id,
            "purpose": c.purpose,
            "method": c.method,
            "email_hint": c.email_hint,
            "phone_hint": c.phone_hint,
        }
    )


def _step_up(token: str, action: str) -> StepUpResponse:
    return StepUpResponse(
        step_up_token=token,
        action=action,
        expires_in_seconds=int(STEP_UP_TTL.total_seconds()),
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
    response_model=CheckResponse,
    tags=["auth"],
    summary="Confirm the SMS code; next, the code sent to the email (ADR-054)",
)
async def verify_phone(
    body: VerifyPhoneRequest, request: Request, service: Service
) -> CheckResponse:
    device = device_info(request, body.device_id)
    return _check(await service.verify_phone(body.phone, body.code, device))


@router.post(
    "/auth/login",
    response_model=TokenResponse | CheckResponse,
    tags=["auth"],
    summary="Log in: a session on a trusted phone, otherwise the second check",
)
async def login(
    body: LoginRequest, request: Request, service: Service
) -> TokenResponse | CheckResponse:
    device = device_info(request, body.device_id)
    result = await service.login(body.identifier, body.pin, device, body.device_token)
    return _signed_in(result) if isinstance(result, SignedIn) else _check(result)


@router.post(
    "/auth/checks/{check_id}/codes",
    response_model=TokenResponse,
    tags=["auth"],
    summary="Finish sign-up or log-in with the email code (and the SMS code when asked)",
)
async def check_codes(
    check_id: uuid.UUID, body: CheckCodesRequest, request: Request, service: Service
) -> TokenResponse:
    device = device_info(request, body.device_id)
    return _signed_in(await service.check_codes(check_id, device, body.email_code, body.sms_code))


@router.post(
    "/auth/checks/{check_id}/face",
    response_model=FaceStartResponse,
    tags=["auth"],
    summary="Start the face check for a log-in or a PIN reset (link shown once)",
)
async def face_start(check_id: uuid.UUID, service: Service) -> FaceStartResponse:
    return FaceStartResponse(url=await service.face_start(check_id))


@router.post(
    "/auth/checks/{check_id}/face/result",
    response_model=TokenResponse,
    tags=["auth"],
    summary="Finish log-in with the face check result (409 while it is still running)",
)
async def face_finish(
    check_id: uuid.UUID, body: DeviceRequest, request: Request, service: Service
) -> TokenResponse:
    device = device_info(request, body.device_id)
    return _signed_in(await service.face_finish(check_id, device))


@account_router.post(
    "/auth/step-up",
    response_model=StepUpResponse,
    tags=["auth"],
    summary="Approve one sensitive action with fingerprint/Face ID on a trusted phone",
)
async def step_up(
    body: StepUpRequest, principal: CurrentPrincipal, service: Service
) -> StepUpResponse:
    token = await service.step_up_biometric(principal, body.action, body.unlock_key)
    return _step_up(token, body.action)


@account_router.post(
    "/auth/step-up/checks",
    response_model=CheckResponse,
    tags=["auth"],
    summary="No fingerprint: start a face check (or an email code before the identity check)",
)
async def step_up_check(
    body: StepUpCheckRequest, principal: CurrentPrincipal, service: Service
) -> CheckResponse:
    return _check(await service.step_up_check(principal, body.action))


@account_router.post(
    "/auth/step-up/checks/{check_id}/code",
    response_model=StepUpResponse,
    tags=["auth"],
    summary="Approve the action with the email code",
)
async def step_up_code(
    check_id: uuid.UUID, body: EmailCodeRequest, principal: CurrentPrincipal, service: Service
) -> StepUpResponse:
    token, action = await service.step_up_codes(principal, check_id, body.email_code)
    return _step_up(token, action)


@account_router.post(
    "/auth/step-up/checks/{check_id}/face",
    response_model=FaceStartResponse,
    tags=["auth"],
    summary="Start the face check for one action (link shown once)",
)
async def step_up_face_start(
    check_id: uuid.UUID, principal: CurrentPrincipal, service: Service
) -> FaceStartResponse:
    return FaceStartResponse(url=await service.face_start(check_id, principal))


@account_router.post(
    "/auth/step-up/checks/{check_id}/face/result",
    response_model=StepUpResponse,
    tags=["auth"],
    summary="Approve the action with the face check result (409 while it is still running)",
)
async def step_up_face_finish(
    check_id: uuid.UUID, principal: CurrentPrincipal, service: Service
) -> StepUpResponse:
    token, action = await service.step_up_face(principal, check_id)
    return _step_up(token, action)


@router.post(
    "/auth/refresh",
    response_model=TokenResponse,
    tags=["auth"],
    summary="Exchange a refresh token (Authorization: Bearer) for a new pair",
)
async def refresh(token: BearerToken, service: Service) -> TokenResponse:
    return _tokens(await service.refresh(token))


@account_router.post(
    "/auth/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["auth"],
    summary="End the current session",
)
async def logout(principal: CurrentPrincipal, service: Service) -> Response:
    await service.logout(principal)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@account_router.get(
    "/users/me", response_model=ProfileResponse, tags=["users"], summary="My profile"
)
async def me(principal: CurrentPrincipal, service: Service) -> ProfileResponse:
    user, identity = await service.me(principal)
    return ProfileResponse.model_validate(
        {
            "user_id": user.id,
            "phone": user.phone,
            "email": user.email,
            "status": user.status,
            "created_at": user.created_at,
            "legal_name": identity.legal_name if identity else None,
            "date_of_birth": identity.date_of_birth if identity else None,
            "gender": identity.gender if identity else None,
        }
    )


@account_router.get(
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


@account_router.delete(
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


@account_router.get(
    "/users/me/trusted-devices",
    response_model=list[TrustedDeviceResponse],
    tags=["users"],
    summary="Phones that can log in with the PIN only (30 days)",
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


@account_router.delete(
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


# --- PIN change and reset (ADR-046) ----------------------------------------------------------


@account_router.post(
    "/users/me/pin",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["users"],
    summary="Change my PIN (step-up: pin.change); other devices are signed out",
)
async def change_pin(
    body: ChangePinRequest,
    principal: CurrentPrincipal,
    service: Service,
    step_up_token: StepUpToken = None,
) -> Response:
    await service.change_pin(principal, body.current_pin, body.new_pin, step_up_token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/auth/pin-reset/start",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Forgot PIN: send a reset code by SMS (same answer for any number)",
)
async def pin_reset_start(body: PinResetStartRequest, service: Service) -> dict[str, str]:
    await service.pin_reset_start(body.phone)
    return {"status": "code_sent_if_account_exists"}


@router.post(
    "/auth/pin-reset/verify",
    response_model=CheckResponse,
    summary="Forgot PIN: the SMS code; next, a face check or an email code (ADR-054)",
)
async def pin_reset_verify(body: PinResetVerifyRequest, service: Service) -> CheckResponse:
    return _check(await service.pin_reset_verify(body.phone, body.code))


@router.post(
    "/auth/pin-reset/confirm",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Forgot PIN: the email code (or face check result) and the new PIN",
)
async def pin_reset_confirm(body: PinResetConfirmRequest, service: Service) -> Response:
    await service.pin_reset_confirm(body.check_id, body.new_pin, body.email_code)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- phone number change (ADR-047) -----------------------------------------------------------


@account_router.post(
    "/users/me/phone/start",
    status_code=status.HTTP_202_ACCEPTED,
    tags=["users"],
    summary="Change my phone: text a code to the new number (step-up: contact.change)",
)
async def phone_change_start(
    body: PhoneChangeStartRequest,
    principal: CurrentPrincipal,
    service: Service,
    step_up_token: StepUpToken = None,
) -> dict[str, str]:
    await service.phone_change_start(principal, body.new_phone, step_up_token)
    return {"status": "code_sent"}


@account_router.post(
    "/users/me/phone/confirm",
    tags=["users"],
    summary="Change my phone: the code from the new number applies the change",
)
async def phone_change_confirm(
    body: PhoneChangeConfirmRequest, principal: CurrentPrincipal, service: Service
) -> dict[str, str]:
    phone = await service.phone_change_confirm(principal, body.new_phone, body.code)
    return {"phone": phone}


# --- biometric unlock after the idle lock (ADR-048) ------------------------------------------


@account_router.post(
    "/auth/biometric",
    response_model=BiometricEnableResponse,
    tags=["auth"],
    summary="Turn on Face ID/fingerprint unlock for this session (trusted devices only)",
)
async def biometric_enable(
    body: BiometricEnableRequest,
    principal: CurrentPrincipal,
    service: Service,
    step_up_token: StepUpToken = None,
) -> BiometricEnableResponse:
    return BiometricEnableResponse(
        unlock_key=await service.biometric_enable(principal, body.device_token, step_up_token)
    )


@account_router.delete(
    "/auth/biometric",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["auth"],
    summary="Turn off Face ID/fingerprint unlock for this session",
)
async def biometric_disable(principal: CurrentPrincipal, service: Service) -> Response:
    await service.biometric_disable(principal)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/auth/biometric/unlock",
    response_model=TokenResponse,
    tags=["auth"],
    summary="Resume a session after the idle lock with the key Face ID/fingerprint released",
)
async def biometric_unlock(body: BiometricUnlockRequest, service: Service) -> TokenResponse:
    return _tokens(await service.biometric_unlock(body.refresh_token, body.unlock_key))
