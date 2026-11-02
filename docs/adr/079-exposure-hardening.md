# ADR-079 — No Private Data Without a Login, Less Framework Fingerprinting, No Throwaway Emails

| Attribute | Value |
|---|---|
| **Status** | **IMPLEMENTED** — 2026-11-02 |
| **Decision ID** | DEC-086 |
| **Authority** | Product owner, 2026-11-02: *"nobody must be able to access any private information without login in"*, *"hacker must not be able to know the framework used in build xspeeria"*, *"block disposable emails domains"*, *"add account lockout to my login endpoints and use it together with ip rate limiting"*. |

## Decisions

1. **Only a named list of routes works without a login.**
   - Every other API route depends on `current_principal` (customer) or `current_staff`.
   - `backend/tests/unit/test_route_access.py` walks the production app and fails if any other route answers without one. The 18 public routes are listed there with the reason each holds no private data:
     - `/health`;
     - the sign-in, sign-up and PIN-reset steps, which need a code, PIN or token;
     - staff sign-in;
     - the two signed webhooks.
   - The admin console keeps no data on its server. Every screen reads the API with the staff member's token.
2. **Less fingerprinting.** These measures make the stack harder to identify; they do not hide it completely (see Consequences).
   - **Web server name:** start the API with `uv run python -m app.serve` (`backend/app/serve.py`). It turns off uvicorn's `server: uvicorn` header and leaves proxy headers untrusted (ADR-025 §4). Use `--host`/`--port` to choose the address. The run guides use it.
   - **Validation errors** no longer pass on the validator library's error types and English messages (`string_too_short`, "Field required"). Each field error is now `{"field", "in", "problem"}`, where `problem` is `missing`, `not_allowed` or `invalid`. The submitted value is still never echoed (SEC-009).
   - **Already in place:** docs, ReDoc and the OpenAPI schema are off in production; 404, 405 and 500 answers use Xspeeria's own error shape; `/health` says only `ok` (ADR-077); the console sends no `x-powered-by`.
3. **Throwaway email domains are refused at sign-up** (`VAL_422_DISPOSABLE_EMAIL`, with the message translated in the app).
   - The list is the public, CC0 [`disposable-email-domains`](https://github.com/disposable-email-domains/disposable-email-domains) list: 10,123 domains, copied at commit `fe48a30` into `backend/app/data/disposable_email_domains.txt`.
   - It is read from disk once and never fetched at run time. Subdomains of a listed domain count.
   - It contains no mainstream provider; a test checks Gmail, Yahoo, Outlook, Hotmail and iCloud.
   - Customers can't change their email after sign-up today, so sign-up is the only entry point. Staff emails are created by a Super Admin.
4. **Account lockout plus per-address limits:** already in place, so nothing changed here. Recorded so the owner can see it:
   - **Customer log-in:** 5 wrong PINs lock the account for 15 minutes (ADR-008/013). The lock is stored on the account, so it holds across servers and restarts.
   - **Unknown accounts** lock the same way, so a lock doesn't reveal whether an account exists.
   - **Codes:** 5 wrong codes lock the second check for 15 minutes.
   - **Staff:** 5 wrong passwords lock the staff account for 15 minutes.
   - **Per address:** every sign-in route also allows only 10 requests a minute from one network address (ADR-025 §1.2).
   - Tests: `test_five_wrong_pins_lock_for_fifteen_minutes`, `test_unknown_accounts_lock_the_same_way`, `test_ten_requests_per_minute_per_address`, `test_wrong_passwords_lock_and_unknown_emails_look_the_same`.

## Consequences

- **The stack can't be fully hidden, and hiding it is not a security control** (CLAUDE.md: frontend restrictions are not security controls).
  - The phone app is a React Native bundle that anyone can unpack from the store.
  - The console's pages load from `/_next/…` paths.
  - Response timing and TLS details also give hints.

  These measures remove the easy, free signals. The real protection remains authentication, server-side authorization and RLS (ADR-078). The console should be reachable only from staff networks (deployment decision, `UNKNOWN — NOT VERIFIED`).
- **Hosting:** if the hosting adds its own `server` or `via` header (a load balancer or CDN), turn it off there. That is `UNKNOWN — NOT VERIFIED` until hosting is chosen.
- **The per-address limit lives in memory (readiness H-1).** It is correct for one server, but resets on restart and isn't shared between servers. The account locks are unaffected, because they are in the database.
- **Refreshing the email list** is a reviewed change: replace the file from a newer commit and update the commit line, which a test checks.
