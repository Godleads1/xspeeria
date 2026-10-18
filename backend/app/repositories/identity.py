"""Data access for the AUTH-1 identity tables (ADR-025).

The only module that builds queries against these tables. Every query uses bound
parameters through the SQLAlchemy ORM; nothing here formats SQL from input. Rows that are
about to be changed are read ``FOR UPDATE`` so two requests cannot both spend the same
refresh token, both use the same code, or both count the same wrong PIN.

Transactions are owned by the caller (the service commits or rolls back).
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.identity import AuthRefreshToken, AuthSession, PhoneVerification, User

__all__ = ["IdentityRepository"]


class IdentityRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._db = session

    # --- users ---------------------------------------------------------------------

    async def user_by_phone(self, phone: str, *, lock: bool = False) -> User | None:
        stmt = select(User).where(User.phone == phone)
        if lock:
            stmt = stmt.with_for_update()
        return (await self._db.execute(stmt)).scalar_one_or_none()

    async def active_user_by_email(self, email: str, *, lock: bool = False) -> User | None:
        stmt = select(User).where(User.email == email, User.status == "active")
        if lock:
            stmt = stmt.with_for_update()
        return (await self._db.execute(stmt)).scalar_one_or_none()

    async def user_by_id(self, user_id: uuid.UUID) -> User | None:
        return await self._db.get(User, user_id)

    def add(self, row: object) -> None:
        self._db.add(row)

    # --- phone verifications -------------------------------------------------------

    async def codes_sent_since(self, phone: str, since: datetime) -> int:
        stmt = select(func.count()).where(
            PhoneVerification.phone == phone, PhoneVerification.created_at > since
        )
        return int((await self._db.execute(stmt)).scalar_one())

    async def last_code_sent_at(self, phone: str) -> datetime | None:
        stmt = select(func.max(PhoneVerification.created_at)).where(
            PhoneVerification.phone == phone
        )
        value: datetime | None = (await self._db.execute(stmt)).scalar_one()
        return value

    async def latest_open_code(self, phone: str) -> PhoneVerification | None:
        """The newest unused code for a number; older codes stop working when a new one
        is sent."""
        stmt = (
            select(PhoneVerification)
            .where(PhoneVerification.phone == phone)
            .order_by(PhoneVerification.created_at.desc(), PhoneVerification.id.desc())
            .limit(1)
            .with_for_update()
        )
        row = (await self._db.execute(stmt)).scalar_one_or_none()
        return row if row is not None and row.consumed_at is None else None

    # --- sessions and refresh tokens -------------------------------------------------

    async def session_by_id(
        self, session_id: uuid.UUID, *, lock: bool = False
    ) -> AuthSession | None:
        stmt = select(AuthSession).where(AuthSession.id == session_id)
        if lock:
            stmt = stmt.with_for_update()
        return (await self._db.execute(stmt)).scalar_one_or_none()

    async def refresh_token_by_hash(self, token_hash: str) -> AuthRefreshToken | None:
        stmt = (
            select(AuthRefreshToken)
            .where(AuthRefreshToken.token_hash == token_hash)
            .with_for_update()
        )
        return (await self._db.execute(stmt)).scalar_one_or_none()

    async def live_sessions_for(self, user_id: uuid.UUID, now: datetime) -> list[AuthSession]:
        stmt = (
            select(AuthSession)
            .where(
                AuthSession.user_id == user_id,
                AuthSession.revoked_at.is_(None),
                AuthSession.expires_at > now,
            )
            .order_by(AuthSession.last_active_at.desc())
        )
        return list((await self._db.execute(stmt)).scalars())
