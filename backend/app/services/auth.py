"""Sign-in service — Milestone AUTH-1 (ADR-024, ADR-025).

Applies the rules in ``app.domain.auth_rules`` to stored state. Every decision is made here,
on the server, from the database and the server clock; nothing a client sends about who it
is, when it is or what it may do is trusted.

Enumeration resistance (ADR-013/025): an unknown account, an unverified account and a wrong
PIN produce the same error after the same amount of hashing work; registering a number that
already has an account answers exactly like a new registration, is counted against the same
SMS limits, and sends nothing.

Nothing in this module logs a PIN, code, token, or full phone number or email (ADR-025
§1.8). Log lines carry the user ID and at most the last 4 digits of a phone.
"""

from __future__ import annotations

import secrets
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from fastapi import status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth_tokens import (
    AccessClaims,
    InvalidAccessToken,
    TokenKeys,
    generate_code,
    generate_refresh_token,
    hash_refresh_token,
)
from app.core.exceptions import AppError
from app.core.logging import get_logger
from app.core.mfa import (
    SecretBox,
    SecretBoxError,
    match_step,
    new_recovery_codes,
    new_totp_secret,
    normalise_recovery_code,
    otpauth_uri,
)
from app.core.pin_hashing import PinHasher
from app.core.rate_limit import SlidingWindowLimiter
from app.domain.auth_rules import (
    CODE_RESEND_WAIT,
    CODE_TTL,
    ENROL_CHALLENGE_TTL,
    IDLE_TIMEOUT,
    LOGIN_CHALLENGE_TTL,
    MAX_CODE_TRIES,
    MAX_MFA_TRIES,
    MAX_PIN_TRIES,
    MFA_LOCK,
    PAYOUT_HOLD,
    PIN_LOCK,
    SESSION_MAX,
    SMS_PER_DAY,
    SMS_PER_HOUR,
    STEP_UP_ACTIONS,
    STEP_UP_TTL,
    TRUSTED_DEVICE_TTL,
    mask_phone,
    normalise_email,
    normalise_phone,
    pin_problem,
)
from app.domain.offer_rules import MARKET_REQUESTS_PER_MINUTE
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
from app.providers.bank_check import NameCheck
from app.providers.sms import SmsSender
from app.repositories.identity import IdentityRepository

__all__ = [
    "AuthRuntime",
    "Challenge",
    "EnrolledSession",
    "SignedIn",
    "AuthService",
    "DeviceInfo",
    "Principal",
    "TokenPair",
]

_logger = get_logger(__name__)


# --- errors (contract identifiers only, ADR-025 §2) ---------------------------------------


def _err(code: str, message: str, http: int, **details: object) -> AppError:
    return AppError(code, message, status_code=http, details=dict(details) or None)


def _invalid_credentials() -> AppError:
    return _err(
        "AUTH_401_INVALID_CREDENTIALS",
        "The phone number, email or PIN is incorrect.",
        status.HTTP_401_UNAUTHORIZED,
    )


def _rate_limited(retry_after: timedelta) -> AppError:
    seconds = max(1, int(retry_after.total_seconds() + 0.999))
    return _err(
        "AUTH_429_RATE_LIMITED",
        "Too many attempts. Please wait and try again.",
        status.HTTP_429_TOO_MANY_REQUESTS,
        retry_after_seconds=seconds,
    )


def _unauthorized() -> AppError:
    return _err("AUTH_401_UNAUTHORIZED", "Please log in again.", status.HTTP_401_UNAUTHORIZED)


def _invalid_refresh() -> AppError:
    return _err(
        "AUTH_401_INVALID_REFRESH_TOKEN",
        "Your session has ended. Please log in again.",
        status.HTTP_401_UNAUTHORIZED,
    )


def _invalid_code() -> AppError:
    return _err("AUTH_401_INVALID_OTP", "That code is not right.", status.HTTP_401_UNAUTHORIZED)


def sms_unavailable() -> AppError:
    return _err(
        "SYS_503_SERVICE_UNAVAILABLE",
        "Sign-up is not available right now.",
        status.HTTP_503_SERVICE_UNAVAILABLE,
    )


# --- value types --------------------------------------------------------------------------


@dataclass(frozen=True)
class TokenPair:
    access_token: str
    refresh_token: str


@dataclass(frozen=True)
class Challenge:
    """First factor passed; the second is still needed (ADR-026)."""

    challenge_id: uuid.UUID
    enrolment_required: bool


@dataclass(frozen=True)
class SignedIn:
    tokens: TokenPair
    #: Present when this device became trusted (30 days); shown once.
    device_token: str | None


@dataclass(frozen=True)
class EnrolledSession:
    signed_in: SignedIn
    recovery_codes: list[str]


@dataclass(frozen=True)
class Principal:
    """Who is calling, established from a verified access token and a live session row."""

    user_id: uuid.UUID
    session_id: uuid.UUID


@dataclass(frozen=True)
class DeviceInfo:
    device_id: str | None
    user_agent: str | None
    ip_address: str | None


@dataclass
class AuthRuntime:
    """Process-wide sign-in dependencies, held on ``app.state.auth``."""

    keys: TokenKeys | None
    #: Seals TOTP secrets (ADR-026). Without it no session can be created.
    secret_box: SecretBox | None
    hasher: PinHasher
    sms: SmsSender | None
    clock: Callable[[], datetime]
    #: ADR-025 §1.2: per network address, shared by every auth endpoint.
    address_limiter: SlidingWindowLimiter
    #: Wrong-PIN counting for identifiers with no account, so they lock exactly like real
    #: accounts and the lock itself does not reveal which identifiers exist.
    unknown_identifier_limiter: SlidingWindowLimiter
    #: ADR-035: seals payout account numbers. None: payout accounts are switched off.
    beneficiary_box: SecretBox | None = None
    #: ADR-035: the bank's account name check. None: new accounts stay "pending".
    name_check: NameCheck | None = None
    #: ADR-031: offer and marketplace routes, per signed-in user (not shared with sign-in).
    user_limiter: SlidingWindowLimiter = field(
        default_factory=lambda: SlidingWindowLimiter(
            limit=MARKET_REQUESTS_PER_MINUTE, window=timedelta(minutes=1)
        )
    )


# --- service ------------------------------------------------------------------------------


class AuthService:
    def __init__(self, db: AsyncSession, runtime: AuthRuntime) -> None:
        if runtime.keys is None or runtime.secret_box is None:
            raise sms_unavailable()  # pragma: no cover - guarded by the dependency
        self._db = db
        self._repo = IdentityRepository(db)
        self._rt = runtime
        self._keys: TokenKeys = runtime.keys
        self._box: SecretBox = runtime.secret_box

    def _now(self) -> datetime:
        return self._rt.clock()

    # --- sign-up ------------------------------------------------------------------------

    async def register(self, phone_raw: str, email: str, pin: str) -> None:
        """Create or replace an unverified account and send a code (ADR-025 §2)."""
        phone = normalise_phone(phone_raw)
        if phone is None:
            raise _err(
                "VAL_422_INVALID_PHONE",
                "Enter the phone number with its country code, for example +2348012345678.",
                status.HTTP_422_UNPROCESSABLE_ENTITY,
            )
        problem = pin_problem(pin)
        if problem is not None:
            raise _err("VAL_422_WEAK_PASSWORD", problem, status.HTTP_422_UNPROCESSABLE_ENTITY)
        if self._rt.sms is None:
            raise sms_unavailable()

        now = self._now()
        existing = await self._repo.user_by_phone(phone, lock=True)
        await self._enforce_sms_limits(phone, now)

        # Hash before branching so every path costs the same.
        pin_hash = self._rt.hasher.hash(pin)
        code = generate_code()

        # Checked for every request, existing number or not, so the answer is the same.
        taken = await self._repo.active_user_by_email(email)
        if taken is not None:
            await self._db.rollback()
            raise _err(
                "AUTH_400_EMAIL_TAKEN",
                "This email is already used by another account.",
                status.HTTP_400_BAD_REQUEST,
            )

        if existing is not None and existing.status == "active":
            # The number already has an account. Record an unusable code (nobody knows it)
            # so the SMS limits count this request like any other, send nothing, and answer
            # exactly as for a new sign-up.
            self._repo.add(self._verification(phone, secrets.token_hex(16), now))
            await self._db.commit()
            _logger.info("register_existing_number", extra={"phone": mask_phone(phone)})
            return

        if existing is None:
            user = User(
                id=uuid.uuid4(),
                phone=phone,
                email=email,
                pin_hash=pin_hash,
                status="pending_verification",
                failed_pin_attempts=0,
                created_at=now,
            )
            self._repo.add(user)
        else:  # an earlier, unfinished sign-up for this number is replaced
            existing.email = email
            existing.pin_hash = pin_hash
            existing.failed_pin_attempts = 0
            existing.pin_locked_until = None

        self._repo.add(self._verification(phone, code, now))
        try:
            await self._db.commit()
        except IntegrityError as exc:
            # Two sign-ups for the same new number at the same moment: the row lock cannot
            # cover a row that does not exist yet, so the unique index decides. The loser
            # is told to wait, like any repeat request inside the resend window.
            await self._db.rollback()
            if "uq_users_phone" not in str(exc.orig):
                raise
            raise _rate_limited(CODE_RESEND_WAIT) from None
        # Sent after the commit: a failed send leaves a recorded code the user can ask
        # again for, never a sent code with no record.
        await self._rt.sms.send_code(phone, code)
        _logger.info("register_code_sent", extra={"phone": mask_phone(phone)})

    def _verification(self, phone: str, code: str, now: datetime) -> PhoneVerification:
        return PhoneVerification(
            id=uuid.uuid4(),
            phone=phone,
            code_digest=self._keys.code_digest(phone, code),
            attempts=0,
            created_at=now,
            expires_at=now + CODE_TTL,
        )

    async def _enforce_sms_limits(self, phone: str, now: datetime) -> None:
        last = await self._repo.last_code_sent_at(phone)
        if last is not None and now - last < CODE_RESEND_WAIT:
            await self._db.rollback()
            raise _rate_limited(CODE_RESEND_WAIT - (now - last))
        if await self._repo.codes_sent_since(phone, now - timedelta(hours=1)) >= SMS_PER_HOUR:
            await self._db.rollback()
            raise _rate_limited(timedelta(hours=1))
        if await self._repo.codes_sent_since(phone, now - timedelta(days=1)) >= SMS_PER_DAY:
            await self._db.rollback()
            raise _rate_limited(timedelta(days=1))

    async def verify_phone(self, phone_raw: str, code: str, device: DeviceInfo) -> Challenge:
        """Confirm the number with the latest code and activate the account.

        No session yet: 2FA is set up at sign-up, always (ADR-026), so the answer is an
        enrolment challenge.
        """
        phone = normalise_phone(phone_raw)
        if phone is None:
            raise _invalid_code()
        now = self._now()
        row = await self._repo.latest_open_code(phone)
        if row is None:
            await self._db.rollback()
            raise _invalid_code()
        if now >= row.expires_at:
            await self._db.rollback()
            raise _err(
                "AUTH_410_CHALLENGE_EXPIRED",
                "That code has expired. Ask for a new one.",
                status.HTTP_410_GONE,
            )
        if row.attempts >= MAX_CODE_TRIES:
            remaining = row.expires_at - now  # read before rollback expires the row
            await self._db.rollback()
            raise _rate_limited(remaining)
        if not self._keys.code_matches(phone, code, row.code_digest):
            row.attempts += 1
            await self._db.commit()
            raise _invalid_code()

        row.consumed_at = now
        user = await self._repo.user_by_phone(phone, lock=True)
        if user is None or user.status != "pending_verification":
            # A code for a number with no pending sign-up cannot match (see register), so
            # reaching here means the account changed underneath; refuse without detail.
            await self._db.commit()
            raise _invalid_code()

        user.status = "active"
        user.phone_verified_at = now
        try:
            await self._db.flush()  # the email unique index decides here
            challenge = self._new_challenge(user, "enrol", device, now)
            await self._db.commit()
        except IntegrityError as exc:
            # Only the email clash is translated: another account activated with the same
            # email after this sign-up began (unique among active accounts). Any other
            # integrity failure is a bug and must surface as one, not as "email taken".
            await self._db.rollback()
            if "uq_users_email_active" not in str(exc.orig):
                raise
            raise _err(
                "AUTH_400_EMAIL_TAKEN",
                "This email is already used by another account.",
                status.HTTP_400_BAD_REQUEST,
            ) from None
        _logger.info("phone_verified", extra={"user_id": str(user.id)})
        return challenge

    # --- log-in -------------------------------------------------------------------------

    async def login(
        self, identifier: str, pin: str, device: DeviceInfo, device_token: str | None = None
    ) -> Challenge | SignedIn:
        """PIN first. Then a session only on a trusted device; otherwise a 2FA challenge."""
        now = self._now()
        phone = normalise_phone(identifier)
        email = None if phone else normalise_email(identifier)
        user: User | None = None
        if phone:
            user = await self._repo.user_by_phone(phone, lock=True)
        elif email:
            user = await self._repo.active_user_by_email(email, lock=True)
        if user is not None and user.status != "active":
            user = None

        if user is None:
            key = "id:" + hash_refresh_token((phone or email or identifier).strip().lower())
            self._rt.hasher.verify_dummy(pin)
            await self._db.rollback()
            # Same shape as a real account: the 5th wrong try within 15 minutes, and every
            # try after it, answers "too many attempts".
            limiter = self._rt.unknown_identifier_limiter
            if not limiter.hit(key, now) or limiter.count(key, now) >= MAX_PIN_TRIES:
                raise _rate_limited(PIN_LOCK)
            raise _invalid_credentials()

        locked_until = user.pin_locked_until
        if locked_until is not None and now < locked_until:
            # Read before rollback: a rollback expires loaded rows.
            await self._db.rollback()
            raise _rate_limited(locked_until - now)

        if not self._rt.hasher.verify(user.pin_hash, pin):
            user.failed_pin_attempts += 1
            if user.failed_pin_attempts >= MAX_PIN_TRIES:
                user.failed_pin_attempts = 0
                user.pin_locked_until = now + PIN_LOCK
                await self._db.commit()
                _logger.warning("pin_locked", extra={"user_id": str(user.id)})
                raise _rate_limited(PIN_LOCK)
            await self._db.commit()
            raise _invalid_credentials()

        user.failed_pin_attempts = 0
        user.pin_locked_until = None
        if self._rt.hasher.needs_rehash(user.pin_hash):
            user.pin_hash = self._rt.hasher.hash(pin)

        if await self._repo.active_factor(user.id) is None:
            # Sign-up stopped before the authenticator was added: finish it now.
            challenge = self._new_challenge(user, "enrol", device, now)
            await self._db.commit()
            return challenge

        trusted = await self._trusted_device_for(user.id, device_token, now)
        if trusted is not None:
            trusted.last_used_at = now
            pair = await self._open_session(user, device, now)
            await self._db.commit()
            _logger.info("login", extra={"user_id": str(user.id), "second_factor": "trusted"})
            return SignedIn(tokens=pair, device_token=None)

        challenge = self._new_challenge(user, "login", device, now)
        await self._db.commit()
        return challenge

    async def _open_session(
        self,
        user: User,
        device: DeviceInfo,
        now: datetime,
        pin_verified_at: datetime | None = None,
    ) -> TokenPair:
        session = AuthSession(
            id=uuid.uuid4(),
            user_id=user.id,
            device_id=device.device_id,
            user_agent=device.user_agent,
            ip_address=device.ip_address,
            # The 7-day limit counts from the PIN check, not from the 2FA step after it.
            pin_verified_at=pin_verified_at or now,
            expires_at=(pin_verified_at or now) + SESSION_MAX,
            last_active_at=now,
            created_at=now,
        )
        self._repo.add(session)
        # The models declare no ORM relationships, so the unit of work does not order these
        # inserts by foreign key; flush the parent rows first.
        await self._db.flush()
        refresh = generate_refresh_token()
        self._repo.add(
            AuthRefreshToken(
                id=uuid.uuid4(),
                session_id=session.id,
                token_hash=hash_refresh_token(refresh),
                created_at=now,
            )
        )
        access = self._keys.issue_access(AccessClaims(user.id, session.id), now)
        return TokenPair(access_token=access, refresh_token=refresh)

    # --- refresh ------------------------------------------------------------------------

    async def refresh(self, refresh_token: str) -> TokenPair:
        now = self._now()
        if not refresh_token or len(refresh_token) > 128:
            raise _invalid_refresh()
        token = await self._repo.refresh_token_by_hash(hash_refresh_token(refresh_token))
        if token is None:
            await self._db.rollback()
            raise _invalid_refresh()
        session = await self._repo.session_by_id(token.session_id, lock=True)
        if session is None:  # pragma: no cover - foreign key guarantees it
            await self._db.rollback()
            raise _invalid_refresh()

        if token.used_at is not None:
            # A spent token came back: someone else holds a copy. End the whole session.
            if session.revoked_at is None:
                session.revoked_at = now
                session.revoke_reason = "token_reuse"
            await self._db.commit()
            _logger.warning("refresh_token_reuse", extra={"user_id": str(session.user_id)})
            raise _err(
                "AUTH_401_TOKEN_REUSE_DETECTED",
                "For your security this session was ended. Please log in again.",
                status.HTTP_401_UNAUTHORIZED,
            )

        if not self._session_usable(session, now):
            await self._db.rollback()
            raise _invalid_refresh()
        user = await self._repo.user_by_id(session.user_id)
        if user is None or user.status != "active":
            await self._db.rollback()
            raise _invalid_refresh()

        token.used_at = now
        session.last_active_at = now
        new_refresh = generate_refresh_token()
        self._repo.add(
            AuthRefreshToken(
                id=uuid.uuid4(),
                session_id=session.id,
                token_hash=hash_refresh_token(new_refresh),
                created_at=now,
            )
        )
        access = self._keys.issue_access(AccessClaims(session.user_id, session.id), now)
        await self._db.commit()
        return TokenPair(access_token=access, refresh_token=new_refresh)

    @staticmethod
    def _session_usable(session: AuthSession, now: datetime) -> bool:
        return (
            session.revoked_at is None
            and now < session.expires_at
            and now - session.last_active_at < IDLE_TIMEOUT
        )

    # --- authenticated requests ---------------------------------------------------------

    async def authenticate(self, access_token: str) -> Principal:
        """Verify the token, then the live session row; records activity (idle clock)."""
        now = self._now()
        try:
            claims = self._keys.read_access(access_token, now)
        except InvalidAccessToken:
            raise _unauthorized() from None
        session = await self._repo.session_by_id(claims.session_id, lock=True)
        if (
            session is None
            or session.user_id != claims.user_id
            or not self._session_usable(session, now)
        ):
            await self._db.rollback()
            raise _unauthorized()
        session.last_active_at = now
        await self._db.commit()
        return Principal(user_id=claims.user_id, session_id=claims.session_id)

    async def logout(self, principal: Principal) -> None:
        session = await self._repo.session_by_id(principal.session_id, lock=True)
        if session is not None and session.revoked_at is None:
            session.revoked_at = self._now()
            session.revoke_reason = "logout"
        await self._db.commit()

    async def me(self, principal: Principal) -> User:
        user = await self._repo.user_by_id(principal.user_id)
        if user is None:  # pragma: no cover - a live session implies the user exists
            raise _unauthorized()
        return user

    async def sessions(self, principal: Principal) -> list[AuthSession]:
        now = self._now()
        return [
            s
            for s in await self._repo.live_sessions_for(principal.user_id, now)
            if now - s.last_active_at < IDLE_TIMEOUT
        ]

    async def revoke_session(self, principal: Principal, session_id: uuid.UUID) -> None:
        if session_id == principal.session_id:
            raise _err(
                "AUTH_403_FORBIDDEN",
                "Use log out to end the session you are using.",
                status.HTTP_403_FORBIDDEN,
            )
        session = await self._repo.session_by_id(session_id, lock=True)
        # Another user's session is reported exactly like a missing one.
        if session is None or session.user_id != principal.user_id:
            await self._db.rollback()
            raise _err(
                "RES_404_SESSION_NOT_FOUND",
                "That session was not found.",
                status.HTTP_404_NOT_FOUND,
            )
        if session.revoked_at is None:
            session.revoked_at = self._now()
            session.revoke_reason = "revoked_by_user"
        await self._db.commit()

    # --- second factor (ADR-008, ADR-026) -------------------------------------------------

    def _new_challenge(
        self, user: User, purpose: str, device: DeviceInfo, now: datetime
    ) -> Challenge:
        ttl = ENROL_CHALLENGE_TTL if purpose == "enrol" else LOGIN_CHALLENGE_TTL
        row = MfaChallenge(
            id=uuid.uuid4(),
            user_id=user.id,
            purpose=purpose,
            device_id=device.device_id,
            user_agent=device.user_agent,
            ip_address=device.ip_address,
            attempts=0,
            created_at=now,
            expires_at=now + ttl,
        )
        self._repo.add(row)
        return Challenge(challenge_id=row.id, enrolment_required=purpose == "enrol")

    async def _open_challenge(
        self, challenge_id: uuid.UUID, purpose: str, now: datetime
    ) -> tuple[MfaChallenge, User]:
        """Load and check a challenge; refuse expired, used, over-tried or locked ones."""
        row = await self._repo.challenge(challenge_id)
        if row is None or row.purpose != purpose or row.consumed_at is not None:
            await self._db.rollback()
            raise _invalid_code()
        if now >= row.expires_at:
            await self._db.rollback()
            raise _err(
                "AUTH_410_CHALLENGE_EXPIRED",
                "This step has expired. Please log in again.",
                status.HTTP_410_GONE,
            )
        user = await self._repo.user_for_update(row.user_id)
        if user is None or user.status != "active":  # pragma: no cover - FK and activation
            await self._db.rollback()
            raise _invalid_code()
        await self._refuse_if_mfa_locked(user, now)
        if row.attempts >= MAX_MFA_TRIES:
            remaining = row.expires_at - now
            await self._db.rollback()
            raise _rate_limited(remaining)
        return row, user

    async def _refuse_if_mfa_locked(self, user: User, now: datetime) -> None:
        locked_until = user.mfa_locked_until
        if locked_until is not None and now < locked_until:
            await self._db.rollback()
            raise _rate_limited(locked_until - now)

    async def _mfa_failure(
        self, user: User, now: datetime, challenge: MfaChallenge | None = None
    ) -> AppError:
        """Count a wrong code. The 5th wrong code locks 2FA for 15 minutes (ADR-008)."""
        if challenge is not None:
            challenge.attempts += 1
        user.mfa_failed_attempts += 1
        locked = user.mfa_failed_attempts >= MAX_MFA_TRIES
        if locked:
            user.mfa_failed_attempts = 0
            user.mfa_locked_until = now + MFA_LOCK
        user_id = str(user.id)
        await self._db.commit()
        if locked:
            self._alert(user_id, "mfa_locked")
            return _rate_limited(MFA_LOCK)
        return _invalid_code()

    def _mfa_success(self, user: User) -> None:
        user.mfa_failed_attempts = 0
        user.mfa_locked_until = None

    @staticmethod
    def _alert(user_id: str, kind: str) -> None:
        """ADR-008 asks for an email; no provider exists yet, so this is the audit trail."""
        _logger.warning("security_alert", extra={"user_id": user_id, "alert": kind})

    def _check_code(self, factor: MfaFactor, user: User, code: str, now: datetime) -> int | None:
        try:
            secret = self._box.open(factor.secret_sealed, bound_to=str(user.id))
        except SecretBoxError:
            _logger.error("mfa_secret_unreadable", extra={"user_id": str(user.id)})
            return None
        return match_step(secret, code, now, factor.last_used_step)

    def _new_factor(self, user: User, now: datetime) -> tuple[MfaFactor, str]:
        secret = new_totp_secret()
        factor = MfaFactor(
            id=uuid.uuid4(),
            user_id=user.id,
            kind="totp",
            secret_sealed=self._box.seal(secret, bound_to=str(user.id)),
            created_at=now,
        )
        self._repo.add(factor)
        return factor, otpauth_uri(secret, mask_phone(user.phone))

    async def _issue_recovery_codes(self, user: User, now: datetime) -> list[str]:
        await self._repo.revoke_recovery_codes(user.id, now)
        codes = new_recovery_codes()
        for code in codes:
            normalised = normalise_recovery_code(code)
            if normalised is None:  # pragma: no cover - generated codes are always valid
                raise RuntimeError("generated recovery code failed normalisation")
            self._repo.add(
                RecoveryCode(
                    id=uuid.uuid4(),
                    user_id=user.id,
                    code_digest=self._keys.recovery_digest(user.id, normalised),
                    created_at=now,
                )
            )
        return codes

    def _trust_device(
        self, user: User, device_id: str | None, agent: str | None, now: datetime
    ) -> str:
        token = generate_refresh_token()
        self._repo.add(
            TrustedDevice(
                id=uuid.uuid4(),
                user_id=user.id,
                token_hash=hash_refresh_token(token),
                device_id=device_id,
                user_agent=agent,
                created_at=now,
                expires_at=now + TRUSTED_DEVICE_TTL,
            )
        )
        return token

    async def _trusted_device_for(
        self, user_id: uuid.UUID, token: str | None, now: datetime
    ) -> TrustedDevice | None:
        if not token or len(token) > 128:
            return None
        row = await self._repo.trusted_device(hash_refresh_token(token))
        if (
            row is None
            or row.user_id != user_id
            or row.revoked_at is not None
            or now >= row.expires_at
        ):
            return None
        return row

    async def enrol_start(self, challenge_id: uuid.UUID) -> tuple[str, str]:
        """New authenticator secret for a sign-up (or unfinished sign-up). Shown once."""
        now = self._now()
        challenge, user = await self._open_challenge(challenge_id, "enrol", now)
        if await self._repo.active_factor(user.id) is not None:
            await self._db.rollback()
            raise _err(
                "AUTH_403_FORBIDDEN",
                "An authenticator is already set up.",
                status.HTTP_403_FORBIDDEN,
            )
        if challenge.factor_id is not None:  # started again: the earlier secret is dropped
            earlier = await self._repo.factor_by_id(challenge.factor_id)
            if earlier is not None and earlier.confirmed_at is None:
                earlier.revoked_at = now
        factor, uri = self._new_factor(user, now)
        await self._db.flush()
        challenge.factor_id = factor.id
        secret = self._box.open(factor.secret_sealed, bound_to=str(user.id))
        await self._db.commit()
        return secret, uri

    async def enrol_confirm(
        self, challenge_id: uuid.UUID, code: str, device: DeviceInfo
    ) -> EnrolledSession:
        """First code from the new authenticator: 2FA is on, the user is signed in."""
        now = self._now()
        challenge, user = await self._open_challenge(challenge_id, "enrol", now)
        factor = (
            await self._repo.factor_by_id(challenge.factor_id)
            if challenge.factor_id is not None
            else None
        )
        if factor is None or factor.revoked_at is not None or factor.confirmed_at is not None:
            await self._db.rollback()
            raise _invalid_code()
        step = self._check_code(factor, user, code, now)
        if step is None:
            raise await self._mfa_failure(user, now, challenge)

        factor.confirmed_at = now
        factor.last_used_step = step
        challenge.consumed_at = now
        self._mfa_success(user)
        codes = await self._issue_recovery_codes(user, now)
        device_token = self._trust_device(user, device.device_id, device.user_agent, now)
        pair = await self._open_session(user, device, now, pin_verified_at=challenge.created_at)
        await self._db.commit()
        _logger.info("mfa_enrolled", extra={"user_id": str(user.id)})
        return EnrolledSession(SignedIn(pair, device_token), codes)

    async def mfa_verify(
        self,
        challenge_id: uuid.UUID,
        device: DeviceInfo,
        *,
        otp_code: str | None = None,
        recovery_code: str | None = None,
    ) -> SignedIn:
        """Contract §3.1: finish log-in with the authenticator code or a recovery code."""
        if (otp_code is None) == (recovery_code is None):
            raise _invalid_code()
        now = self._now()
        challenge, user = await self._open_challenge(challenge_id, "login", now)
        factor = await self._repo.active_factor(user.id, lock=True)
        if factor is None:  # pragma: no cover - login only issues "login" challenges with one
            await self._db.rollback()
            raise _invalid_code()

        if otp_code is not None:
            step = self._check_code(factor, user, otp_code, now)
            if step is None:
                raise await self._mfa_failure(user, now, challenge)
            factor.last_used_step = step
            device_token: str | None = self._trust_device(
                user, device.device_id, device.user_agent, now
            )
        else:
            normalised = normalise_recovery_code(recovery_code or "")
            row = (
                await self._repo.unused_recovery_code(
                    user.id, self._keys.recovery_digest(user.id, normalised)
                )
                if normalised
                else None
            )
            if row is None:
                raise await self._mfa_failure(user, now, challenge)
            row.used_at = now
            # ADR-008: recovery means the phone may be lost — end trust everywhere, do not
            # trust this device, and hold payouts for 24 hours.
            await self._repo.revoke_trusted_devices(user.id, now)
            user.payout_hold_until = now + PAYOUT_HOLD
            device_token = None
            self._alert(str(user.id), "recovery_code_used")

        challenge.consumed_at = now
        self._mfa_success(user)
        pair = await self._open_session(user, device, now, pin_verified_at=challenge.created_at)
        await self._db.commit()
        if device_token is not None:
            self._alert(str(user.id), "new_device_sign_in")
        return SignedIn(pair, device_token)

    # --- step-up and account security -------------------------------------------------------

    async def step_up(self, principal: Principal, action: str, code: str) -> str:
        """One fresh code → one approval for one action, valid 5 minutes (ADR-026)."""
        if action not in STEP_UP_ACTIONS:
            raise _err("AUTH_403_FORBIDDEN", "Unknown action.", status.HTTP_403_FORBIDDEN)
        now = self._now()
        user = await self._repo.user_for_update(principal.user_id)
        if user is None:  # pragma: no cover
            raise _unauthorized()
        await self._refuse_if_mfa_locked(user, now)
        factor = await self._repo.active_factor(user.id, lock=True)
        step = self._check_code(factor, user, code, now) if factor is not None else None
        if factor is None or step is None:
            raise await self._mfa_failure(user, now)
        factor.last_used_step = step
        self._mfa_success(user)
        token = generate_refresh_token()
        self._repo.add(
            StepUpGrant(
                id=uuid.uuid4(),
                user_id=user.id,
                session_id=principal.session_id,
                action=action,
                token_hash=hash_refresh_token(token),
                created_at=now,
                expires_at=now + STEP_UP_TTL,
            )
        )
        await self._db.commit()
        return token

    async def consume_step_up(self, principal: Principal, action: str, token: str | None) -> None:
        """Spend a step-up approval for ``action``. The caller commits with its own work."""
        now = self._now()
        grant = (
            await self._repo.step_up_grant(hash_refresh_token(token))
            if token and len(token) <= 128
            else None
        )
        if (
            grant is None
            or grant.user_id != principal.user_id
            or grant.session_id != principal.session_id
            or grant.action != action
            or grant.used_at is not None
            or now >= grant.expires_at
        ):
            await self._db.rollback()
            raise _err(
                "AUTH_403_FORBIDDEN",
                "Please confirm with your authenticator code first.",
                status.HTTP_403_FORBIDDEN,
                step_up_action=action,
            )
        grant.used_at = now

    async def regenerate_recovery_codes(
        self, principal: Principal, step_up_token: str | None
    ) -> list[str]:
        await self.consume_step_up(principal, "recovery_codes.regenerate", step_up_token)
        user = await self._repo.user_for_update(principal.user_id)
        if user is None:  # pragma: no cover
            raise _unauthorized()
        codes = await self._issue_recovery_codes(user, self._now())
        await self._db.commit()
        self._alert(str(user.id), "recovery_codes_regenerated")
        return codes

    async def replace_start(
        self, principal: Principal, step_up_token: str | None
    ) -> tuple[str, str]:
        """Begin replacing the authenticator. Needs a step-up for ``mfa.change``."""
        await self.consume_step_up(principal, "mfa.change", step_up_token)
        now = self._now()
        user = await self._repo.user_for_update(principal.user_id)
        if user is None:  # pragma: no cover
            raise _unauthorized()
        factor, uri = self._new_factor(user, now)
        await self._db.flush()
        secret = self._box.open(factor.secret_sealed, bound_to=str(user.id))
        await self._db.commit()
        return secret, uri

    async def replace_confirm(self, principal: Principal, code: str) -> None:
        """First code from the new authenticator: it replaces the old one (ADR-008)."""
        now = self._now()
        user = await self._repo.user_for_update(principal.user_id)
        if user is None:  # pragma: no cover
            raise _unauthorized()
        await self._refuse_if_mfa_locked(user, now)
        pending = await self._repo.latest_pending_factor(user.id, now - ENROL_CHALLENGE_TTL)
        if pending is None:
            await self._db.rollback()
            raise _invalid_code()
        step = self._check_code(pending, user, code, now)
        if step is None:
            raise await self._mfa_failure(user, now)
        old = await self._repo.active_factor(user.id, lock=True)
        if old is not None:
            old.revoked_at = now
            await self._db.flush()  # free the one-active-factor index before confirming
        pending.confirmed_at = now
        pending.last_used_step = step
        self._mfa_success(user)
        # A reset: end trust everywhere and hold payouts for 24 hours (ADR-008).
        await self._repo.revoke_trusted_devices(user.id, now)
        user.payout_hold_until = now + PAYOUT_HOLD
        await self._db.commit()
        self._alert(str(user.id), "authenticator_replaced")

    async def trusted_devices(self, principal: Principal) -> list[TrustedDevice]:
        return await self._repo.live_trusted_devices(principal.user_id, self._now())

    async def revoke_trusted_device(self, principal: Principal, device_id: uuid.UUID) -> None:
        row = await self._repo.trusted_device_by_id(device_id)
        if row is None or row.user_id != principal.user_id or row.revoked_at is not None:
            await self._db.rollback()
            raise _err("RES_404_NOT_FOUND", "That device was not found.", status.HTTP_404_NOT_FOUND)
        row.revoked_at = self._now()
        await self._db.commit()
