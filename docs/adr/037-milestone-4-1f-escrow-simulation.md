# ADR-037 — Milestone 4.1F: Escrow Steps with a Pretend Partner Bank (Simulation Only)

| Attribute | Value |
|---|---|
| **Status** | **APPROVED** (decisions in §2) — the details marked PROPOSED in §4 still need confirming |
| **Date** | 2026-10-19 |
| **Decision ID** | DEC-043 |
| **Authority** | Product owner, 2026-10-19: **"Escrow with pretend bank"**, **"Yes, simulation only"**, **"Keep 5 minutes"** (funding window), **"Refund it in full"** (fee on a failed deal). Model in the owner's words: "Xspeeria does not hold money...the user pays the money to a escrow account and the partnering bank settle the payout account". `DOCUMENT_INDEX.md` §1 rank 2. |
| **Resolves** | U-1 (fee on a failed deal: refunded in full) and U-2 (funding window: 5 minutes, no extension) **for the simulation**, by the product owner. ADR-001 §11 also names Legal (U-1) and Risk + the partner's SLA (U-2): they must confirm before a real partner. |
| **Builds on** | ADR-001 (state machine), ADR-002 (event architecture), ADR-008/022 (24-hour payout hold), ADR-021 (1% fee, split payouts), ADR-035 (payout accounts, preparation) |
| **Does not change** | ADR-001 §12 legal gate: **no real partner** may be connected without legal and compliance sign-off. |

## 1. The model

Xspeeria never holds money. When a deal is `funding_ready` (ADR-035), the server records a
**Settlement** with two **legs**, one per country (each leg is domestic, F-8):

| Leg | Who pays in | Into | Bank pays out to |
|---|---|---|---|
| REQUESTER | the offer's owner: what they sell + 1% | escrow in that currency | the taker's chosen accounts |
| ACCEPTER | the taker: the counter amount + 1% | escrow in the other currency | the owner's chosen accounts |

1. The server asks the partner to open both escrows (outbox, after commit). When both are open
   the deal is **AWAITING_FUNDING** and the **5-minute** funding window starts.
2. Each side transfers amount + fee into its escrow. Only the partner's **signed message**
   ("verified", exact amount + fee) makes a leg FUNDED.
3. When both legs are FUNDED, both payees' accounts are bank-confirmed and no blocking hold is
   open, release is decided once (ADR-001 §6a) and the bank pays out. Its "completed" messages
   make the legs PAID_OUT and the deal **COMPLETED**.
4. Window passes with nobody paid → **CANCELLED** (TIMEOUT). One side paid → **UNWINDING**:
   that escrow is returned **in full, fee included**, then **CLOSED_UNWOUND**. In both cases
   the deal's amount goes back on the offer.

## 2. Decisions

| Item | Decision |
|---|---|
| Partner | **Pretend bank only** (`PRETEND_BANK=true`, refused unless `APP_ENV=local`). In memory, moves no money, lost on restart. Pretend partners are seeded by `python -m app.cli.pretend_bank` (local only) and marked `is_simulated`. Without the pretend bank no settlement is created (fail closed). |
| Funding window | **5 minutes** from both escrows opening (U-2). |
| Fee on a failed deal | **Refunded in full** (U-1): the return is amount + fee. |
| Money facts | FUNDED / PAID_OUT / RETURNED only from a partner message that passes ADR-002 §3: HMAC-SHA256 over the exact bytes (`X-Xspeeria-Signature`), timestamp within ±5 minutes (`X-Xspeeria-Timestamp`, also inside the body), strict schema, duplicate check (again under the lock), leg owned by that partner, exact amount and currency, allowed transition. |
| Evidence | Every message from a known partner is kept in `webhook_receipts` with its verdict (append-only). Premature → `pending_events` (re-checked after each acceptance). Impossible or wrong amount → reconciliation exception + blocking hold. Nothing is discarded or "fixed". |
| Commands | Open / release / return go through `outbox_messages` **after commit** with a deterministic key `sha256(settlement|leg|op|decided_at)`; retries reuse the key. Release failures never unwind on their own: a DISPATCH_FAILURE hold opens. |
| 24-hour payout hold | Read from ADR-008/022 ("paid after a 24-hour security hold"): if a payee's account is new, or the payee had a 2FA reset or recovery log-in, the release command waits in the outbox until the hold ends; the money stays in escrow and the deal stays RELEASING. The payee sees their own `paid_after`; the other side never sees it. |
| Changed account | If a chosen payout account is removed or no longer confirmed when release is due, nothing is paid: a RISK hold opens for a person to decide. |
| Database | Migration 0009. Triggers allow only ADR-001 phase and leg transitions, set `release_authorized_at` and money-fact times once, keep amounts/parties immutable and forbid deletes; `settlement_events` and `webhook_receipts` are append-only. App role: `partners` SELECT; events, receipts, payout instructions, transactions INSERT+SELECT only. |
| Ledger | **Not built.** No balance, wallet or accounting table (finance policy P-1/P-2 not approved; ADR-002). Drift guards forbid `ledger_entries`, `balances`, `wallets`. |
| Locks | Settlement first, then its legs in `leg_id` order; leg state re-read inside the lock. Offer row locked last when an amount goes back. |

## 3. Endpoints

| Route | Who | Notes |
|---|---|---|
| `GET /api/v1/matches/{id}/settlement` | the two parties (KYC, per-user limit) | Phase, deadline, my pay-in (amount, fee, total, bank instructions while the window is open), what I receive and my own `paid_after`. Never the other party's identity or accounts. |
| `POST /api/v1/webhooks/partners/{code}` | partner (signature only) | 16 KB limit, 60 a minute per address. Unknown partner → 404, not stored. |
| `POST /api/v1/dev/matches/{id}/simulate-transfer` | the funder; **only registered with the pretend bank on a developer's computer** | Pretends my transfer of amount + fee arrived; goes through the pretend bank's signed message, never straight to FUNDED. |

## 4. PROPOSED details (need confirming)

| Item | Proposed | Why it matters |
|---|---|---|
| `fee_minor` on each leg | Stored per leg (1%, half-even) | ADR-021 says what the fee is but not where it is recorded. |
| Dispatch attempts | 5, backoff 2, 4, 8, 16 s (ADR-001 §6c says "N") | How long before a person is alerted. |
| Late money after CANCELLED | Kept as a STATE_MISMATCH exception for a person; not auto-returned | ADR-001 has no automatic path for it. |
| Escrow opened for a cancelled deal | Left for the partner to close; no "close escrow" command exists yet | Partner contract not known. |

## 5. Not built

Accounting ledger (P-1/P-2); admin transitions (ADR-001 8, 11–13) and closing holds;
RECOVERY_REQUIRED entry (no "permanent failure" rule); the advisory "I have paid" endpoint;
referral fee discounts; any real partner (legal gate, ADR-001 §12); partner secret storage
(the pretend bank keeps a random per-process secret).

## 6. Evidence

`backend/tests/integration/test_escrow_api.py` (normal path, timeout cancel, refund with fee,
late money, forged/old/malformed/foreign/duplicate/racing messages, wrong amounts, quarantine
then promotion, provisioning and release failures, removed account, payout hold, access rules,
dev-route absence, DB triggers and grants) and `backend/tests/unit/test_settlement_rules.py`.
