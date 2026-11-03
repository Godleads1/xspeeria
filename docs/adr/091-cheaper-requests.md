# ADR-091 — Fewer Database Steps per Request

| Attribute | Value |
|---|---|
| **Status** | **IMPLEMENTED** — 2026-11-03 |
| **Decision ID** | DEC-102 |
| **Authority** | Owner, 2026-11-03: *"go"* on the build list, item 4: make each request cheaper so the same server serves more customers (hosting money is limited; ADR-085 measured about 18 ms of server CPU per request). |

## Decisions

### 1. The session's idle clock moves at most every 30 seconds

- **Before:** every signed-in request locked the session row (`SELECT … FOR UPDATE`), wrote `last_active_at`, and committed.
- **Now:**
  - the session row is read without a lock;
  - `last_active_at` is written only when it is 30 s or more old (`SESSION_TOUCH_EVERY`);
  - otherwise nothing is written.
- **Unchanged:**
  - every request still checks the live session row: revoked, expired or idle sessions are refused at once;
  - log-out and device removal still take effect on the next request;
  - the 5-minute idle and 7-day absolute limits (SEC-004).
- **The only effect:** a session can be judged idle up to 30 s *sooner* than before, never later. That is the safe direction.
- A request racing a log-out writes only `last_active_at`; it cannot undo `revoked_at`.

### 2. A rate-limit check is one statement

- **Before:** after the per-key advisory lock, three statements ran: delete this key's old attempts, count, then insert.
- **Now:** after the same lock, one `INSERT … SELECT … WHERE (count in window) < limit RETURNING id`.
  - No returned row means the attempt is refused (as before, a refused attempt is not recorded).
  - Old attempts are no longer deleted on every check. The hourly job (`prune_rate_limit_hits`, ADR-080) removes them, and the window filter ignores them meanwhile.
- **Unchanged:** the limits, the windows, keys stored only as SHA-256, the advisory lock (two servers can't both let the last attempt through), and each check in its own transaction.

### 3. Tried and not kept: a lighter request-logging middleware

ADR-085 named the request-logging middleware as a possible gain. A plain ASGI version was written and measured. It made no difference above the noise (10.4–11.1 ms with it, 10.6–11.2 ms without), so it was dropped to keep the change small.

## Results (3 Nov 2026, development sandbox, 2 cores)

Measured with the new `backend/tests/load/cost_per_request.py` (median server CPU over 150 calls of each request, in one process, real rate limiters):

| Request | CPU before | CPU after | SQL before | SQL after |
|---|---:|---:|---:|---:|
| My profile | 10.8 ms | 9.2 ms | 11 | 8 |
| Browse market | 13.2 ms | 11.4 ms | 11 | 8 |
| Notifications | 11.3 ms | 10.8 ms | 11 | 8 |
| My offers | 12.5 ms | 10.8 ms | 12 | 9 |
| One offer | 12.1 ms | 11.5 ms | 12 | 9 |
| Fingerprint approval | 16.1 ms | 13.4 ms | 15 | 12 |
| **Average** | **12.7 ms** | **10.4–11.2 ms** | | |

- **Three fewer database statements on every signed-in request**, one fewer write and one fewer row lock.
- **About 12–18% less server CPU per request** on this machine. Repeat runs vary by about ±0.5 ms.
- The goal of halving CPU per request was **not** reached. The rest is spread over FastAPI, SQLAlchemy and encrypted database traffic (ADR-085 profile), with no single hot spot left that a small change removes.
- Capacity on real hosting: `UNKNOWN — NOT VERIFIED`.

## Evidence

- `backend/tests/integration/test_rate_limits*.py`, `test_auth_api.py` and the full backend suite.
- `backend/tests/load/cost_per_request.py` (run: `DATABASE_URL=… uv run python -m tests.load.cost_per_request -n 150`; `--trace` prints the SQL). Throwaway database only.
