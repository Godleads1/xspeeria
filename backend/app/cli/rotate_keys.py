"""Rotate the payout-account encryption key (ADR-076; incident plan §3.4).

    cd backend
    # 1. Put the NEW key in BENEFICIARY_ENCRYPTION_KEY and the OLD one in
    #    BENEFICIARY_ENCRYPTION_KEY_PREVIOUS (environment or .env; never on the command line).
    uv run python -m app.cli.rotate_keys beneficiary            # dry run: counts only
    uv run python -m app.cli.rotate_keys beneficiary --apply    # re-seal every row
    # 2. When it reports 0 left under the old key, remove BENEFICIARY_ENCRYPTION_KEY_PREVIOUS.

Every payout account number is opened with the old key and sealed again with the new one,
still bound to its own row (AES-256-GCM, ADR-035). Safe to stop and run again: a row that
already opens with the new key is skipped. A row that opens with neither key is never
changed: it is counted as unreadable and the command exits non-zero, so nobody removes the old
key while data still needs it. Numbers are never printed or logged; only counts are.

``KYC_IDENTITY_KEY`` (the one-person-one-account document key) can't be re-keyed from stored
data, because the document numbers are deliberately not kept. It rotates by keeping the old
key as ``KYC_IDENTITY_KEY_PREVIOUS``: new checks are matched against both (``app.services.kyc``).
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.logging import get_logger
from app.core.mfa import SecretBox, SecretBoxError
from app.models.payouts import Beneficiary

__all__ = ["ResealReport", "reseal_beneficiaries"]

_logger = get_logger(__name__)
BATCH = 500


@dataclass
class ResealReport:
    already_new: int = 0
    resealed: int = 0
    unreadable: int = 0
    applied: bool = False

    @property
    def ok(self) -> bool:
        return self.unreadable == 0


def _opens(box: SecretBox, sealed: bytes, bound_to: str) -> str | None:
    try:
        return box.open(sealed, bound_to=bound_to)
    except SecretBoxError:
        return None


async def reseal_beneficiaries(
    db: AsyncSession, old: SecretBox, new: SecretBox, *, apply: bool, batch: int = BATCH
) -> ResealReport:
    """Re-seal every payout account number from ``old`` to ``new``. One transaction per batch;
    rows are locked while they change. With ``apply=False`` nothing is written."""
    report = ResealReport(applied=apply)
    after = None
    while True:
        stmt = select(Beneficiary).order_by(Beneficiary.id).limit(batch)
        if after is not None:
            stmt = stmt.where(Beneficiary.id > after)
        if apply:
            stmt = stmt.with_for_update()
        rows = (await db.scalars(stmt)).all()
        if not rows:
            break
        for row in rows:
            bound = str(row.id)
            if _opens(new, row.account_number_sealed, bound) is not None:
                report.already_new += 1
                continue
            plain = _opens(old, row.account_number_sealed, bound)
            if plain is None:
                report.unreadable += 1
                continue
            report.resealed += 1
            if apply:
                row.account_number_sealed = new.seal(plain, bound_to=bound)
            del plain
        after = rows[-1].id
        if apply:
            await db.commit()
        else:
            await db.rollback()
    _logger.warning(
        "beneficiary_key_rotation",
        extra={
            "applied": apply,
            "resealed": report.resealed,
            "already_new": report.already_new,
            "unreadable": report.unreadable,
        },
    )
    return report


def _boxes(settings: Settings) -> tuple[SecretBox, SecretBox]:
    if not settings.beneficiary_encryption_key or not settings.beneficiary_encryption_key_previous:
        raise SystemExit(
            "Set BENEFICIARY_ENCRYPTION_KEY (new) and BENEFICIARY_ENCRYPTION_KEY_PREVIOUS (old)."
        )
    if settings.beneficiary_encryption_key == settings.beneficiary_encryption_key_previous:
        raise SystemExit("The new and old keys are the same.")
    new = SecretBox(settings.beneficiary_encryption_key, name="BENEFICIARY_ENCRYPTION_KEY")
    old = SecretBox(
        settings.beneficiary_encryption_key_previous, name="BENEFICIARY_ENCRYPTION_KEY_PREVIOUS"
    )
    return old, new


async def _main(settings: Settings, old: SecretBox, new: SecretBox, apply: bool) -> int:
    from sqlalchemy.ext.asyncio import async_sessionmaker

    from app.db.session import build_engine

    engine = build_engine(settings)
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as db:
            r = await reseal_beneficiaries(db, old, new, apply=apply)
    finally:
        await engine.dispose()
    verb = "Re-sealed" if apply else "Would re-seal"
    print(f"{verb} {r.resealed} payout accounts; {r.already_new} already use the new key.")
    if r.unreadable:
        print(
            f"{r.unreadable} payout accounts open with neither key. Nothing was changed for "
            "them. Keep BENEFICIARY_ENCRYPTION_KEY_PREVIOUS and investigate before going on.",
            file=sys.stderr,
        )
        return 1
    if apply:
        print("Done. When every server runs with the new key, remove the previous key.")
    else:
        print("Dry run: nothing was written. Run again with --apply.")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Rotate encryption keys (ADR-076).")
    sub = parser.add_subparsers(dest="what", required=True)
    b = sub.add_parser("beneficiary", help="Re-seal payout account numbers with the new key.")
    b.add_argument("--apply", action="store_true", help="Write the changes (default: dry run).")
    args = parser.parse_args(argv)
    settings = get_settings()
    old, new = _boxes(settings)  # refuse before touching the database
    return asyncio.run(_main(settings, old, new, args.apply))


if __name__ == "__main__":
    raise SystemExit(main())
