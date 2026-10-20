# ADR-057 — Disputes on Deals and Support Cases (App + Server)

| Attribute | Value |
|---|---|
| **Status** | **APPROVED** (owner) — 2026-10-20; **IMPLEMENTED** (app + server; staff side with the admin console) |
| **Decision ID** | DEC-064 |
| **Builds on** | API contract §3.8 and data dictionary "Dispute"; ADR-050 (Support runs through Disputes); ADR-051 row 6 (disputes start from the app and from staff); ADR-001 §7.1 |
| **Authority** | Product owner, 2026-10-20: support questions without a deal → **"Same inbox, no deal"**; when can a dispute be opened → **"Once escrow has started"**; attachments → **"Messages now, files later"**; order → **"App + server now, admin next"**. |

## Decision

1. **Dispute** (contract §3.8): on a deal whose escrow has started (a `Transaction` exists). Only the two parties (`AUTH_403_NOT_PARTY`); one unresolved dispute per deal (`RES_409_DISPUTE_ALREADY_OPEN`); reasons `funds_not_received`, `wrong_amount`, `counterparty_unresponsive`, `other`; description 1–2,000 characters.
2. Opening one adds a blocking **`DISPUTE` hold** (`settlement_holds`). While it is open the escrow is **frozen**: no release, and the 5-minute funding window does **not** time out the deal ("freezes the linked settlement from auto-advancing until resolved"). No phase, leg or amount changes; a completed settlement is never touched (a correction is a new compensating settlement, ADR-001 §7.1). Staff resolve it (admin console, `disputes.resolve`).
3. **Support case** (ADR-050, owner): same inbox, `kind = support`, no deal, pauses nothing, seen only by its opener.
4. **Privacy:** each party sees the case status, their own words and messages, and staff replies — never the other party's words or identity. The other party gets a "dispute.opened" notification.
5. **Messages** are append-only (app role: INSERT and SELECT only) and stop once resolved. The contract's file evidence (multipart, 10 MB) comes with file storage; until then `POST /v1/disputes/{id}/evidence` takes JSON `{"message"}`.

## Built

Migration `0019` (`disputes`, `dispute_messages`); `POST/GET /api/v1/disputes`, `GET /api/v1/disputes/{id}`, `POST /api/v1/disputes/{id}/evidence`; the escrow view now includes `transaction_id`; the funding-window timeout skips a settlement with an open `DISPUTE` hold. App: Market ⋮ → Disputes & support (list, "Get help"), case screen with replies, "Report a problem with this deal" on the escrow screen, Profile → Contact support opens the same list in server builds.

## Not yet

Staff reading, replying, `under_review` and resolution (admin console, next); file attachments (R2); email to staff on new cases.
