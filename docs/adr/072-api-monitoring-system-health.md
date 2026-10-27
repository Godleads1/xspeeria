# ADR-072 — API Monitoring and System Health

| Attribute | Value |
|---|---|
| **Status** | **IMPLEMENTED** — 2026-10-27 (server, migration 0033, console) |
| **Decision ID** | DEC-079 |
| **Authority** | Product owner, 2026-10-27: *"build an api monitoring features to help track api health, process etc"*, then *"Api monitoring, all api used should be monitored"*, and *"Super Admin see it"*. Supports SEC-037 (alerting) and SEC-014 (API inventory) in the Enterprise Security Standard. |
| **Constraints** | Counts and timings only: no customer, request body, query string, header or identifier is stored (F-16 logging rule, ADR-025 §1.8). Super Admin only. |

## Decisions

1. **Every API is counted and timed, per minute** (table `api_metrics`), in three kinds:
   - **own:** every route of Xspeeria's API (app and console), by **route template**. For example `/api/v1/matches/{match_id}`, never the real ID.
   - **webhook:** messages other systems send us (Didit, the partner bank).
   - **outside:** every call Xspeeria makes to another system:
     - Didit identity checks, face checks and BVN/address checks (through `TrackedTransport` on their HTTP clients);
     - Expo phone push;
     - the developer SMS and email senders;
     - the pretend bank (open escrow, pay out, return funds).

     Path segments that look like IDs become `{id}`. A future real SMS, email or bank provider gets the same wrapper on its HTTP client.
2. **Figures kept:**
   - calls;
   - refused (4xx), failed (5xx) and no-answer calls (timeouts and connection errors);
   - total and longest time;
   - slow calls (1 second or more).

   Each server keeps its figures in memory and **adds** them to the database once a minute (`METRICS_FLUSH_SECONDS`, default 60), so several servers add up. Rows older than **30 days** are deleted. They're operational figures; the 5-year retention the owner chose applies to the activity logs.
3. **Background jobs** (table `job_status`):
   - covered: escrow processing, deal expiry, waiting queues, fraud scan, phone push, and the demo robots when switched on;
   - recorded for each: last start, last success, last failure, how long it took, and runs and failures;
   - on failure, only the **error's type** is stored (for example `TimeoutError`), never its message, which could quote data.
4. **System Health page** (console › Admin › System Health; `GET /api/v1/admin/system-health?window=1h|24h|7d`), with permission `monitoring.read`, given to **Super Admin only**:
   - an overall status and warnings in plain words;
   - totals and a chart of calls and failures;
   - every API, every outside service and every job;
   - the database's response time, and the escrow work queues (messages waiting or failed, bank events waiting, records that don't match).

   The page refreshes every 30 seconds.
5. **Warnings:**

   | Level | When |
   |---|---|
   | Red | An outside service failed; more than 1% of calls to one of our APIs failed (with at least 20 calls); a job's last run failed; escrow messages to the bank failed |
   | Amber | Any other failed calls; an average over 1 second (with at least 20 calls); a job late (no success for 3× its interval, at least 2 minutes); records that don't match; the database slower than 200 ms |

## Not built

- Alerts that reach a person when nobody has the page open (email/SMS/pager; SEC-037 needs a provider and an on-call person).
- An outside monitoring service watching from outside the servers (uptime check).
- Per-customer activity and per-transaction timelines: next build (owner, 2026-10-27; keep 5 years; Super Admin).

## Evidence

- `backend/tests/integration/test_system_health.py`:
  - own API calls counted with no identifiers stored;
  - outside calls counted, including 5xx and no-answer;
  - jobs ok, failing and late, with the error type only;
  - Super Admin only (Ops, Support and Compliance refused, signed-out refused, console header required);
  - two servers add up and old rows are deleted;
  - paths lose their IDs.
- `admin/__tests__/system-health.test.tsx`: status, warnings in words, every kind of API, search, period switch, 30-second refresh, menu permission.
- Browser check (2026-10-27), with a real deal against the demo robots: light, dark and Arabic. Ops doesn't see the page.
