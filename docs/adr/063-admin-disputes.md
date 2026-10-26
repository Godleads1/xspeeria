# ADR-063 — Admin Dispute Resolution: Categories, Staff Work, 24-Hour SLA

| Attribute | Value |
|---|---|
| **Status** | **IMPLEMENTED** — 2026-10-26 (server, console, app category list); re-check after closing fixed in ADR-065 |
| **Decision ID** | DEC-070 |
| **Authority** | Product owner, 2026-10-26, on the Figma "Dispute Resolution", "Dispute Details", "Raise Dispute", "Dispute category Setup" frames: categories "Staff-managed list" (start with the app's four; staff can add, rename or switch off; the app shows the active list); SLA "24 hours". Builds on ADR-057 (disputes and support), ADR-051 (decisions 4 and 6), ADR-060 (permissions). |
| **Constraints** | ADR-001 (escrow, no money moved by staff here), SEC-008, ADR-057 privacy (each party sees only their own words and staff replies). |

## Decisions

1. **Categories are a list staff manage** (`dispute_categories`). It starts with the app's four
   (`funds_not_received`, `wrong_amount`, `counterparty_unresponsive`, `other`). Staff holding
   `disputes.approve` add, rename, or switch categories off or on. Categories are never
   deleted. A switched-off category disappears from the app and from Raise Dispute; old cases
   keep it. The app shows its own translations for the built-in four and the staff's wording
   for added ones (`GET /api/v1/disputes/categories`). This replaces the fixed list in the data
   dictionary.
2. **SLA: 24 hours** from opening to closing. The list and the case show the time left (green,
   amber under 6 hours), "SLA Overdue", and "Met" or "Missed" once closed. The timer runs from
   the server's clock.
3. **Who does what** (from the role, checked on the server):
   - `disputes.read`: see the list, counts, a case with both sides' words, and categories.
   - `disputes.create`: open a case for a customer (ADR-051 decision 6), through the same
     rules as the app. The customer must be a party, only one open dispute per deal, and the
     deal's escrow is paused.
   - `disputes.update`: reply, mark In Progress, assign to staff who can work on disputes, and
     escalate with a reason (sets priority High).
   - `disputes.approve`: close a case with an outcome (`favor_initiator`, `favor_counterparty`,
     `split`, `no_fault`) and an optional note, and change categories.
4. **Closing never moves money.** It ends the case's `DISPUTE` hold (`closed_at`, plus a
   `HoldClosed` settlement event), so the escrow continues under its own rules: it pays out only
   if both sides paid in, otherwise it returns the money. A refund ("Process Refund" in Figma) is
   a reversal that needs an approver who did not ask for it (ADR-051 decision 4). It comes with
   the Reversal screens, not as a button here.
5. **Privacy (ADR-057) unchanged:** staff see both sides. Each customer still sees only their
   own words and staff replies, and staff replies go to both sides. The customer is notified of
   a staff reply (`dispute.reply`) and of closing (`dispute.resolved`). The payload carries only
   the case id.
6. **Design corrections:** the Figma Escalate dialog's button reads "Process refund"; here it
   reads "Escalate". The Figma's "Transaction amount" field and sample e-commerce text are not
   used: amounts come from the deal's escrow legs. "Advert Placement Setup" is not listed under
   Settings until advert upload is built (ADR-056).

## What is built

- **Migration `0026`:**
  - adds `dispute_categories` with the four seeded;
  - turns `disputes.reason` into a foreign key to it, replacing the fixed check;
  - adds `assigned_staff_id`, `opened_by_staff_id`, `priority`, `desired_resolution` and
    `escalated_at`;
  - adds `dispute_messages.author_staff_id`.
- **Server** (`backend/app/services/dispute_admin.py`):
  - `/api/v1/admin/disputes` (list, stats, case, open for a customer, messages, start, assign,
    escalate, resolve);
  - `/api/v1/admin/dispute-categories`;
  - `/api/v1/disputes/categories` for the app.
- **Console:** Dispute Resolution in the menu (`disputes.read`), Dispute Details, Raise Dispute
  (3 steps), Settings (Role Setup, Dispute category Setup).
- **App:** "Report a problem" lists the server's categories (falls back to the built-in four);
  notification wording for staff reply and closed case.

## Not yet

- File attachments (needs file storage, R2). The Figma upload box is not shown.
- "Waiting for user" status and email to staff on new cases.
- Reversals ("Process Refund") — the next screens.

## Evidence

- `backend/tests/integration/test_admin_disputes.py`:
  - categories start with four, staff add one, the app sees and uses it, a switched-off one is
    refused, and only `disputes.approve` manages them;
  - staff see both sides, assign, reply, escalate, and the timeline is recorded;
  - each party still sees only their own messages;
  - only `disputes.approve` closes, the hold ends with `HoldClosed`, and the escrow phase is
    unchanged;
  - staff open a case for a customer with the same rules as the app;
  - validation and access checks.
- `admin/__tests__/disputes.test.tsx`.
- Migration round trip in `test_migrations.py`.
