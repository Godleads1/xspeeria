# ruff: noqa: F811  -- pytest fixtures are imported by name and used as parameters
"""Key rotation (ADR-076): payout account numbers are re-sealed from the old key to the new
one, safely and repeatably; the ID-document key rotates by matching new checks against the old
key as well. Against PostgreSQL."""

from __future__ import annotations

import base64
import dataclasses
import uuid

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.cli.rotate_keys import reseal_beneficiaries
from app.core.config import Settings
from app.core.mfa import SecretBox
from app.db.session import build_engine
from tests.integration.test_auth_api import _sql, clean, migrated  # noqa: F401
from tests.integration.test_kyc_api import K, _status, _verify, k  # noqa: F401
from tests.integration.test_matches_api import OWNER, TAKER
from tests.integration.test_payouts_api import BOX_KEY, Party, env, owner  # noqa: F401

pytestmark = [pytest.mark.integration, pytest.mark.asyncio]

OLD = SecretBox(BOX_KEY, name="old")
NEW = SecretBox(base64.b64encode(bytes(range(1, 33))).decode(), name="new")


async def _reseal(db_settings: Settings, *, apply: bool, old: SecretBox = OLD) -> object:
    engine = build_engine(db_settings)
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as db:
            return await reseal_beneficiaries(db, old, NEW, apply=apply, batch=1)
    finally:
        await engine.dispose()


async def _rows(db_settings: Settings) -> list[tuple[uuid.UUID, bytes]]:
    engine = build_engine(db_settings)
    try:
        async with engine.connect() as conn:
            from sqlalchemy import text

            return [
                (r[0], bytes(r[1]))
                for r in (
                    await conn.execute(
                        text("SELECT id, account_number_sealed FROM beneficiaries ORDER BY id")
                    )
                ).all()
            ]
    finally:
        await engine.dispose()


# --- payout account numbers --------------------------------------------------------------------


async def test_payout_accounts_are_resealed_with_the_new_key(
    db_settings: Settings, owner: Party
) -> None:
    await owner.ngn("0123456789")
    await owner.ngn("0987654321")
    before = await _rows(db_settings)
    # A dry run reads everything and writes nothing.
    dry = await _reseal(db_settings, apply=False)
    assert (dry.resealed, dry.already_new, dry.unreadable) == (2, 0, 0)  # type: ignore[attr-defined]
    assert await _rows(db_settings) == before
    # The real run re-seals each number with the new key, still bound to its own row.
    done = await _reseal(db_settings, apply=True)
    assert (done.resealed, done.unreadable) == (2, 0)  # type: ignore[attr-defined]
    numbers = {NEW.open(sealed, bound_to=str(rid)) for rid, sealed in await _rows(db_settings)}
    assert numbers == {"0123456789", "0987654321"}
    # Running again changes nothing: every row already uses the new key.
    again = await _reseal(db_settings, apply=True)
    assert (again.resealed, again.already_new) == (0, 2)  # type: ignore[attr-defined]


async def test_a_row_neither_key_opens_is_left_alone_and_reported(
    db_settings: Settings, owner: Party
) -> None:
    await owner.ngn("0123456789")
    wrong_old = SecretBox(base64.b64encode(b"x" * 32).decode(), name="wrong")
    before = await _rows(db_settings)
    r = await _reseal(db_settings, apply=True, old=wrong_old)
    assert (r.resealed, r.unreadable, r.ok) == (0, 1, False)  # type: ignore[attr-defined]
    assert await _rows(db_settings) == before


async def test_the_command_refuses_without_both_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.cli import rotate_keys

    monkeypatch.setattr(
        rotate_keys,
        "get_settings",
        lambda: Settings(_env_file=None, beneficiary_encryption_key=BOX_KEY),  # type: ignore[call-arg]
    )
    with pytest.raises(SystemExit, match="BENEFICIARY_ENCRYPTION_KEY_PREVIOUS"):
        rotate_keys.main(["beneficiary"])
    monkeypatch.setattr(
        rotate_keys,
        "get_settings",
        lambda: Settings(  # type: ignore[call-arg]
            _env_file=None,
            beneficiary_encryption_key=BOX_KEY,
            beneficiary_encryption_key_previous=BOX_KEY,
        ),
    )
    with pytest.raises(SystemExit, match="same"):
        rotate_keys.main(["beneficiary"])


# --- the ID-document key --------------------------------------------------------------------


async def test_a_document_approved_under_the_old_key_is_still_found(
    db_settings: Settings, k: K
) -> None:
    old_key = k.env.runtime.kyc_identity_key
    assert old_key is not None
    _, owner_uid, _ = await _verify(k, OWNER)
    # Rotate: a new current key, the old one kept as the previous key.
    app = k.env.client._transport.app  # type: ignore[attr-defined]
    app.state.auth = dataclasses.replace(
        app.state.auth, kyc_identity_key=b"n" * 32, kyc_identity_key_previous=old_key
    )
    token, uid, _ = await _verify(k, TAKER)  # the same passport, on another account
    assert await _status(k, token) == "under_review"
    matched = await _sql(
        db_settings,
        "SELECT matched_user_ids::text FROM kyc_cases WHERE user_id = CAST(:u AS uuid)",
        u=uid,
    )
    assert owner_uid in matched
