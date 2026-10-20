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

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.identity import (
    AuthRefreshToken,
    AuthSession,
    MfaChallenge,
    MfaFactor,
    PhoneVerification,
    RecoveryCode,
    StepUpGrant,
    TrustedDevice,
    User,
)

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

    async def latest_open_code(
        self, phone: str, purpose: str = "signup"
    ) -> PhoneVerification | None:
        """The newest unused code for a number and purpose; older codes stop working when a
        new one is sent."""
        stmt = (
            select(PhoneVerification)
            .where(PhoneVerification.phone == phone, PhoneVerification.purpose == purpose)
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

    # --- second factor (AUTH-2) ------------------------------------------------------

    async def user_for_update(self, user_id: uuid.UUID) -> User | None:
        stmt = select(User).where(User.id == user_id).with_for_update()
        return (await self._db.execute(stmt)).scalar_one_or_none()

    async def active_factor(self, user_id: uuid.UUID, *, lock: bool = False) -> MfaFactor | None:
        stmt = select(MfaFactor).where(
            MfaFactor.user_id == user_id,
            MfaFactor.confirmed_at.is_not(None),
            MfaFactor.revoked_at.is_(None),
        )
        if lock:
            stmt = stmt.with_for_update()
        return (await self._db.execute(stmt)).scalar_one_or_none()

    async def factor_by_id(self, factor_id: uuid.UUID) -> MfaFactor | None:
        stmt = select(MfaFactor).where(MfaFactor.id == factor_id).with_for_update()
        return (await self._db.execute(stmt)).scalar_one_or_none()

    async def latest_pending_factor(self, user_id: uuid.UUID, since: datetime) -> MfaFactor | None:
        stmt = (
            select(MfaFactor)
            .where(
                MfaFactor.user_id == user_id,
                MfaFactor.confirmed_at.is_(None),
                MfaFactor.revoked_at.is_(None),
                MfaFactor.created_at > since,
            )
            .order_by(MfaFactor.created_at.desc())
            .limit(1)
            .with_for_update()
        )
        return (await self._db.execute(stmt)).scalar_one_or_none()

    async def challenge(self, challenge_id: uuid.UUID) -> MfaChallenge | None:
        stmt = select(MfaChallenge).where(MfaChallenge.id == challenge_id).with_for_update()
        return (await self._db.execute(stmt)).scalar_one_or_none()

    async def unused_recovery_code(self, user_id: uuid.UUID, digest: str) -> RecoveryCode | None:
        stmt = (
            select(RecoveryCode)
            .where(
                RecoveryCode.user_id == user_id,
                RecoveryCode.code_digest == digest,
                RecoveryCode.used_at.is_(None),
                RecoveryCode.revoked_at.is_(None),
            )
            .with_for_update()
        )
        return (await self._db.execute(stmt)).scalar_one_or_none()

    async def revoke_recovery_codes(self, user_id: uuid.UUID, now: datetime) -> None:
        await self._db.execute(
            update(RecoveryCode)
            .where(
                RecoveryCode.user_id == user_id,
                RecoveryCode.used_at.is_(None),
                RecoveryCode.revoked_at.is_(None),
            )
            .values(revoked_at=now)
        )

    async def trusted_device(self, token_hash: str) -> TrustedDevice | None:
        stmt = select(TrustedDevice).where(TrustedDevice.token_hash == token_hash).with_for_update()
        return (await self._db.execute(stmt)).scalar_one_or_none()

    async def trusted_device_by_id(self, device_id: uuid.UUID) -> TrustedDevice | None:
        stmt = select(TrustedDevice).where(TrustedDevice.id == device_id).with_for_update()
        return (await self._db.execute(stmt)).scalar_one_or_none()

    async def live_trusted_devices(self, user_id: uuid.UUID, now: datetime) -> list[TrustedDevice]:
        stmt = (
            select(TrustedDevice)
            .where(
                TrustedDevice.user_id == user_id,
                TrustedDevice.revoked_at.is_(None),
                TrustedDevice.expires_at > now,
            )
            .order_by(TrustedDevice.created_at.desc())
        )
        return list((await self._db.execute(stmt)).scalars())

    async def revoke_trusted_devices(self, user_id: uuid.UUID, now: datetime) -> None:
        await self._db.execute(
            update(TrustedDevice)
            .where(TrustedDevice.user_id == user_id, TrustedDevice.revoked_at.is_(None))
            .values(revoked_at=now)
        )

    async def step_up_grant(self, token_hash: str) -> StepUpGrant | None:
        stmt = select(StepUpGrant).where(StepUpGrant.token_hash == token_hash).with_for_update()
        return (await self._db.execute(stmt)).scalar_one_or_none()
