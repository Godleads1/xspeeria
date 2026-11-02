# ADR-076 — Rotating the Payout-Account and Identity Keys

| Attribute | Value |
|---|---|
| **Status** | **IMPLEMENTED** — 2026-11-02 |
| **Decision ID** | DEC-083 |
| **Authority** | Product owner, 2026-11-02: *"do these"* ("key rotation tools for the payout-account and identity keys"). It closes the incident plan's §3.4 gap: before this, neither key could be changed safely. Supports SEC-027 (secret rotation). |
| **Constraints** | CLAUDE.md: rotating credentials on a live system needs explicit human approval. The tool is built and tested here; running it on a shared or live database is the owner's decision. Account numbers and document numbers are never printed or logged. |

## Decisions

1. **`BENEFICIARY_ENCRYPTION_KEY`** (payout account numbers, AES-256-GCM bound to each row, ADR-035): `python -m app.cli.rotate_keys beneficiary [--apply]`.
   - The new key goes in `BENEFICIARY_ENCRYPTION_KEY` and the old one in `BENEFICIARY_ENCRYPTION_KEY_PREVIOUS`, both from the environment, never the command line. The tool refuses if either is missing or they're the same.
   - **Dry run by default.** With `--apply`, each row is opened with the old key and sealed again with the new one, still bound to its own row, in locked batches.
   - **Repeatable:** a row that already opens with the new key is skipped.
   - **Fails closed:** a row neither key opens is never changed. It's counted, and the tool exits non-zero, so nobody removes the old key while data still needs it.
   - Only counts are printed and logged.
2. **`KYC_IDENTITY_KEY`** (the keyed hash of an ID document, ADR-041) **can't be re-keyed**. Document numbers are deliberately not stored, so there's nothing to hash again. Rotation keeps the old key as `KYC_IDENTITY_KEY_PREVIOUS`:
   - a new check is hashed with both keys and matched against approvals under either;
   - its own hash uses the new key, and both keys' advisory locks are taken in a fixed order;
   - an approval found only under the old key isn't covered by the unique index on the new key, so its account is recorded in `matched_user_ids`. The reviewers' confirmation then refuses while that account is still verified (F-008).
   - The old key stays needed as long as approvals made with it matter. Retiring it fully would need fresh document numbers, for example from Didit's stored decisions. That's not built, because it would depend on provider behaviour not yet confirmed.
3. The incident plan's rotation table (§3.4) now gives the steps.

## Evidence

- `backend/tests/integration/test_key_rotation.py`:
  - a dry run writes nothing; apply re-seals every number so it opens with the new key; a second run changes nothing;
  - a row neither key opens is left alone and reported;
  - the tool refuses without both keys, or with the same key twice;
  - a document approved under the old identity key is still found after rotation, and the new check is held with that account recorded.
