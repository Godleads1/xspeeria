# ADR-085 — One Background Worker, and the First Load Test

| Attribute | Value |
|---|---|
| **Status** | **IMPLEMENTED** — 2026-11-03 |
| **Decision ID** | DEC-093 |
| **Authority** | Owner, 2026-11-03, on the scalability review: *"do item 3 and 4"* — item 3, run a load test; item 4, move the background jobs to one dedicated worker. CLAUDE.md approved architecture: *"Background workers/jobs where required"*. |

## Decisions

### 1. Background jobs can run in one worker process

- **The jobs:**
  - deal expiry, waiting queues and the fraud scan;
  - phone push;
  - security emails;
  - activity-log retention and rate-limit clean-up.
- **One server (and a developer's computer):** nothing changes. `RUN_BACKGROUND_JOBS=true` (the default) runs the jobs inside the web server, as before.
- **Several web servers:**
  - set `RUN_BACKGROUND_JOBS=false` on every web server;
  - run **one** worker: `python -m app.worker`, with the same settings.
  - The worker stops cleanly on SIGTERM or SIGINT.
- **Every process still does two things itself:**
  - adds its own figures to System Health (ADR-072);
  - checks the operations alert rules (ADR-074). Those rules keep one live alert per subject, so running them on every server is safe, and **a stopped worker is still noticed** ("job late" alerts raised by the web servers).
- **The pretend bank stays in the web server** (`PRETEND_BANK`, local only). It lives in one process's memory, so its escrow work and the demo robots stay in the web server that holds it. The worker refuses to start with `PRETEND_BANK=true`.
  - When the real partner bank is connected, its escrow loop joins the worker's jobs.
- **Running two workers by mistake is safe, only wasteful:**
  - every job locks what it works on (`FOR UPDATE SKIP LOCKED` or a lock with a re-check);
  - the alert and fraud rules keep one live alert per subject.
- **New settings:** `DB_POOL_SIZE` and `DB_MAX_OVERFLOW` set the database connections per process. Unset, SQLAlchemy's defaults apply (5 and 10).
  - Choose them with the hosting, so that (web processes + worker) × (size + overflow) stays under the database's connection limit.

### 2. A repeatable load test

`backend/tests/load/load_test.py` (run on a developer's computer or a test server, **never production**).

- **Customers are signed up through the real routes,** with identity checks recorded for Nigeria and the US.
- **The real server is started** with 1 or 2 processes.
- **Each simulated customer repeats real steps,** about one step a second:
  - browse the market 45%;
  - profile 20%;
  - notifications 15%;
  - my offers 10%;
  - take an offer 7% (fingerprint approval, read the offer, take it);
  - post an offer 3%.
- **Each customer comes from their own network address,** like real phones. `--same-address` puts them all behind one address.
- **It reports:**
  - requests per second;
  - response times (median, 95th and 99th percentile), per step;
  - refusals by reason;
  - errors;
  - how busy the machine's CPU was.

## Results (3 Nov 2026)

**Test machine:** the development sandbox, **2 CPU cores and 7 GB**. The database, the server and the load generator all share those 2 cores, so these are **floor figures, not production capacity**.

| Customers at once | Server processes | Requests/s | Median | 95% under | Errors | Machine CPU |
|---:|---:|---:|---:|---:|---:|---:|
| 25 | 1 | 23 | 29 ms | 146 ms | 0 | 31% |
| 50 | 1 | 40 | 121 ms | 596 ms | 0 | 59% |
| 100 | 1 | 59 | 500 ms | 1.8 s | 0 | 66% |
| 250 | 1 | 56 | 2.4 s | 8.7 s | 23 timeouts | 66% |
| 25 | 2 | 23 | 26 ms | 126 ms | 0 | 33% |
| 50 | 2 | 46 | 36 ms | 186 ms | 0 | 58% |
| 100 | 2 | 61 | 501 ms | 1.4 s | 0 | 96% |
| 250 | 2 | 84 | 1.4 s | 5.0 s | 1 timeout | 96% |

What the results show:

- **Fast up to about 50 customers at once on this small machine** with 2 processes: half of requests answered within 36 ms, 95% within 186 ms. Taking an offer (three calls) took 163 ms in the median.
- **Each request costs about 18 ms of server CPU** (measured: 26 CPU-seconds for about 1,400 requests). So **one CPU core serves about 55 requests per second**.
- **The database was not the limit.** Its connections were mostly waiting for the Python server, and PostgreSQL used little CPU.
- **A second process helps** (50 customers: 95% under 186 ms instead of 596 ms), until the machine's two cores are full (96%). On a real server with more cores, each extra process should add about 55 requests per second. That last point is `UNKNOWN — NOT VERIFIED` until a test on the real hosting.
- **No wrong answers under load.**
  - 677 deals were taken while everything ran at once.
  - Afterwards no offer was oversold, and every offer's taken amount equalled the sum of its deals.
  - The only errors were timeouts (10 s) once the machine was overloaded.
- **A larger connection pool** (20 + 20) did not help here. The limit was CPU, not connections.
- **Profile:** no single hot spot. The time spreads over the event loop and encrypted database traffic (about a third), SQLAlchemy (about a quarter), FastAPI and its middleware, and the app's own code.
  - Possible later gains: replace the request-logging middleware with a lighter one, and lighter queries on the busiest routes (the market list, the per-request session check and the rate-limit counters).

## Found by the load test

1. **Bug, fixed:** with real identity checks, **every attempt to take an offer was refused** ("This offer can't be taken right now").
   - **The cause:** the deal-limit check read the offer owner's identity check while the request was limited to the taker's own private rows (ADR-078).
   - **Why tests missed it:** the integration tests use the local identity bypass.
   - **The fix:** the owner's tier and usage are now read as a listed service step ("deal limits: the other party's tier and usage"). The taker still learns nothing about why.
   - **The regression test** `test_taking_an_offer_reads_the_owners_tier_under_the_row_rules` runs under the row rules both locally and in CI (where the database user is a superuser, it switches to a plain role). It fails without the fix.
2. **Finding, not changed: the `xspeeria_app` role's grants are incomplete.**
   - For example, `idempotency_records` and `matches` have no UPDATE grant, so `SELECT … FOR UPDATE` fails.
   - The app works when it logs in as the tables' owner (not a superuser; the forced row rules still apply), which is how it runs today.
   - **Decided (owner, 3 Nov 2026): complete the grants** — done in ADR-094 (migration 0042); the server logs in as `xspeeria_app`.
3. **Finding: many phones behind one address.** In Nigeria, mobile networks often put many phones behind one shared address (carrier NAT).
   - The sign-in routes' limit of 10 requests a minute **per address** also covers `/users/me` and fingerprint approvals.
   - In the first run, with every customer behind one address, it refused many of those steps.
   - **To decide with hosting:** the trusted-proxy setting, and a per-address limit sized for shared mobile addresses (or the per-address limit kept only for log-in attempts, with per-customer limits doing the rest).

## How to run it

```
DATABASE_URL=postgresql+asyncpg://… uv run python -m tests.load.load_test \
    --users 25,50,100,250 --seconds 45 --server-workers 1,2 --json results.json
```

The database is emptied first: use a throwaway database only.

## Evidence

- `backend/tests/unit/test_background_worker.py` (5 tests):
  - one server runs everything;
  - with a worker, the web servers only report and watch;
  - the pretend bank stays in the web server;
  - no database, no loops and no worker;
  - the worker starts its loops and stops cleanly.
- `backend/tests/integration/test_row_level_security.py`: the regression test above.
- The load test runs of 3 Nov 2026 (table above). Raw results were kept outside the repository.
