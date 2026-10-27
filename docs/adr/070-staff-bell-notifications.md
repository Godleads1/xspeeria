# ADR-070 — Staff Bell: Work Waiting for You

| Attribute | Value |
|---|---|
| **Status** | **IMPLEMENTED** — 2026-10-27 (server, migration 0032, console) |
| **Decision ID** | DEC-077 |
| **Authority** | Product owner, 2026-10-27: chose **"Staff bell notifications (Recommended)"** as the next build. Fills the bell left empty by ADR-060 ("staff notifications … come with A-3"), and the "not built" bell items in ADR-068 (new fraud alerts) and ADR-069 (checks that need staff). Session rules from ADR-060 (15 minutes idle, 8 hours max). |
| **Constraints** | No sample counts (ADR-061). Display only: every action is checked again on its own page. Checking the bell must not keep an idle session alive. Nothing personal in the list. |

## Decisions

1. **The bell lists work waiting for the signed-in person**, read live from the queues. Nothing is copied into a notifications table, so the list can never show work that is already done:

   | Kind | Shown to staff with | What is waiting |
   |---|---|---|
   | `kyc_confirm` | `kyc.approve` | A held identity check **someone else** recommended approving (ADR-069) |
   | `kyc_recommend` | `kyc.update` | A held identity check nobody has picked up |
   | `reversal` | `reversals.approve` | A refund **someone else** asked for, waiting for a second person (ADR-065) |
   | `fraud` | `fraud_alerts.update` | A fraud alert still `open` (ADR-068) |
   | `dispute` | `disputes.update` | An `open` dispute or support case, unassigned or assigned to you (ADR-063) |

   Your own requests never appear in your bell, because you can't decide them yourself.
2. **Each item** shows a kind, the reference, the time it arrived, and the fraud severity or dispute priority. Customer names and amounts are left out. Clicking an item opens its case page. The newest 50 are listed; the count covers everything.
3. **The red count is what's new**: work that arrived since you last opened the panel. Opening the panel records the time (`staff_accounts.notifications_seen_at`, migration 0032) and clears the count. The dots stay for that look.
4. **The bell checks every minute and when the tab comes back into view.** These checks use `GET /api/v1/admin/notifications`, which does **not** count as activity (`authenticate(…, touch=False)`). An idle session still ends after 15 minutes. When it has, the bell's 401 sends the page back to log-in.
5. **Endpoints:** `GET /api/v1/admin/notifications` (passive) and `POST /api/v1/admin/notifications/seen` (normal activity). Neither takes input: the server decides who you are and what you may see.

## Evidence

- `backend/tests/integration/test_staff_bell.py`:
  - a held check moves from the recommender's bell to a second person's and disappears once confirmed; a support agent sees nothing;
  - opening the panel clears the count;
  - a fraud alert reaches compliance but not ops (read-only), and leaves once in progress;
  - bell checks alone don't keep a session alive (signed out after 16 minutes);
  - signed out → 401; query parameters ignored.
- `admin/__tests__/bell.test.tsx`: count, list and links, opening marks seen, empty state, "newest 50 of N", checks every minute, a 401 goes to log-in, other errors stay quiet.
- Browser check (Playwright, 2026-10-27): light, dark and Arabic; an item link opens its case; the count stays cleared on the next sign-in.

## Not built

- Email or phone alerts to staff (needs an email provider, PENDING_ACTIONS §2).
- Alerts for outages (staff create those themselves) and for advert end dates.
