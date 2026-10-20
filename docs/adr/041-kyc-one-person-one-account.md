# ADR-041 — One Verified Account per Person

| Attribute | Value |
|---|---|
| **Status** | **APPROVED** — 2026-10-19 (rule); mechanism below **PROPOSED** |
| **Decision ID** | DEC-048 |
| **Authority** | Product owner, 2026-10-19: answered **"A"** to "Should a person be allowed only one verified Xspeeria account?" (A = one person, one account; a second account goes to review instead of being approved). |
| **Extends** | ADR-039 (Didit identity checks) |

## Why

The first live Didit run (2026-10-19) approved the **same person on two Xspeeria accounts**. Didit flagged it (`DUPLICATED_FACE`, `POSSIBLE_DUPLICATED_USER`), but ADR-039 did not act on those warnings. Several accounts per person would let someone get around per-person limits or a ban.

## Rule

A person may hold **one** verified account. When an approved Didit result looks like a person already verified on **another** Xspeeria account, the case is **held for review** (`under_review`, reason `DUPLICATE_IDENTITY`), not approved and not refused. The user sees the usual "Being reviewed" words; nothing tells them why (no hint that helps someone game the check).

Re-verifying on the **same** account (e.g. after "Kyc Expired") is not a duplicate.

## How a duplicate is detected (both, server-side)

1. **Our own check — same ID document.** For an approved result the server computes
   `identity_key = HMAC-SHA256(KYC_IDENTITY_KEY, "v1|<issuing country>|<id type>|<document number, upper-case letters and digits only>")`
   and holds the case if a **different user** already has a verified case (approved, or approved then expired) with the same key. The raw document number is never stored or logged; only the keyed hash is kept, so it cannot be reversed by guessing numbers without the key. A transaction-scoped PostgreSQL advisory lock on the key makes two simultaneous approvals see each other; a partial unique index (one *approved* case per key) backs it up.
2. **Didit's own matching — same face or same document in another session.** If any entry in `id_verifications[].matches` or `liveness_checks[].matches` is an **Approved** session whose `vendor_data` is not this user, the case is held. (Field names taken from the live decision of 2026-10-19; Didit's device/IP warnings are **not** used — families and offices share phones and networks.)

An approved result **without a readable document number** is held too (`CHECKS_INCOMPLETE`), because check 1 could not run.

The existing configuration holds (missing check, AML not approved, no date of birth, no name) are now recorded with reason `CHECKS_INCOMPLETE`.

## Settings

`KYC_IDENTITY_KEY` — base64 of 32 random bytes. Required whenever Didit is configured; the server refuses to start without it. Rotating it breaks matching against older cases, so it is set once per environment (KMS later, with SEC-026).

## Data

Migration 0011 adds to `kyc_cases`: `identity_key CHAR(64)` (set once, guard trigger) and `review_reason VARCHAR(32)` (`DUPLICATE_IDENTITY`, `CHECKS_INCOMPLETE`). Cases approved before this change have no key (no document numbers were kept); they are not matched by check 1, only by Didit's check 2 for later sessions.

## Open (not decided here)

- **Who clears a held case, and how.** Staff review tools are paused waiting for the Figma file. Until then a held case stays `under_review`.
- Whether a duplicate should later be **refused** automatically, and what happens to the first account.
- Retention of `identity_key` after an account closes (with SEC-028 retention periods).
