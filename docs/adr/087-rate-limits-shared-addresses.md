# ADR-087 — Rate Limits for Phones That Share One Network Address

| Attribute | Value |
|---|---|
| **Status** | **IMPLEMENTED** — 2026-11-03 |
| **Decision ID** | DEC-095 |
| **Authority** | Owner, 2026-11-03, choosing **"Split limits (Recommended)"**: *"Keep a strict per-address limit only on log-in, sign-up and PIN-reset attempts (raised to e.g. 60/min); signed-in customers are limited per account instead. The 5-wrong-PIN lockout stays."* Then: *"fix the ratelimit now"*. Finding 3 of ADR-085. |
| **Amends** | ADR-025 §1.2 ("10 requests a minute per network address, shared by every auth endpoint"). |

## The problem

In Nigeria many phones reach the internet through one shared mobile-network address (carrier NAT).

- **Before:** every sign-in *and* signed-in account route (profile, sessions, fingerprint approvals, PIN and phone changes) shared **10 requests a minute per address**.
- **The effect:** customers behind a busy shared address would see "Too many attempts" while using the app normally.

## Decisions

1. **Before sign-in** — sign-up, phone code, log-in, the second checks, PIN reset, token refresh and fingerprint unlock:
   - still limited **per network address**;
   - raised from 10 to **60 requests a minute**.
   - The other protections stay: 5 wrong PINs lock the account for 15 minutes, unknown numbers are counted separately, and SMS and email codes have their own hourly and daily limits.
2. **Signed-in account routes** — profile, sessions, trusted phones, step-up approvals, PIN and phone changes, fingerprint on/off, log-out:
   - limited **per customer**, 60 requests a minute each (`account:<id>`);
   - not per address.
   - Market, deal, dispute and limit routes already had their own per-customer limit.
3. **Which list a route belongs to is checked by a test.** A route that needs sign-in can't sit in the per-address list, and every account route has the per-customer limit.

## Consequences

- **The cost:** one address can now make 60 sign-in attempts a minute instead of 10. Guessing PINs is still stopped by the 5-try lockout on each account and by the per-address count for unknown numbers.
- **Still to do with hosting** (ADR-085): the trusted-proxy setting, so the server sees each phone's real address behind the load balancer and not the load balancer's own.

## Evidence

- **`backend/tests/integration/test_auth_api.py`:**
  - 40 profile requests from one address, then a log-in, all succeed;
  - each customer's account routes stop at 60 a minute without affecting another customer;
  - the sign-in limit per address still refuses extra attempts.
- **`backend/tests/unit/test_route_access.py`:** every route is in the right list.
- **Load test** (`--same-address --real-limits`, 3 Nov 2026, 2-core test machine): 50 customers all behind **one** address, with the real limits, for 40 seconds.
  - 1,837 requests, 0 refused, 0 errors; 95% answered within 220 ms.
  - Takes of offers included fingerprint approvals.
