# ADR-084 — Security Emails With a "This Wasn't Me" Link

| Attribute | Value |
|---|---|
| **Status** | **IMPLEMENTED** — 2026-11-02 (emails go out once Resend is set up, ADR-082) |
| **Decision ID** | DEC-091 |
| **Authority** | Owner, 2026-11-02: *"for every login, and important process done on the app, xspeeria sends email to notifies the users and add if you are not the one raise a fraud. this trigger an alert and the admin can switch one the user accounts."* Owner's answers the same day: what to email — **every log-in, account changes, payout accounts, deals**; how to report — **a link in the email**; what a report does — **freeze the account at once** (all sessions end; no deals or payouts until staff check and switch it back on). |
| **Amends** | ADR-054 (which alerts are emailed) and ADR-082 Decision 5 (emails had no links). |

## Decisions

### 1. What is emailed

The customer gets one email for each item below, done successfully. A refused or failed attempt sends nothing.

| Group | Emails |
|---|---|
| Log-ins | every log-in: PIN on a trusted phone, or a new phone after its checks |
| Account changes | PIN changed; PIN reset; phone number changed; fingerprint/Face ID log-in turned on or off; a trusted phone removed; 5 failed checks (checks locked) |
| Payout accounts | added; removed; chosen for a deal |
| Deals | offer or request posted; offer changed; offer withdrawn; offer taken |

- **Sign-up is not emailed:** it isn't a log-in into an existing account.
- **Fingerprint unlock is not emailed.** It reopens an app that is already signed in on a trusted phone; emailing it would send one email each time the app is opened.
- **Not emailed yet:** the bank paying out a deal, staff decisions, disputes. These already appear as in-app notifications (ADR-044). Adding them is a change to one list (`NOTICE_KINDS`).

### 2. How the emails are made

- **Each email is written as a row** (`security_notices`, migration 0041) together with the activity-log row (ADR-073) for the same thing.
  - For log-ins, PIN reset and the checks lock-out, the row is saved in the same transaction as the change itself.
  - For the other changes, it is saved just after the answer is sent, like the activity log. A change can't be emailed without being logged, and the other way round.
- **A background job sends due rows every 10 seconds** (`SECURITY_NOTICE_SECONDS`). It shows on System Health as "Security emails".
- **No email service call happens inside a database transaction.**
- **A failed send** is tried again after 2, 4, 6 and 8 minutes, five tries in all. Each new try carries a new link. After the fifth, the row is marked given up and has no working link.
- **What an email holds:**
  - a fixed subject;
  - the device, only as one of our own fixed names (e.g. "Xspeeria app (Android)", "Chrome browser"), otherwise "Another app or browser". The rest of a device header is chosen by whoever sent the request, so it never reaches the email;
  - the link.

  Never a name, amount, account number or code.
- **Rows are deleted after 30 days.** The activity log and any fraud alert keep the facts.

### 3. The link

- **What it points at:** `PUBLIC_API_URL/api/v1/security/not-me/<token>`. This is Xspeeria's own API address.
  - It must be `https` in production. The server refuses to start otherwise.
- **The token:**
  - 32 random bytes;
  - made when the email is sent;
  - valid for **7 days**;
  - works once.

  Only its SHA-256 is stored, so the database can't rebuild a working link.
- **Opening the link changes nothing.** Email scanners open links on their own. The link shows a plain page with:
  - which email it was about;
  - what freezing does;
  - one button, **Freeze my account**.

  The page shows no name, number or amount. It says it never asks for a PIN or code.
- **The page's protections:**
  - no scripts;
  - a strict Content-Security-Policy (`default-src 'none'`, the one style by hash, `form-action 'self'`, `frame-ancestors 'none'`);
  - `Referrer-Policy: no-referrer`, so the token in the address is never sent on to another site;
  - `no-store`;
  - not indexed;
  - limited per address like sign-in.
- **A wrong, used or expired link** shows "This link doesn't work" and changes nothing.

### 4. Pressing **Freeze my account**

All of this happens in one transaction.

1. **The account becomes `suspended`.** This is the same state as a staff suspension (ADR-062): offers are hidden and log-in is refused.
2. **Every session ends, and every trusted phone is forgotten.** A new log-in would need the full checks, and is refused while the account is suspended.
3. **Deals are held.** Each of the customer's deals whose payout hasn't been decided yet gets a **RISK hold**. A hold blocks the payout decision (ADR-001 §6a).
   - **A deal already paying out** (both sides paid, the bank instructed) **can't be stopped.** That is usually seconds, and is a known limit.
   - **The 5-minute funding window keeps running.** A deal not released by the end of the window is cancelled, and money paid in goes back to where it came from, never to a payout account. Staff will usually take longer than 5 minutes to check, so **in practice a freeze cancels and refunds the customer's open deals**. Only a deal that staff switch back on within its window still completes.
4. **A high fraud alert is raised:** `customer_reported_not_me`, "Customer said 'this wasn't me'" in the console. It records:
   - which email it was;
   - the device;
   - whether the account was active;
   - how many deals were held.
5. **The activity log records `reported_not_me`.**
6. **A confirmation email is sent:** "Your Xspeeria account is frozen". It has no link.

Pressing the button again changes nothing more.

### 5. Switching the account back on

- A Super Admin uses **Customers › Reactivate**, with a reason. This is the existing ADR-062 action, which is audit-logged.
- Reactivating also **closes the holds this freeze opened** (and only those), and the deals move on. The number released is written in the audit entry.
- The fraud alert stays for staff to resolve.

## Consequences

- **This amends ADR-082 Decision 5, which said emails carry no links.**
  - Security notices now carry exactly one link, to Xspeeria's own address.
  - Codes, operations alerts and the freeze confirmation still carry none.
  - The risk: a phishing email can imitate "click here". The page asks for nothing but a button press, and the emails say we never ask for a PIN or code.
- **Volume:** one email per log-in and per change. A very active trader gets many emails. Owner's choice.
- **Abuse:** whoever holds the email inbox can freeze the account. That is the point (the customer acting fast). The worst an inbox thief can do with it is freeze the account, which staff undo after checking.
- **The emails need a working email sender** (Resend, ADR-082). Without one, no emails go: the rows wait and are deleted after 30 days.
- **In English only**, like the other emails.

## Evidence

- **`backend/tests/integration/test_not_me_emails.py` (10 tests, PostgreSQL 16):**
  - a log-in is emailed with a one-time link, and only its hash is stored;
  - changes are emailed and refused attempts are not;
  - opening the link changes nothing, and the page headers are checked;
  - the button freezes at once (sessions, trusted phones, log-in refused, high alert, confirmation without a link, a second press changes nothing);
  - wrong or expired links do nothing;
  - a failed email is retried, then given up;
  - payout account and deal steps are emailed;
  - a frozen deal pays out nothing until a Super Admin reactivates, then completes;
  - a frozen deal left unpaid is cancelled, not paid out;
  - a made-up device header can't put its words into the email.
- **`tests/unit/test_resend_email.py`:** a notice carries only its link; the confirmation has none.
- **Updated tests:**
  - `test_second_check_api.py` (the alerts now go through the job);
  - `test_route_access.py` (the two link routes are listed as public, with the reason);
  - `test_row_level_security.py` (the new table is under the owner-rows policy).
- **Console (`admin/__tests__/fraud.test.tsx`):** the new alert in plain words.
- **Real email delivery through Resend:** `UNKNOWN — NOT VERIFIED` (no account yet).
