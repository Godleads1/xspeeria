"""Foundational monetary primitives.

Milestone 1 scope: exact arithmetic only. This module deliberately contains **no**
ledger posting rules, no chart of accounts and no currency registry.
`docs/adr/002-financial-event-ledger-architecture.md` remains authoritative for the
eventual ledger conversion boundary, and currency definitions are versioned,
configurable policy owned outside this module.

Two rules the rest of the codebase depends on:

* Authoritative monetary state is held as **integer minor units** with an explicit
  scale. Binary floating point is rejected at the boundary, never silently coerced.
* Conversion from a decimal presentation value to minor units happens at exactly one
  place -- :func:`to_minor` -- using ``ROUND_HALF_EVEN``.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import ROUND_HALF_EVEN, Decimal, InvalidOperation

__all__ = [
    "Money",
    "MoneyError",
    "to_minor",
    "from_minor",
]

_MAX_SCALE = 8


class MoneyError(ValueError):
    """Raised when a monetary value or operation is not representable exactly."""


def _check_scale(scale: int) -> None:
    if not isinstance(scale, int) or isinstance(scale, bool):
        raise MoneyError("scale must be an int")
    if scale < 0 or scale > _MAX_SCALE:
        raise MoneyError(f"scale must be between 0 and {_MAX_SCALE}, got {scale}")


def _check_currency(currency: str) -> None:
    if not isinstance(currency, str) or len(currency) != 3 or not currency.isalpha():
        raise MoneyError("currency must be a 3-letter alphabetic code")
    if currency != currency.upper():
        raise MoneyError("currency must be upper-case")


def to_minor(amount: Decimal | int | str, scale: int) -> int:
    """Convert a decimal amount to integer minor units.

    This is the **single** conversion point. Rounding is ``ROUND_HALF_EVEN``, matching
    ADR-002. ``float`` is rejected outright rather than rounded, because a float has
    already lost the precision the caller believes it has.
    """
    _check_scale(scale)
    if isinstance(amount, float):
        raise MoneyError("binary floating point is not accepted for monetary values")
    if isinstance(amount, bool):
        raise MoneyError("bool is not a monetary value")
    try:
        value = amount if isinstance(amount, Decimal) else Decimal(amount)
    except (InvalidOperation, TypeError) as exc:  # pragma: no cover - defensive
        raise MoneyError(f"not a decimal amount: {amount!r}") from exc
    if not value.is_finite():
        raise MoneyError("monetary values must be finite")
    quantum = Decimal(1).scaleb(-scale)
    return int(value.quantize(quantum, rounding=ROUND_HALF_EVEN).scaleb(scale))


def from_minor(minor: int, scale: int) -> Decimal:
    """Render integer minor units back to an exact :class:`~decimal.Decimal`."""
    _check_scale(scale)
    if not isinstance(minor, int) or isinstance(minor, bool):
        raise MoneyError("minor units must be an int")
    return Decimal(minor).scaleb(-scale)


@dataclass(frozen=True, slots=True)
class Money:
    """An exact monetary amount in integer minor units.

    ``Money`` carries its own ``currency`` and ``scale`` so that no caller has to look
    either up. Arithmetic between different currencies or scales is refused rather
    than reconciled -- reconciling them is a policy decision this module does not own.
    """

    minor: int
    currency: str
    scale: int

    def __post_init__(self) -> None:
        if not isinstance(self.minor, int) or isinstance(self.minor, bool):
            raise MoneyError("minor units must be an int")
        _check_currency(self.currency)
        _check_scale(self.scale)

    @classmethod
    def of(cls, amount: Decimal | int | str, currency: str, scale: int) -> Money:
        """Build from a decimal amount, converting through :func:`to_minor`."""
        return cls(minor=to_minor(amount, scale), currency=currency, scale=scale)

    def as_decimal(self) -> Decimal:
        return from_minor(self.minor, self.scale)

    def _compatible(self, other: Money) -> None:
        if not isinstance(other, Money):  # pragma: no cover - defensive
            raise MoneyError("operand is not Money")
        if other.currency != self.currency:
            raise MoneyError(f"currency mismatch: {self.currency} vs {other.currency}")
        if other.scale != self.scale:
            raise MoneyError(f"scale mismatch: {self.scale} vs {other.scale}")

    def __add__(self, other: Money) -> Money:
        self._compatible(other)
        return Money(self.minor + other.minor, self.currency, self.scale)

    def __sub__(self, other: Money) -> Money:
        self._compatible(other)
        return Money(self.minor - other.minor, self.currency, self.scale)

    def __neg__(self) -> Money:
        return Money(-self.minor, self.currency, self.scale)

    def times(self, factor: int) -> Money:
        """Multiply by a whole number. Fractional factors would require a rounding
        policy, which belongs to the caller, not here."""
        if not isinstance(factor, int) or isinstance(factor, bool):
            raise MoneyError("factor must be an int; fractional scaling needs an explicit policy")
        return Money(self.minor * factor, self.currency, self.scale)

    def __lt__(self, other: Money) -> bool:
        self._compatible(other)
        return self.minor < other.minor

    def __le__(self, other: Money) -> bool:
        self._compatible(other)
        return self.minor <= other.minor

    def __gt__(self, other: Money) -> bool:
        self._compatible(other)
        return self.minor > other.minor

    def __ge__(self, other: Money) -> bool:
        self._compatible(other)
        return self.minor >= other.minor

    @property
    def is_zero(self) -> bool:
        return self.minor == 0

    @property
    def is_negative(self) -> bool:
        return self.minor < 0

    def __str__(self) -> str:
        return f"{self.as_decimal()} {self.currency}"
