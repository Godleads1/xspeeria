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

from fastapi import APIRouter, Cookie, Depends, Header, Path, Query, Request, Response, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth_deps import client_address, get_auth_runtime, get_db_session, limit_by_address
from app.api.deps import get_app_settings
from app.core.config import Settings
from app.core.exceptions import AppError
from app.services.auth import AuthRuntime
from app.services.customers import CustomerAction, CustomerAdminService
from app.services.dashboard import DashboardService, Period
from app.services.dispute_admin import DisputeAdminService
from app.services.reversals import ReversalService
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
        description=body.description.strip(),
        desired_resolution=body.desired_resolution.strip() if body.desired_resolution else None,
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
