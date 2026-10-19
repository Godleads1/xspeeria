# ADR-035 — Milestone 4.1E: Payout Accounts and the 30-Minute Preparation Window

| Attribute | Value |
|---|---|
| **Status** | **APPROVED** (decisions) — the details marked PROPOSED in §4 still need confirming |
| **Date** | 2026-10-18 |
| **Decision ID** | DEC-041 |
| **Authority** | Product owner, 2026-10-18. Described the model: "Bank provides escrow accounts so the users can pay into that account and the user must have provides a or many payout accounts the bank will then pay into that or those payout accounts. The purpose of the escrow account is to ensure users is not defrauded". Then answered: **"Yes, start now"** (with a pretend bank check), **"Locked + last 4 shown"**, and **"30 minutes"**. `DOCUMENT_INDEX.md` §1 rank 2. |
| **Resolves** | Standing Standards §15 row 9 (preparation-window duration: **30 minutes**) |
| **Builds on** | ADR-001 §14 (preparation, `ALLOCATION_FUNDING_READY`), ADR-008, ADR-021 §3 (split payouts), ADR-022 (payout destination), ADR-031 (Match) |

## 1. The model

1. A deal (Match) is recorded when one user takes another's offer (ADR-031).
2. Within **30 minutes** each side chooses one or more of **their own** payout accounts, with
   the amount each gets. The amounts must add up exactly to what that side receives.
3. When both sides have chosen, the deal is **`funding_ready`**. Escrow comes next: the
   partner bank opens escrow, each side pays in plus its 1% fee (ADR-021), and the bank pays
   out to the chosen accounts once both sides have paid. That part needs the partner bank and
   is **not built**.
4. If 30 minutes pass first, the deal **expires**. The cause is recorded
   (`payout_accounts_not_chosen_in_time`) and the amount goes back on the offer (ADR-001
   §14.5). No money has moved at that point.

Xspeeria never holds money. It records where each user wants to be paid and, later,
instructs the bank.

## 2. Decisions

| Item | Decision |
|---|---|
| Start before the bank | Yes. A **pretend name check** (`BANK_CHECK_DEV=true`) approves every account as "DEV ACCOUNT HOLDER". It is refused unless `APP_ENV=local`. With no checker, new accounts stay `pending` and cannot be chosen (fail closed). |
| Account number at rest | **Sealed** with AES-256-GCM, bound to the account's id, using `BENEFICIARY_ENCRYPTION_KEY`. Only the **last 4 digits** are readable, returned or logged. `account_ref` is a random local placeholder until the bank issues its own reference. Without the key, payout accounts are switched off (`SYS_503`). The backend spec requires a KMS-managed key before go-live; recorded in PENDING_ACTIONS. |
| Window | **30 minutes** from `accepted_at`. Expiry happens: when the offer is next taken (under the offer lock, before capacity is read); when a deal is read or chosen; and from a background sweep every 30 seconds. All three use the same lock order as acceptance (offer, then match). |

## 3. Rules built

**Adding and removing payout accounts**
- Adding needs an authenticator approval (`beneficiary.add`); removing needs one too
  (`beneficiary.remove`) (ADR-008).
- Accounts are always the user's own.
- Formats follow the app's forms (ADR-022):
  - NGN: 10 digits.
  - USD: routing number with checksum, account number of 4–17 digits, Checking or Savings.
  - GBP: 6-digit sort code and 8-digit account number.
  - EUR has no approved form, so EUR accounts are refused.
- A new account has a 24-hour payout hold (`payout_hold_until`), checked when payouts exist.
- Removing hides the account from the list. A deal that already chose it keeps it.

**Choosing for a deal** (`PUT /matches/{id}/payout-accounts`)
- Needs an authenticator approval (`payout.confirm`). Only the two parties can choose
  (`AUTH_403_FORBIDDEN`).
- Up to 10 accounts. Each must be:
  - one of my own (otherwise 404);
  - not removed;
  - bank-confirmed;
  - in the currency I receive.
- The amounts are exact (no rounding) and must add up exactly to what I receive. The offer's
  owner receives the counter amount: allocated amount × rate, rounded half to even (ADR-019);
  for naira, ÷ rate.
- A choice can be replaced while the deal is waiting. After `funding_ready` or `expired` it
  cannot (`RES_409_INVALID_SETTLEMENT_STATE`).

**What the app sees on a deal**
- What I receive and the deadline.
- Whether I have chosen, and whether the other side has chosen. Never the other side's
  accounts.

**Database**
- CHECKs: the state is allowed; it has ended exactly when it is no longer awaiting; it has
  expired exactly when a cause is recorded; account last 4 is digits only; a validated account
  has `validated_at`.
- Grants to the running app:
  - `beneficiaries`: SELECT, INSERT, UPDATE.
  - `match_payout_selections`: SELECT, INSERT, DELETE.
  - `matches`: **column-level** UPDATE of the three preparation columns only. The deal's
    agreed terms still cannot be changed by the app.

## 4. PROPOSED — needs confirming

| Item | Built as |
|---|---|
| `preparation_state` values (none defined in the data dictionary) | `awaiting_payout_accounts`, `funding_ready`, `expired` |
| Routes (the contract has none) | `GET/POST /v1/payout-accounts`, `DELETE /v1/payout-accounts/{id}`, `PUT /v1/matches/{id}/payout-accounts` |
| Table for per-deal choices | `match_payout_selections` (the data dictionary only says "beneficiary selection linkage") |
| Changing a choice | Allowed while waiting, fixed once both sides have chosen |
| Upper bound | At most 10 accounts per deal (a request limit, not a product rule) |

Still **open** (Standing Standards §15 row 10): if a bank check later invalidates a chosen
account, does correcting it resume the original deadline or start a new one?

## 5. Not in scope

- Escrow, paying in, funding, payouts and the confirmation to both sides. These need the
  partner bank: escrow API, webhooks and payout API.
- The `funding_state` / `funding_deadline` columns.
- Real KYC. The account name should match the user's ID-checked name (Banking spec §3.3),
  which needs a KYC provider.
- The app screens. They come next.

## 6. Evidence

- `backend/tests/unit/test_payout_rules.py`: half-even counter amounts both ways, the routing
  checksum, account formats, the 30-minute window.
- `backend/tests/integration/test_payouts_api.py` (35 tests):
  - Accounts:
    - the account number is sealed; neither the response nor the logs ever contain it;
    - `local:` reference; 24-hour hold;
    - bad formats; EUR refused; approvals per action;
    - no key gives 503; no checker leaves accounts pending; removal.
  - Deals:
    - each side receives the right amount; the deadline is 30 minutes;
    - one side chooses, then the other splits across two accounts, giving `funding_ready`;
    - choices are fixed after that and can be changed while waiting;
    - bad sums, decimals, duplicates and currencies are refused;
    - someone else's, unconfirmed and removed accounts are refused;
    - outsiders and missing approvals are refused.
  - Expiry:
    - the amount returns to the offer and the cause is recorded;
    - choosing after the deadline is refused;
    - acceptance frees an expired amount;
    - ready deals never expire;
    - a withdrawn offer stays withdrawn;
    - the sweep expires once.
  - Grants: table-level and column-level.
  - CHECKs: an inconsistent preparation state is refused.
- Full backend suite: 786 passed locally against PostgreSQL 16 on 2026-10-18.
