# ADR-025 — Decision 2 (remainder) and Milestone AUTH-1: Server Sign-In

| Attribute | Value |
|---|---|
| **Status** | **APPROVED** |
| **Date** | 2026-10-18 |
| **Decision ID** | DEC-031 |
| **Authority** | Product owner, 2026-10-18: **"Approve all"** to six recommendations (PIN storage, request limits, recovery, permission checks, accounts, sign-in provider) and to authorising the server sign-in stage; then, asked about three document conflicts, chose **"Contract names"**, **"Yes, add it"** (verify-phone) and **"Approve this rule"** (logging) — `DOCUMENT_INDEX.md` §1 rank 2 |
| **Resolves** | The rest of **Decision 2** (Standing Standards §15 row 1) with ADR-008 and ADR-024; **S-2**; **S-3** (for now); the **F-16** logging/redaction gate in `backend/app/core/exceptions.py` |
| **Authorizes** | **Milestone AUTH-1** (scope §3). Does **not** authorize Milestone 4.1C or any money-bearing table, and does not discharge GATE 4.1B-CD3. |
| **Supersedes** | In `docs/04-api-data/05_API_Contract_Data_Dictionary.md` §2–3.2: email + password log-in and its 12-character rule (→ phone or email + 6-digit PIN, ADR-013/024); SMS and email OTP as MFA factors (→ never, ADR-008); 30-day refresh (→ 7-day absolute session, ADR-024); "5 attempts per 15 minutes per IP" (→ §1.2). Backend spec §11 example paths `/auth/sign-up`, `/auth/sign-in` (→ contract names). |


> **Update 2026-10-18:** `verify-phone` and `login` now return a 2FA challenge instead of a
> session; a session exists only after the second factor or a trusted device —
> `docs/adr/026-auth-2-two-factor.md`.

## 1. Decisions

1. **PIN storage — Argon2id** (`argon2-cffi`), memory 19 MiB (19,456 KiB), 2 iterations,
   parallelism 1, 16-byte salt, 32-byte hash (OWASP Password Storage minimum). Hashes are
   re-computed on the next successful log-in if these parameters change. The PIN is checked
   only on the server.
2. **Request limits** — log-in: **10 requests per minute per network address**, and **5 wrong
   PINs → 15-minute lock** per account (ADR-008/013). SMS codes: **5 per hour, 10 per day per
   phone** (ADR-024), 60 seconds between codes, 5 tries per code, codes expire after 10
   minutes. Every auth endpoint shares the per-address limit.
3. **Recovery** — only recovery codes and Support's KYC-level re-verification (ADR-008). No
   self-service PIN reset without 2FA. Not built in AUTH-1 (needs AUTH-2's 2FA).
4. **Permission checks (S-2)** — enforced in server code on every request through FastAPI
   dependencies, deny by default; every query scoped to the signed-in user. PostgreSQL
   row-level security is added later as a second layer (not in AUTH-1).
5. **Accounts (S-3)** — **individual accounts only**. The user is the isolation boundary. No
   organization/tenant model; business accounts need a new decision.
6. **Sign-in provider** — **built in-house** on FastAPI/PostgreSQL. Clerk is not adopted
   (Standing Standards §14).
7. **API names** — the contract's: `/api/v1/auth/register`, `/login`, `/refresh`, `/logout`,
   `/api/v1/users/me`, `/api/v1/users/me/sessions[/{session_id}]`, plus one new endpoint
   **`POST /api/v1/auth/verify-phone`**.
8. **Logging rule (F-16)** — never log request bodies, headers, PINs, codes, tokens, or full
   phone numbers or email addresses. Log only the route, method, status, duration, a request
   ID, the user ID and at most the last 4 digits of a phone. Error responses carry no
   exception content. Any future observability tool must follow this rule.

## 2. Server rules (AUTH-1)

| Item | Rule |
|---|---|
| Access token | JWT, HS256, 15 minutes (contract §2.1), carrying user ID and session ID only. Each request also checks the session row, so log-out and revocation take effect immediately. |
| Refresh token | 256-bit random, stored only as a SHA-256 hash, single use. Reusing a spent one revokes the whole session (`AUTH_401_TOKEN_REUSE_DETECTED`). |
| Idle | A session with no authenticated request or refresh for **5 minutes** is refused; the app must log in again (PIN). While the user is active the app refreshes, which keeps the session alive. |
| Maximum | **7 days** from the PIN log-in; refresh never extends it. |
| Sign-up | `register` (phone, email, PIN) creates an unverified account and sends an SMS code; `verify-phone` confirms it and signs the user in. An unverified account cannot log in. Registering a phone that already has a verified account answers exactly as a new sign-up and sends nothing, so the endpoint does not reveal which numbers have accounts. |
| Log-in | Phone or email + PIN. Unknown account, unverified account and wrong PIN give the same `AUTH_401_INVALID_CREDENTIALS`, with the same hashing time. |
| 2FA | Not built in AUTH-1 (no factor can be enrolled yet), so `mfa_required` is always `false`. AUTH-2 adds TOTP, trusted devices and step-up; until then **no money-bearing or sensitive endpoint may be built**. |
| SMS | Sent through a provider interface. **No provider is connected**: without one, `register` answers `SYS_503_SERVICE_UNAVAILABLE` and no SMS is sent. Choosing and contracting a provider needs a human decision. |
| Error codes | Contract identifiers only. A weak PIN uses `VAL_422_WEAK_PASSWORD`; a taken email uses `AUTH_400_EMAIL_TAKEN` from the contract's register row (it is missing from the §4.1 catalogue table — catalogue gap, recorded). Revoking the current session via the sessions endpoint answers `AUTH_403_FORBIDDEN`. |

## 3. Milestone AUTH-1 scope

Tables `users`, `auth_sessions`, `auth_refresh_tokens`, `phone_verifications` (migration
0003); the endpoints in §1.7; Argon2id hasher; JWT and refresh tokens; in-process rate limiter;
request-ID logging middleware; tests (unit and PostgreSQL integration). **Out of scope:** 2FA,
passkeys, PIN reset, email verification, KYC, RLS, Redis, a real SMS provider, any money table.

## 4. Known limits (to close before production)

- ~~The rate limiter is in-process.~~ Closed by ADR-080: counts are kept in PostgreSQL, shared
  by every server.
- ~~Client network address is taken from the direct connection.~~ Closed by ADR-109: behind a
  proxy listed in `TRUSTED_PROXIES`, its `X-Forwarded-For` is read from the right; otherwise
  the direct connection, as before.
- `AUTH_400_EMAIL_TAKEN` reveals that an email is registered (contract behaviour), limited by
  the request limits.
- The JWT signing key comes from configuration (`JWT_SECRET_KEY`, at least 32 characters); a
  secret manager and rotation procedure are still required (SEC-027).

## 5. Implementation (2026-10-18)

| Part | Where |
|---|---|
| Rules and constants | `backend/app/domain/auth_rules.py` |
| Argon2id hasher | `backend/app/core/pin_hashing.py` |
| Tokens and SMS-code digests | `backend/app/core/auth_tokens.py` (PyJWT, HS256 fixed) |
| Rate limiter (in-process) | `backend/app/core/rate_limit.py` |
| SMS interface (no provider) | `backend/app/providers/sms.py` |
| Tables + migration 0003 | `backend/app/models/identity.py`, `migrations/versions/0003_identity_tables_auth_1.py` |
| Data access | `backend/app/repositories/identity.py` |
| Service | `backend/app/services/auth.py` |
| Routes and dependencies | `backend/app/api/v1/auth.py`, `backend/app/api/auth_deps.py` |
| Request log (F-16) | `backend/app/core/request_logging.py`; validation errors no longer echo submitted values (`backend/app/core/exceptions.py`) |
| Tests | `backend/tests/unit/test_auth_primitives.py`, `backend/tests/integration/test_auth_api.py` (PostgreSQL 16) |

Library note: the backend spec names `python-jose`/`authlib` as examples for JWT; PyJWT is
used (maintained, small, HS256 only). The control — short-lived signed access tokens with
fixed algorithm, issuer and audience — is as specified.

Drift guards updated to the new exact table set; the Step 9 verification of
`currency_definitions` now upgrades to its pinned revision 0002 instead of "head", so its
claim is unchanged by later migrations.
