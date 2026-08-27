"""Persistence infrastructure: declarative base, engine and session factory.

MILESTONE 4.1A SCOPE: infrastructure only. **No domain table is defined here or in
`app/models/` yet** -- Offer, Match, Transaction, Settlement, SettlementLeg,
PayoutExecution, KycCase, BeneficiaryAccount and IdempotencyRecord all belong to
4.1B-4.1H.

Layering rule (unchanged): `api -> services -> domain + repositories + providers`.
Nothing outside `repositories/` may touch a session. This package deliberately exports
the *factory*, not a session: the `UnitOfWork` that owns transaction boundaries arrives
in 4.1I, and until then no caller has a sanctioned route to a session.
"""

from app.db.base import Base, metadata, naming_convention
from app.db.session import (
    DatabaseNotConfiguredError,
    build_engine,
    dispose_engine,
    get_engine,
    get_sessionmaker,
)

__all__ = [
    "Base",
    "DatabaseNotConfiguredError",
    "build_engine",
    "dispose_engine",
    "get_engine",
    "get_sessionmaker",
    "metadata",
    "naming_convention",
]
