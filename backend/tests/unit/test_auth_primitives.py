"""AUTH-1 building blocks (ADR-024, ADR-025): rules, PIN hashing, tokens, rate limiter."""

from __future__ import annotations

import base64
import json
import uuid
from datetime import UTC, datetime, timedelta

import jwt
import pytest

from app.core.auth_tokens import (
    AccessClaims,
    InvalidAccessToken,
    TokenKeys,
    generate_code,
    generate_refresh_token,
    hash_refresh_token,
)
from app.core.pin_hashing import ITERATIONS, MEMORY_KIB, PARALLELISM, PinHasher
from app.core.rate_limit import SlidingWindowLimiter
from app.domain.auth_rules import (
    ACCESS_TOKEN_TTL,
    IDLE_TIMEOUT,
    PIN_LENGTH,
    SESSION_MAX,
    SMS_PER_DAY,
    SMS_PER_HOUR,
    mask_phone,
    normalise_email,
    normalise_phone,
    pin_problem,
)

T0 = datetime(2026, 10, 18, 9, 0, tzinfo=UTC)
KEY = "k" * 40


class TestDecidedValues:
    def test_values_match_the_human_decisions(self) -> None:
        assert PIN_LENGTH == 6  # ADR-024
        assert IDLE_TIMEOUT == timedelta(minutes=5)  # ADR-024
        assert SESSION_MAX == timedelta(days=7)  # ADR-024
        assert (SMS_PER_HOUR, SMS_PER_DAY) == (5, 10)  # ADR-024
        assert ACCESS_TOKEN_TTL == timedelta(minutes=15)  # contract §2.1

    def test_argon2id_parameters_are_the_approved_ones(self) -> None:
        assert (MEMORY_KIB, ITERATIONS, PARALLELISM) == (19_456, 2, 1)  # ADR-025 §1.1
        assert PinHasher().hash("482613").startswith("$argon2id$v=19$m=19456,t=2,p=1$")


class TestPinRules:
    @pytest.mark.parametrize("pin", ["482613", "739152", "102938"])
    def test_accepts_ordinary_pins(self, pin: str) -> None:
        assert pin_problem(pin) is None

    @pytest.mark.parametrize(
        ("pin", "why"),
        [
            ("4826", "6 digits"),
            ("4826135", "6 digits"),
            ("48261a", "6 digits"),
            ("４８２６１３", "6 digits"),  # full-width digits are not ASCII digits
            ("", "6 digits"),
            ("111111", "same digit"),
            ("123456", "sequences"),
            ("654321", "sequences"),
            ("890123", "sequences"),
        ],
    )
    def test_refuses(self, pin: str, why: str) -> None:
        assert why in (pin_problem(pin) or "")


class TestPhoneAndEmail:
    @pytest.mark.parametrize(
        ("raw", "expected"),
        [
            ("+2348038383838", "+2348038383838"),
            ("+234 803 838 3838", "+2348038383838"),
            ("+1 (415) 555-0100", "+14155550100"),
        ],
    )
    def test_phone_normalises(self, raw: str, expected: str) -> None:
        assert normalise_phone(raw) == expected

    @pytest.mark.parametrize(
        "raw", ["08038383838", "+0123456789", "+12", "+1234567890123456", "+234abc", "x" * 40]
    )
    def test_phone_refuses_without_guessing_a_country(self, raw: str) -> None:
        assert normalise_phone(raw) is None

    def test_email(self) -> None:
        assert normalise_email("  David.Peters@Example.COM ") == "david.peters@example.com"
        for bad in ["no-at", "a@b", "a b@example.com", "a@@example.com", "x" * 250 + "@e.com"]:
            assert normalise_email(bad) is None

    def test_mask_phone_keeps_only_last_four(self) -> None:
        assert mask_phone("+2348038383838") == "***3838"


class TestPinHasher:
    # Cheap parameters keep the suite fast; the production parameters are asserted above.
    hasher = PinHasher(memory_kib=1024, iterations=1)

    def test_round_trip_and_salted(self) -> None:
        a, b = self.hasher.hash("482613"), self.hasher.hash("482613")
        assert a != b
        assert self.hasher.verify(a, "482613")
        assert not self.hasher.verify(a, "482614")

    def test_garbage_hash_is_a_failed_check_not_a_crash(self) -> None:
        assert not self.hasher.verify("not-a-hash", "482613")
        assert self.hasher.needs_rehash("not-a-hash")

    def test_weaker_stored_hash_is_upgraded(self) -> None:
        weak = self.hasher.hash("482613")
        assert PinHasher().needs_rehash(weak)
        assert not self.hasher.needs_rehash(weak)


class TestAccessTokens:
    keys = TokenKeys(KEY)
    claims = AccessClaims(user_id=uuid.uuid4(), session_id=uuid.uuid4())

    def test_round_trip(self) -> None:
        token = self.keys.issue_access(self.claims, T0)
        assert self.keys.read_access(token, T0 + timedelta(minutes=14)) == self.claims

    def test_expires_after_15_minutes_on_the_injected_clock(self) -> None:
        token = self.keys.issue_access(self.claims, T0)
        with pytest.raises(InvalidAccessToken):
            self.keys.read_access(token, T0 + ACCESS_TOKEN_TTL)

    def test_other_key_is_refused(self) -> None:
        token = TokenKeys("z" * 40).issue_access(self.claims, T0)
        with pytest.raises(InvalidAccessToken):
            self.keys.read_access(token, T0)

    def test_alg_none_is_refused(self) -> None:
        def b64(obj: dict[str, object]) -> str:
            return base64.urlsafe_b64encode(json.dumps(obj).encode()).rstrip(b"=").decode()

        good = jwt.decode(
            self.keys.issue_access(self.claims, T0), options={"verify_signature": False}
        )
        forged = f"{b64({'alg': 'none', 'typ': 'JWT'})}.{b64(good)}."
        with pytest.raises(InvalidAccessToken):
            self.keys.read_access(forged, T0)

    @pytest.mark.parametrize(
        "change", [{"aud": "other"}, {"iss": "other"}, {"typ": "refresh"}, {"sub": "nope"}]
    )
    def test_wrong_claims_are_refused(self, change: dict[str, str]) -> None:
        payload = jwt.decode(
            self.keys.issue_access(self.claims, T0), options={"verify_signature": False}
        )
        payload.update(change)
        token = jwt.encode(payload, KEY, algorithm="HS256")
        with pytest.raises(InvalidAccessToken):
            self.keys.read_access(token, T0)

    def test_short_key_is_refused(self) -> None:
        with pytest.raises(ValueError):
            TokenKeys("short")

    def test_repr_hides_the_key(self) -> None:
        assert KEY not in repr(self.keys)


class TestCodesAndRefreshTokens:
    keys = TokenKeys(KEY)

    def test_code_digest_is_bound_to_the_phone_and_keyed(self) -> None:
        digest = self.keys.code_digest("+2348038383838", "123456")
        assert self.keys.code_matches("+2348038383838", "123456", digest)
        assert not self.keys.code_matches("+2348038383839", "123456", digest)
        assert not self.keys.code_matches("+2348038383838", "123457", digest)
        assert TokenKeys("z" * 40).code_digest("+2348038383838", "123456") != digest

    def test_codes_are_six_digits(self) -> None:
        codes = {generate_code() for _ in range(200)}
        assert all(len(c) == 6 and c.isdigit() for c in codes)
        assert len(codes) > 150

    def test_refresh_tokens_are_random_and_hashed(self) -> None:
        a, b = generate_refresh_token(), generate_refresh_token()
        assert a != b and len(a) >= 43
        assert len(hash_refresh_token(a)) == 64 and hash_refresh_token(a) != a


@pytest.mark.asyncio
class TestSlidingWindowLimiter:
    async def test_allows_the_limit_then_refuses_then_recovers(self) -> None:
        limiter = SlidingWindowLimiter(limit=10, window=timedelta(minutes=1))
        assert all([await limiter.hit("a", T0 + timedelta(seconds=i)) for i in range(10)])
        assert not await limiter.hit("a", T0 + timedelta(seconds=30))
        assert await limiter.hit("b", T0 + timedelta(seconds=30))  # keys are independent
        assert await limiter.hit("a", T0 + timedelta(seconds=61))

    async def test_memory_is_bounded(self) -> None:
        limiter = SlidingWindowLimiter(limit=1, window=timedelta(minutes=1), max_keys=100)
        for i in range(1000):
            await limiter.hit(f"k{i}", T0)
        assert len(limiter._hits) <= 100


class TestStartupWiring:
    def test_placeholder_key_is_refused_in_production(self) -> None:
        from app.core.config import Settings
        from app.main import build_auth_runtime

        placeholder = "CHANGE_ME_LOCAL_ONLY_use_at_least_32_chars"
        with pytest.raises(ValueError, match="placeholder"):
            build_auth_runtime(
                Settings(_env_file=None, app_env="production", jwt_secret_key=placeholder)  # type: ignore[call-arg]
            )
        local = build_auth_runtime(Settings(_env_file=None, jwt_secret_key=placeholder))  # type: ignore[call-arg]
        assert local.keys is not None and local.sms is None  # no SMS provider is wired

    def test_other_algorithms_are_refused(self) -> None:
        from app.core.config import Settings
        from app.main import build_auth_runtime

        with pytest.raises(ValueError, match="HS256"):
            build_auth_runtime(Settings(_env_file=None, jwt_algorithm="none", jwt_secret_key=KEY))  # type: ignore[call-arg]
