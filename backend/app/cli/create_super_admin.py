"""Create the first admin console Super Admin (ADR-051 A-1, ADR-060).

    cd backend
    uv run python -m app.cli.create_super_admin --email you@example.com \
        --name "Your Name" --phone +2348031234567

Asks for the password twice without showing it (never pass it on the command line: it
would stay in the shell history). Works only while no Super Admin exists; everyone else is
invited from the console. The Super Admin then logs in with the password and an email code.
"""

from __future__ import annotations

import argparse
import asyncio
import getpass
import uuid

from app.core.config import get_settings
from app.db.session import build_engine
from app.services.staff import StaffService

__all__ = ["create_super_admin"]


async def create_super_admin(
    email: str, name: str, password: str, phone: str | None = None
) -> uuid.UUID:
    from sqlalchemy.ext.asyncio import async_sessionmaker

    from app.main import build_auth_runtime

    settings = get_settings()
    runtime = build_auth_runtime(settings)
    engine = build_engine(settings)
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as db:
            return await StaffService(db, runtime).create_first_super_admin(
                email, name, password, phone
            )
    finally:
        await engine.dispose()


def _main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--phone", required=True, help="international form, e.g. +2348031234567")
    args = parser.parse_args()
    first = getpass.getpass("Password (at least 12 characters): ")
    if getpass.getpass("Password again: ") != first:
        raise SystemExit("The passwords don't match. Nothing created.")
    try:
        staff_id = asyncio.run(create_super_admin(args.email, args.name, first, args.phone))
    except ValueError as exc:
        raise SystemExit(f"Nothing created: {exc}") from None
    print(f"Super Admin created ({staff_id}). Log in to the admin console with this email.")


if __name__ == "__main__":
    _main()
