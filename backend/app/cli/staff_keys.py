"""Remove a staff member's security keys when no other Super Admin can (ADR-081).

    cd backend
    uv run python -m app.cli.staff_keys list   --email boss@example.com
    uv run python -m app.cli.staff_keys remove --email boss@example.com --reason "Key lost on 2 Nov"

For a lost or broken key when there is **no other Super Admin** to remove it from the console.
Needs access to the server and its database, so it is an operator's action. It removes every
key of that person, ends their console sessions, writes the audit log (actor: none, with the
reason) and raises the "staff access changed" alert. They then sign in with password and email
code and, if keys are required, add a new key straight away.
"""

from __future__ import annotations

import argparse
import asyncio
from collections.abc import Awaitable, Callable

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.session import build_engine
from app.domain.staff_rules import normalise_email
from app.models.staff import StaffAccount, StaffAuditEntry, StaffSecurityKey, StaffSession

__all__ = ["list_keys", "remove_keys"]


async def _with_db[T](work: Callable[[AsyncSession], Awaitable[T]]) -> T:
    from sqlalchemy.ext.asyncio import async_sessionmaker

    settings = get_settings()
    engine = build_engine(settings)
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as db:
            return await work(db)
    finally:
        await engine.dispose()


async def _staff(db: AsyncSession, email_in: str) -> StaffAccount:
    email = normalise_email(email_in)
    staff = await db.scalar(select(StaffAccount).where(StaffAccount.email == email))
    if staff is None:
        raise SystemExit("No staff member has that email.")
    return staff


async def list_keys(email: str) -> list[tuple[str, str]]:
    async def work(db: AsyncSession) -> list[tuple[str, str]]:
        staff = await _staff(db, email)
        rows = (
            await db.scalars(
                select(StaffSecurityKey)
                .where(StaffSecurityKey.staff_id == staff.id)
                .order_by(StaffSecurityKey.created_at)
            )
        ).all()
        return [(k.name, k.created_at.isoformat()) for k in rows]

    return await _with_db(work)


async def remove_keys(email: str, reason: str) -> int:
    from datetime import UTC, datetime

    from sqlalchemy import delete

    async def work(db: AsyncSession) -> int:
        staff = await _staff(db, email)
        now = datetime.now(UTC)
        result = await db.execute(
            delete(StaffSecurityKey).where(StaffSecurityKey.staff_id == staff.id)
        )
        removed = result.rowcount  # type: ignore[attr-defined]
        await db.execute(
            update(StaffSession)
            .where(StaffSession.staff_id == staff.id, StaffSession.revoked_at.is_(None))
            .values(revoked_at=now)
        )
        db.add(
            StaffAuditEntry(
                at=now,
                staff_id=None,
                action="security_key_removed",
                target_type="staff",
                target_id=str(staff.id),
                detail={
                    "removed": int(removed or 0),
                    "reason": reason.strip()[:500],
                    "lost_key": True,
                    "via": "server command",
                },
            )
        )
        await db.commit()
        return int(removed or 0)

    return await _with_db(work)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="what", required=True)
    ls = sub.add_parser("list", help="Show someone's security keys")
    ls.add_argument("--email", required=True)
    rm = sub.add_parser("remove", help="Remove all of someone's security keys")
    rm.add_argument("--email", required=True)
    rm.add_argument("--reason", required=True, help="Why (kept in the audit log)")
    args = parser.parse_args(argv)
    if args.what == "list":
        for name, added in asyncio.run(list_keys(args.email)):
            print(f"{name}  (added {added})")
        return 0
    if len(args.reason.strip()) < 5:
        raise SystemExit("Give a reason of at least 5 characters.")
    count = asyncio.run(remove_keys(args.email, args.reason))
    print(f"Removed {count} security key(s) and ended their console sessions.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
