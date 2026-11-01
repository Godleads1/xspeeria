# ADR-074 — Operations Alerts, Error Tracking and the Incident Plan

| Attribute | Value |
|---|---|
| **Status** | **IMPLEMENTED** — 2026-11-01 (server, migration 0036, console); incident plan **DOCUMENTED**, not yet exercised |
| **Decision ID** | DEC-081 |
| **Authority** | Product owner, 2026-11-01: *"do this monitoring, alerts or incident plan"*, then chose: alerts go to **Super Admins** (console now, email once a provider exists); **Sentry wired in but off**; this round = **alerts + incident plan**. Closes the "alerts that reach a person" gap in ADR-072 as far as possible without an email provider. Meets SEC-037 and documents SEC-038. |
| **Constraints** | Counts and references only (F-16 logging rule, ADR-025 §1.8). Super Admin only (`monitoring.*`, ADR-072). An alert never blocks, moves or reverses anything by itself. Sentry receives the error only, scrubbed (Standing Standards, vendors: "strict scrubbing"). |

## Decisions

1. **Alert rules**: run once a minute in every API server (`OPS_ALERT_SECONDS`, default 60; 0 is off). They use data Xspeeria already records. The thresholds are starting values in `app/services/ops_alerts.py`; changing them is an owner decision.

   | Rule | Level | Raised when |
   |---|---|---|
   | `customer_sign_in_attack` | P2 | ≥ 30 wrong-PIN sign-ins across customers in 15 min |
   | `staff_sign_in_attack` | P2 | ≥ 10 failed staff sign-ins in 15 min |
   | `staff_access_changed` | P2 | a staff account is created, or its role or status changes; a role is created, changed or deleted (one alert per audit entry) |
   | `unusual_deal_volume` | P2 | ≥ 20 deals in the last hour and ≥ 3× the hourly average of the week before |
   | `money_at_risk` | P1 | a deal reaches RECOVERY_REQUIRED or CLOSED_WITH_LOSS |
   | `high_fraud_alert` | P2 | a high-severity fraud alert opens (ADR-068) |
   | `webhook_rejected` | P2 | ≥ 5 webhooks refused (4xx) in 15 min |
   | `webhook_failing` | P1 | a webhook answered 5xx in 15 min |
   | `api_failing` | P1 | more than 1% of calls to one of our APIs failed (ADR-072 red, ≥ 20 calls) |
   | `outside_failing` | P2 | an outside service failed (ADR-072 red) |
   | `job_failing` | P2 | a background job's last run failed |
   | `escrow_stalled` | P1 | escrow processing is late (3 intervals, at least 2 minutes) or escrow messages to the bank failed |

2. **One live alert per rule and subject.**
   - A condition that keeps firing updates its open alert (last seen, times seen).
   - Once resolved, the next firing opens a new alert.
   - An alert about one event (an audit entry, a deal, a fraud alert) is raised once, ever.
   - The database enforces this, so several servers raise each alert only once.
3. **Who hears:**
   - every active Super Admin, in the console: System Health › Alerts, and the staff bell;
   - new **P1/P2** alerts are also emailed to them, once, through the email sender. The email has the level, a fixed title and the reference only.
   - Until an email provider exists (C-5), only the developer sender prints them, locally.
4. **Working an alert:**
   - "I'm on it" acknowledges it;
   - "Resolve" needs a note (5–1000 characters), and is final.
   - Both are staff-audited (`ops_alert_acknowledged`, `ops_alert_resolved`) and need `monitoring.update`. Seeing alerts needs `monitoring.read`. Both are Super Admin only.
   - Alerts are never deleted (no DELETE grant).
5. **Sentry error tracking** (`sentry-sdk`): off unless `SENTRY_DSN` is set. `app/core/error_tracking.py` sends:
   - the error's type, message and stack, the environment and the release;
   - no request headers, cookies, body, query string or address;
   - no user, local variables, breadcrumb data or extra context;
   - no performance tracing.

   The pure `scrub` function is tested.
6. **Incident plan**: `docs/07-security/INCIDENT_RESPONSE_PLAN.md`. It covers levels, triage, containment, key rotation, evidence, communication, review, a quick card per alert, and the gaps before launch.

## Not built

- Delivery to a person by email or SMS: needs a provider (C-5). An on-call rota needs named people.
- The pause-all-deals switch (SEC-039), an end-every-session action, and re-keying tools for `BENEFICIARY_ENCRYPTION_KEY` and `KYC_IDENTITY_KEY`.
- An outside uptime check.
- A recorded exercise of the incident plan.

## Evidence

- `backend/tests/integration/test_ops_alerts.py`:
  - a role change alerts once and emails Super Admins once;
  - repeated staff failures update one alert;
  - refused webhooks, a failing job and stalled escrow raise system alerts, P1 emailed first;
  - mass customer sign-in failures raise an alert;
  - Super Admin only (Compliance refused; the bell shows it to Super Admins only);
  - acknowledge, then resolve with a note; resolved is final and audited;
  - an event alert isn't raised again; a condition still happening after resolution opens a new alert;
  - the database refuses an incomplete resolution.
- `backend/tests/unit/test_error_tracking.py`: off without a DSN; strict options with one; scrubbing removes the request, user, local variables and breadcrumbs.
- `admin/__tests__/ops-alerts.test.tsx`: plain words, most urgent first, acknowledge, resolve with a note, buttons only with `monitoring.update`, hidden without `monitoring.read`, refresh, the bell's new kind.
