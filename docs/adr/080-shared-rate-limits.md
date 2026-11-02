# ADR-080 — Shared Rate Limits in the Database

| Attribute | Value |
|---|---|
| **Status** | **IMPLEMENTED** — 2026-11-02 |
| **Decision ID** | DEC-087 |
| **Authority** | Product owner, 2026-11-02: *"go"* on building item 8, *"Rate limits live in memory. They reset on restart, which only matters once there are several servers."* Readiness review H-1; ADR-025 §4 recorded the in-memory limiter as a known limit. |

## Decisions

1. **Whenever a database is configured, every limit is counted in PostgreSQL** (`rate_limit_hits`, migration 0039). That covers:
   - sign-in steps per network address;
   - wrong PINs and staff passwords for unknown accounts;
   - market, deal, identity-check and notification requests per user;
   - webhook calls per address.

   All servers count the same attempts, and a restart forgets nothing. **No Redis is needed** for this. Redis remains an option later if the load ever calls for it.
2. **The limits and windows are unchanged** (ADR-025, ADR-031, ADR-058):
   - 10 sign-in requests a minute per address;
   - 5 wrong tries in 15 minutes;
   - 60 market requests a minute per user;
   - `TEST_LIMITS_DEV` still raises them only on a developer's computer.

   It is still a sliding window: each attempt counts for exactly its window.
3. **An attempt is counted in its own short transaction**, never the request's. A request that fails and rolls back still counts. Attempts on one key take a transaction-level advisory lock, so two servers can't both let the last attempt through.
4. **No personal data is kept.** Each key (`addr:<address>`, `id:<hash>`, `user:<id>`) is stored only as a SHA-256 hash, together with the limiter's name.
   - A key's old attempts are deleted on its next attempt.
   - Everything older than an hour is deleted by the hourly job, which shows on System Health as "Rate-limit cleanup".
5. **Without a database**, the in-memory limiter is used: a server that answers `/health` only, and unit tests. It is correct for one server only, as before.

## Consequences

- Each limited request costs one extra short database round trip.
- If the database is down, limited requests fail rather than going unlimited (fail closed). The rest of the request would fail anyway.
- The per-address limit still uses the address the server sees directly (ADR-025 §4). Behind a load balancer, that is the balancer's address until a trusted-proxy setting is added with hosting: **`UNKNOWN — NOT VERIFIED`** until hosting is chosen.

## Evidence

`backend/tests/integration/test_rate_limits.py`, against PostgreSQL 16:

- the limit, refusal and recovery; independent keys and limiter names;
- **two servers share the count**, and a restart forgets nothing;
- 40 simultaneous attempts across 4 servers let exactly 10 through;
- an attempt still counts when the request rolls back;
- no address or email is readable in the table; the hourly clean-up deletes only old attempts;
- `build_auth_runtime` uses the shared limiter with a database and the in-memory one without;
- the real sign-in route on two servers: 10 attempts in total, then 429 on both.

Existing limit tests (`test_ten_requests_per_minute_per_address`, `test_unknown_accounts_lock_the_same_way`, `test_market_requests_are_limited_per_user`) still pass.
