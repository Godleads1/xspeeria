"""Admin console staff: sign-in, sessions, staff, roles and the audit log (ADR-051 A-1, ADR-060).

* **Sign-in** = email + password, then a 6-digit code to the staff email (ADR-051 Decision 1;
  cannot be switched off). 5 wrong passwords lock the account for 15 minutes; an unknown
  email is answered the same way and takes the same time.
* **Session** = a random token in an httpOnly cookie, stored only as SHA-256, checked against
  its row on every request; it ends after 15 minutes idle or 8 hours, at log-out, when the
  password changes, or when the account is disabled.
* **Authorization** is checked here on every call from the staff member's role, read fresh
  from the database (a role change takes effect on the next request). No one can grant a
  permission they don't hold, change their own account or role, or touch a Super Admin
  unless they are one (SEC-008).
* **Audit** = every sign-in event and every change is written to ``staff_audit_log`` in the
  same transaction as the change (append-only; FX-04). Never a password, code or token.
"""

from __future__ import annotations

import base64
import binascii
import re
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from fastapi import status
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth_tokens import generate_code, generate_refresh_token, hash_refresh_token
from app.core.exceptions import AppError
from app.core.logging import get_logger
from app.domain.auth_rules import normalise_phone
from app.domain.image_rules import PhotoError, clean_photo
from app.domain.staff_rules import (
    CODE_TRIES,
    CODE_TTL,
    MAX_PASSWORD_TRIES,
    PASSWORD_LOCK,
    RESET_TTL,
    SESSION_ABSOLUTE,
    SESSION_IDLE,
    SUPER_ADMIN,
    normalise_email,
    password_problem,
    valid_permission_set,
)
from app.models.staff import StaffAccount, StaffAuditEntry, StaffCode, StaffRole, StaffSession
from app.providers.email import mask_email
from app.providers.object_store import new_key
from app.services.auth import AuthRuntime

__all__ = ["RequestInfo", "StaffPrincipal", "StaffService"]

_logger = get_logger(__name__)
_ROLE_NAME = re.compile(r"^[a-z][a-z0-9_]{2,39}$")


@dataclass(frozen=True)
class RequestInfo:
    ip_address: str | None
    user_agent: str | None


@dataclass(frozen=True)
class StaffPrincipal:
    staff_id: uuid.UUID
    session_id: uuid.UUID
    email: str
    role_id: uuid.UUID
    role_name: str
    permissions: frozenset[str]

    @property
    def is_super_admin(self) -> bool:
        return self.role_name == SUPER_ADMIN

    def can(self, permission: str) -> bool:
        return permission in self.permissions


def _err(code: str, message: str, http: int, details: dict[str, Any] | None = None) -> AppError:
    return AppError(code, message, status_code=http, details=details)


def _bad_login() -> AppError:
    return _err(
        "AUTH_401_INVALID_CREDENTIALS",
        "The email or password is incorrect.",
        status.HTTP_401_UNAUTHORIZED,
    )


def _locked(seconds: float) -> AppError:
    wait = max(1, int(seconds + 0.999))
    return _err(
        "AUTH_429_RATE_LIMITED",
        "Too many attempts. Please wait and try again.",
        status.HTTP_429_TOO_MANY_REQUESTS,
        {"retry_after_seconds": wait},
    )


def _bad_code() -> AppError:
    return _err(
        "AUTH_401_INVALID_OTP", "That code is not right. Try again.", status.HTTP_401_UNAUTHORIZED
    )


def _code_gone() -> AppError:
    return _err(
        "AUTH_410_CHALLENGE_EXPIRED",
        "This code has expired. Please start again.",
        status.HTTP_410_GONE,
    )


def unauthorized() -> AppError:
    return _err("AUTH_401_UNAUTHORIZED", "Please log in again.", status.HTTP_401_UNAUTHORIZED)


def forbidden() -> AppError:
    return _err(
        "AUTH_403_FORBIDDEN", "You don't have permission to do this.", status.HTTP_403_FORBIDDEN
    )


def _not_found() -> AppError:
    return _err("RES_404_NOT_FOUND", "Not found.", status.HTTP_404_NOT_FOUND)


def _weak(message: str) -> AppError:
    return _err("VAL_422_WEAK_PASSWORD", message, 422)


def _phone_or_422(value: str | None) -> str:
    phone = normalise_phone(value or "")
    if phone is None:
        raise _err(
            "VAL_422_INVALID_PHONE",
            "Enter the phone number in international form, e.g. +2348031234567.",
            422,
            {"field": "phone"},
        )
    return phone


def _photos_unavailable() -> AppError:
    return _err(
        "SYS_503_SERVICE_UNAVAILABLE",
        "Photos aren’t available yet. Please try again later.",
        status.HTTP_503_SERVICE_UNAVAILABLE,
    )


def _email_unavailable() -> AppError:
    return _err(
        "SYS_503_SERVICE_UNAVAILABLE",
        "Email is not available right now. Please try again later.",
        status.HTTP_503_SERVICE_UNAVAILABLE,
    )


class StaffService:
    def __init__(self, db: AsyncSession, runtime: AuthRuntime) -> None:
        self._db = db
        self._rt = runtime

    # --- helpers ----------------------------------------------------------------------------

    def _now(self) -> datetime:
        return self._rt.clock()

    def _digest(self, code_id: uuid.UUID, code: str) -> str:
        keys = self._rt.keys
        if keys is None:  # pragma: no cover - the routes refuse first
            raise _email_unavailable()
        return keys.code_digest(f"staff:{code_id}", code)

    def _audit(
        self,
        info: RequestInfo | None,
        staff_id: uuid.UUID | None,
        action: str,
        *,
        target_type: str | None = None,
        target_id: object = None,
        detail: dict[str, Any] | None = None,
    ) -> None:
        self._db.add(
            StaffAuditEntry(
                at=self._now(),
                staff_id=staff_id,
                action=action,
                target_type=target_type,
                target_id=None if target_id is None else str(target_id),
                detail=detail,
                ip_address=info.ip_address if info else None,
                user_agent=info.user_agent if info else None,
            )
        )

    async def _new_code(self, staff_id: uuid.UUID | None, purpose: str) -> tuple[uuid.UUID, str]:
        code_id, code = uuid.uuid4(), generate_code()
        now = self._now()
        self._db.add(
            StaffCode(
                id=code_id,
                staff_id=staff_id,
                purpose=purpose,
                code_digest=self._digest(code_id, code),
                expires_at=now + (CODE_TTL if purpose == "login" else RESET_TTL),
                created_at=now,
            )
        )
        return code_id, code

    async def _revoke_sessions(self, staff_id: uuid.UUID, *, keep: uuid.UUID | None = None) -> None:
        stmt = (
            update(StaffSession)
            .where(StaffSession.staff_id == staff_id, StaffSession.revoked_at.is_(None))
            .values(revoked_at=self._now())
        )
        if keep is not None:
            stmt = stmt.where(StaffSession.id != keep)
        await self._db.execute(stmt)

    # --- sign-in ----------------------------------------------------------------------------

    async def login(self, email_in: str, password: str, info: RequestInfo) -> dict[str, Any]:
        """Step 1: email and password. Sends the email code; answers with its id."""
        if self._rt.email is None or self._rt.keys is None:
            raise _email_unavailable()
        now = self._now()
        email = normalise_email(email_in)
        staff = None
        if email is not None:
            staff = await self._db.scalar(
                select(StaffAccount).where(StaffAccount.email == email).with_for_update()
            )
        if staff is None or staff.status != "active" or staff.password_hash is None:
            self._rt.hasher.verify_dummy(password)
            key = "staff:" + hash_refresh_token((email or email_in).strip().lower())
            limiter = self._rt.unknown_identifier_limiter
            self._audit(
                info,
                staff.id if staff is not None else None,
                "login_failed",
                detail={"reason": "unknown_or_inactive"},
            )
            await self._db.commit()
            if not limiter.hit(key, now) or limiter.count(key, now) >= MAX_PASSWORD_TRIES:
                raise _locked(PASSWORD_LOCK.total_seconds())
            raise _bad_login()

        if staff.locked_until is not None and now < staff.locked_until:
            wait = (staff.locked_until - now).total_seconds()
            await self._db.rollback()
            raise _locked(wait)

        if not self._rt.hasher.verify(staff.password_hash, password):
            staff.failed_logins += 1
            locked = staff.failed_logins >= MAX_PASSWORD_TRIES
            if locked:
                staff.failed_logins = 0
                staff.locked_until = now + PASSWORD_LOCK
            self._audit(
                info,
                staff.id,
                "login_locked" if locked else "login_failed",
                detail={"reason": "wrong_password"},
            )
            await self._db.commit()
            if locked:
                _logger.warning("staff_login_locked", extra={"staff_id": str(staff.id)})
                raise _locked(PASSWORD_LOCK.total_seconds())
            raise _bad_login()

        staff.failed_logins = 0
        staff.locked_until = None
        if self._rt.hasher.needs_rehash(staff.password_hash):
            staff.password_hash = self._rt.hasher.hash(password)
        code_id, code = await self._new_code(staff.id, "login")
        self._audit(info, staff.id, "login_code_sent")
        address = staff.email
        await self._db.commit()
        await self._rt.email.send_code(address, code)
        return {"challenge_id": code_id, "email": mask_email(address)}

    async def _use_code(self, code_id: uuid.UUID, code: str, purpose: str) -> StaffCode:
        row = await self._db.scalar(
            select(StaffCode)
            .where(StaffCode.id == code_id, StaffCode.purpose == purpose)
            .with_for_update()
        )
        now = self._now()
        if row is None:
            await self._db.rollback()
            raise _bad_code()
        if row.used_at is not None or now >= row.expires_at or row.tries >= CODE_TRIES:
            await self._db.rollback()
            raise _code_gone()
        if row.staff_id is None or not secrets.compare_digest(
            self._digest(row.id, code), row.code_digest
        ):
            row.tries += 1
            await self._db.commit()
            raise _bad_code() if row.tries < CODE_TRIES else _code_gone()
        row.used_at = now
        return row

    async def verify(
        self, code_id: uuid.UUID, code: str, info: RequestInfo
    ) -> tuple[str, dict[str, Any]]:
        """Step 2: the email code. Opens a session; answers with the cookie value."""
        row = await self._use_code(code_id, code, "login")
        staff = await self._db.get(StaffAccount, row.staff_id, with_for_update=True)
        if staff is None or staff.status != "active":
            await self._db.rollback()
            raise _code_gone()
        now = self._now()
        token = generate_refresh_token()
        session = StaffSession(
            id=uuid.uuid4(),
            staff_id=staff.id,
            token_hash=hash_refresh_token(token),
            created_at=now,
            last_seen_at=now,
            expires_at=now + SESSION_ABSOLUTE,
            ip_address=info.ip_address,
            user_agent=info.user_agent,
        )
        self._db.add(session)
        staff.last_login_at = now
        self._audit(info, staff.id, "login", detail={"session_id": str(session.id)})
        staff_id = staff.id
        await self._db.commit()
        _logger.info("staff_login", extra={"staff_id": str(staff_id)})
        return token, await self._profile(staff_id)

    async def authenticate(self, token: str | None, *, touch: bool = True) -> StaffPrincipal:
        """The caller behind a session cookie, or 401. Also keeps the session alive, except
        for ``touch=False``: background checks (the bell, ADR-070) must not stop an idle
        session from ending after 15 minutes."""
        if not token or len(token) > 128:
            raise unauthorized()
        now = self._now()
        found = (
            await self._db.execute(
                select(StaffSession, StaffAccount, StaffRole)
                .join(StaffAccount, StaffAccount.id == StaffSession.staff_id)
                .join(StaffRole, StaffRole.id == StaffAccount.role_id)
                .where(StaffSession.token_hash == hash_refresh_token(token))
            )
        ).first()
        if found is None:
            await self._db.rollback()
            raise unauthorized()
        session, staff, role = found
        if (
            session.revoked_at is not None
            or now >= session.expires_at
            or now >= session.last_seen_at + SESSION_IDLE
            or staff.status != "active"
        ):
            await self._db.rollback()
            raise unauthorized()
        principal = StaffPrincipal(
            staff_id=staff.id,
            session_id=session.id,
            email=staff.email,
            role_id=role.id,
            role_name=role.name,
            permissions=frozenset(role.permissions),
        )
        if touch:
            session.last_seen_at = now
            await self._db.commit()
        else:
            await self._db.rollback()
        return principal

    async def logout(self, principal: StaffPrincipal, info: RequestInfo) -> None:
        await self._db.execute(
            update(StaffSession)
            .where(StaffSession.id == principal.session_id)
            .values(revoked_at=self._now())
        )
        self._audit(info, principal.staff_id, "logout")
        await self._db.commit()

    # --- passwords --------------------------------------------------------------------------

    async def forgot(self, email_in: str, info: RequestInfo) -> dict[str, Any]:
        """Always answers with a reset id, whether or not the email has an account."""
        if self._rt.email is None or self._rt.keys is None:
            raise _email_unavailable()
        email = normalise_email(email_in)
        staff = None
        if email is not None:
            staff = await self._db.scalar(
                select(StaffAccount).where(
                    StaffAccount.email == email, StaffAccount.status == "active"
                )
            )
        send = staff is not None
        if staff is not None:
            # At most one code a minute per account (no email flooding).
            recent = await self._db.scalar(
                select(func.count(StaffCode.id)).where(
                    StaffCode.staff_id == staff.id,
                    StaffCode.purpose == "password",
                    StaffCode.created_at > self._now() - CODE_TTL / 10,
                )
            )
            send = not recent
        code_id, code = await self._new_code(staff.id if send and staff else None, "password")
        if send and staff is not None:
            self._audit(info, staff.id, "password_code_sent")
            address = staff.email
            await self._db.commit()
            await self._rt.email.send_code(address, code)
        else:
            await self._db.commit()
        return {"reset_id": code_id}

    async def reset(
        self, code_id: uuid.UUID, code: str, new_password: str, info: RequestInfo
    ) -> None:
        """Set a new password with an emailed code (also how invited staff set their first)."""
        row = await self._use_code(code_id, code, "password")
        staff = await self._db.get(StaffAccount, row.staff_id, with_for_update=True)
        if staff is None or staff.status != "active":
            await self._db.rollback()
            raise _code_gone()
        problem = password_problem(new_password, email=staff.email)
        if problem:
            await self._db.rollback()  # the code stays usable
            raise _weak(problem)
        first = staff.password_hash is None
        now = self._now()
        staff.password_hash = self._rt.hasher.hash(new_password)
        staff.password_changed_at = now
        staff.failed_logins = 0
        staff.locked_until = None
        staff.updated_at = now
        await self._revoke_sessions(staff.id)
        self._audit(info, staff.id, "password_set" if first else "password_reset")
        await self._db.commit()

    async def change_password(
        self, principal: StaffPrincipal, current: str, new: str, info: RequestInfo
    ) -> None:
        staff = await self._db.get(StaffAccount, principal.staff_id, with_for_update=True)
        if staff is None or staff.password_hash is None:
            await self._db.rollback()
            raise unauthorized()
        if not self._rt.hasher.verify(staff.password_hash, current):
            self._audit(info, staff.id, "password_change_failed")
            await self._db.commit()
            raise _bad_login()
        problem = password_problem(new, email=staff.email)
        if problem:
            await self._db.rollback()
            raise _weak(problem)
        now = self._now()
        staff.password_hash = self._rt.hasher.hash(new)
        staff.password_changed_at = now
        staff.updated_at = now
        await self._revoke_sessions(staff.id, keep=principal.session_id)
        self._audit(info, staff.id, "password_changed")
        await self._db.commit()

    # --- reading ----------------------------------------------------------------------------

    async def _profile(self, staff_id: uuid.UUID) -> dict[str, Any]:
        found = (
            await self._db.execute(
                select(StaffAccount, StaffRole)
                .join(StaffRole, StaffRole.id == StaffAccount.role_id)
                .where(StaffAccount.id == staff_id)
            )
        ).first()
        if found is None:
            await self._db.rollback()
            raise unauthorized()
        staff, role = found
        out = _staff_view(staff, role)
        out["permissions"] = sorted(role.permissions)
        await self._db.rollback()
        return out

    async def me(self, principal: StaffPrincipal) -> dict[str, Any]:
        return await self._profile(principal.staff_id)

    async def update_me(
        self,
        principal: StaffPrincipal,
        changes: dict[str, Any],
        info: RequestInfo,
    ) -> dict[str, Any]:
        """Change my own name and phone (owner decision 2026-10-26).

        Only these two: email (the log-in) and role are changed by staff who manage accounts,
        so a stolen session can't take the account over or raise its own permissions.
        """
        staff = await self._db.get(StaffAccount, principal.staff_id, with_for_update=True)
        if staff is None or staff.status != "active":
            await self._db.rollback()
            raise unauthorized()
        done: dict[str, Any] = {}
        if "name" in changes:
            name = changes["name"].strip()
            if len(name) < 2:
                await self._db.rollback()
                raise _err("VAL_422_MISSING_FIELD", "Enter your name.", 422, {"field": "name"})
            if name != staff.name:
                done["name"] = True
                staff.name = name
        if "phone" in changes:
            try:
                phone = _phone_or_422(changes["phone"])
            except AppError:
                await self._db.rollback()
                raise
            if phone != staff.phone:
                done["phone"] = True  # the audit says it changed, never the number
                staff.phone = phone
        if done:
            staff.updated_at = self._now()
            self._audit(
                info,
                staff.id,
                "profile_updated",
                target_type="staff",
                target_id=staff.id,
                detail=done,
            )
            await self._db.commit()
        else:
            await self._db.rollback()
        return await self._profile(principal.staff_id)

    # --- staff ------------------------------------------------------------------------------

    def _need(self, principal: StaffPrincipal, permission: str) -> None:
        if not principal.can(permission):
            raise forbidden()

    def _can_hand_out(self, principal: StaffPrincipal, role: StaffRole) -> bool:
        if role.name == SUPER_ADMIN:
            return principal.is_super_admin
        return set(role.permissions) <= principal.permissions

    async def list_staff(self, principal: StaffPrincipal) -> list[dict[str, Any]]:
        self._need(principal, "staff.read")
        rows = (
            await self._db.execute(
                select(StaffAccount, StaffRole)
                .join(StaffRole, StaffRole.id == StaffAccount.role_id)
                .order_by(StaffAccount.created_at)
            )
        ).all()
        out = [_staff_view(s, r) for s, r in rows]
        await self._db.rollback()
        return out

    async def create_staff(
        self,
        principal: StaffPrincipal,
        email_in: str,
        name: str,
        role_id: uuid.UUID,
        info: RequestInfo,
        phone_in: str | None = None,
    ) -> dict[str, Any]:
        """Invite a staff member: they get an email code to set their own password."""
        self._need(principal, "staff.create")
        if self._rt.email is None or self._rt.keys is None:
            raise _email_unavailable()
        phone = _phone_or_422(phone_in)  # required for new staff (owner, 2026-10-26)
        email = normalise_email(email_in)
        if email is None:
            raise _err(
                "VAL_422_MISSING_FIELD", "Enter a valid email address.", 422, {"field": "email"}
            )
        role = await self._db.get(StaffRole, role_id)
        if role is None:
            await self._db.rollback()
            raise _not_found()
        if not self._can_hand_out(principal, role):
            await self._db.rollback()
            raise forbidden()
        now = self._now()
        staff = StaffAccount(
            id=uuid.uuid4(),
            email=email,
            name=name.strip(),
            phone=phone,
            role_id=role.id,
            status="active",
            created_by=principal.staff_id,
            created_at=now,
            updated_at=now,
        )
        self._db.add(staff)
        try:
            await self._db.flush()
        except IntegrityError:
            await self._db.rollback()
            raise _err(
                "AUTH_400_EMAIL_TAKEN",
                "A staff member already uses this email.",
                status.HTTP_409_CONFLICT,
            ) from None
        code_id, code = await self._new_code(staff.id, "password")
        self._audit(
            info,
            principal.staff_id,
            "staff_created",
            target_type="staff",
            target_id=staff.id,
            detail={"role": role.name},
        )
        out = _staff_view(staff, role)
        out["invite_id"] = code_id
        await self._db.commit()
        await self._rt.email.send_code(email, code)
        return out

    async def update_staff(
        self,
        principal: StaffPrincipal,
        staff_id: uuid.UUID,
        changes: dict[str, Any],
        info: RequestInfo,
    ) -> dict[str, Any]:
        self._need(principal, "staff.update")
        if staff_id == principal.staff_id:
            raise _err(
                "AUTH_403_FORBIDDEN",
                "You can't change your own account here.",
                status.HTTP_403_FORBIDDEN,
            )
        # Lock order: every Super Admin row first (sorted), then the target.
        supers = list(
            (
                await self._db.scalars(
                    select(StaffAccount)
                    .join(StaffRole, StaffRole.id == StaffAccount.role_id)
                    .where(StaffRole.name == SUPER_ADMIN)
                    .order_by(StaffAccount.id)
                    .with_for_update(of=StaffAccount)
                )
            ).all()
        )
        staff = await self._db.get(StaffAccount, staff_id, with_for_update=True)
        if staff is None:
            await self._db.rollback()
            raise _not_found()
        current_role = await self._db.get(StaffRole, staff.role_id)
        # Only manage people whose role you fully hold (no acting on someone more powerful).
        if current_role is None or not self._can_hand_out(principal, current_role):
            await self._db.rollback()
            raise forbidden()
        done: dict[str, Any] = {}
        role = current_role
        if "role_id" in changes and changes["role_id"] != staff.role_id:
            new_role = await self._db.get(StaffRole, changes["role_id"])
            if new_role is None:
                await self._db.rollback()
                raise _not_found()
            if not self._can_hand_out(principal, new_role):
                await self._db.rollback()
                raise forbidden()
            done["role"] = {"from": current_role.name, "to": new_role.name}
            staff.role_id, role = new_role.id, new_role
        if "status" in changes and changes["status"] != staff.status:
            done["status"] = {"from": staff.status, "to": changes["status"]}
            staff.status = changes["status"]
        if "name" in changes and changes["name"].strip() != staff.name:
            done["name"] = True
            staff.name = changes["name"].strip()
        if "phone" in changes:
            try:
                phone = _phone_or_422(changes["phone"])
            except AppError:
                await self._db.rollback()
                raise
            if phone != staff.phone:
                done["phone"] = True  # the audit says it changed, never the number
                staff.phone = phone
        # Never leave the console without an active Super Admin.
        if current_role.name == SUPER_ADMIN and (
            role.name != SUPER_ADMIN or staff.status != "active"
        ):
            others = [s for s in supers if s.id != staff.id and s.status == "active"]
            if not others:
                await self._db.rollback()
                raise _err(
                    "RES_409_LAST_SUPER_ADMIN",
                    "This is the only active Super Admin.",
                    status.HTTP_409_CONFLICT,
                )
        if done:
            staff.updated_at = self._now()
            if staff.status != "active" or "role" in done:
                await self._revoke_sessions(staff.id)
            self._audit(
                info,
                principal.staff_id,
                "staff_updated",
                target_type="staff",
                target_id=staff.id,
                detail=done,
            )
        out = _staff_view(staff, role)
        await self._db.commit()
        return out

    # --- photos (ADR-049, ADR-060) ----------------------------------------------------------

    async def _photo_target(
        self, principal: StaffPrincipal, staff_id: uuid.UUID, *, change: bool
    ) -> StaffAccount:
        """The account whose photo is asked for, if the caller may see / change it."""
        staff = await self._db.get(StaffAccount, staff_id, with_for_update=change)
        if staff is None:
            await self._db.rollback()
            raise _not_found()
        if staff.id == principal.staff_id:
            return staff  # your own photo, always
        if not change:
            if principal.can("staff.read"):
                return staff
            await self._db.rollback()
            raise forbidden()
        role = await self._db.get(StaffRole, staff.role_id)
        if (
            not principal.can("staff.update")
            or role is None
            or not self._can_hand_out(principal, role)
        ):
            await self._db.rollback()
            raise forbidden()
        return staff

    async def set_photo(
        self, principal: StaffPrincipal, staff_id: uuid.UUID, photo_b64: str, info: RequestInfo
    ) -> dict[str, Any]:
        store = self._rt.object_store
        if store is None:
            raise _photos_unavailable()
        try:
            raw = base64.b64decode(photo_b64, validate=True)
        except (binascii.Error, ValueError):
            raise _err("VALIDATION_ERROR", "That file could not be read.", 422) from None
        try:
            cleaned, _ = clean_photo(raw)
        except PhotoError as exc:
            raise _err("VALIDATION_ERROR", str(exc), 422) from None
        staff = await self._photo_target(principal, staff_id, change=True)
        old = staff.photo_key
        key = new_key("staff")
        store.put(key, cleaned)
        staff.photo_key = key
        staff.updated_at = self._now()
        self._audit(
            info,
            principal.staff_id,
            "photo_set",
            target_type="staff",
            target_id=staff.id,
            detail={"bytes": len(cleaned)},
        )
        role = await self._db.get(StaffRole, staff.role_id)
        if role is None:  # pragma: no cover - the foreign key guarantees a role
            await self._db.rollback()
            raise _not_found()
        out = _staff_view(staff, role)
        try:
            await self._db.commit()
        except Exception:
            store.delete(key)  # nothing points at it
            raise
        if old:
            store.delete(old)
        return out

    async def remove_photo(
        self, principal: StaffPrincipal, staff_id: uuid.UUID, info: RequestInfo
    ) -> None:
        store = self._rt.object_store
        staff = await self._photo_target(principal, staff_id, change=True)
        old = staff.photo_key
        if old is None:
            await self._db.rollback()
            return
        staff.photo_key = None
        staff.updated_at = self._now()
        self._audit(
            info, principal.staff_id, "photo_removed", target_type="staff", target_id=staff.id
        )
        await self._db.commit()
        if store is not None:
            store.delete(old)

    async def photo(
        self, principal: StaffPrincipal, staff_id: uuid.UUID
    ) -> tuple[bytes, str] | None:
        """The photo and its type, or None when there is none."""
        staff = await self._photo_target(principal, staff_id, change=False)
        key = staff.photo_key
        await self._db.rollback()
        store = self._rt.object_store
        if key is None or store is None:
            return None
        data = store.get(key)
        if data is None:
            return None
        try:
            return clean_photo(data)  # re-checked on the way out, never trusted from storage
        except PhotoError:
            return None

    # --- roles ------------------------------------------------------------------------------

    async def list_roles(self, principal: StaffPrincipal) -> list[dict[str, Any]]:
        self._need(principal, "roles.read")
        counts = dict(
            (
                await self._db.execute(
                    select(StaffAccount.role_id, func.count(StaffAccount.id)).group_by(
                        StaffAccount.role_id
                    )
                )
            )
            .tuples()
            .all()
        )
        roles = (await self._db.scalars(select(StaffRole).order_by(StaffRole.name))).all()
        out = [_role_view(r, counts.get(r.id, 0)) for r in roles]
        await self._db.rollback()
        return out

    def _check_permissions(self, principal: StaffPrincipal, permissions: list[str]) -> None:
        if not valid_permission_set(permissions):
            raise _err(
                "VAL_422_MISSING_FIELD",
                "Choose permissions from the list.",
                422,
                {"field": "permissions"},
            )
        if not set(permissions) <= principal.permissions:
            raise _err(
                "AUTH_403_FORBIDDEN",
                "You can't give a permission you don't have.",
                status.HTTP_403_FORBIDDEN,
            )

    async def create_role(
        self,
        principal: StaffPrincipal,
        name: str,
        description: str,
        permissions: list[str],
        info: RequestInfo,
    ) -> dict[str, Any]:
        self._need(principal, "roles.create")
        if not _ROLE_NAME.fullmatch(name) or name == SUPER_ADMIN:
            raise _err(
                "VAL_422_MISSING_FIELD",
                "Use 3–40 lower-case letters, numbers or _ for the role name.",
                422,
                {"field": "name"},
            )
        self._check_permissions(principal, permissions)
        now = self._now()
        role = StaffRole(
            id=uuid.uuid4(),
            name=name,
            description=description.strip(),
            permissions=sorted(set(permissions)),
            builtin=False,
            created_at=now,
            updated_at=now,
        )
        self._db.add(role)
        try:
            await self._db.flush()
        except IntegrityError:
            await self._db.rollback()
            raise _err(
                "RES_409_ROLE_EXISTS", "A role with this name exists.", status.HTTP_409_CONFLICT
            ) from None
        self._audit(
            info,
            principal.staff_id,
            "role_created",
            target_type="role",
            target_id=role.id,
            detail={"name": name, "permissions": role.permissions},
        )
        out = _role_view(role, 0)
        await self._db.commit()
        return out

    async def update_role(
        self,
        principal: StaffPrincipal,
        role_id: uuid.UUID,
        description: str | None,
        permissions: list[str] | None,
        info: RequestInfo,
    ) -> dict[str, Any]:
        self._need(principal, "roles.update")
        role = await self._db.get(StaffRole, role_id, with_for_update=True)
        if role is None:
            await self._db.rollback()
            raise _not_found()
        if (
            role.name == SUPER_ADMIN
            or role.id == principal.role_id
            or not set(role.permissions) <= principal.permissions
        ):
            await self._db.rollback()
            raise _err(
                "AUTH_403_FORBIDDEN",
                "This role can't be changed here.",
                status.HTTP_403_FORBIDDEN,
            )
        done: dict[str, Any] = {}
        if permissions is not None:
            try:
                self._check_permissions(principal, permissions)
            except AppError:
                await self._db.rollback()
                raise
            before, after = set(role.permissions), set(permissions)
            if before != after:
                done["added"] = sorted(after - before)
                done["removed"] = sorted(before - after)
                role.permissions = sorted(after)
        if description is not None and description.strip() != role.description:
            done["description"] = True
            role.description = description.strip()
        if done:
            role.updated_at = self._now()
            self._audit(
                info,
                principal.staff_id,
                "role_updated",
                target_type="role",
                target_id=role.id,
                detail={"name": role.name, **done},
            )
        count = await self._db.scalar(
            select(func.count(StaffAccount.id)).where(StaffAccount.role_id == role.id)
        )
        out = _role_view(role, int(count or 0))
        await self._db.commit()
        return out

    async def delete_role(
        self, principal: StaffPrincipal, role_id: uuid.UUID, info: RequestInfo
    ) -> None:
        self._need(principal, "roles.delete")
        role = await self._db.get(StaffRole, role_id, with_for_update=True)
        if role is None:
            await self._db.rollback()
            raise _not_found()
        if role.builtin:
            await self._db.rollback()
            raise _err(
                "AUTH_403_FORBIDDEN", "Built-in roles can't be deleted.", status.HTTP_403_FORBIDDEN
            )
        used = await self._db.scalar(
            select(func.count(StaffAccount.id)).where(StaffAccount.role_id == role.id)
        )
        if used:
            await self._db.rollback()
            raise _err(
                "RES_409_ROLE_IN_USE",
                "Move everyone off this role before deleting it.",
                status.HTTP_409_CONFLICT,
            )
        name = role.name
        await self._db.delete(role)
        self._audit(
            info,
            principal.staff_id,
            "role_deleted",
            target_type="role",
            target_id=role_id,
            detail={"name": name},
        )
        await self._db.commit()

    # --- audit log --------------------------------------------------------------------------

    async def audit(
        self,
        principal: StaffPrincipal,
        *,
        staff_id: uuid.UUID | None,
        action: str | None,
        before: int | None,
        limit: int,
    ) -> dict[str, Any]:
        self._need(principal, "audit.read")
        stmt = (
            select(StaffAuditEntry, StaffAccount.email)
            .outerjoin(StaffAccount, StaffAccount.id == StaffAuditEntry.staff_id)
            .order_by(StaffAuditEntry.id.desc())
            .limit(limit + 1)
        )
        if staff_id is not None:
            stmt = stmt.where(StaffAuditEntry.staff_id == staff_id)
        if action is not None:
            stmt = stmt.where(StaffAuditEntry.action == action)
        if before is not None:
            stmt = stmt.where(StaffAuditEntry.id < before)
        rows = (await self._db.execute(stmt)).all()
        items = [
            {
                "id": e.id,
                "at": e.at,
                "staff_id": e.staff_id,
                "staff_email": email,
                "action": e.action,
                "target_type": e.target_type,
                "target_id": e.target_id,
                "detail": e.detail,
                "ip_address": e.ip_address,
            }
            for e, email in rows[:limit]
        ]
        await self._db.rollback()
        return {
            "items": items,
            "next_before": items[-1]["id"] if len(rows) > limit and items else None,
        }

    # --- first Super Admin (command line only) ----------------------------------------------

    async def create_first_super_admin(
        self, email_in: str, name: str, password: str, phone_in: str | None = None
    ) -> uuid.UUID:
        """Only when no Super Admin exists. Used by ``app.cli.create_super_admin``."""
        phone = None
        if phone_in is not None:
            phone = normalise_phone(phone_in)
            if phone is None:
                raise ValueError(
                    "Enter the phone number in international form, e.g. +2348031234567."
                )
        email = normalise_email(email_in)
        if email is None:
            raise ValueError("Enter a valid email address.")
        problem = password_problem(password, email=email)
        if problem:
            raise ValueError(problem)
        role = await self._db.scalar(
            select(StaffRole).where(StaffRole.name == SUPER_ADMIN).with_for_update()
        )
        if role is None:
            raise ValueError("The super_admin role is missing; run the migrations first.")
        existing = await self._db.scalar(
            select(func.count(StaffAccount.id)).where(StaffAccount.role_id == role.id)
        )
        if existing:
            await self._db.rollback()
            raise ValueError("A Super Admin already exists. Add more staff from the console.")
        now = self._now()
        staff = StaffAccount(
            id=uuid.uuid4(),
            email=email,
            name=name.strip(),
            phone=phone,
            role_id=role.id,
            status="active",
            password_hash=self._rt.hasher.hash(password),
            password_changed_at=now,
            created_at=now,
            updated_at=now,
        )
        self._db.add(staff)
        await self._db.flush()
        self._audit(
            RequestInfo(None, "command line"),
            staff.id,
            "first_super_admin_created",
            target_type="staff",
            target_id=staff.id,
        )
        await self._db.commit()
        return staff.id


def _staff_view(staff: StaffAccount, role: StaffRole) -> dict[str, Any]:
    return {
        "id": staff.id,
        "email": staff.email,
        "name": staff.name,
        "phone": staff.phone,
        "has_photo": staff.photo_key is not None,
        "role_id": role.id,
        "role": role.name,
        "status": staff.status,
        "password_set": staff.password_hash is not None,
        "last_login_at": staff.last_login_at,
        "created_at": staff.created_at,
    }


def _role_view(role: StaffRole, staff_count: int) -> dict[str, Any]:
    return {
        "id": role.id,
        "name": role.name,
        "description": role.description,
        "permissions": sorted(role.permissions),
        "builtin": role.builtin,
        "editable": role.name != SUPER_ADMIN,
        "staff_count": staff_count,
    }
