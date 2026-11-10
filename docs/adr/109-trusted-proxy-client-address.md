# ADR-109 — The Customer's Address Behind a Trusted Proxy

| Attribute | Value |
|---|---|
| **Status** | **IMPLEMENTED (server)** — 2026-11-10. Off until `TRUSTED_PROXIES` is set at hosting time. |
| **Decision ID** | DEC-121 |
| **Authority** | Owner, 2026-11-10: "Rate limiter: make it see the real user's address behind a proxy, and keep its counts in the database." |
| **Amends** | ADR-025 §4 ("proxy headers are not trusted"), and the known limit in ADR-060 (console forwarding). |
| **Builds on** | ADR-080 (rate-limit counts kept in PostgreSQL). |

## Problem

Hosted, the API sits behind a load balancer or proxy, so every request comes from the proxy's address. Two things would then go wrong:

- every customer would share one per-address rate limit, so one person could lock everyone out, or a spread-out attack would look like one sender;
- audit rows would all show the proxy's address.

## Decision

1. **Counts in the database:** already done since ADR-080. Every attempt is a row in `rate_limit_hits`, keys are SHA-256 hashes, and an advisory lock serialises each key. All servers and restarts share the counts. Nothing changes here. The in-memory limiter is used only with no database.
2. **`TRUSTED_PROXIES`:** a new setting listing the proxies' addresses or networks, comma-separated, empty by default.
   - Only when the **direct** connection comes from one of them is `X-Forwarded-For` believed.
   - The header is read **from the right**: each hop added by a trusted proxy is skipped, and the first address that isn't a trusted proxy is the customer.
   - Whatever a customer writes at the left of the header is never reached.
3. **Fails safe:** in each of these cases the direct address is used, as before:
   - the peer isn't a trusted proxy;
   - there is no header;
   - an entry isn't an IP address;
   - the chain is longer than 10 hops;
   - the chain is only trusted proxies.
4. **Refused at start-up:** a typo, and "every address" (`0.0.0.0/0`, `::/0`), which would let anyone choose the address the limits count.
5. **One function** (`app/core/client_address.py`) serves the per-address limits, audit addresses, and the Didit and bank webhook limits.
6. **Server launcher:** uvicorn's own `proxy_headers` stays off. The app decides, with the rule above.

## When hosting is chosen (owner action)

- Set `TRUSTED_PROXIES` to the load balancer's addresses or private network. Your hosting provider documents these.
- The admin console forwards staff requests (ADR-060). Add the console server's address too, so staff sign-in limits and audit rows see each staff member's address.
- **Not verified:** whether the console's forwarding (`next.config.ts` rewrites) adds `X-Forwarded-For`. Check it once, on the hosted console. `UNKNOWN — NOT VERIFIED`.

## Evidence

- `backend/tests/unit/test_client_address.py` (16 tests) checks:
  - the header is ignored with no trusted proxy and from an untrusted sender;
  - the forwarded address counts behind a trusted proxy;
  - a forged left part is never used;
  - several hops, from two headers, are skipped;
  - IPv6 works, and an IPv4 address on an IPv6 socket counts as IPv4;
  - malformed, empty, all-trusted or over-long chains fall back;
  - the setting refuses typos and "every address";
  - the dependency used by rate limits gives the right address.
