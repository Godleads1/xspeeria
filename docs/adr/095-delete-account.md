# ADR-095 — Delete Account, With 14 Days to Undo

| Attribute | Value |
|---|---|
| **Status** | **IMPLEMENTED** — 2026-11-03 |
| **Decision ID** | DEC-107 (builds on DEC-106) |
| **Authority** | Owner, 2026-11-03: record keeping approved ("yes to this", DEC-106); "Delete account — build my suggested rule"; grace period **"14 days"**; activity log **"Keep it that way"** (5 years, ADR-073). Apple's and Google's store rules require deleting the account from inside the app. |

## The rule

1. **Asking:** Profile → Delete Profile. The app first asks the server what would stop it, then asks for the second check (step-up action `account.delete`: fingerprint/Face ID or the codes).
2. **Refused while anything is open**, and the customer is told which:
   - a deal being prepared or settling, on either side;
   - an open dispute;
   - a refund waiting for a decision;
   - a fraud review (an alert not resolved);
   - an account that isn't active (frozen or suspended).

   The server checks this again at the moment of deleting.
3. **At once, in one transaction:**
   - open offers and requests are withdrawn, nobody waits in their queues, and the customer leaves every queue;
   - every session ends (`account_closed`), along with the fingerprint keys that live on the sessions;
   - trusted phones, authenticator factors and payout accounts are switched off;
   - phone push stops;
   - the account is **closed**, with `deletion_requested_at` set.
4. **Email:** it says what happened, what is deleted after 14 days, what the law makes us keep and why, and how to restore. It has no "this wasn't me" link, because the account is already closed; it tells the customer to log in and restore instead.
5. **Restoring within 14 days:**
   - Logging in with the right PIN answers `AUTH_403_ACCOUNT_DELETING`, with the date. The app offers **Restore**.
   - Restoring reopens the account, then the **second check still runs**: trusted phones were switched off, so a session always needs it.
   - Payout accounts and trusted phones are not brought back; the customer adds them again.
   - A "your account was restored" email follows, with the usual "this wasn't me" link.
   - Before the PIN is checked, a deleting account looks exactly like an unknown one, so it reveals nothing.
   - An account closed by **staff** can never be restored this way.
6. **After 14 days** (the hourly clean-up job):
   - **removed:** in-app notifications and their push records, phone-push tokens, and the names of trusted phones (the rows stay, revoked, because sign-in history refers to them);
   - `deleted_at` is set.
   - The notifications guard (ADR-044) still refuses every other delete. It allows these only once `deleted_at` is set. This rule is the retention decision ADR-044 left open.
7. **Kept** (DEC-106):
   - **5 years from closing:** name, phone, email, date of birth; identity check and ID images; payout accounts used; deals, disputes, refunds and fraud alerts;
   - **7 years:** the staff audit log and deal events;
   - **5 years:** the customer activity log (ADR-073; the database refuses earlier deletes). The owner chose to keep this rule, 3 Nov 2026.
8. **Who sees kept records:** only Compliance (DEC-106).
   - In the admin console's Users list, a deleting or deleted account shows its state ("Deleting, restorable until…" or "Deleted by the customer").
   - Staff without `kyc.read` see no name, email or phone for it and can't find it by them.
   - Its activity view is refused to them.
   - Super Admin and Compliance Officer have `kyc.read`.
9. **The phone number and email stay taken** while the records are kept, as for any closed account.

## Not built (by design, for later)

- **After the 5 years:** an automatic job that removes the personal details and keeps only anonymous amounts. The first account reaches 5 years in 2031. It is listed in PENDING_ACTIONS.
- **Asking Didit, Resend and the photo storage to delete** what they hold that isn't needed: their deletion interfaces aren't connected yet (no live accounts). `UNKNOWN — NOT VERIFIED` against the live services.
- **Lawyer:** confirm the 5 years and keeping ID images for the whole period (DEC-106).

## Server

- **Migration 0043:**
  - `users.deletion_requested_at` and `users.deleted_at`, with checks (deleting only when closed; deleted only after a request);
  - an index for the clean-up;
  - the new step-up action;
  - the notifications guard change;
  - `DELETE` on `notifications`, `push_tokens`, `push_deliveries` for the app role (only the clean-up uses it).
- **Routes:**
  - `GET /api/v1/users/me/delete-account` → `{blockers, restore_days}`
  - `POST /api/v1/users/me/delete-account` (header `X-Step-Up-Token`, action `account.delete`) → `{restore_until}`; 409 `RES_409_ACCOUNT_DELETE_BLOCKED` with `blockers`
  - `POST /api/v1/auth/login` gains `restore_account` (strict boolean).
- **Code:** `app/services/account_deletion.py`, `AuthService.login`, `CustomerAdminService`, `ActivityAdminService`, and the hourly job "Account deletion clean-up".

## Evidence

- `backend/tests/integration/test_account_deletion.py` covers:
  - close at once and restore within 14 days (second check still asked; both emails; the right links);
  - after 14 days, no restore and the clean-up runs once, with the guard refusing other deletes;
  - refused while a deal is open (both sides);
  - refused under a fraud review;
  - a staff-closed account is never restored;
  - a session is required and the body is strict;
  - the console hides the details outside Compliance.
- `mobile/__tests__/delete-account.test.tsx`: the flow (second check, blockers, cancel, server refusal) and Restore at log-in.
- `admin/__tests__/users.test.tsx`: the deleted-account label; no activity action.
- Translations in all app and console languages.
