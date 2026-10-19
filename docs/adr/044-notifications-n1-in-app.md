# ADR-044 — Notifications N-1: In-App Notification Centre (Server)

| Attribute | Value |
|---|---|
| **Status** | **APPROVED** — 2026-10-19 (scope and order); details below **PROPOSED** |
| **Decision ID** | DEC-051 |
| **Authority** | Product owner, 2026-10-19: "the multiple language and notifications"; chose **In-app messages, Phone push, Email, SMS** and **"Notifications first (Recommended)"**. Requirements: API contract §3.7 (`GET/PATCH /v1/notifications`), data dictionary *Notification* and *Devices*, event catalogue (Notification worker consumers), Product Design Specification §4.3 Notification Badge and §5.3 Notifications screen. |

## Plan

| Step | What | Needs |
|---|---|---|
| **N-1 (this ADR)** | Server: notification centre — messages recorded with the facts they report; list and mark read | nothing outside |
| N-2 | App: bell badge, notification centre screen (Figma), in-app banner (Figma "Incorrect Password" style) | — |
| N-3 | Phone push (data dictionary *Devices*: push tokens) via Expo's push service, which delivers through Firebase Cloud Messaging (Android) and Apple Push Notification service (iOS) — **proposed**, not yet confirmed | Expo account; Firebase project (FCM key uploaded to Expo); Apple Developer account for iOS |
| N-4 | Email (**Resend** — product owner, 2026-10-19) and SMS (later; provider not chosen) | Resend account, a verified sending domain, API key in `.env` |

Channel policy (which events go to push/SMS/email) is "not frozen" in the design spec and is decided at N-3/N-4.

## What N-1 records

| Event | Type | Who | When |
|---|---|---|---|
| `kyc.approved` / `kyc.rejected` / `kyc.in_review` / `kyc.expired` | `kyc_status` | the user | identity check status changes (ADR-039/041/042) |
| `match.created` | `match_found` | the offer's owner | someone takes their offer |
| `settlement.awaiting_funding` (with `deadline`) | `settlement_update` | both parties | escrow is open — 5-minute window starts |
| `settlement.releasing` / `settlement.completed` | `settlement_update` | both | both paid in / paid out |
| `settlement.cancelled` / `settlement.unwinding` / `settlement.refunded` | `settlement_update` | both | deal ended without payment / refund under way / refunded |

`dispute_update` and `system` exist in the type list (data dictionary) but nothing produces them yet.

## Rules

- **Same transaction as the fact.** A message is inserted where the status/phase changes, so it exists exactly when the change commits and never for a change that rolled back.
- **Once per fact.** `(user_id, dedupe_key)` is unique; a repeat is ignored (`ON CONFLICT DO NOTHING`), never an error — a deal must never fail because of a message.
- **No personal data in messages.** The payload is `{event, data}` where `data` holds ids, a country code or a deadline only — no names, amounts or account numbers. The app writes the words **in the user's language** (ready for the languages work) and opens the linked screen, which checks access as usual.
- **Only `read_at` changes**; messages are not deleted (guard trigger XS004). Runtime role: SELECT, INSERT, UPDATE.
- Newest first by insert order (`seq`), several messages can share one timestamp.

## API

- `GET /api/v1/notifications?filter[read]=true|false&before=<notification_id>&limit=1..50` → `{items, unread_count, next_before}`.
- `PATCH /api/v1/notifications/{id}` `{"read": true|false}` (strict boolean).
- **Deviation from contract §3.7:** someone else's notification answers **404** (not 403 `AUTH_403_NOT_OWNER`), the same as a missing one, so ids cannot be probed.

## Open

- Retention period for notifications (with SEC-028 retention decisions).
- Swipe-to-dismiss (design spec §5.3) — no server "dismissed" state yet; N-2 decides with the Figma.

## N-2 (app) — built 2026-10-19

- **Bell** on Home and Market opens the notification centre and shows the unread count (numeric pill, "9+" cap, hidden at zero; design spec §4.3). The count is asked from the server on sign-in, every 30 seconds and when the app returns to the foreground.
- **Notification centre** (`/notifications`, design spec §5.3): Today / This week / Earlier, newest first; unread rows bold with a dot and read "Unread: …" to screen readers; tapping marks read (shown unread again if saving fails) and opens the linked screen; "You’re all caught up" when empty; inline retry on error; more rows load at the end. Swipe-to-dismiss is **not** built (no server state for it yet).
- **In-app banner** in the Figma "Incorrect Password" style (coloured icon, bold title, one line, close button; goes after 5 seconds). Shown when a new unread message arrives while the app is open — not for messages already waiting at sign-in (the bell covers those). `showBanner` is available to replace other alerts later.
- **Words live in the app** (`notificationCopy.ts`), English for now, ready for translation; unknown events show "Update". Links are built only from validated ids (`/profile/kyc`, `/market/deals`, `/market/escrow?match=<uuid>`).
- Evidence: `mobile/__tests__/notifications.test.tsx` (14 tests); `navigation.test.tsx` bell test updated (the bell was disabled before). Not yet run against a live server in a browser.
