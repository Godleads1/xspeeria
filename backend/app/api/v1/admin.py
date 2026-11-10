"""Admin console API: staff sign-in, staff, roles and the audit log (ADR-051 A-1, ADR-060).

Every route here:

* needs the ``X-Xspeeria-Admin: 1`` header. A browser can't add a custom header to a
  cross-site request without a CORS preflight, and no origin is allowed to send admin
  cookies cross-site, so this (with SameSite=Strict cookies) blocks cross-site request
  forgery;
* except the sign-in steps, needs a live staff session cookie (``StaffPrincipal``) and checks
  the permission for what it does in the service, from the database, on every call.

The session cookie is httpOnly, SameSite=Strict, limited to ``/api/v1/admin`` and Secure
everywhere except a developer's own computer (``APP_ENV=local``).
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Cookie, Depends, Header, Path, Query, Request, Response, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth_deps import client_address, get_auth_runtime, get_db_session, limit_by_address
from app.api.deps import get_app_settings
from app.core.config import Settings
from app.core.exceptions import AppError
from app.services.activity_admin import ActivityAdminService
from app.services.adverts import AdvertService
from app.services.auth import AuthRuntime
from app.services.currency_switch import CurrencySwitchService
from app.services.customers import CustomerAction, CustomerAdminService
from app.services.dashboard import DashboardService, Period
from app.services.deal_pause import DealPauseService
from app.services.dispute_admin import DisputeAdminService
from app.services.fraud import FraudService
from app.services.help import HelpService
from app.services.kyc_review import KycReviewService
from app.services.ops_alerts import OpsAlertService
from app.services.outages import OutageService
from app.services.reversals import ReversalService
from app.services.staff import RequestInfo, StaffPrincipal, StaffService, unauthorized
from app.services.staff_work import StaffWorkService
from app.services.system_health import SystemHealthService

__all__ = ["COOKIE", "router"]

COOKIE = "xsp_admin_session"
COOKIE_PATH = "/api/v1/admin"


async def admin_header(
    x_xspeeria_admin: Annotated[str | None, Header()] = None,
) -> None:
    if x_xspeeria_admin != "1":
        raise AppError("AUTH_403_FORBIDDEN", "This request is not allowed.", status_code=403)


router = APIRouter(prefix="/api/v1/admin", tags=["admin"], dependencies=[Depends(admin_header)])


def _info(request: Request) -> RequestInfo:
    agent = request.headers.get("user-agent")
    return RequestInfo(
        ip_address=client_address(request)[:45], user_agent=agent[:256] if agent else None
    )


Info = Annotated[RequestInfo, Depends(_info)]


async def get_staff_service(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    runtime: Annotated[AuthRuntime, Depends(get_auth_runtime)],
) -> StaffService:
    return StaffService(db, runtime)


Service = Annotated[StaffService, Depends(get_staff_service)]


async def current_staff(
    request: Request,
    service: Service,
    session: Annotated[str | None, Cookie(alias=COOKIE)] = None,
) -> StaffPrincipal:
    principal = await current_staff_key_setup(request, service, session)
    if principal.key_setup_only:
        # ADR-081: this session may only register a security key.
        raise AppError(
            "ADMIN_403_KEY_SETUP_REQUIRED",
            "Add your security key before using the console.",
            status_code=status.HTTP_403_FORBIDDEN,
        )
    return principal


async def current_staff_key_setup(
    request: Request,
    service: Service,
    session: Annotated[str | None, Cookie(alias=COOKIE)] = None,
) -> StaffPrincipal:
    """Any signed-in staff session, including one that may only register a security key
    (ADR-081). Used by: who am I, log out, and the security-key routes."""
    if session is None:
        raise unauthorized()
    principal = await service.authenticate(session)
    request.state.user_id = f"staff:{principal.staff_id}"
    return principal


Staff = Annotated[StaffPrincipal, Depends(current_staff)]
KeySetupStaff = Annotated[StaffPrincipal, Depends(current_staff_key_setup)]


async def current_staff_passive(
    request: Request,
    service: Service,
    session: Annotated[str | None, Cookie(alias=COOKIE)] = None,
) -> StaffPrincipal:
    """Like ``current_staff`` but does not count as activity: the bell checks in the background
    and must not keep an idle session from ending (ADR-070)."""
    if session is None:
        raise unauthorized()
    principal = await service.authenticate(session, touch=False)
    request.state.user_id = f"staff:{principal.staff_id}"
    if principal.key_setup_only:
        raise AppError(
            "ADMIN_403_KEY_SETUP_REQUIRED",
            "Add your security key before using the console.",
            status_code=status.HTTP_403_FORBIDDEN,
        )
    return principal


PassiveStaff = Annotated[StaffPrincipal, Depends(current_staff_passive)]


def _set_cookie(response: Response, token: str, settings: Settings) -> None:
    response.set_cookie(
        COOKIE,
        token,
        httponly=True,
        secure=settings.app_env != "local",
        samesite="strict",
        path=COOKIE_PATH,
    )


def _clear_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(
        COOKIE,
        httponly=True,
        secure=settings.app_env != "local",
        samesite="strict",
        path=COOKIE_PATH,
    )


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


# --- sign-in -----------------------------------------------------------------------------------


class LoginRequest(_Strict):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=256)


class LoginResponse(BaseModel):
    challenge_id: uuid.UUID
    #: Masked, e.g. ``a***@xspeeria.com``.
    email: str


class CodeRequest(_Strict):
    challenge_id: uuid.UUID
    code: str = Field(pattern=r"^[0-9]{6}$")


class StaffView(BaseModel):
    id: uuid.UUID
    email: str
    name: str
    #: International form; null for accounts made before phones were required.
    phone: str | None
    has_photo: bool
    role_id: uuid.UUID
    role: str
    status: str
    password_set: bool
    last_login_at: Any
    created_at: Any


class MeView(StaffView):
    permissions: list[str]
    #: ADR-081: signed in only to add a security key.
    key_setup_only: bool = False


@router.post(
    "/auth/login",
    response_model=LoginResponse,
    dependencies=[Depends(limit_by_address)],
    summary="Staff log-in, step 1: email and password (sends an email code)",
)
async def login(body: LoginRequest, service: Service, info: Info) -> Any:
    return await service.login(body.email, body.password, info)


class KeyStepView(BaseModel):
    """ADR-081: a Super Admin with a security key touches it next (no cookie yet)."""

    key_required: bool
    key_challenge_id: uuid.UUID
    #: WebAuthn ``PublicKeyCredentialRequestOptions`` (base64url fields), for the browser.
    options: dict[str, Any]


@router.post(
    "/auth/verify",
    response_model=MeView | KeyStepView,
    dependencies=[Depends(limit_by_address)],
    summary=(
        "Staff log-in, step 2: the email code (sets the session cookie, or asks a Super Admin "
        "for their security key)"
    ),
)
async def verify(
    body: CodeRequest,
    response: Response,
    service: Service,
    info: Info,
    settings: Annotated[Settings, Depends(get_app_settings)],
) -> Any:
    token, me = await service.verify(body.challenge_id, body.code, info)
    if token is not None:
        _set_cookie(response, token, settings)
    return me


class KeyAnswer(_Strict):
    key_challenge_id: uuid.UUID
    #: The browser's ``PublicKeyCredential`` as JSON (base64url fields). Checked by py_webauthn.
    credential: dict[str, Any]


@router.post(
    "/auth/key",
    response_model=MeView,
    dependencies=[Depends(limit_by_address)],
    summary="Staff log-in, step 3 for a Super Admin: the security key (sets the session cookie)",
)
async def verify_key(
    body: KeyAnswer,
    response: Response,
    service: Service,
    info: Info,
    settings: Annotated[Settings, Depends(get_app_settings)],
) -> Any:
    token, me = await service.finish_key_login(body.key_challenge_id, body.credential, info)
    _set_cookie(response, token, settings)
    return me


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT, summary="Log out")
async def logout(
    staff: KeySetupStaff,
    response: Response,
    service: Service,
    info: Info,
    settings: Annotated[Settings, Depends(get_app_settings)],
) -> Response:
    await service.logout(staff, info)
    _clear_cookie(response, settings)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


class ForgotRequest(_Strict):
    email: str = Field(min_length=3, max_length=254)


class ForgotResponse(BaseModel):
    reset_id: uuid.UUID


@router.post(
    "/auth/forgot-password",
    response_model=ForgotResponse,
    dependencies=[Depends(limit_by_address)],
    summary="Email a code to set a new password (same answer whether or not the email exists)",
)
async def forgot(body: ForgotRequest, service: Service, info: Info) -> Any:
    return await service.forgot(body.email, info)


class ResetRequest(_Strict):
    reset_id: uuid.UUID
    code: str = Field(pattern=r"^[0-9]{6}$")
    new_password: str = Field(min_length=1, max_length=256)


@router.post(
    "/auth/reset-password",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(limit_by_address)],
    summary="Set a new password with the emailed code (also for invited staff)",
)
async def reset(body: ResetRequest, service: Service, info: Info) -> Response:
    await service.reset(body.reset_id, body.code, body.new_password, info)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- me ----------------------------------------------------------------------------------------


@router.get("/me", response_model=MeView, summary="Who I am and what I may do")
async def me(staff: KeySetupStaff, service: Service) -> Any:
    return {**await service.me(staff), "key_setup_only": staff.key_setup_only}


# --- security keys (ADR-081) -------------------------------------------------------------------


class KeyView(BaseModel):
    id: uuid.UUID
    name: str
    created_at: Any
    last_used_at: Any


class KeyList(BaseModel):
    keys: list[KeyView]
    #: Every Super Admin must use a key (SUPER_ADMIN_KEY_REQUIRED).
    required: bool
    #: Only Super Admins add keys.
    can_add: bool


class KeyOptions(BaseModel):
    key_challenge_id: uuid.UUID
    #: WebAuthn ``PublicKeyCredentialCreationOptions`` (base64url fields), for the browser.
    options: dict[str, Any]


class AddKey(_Strict):
    key_challenge_id: uuid.UUID
    name: str = Field(min_length=1, max_length=60)
    credential: dict[str, Any]


class RemoveStaffKeys(_Strict):
    reason: str = Field(min_length=5, max_length=500)


@router.get("/me/security-keys", response_model=KeyList, summary="My security keys")
async def my_keys(staff: KeySetupStaff, service: Service) -> Any:
    return await service.list_keys(staff)


@router.post(
    "/me/security-keys/options",
    response_model=KeyOptions,
    summary="Start adding a security key (Super Admin)",
)
async def add_key_options(staff: KeySetupStaff, service: Service) -> Any:
    return await service.begin_add_key(staff)


@router.post(
    "/me/security-keys",
    response_model=KeyView,
    status_code=status.HTTP_201_CREATED,
    summary="Finish adding a security key (Super Admin)",
)
async def add_key(body: AddKey, staff: KeySetupStaff, service: Service, info: Info) -> Any:
    return await service.finish_add_key(
        staff, body.key_challenge_id, body.name, body.credential, info
    )


@router.delete(
    "/me/security-keys/{key_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove one of my security keys",
)
async def remove_key(key_id: uuid.UUID, staff: Staff, service: Service, info: Info) -> Response:
    await service.remove_my_key(staff, key_id, info)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/staff/{staff_id}/security-keys/remove",
    summary="Remove another staff member's security keys, e.g. a lost key (Super Admin)",
)
async def remove_staff_keys(
    staff_id: uuid.UUID, body: RemoveStaffKeys, staff: Staff, service: Service, info: Info
) -> Any:
    return await service.remove_staff_keys(staff, staff_id, body.reason, info)


class PasswordChange(_Strict):
    current_password: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=1, max_length=256)


@router.post(
    "/me/password",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Change my password (logs out my other sessions)",
)
async def change_password(
    body: PasswordChange, staff: Staff, service: Service, info: Info
) -> Response:
    await service.change_password(staff, body.current_password, body.new_password, info)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


class UpdateMe(_Strict):
    """Only name and phone; anything else (email, role, status) is refused with 422."""

    name: str | None = Field(default=None, min_length=2, max_length=80)
    phone: str | None = Field(default=None, min_length=8, max_length=20)


@router.patch("/me", response_model=MeView, summary="Change my own name or phone")
async def update_me(body: UpdateMe, staff: Staff, service: Service, info: Info) -> Any:
    return await service.update_me(staff, body.model_dump(exclude_none=True), info)


# --- staff -------------------------------------------------------------------------------------


class InviteStaff(_Strict):
    email: str = Field(min_length=3, max_length=254)
    name: str = Field(min_length=2, max_length=80)
    #: Required (owner decision 2026-10-26); international form, e.g. +2348031234567.
    phone: str = Field(min_length=8, max_length=20)
    role_id: uuid.UUID


class InvitedStaff(StaffView):
    #: The code sent to the new staff member's email works with this id at
    #: ``/auth/reset-password`` to set their first password.
    invite_id: uuid.UUID


class UpdateStaff(_Strict):
    name: str | None = Field(default=None, min_length=2, max_length=80)
    phone: str | None = Field(default=None, min_length=8, max_length=20)
    role_id: uuid.UUID | None = None
    status: Literal["active", "disabled"] | None = None


@router.get("/staff", response_model=list[StaffView], summary="All staff (staff.read)")
async def list_staff(staff: Staff, service: Service) -> Any:
    return await service.list_staff(staff)


@router.post(
    "/staff",
    response_model=InvitedStaff,
    status_code=status.HTTP_201_CREATED,
    summary="Invite a staff member (staff.create)",
)
async def invite_staff(body: InviteStaff, staff: Staff, service: Service, info: Info) -> Any:
    return await service.create_staff(
        staff, body.email, body.name, body.role_id, info, phone_in=body.phone
    )


@router.patch(
    "/staff/{staff_id}",
    response_model=StaffView,
    summary="Change a staff member's name, role or status (staff.update)",
)
async def update_staff(
    staff_id: uuid.UUID, body: UpdateStaff, staff: Staff, service: Service, info: Info
) -> Any:
    changes = body.model_dump(exclude_none=True)
    return await service.update_staff(staff, staff_id, changes, info)


# --- photos (ADR-049, ADR-060) -----------------------------------------------------------------


class PhotoUpload(_Strict):
    #: JPEG, PNG or WebP, base64; at most 5 MB once decoded (checked by the service).
    photo: str = Field(min_length=8, max_length=7_000_000)


@router.put(
    "/staff/{staff_id}/photo",
    response_model=StaffView,
    summary="Set a staff photo (your own, or staff.update within your permissions)",
)
async def set_photo(
    staff_id: uuid.UUID, body: PhotoUpload, staff: Staff, service: Service, info: Info
) -> Any:
    return await service.set_photo(staff, staff_id, body.photo, info)


@router.delete(
    "/staff/{staff_id}/photo",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove a staff photo",
)
async def remove_photo(staff_id: uuid.UUID, staff: Staff, service: Service, info: Info) -> Response:
    await service.remove_photo(staff, staff_id, info)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/staff/{staff_id}/photo", summary="A staff photo (staff.read, or your own)")
async def get_photo(staff_id: uuid.UUID, staff: Staff, service: Service) -> Response:
    found = await service.photo(staff, staff_id)
    if found is None:
        return Response(status_code=status.HTTP_404_NOT_FOUND)
    data, content_type = found
    return Response(
        content=data,
        media_type=content_type,
        headers={
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'; sandbox",
            "Content-Disposition": "inline",
        },
    )


# --- roles -------------------------------------------------------------------------------------


class RoleView(BaseModel):
    id: uuid.UUID
    name: str
    description: str
    permissions: list[str]
    builtin: bool
    editable: bool
    staff_count: int


class CreateRole(_Strict):
    name: str = Field(min_length=3, max_length=40)
    description: str = Field(default="", max_length=200)
    permissions: list[str] = Field(max_length=60)


class UpdateRole(_Strict):
    description: str | None = Field(default=None, max_length=200)
    permissions: list[str] | None = Field(default=None, max_length=60)


@router.get("/roles", response_model=list[RoleView], summary="All roles (roles.read)")
async def list_roles(staff: Staff, service: Service) -> Any:
    return await service.list_roles(staff)


@router.post(
    "/roles",
    response_model=RoleView,
    status_code=status.HTTP_201_CREATED,
    summary="Create a role (roles.create)",
)
async def create_role(body: CreateRole, staff: Staff, service: Service, info: Info) -> Any:
    return await service.create_role(staff, body.name, body.description, body.permissions, info)


@router.patch("/roles/{role_id}", response_model=RoleView, summary="Edit a role (roles.update)")
async def update_role(
    role_id: uuid.UUID, body: UpdateRole, staff: Staff, service: Service, info: Info
) -> Any:
    return await service.update_role(staff, role_id, body.description, body.permissions, info)


@router.delete(
    "/roles/{role_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an unused role (roles.delete)",
)
async def delete_role(role_id: uuid.UUID, staff: Staff, service: Service, info: Info) -> Response:
    await service.delete_role(staff, role_id, info)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- audit log ---------------------------------------------------------------------------------


class AuditItem(BaseModel):
    id: int
    at: Any
    staff_id: uuid.UUID | None
    staff_email: str | None
    action: str
    target_type: str | None
    target_id: str | None
    detail: dict[str, Any] | None
    ip_address: str | None


class AuditPage(BaseModel):
    items: list[AuditItem]
    #: Pass as ``before`` for the next (older) page; null at the end.
    next_before: int | None


@router.get("/audit-log", response_model=AuditPage, summary="Who did what (audit.read)")
async def audit_log(
    staff: Staff,
    service: Service,
    staff_id: Annotated[uuid.UUID | None, Query()] = None,
    action: Annotated[str | None, Query(max_length=48, pattern=r"^[a-z_]+$")] = None,
    before: Annotated[int | None, Query(ge=1)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> Any:
    return await service.audit(staff, staff_id=staff_id, action=action, before=before, limit=limit)


# --- analytics dashboard (ADR-061) ---------------------------------------------------------------


@router.get("/dashboard", summary="Analytics Dashboard figures (dashboard.read)")
async def dashboard(
    staff: Staff,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    runtime: Annotated[AuthRuntime, Depends(get_auth_runtime)],
    period: Annotated[Period, Query()] = "month",
    month: Annotated[str | None, Query(pattern=r"^20[0-9]{2}-(0[1-9]|1[0-2])$")] = None,
) -> Any:
    if period == "custom" and month is None:
        raise AppError(
            "VAL_422_MISSING_FIELD", "Choose a month.", status_code=422, details={"field": "month"}
        )
    try:
        return await DashboardService(db).figures(staff, period, runtime.clock(), month)
    except ValueError:
        raise AppError(
            "VAL_422_MISSING_FIELD",
            "Choose a month that has started.",
            status_code=422,
            details={"field": "month"},
        ) from None


# --- customers (ADR-062) -------------------------------------------------------------------------


class CustomerChange(_Strict):
    reason: str = Field(min_length=5, max_length=300)


@router.get("/users", summary="Customers (users.read)")
async def list_customers(
    staff: Staff,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    runtime: Annotated[AuthRuntime, Depends(get_auth_runtime)],
    q: Annotated[str | None, Query(max_length=80)] = None,
    status_in: Annotated[
        Literal["active", "suspended", "closed"] | None, Query(alias="status")
    ] = None,
    offset: Annotated[int, Query(ge=0, le=100_000)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> Any:
    return await CustomerAdminService(db, runtime.clock).list(
        staff, search=q or None, status_in=status_in, offset=offset, limit=limit
    )


@router.get("/users/stats", summary="Customer counts (users.read)")
async def customer_stats(
    staff: Staff,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    runtime: Annotated[AuthRuntime, Depends(get_auth_runtime)],
) -> Any:
    return await CustomerAdminService(db, runtime.clock).stats(staff)


@router.post(
    "/users/{user_id}/identity-redo",
    summary="Ask for a new identity check at the next new-phone log-in (kyc.update; ADR-104)",
)
async def request_identity_redo(
    user_id: uuid.UUID,
    body: CustomerChange,
    staff: Staff,
    info: Info,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    runtime: Annotated[AuthRuntime, Depends(get_auth_runtime)],
) -> Any:
    return await CustomerAdminService(db, runtime.clock).request_identity_redo(
        staff, user_id, body.reason, info
    )


@router.post(
    "/users/{user_id}/identity-redo/cancel",
    summary="Back to the face check (kyc.update; ADR-104)",
)
async def cancel_identity_redo(
    user_id: uuid.UUID,
    body: CustomerChange,
    staff: Staff,
    info: Info,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    runtime: Annotated[AuthRuntime, Depends(get_auth_runtime)],
) -> Any:
    return await CustomerAdminService(db, runtime.clock).cancel_identity_redo(
        staff, user_id, body.reason, info
    )


@router.post(
    "/users/{user_id}/{action}",
    summary="Suspend, reactivate or close a customer (Super Admin only)",
)
async def change_customer(
    user_id: uuid.UUID,
    action: CustomerAction,
    body: CustomerChange,
    staff: Staff,
    info: Info,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    runtime: Annotated[AuthRuntime, Depends(get_auth_runtime)],
) -> Any:
    return await CustomerAdminService(db, runtime.clock).change(
        staff, user_id, action, body.reason, info
    )


# --- disputes (ADR-063) ------------------------------------------------------------------------


async def get_dispute_admin(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    runtime: Annotated[AuthRuntime, Depends(get_auth_runtime)],
) -> DisputeAdminService:
    return DisputeAdminService(db, runtime.clock)


Disputes = Annotated[DisputeAdminService, Depends(get_dispute_admin)]
_CODE = r"^[a-z][a-z0-9_]{1,31}$"


class CategoryBody(_Strict):
    name: str = Field(min_length=2, max_length=60)
    description: str = Field(default="", max_length=200)
    active: bool = True


class StaffDisputeBody(_Strict):
    user_id: uuid.UUID
    #: The deal, when the problem is about one (pauses its escrow, as from the app).
    transaction_id: uuid.UUID | None = None
    category: str = Field(pattern=_CODE)
    description: str = Field(min_length=1, max_length=2000)
    desired_resolution: str | None = Field(default=None, min_length=1, max_length=1000)
    priority: Literal["low", "medium", "high"] = "medium"


class ReplyBody(_Strict):
    message: str = Field(min_length=1, max_length=2000)


class AssignBody(_Strict):
    staff_id: uuid.UUID | None


class EscalateBody(_Strict):
    reason: str = Field(min_length=5, max_length=300)


class ResolveBody(_Strict):
    outcome: Literal["favor_initiator", "favor_counterparty", "split", "no_fault"]
    note: str | None = Field(default=None, max_length=1000)


@router.get("/dispute-categories", summary="Dispute categories (disputes.read)")
async def dispute_categories(staff: Staff, service: Disputes) -> Any:
    return await service.categories(staff)


@router.post(
    "/dispute-categories",
    status_code=status.HTTP_201_CREATED,
    summary="Add a dispute category (disputes.approve)",
)
async def add_dispute_category(
    body: CategoryBody, staff: Staff, service: Disputes, info: Info
) -> Any:
    return await service.save_category(
        staff, info, code=None, name=body.name, description=body.description, active=body.active
    )


@router.put("/dispute-categories/{code}", summary="Change a dispute category (disputes.approve)")
async def change_dispute_category(
    code: Annotated[str, Path(pattern=_CODE)],
    body: CategoryBody,
    staff: Staff,
    service: Disputes,
    info: Info,
) -> Any:
    return await service.save_category(
        staff, info, code=code, name=body.name, description=body.description, active=body.active
    )


@router.get("/disputes", summary="Disputes and support cases (disputes.read)")
async def list_disputes(
    staff: Staff,
    service: Disputes,
    q: Annotated[str | None, Query(max_length=80)] = None,
    status_in: Annotated[
        Literal["open", "under_review", "resolved"] | None, Query(alias="status")
    ] = None,
    mine: bool = False,
    offset: Annotated[int, Query(ge=0, le=100_000)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> Any:
    return await service.list(
        staff, search=q or None, status_in=status_in, mine=mine, offset=offset, limit=limit
    )


@router.get("/disputes/stats", summary="Dispute counts (disputes.read)")
async def dispute_stats(staff: Staff, service: Disputes) -> Any:
    return await service.stats(staff)


@router.post(
    "/disputes",
    status_code=status.HTTP_201_CREATED,
    summary="Open a case for a customer (disputes.create)",
)
async def staff_open_dispute(
    body: StaffDisputeBody, staff: Staff, service: Disputes, info: Info
) -> Any:
    return await service.open_for_customer(
        staff,
        info,
        user_id=body.user_id,
        transaction_id=body.transaction_id,
        category=body.category,
        description=body.description,
        desired_resolution=body.desired_resolution,
        priority=body.priority,
    )


@router.get("/disputes/{dispute_id}", summary="One case with both parties' words (disputes.read)")
async def get_dispute(dispute_id: uuid.UUID, staff: Staff, service: Disputes) -> Any:
    return await service.get(staff, dispute_id)


@router.post(
    "/disputes/{dispute_id}/messages",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Reply to the customer (disputes.update)",
)
async def reply_dispute(
    dispute_id: uuid.UUID, body: ReplyBody, staff: Staff, service: Disputes, info: Info
) -> Response:
    await service.reply(staff, info, dispute_id, body.message.strip())
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _help(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    runtime: Annotated[AuthRuntime, Depends(get_auth_runtime)],
) -> HelpService:
    return HelpService(db, runtime.clock)


Help = Annotated[HelpService, Depends(_help)]


@router.get("/help-requests", summary="Help requests from people who can't log in (disputes.read)")
async def list_help_requests(
    staff: Staff,
    service: Help,
    status_filter: Literal["open", "closed"] | None = Query(default=None, alias="status"),
) -> dict[str, Any]:
    return {"items": await service.list_requests(staff, status_filter)}


@router.get("/help-requests/{request_id}", summary="One help request (disputes.read)")
async def get_help_request(request_id: uuid.UUID, staff: Staff, service: Help) -> dict[str, Any]:
    return await service.detail(staff, request_id)


@router.post(
    "/help-requests/{request_id}/messages",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Reply to a help request (disputes.update)",
)
async def reply_help_request(
    request_id: uuid.UUID, body: ReplyBody, staff: Staff, service: Help, info: Info
) -> Response:
    await service.staff_reply(staff, info, request_id, body.message.strip())
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/help-requests/{request_id}/close",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Close a help request (disputes.update)",
)
async def close_help_request(
    request_id: uuid.UUID, staff: Staff, service: Help, info: Info
) -> Response:
    await service.close(staff, info, request_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- ADR-106: currency on/off switches (Super Admin) ------------------------------------


def _switches(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    runtime: Annotated[AuthRuntime, Depends(get_auth_runtime)],
    settings: Annotated[Settings, Depends(get_app_settings)],
) -> CurrencySwitchService:
    return CurrencySwitchService(db, runtime.clock, settings.china_enabled)


Switches = Annotated[CurrencySwitchService, Depends(_switches)]


class SwitchBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: bool
    reason: str = Field(min_length=1, max_length=300)


@router.get("/currencies", summary="Built-in currencies and whether each is on (any staff)")
async def list_currencies(staff: Staff, service: Switches) -> dict[str, Any]:
    return {"items": await service.list(staff)}


@router.post(
    "/currencies/{currency}",
    summary="Switch a currency on or off (Super Admin; ADR-106)",
)
async def switch_currency(
    currency: Annotated[str, Path(pattern=r"^[A-Za-z]{3}$")],
    body: SwitchBody,
    staff: Staff,
    service: Switches,
    info: Info,
) -> dict[str, Any]:
    return await service.set(staff, info, currency, body.enabled, body.reason)


@router.post(
    "/disputes/{dispute_id}/start",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Mark in progress (disputes.update)",
)
async def start_dispute(
    dispute_id: uuid.UUID, staff: Staff, service: Disputes, info: Info
) -> Response:
    await service.start(staff, info, dispute_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/disputes/{dispute_id}/assign",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Assign or unassign (disputes.update)",
)
async def assign_dispute(
    dispute_id: uuid.UUID, body: AssignBody, staff: Staff, service: Disputes, info: Info
) -> Response:
    await service.assign(staff, info, dispute_id, body.staff_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/disputes/{dispute_id}/escalate",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Escalate with a reason (disputes.update)",
)
async def escalate_dispute(
    dispute_id: uuid.UUID, body: EscalateBody, staff: Staff, service: Disputes, info: Info
) -> Response:
    await service.escalate(staff, info, dispute_id, " ".join(body.reason.split()))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/disputes/{dispute_id}/resolve",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Close with an outcome; the deal's escrow continues (disputes.approve)",
)
async def resolve_dispute(
    dispute_id: uuid.UUID, body: ResolveBody, staff: Staff, service: Disputes, info: Info
) -> Response:
    note = " ".join(body.note.split()) if body.note else None
    await service.resolve(staff, info, dispute_id, body.outcome, note or None)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- reversals (ADR-065) -----------------------------------------------------------------------


async def get_reversals(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    runtime: Annotated[AuthRuntime, Depends(get_auth_runtime)],
) -> ReversalService:
    return ReversalService(db, runtime.clock)


Reversals = Annotated[ReversalService, Depends(get_reversals)]


class RefundBody(_Strict):
    reason: str = Field(min_length=3, max_length=500)


class ApproveBody(_Strict):
    note: str | None = Field(default=None, max_length=500)


class RejectBody(_Strict):
    note: str = Field(min_length=3, max_length=500)


@router.post(
    "/disputes/{dispute_id}/refund",
    status_code=status.HTTP_201_CREATED,
    summary="Ask for the deal's escrow to go back to whoever paid it in (reversals.create)",
)
async def request_refund(
    dispute_id: uuid.UUID, body: RefundBody, staff: Staff, service: Reversals, info: Info
) -> Any:
    return await service.request(staff, info, dispute_id, " ".join(body.reason.split()))


@router.get("/reversals", summary="Reversal requests (reversals.read)")
async def list_reversals(
    staff: Staff,
    service: Reversals,
    q: Annotated[str | None, Query(max_length=80)] = None,
    status_in: Annotated[
        Literal["pending", "approved", "rejected"] | None, Query(alias="status")
    ] = None,
    offset: Annotated[int, Query(ge=0, le=100_000)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> Any:
    return await service.list(
        staff, search=q or None, status_in=status_in, offset=offset, limit=limit
    )


@router.get("/reversals/stats", summary="Reversal counts (reversals.read)")
async def reversal_stats(staff: Staff, service: Reversals) -> Any:
    return await service.stats(staff)


@router.get("/reversals/{reversal_id}", summary="One reversal request (reversals.read)")
async def get_reversal(reversal_id: uuid.UUID, staff: Staff, service: Reversals) -> Any:
    return await service.get(staff, reversal_id)


@router.post(
    "/reversals/{reversal_id}/approve",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Approve: the escrow goes back; never your own request (reversals.approve)",
)
async def approve_reversal(
    reversal_id: uuid.UUID, body: ApproveBody, staff: Staff, service: Reversals, info: Info
) -> Response:
    note = " ".join(body.note.split()) if body.note else None
    await service.approve(staff, info, reversal_id, note or None)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/reversals/{reversal_id}/reject",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Reject with a reason; never your own request (reversals.approve)",
)
async def reject_reversal(
    reversal_id: uuid.UUID, body: RejectBody, staff: Staff, service: Reversals, info: Info
) -> Response:
    await service.reject(staff, info, reversal_id, " ".join(body.note.split()))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- service outages (ADR-066) -----------------------------------------------------------------


async def get_outages(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    runtime: Annotated[AuthRuntime, Depends(get_auth_runtime)],
) -> OutageService:
    return OutageService(db, runtime.clock)


Outages = Annotated[OutageService, Depends(get_outages)]
_Severity = Literal["low", "medium", "high"]


class OutageBody(_Strict):
    service: str = Field(min_length=2, max_length=60)
    #: What app users read in the banner.
    message: str = Field(min_length=5, max_length=300)
    severity: _Severity
    #: When it started (now if left out). Timezone required.
    started_at: datetime | None = None
    expected_end_at: datetime | None = None


class OutageChange(_Strict):
    service: str | None = Field(default=None, min_length=2, max_length=60)
    message: str | None = Field(default=None, min_length=5, max_length=300)
    severity: _Severity | None = None
    started_at: datetime | None = None
    expected_end_at: datetime | None = None
    status: Literal["open", "in_progress", "resolved"] | None = None


def _aware(value: datetime | None, field: str) -> datetime | None:
    if value is not None and value.tzinfo is None:
        raise AppError(
            "VAL_422_INVALID_FIELD",
            "Give the time with its time zone.",
            status_code=422,
            details={"field": field},
        )
    return value


@router.get("/outages", summary="Service outages (outages.read)")
async def list_outages(
    staff: Staff,
    service: Outages,
    q: Annotated[str | None, Query(max_length=80)] = None,
    status_in: Annotated[
        Literal["open", "in_progress", "resolved"] | None, Query(alias="status")
    ] = None,
    offset: Annotated[int, Query(ge=0, le=100_000)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> Any:
    return await service.list(
        staff, search=q or None, status_in=status_in, offset=offset, limit=limit
    )


@router.post(
    "/outages",
    status_code=status.HTTP_201_CREATED,
    summary="Report an outage; app users see the notice (outages.create)",
)
async def report_outage(body: OutageBody, staff: Staff, service: Outages, info: Info) -> Any:
    return await service.create(
        staff,
        info,
        service=" ".join(body.service.split()),
        message=" ".join(body.message.split()),
        severity=body.severity,
        started_at=_aware(body.started_at, "started_at"),
        expected_end_at=_aware(body.expected_end_at, "expected_end_at"),
    )


@router.patch(
    "/outages/{outage_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Change or resolve an outage (outages.update)",
)
async def change_outage(
    outage_id: uuid.UUID, body: OutageChange, staff: Staff, service: Outages, info: Info
) -> Response:
    sent = body.model_dump(exclude_unset=True)
    changes: dict[str, Any] = {}
    for key, value in sent.items():
        if value is None and key != "expected_end_at":
            continue  # only the expected end can be cleared
        if key in ("service", "message"):
            value = " ".join(value.split())
        if key in ("started_at", "expected_end_at"):
            value = _aware(value, key)
        changes[key] = value
    await service.change(staff, info, outage_id, changes=changes)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- adverts (ADR-067) -------------------------------------------------------------------------


async def get_adverts(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    runtime: Annotated[AuthRuntime, Depends(get_auth_runtime)],
) -> AdvertService:
    return AdvertService(db, runtime.clock, runtime.object_store)


Adverts = Annotated[AdvertService, Depends(get_adverts)]


class AdvertBody(_Strict):
    name: str = Field(min_length=2, max_length=60)
    #: JPEG, PNG or WebP, base64; at most 5 MB once decoded; the app slot's shape (342 x 113).
    image: str = Field(min_length=8, max_length=7_000_000)
    starts_at: datetime
    ends_at: datetime
    link_url: str | None = Field(default=None, max_length=500)


class AdvertChange(_Strict):
    name: str | None = Field(default=None, min_length=2, max_length=60)
    image: str | None = Field(default=None, min_length=8, max_length=7_000_000)
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    link_url: str | None = Field(default=None, max_length=500)
    active: bool | None = None


_PICTURE_HEADERS = {
    "Cache-Control": "private, max-age=300",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Content-Disposition": "inline",
}


@router.get("/adverts", summary="Adverts for the app's advert slot (adverts.read)")
async def list_adverts(staff: Staff, service: Adverts) -> Any:
    return await service.list(staff)


@router.post(
    "/adverts", status_code=status.HTTP_201_CREATED, summary="Add an advert (adverts.create)"
)
async def add_advert(body: AdvertBody, staff: Staff, service: Adverts, info: Info) -> Any:
    _aware(body.starts_at, "starts_at")
    _aware(body.ends_at, "ends_at")
    return await service.create(
        staff,
        info,
        name=" ".join(body.name.split()),
        image_b64=body.image,
        starts_at=body.starts_at,
        ends_at=body.ends_at,
        link_url=body.link_url,
    )


@router.patch(
    "/adverts/{advert_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Change an advert or switch it on/off (adverts.update)",
)
async def change_advert(
    advert_id: uuid.UUID, body: AdvertChange, staff: Staff, service: Adverts, info: Info
) -> Response:
    changes: dict[str, Any] = {}
    for key, value in body.model_dump(exclude_unset=True).items():
        if value is None and key != "link_url":
            continue  # only the link can be cleared
        if key == "name":
            value = " ".join(value.split())
        if key in ("starts_at", "ends_at"):
            value = _aware(value, key)
        changes[key] = value
    await service.change(staff, info, advert_id, changes)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/adverts/{advert_id}/image", summary="An advert's picture (adverts.read)")
async def advert_image(advert_id: uuid.UUID, staff: Staff, service: Adverts) -> Response:
    found = await service.picture(staff, advert_id)
    if found is None:
        return Response(status_code=status.HTTP_404_NOT_FOUND)
    data, content_type = found
    return Response(content=data, media_type=content_type, headers=_PICTURE_HEADERS)


# --- fraud alerts (ADR-068) --------------------------------------------------------------------


async def get_fraud(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    runtime: Annotated[AuthRuntime, Depends(get_auth_runtime)],
) -> FraudService:
    return FraudService(db, runtime.clock)


Fraud = Annotated[FraudService, Depends(get_fraud)]
_Rule = Literal[
    "pin_lockout", "code_lockout", "disputes_against", "payout_name_mismatch", "staff_report"
]


class FraudReportBody(_Strict):
    user_id: uuid.UUID
    severity: Literal["low", "medium", "high"]
    note: str = Field(min_length=5, max_length=1000)


class FraudResolveBody(_Strict):
    resolution: Literal["confirmed", "false_alarm"]
    note: str = Field(min_length=3, max_length=1000)


@router.get("/fraud-alerts", summary="Fraud alerts (fraud_alerts.read)")
async def list_fraud_alerts(
    staff: Staff,
    service: Fraud,
    q: Annotated[str | None, Query(max_length=80)] = None,
    status_in: Annotated[
        Literal["open", "in_progress", "resolved"] | None, Query(alias="status")
    ] = None,
    rule: _Rule | None = None,
    offset: Annotated[int, Query(ge=0, le=100_000)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> Any:
    return await service.list(
        staff, search=q or None, status_in=status_in, rule=rule, offset=offset, limit=limit
    )


@router.get("/fraud-alerts/stats", summary="Fraud alert counts (fraud_alerts.read)")
async def fraud_stats(staff: Staff, service: Fraud) -> Any:
    return await service.stats(staff)


@router.post(
    "/fraud-alerts",
    status_code=status.HTTP_201_CREATED,
    summary="Raise an alert about a customer by hand (fraud_alerts.create)",
)
async def report_fraud(body: FraudReportBody, staff: Staff, service: Fraud, info: Info) -> Any:
    return await service.report(
        staff, info, user_id=body.user_id, severity=body.severity, note=body.note.strip()
    )


@router.get("/fraud-alerts/{alert_id}", summary="One fraud alert (fraud_alerts.read)")
async def get_fraud_alert(alert_id: uuid.UUID, staff: Staff, service: Fraud) -> Any:
    return await service.get(staff, alert_id)


@router.post(
    "/fraud-alerts/{alert_id}/start",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Mark in progress (fraud_alerts.update)",
)
async def start_fraud_alert(
    alert_id: uuid.UUID, staff: Staff, service: Fraud, info: Info
) -> Response:
    await service.start(staff, info, alert_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/fraud-alerts/{alert_id}/resolve",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Resolve: confirmed or false alarm, with a note (fraud_alerts.update)",
)
async def resolve_fraud_alert(
    alert_id: uuid.UUID, body: FraudResolveBody, staff: Staff, service: Fraud, info: Info
) -> Response:
    await service.resolve(
        staff, info, alert_id, resolution=body.resolution, note=" ".join(body.note.split())
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


class FraudHoldBody(_Strict):
    settlement_id: uuid.UUID


@router.get(
    "/fraud-alerts/{alert_id}/deals",
    summary="The customer's deals that can be held, and those this alert holds (fraud_alerts.read)",
)
async def fraud_alert_deals(alert_id: uuid.UUID, staff: Staff, service: Fraud) -> Any:
    return await service.deals(staff, alert_id)


@router.post(
    "/fraud-alerts/{alert_id}/hold-deal",
    summary="Hold one of the customer's deals while staff look (fraud_alerts.approve)",
)
async def hold_fraud_deal(
    alert_id: uuid.UUID, body: FraudHoldBody, staff: Staff, service: Fraud, info: Info
) -> Any:
    return await service.hold_deal(staff, info, alert_id, body.settlement_id)


@router.post(
    "/fraud-alerts/{alert_id}/release-deal",
    summary="Release a deal this alert holds (fraud_alerts.approve)",
)
async def release_fraud_deal(
    alert_id: uuid.UUID, body: FraudHoldBody, staff: Staff, service: Fraud, info: Info
) -> Any:
    return await service.release_deal(staff, info, alert_id, body.settlement_id)


# --- identity-check review (ADR-069) -----------------------------------------------------------


async def get_kyc_review(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    runtime: Annotated[AuthRuntime, Depends(get_auth_runtime)],
) -> KycReviewService:
    return KycReviewService(db, runtime.clock)


KycReviews = Annotated[KycReviewService, Depends(get_kyc_review)]


# --- Staff bell (ADR-070) ---------------------------------------------------------------------


async def get_staff_work(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    runtime: Annotated[AuthRuntime, Depends(get_auth_runtime)],
) -> StaffWorkService:
    return StaffWorkService(db, runtime.clock)


StaffWork = Annotated[StaffWorkService, Depends(get_staff_work)]


@router.get("/notifications", summary="Work waiting for you (the bell); not activity")
async def staff_notifications(staff: PassiveStaff, service: StaffWork) -> Any:
    return await service.feed(staff)


@router.post(
    "/notifications/seen",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Opened the bell: later work counts as new",
)
async def staff_notifications_seen(staff: Staff, service: StaffWork) -> Response:
    await service.mark_seen(staff)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


class KycReasonBody(_Strict):
    reason: str = Field(min_length=5, max_length=1000)


class KycNoteBody(_Strict):
    note: str | None = Field(default=None, max_length=1000)


class KycDeclineBody(_Strict):
    note: str = Field(min_length=3, max_length=1000)


@router.get("/kyc/cases", summary="Identity checks waiting for a person (kyc.read)")
async def list_kyc_cases(
    staff: Staff,
    service: KycReviews,
    queue: Literal["held", "in_didit", "decided"] = "held",
    q: Annotated[str | None, Query(max_length=80)] = None,
    offset: Annotated[int, Query(ge=0, le=100_000)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> Any:
    return await service.list(staff, queue=queue, search=q or None, offset=offset, limit=limit)


@router.get("/kyc/cases/{case_id}", summary="One identity check (kyc.read)")
async def get_kyc_case(case_id: uuid.UUID, staff: Staff, service: KycReviews) -> Any:
    return await service.get(staff, case_id)


@router.post(
    "/kyc/cases/{case_id}/recommend",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Recommend approving a held check; a second person confirms (kyc.update)",
)
async def recommend_kyc(
    case_id: uuid.UUID, body: KycReasonBody, staff: Staff, service: KycReviews, info: Info
) -> Response:
    await service.recommend(staff, info, case_id, " ".join(body.reason.split()))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/kyc/cases/{case_id}/confirm",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Confirm someone else's recommendation: the customer is verified (kyc.approve)",
)
async def confirm_kyc(
    case_id: uuid.UUID, body: KycNoteBody, staff: Staff, service: KycReviews, info: Info
) -> Response:
    note = " ".join(body.note.split()) if body.note else None
    await service.confirm(staff, info, case_id, note or None)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/kyc/cases/{case_id}/decline",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Don't confirm someone else's recommendation (kyc.approve)",
)
async def decline_kyc(
    case_id: uuid.UUID, body: KycDeclineBody, staff: Staff, service: KycReviews, info: Info
) -> Response:
    await service.decline(staff, info, case_id, " ".join(body.note.split()))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/kyc/cases/{case_id}/reject",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Reject a held check; the customer reads the reason (kyc.update)",
)
async def reject_kyc(
    case_id: uuid.UUID, body: KycReasonBody, staff: Staff, service: KycReviews, info: Info
) -> Response:
    await service.reject(staff, info, case_id, " ".join(body.reason.split()))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- System Health (ADR-072; owner 2026-10-27: Super Admin) -----------------------------------


async def get_system_health(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_app_settings)],
) -> SystemHealthService:
    return SystemHealthService(db, settings)


@router.get("/system-health", summary="API, job and queue health (monitoring.read)")
async def system_health(
    staff: Staff,
    service: Annotated[SystemHealthService, Depends(get_system_health)],
    window: Annotated[Literal["1h", "24h", "7d"], Query()] = "1h",
) -> Any:
    return await service.view(staff, window)


# --- Operations alerts (ADR-074; owner 2026-11-01: Super Admins) -------------------------------


async def get_ops_alerts(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    runtime: Annotated[AuthRuntime, Depends(get_auth_runtime)],
) -> OpsAlertService:
    return OpsAlertService(db, runtime.clock)


OpsAlerts = Annotated[OpsAlertService, Depends(get_ops_alerts)]


class ResolveAlertBody(_Strict):
    note: str = Field(min_length=5, max_length=1000)


@router.get("/alerts", summary="Operations alerts (monitoring.read)")
async def list_ops_alerts(
    staff: Staff,
    service: OpsAlerts,
    which: Annotated[Literal["live", "all"], Query()] = "live",
) -> Any:
    return await service.alerts(staff, which)


@router.post("/alerts/{alert_id}/acknowledge", summary="I'm on it (monitoring.update)")
async def acknowledge_ops_alert(
    alert_id: uuid.UUID, staff: Staff, service: OpsAlerts, info: Info
) -> Any:
    return await service.acknowledge(staff, info, alert_id)


@router.post("/alerts/{alert_id}/resolve", summary="Resolve with a note (monitoring.update)")
async def resolve_ops_alert(
    alert_id: uuid.UUID, body: ResolveAlertBody, staff: Staff, service: OpsAlerts, info: Info
) -> Any:
    return await service.resolve(staff, info, alert_id, body.note)


# --- Emergency controls (ADR-075; SEC-039; any Super Admin, reason required) -------------------


async def get_deal_pause(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    runtime: Annotated[AuthRuntime, Depends(get_auth_runtime)],
) -> DealPauseService:
    return DealPauseService(db, runtime.clock)


DealPauses = Annotated[DealPauseService, Depends(get_deal_pause)]


class EmergencyReasonBody(_Strict):
    reason: str = Field(min_length=5, max_length=500)


class EndSessionsBody(_Strict):
    who: Literal["customers", "staff", "everyone"]
    reason: str = Field(min_length=5, max_length=500)


@router.get("/emergency/deals", summary="Are deals paused? (Super Admin)")
async def deal_pause_status(staff: Staff, service: DealPauses) -> Any:
    return await service.status(staff)


@router.post("/emergency/deals/pause", summary="Pause all deals (Super Admin, reason)")
async def pause_deals(
    body: EmergencyReasonBody, staff: Staff, service: DealPauses, info: Info
) -> Any:
    return await service.pause(staff, info, body.reason)


@router.post("/emergency/deals/resume", summary="Resume deals; open windows get the time back")
async def resume_deals(
    body: EmergencyReasonBody, staff: Staff, service: DealPauses, info: Info
) -> Any:
    return await service.resume(staff, info, body.reason)


@router.post("/emergency/sessions/end", summary="Sign everyone out (Super Admin, reason)")
async def end_all_sessions(
    body: EndSessionsBody, staff: Staff, service: DealPauses, info: Info
) -> Any:
    return await service.end_sessions(staff, info, body.who, body.reason)


# --- Customer activity and deal timelines (ADR-073; Super Admin, 5 years) ---------------------


async def get_activity_admin(
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> ActivityAdminService:
    return ActivityAdminService(db)


ActivityAdmin = Annotated[ActivityAdminService, Depends(get_activity_admin)]


@router.get("/users/{user_id}/activity", summary="Everything one customer did (activity.read)")
async def customer_activity(
    user_id: uuid.UUID,
    staff: Staff,
    service: ActivityAdmin,
    category: Annotated[
        Literal[
            "account",
            "security",
            "identity",
            "market",
            "deal",
            "payout",
            "dispute",
            "other",
            "staff",
        ]
        | None,
        Query(),
    ] = None,
    since: Annotated[datetime | None, Query()] = None,
    until: Annotated[datetime | None, Query()] = None,
    offset: Annotated[int, Query(ge=0, le=1_000_000)] = 0,
    limit: Annotated[int, Query(ge=1, le=500)] = 50,
) -> Any:
    return await service.customer(
        staff, user_id, category=category, since=since, until=until, offset=offset, limit=limit
    )


@router.get("/deals", summary="Deals by the reference customers see (activity.read)")
async def list_deals(
    staff: Staff,
    service: ActivityAdmin,
    q: Annotated[str | None, Query(max_length=80)] = None,
    offset: Annotated[int, Query(ge=0, le=1_000_000)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> Any:
    return await service.deals(staff, search=q, offset=offset, limit=limit)


@router.get("/deals/{match_id}", summary="One deal's full timeline (activity.read)")
async def deal_timeline(match_id: uuid.UUID, staff: Staff, service: ActivityAdmin) -> Any:
    return await service.timeline(staff, match_id)
