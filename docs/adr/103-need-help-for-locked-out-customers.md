# ADR-103 — "Need help?" for Customers Who Can't Log In (Reply Through the Form)

| Attribute | Value |
|---|---|
| **Status** | **IMPLEMENTED** — 2026-11-09 |
| **Decision ID** | DEC-115 |
| **Authority** | Owner, 2026-11-09. On the drafted support procedure for a customer who can't pass the face check: **"Yes. approved"**. Asked how a locked-out customer reaches Support: **"Need help"** (a form on the log-in screen). Asked whether to build a "redo identity check" button: **"Yes."** (built separately). Asked "How can staff chat with customer?", then chose **"Reply through the form"**. |
| **Resolves** | `PENDING_ACTIONS.md` "Support's procedure for a customer who can't pass the face check" (ADR-054). SEC-005 residual "Support re-verification procedure". |

## Problem

A customer who can't pass the new-phone face check (ADR-054) can't log in. The in-app dispute and support chat (ADR-063) needs a session, so it can't reach them.

## Decision

**Customer side (app, server builds).**

- A **"Need help?"** link on the log-in screen opens a form: phone number (with dialling code), email and a message (up to 2,000 characters).
- `POST /api/v1/help/requests` answers the same whether or not an account has that phone, so the form can't be used to find accounts.
- The answer is a request id and a **private key** (256 random bits). Only the key's SHA-256 is stored, and it is compared in constant time.
- The phone keeps the key in the secure store (this device only, unlocked). Reading the thread (`GET /api/v1/help/requests/{id}`) and replying (`POST …/messages`) need the id **and** the key, sent in the `X-Help-Key` header (never in the address). A missing request and a wrong key get the same 404.
- A customer can send at most **5 messages in a row** without a staff answer (429), and can't write to a closed request (409). The routes have the per-address limit of every route used before log-in.
- A closed request offers "Start a new request", which forgets the old key.
- The screens say never to send a PIN, codes or ID photos.

**Staff side (admin console, "Help requests").**

- `disputes.read` lists and opens requests. `disputes.update` replies and closes. The server checks both; the console hides the buttons only for display.
- Staff see the phone and email as typed and, when the phone matches an account, a link to that account's activity and whether the typed email matches the account's email too.
- Every reply and close is written to the staff audit log (`help_replied`, `help_closed`). Closing is idempotent.

**The approved procedure applies.** Nothing proves who wrote the form. Staff never confirm that an account exists and never share account details in the thread. They send the person through the checks (face check, identity check) rather than changing the account from the console.

**Data.** Migration **0047** adds `help_requests` and `help_messages`. The app role may read, add and update requests (status), and read and add messages. They have no row policy, because they have no user-id column; the app reaches them only through the key or a staff permission. A staff message must name its staff member, and a customer message must not. When a matched account is deleted, the match is cleared (ON DELETE SET NULL).

## Risks accepted

- **Anyone can open a request for any phone number.** The form changes nothing on the account. The match is shown to staff as a hint only, and the procedure forbids acting on it alone.
- **Losing the phone loses the thread.** The person starts a new request. This is the same as having no account access.
- **Staff replies are not pushed to the phone.** The customer sees them when they open "Need help?" again or tap Refresh. There is no SMS or email for replies (no provider yet), and an email would go to an address nothing proves belongs to the writer.
- **No automatic retention yet.** Help requests are kept until a retention rule is set (with the rest of the retention schedule, SEC-022).

## Evidence

- `backend/tests/integration/test_help_requests.py` (10 tests):
  - the same answer with or without an account;
  - bad forms refused;
  - only the key holder reads and replies, and only the hash is stored;
  - 5 unanswered messages, then wait;
  - staff see the match, reply and close, with audit entries;
  - staff need the dispute permissions.
- `backend/tests/unit/test_route_access.py`: the three public routes are listed and limited per address.
- `mobile/__tests__/need-help.test.tsx` (5 tests): the form, the saved key, the thread, replies and a refusal, a closed request, and the log-in link.
- `admin/__tests__/help-requests.test.tsx` (3 tests): list, open, match, reply, close; read-only staff; closed requests and the filter.
