# Security Evidence Register

Current state of every requirement in `docs/07-security/XSPEERIA_ENTERPRISE_SECURITY_STANDARD.md`.

| | |
|---|---|
| **Assessed at** | `main` after PR #16, 2026-10-17; AUTH-1 and AUTH-2 rows updated 2026-10-18 |
| **Method** | Read-only inspection of code, configuration, CI and docs; test names cited where they exist. No penetration test, no deployed environment. |
| **States** | Standing Standards §5. **NOT STARTED** = no code and no specific design. **DOCUMENTED** = designed in an approved doc, no code. **IMPLEMENTED** = code exists (here, almost always the demo app on the device, which the server must repeat). Nothing is marked **VERIFIED**: no production evidence exists yet, and CI success is IMPLEMENTED-class at best. |
| **Owner** | Every row: **UNASSIGNED** until the product owner names owners (needed for Medium-and-above before release, standard §5). |

## Summary

| State | Count |
|---|---|
| VERIFIED | 0 |
| IMPLEMENTED (partial, demo-only or not deployed) | 20 |
| DOCUMENTED only | 8 |
| NOT STARTED | 11 |
| BLOCKED (needs an account change) | 1 |
| **Production gate** | **🔴 DO NOT LAUNCH**: server sign-in and 2FA exist (AUTH-1/2) but are not deployed or wired to the app, and there is no money path; most Critical server-side requirements remain open. |

## A. Identity and authentication

| ID | State | Evidence | Gap / next action |
|---|---|---|---|
| SEC-001 | IMPLEMENTED (server, AUTH-1) | Argon2id PIN hashing, 19 MiB / t=2 / p=1, rehash on change (`backend/app/core/pin_hashing.py`); PIN checked only on the server; equal-time path for unknown accounts (`test_auth_primitives.py`, `test_auth_api.py`). ADR-025. | Not deployed; 2FA (AUTH-2) still required before money endpoints. |
| SEC-002 | IMPLEMENTED (server, AUTH-2) | 2FA required at sign-up and on every new device (TOTP, encrypted secrets, single-use codes); single-use step-up bound to user, session and action, 5 minutes; 5 wrong codes → 15-min lock (`backend/tests/integration/test_two_factor_api.py`). ADR-008/026. | Passkeys (native build); staff MFA when admin auth exists; wire step-up into each sensitive endpoint as it is built. |
| SEC-003 | IMPLEMENTED (server, AUTH-1) | 5 wrong PINs → 15-min lock (also for unknown identifiers); 10 requests/min per address on all auth routes; SMS 5/hour, 10/day, 60 s resend, 5 tries per code, 10-min expiry, durable counts in PostgreSQL (`test_auth_api.py`). ADR-024/025. | Limiter is in-process: needs Redis before more than one instance; trusted-proxy rule for client address. |
| SEC-004 | IMPLEMENTED (server, AUTH-1) | 15-min HS256 access tokens checked against a live session row on every request; single-use rotating refresh tokens stored as SHA-256; reuse revokes the session; 5-min idle and 7-day absolute limits; log-out and device revocation take effect immediately (`test_auth_api.py`). | Mobile app not yet wired to the server; SecureStore for the refresh token; key in a secret manager. |
| SEC-005 | IMPLEMENTED (server, partial) | 10 single-use recovery codes, keyed hashes, regenerate behind step-up; recovery log-in ends trust everywhere and sets a 24-hour payout hold (`test_recovery_code_logs_in_once_and_triggers_the_hold`). | Support re-verification procedure (Compliance); email alerts need a provider. |

## B. Authorization and account isolation

| ID | State | Evidence | Gap / next action |
|---|---|---|---|
| SEC-006 | IMPLEMENTED (partial, AUTH-1) | Authenticated routes get the caller only from `current_principal` (token + live session), never from the request (`backend/app/api/auth_deps.py`). S-2 decided: server-side checks, deny by default (ADR-025). | Apply to every future router; RLS as second layer. |
| SEC-007 | IMPLEMENTED (partial, AUTH-1) | Sessions are owner-scoped; another user's session answers 404 like a missing one (`test_cannot_see_or_revoke_another_users_session`). | Cross-user tests for every future resource. |
| SEC-008 | DOCUMENTED | Roles and matrix required by Security Master Audit §38.3. | Write the authorization matrix before admin features. |
| SEC-009 | IMPLEMENTED (partial, AUTH-1) | Auth request schemas forbid unknown fields; validation errors no longer echo submitted values (`backend/app/core/exceptions.py`, `test_register_validation`, `test_validation_errors_do_not_echo_the_pin`). | Same for every future endpoint. |

## C. API and backend protection

| ID | State | Evidence | Gap / next action |
|---|---|---|---|
| SEC-010 | IMPLEMENTED (partial) | Money module rejects floats/NaN, HALF_EVEN (`backend/tests/unit/test_money.py`); SQLAlchemy ORM; mobile strict input parsing (`security-review.test.tsx`). | Request validation for every endpoint when built. |
| SEC-011 | NOT STARTED | — | Body-size limits, timeouts, rate limits (Redis where required). |
| SEC-012 | NOT STARTED | No cookie auth, no outbound requests, no redirects yet. | Decide token vs cookie; CSRF if cookies; SSRF allow-list for partner calls. |
| SEC-013 | IMPLEMENTED (partial) | Admin security headers (`admin/next.config.ts`, checked as served locally 2026-10-17); backend CORS empty by default (`backend/app/core/config.py`); docs/OpenAPI off in production. | CSP script-src with nonces; TLS config UNKNOWN (no deployment). |
| SEC-014 | NOT STARTED | `/health` returns the environment name (review SEC-14). | API inventory document; trim health output. |

## D. Mobile application security

| ID | State | Evidence | Gap / next action |
|---|---|---|---|
| SEC-015 | IMPLEMENTED (partial) | No secrets in the app (reviewer scan of 507 files); only the remembered phone/email in AsyncStorage. | `expo-secure-store` for tokens; device-bound biometric key (review SEC-02). |
| SEC-016 | IMPLEMENTED (partial) | No `console.*`; clipboard auto-clear; screenshots blocked on secret screens (`security-review.test.tsx` "SEC-04"); Android `allowBackup: false`. | TLS / certificate-pinning decision; crash-reporting redaction when added. |
| SEC-017 | IMPLEMENTED (partial) | Route params re-validated, digits-only (`security-review.test.tsx`); no WebViews; custom `xspeeria://` scheme only. | Route render tests for tampered params (review QA-12); App/Universal Links decision. |
| SEC-018 | IMPLEMENTED (partial) | Release builds refuse demo paths (`docs/adr/018-security-review-remediation.md`). | Build a release bundle in CI and scan it for demo credentials/keys; tamper/root posture decision. |
| SEC-019 | DOCUMENTED | CLAUDE.md, Standing Standards §7; the demo computes on the device by design. | Server owns all values; app displays only. |

## E. Financial transaction integrity

| ID | State | Evidence | Gap / next action |
|---|---|---|---|
| SEC-020 | DOCUMENTED (+ demo ceiling IMPLEMENTED, `docs/adr/020-official-rate-ceiling.md`) | Standing Standards §7.2 rate rules; `docs/adr/001-*` state machine. | Trades API slice. Rounding decided: half to even (`docs/adr/019-review-decisions-and-multi-offer-fill.md`). |
| SEC-021 | DOCUMENTED | `webhook_shared_secret` placeholder only; Banking Integration Spec. | Signature check, replay window, `provider_event_id` idempotency (`docs/adr/002-*` §4.5). |
| SEC-022 | IMPLEMENTED (demo) | Release builds never advance a trade on the user's "I have paid" (`tradeStore.ts`, test "SEC-01"). | Server: only partner evidence moves state. |
| SEC-023 | DOCUMENTED | `docs/adr/001-*`; demo phases guarded (`trade.test.tsx`). | PostgreSQL-authoritative state machine with row locks and idempotency keys (Standing Standards §6–7). |
| SEC-024 | DOCUMENTED | `docs/adr/002-*`; Appendix D. | Reconciliation jobs and mismatch alerts. |
| SEC-025 | IMPLEMENTED (partial, demo) | Step-up on beneficiary changes and on the whole order incl. payout accounts; own-name payout accounts only; new accounts held 24 hours (`docs/adr/022-payout-destination-welcome-location.md`); TOTP replay blocked. | 24-hour payout hold, new-device alerts, server quote locking. Server: `users.payout_hold_until` set for 24 h after recovery or authenticator reset (ADR-026); payout endpoints must enforce it. |

## F. Data, privacy and secrets

| ID | State | Evidence | Gap / next action |
|---|---|---|---|
| SEC-026 | NOT STARTED | — | Hosting/KMS decision; TLS everywhere; column-level protection for KYC data. |
| SEC-027 | IMPLEMENTED (partial) | Gitleaks over full history in CI with canary; sensitive-file guard; `.env.example` placeholders only. | Approved secret manager; rotation procedure. |
| SEC-028 | DOCUMENTED (+ location minimised to country code, ADR-022) | SSN never stored (`RegionScreens.tsx`); retention approach is illustrative (`docs/08-compliance/03_Compliance_Operations_Manual_v1.1.md` §5.3). | Ratified retention periods; access controls on KYC storage. |
| SEC-029 | IMPLEMENTED | Demo data synthetic (`example.com`, mock NIN record). | Replace demo phone with a confirmed reserved test number (review SEC-13). |
| SEC-030 | DOCUMENTED | Security Master Audit §38.5. | Backups + a recorded restore exercise. |

## G. Build, deployment and dependencies

| ID | State | Evidence | Gap / next action |
|---|---|---|---|
| SEC-031 | **BLOCKED** (upgrade deferred by product owner, ADR-019 §4) | PRs are used, but **branch protection is unavailable**: GitHub returns 403 "Upgrade to GitHub Pro or make this repository public" (checked 2026-10-17). The repo must stay private (licensed fonts). | Product owner: upgrade the plan (GitHub Pro / Team) so `main` can require a reviewed PR and passing checks; then add CODEOWNERS. |
| SEC-032 | IMPLEMENTED | CI: pytest (unit + PostgreSQL integration), ruff, mypy strict, bandit, ESLint, typecheck, jest/vitest, pip-audit, npm audit gate, gitleaks (`.github/workflows/ci.yml`). | No TypeScript SAST beyond ESLint (CodeQL needs GitHub Advanced Security on private repos). |
| SEC-033 | NOT STARTED | Lockfiles exist (`uv.lock`, `package-lock.json`). | Generate SBOM (e.g. CycloneDX) in CI and keep it as an artifact. |
| SEC-034 | NOT STARTED | `app_env` setting exists; no environments deployed. | Separate accounts/credentials/data per environment. |
| SEC-035 | NOT STARTED | No deployment. | OIDC short-lived deploy identity; rollback runbook. |

## H. Detection and incident readiness

| ID | State | Evidence | Gap / next action |
|---|---|---|---|
| SEC-036 | IMPLEMENTED (partial) | JSON logs; request ID (sanitised) and one access line per request with route template, status, duration and user ID only; logging rule F-16 decided (ADR-025 §1.8); test that PINs, codes, tokens and full phone/email never reach logs (`test_logs_never_carry_pins_codes_tokens_or_full_numbers`). | Alerting (SEC-037); log sink and retention. |
| SEC-037 | NOT STARTED | — | Alerting on auth failures, privilege changes, transaction and webhook anomalies. |
| SEC-038 | NOT STARTED | — | Incident response runbook. |
| SEC-039 | NOT STARTED | — | DR test; "kill switch" to disable transaction flows. |
| SEC-040 | NOT STARTED | The 2026-10-17 review (`docs/07-security/reviews/2026-10-17-independent-review.md`) is AI-run and does not count. | Engage an independent tester before launch and after material changes. |

## Financial requirements (FX)

| ID | State | Note |
|---|---|---|
| FX-01 | DOCUMENTED | Server-owned values (Standing Standards §7); trades API. |
| FX-02 | DOCUMENTED | Banking Integration Spec; webhook verification not built. |
| FX-03 | DOCUMENTED | 24-hour payout hold in `docs/adr/008-two-factor-authentication.md`; freeze/escalation not designed. |
| FX-04 | DOCUMENTED | `docs/adr/002-financial-event-ledger-architecture.md`. |
| FX-05 | IMPLEMENTED | No balance/wallet wording guard test in the app (`no-balance.test.ts`); custody truth in Standing Standards §2. Approved exception: Figma demo figures in development builds only, marked "Demo", tested empty when `DEMO_MODE` is false (`docs/adr/023-figma-exact-home-cards-demo.md`). |
