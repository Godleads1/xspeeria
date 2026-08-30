"""The persistence binding for an authoritative monetary amount.

`app.core.money.Money` is the **arithmetic** primitive: `minor`, `currency`, `scale`, and
the operators that combine them. It deliberately knows nothing about persistence, and this
module does not change that.

DECISION S4-1 requires every authoritative persisted monetary amount to carry a fourth
element -- `currency_def_version` -- so the amount stays interpretable after a currency
definition changes. That version is **persistence metadata, not arithmetic**, which is why
it lives here and not on `Money` (`05_API_Contract_Data_Dictionary.md`: *"the domain
arithmetic primitive remains `Money(minor, currency, scale)` … `currency_def_version` is
carried alongside it in persistence, not added to the value object"*).

**`PersistedMoney` has no arithmetic operators, and that is the point.** Were it addable,
two amounts bound to *different* `currency_def_version` values could be summed into a
number whose interpretation is undefined -- exactly the failure S4-1 exists to prevent.
Refusing the operators makes the mistake unrepresentable rather than merely discouraged:
callers must go through :meth:`PersistedMoney.to_money`, where the version binding is
consciously dropped, and back through :meth:`PersistedMoney.from_money`, where a version
must be consciously supplied.

`PersistedMoney` itself is a value carrier: it states no currency policy, no version
format, no supported-currency list and no positivity rule.

The two helpers below emit the **schema** side of the same binding -- the four columns and
the structural CHECK constraints a money-bearing table needs -- so that every such table
spells them identically. They deliberately emit no foreign key: the three-column reference
to `currency_definitions` needs an explicitly short constraint name per table (the
repository `fk` convention overflows PostgreSQL's 63-byte identifier limit for every
realistic consumer), so the owning model declares it.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sqlalchemy import CHAR, BigInteger, CheckConstraint, SmallInteger, String
from sqlalchemy.orm import MappedColumn, mapped_column

from app.core.money import Money

__all__ = [
    "CURRENCY_CODE_REGEX",
    "CURRENCY_DEF_VERSION_LENGTH",
    "MAX_SCALE",
    "MIN_SCALE",
    "PersistedMoney",
    "money_check_constraints",
    "money_columns",
]

#: ISO 4217 alphabetic codes are three upper-case letters. This is a **structural** format
#: check only -- it asserts nothing about which currencies Xspeeria supports, which is
#: policy held elsewhere and must not be encoded in a column constraint.
CURRENCY_CODE_REGEX = "^[A-Z]{3}$"

#: Matches `app.core.money`'s accepted scale range, so a row that the database accepts can
#: always be converted to a `Money` and vice versa.
MIN_SCALE = 0
MAX_SCALE = 8

#: `VARCHAR(32)`, per the Data Dictionary's `currency_def_version` authority. No version
#: encoding is invented here; the value stays opaque.
CURRENCY_DEF_VERSION_LENGTH = 32


@dataclass(frozen=True, slots=True, repr=False)
class PersistedMoney:
    """An exact monetary amount together with the currency definition that interprets it.

    The four elements are bound together at the moment the amount is established and are
    immutable thereafter, per DECISION S4-1.
    """

    amount_minor: int
    currency: str
    scale: int
    currency_def_version: str

    def __post_init__(self) -> None:
        # A `PersistedMoney` that cannot become a `Money` is not a monetary value.
        # Validation is delegated wholesale rather than restated here: one rule set, in
        # one place, so the two types can never drift into disagreeing about what a valid
        # amount is.
        #
        # `currency_def_version` is deliberately unchecked. It is an opaque,
        # application-issued identifier; its persistence constraints (non-empty, bounded
        # length, and existence in `currency_definitions`) belong to the schema and to the
        # batch that declares it, not to this carrier.
        Money(minor=self.amount_minor, currency=self.currency, scale=self.scale)

    @classmethod
    def from_money(cls, money: Money, currency_def_version: str) -> PersistedMoney:
        """Bind an arithmetic `Money` to the currency definition that interprets it.

        The version is a **required argument**. It is never inferred from the currency,
        defaulted, or looked up: which definition interprets an amount is a fact about the
        moment the amount was established, and guessing it would silently reinterpret
        money.
        """
        return cls(
            amount_minor=money.minor,
            currency=money.currency,
            scale=money.scale,
            currency_def_version=currency_def_version,
        )

    def to_money(self) -> Money:
        """Drop the persistence binding and return the arithmetic value.

        `currency_def_version` is **intentionally discarded**: `Money` has no place to put
        it, and arithmetic must not silently carry a version that its operands might not
        share. Re-bind with :meth:`from_money` when persisting the result.
        """
        return Money(minor=self.amount_minor, currency=self.currency, scale=self.scale)

    def __repr__(self) -> str:
        """Structural identity only -- **never the amount**.

        The dataclass-generated repr would print `amount_minor` into every exception
        traceback and log record that formats this object. An amount is not a credential,
        but putting one in a log is a disclosure decision, and the default makes it for
        you. What remains is enough to identify *which* binding a value carries while
        debugging.
        """
        return (
            f"PersistedMoney(currency={self.currency!r}, scale={self.scale!r}, "
            f"currency_def_version={self.currency_def_version!r})"
        )


def money_columns(prefix: str = "", nullable: bool = False) -> dict[str, MappedColumn[Any]]:
    """Build the four columns of one persisted money binding.

    Returns a mapping of **column name to a freshly constructed** `mapped_column`. The
    keys are the names the columns carry in the database, so `prefix` shows up in both:

        money_columns()        -> amount_minor, currency, scale, currency_def_version
        money_columns("fee_")  -> fee_amount_minor, fee_currency, fee_scale,
                                  fee_currency_def_version

    `prefix` is used exactly as given -- no underscore is inserted or removed. A caller
    wanting `fee_amount_minor` passes `"fee_"`; the separator is theirs to own, because a
    helper that guessed would eventually guess wrong against an approved column name.

    **Every call constructs new objects.** A `MappedColumn` is bound to the table that
    first claims it, so a module-level instance shared between two models would silently
    rebind and corrupt whichever mapped second.

    `nullable=True` makes all four nullable together. It adds **no** grouped all-null /
    all-present invariant: whether a partially-populated binding is legal is entity
    policy, and the owning model states it (`ReconciliationException`'s strict `iff`, for
    instance). Nothing here emits a default, server default, index, uniqueness constraint
    or foreign key.
    """
    return {
        f"{prefix}amount_minor": mapped_column(
            f"{prefix}amount_minor", BigInteger, nullable=nullable
        ),
        f"{prefix}currency": mapped_column(f"{prefix}currency", CHAR(3), nullable=nullable),
        f"{prefix}scale": mapped_column(f"{prefix}scale", SmallInteger, nullable=nullable),
        f"{prefix}currency_def_version": mapped_column(
            f"{prefix}currency_def_version",
            String(CURRENCY_DEF_VERSION_LENGTH),
            nullable=nullable,
        ),
    }


def money_check_constraints(
    prefix: str = "", positive: bool = False
) -> tuple[CheckConstraint, ...]:
    """Build the structural CHECK constraints for one persisted money binding.

    Three constraints always, a fourth only when asked:

    * `currency` matches three upper-case letters -- structural format only.
    * `scale` lies within the range `app.core.money` accepts.
    * `currency_def_version` is not the empty string.
    * `amount_minor > 0`, **only** when ``positive=True``.

    Positivity is opt-in because it is entity policy, not a property of money. It is
    required on `PayoutExecution`, where a non-positive child is a malformed record, and
    wrong elsewhere -- a ledger line, a reconciliation delta and a zero-value balance are
    all legitimately non-positive. When omitted, zero and negative amounts are
    structurally allowed. The rule is strict `> 0`, never `>= 0`: zero is invalid where
    positivity applies.

    Names are explicit and deterministic rather than left to SQLAlchemy, and carry
    `prefix` so two bindings on one table cannot collide. They are the
    ``%(constraint_name)s`` half of the repository `ck` convention in `app.db.base`, which
    renders the final identifier as ``ck_<table>_<name>``.

    The names are short enough for the table and prefix combinations Xspeeria currently
    expects -- that is checked in the unit suite against the longest of them. It is **not**
    a guarantee for arbitrary future combinations: PostgreSQL truncates an identifier past
    63 bytes silently, leaving the database holding a different name from the one the
    migration knows. An owning model must still inspect its own rendered names.

    **Every call constructs new objects**, for the same ownership reason as
    :func:`money_columns`. No foreign key is emitted here.
    """
    constraints = [
        CheckConstraint(
            f"{prefix}currency ~ '{CURRENCY_CODE_REGEX}'",
            name=f"{prefix}currency_format",
        ),
        CheckConstraint(
            f"{prefix}scale BETWEEN {MIN_SCALE} AND {MAX_SCALE}",
            name=f"{prefix}scale_range",
        ),
        CheckConstraint(
            f"{prefix}currency_def_version <> ''",
            name=f"{prefix}def_version_not_empty",
        ),
    ]
    if positive:
        constraints.append(
            CheckConstraint(
                f"{prefix}amount_minor > 0",
                name=f"{prefix}amount_minor_positive",
            )
        )
    return tuple(constraints)
