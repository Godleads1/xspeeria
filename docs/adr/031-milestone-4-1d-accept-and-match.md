# ADR-031 — Milestone 4.1D: Taking an Offer (Acceptance and Match)

| Attribute | Value |
|---|---|
| **Status** | **APPROVED** |
| **Date** | 2026-10-18 |
| **Decision ID** | DEC-037 |
| **Authority** | Product owner, 2026-10-18. Chose **"Accept & match"** as the next milestone (authorization). Answered: records **"Match only"**; smallest take **"Offer minimum, or rest"**; authenticator approval **"Yes, every time"**; market request limit **"60 per user per min"**. `DOCUMENT_INDEX.md` §1 rank 2. |
| **Implements** | API contract §3.5 `POST /v1/offers/{offer_id}/accept` and `GET /v1/matches/{match_id}`; data dictionary "Match"; Standing Standards §7.1–7.6; TDS §9.4 |

A Match records that one user agreed to take part or all of another user's Offer at that
Offer's rate. It is **information, not money**. No funds move, and nothing is sent to a
partner bank. Escrow and payouts come later (ADR-001 §14: nothing becomes actionable before
`ALLOCATION_FUNDING_READY`).

## 1. Decisions

| Item | Decision |
|---|---|
| What acceptance creates | **The Match only.** The `preparation_state`/`funding_state` fields, `allocation_requirements`, the Transaction and the Settlement are added with the payout-account and escrow milestones. Their stage names are not defined anywhere, so none are invented. `fx_request_id` is left out: FXRequest does not exist (R5-9 open), and the contract makes the column optional. |
| Smallest take | At least **₦10,000 or 10 USD/GBP/EUR** (as for offers), **or exactly what is left** when less than that remains. Otherwise `VAL_422_AMOUNT_BELOW_MINIMUM`. |
| Authenticator approval | **Every acceptance** spends one `trade.accept` step-up approval (ADR-026), sent as `X-Step-Up-Token`, within the same database commit. A retry with the same `Idempotency-Key` replays the first answer and needs no new approval. |
| Request limit | **60 requests a minute per signed-in user** on offer, marketplace and match routes (`AUTH_429_RATE_LIMITED`). This replaces the gap left by ADR-030 §2 and is separate from the sign-in limit. It is held in memory, so it is correct for one server only (Redis before scaling, ADR-025 §4). |

## 2. Rules built (from the contract and Standing Standards)

The order follows Standing Standards §7.1, all in **one** database transaction:

1. Lock the Offer row (`offer_id` is the serialization key).
2. Refuse the offer's owner (`AUTH_403_SELF_MATCH_FORBIDDEN`).
3. Look up the `Idempotency-Key` (24 hours, per user and operation). The same request gets the
   first answer, without re-checking capacity. A different request with the same key gets
   `SYS_409_IDEMPOTENCY_KEY_REUSED`.
4. For new requests only:
   - Spend the authenticator approval.
   - Check that the Offer is still marketplace-active: its status, and its stored rate is no
     higher than today's ceiling. Otherwise `RES_409_OFFER_UNAVAILABLE`.
   - Validate the amount. `accepted_amount` is required (`VAL_422_MISSING_FIELD`, never "take
     everything"), is an exact decimal string, and must be more than zero.
   - Check the amount against what is left. Too much gets `RES_409_INSUFFICIENT_REMAINING`; it
     is never clamped or resized.
5. Set `accepted_at` (server time) and `server_order_key` (a database identity column: unique,
   never supplied by the client, gaps allowed — S4-2).
6. Create the Match with the Offer's rate locked as `agreed_rate`.
7. Increase the Offer's `matched_amount` under the lock and set its status to
   `partially_matched` or `fully_matched`.
8. Store the remembered answer and commit.

**Database guarantees**
- `allocated_amount_minor > 0` (CHECK).
- `matched ≤ original` on the Offer (CHECK, from ADR-029).
- A composite FK to the permanent currency definitions.
- The running app (`xspeeria_app`) may only **SELECT and INSERT** matches, so a Match cannot
  be changed or deleted by the app.

**Who sees what**
- `GET /v1/matches/{id}` is for either party. Anyone else gets `AUTH_403_FORBIDDEN`, and a
  missing match gets `RES_404_MATCH_NOT_FOUND` (as listed in the contract).
- Neither party's identity is ever returned.

## 3. Response details the contract leaves open — PROPOSED

| Item | Built as |
|---|---|
| Match body | `match_id`, `offer_id`, `currency`, `counter_currency`, `allocated_amount` (string), `agreed_rate` (string), `accepted_at`, `server_order_key` (string), `your_role` (`taker` / `offer_owner`) |
| Extra route | `GET /v1/matches/mine` — matches where I took an offer or someone took mine, newest first |

## 4. Not in scope

- Payout-account selection and preparation.
- The preparation window, whose duration is open (Standing Standards §15 rows 9–10).
- Transaction and Settlement records, escrow and funding.
- The `MatchConfirmed`/`MatchCreated` event. No event system exists yet, and the rename is
  still open (§15 row 7).
- The app's "Buy" button calling this endpoint (next app step).
- Real KYC. The local-only bypass from ADR-029 still applies.

## 5. Evidence

- `backend/tests/integration/test_matches_api.py` covers:
  - Partial, full and remainder takes; the rate locked on the Match.
  - Both parties' views and lists.
  - Over-capacity refusals, bad and missing amounts, the minimum.
  - Unavailable offers (withdrawn, above the ceiling, full); self-match.
  - Missing, wrong, reused and other-user approvals.
  - Replay without a new approval; key reuse.
  - **Concurrency:** two racing takers never exceed the offer, and the same key sent twice at
    once makes one Match.
  - Order keys; app-role grants; the identity column; the CHECK.
- `test_offers_api.py::test_market_requests_are_limited_per_user`.
- Full backend suite: 741 passed locally against PostgreSQL 16 on 2026-10-18.
