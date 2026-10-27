# ADR-073 — Customer Activity Log and Deal Timeline

| Attribute | Value |
|---|---|
| **Status** | **IMPLEMENTED** — 2026-10-27 (server, migration 0034, console) |
| **Decision ID** | DEC-080 |
| **Authority** | Product owner, 2026-10-27: *"audit log per user to track all what each users are doing on the app with their timesamp, also audit log per transaction id"*, then *"Super Admin see it"*, *"5 years"* and *"build the customer activity log and the transaction timeline, kept 5 years, Super Admin only"*. Supports SEC-036 (logging) and FX-04 (auditability of financial events). |
| **Constraints** | Never a PIN, code, token, BVN, ID number, proof-of-address content, account number or request body (F-16 logging rule, ADR-025 §1.8; Standing Standards). Super Admin only. Read-only in the console. Kept 5 years. |

## Decisions

1. **Customer activity log** (table `customer_activity`), one row per thing a customer did:
   - **Every signed-in customer request that changes something** (not GET) is recorded by the request middleware after the answer is known, by **route template** (for example `/api/v1/matches/{match_id}/payout-accounts`). The result is kept as done (2xx/3xx), refused (4xx) or failed (5xx). Each of the 45 customer routes has a plain action name (`backend/app/core/activity.py`); an unlisted route is kept as "other".
   - **Steps before the customer is known** are recorded where they happen: signed up, signed in (and how: PIN, trusted phone), sign-in refused (wrong PIN or locked), PIN reset, unlock with fingerprint.
   - The route's IDs (deal, offer, dispute, payout account, session) are kept as links. **Nothing from the body, query or headers is read.** The device is shortened to "Xspeeria app", "Chrome browser" and similar; the country is the two-letter code only when the hosting supplies it.
   - Writing the log never fails or slows the customer's request: an error is logged and the request carries on.
2. **Kept 5 years, append-only** (DB trigger `customer_activity_append_only`):
   - an UPDATE is always refused;
   - a DELETE is refused unless the row is **older than 5 years**;
   - a background job (`Activity log retention`, hourly, shown on System Health) deletes rows past 5 years;
   - the app's database user has SELECT, INSERT and DELETE only.
   - Downgrading the migration is refused unless `records_downgrade=authorized` is set.
3. **What the Super Admin sees** (new permission module `activity`, `activity.read`, given to **Super Admin only** by migration 0034):
   - **Users › row menu › View activity** (`/users/activity?id=…`; `GET /api/v1/admin/users/{id}/activity`): everything the customer did, newest first, merged with what **staff** did about them (suspend, reactivate, close, identity-check decisions, fraud alerts, disputes they opened). Filter by type and by date (Lagos days); load older entries; download a CSV of up to 500 rows (cells can't run as spreadsheet formulas).
   - **Transactions** (`/deals`; `GET /api/v1/admin/deals?q=`): find a deal by the **reference the customer sees** (first 8 characters of the deal ID), either customer's email, or the full ID.
   - **Deal timeline** (`/deals/case?id=…`; `GET /api/v1/admin/deals/{id}`): the summary, then every step in time order. Steps: offer posted, offer taken, payout accounts chosen, each escrow event the partner bank reported (with side, amount and fee), holds, disputes, refunds, and the customers' own steps on that deal. Equal times follow the natural order of a deal. Amounts are exact decimal text, never floats.
4. **Read-only**: no screen or API can change or delete an entry. The IDs in the address bar are checked as UUIDs before use; the server checks the permission on every call (other roles get 403).

## Not built

- Recording a customer's **reads** (screens viewed). Only changes and sign-in steps are recorded; reads would be far larger and add little for disputes or fraud.
- Showing the activity log to the customer themselves.
- Export beyond 500 rows at once (use the date filter).
- Steps from before this release: activity starts from migration 0034; deal timelines include escrow steps from older deals, since those were already recorded.

## Evidence

- `backend/tests/integration/test_activity_log.py`:
  - a deal from offer to payout: found by reference, email or ID; exact amounts; both funded sides attributed; steps in order;
  - one customer's activity: signed up, payout account added, offer taken, payout chosen, paid into escrow, sign-in refused, and the staff suspend and reactivate in the same list; filters; no PIN, code or account number anywhere in the log or the table;
  - append-only and 5-year rules; grants are exactly SELECT, INSERT and DELETE;
  - Super Admin only (Ops, Support and Compliance refused; unknown records 404; bad filter 422; signed-out 401).
- `admin/__tests__/activity.test.tsx`: the list, filters (Lagos dates), load more, server refusal, CSV safety, deal search, timeline order and attribution, exact money, menu permission. `admin/__tests__/users.test.tsx`: "View activity" for `activity.read` only.
- Browser check (2026-10-27) on the demo: light (English) and dark (French). Ops doesn't see Transactions.
