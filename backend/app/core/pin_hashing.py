"""Argon2id PIN hashing (ADR-025 §1.1).

Parameters are the OWASP Password Storage minimum for Argon2id: 19 MiB, 2 iterations,
parallelism 1. A 6-digit PIN has only a million values, so the hash alone cannot protect a
leaked table against an offline search; the slow hash raises that cost, and the real
protections are server-side checking, the lock after 5 wrong PINs, and 2FA (ADR-008).

``verify_dummy`` exists so an unknown account takes the same time as a wrong PIN: without
it, the response time would reveal which phone numbers and emails have accounts.
"""

from __future__ import annotations

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

__all__ = ["PinHasher"]

MEMORY_KIB = 19_456
ITERATIONS = 2
PARALLELISM = 1
HASH_LEN = 32
SALT_LEN = 16


class PinHasher:
    def __init__(
        self,
        *,
        memory_kib: int = MEMORY_KIB,
        iterations: int = ITERATIONS,
        parallelism: int = PARALLELISM,
    ) -> None:
        # Tests may pass smaller costs for speed; production uses the module defaults.
        self._hasher = PasswordHasher(
            time_cost=iterations,
            memory_cost=memory_kib,
            parallelism=parallelism,
            hash_len=HASH_LEN,
            salt_len=SALT_LEN,
        )
        self._dummy = self._hasher.hash("000000-not-a-real-pin")

    def hash(self, pin: str) -> str:
        return self._hasher.hash(pin)

    def verify(self, stored_hash: str, pin: str) -> bool:
        try:
            return self._hasher.verify(stored_hash, pin)
        except (VerifyMismatchError, VerificationError, InvalidHashError):
            return False

    def verify_dummy(self, pin: str) -> None:
        """Spend the same time as a real check, for an account that does not exist."""
        self.verify(self._dummy, pin)

    def needs_rehash(self, stored_hash: str) -> bool:
        try:
            return self._hasher.check_needs_rehash(stored_hash)
        except InvalidHashError:
            return True
