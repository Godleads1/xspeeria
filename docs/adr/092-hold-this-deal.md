# ADR-092 — Staff "Hold This Deal" From a Fraud Alert

| Attribute | Value |
|---|---|
| **Status** | **IMPLEMENTED** — 2026-11-03 |
| **Decision ID** | DEC-104 |
| **Authority** | Owner, 2026-11-03: *"Yes"* to option 5 in `docs/13-governance/FRAUD_OPTIONS_2026-11.md` — Compliance can hold one deal's payout from a fraud alert while they look. |

## Decisions

1. **Where:** on the fraud alert's page in the admin console, under a new **Deals** card.
   - It lists the alerted customer's deals that can still be held, newest first, at most 50. Deals this alert holds are always listed.
2. **Who:**
   - Holding and releasing need **`fraud_alerts.approve`** (today: Super Admin and Compliance Officer). It is checked on the server on every call.
   - Seeing the list needs `fraud_alerts.read`.
   - No role was changed.
3. **What can be held:** a deal of **this alert's customer**, on either side, **before its release is decided** (`INITIALIZING` or `AWAITING_FUNDING`, no release authorised; ADR-001 §6a).
   - A deal already paying out or closed can't be held here (409 `RES_409_DEAL_NOT_HOLDABLE`).
   - Another customer's deal answers 404.
4. **What a hold does:** a `RISK` settlement hold, tied to the alert (reason `fraud alert <alert id>`). It blocks only that deal's release.
   - Both sides can still pay in, but nothing is paid out.
   - **The funding window still runs:** a deal not fully paid in on time is cancelled, and the money goes back to whoever paid it, never to a payout account.
   - The same rule applies to a frozen account (ADR-084).
5. **Release:** staff press **Release** on the same card. Only this alert's hold closes; any other hold (a dispute, a frozen account) stays. Then the deal moves on at once if it can.
6. **Pressing Hold twice** opens one hold and writes one audit entry.
7. **Holding an "open" alert marks it "in progress".**
8. **An alert can't be resolved while it holds a deal** (409 `RES_409_DEALS_HELD`). Staff release it first, or ask for a refund in the deal's dispute; a reversal opens its own hold.
9. **Audit:**
   - `fraud_deal_held` and `fraud_deal_released` go in the staff audit log, with the deal's settlement id;
   - `HoldOpened` and `HoldClosed` go in the deal's own events.

## Routes

- `GET /api/v1/admin/fraud-alerts/{id}/deals` — `fraud_alerts.read`
- `POST /api/v1/admin/fraud-alerts/{id}/hold-deal` `{settlement_id}` — `fraud_alerts.approve`
- `POST /api/v1/admin/fraud-alerts/{id}/release-deal` `{settlement_id}` — `fraud_alerts.approve`

The request bodies refuse unknown fields.

## Evidence

- `backend/tests/integration/test_fraud_deal_hold.py` (4 tests). They cover:
  - holding, paying in, nothing released;
  - resolve refused while held;
  - release, then the deal completes;
  - a repeat press;
  - the audit entries;
  - a completed deal can't be held;
  - unknown deal or alert → 404;
  - Support Agent → 403;
  - Compliance Officer allowed;
  - strict body;
  - a held unpaid deal is cancelled, not paid out.

  They also pass with the server logged in as `xspeeria_app` (`tests/as_app_role.py`, ADR-094).
- `admin/__tests__/fraud.test.tsx`: Hold then Release; no button without `fraud_alerts.approve`; the empty state.
- Translations added in the five console languages (`i18n.test.tsx`).
