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
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Cookie, Depends, Header, Query, Request, Response, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth_deps import client_address, get_auth_runtime, get_db_session, limit_by_address
from app.api.deps import get_app_settings
from app.core.config import Settings
from app.core.exceptions import AppError
from app.services.auth import AuthRuntime
from app.services.staff import RequestInfo, StaffPrincipal, StaffService, unauthorized

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
    if session is None:
        raise unauthorized()
    principal = await service.authenticate(session)
    request.state.user_id = f"staff:{principal.staff_id}"
    return principal


Staff = Annotated[StaffPrincipal, Depends(current_staff)]


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


@router.post(
    "/auth/login",
    response_model=LoginResponse,
    dependencies=[Depends(limit_by_address)],
    summary="Staff log-in, step 1: email and password (sends an email code)",
)
async def login(body: LoginRequest, service: Service, info: Info) -> Any:
    return await service.login(body.email, body.password, info)


@router.post(
    "/auth/verify",
    response_model=MeView,
    dependencies=[Depends(limit_by_address)],
    summary="Staff log-in, step 2: the email code (sets the session cookie)",
)
async def verify(
    body: CodeRequest,
    response: Response,
    service: Service,
    info: Info,
    settings: Annotated[Settings, Depends(get_app_settings)],
) -> Any:
    token, me = await service.verify(body.challenge_id, body.code, info)
    _set_cookie(response, token, settings)
    return me


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT, summary="Log out")
async def logout(
    staff: Staff,
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
async def me(staff: Staff, service: Service) -> Any:
    return await service.me(staff)


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
