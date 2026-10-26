# ADR-066 — Service Outage Notices

| Attribute | Value |
|---|---|
| **Status** | **IMPLEMENTED** — 2026-10-26 (server, migration 0028, console, app Home) |
| **Decision ID** | DEC-073 |
| **Authority** | Product owner, 2026-10-26. Asked "Service Outage: when staff post an outage notice, what should the app do?", the owner answered **"Show a notice only"**: every app user sees a banner and nothing is blocked. Builds on ADR-051 A-3 (service outages), ADR-060 (the `outages` permissions) and the Figma "Service Outage Incident Management" frame. |
| **Constraints** | SEC-008 (permissions checked on the server); no customer data in a notice. |

## Decisions

1. **A notice informs and never blocks.** Trades, sign-in, payouts and escrow carry on as normal.
2. **What staff record** (`service_outages`):
   - the service, in the staff member's own words (2–60 characters);
   - the message app users read (5–300 characters);
   - the severity: low, medium or high;
   - the start time (now, or later for planned work);
   - an optional expected end;
   - the status: open, in progress or resolved.

   Resolving sets the end time and is final. Outages are never deleted, because they are the outage history. Every change is in the staff audit log.
3. **Who** (ADR-060), checked on the server:
   - `outages.read` sees the list;
   - `outages.create` reports an outage;
   - `outages.update` edits it, marks it in progress, or resolves it.

   The built-in Ops admin role has all three; Support agents have none.
4. **The app** (`GET /api/v1/service-notices`, signed-in users only) receives, for outages that have started and are not resolved, at most 5 items, most serious first:
   - the service;
   - the message;
   - the severity;
   - the start time and expected end.

   It never receives who reported the outage. Home shows them first, as cards coloured by severity, with "Expected back by …" when an end was given. If the request fails, nothing is shown and Home still works.
5. **Times** are typed and shown in Lagos time in the console (UTC+1 all year). The server requires a time zone on every time it receives.
6. **Design corrections to Figma:**
   - Figma's sample services ("API Gateway", "Auth Service", "Billing Engine") and dates are placeholders.
   - "End Time" shows when the outage was resolved, or the expected end marked "Expected".
   - Duration is computed by the server.
   - A line above the list says how many notices the app is showing right now.

## Not built

- Notices before sign-in: the endpoint needs a signed-in user.
- Push notifications for outages.
- Translating staff text: notices are shown as written.
- Automatic outage detection.

## Evidence

- `backend/tests/integration/test_admin_outages.py`:
  - a reported outage shows in the app until resolved;
  - the app never sees the reporter;
  - duration and audit entries;
  - resolved is final;
  - a planned outage shows only once it starts;
  - validation (severity, lengths, unknown fields, time zone, end after start);
  - access (support agent 403, signed-out app 401);
  - no delete grant.
- `admin/__tests__/outages.test.tsx`: Lagos time conversion, the list, reporting, resolving, read-only staff.
- `mobile/__tests__/serviceNotices.test.tsx`: Home shows the notices and the expected end, shows nothing when there are none, and the API sends the token.
