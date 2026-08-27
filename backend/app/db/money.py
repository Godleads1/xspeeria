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

Scope: this is a value carrier. It states no currency policy, no version format, no
supported-currency list and no positivity rule. Column types and CHECK constraints belong
to the persistence batch that declares them.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.core.money import Money

__all__ = ["PersistedMoney"]


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
