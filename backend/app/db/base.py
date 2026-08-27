"""Declarative base and the metadata Alembic compares against.

Two things live here and nothing else: the SQLAlchemy 2.x typed `DeclarativeBase`, and a
**deterministic constraint naming convention**.

The naming convention is not cosmetic. Without one, PostgreSQL invents names for
indexes, unique constraints, foreign keys and CHECK constraints, and Alembic then
autogenerates migrations that cannot reliably drop or alter what an earlier migration
created -- because the name in the database is not the name the migration knows. On a
money schema whose invariants are *enforced by constraints* (`allocated_amount_minor > 0`,
`UNIQUE(settlement_id, party_role)`, `UNIQUE(match_id)`, the acceptance capacity CHECK),
an un-droppable or mis-named constraint is a correctness problem, not a tidiness one. It
is set now, before the first table exists, because retrofitting it later means renaming
every constraint in a live schema.

`MILESTONE 4.1A: no model subclasses this Base yet.` `Base.metadata` is intentionally
empty, and the drift guard in `backend/tests/integration/` asserts exactly that.
"""

from __future__ import annotations

from sqlalchemy import MetaData
from sqlalchemy.orm import DeclarativeBase

__all__ = ["Base", "metadata", "naming_convention"]

#: Deterministic names for every constraint type Alembic can emit.
#: `ix`/`uq`/`ck`/`fk`/`pk` prefixes make a constraint's kind readable in psql output and
#: in migration files without cross-referencing the schema.
naming_convention: dict[str, str] = {
    "ix": "ix_%(table_name)s_%(column_0_N_name)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_N_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}

metadata = MetaData(naming_convention=naming_convention)


class Base(DeclarativeBase):
    """Declarative base for every future persistence model.

    No `TimestampMixin` is provided. A blanket `created_at`/`updated_at` pair looks
    harmless but would invent business semantics this project has deliberately kept
    explicit: `Match.accepted_at` is a **server-set trusted timestamp** establishing
    allocation priority, `SettlementLeg.funded_at` is a **money fact settable only by a
    signature-verified partner webhook**, and `Offer` rows carry no approved
    general-purpose mutation timestamp at all. A mixin that silently stamped
    ``updated_at`` on those tables would create a second, untrusted time source next to
    the trusted one. Timestamps are therefore declared per entity, from its approved
    schema, when that entity is implemented.
    """

    metadata = metadata
