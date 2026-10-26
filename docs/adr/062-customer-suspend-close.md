# ADR-062 — Admin Users: Suspend, Reactivate and Close Customers

| Attribute | Value |
|---|---|
| **Status** | **IMPLEMENTED** — 2026-10-26 (server + console) |
| **Decision ID** | DEC-069 |
| **Authority** | Product owner, 2026-10-26, on the Figma "Users" frame (Active / Suspended / Deactivated): "Suspend = temporary, Deactivate = closed"; "Super Admin only". Builds on ADR-051 (A-3) and ADR-060's authorization matrix ("Suspend users … Super Admin … Built in A-3"). |
| **Constraints** | SEC-008 (server-side authorization, audit), ADR-001 (escrow never touched by account actions). |

## Decisions

1. **Suspended** (temporary): the customer is logged out at once (every session revoked,
   `account_suspended`), can't log in, and their offers leave the market (listing and taking
   both refuse them, a take answers like a missing offer). Deals already under way keep
   settling: no settlement, leg or hold is changed. A Super Admin can lift it (back to
   `active`); the offers return.
2. **Closed** (for good; Figma "Deactivated"): same effects, and the console can't reopen it.
   The phone and email stay taken, so a new sign-up can never take over a closed or
   suspended account (sign-up treats any finished account as existing; email uniqueness now
   covers active, suspended and closed accounts).
3. **Super Admin only** for all three actions, with a written reason (5–300 characters).
   Each change is audit-logged (`customer_suspended`, `customer_reactivated`,
   `customer_closed`, with from/to status and the reason). Reading the list needs `users.read`.
4. **List**: ID (short reference from the account id), name (legal name from an approved
   identity check, else "—"), email, phone, last log-in, status; search by name, email or
   phone (4+ digits); status filter; 50 per page. Tiles: total accounts, active (used the app
   in the last 30 days), inactive (no activity for 30 days), identity checks waiting. Figma's
   "up from yesterday" lines are not shown (no comparison defined for these counts).

## What is built

- Migration `0025`: `users.status` allows `suspended`, `closed`; verified iff not pending;
  email unique among non-pending accounts; session revoke reasons `account_suspended`,
  `account_closed`. Downgrade refuses while any account is suspended or closed.
- `GET /api/v1/admin/users`, `GET /api/v1/admin/users/stats`,
  `POST /api/v1/admin/users/{id}/{suspend|reactivate|close}` (`backend/app/services/customers.py`).
- Console: Users page (menu "Users" for `users.read`), ⋮ menu only for a Super Admin, reason
  dialog; audit log shows the new actions in words.

## Not yet

- A suspended customer currently sees the same answer as a wrong PIN on log-in (fail-closed,
  reveals nothing). A clearer "your account is suspended, contact support" message after a
  correct PIN, and an email to the customer, need an owner decision on wording.
- Customer detail page (KYC, deals, disputes for one customer).

## Evidence

`backend/tests/integration/test_admin_customers.py` (list/search/counts; suspend logs out,
hides and blocks the offer, reactivate restores; close is final and sign-up can't take it
over; only a Super Admin, reason required, session and header required),
`admin/__tests__/users.test.tsx`, migration round trip in `test_migrations.py`.
