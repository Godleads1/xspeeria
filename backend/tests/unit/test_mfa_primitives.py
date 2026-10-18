"""AUTH-2 building blocks (ADR-008, ADR-026): TOTP, sealing, recovery codes, settings."""

from __future__ import annotations

import base64
import uuid
from datetime import UTC, datetime, timedelta

import pyotp
import pytest

from app.core.auth_tokens import TokenKeys
from app.core.mfa import (
    RECOVERY_CODE_COUNT,
    SecretBox,
    SecretBoxError,
    match_step,
    new_recovery_codes,
    new_totp_secret,
    normalise_recovery_code,
    otpauth_uri,
)
from app.domain.auth_rules import (
    ENROL_CHALLENGE_TTL,
    LOGIN_CHALLENGE_TTL,
    MAX_MFA_TRIES,
    MFA_LOCK,
    PAYOUT_HOLD,
    STEP_UP_ACTIONS,
    STEP_UP_TTL,
    TRUSTED_DEVICE_TTL,
)

KEY = base64.b64encode(bytes(range(32))).decode()
T = datetime(2026, 10, 18, 9, 0, 15, tzinfo=UTC)


class TestDecidedValues:
    def test_values_match_the_decisions(self) -> None:
        assert TRUSTED_DEVICE_TTL == timedelta(days=30)  # 2026-10-18
        assert STEP_UP_TTL == timedelta(minutes=5)  # 2026-10-18
        assert LOGIN_CHALLENGE_TTL == timedelta(minutes=5)  # contract §3.1
        assert ENROL_CHALLENGE_TTL == timedelta(minutes=10)  # ADR-026
        assert (MAX_MFA_TRIES, MFA_LOCK) == (5, timedelta(minutes=15))  # ADR-008
        assert PAYOUT_HOLD == timedelta(hours=24)  # ADR-008
        assert STEP_UP_ACTIONS == {
            "beneficiary.add",
            "beneficiary.remove",
            "contact.change",
            "pin.change",
            "mfa.change",
            "recovery_codes.regenerate",
            "trade.accept",
            "payout.confirm",
        }


class TestTotp:
    def test_rfc_6238_sha1_vector(self) -> None:
        # RFC 6238 Appendix B: secret "12345678901234567890", T = 59 s → 94287082 (8 digits).
        secret = base64.b32encode(b"12345678901234567890").decode()
        assert pyotp.TOTP(secret, digits=8).at(59) == "94287082"
        moment = datetime.fromtimestamp(59, tz=UTC)
        assert match_step(secret, "287082", moment, None) == 1

    def test_secret_is_160_bits(self) -> None:
        assert len(base64.b32decode(new_totp_secret())) == 20
        assert new_totp_secret() != new_totp_secret()

    def test_accepts_one_step_either_side_only(self) -> None:
        secret = new_totp_secret()
        totp = pyotp.TOTP(secret)
        for offset in (-30, 0, 30):
            assert match_step(secret, totp.at(T + timedelta(seconds=offset)), T, None) is not None
        for offset in (-60, 60):
            assert match_step(secret, totp.at(T + timedelta(seconds=offset)), T, None) is None

    def test_a_used_step_and_older_ones_are_refused(self) -> None:
        secret = new_totp_secret()
        code = pyotp.TOTP(secret).at(T)
        step = match_step(secret, code, T, None)
        assert step is not None
        assert match_step(secret, code, T, step) is None  # replay
        earlier = pyotp.TOTP(secret).at(T - timedelta(seconds=30))
        assert match_step(secret, earlier, T, step) is None
        later = pyotp.TOTP(secret).at(T + timedelta(seconds=30))
        assert match_step(secret, later, T + timedelta(seconds=30), step) == step + 1

    @pytest.mark.parametrize("code", ["", "12345", "1234567", "abcdef", "１２３４５６"])
    def test_malformed_codes_never_match(self, code: str) -> None:
        assert match_step(new_totp_secret(), code, T, None) is None

    def test_otpauth_link(self) -> None:
        uri = otpauth_uri("ABC", "***3838")
        assert uri.startswith("otpauth://totp/Xspeeria%3A%2A%2A%2A3838?secret=ABC")
        assert "issuer=Xspeeria" in uri and "digits=6" in uri and "period=30" in uri


class TestSecretBox:
    box = SecretBox(KEY)

    def test_round_trip_with_random_nonce(self) -> None:
        a = self.box.seal("SECRET", bound_to="user-1")
        b = self.box.seal("SECRET", bound_to="user-1")
        assert a != b and b"SECRET" not in a
        assert self.box.open(a, bound_to="user-1") == "SECRET"

    def test_bound_to_its_user(self) -> None:
        sealed = self.box.seal("SECRET", bound_to="user-1")
        with pytest.raises(SecretBoxError):
            self.box.open(sealed, bound_to="user-2")

    def test_tampering_and_wrong_key_fail(self) -> None:
        sealed = bytearray(self.box.seal("SECRET", bound_to="u"))
        sealed[-1] ^= 1
        with pytest.raises(SecretBoxError):
            self.box.open(bytes(sealed), bound_to="u")
        other = SecretBox(base64.b64encode(bytes(32)).decode())
        with pytest.raises(SecretBoxError):
            other.open(self.box.seal("SECRET", bound_to="u"), bound_to="u")

    @pytest.mark.parametrize("bad", ["not base64!", base64.b64encode(bytes(16)).decode()])
    def test_bad_keys_are_refused(self, bad: str) -> None:
        with pytest.raises(ValueError):
            SecretBox(bad)

    def test_repr_hides_the_key(self) -> None:
        assert KEY not in repr(self.box)


class TestRecoveryCodes:
    def test_ten_distinct_codes_in_the_expected_shape(self) -> None:
        codes = new_recovery_codes()
        assert len(codes) == RECOVERY_CODE_COUNT == 10
        assert len(set(codes)) == 10
        for code in codes:
            assert len(code) == 9 and code[4] == "-"
            assert normalise_recovery_code(code) == code.replace("-", "")

    def test_normalisation_is_forgiving_the_crockford_way(self) -> None:
        assert normalise_recovery_code("ab0c-d1ef") == "AB0CD1EF"
        assert normalise_recovery_code("abOc dIeF") == "AB0CD1EF"
        assert normalise_recovery_code("ABLC-DEFG") == "AB1CDEFG"

    @pytest.mark.parametrize("bad", ["", "ABC", "ABCD-EFGHJ", "ABCD-EFGU", "x" * 40])
    def test_rejects(self, bad: str) -> None:
        assert normalise_recovery_code(bad) is None

    def test_digest_is_keyed_and_bound_to_the_user(self) -> None:
        keys = TokenKeys("k" * 40)
        user_a, user_b = uuid.uuid4(), uuid.uuid4()
        assert keys.recovery_digest(user_a, "AB0CD1EF") != keys.recovery_digest(user_b, "AB0CD1EF")
        assert TokenKeys("z" * 40).recovery_digest(user_a, "AB0CD1EF") != keys.recovery_digest(
            user_a, "AB0CD1EF"
        )


class TestStartupWiring:
    def test_no_2fa_key_means_no_sign_in(self) -> None:
        from app.core.config import Settings
        from app.main import build_auth_runtime

        rt = build_auth_runtime(Settings(_env_file=None, jwt_secret_key="k" * 40))  # type: ignore[call-arg]
        assert rt.secret_box is None

    def test_placeholder_2fa_key_refused_in_production(self) -> None:
        from app.core.config import Settings
        from app.main import build_auth_runtime

        with pytest.raises(ValueError, match="placeholder"):
            build_auth_runtime(
                Settings(  # type: ignore[call-arg]
                    _env_file=None,
                    app_env="production",
                    jwt_secret_key="k" * 40,
                    mfa_encryption_key="CHANGE_ME",
                )
            )
