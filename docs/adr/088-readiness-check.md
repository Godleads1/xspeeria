# ADR-088 — A Readiness Check for the Load Balancer

| Attribute | Value |
|---|---|
| **Status** | **IMPLEMENTED** — 2026-11-03 |
| **Decision ID** | DEC-099 |
| **Authority** | Owner, 2026-11-03: *"go"* on the list of work that needs no hosting ("a readiness check, so a load balancer only sends customers to servers that are working"). Package 3 of the plan for 500 users at once. |

## Decisions

1. **`GET /health/ready`** answers:
   - **200** `{"status": "ready"}` only when this server can run a query on its database within **2 seconds**;
   - **503** `{"status": "not_ready"}` otherwise, including when no database is set.
2. **It says nothing else:** not why, not which database or server. Failures are logged on the server ("not_ready" with the error type) for staff.
3. **The answer is kept for 1 second** in each server process. A load balancer, or anyone, calling it in a loop costs at most one `SELECT 1` a second per process. It needs no login, like `/health`, and is listed in the public routes test with that reason.
4. **`/health` doesn't change.** It's liveness: the process is running. It never touches the database, so a database outage doesn't make the platform restart healthy servers.
5. **How to use it:**
   - the load balancer's health check uses `/health/ready`;
   - the container platform's "is it alive" check uses `/health`.

## Evidence

`backend/tests/integration/test_readiness.py` (PostgreSQL 16):
- ready when the database answers;
- 503 when the database can't be reached, saying nothing about it;
- 503 without a database;
- 20 calls in a row make only 1 database query.

`tests/unit/test_route_access.py` lists the route as public with its reason.
