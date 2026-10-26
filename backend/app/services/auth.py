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
from app.core.mfa import SecretBox
from app.core.pin_hashing import PinHasher
from app.core.rate_limit import SlidingWindowLimiter
from app.domain.auth_rules import (
    CHECK_CODE_TTL,
    CHECKS_PER_DAY,
    CHECKS_PER_HOUR,
    CODE_RESEND_WAIT,
    CODE_TTL,
    FACE_CHECK_TTL,
    IDLE_TIMEOUT,
    MAX_CODE_TRIES,
    MAX_MFA_TRIES,
    MAX_PIN_TRIES,
    MFA_LOCK,
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
    PhoneVerification,
    StepUpGrant,
    TrustedDevice,
    User,
    VerificationCheck,
)
from app.models.kyc import KycCase
from app.providers.bank_check import NameCheck
from app.providers.didit import KycSessionProvider
from app.providers.email import EmailSender, mask_email
from app.providers.face import FaceCheckError, FaceCheckProvider, NoReferenceFace
from app.providers.pretend_bank import PretendBank
from app.providers.push import PushSender
from app.providers.sms import SmsSender
from app.providers.tier_checks import TierCheckProvider
from app.repositories.identity import IdentityRepository

__all__ = [
    "AuthRuntime",
    "CheckStarted",
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


def _check_unavailable() -> AppError:
    return _err(
        "SYS_503_SERVICE_UNAVAILABLE",
        "We can't send a code right now. Please try again later.",
        status.HTTP_503_SERVICE_UNAVAILABLE,
    )


def _face_unavailable() -> AppError:
    return _err(
        "SYS_503_SERVICE_UNAVAILABLE",
        "The face check is not available right now. Please try again later.",
        status.HTTP_503_SERVICE_UNAVAILABLE,
    )


def _face_failed() -> AppError:
    return _err(
        "AUTH_401_FACE_CHECK_FAILED",
        "We could not match your face to your identity check. Please try again.",
        status.HTTP_401_UNAUTHORIZED,
    )


#: Which checks each route may finish (ADR-054).
SIGN_IN_PURPOSES = frozenset({"signup", "login"})
FACE_START_PURPOSES = frozenset({"login", "pin_reset"})
STEP_UP_PURPOSE = frozenset({"step_up"})
PIN_RESET_PURPOSE = frozenset({"pin_reset"})


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
class CheckStarted:
    """The PIN (or SMS code) passed; the second check is still needed (ADR-054).

    ``method``: ``email`` (a code to the account email), ``sms_email`` (an SMS code and an
    email code) or ``face`` (a face check). The hints are masked, for the screen.
    """

    check_id: uuid.UUID
    purpose: str
    method: str
    email_hint: str | None
    phone_hint: str | None


@dataclass(frozen=True)
class SignedIn:
    tokens: TokenPair
    #: Present when this device became trusted (30 days); shown once.
    device_token: str | None


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
    #: Sealed the old authenticator secrets (ADR-026; unused since ADR-054). Optional.
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
    #: ADR-039: the identity-check provider (Didit). None: identity checks are switched off.
    kyc_provider: KycSessionProvider | None = None
    #: ADR-041: key for the ID-document hash (one person, one verified account).
    kyc_identity_key: bytes | None = None
    #: ADR-037: the pretend partner bank. None: no escrow is opened (no real partner yet).
    pretend_bank: PretendBank | None = None
    #: ADR-052: phone push. None: notifications stay in-app only.
    push_sender: PushSender | None = None
    #: ADR-054: email codes and "was this you?" alerts. None: sign-up and code checks are off.
    email: EmailSender | None = None
    #: ADR-054: the face check (Didit biometric authentication). None: face checks are off.
    face: FaceCheckProvider | None = None
    #: ADR-058: BVN and proof-of-address checks for higher tiers. None: those checks are off.
    tier_checks: TierCheckProvider | None = None
    #: ADR-031: offer and marketplace routes, per signed-in user (not shared with sign-in).
    user_limiter: SlidingWindowLimiter = field(
        default_factory=lambda: SlidingWindowLimiter(
            limit=MARKET_REQUESTS_PER_MINUTE, window=timedelta(minutes=1)
        )
    )


# --- service ------------------------------------------------------------------------------


class AuthService:
    def __init__(self, db: AsyncSession, runtime: AuthRuntime) -> None:
        if runtime.keys is None:
            raise sms_unavailable()  # pragma: no cover - guarded by the dependency
        self._db = db
        self._repo = IdentityRepository(db)
        self._rt = runtime
        self._keys: TokenKeys = runtime.keys

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
        if self._rt.sms is None or self._rt.email is None:
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

    async def verify_phone(self, phone_raw: str, code: str, device: DeviceInfo) -> CheckStarted:
        """Confirm the number with the latest code and activate the account.

        No session yet: a code goes to the account email next (ADR-054), so both the phone
        and the email are proven before the first session.
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
            check, email_code, _ = await self._new_check(user, "signup", device, now)
            started = self._started(check, user)
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
        await self._send_codes(user, email_code, None)
        return started

    # --- log-in -------------------------------------------------------------------------

    async def login(
        self, identifier: str, pin: str, device: DeviceInfo, device_token: str | None = None
    ) -> CheckStarted | SignedIn:
        """PIN first. Then a session only on a trusted device; otherwise the second check:
        SMS + email codes before the identity check, a face check after it (ADR-054)."""
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

        trusted = await self._trusted_device_for(user.id, device_token, now)
        if trusted is not None:
            trusted.last_used_at = now
            pair = await self._open_session(user, device, now)
            await self._db.commit()
            _logger.info("login", extra={"user_id": str(user.id), "second_factor": "trusted"})
            return SignedIn(tokens=pair, device_token=None)

        check, email_code, sms_code = await self._new_check(user, "login", device, now)
        started = self._started(check, user)
        await self._db.commit()
        await self._send_codes(user, email_code, sms_code)
        return started

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
            # The 7-day limit counts from the PIN check, not from the second check after it.
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

    async def me(self, principal: Principal) -> tuple[User, KycCase | None]:
        """The account, and the identity from its latest approved check (ADR-055)."""
        user = await self._repo.user_by_id(principal.user_id)
        if user is None:  # pragma: no cover - a live session implies the user exists
            raise _unauthorized()
        identity = await self._repo.latest_approved_kyc(user.id)
        return user, identity

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

    # --- the second check after the PIN (ADR-054) -------------------------------------------

    async def _refuse_if_mfa_locked(self, user: User, now: datetime) -> None:
        locked_until = user.mfa_locked_until
        if locked_until is not None and now < locked_until:
            await self._db.rollback()
            raise _rate_limited(locked_until - now)

    async def _mfa_failure(
        self,
        user: User,
        now: datetime,
        check: VerificationCheck | None = None,
        wrong: AppError | None = None,
    ) -> AppError:
        """Count a failed check. The 5th failure locks checks for 15 minutes (ADR-008)."""
        if check is not None:
            check.attempts = min(check.attempts + 1, MAX_MFA_TRIES)
        user.mfa_failed_attempts += 1
        locked = user.mfa_failed_attempts >= MAX_MFA_TRIES
        if locked:
            user.mfa_failed_attempts = 0
            user.mfa_locked_until = now + MFA_LOCK
        await self._db.commit()
        if locked:
            await self._alert(user, "checks_locked")
            return _rate_limited(MFA_LOCK)
        return wrong or _invalid_code()

    def _mfa_success(self, user: User) -> None:
        user.mfa_failed_attempts = 0
        user.mfa_locked_until = None

    async def _alert(self, user: User, kind: str, device: DeviceInfo | None = None) -> None:
        """ADR-054: a "was this you?" email, sent after the change is committed. A failed
        send is logged, never undoes the change."""
        _logger.warning("security_alert", extra={"user_id": str(user.id), "alert": kind})
        if self._rt.email is None:
            return
        try:
            await self._rt.email.send_alert(user.email, kind, device.user_agent if device else None)
        except Exception as exc:  # noqa: BLE001 - an alert must never break the request
            _logger.error(
                "security_alert_not_sent",
                extra={"user_id": str(user.id), "alert": kind, "error": type(exc).__name__},
            )

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

    async def _method_for(self, user: User, purpose: str) -> str:
        """ADR-054: after an approved identity check, the face; before it, codes."""
        if purpose == "signup":
            return "email"
        if await self._repo.has_approved_kyc(user.id):
            return "face"
        return "sms_email" if purpose == "login" else "email"

    async def _new_check(
        self,
        user: User,
        purpose: str,
        device: DeviceInfo | None,
        now: datetime,
        *,
        action: str | None = None,
        session_id: uuid.UUID | None = None,
    ) -> tuple[VerificationCheck, str | None, str | None]:
        """Record a check and make its codes. The caller commits, then ``_send_codes``."""
        await self._refuse_if_mfa_locked(user, now)
        since_hour = await self._repo.checks_since(user.id, now - timedelta(hours=1))
        since_day = await self._repo.checks_since(user.id, now - timedelta(days=1))
        if since_hour >= CHECKS_PER_HOUR or since_day >= CHECKS_PER_DAY:
            await self._db.rollback()
            raise _rate_limited(
                timedelta(hours=1) if since_hour >= CHECKS_PER_HOUR else timedelta(days=1)
            )
        method = await self._method_for(user, purpose)
        if method != "face" and self._rt.email is None:
            await self._db.rollback()
            raise _check_unavailable()
        if method == "sms_email" and self._rt.sms is None:
            await self._db.rollback()
            raise _check_unavailable()
        if method == "face" and self._rt.face is None:
            await self._db.rollback()
            raise _face_unavailable()
        check_id = uuid.uuid4()
        email_code = generate_code() if method != "face" else None
        sms_code = generate_code() if method == "sms_email" else None
        row = VerificationCheck(
            id=check_id,
            user_id=user.id,
            purpose=purpose,
            method=method,
            action=action,
            session_id=session_id,
            email_code_digest=(
                self._keys.code_digest(f"check:{check_id}:email", email_code)
                if email_code
                else None
            ),
            sms_code_digest=(
                self._keys.code_digest(f"check:{check_id}:sms", sms_code) if sms_code else None
            ),
            device_id=device.device_id if device else None,
            user_agent=device.user_agent if device else None,
            ip_address=device.ip_address if device else None,
            attempts=0,
            created_at=now,
            expires_at=now + (FACE_CHECK_TTL if method == "face" else CHECK_CODE_TTL),
        )
        self._repo.add(row)
        return row, email_code, sms_code

    async def _send_codes(self, user: User, email_code: str | None, sms_code: str | None) -> None:
        """After the commit: a failed send leaves a check the user can start again."""
        if email_code is not None and self._rt.email is not None:
            await self._rt.email.send_code(user.email, email_code)
        if sms_code is not None and self._rt.sms is not None:
            await self._rt.sms.send_code(user.phone, sms_code)

    @staticmethod
    def _started(row: VerificationCheck, user: User) -> CheckStarted:
        return CheckStarted(
            check_id=row.id,
            purpose=row.purpose,
            method=row.method,
            email_hint=mask_email(user.email) if row.method != "face" else None,
            phone_hint=mask_phone(user.phone) if row.method == "sms_email" else None,
        )

    async def _open_check(
        self,
        check_id: uuid.UUID,
        purposes: frozenset[str],
        now: datetime,
        principal: Principal | None = None,
    ) -> tuple[VerificationCheck, User]:
        """Load a live check; refuse used, expired, over-tried, failed or someone else's."""
        row = await self._repo.check(check_id)
        if (
            row is None
            or row.purpose not in purposes
            or row.consumed_at is not None
            or (row.purpose == "step_up") != (principal is not None)
            or (
                principal is not None
                and (row.user_id != principal.user_id or row.session_id != principal.session_id)
            )
        ):
            await self._db.rollback()
            raise _invalid_code()
        if now >= row.expires_at:
            await self._db.rollback()
            raise _err(
                "AUTH_410_CHALLENGE_EXPIRED",
                "This step has expired. Please start again.",
                status.HTTP_410_GONE,
            )
        user = await self._repo.user_for_update(row.user_id)
        if user is None or user.status != "active":  # pragma: no cover - FK and activation
            await self._db.rollback()
            raise _invalid_code()
        await self._refuse_if_mfa_locked(user, now)
        if row.face_result == "declined":
            await self._db.rollback()
            raise _face_failed()
        if row.attempts >= MAX_MFA_TRIES:
            remaining = row.expires_at - now
            await self._db.rollback()
            raise _rate_limited(remaining)
        return row, user

    async def _match_codes(
        self,
        row: VerificationCheck,
        user: User,
        now: datetime,
        email_code: str | None,
        sms_code: str | None,
    ) -> None:
        if row.method == "face" or row.email_code_digest is None:
            await self._db.rollback()
            raise _invalid_code()
        ok = email_code is not None and self._keys.code_matches(
            f"check:{row.id}:email", email_code, row.email_code_digest
        )
        if row.method == "sms_email":
            ok = (
                ok
                and sms_code is not None
                and row.sms_code_digest is not None
                and self._keys.code_matches(f"check:{row.id}:sms", sms_code, row.sms_code_digest)
            )
        if not ok:
            raise await self._mfa_failure(user, now, row)
        row.completed_at = now
        self._mfa_success(user)

    async def _match_face(self, row: VerificationCheck, user: User, now: datetime) -> None:
        """Ask the provider for the result. Fails closed (ADR-054)."""
        if row.completed_at is not None:
            return
        if row.method != "face" or row.face_session_id is None:
            await self._db.rollback()
            raise _err(
                "AUTH_409_FACE_CHECK_NOT_STARTED",
                "Please take the face check first.",
                status.HTTP_409_CONFLICT,
            )
        if self._rt.face is None:
            await self._db.rollback()
            raise _face_unavailable()
        try:
            outcome = await self._rt.face.outcome(row.face_session_id, str(user.id))
        except FaceCheckError as exc:
            await self._db.rollback()
            _logger.error("face_check_unavailable", extra={"error": str(exc)})
            raise _face_unavailable() from None
        if outcome == "pending":
            await self._db.rollback()
            raise _err(
                "AUTH_409_FACE_CHECK_PENDING",
                "Your face check is not finished yet.",
                status.HTTP_409_CONFLICT,
            )
        if outcome != "approved":
            row.face_result = "declined"
            raise await self._mfa_failure(user, now, row, _face_failed())
        row.face_result = "approved"
        row.completed_at = now
        self._mfa_success(user)

    async def face_start(
        self, check_id: uuid.UUID, principal: Principal | None = None
    ) -> str | None:
        """Open the provider's selfie page for a face check. Starting again counts as a try.

        Returns the page link (shown once, never stored), or None for the local developer
        check, which needs no page.
        """
        now = self._now()
        purposes = STEP_UP_PURPOSE if principal is not None else FACE_START_PURPOSES
        row, user = await self._open_check(check_id, purposes, now, principal)
        if row.method != "face" or row.completed_at is not None:
            await self._db.rollback()
            raise _invalid_code()
        if self._rt.face is None:
            await self._db.rollback()
            raise _face_unavailable()
        try:
            session = await self._rt.face.start(
                str(user.id), {"check_id": str(row.id), "purpose": row.purpose}
            )
        except NoReferenceFace:
            await self._db.rollback()
            raise _err(
                "AUTH_409_NO_FACE_ON_FILE",
                "We have no identity-check photo to compare with. Please contact Support.",
                status.HTTP_409_CONFLICT,
            ) from None
        except FaceCheckError as exc:
            await self._db.rollback()
            _logger.error("face_check_unavailable", extra={"error": str(exc)})
            raise _face_unavailable() from None
        if row.face_session_id is not None:
            row.attempts = min(row.attempts + 1, MAX_MFA_TRIES)
        row.face_session_id = session.session_id
        await self._db.commit()
        _logger.info("face_check_started", extra={"user_id": str(user.id)})
        return session.url

    async def _finish_sign_in(
        self, row: VerificationCheck, user: User, device: DeviceInfo, now: datetime
    ) -> SignedIn:
        row.consumed_at = now
        device_token = self._trust_device(user, device.device_id, device.user_agent, now)
        pair = await self._open_session(user, device, now, pin_verified_at=row.created_at)
        await self._db.commit()
        _logger.info("signed_in", extra={"user_id": str(user.id), "check": row.method})
        if row.purpose == "login":
            await self._alert(user, "new_device_sign_in", device)
        return SignedIn(pair, device_token)

    async def check_codes(
        self,
        check_id: uuid.UUID,
        device: DeviceInfo,
        email_code: str | None,
        sms_code: str | None = None,
    ) -> SignedIn:
        """Sign-up (email code) or log-in before the identity check (SMS + email codes)."""
        now = self._now()
        row, user = await self._open_check(check_id, SIGN_IN_PURPOSES, now)
        await self._match_codes(row, user, now, email_code, sms_code)
        return await self._finish_sign_in(row, user, device, now)

    async def face_finish(self, check_id: uuid.UUID, device: DeviceInfo) -> SignedIn:
        """Log-in on a new phone after the identity check: the face check result."""
        now = self._now()
        row, user = await self._open_check(check_id, SIGN_IN_PURPOSES, now)
        await self._match_face(row, user, now)
        return await self._finish_sign_in(row, user, device, now)

    # --- step-up: one approval for one sensitive action (ADR-026, ADR-054) --------------------

    def _grant(self, principal: Principal, action: str, now: datetime) -> str:
        token = generate_refresh_token()
        self._repo.add(
            StepUpGrant(
                id=uuid.uuid4(),
                user_id=principal.user_id,
                session_id=principal.session_id,
                action=action,
                token_hash=hash_refresh_token(token),
                created_at=now,
                expires_at=now + STEP_UP_TTL,
            )
        )
        return token

    @staticmethod
    def _known_action(action: str) -> None:
        if action not in STEP_UP_ACTIONS:
            raise _err("AUTH_403_FORBIDDEN", "Unknown action.", status.HTTP_403_FORBIDDEN)

    async def step_up_biometric(self, principal: Principal, action: str, unlock_key: str) -> str:
        """Fingerprint/Face ID on a trusted phone: the key the phone released after it.

        The key is the one this session holds for unlocking (ADR-048); it only works while
        the phone it was given to is still trusted.
        """
        self._known_action(action)
        now = self._now()
        user = await self._repo.user_for_update(principal.user_id)
        if user is None:  # pragma: no cover
            raise _unauthorized()
        await self._refuse_if_mfa_locked(user, now)
        session = await self._repo.session_by_id(principal.session_id, lock=True)
        if session is None or session.unlock_key_hash is None or session.unlock_device_id is None:
            await self._db.rollback()
            raise _err(
                "AUTH_403_BIOMETRIC_OFF",
                "Fingerprint or Face ID is not turned on for this phone.",
                status.HTTP_403_FORBIDDEN,
            )
        device = await self._repo.trusted_device_by_id(session.unlock_device_id)
        if (
            device is None
            or device.user_id != principal.user_id
            or device.revoked_at is not None
            or now >= device.expires_at
        ):
            await self._db.rollback()
            raise _err(
                "AUTH_403_BIOMETRIC_OFF",
                "Fingerprint or Face ID is not turned on for this phone.",
                status.HTTP_403_FORBIDDEN,
            )
        if (
            not unlock_key
            or len(unlock_key) > 128
            or not secrets.compare_digest(session.unlock_key_hash, hash_refresh_token(unlock_key))
        ):
            raise await self._mfa_failure(
                user,
                now,
                wrong=_err(
                    "AUTH_401_BIOMETRIC_FAILED",
                    "Fingerprint or Face ID could not confirm this. Please try the face check.",
                    status.HTTP_401_UNAUTHORIZED,
                ),
            )
        self._mfa_success(user)
        token = self._grant(principal, action, now)
        await self._db.commit()
        return token

    async def step_up_check(self, principal: Principal, action: str) -> CheckStarted:
        """No fingerprint: a face check (after the identity check) or an email code."""
        self._known_action(action)
        now = self._now()
        user = await self._repo.user_for_update(principal.user_id)
        if user is None:  # pragma: no cover
            raise _unauthorized()
        row, email_code, _ = await self._new_check(
            user, "step_up", None, now, action=action, session_id=principal.session_id
        )
        started = self._started(row, user)
        await self._db.commit()
        await self._send_codes(user, email_code, None)
        return started

    async def step_up_codes(
        self, principal: Principal, check_id: uuid.UUID, email_code: str
    ) -> tuple[str, str]:
        now = self._now()
        row, user = await self._open_check(check_id, STEP_UP_PURPOSE, now, principal)
        await self._match_codes(row, user, now, email_code, None)
        return await self._finish_step_up(principal, row, now)

    async def step_up_face(self, principal: Principal, check_id: uuid.UUID) -> tuple[str, str]:
        now = self._now()
        row, user = await self._open_check(check_id, STEP_UP_PURPOSE, now, principal)
        await self._match_face(row, user, now)
        return await self._finish_step_up(principal, row, now)

    async def _finish_step_up(
        self, principal: Principal, row: VerificationCheck, now: datetime
    ) -> tuple[str, str]:
        action = str(row.action)
        row.consumed_at = now
        token = self._grant(principal, action, now)
        await self._db.commit()
        return token, action

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
                "Please confirm it's you first.",
                status.HTTP_403_FORBIDDEN,
                step_up_action=action,
            )
        grant.used_at = now

    # --- PIN change and reset (ADR-046) --------------------------------------------------

    def _pin_or_422(self, pin: str) -> None:
        problem = pin_problem(pin)
        if problem is not None:
            raise _err("VAL_422_WEAK_PASSWORD", problem, status.HTTP_422_UNPROCESSABLE_ENTITY)

    async def _end_sessions(
        self, user_id: uuid.UUID, now: datetime, reason: str, keep: uuid.UUID | None = None
    ) -> int:
        ended = 0
        for s in await self._repo.live_sessions_for(user_id, now):
            if s.id != keep:
                s.revoked_at = now
                s.revoke_reason = reason
                ended += 1
        return ended

    async def change_pin(
        self, principal: Principal, current_pin: str, new_pin: str, step_up_token: str | None
    ) -> None:
        """Signed in, with an approval (``pin.change``) and the current PIN.

        Other devices are signed out; this one stays. A wrong current PIN counts towards the
        PIN lock exactly like a wrong log-in.
        """
        self._pin_or_422(new_pin)
        now = self._now()
        await self.consume_step_up(principal, "pin.change", step_up_token)
        user = await self._repo.user_for_update(principal.user_id)
        if user is None:  # pragma: no cover
            raise _unauthorized()
        locked_until = user.pin_locked_until
        if locked_until is not None and now < locked_until:
            await self._db.rollback()
            raise _rate_limited(locked_until - now)
        if not self._rt.hasher.verify(user.pin_hash, current_pin):
            user.failed_pin_attempts += 1
            if user.failed_pin_attempts >= MAX_PIN_TRIES:
                user.failed_pin_attempts = 0
                user.pin_locked_until = now + PIN_LOCK
                await self._db.commit()  # the approval is spent too: ask again
                raise _rate_limited(PIN_LOCK)
            await self._db.commit()
            raise _invalid_credentials()
        if self._rt.hasher.verify(user.pin_hash, new_pin):
            await self._db.rollback()
            raise _err(
                "VAL_422_WEAK_PASSWORD",
                "Choose a PIN that is different from your current one.",
                status.HTTP_422_UNPROCESSABLE_ENTITY,
            )
        user.pin_hash = self._rt.hasher.hash(new_pin)
        user.failed_pin_attempts = 0
        user.pin_locked_until = None
        await self._end_sessions(user.id, now, "pin_change", keep=principal.session_id)
        await self._db.commit()
        await self._alert(user, "pin_changed")

    async def pin_reset_start(self, phone_raw: str) -> None:
        """Send a reset code by SMS. Same answer whether or not the number has an account."""
        phone = normalise_phone(phone_raw)
        if phone is None:
            raise _err(
                "VAL_422_INVALID_PHONE",
                "Enter the phone number with its country code, for example +2348012345678.",
                status.HTTP_422_UNPROCESSABLE_ENTITY,
            )
        if self._rt.sms is None:
            raise sms_unavailable()
        now = self._now()
        await self._enforce_sms_limits(phone, now)
        user = await self._repo.user_by_phone(phone)
        real = user is not None and user.status == "active"
        code = generate_code() if real else secrets.token_hex(16)
        row = self._verification(phone, code, now)
        row.purpose = "pin_reset"
        self._repo.add(row)
        await self._db.commit()
        if real:
            await self._rt.sms.send_code(phone, code)
            _logger.info("pin_reset_code_sent", extra={"phone": mask_phone(phone)})

    async def pin_reset_verify(self, phone_raw: str, sms_code: str) -> CheckStarted:
        """Forgot PIN, step 2: the SMS code is right; the second check comes next (ADR-054):
        a face check after the identity check, an email code before it."""
        phone = normalise_phone(phone_raw)
        if phone is None:
            raise _invalid_code()
        now = self._now()
        row = await self._repo.latest_open_code(phone, "pin_reset")
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
            remaining = row.expires_at - now
            await self._db.rollback()
            raise _rate_limited(remaining)
        if not self._keys.code_matches(phone, sms_code, row.code_digest):
            row.attempts += 1
            await self._db.commit()
            raise _invalid_code()
        user = await self._repo.user_by_phone(phone, lock=True)
        if user is None or user.status != "active":  # pragma: no cover - code is unusable then
            await self._db.rollback()
            raise _invalid_code()
        row.consumed_at = now
        check, email_code, _ = await self._new_check(user, "pin_reset", None, now)
        started = self._started(check, user)
        await self._db.commit()
        await self._send_codes(user, email_code, None)
        return started

    async def pin_reset_confirm(
        self, check_id: uuid.UUID, new_pin: str, email_code: str | None = None
    ) -> None:
        """Forgot PIN, step 3: the email code (or the face check result) and the new PIN.
        Every session ends and trusted devices are forgotten (ADR-046)."""
        self._pin_or_422(new_pin)
        now = self._now()
        row, user = await self._open_check(check_id, PIN_RESET_PURPOSE, now)
        if row.method == "face":
            await self._match_face(row, user, now)
        else:
            await self._match_codes(row, user, now, email_code, None)
        row.consumed_at = now
        user.pin_hash = self._rt.hasher.hash(new_pin)
        user.failed_pin_attempts = 0
        user.pin_locked_until = None
        await self._end_sessions(user.id, now, "pin_reset")
        await self._repo.revoke_trusted_devices(user.id, now)
        await self._db.commit()
        await self._alert(user, "pin_reset")

    # --- phone number change (ADR-047) ------------------------------------------------------

    def _phone_or_422(self, phone_raw: str) -> str:
        phone = normalise_phone(phone_raw)
        if phone is None:
            raise _err(
                "VAL_422_INVALID_PHONE",
                "Enter the phone number with its country code, for example +2348012345678.",
                status.HTTP_422_UNPROCESSABLE_ENTITY,
            )
        return phone

    async def phone_change_start(
        self, principal: Principal, new_phone_raw: str, step_up_token: str | None
    ) -> None:
        """Contract: "phone change re-triggers phone verification". With a ``contact.change``
        approval, a code goes to the NEW number; the change applies only when it is entered.
        The code is bound to this user, so nobody else can use it."""
        phone = self._phone_or_422(new_phone_raw)
        if self._rt.sms is None:
            raise sms_unavailable()
        now = self._now()
        user = await self._repo.user_for_update(principal.user_id)
        if user is None:  # pragma: no cover
            raise _unauthorized()
        if user.phone == phone:
            await self._db.rollback()
            raise _err(
                "VAL_422_INVALID_PHONE",
                "This is already your phone number.",
                status.HTTP_422_UNPROCESSABLE_ENTITY,
            )
        await self.consume_step_up(principal, "contact.change", step_up_token)
        await self._enforce_sms_limits(phone, now)
        code = generate_code()
        row = self._verification(phone, code, now)
        row.code_digest = self._keys.code_digest(f"{phone}#{user.id}", code)
        row.purpose = "phone_change"
        self._repo.add(row)
        await self._db.commit()
        await self._rt.sms.send_code(phone, code)
        _logger.info("phone_change_code_sent", extra={"user_id": str(user.id)})

    async def phone_change_confirm(
        self, principal: Principal, new_phone_raw: str, code: str
    ) -> str:
        phone = self._phone_or_422(new_phone_raw)
        now = self._now()
        row = await self._repo.latest_open_code(phone, "phone_change")
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
            remaining = row.expires_at - now
            await self._db.rollback()
            raise _rate_limited(remaining)
        if not self._keys.code_matches(f"{phone}#{principal.user_id}", code, row.code_digest):
            row.attempts += 1
            await self._db.commit()
            raise _invalid_code()
        user = await self._repo.user_for_update(principal.user_id)
        if user is None:  # pragma: no cover
            raise _unauthorized()
        row.consumed_at = now
        old = user.phone
        user.phone = phone
        user.phone_verified_at = now
        try:
            await self._db.commit()
        except IntegrityError as exc:
            await self._db.rollback()
            if "uq_users_phone" not in str(exc.orig):
                raise
            # Shown only after the code proved the user holds this number.
            raise _err(
                "AUTH_409_PHONE_TAKEN",
                "This number is already used by another account.",
                status.HTTP_409_CONFLICT,
            ) from None
        await self._alert(user, "phone_changed")
        _logger.info(
            "phone_changed", extra={"user_id": str(principal.user_id), "old": mask_phone(old)}
        )
        return phone

    async def trusted_devices(self, principal: Principal) -> list[TrustedDevice]:
        return await self._repo.live_trusted_devices(principal.user_id, self._now())

    async def revoke_trusted_device(self, principal: Principal, device_id: uuid.UUID) -> None:
        row = await self._repo.trusted_device_by_id(device_id)
        if row is None or row.user_id != principal.user_id or row.revoked_at is not None:
            await self._db.rollback()
            raise _err("RES_404_NOT_FOUND", "That device was not found.", status.HTTP_404_NOT_FOUND)
        row.revoked_at = self._now()
        await self._db.commit()

    # --- biometric unlock after the idle lock (ADR-048) -------------------------------------

    async def biometric_enable(self, principal: Principal, device_token: str | None) -> str:
        """A new unlock key for this session, shown once. Only on a trusted device (ADR-008).

        The phone stores it behind Face ID/fingerprint. Turning it on again replaces the key.
        """
        now = self._now()
        session = await self._repo.session_by_id(principal.session_id, lock=True)
        if session is None or not self._session_usable(session, now):
            await self._db.rollback()
            raise _unauthorized()
        device = await self._trusted_device_for(principal.user_id, device_token, now)
        if device is None:
            await self._db.rollback()
            raise _err(
                "AUTH_403_DEVICE_NOT_TRUSTED",
                "Fingerprint or Face ID needs a trusted phone. Log out and log in again on "
                "this phone to trust it.",
                status.HTTP_403_FORBIDDEN,
            )
        key = generate_refresh_token()
        session.unlock_key_hash = hash_refresh_token(key)
        session.unlock_device_id = device.id
        await self._db.commit()
        _logger.info("biometric_unlock_enabled", extra={"user_id": str(principal.user_id)})
        return key

    async def biometric_disable(self, principal: Principal) -> None:
        session = await self._repo.session_by_id(principal.session_id, lock=True)
        if session is not None:
            session.unlock_key_hash = None
            session.unlock_device_id = None
        await self._db.commit()

    async def biometric_unlock(self, refresh_token: str, unlock_key: str) -> TokenPair:
        """Resume a session past the 5-minute idle limit with the refresh token plus the key
        the phone released after Face ID/fingerprint. Never past the 7-day limit, never on a
        revoked or un-trusted device, never while the PIN is locked. A wrong key for a real
        session means someone holds a copied refresh token: the session ends."""
        now = self._now()
        if not refresh_token or len(refresh_token) > 128 or not unlock_key or len(unlock_key) > 128:
            raise _invalid_refresh()
        token = await self._repo.refresh_token_by_hash(hash_refresh_token(refresh_token))
        if token is None:
            await self._db.rollback()
            raise _invalid_refresh()
        session = await self._repo.session_by_id(token.session_id, lock=True)
        if session is None or session.revoked_at is not None or now >= session.expires_at:
            await self._db.rollback()
            raise _invalid_refresh()
        if token.used_at is not None:
            session.revoked_at = now
            session.revoke_reason = "token_reuse"
            await self._db.commit()
            _logger.warning("refresh_token_reuse", extra={"user_id": str(session.user_id)})
            raise _invalid_refresh()
        if session.unlock_key_hash is None or session.unlock_device_id is None:
            await self._db.rollback()
            raise _invalid_refresh()
        if not secrets.compare_digest(session.unlock_key_hash, hash_refresh_token(unlock_key)):
            session.revoked_at = now
            session.revoke_reason = "unlock_failed"
            await self._db.commit()
            _logger.warning("biometric_unlock_failed", extra={"user_id": str(session.user_id)})
            raise _invalid_refresh()
        device = await self._repo.trusted_device_by_id(session.unlock_device_id)
        if (
            device is None
            or device.user_id != session.user_id
            or device.revoked_at is not None
            or now >= device.expires_at
        ):
            await self._db.rollback()
            raise _invalid_refresh()
        user = await self._repo.user_by_id(session.user_id)
        if user is None or user.status != "active":
            await self._db.rollback()
            raise _invalid_refresh()
        if user.pin_locked_until is not None and now < user.pin_locked_until:
            retry = user.pin_locked_until - now
            await self._db.rollback()
            raise _rate_limited(retry)

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
        _logger.info("biometric_unlock", extra={"user_id": str(session.user_id)})
        return TokenPair(access_token=access, refresh_token=new_refresh)
