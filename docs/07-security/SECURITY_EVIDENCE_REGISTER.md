# Security Evidence Register

Current state of every requirement in `docs/07-security/XSPEERIA_ENTERPRISE_SECURITY_STANDARD.md`.

| | |
|---|---|
| **Assessed at** | `main` after PR #16 (branch `fix/security-review-findings`, commit `e1d1197`), 2026-10-17 |
| **Method** | Read-only inspection of code, configuration, CI and docs; test names cited where they exist. No penetration test, no deployed environment. |
| **States** | Standing Standards §5. **NOT STARTED** = no code and no specific design. **DOCUMENTED** = designed in an approved doc, no code. **IMPLEMENTED** = code exists (here, almost always the demo app on the device, which the server must repeat). Nothing is marked **VERIFIED**: no production evidence exists yet, and CI success is IMPLEMENTED-class at best. |
| **Owner** | Every row: **UNASSIGNED** until the product owner names owners (needed for Medium-and-above before release, standard §5). |

## Summary

| State | Count |
|---|---|
| VERIFIED | 0 |
| IMPLEMENTED (partial or demo-only) | 14 |
| DOCUMENTED only | 9 |
| NOT STARTED | 16 |
| BLOCKED (needs an account change) | 1 |
| **Production gate** | **🔴 DO NOT LAUNCH**: there is no backend authentication, authorization or money path yet, so every Critical server-side requirement is open. This is expected at this stage. |

## A. Identity and authentication

| ID | State | Evidence | Gap / next action |
|---|---|---|---|
| SEC-001 | NOT STARTED | No server auth. Demo PIN compared in memory on the device (`mobile/src/features/auth/session.ts`), refused outside dev builds (`docs/adr/018-security-review-remediation.md`). | Backend auth slice: password/PIN hashing (algorithm and parameters to be proposed for approval). |
| SEC-002 | IMPLEMENTED (demo, client) | Step-up before beneficiary add/remove, contact change, recovery codes, trade acceptance (`stepUp.ts`, `StepUpHost.tsx`; tests `two-factor.test.tsx`). No admin auth exists. | Server-side step-up tokens (`docs/adr/008-two-factor-authentication.md` §4); staff MFA when admin auth is built. Password change has no step-up yet. |
| SEC-003 | IMPLEMENTED (demo, client) | 5 tries / 15-min lock, OTP TTL + 60 s resend, TOTP single-use (`security-review.test.tsx` "QA-03", "SEC-06"). | All server-side; per-day caps are Open Decision 2. |
| SEC-004 | NOT STARTED | Session in memory only; no tokens. | Open Decision 2 (lifetimes), SecureStore, rotation, revocation. |
| SEC-005 | DOCUMENTED | Recovery codes + KYC-level support re-verification, no self-service bypass (`docs/adr/008-two-factor-authentication.md` §2). | Support procedure (Compliance); server implementation. |

## B. Authorization and account isolation

| ID | State | Evidence | Gap / next action |
|---|---|---|---|
| SEC-006 | NOT STARTED | No domain endpoints (`backend/app/main.py` registers health only). | Default-deny dependency on every router; tests per endpoint. |
| SEC-007 | NOT STARTED | — | Owner-scoped queries; cross-user BOLA tests (release gate). |
| SEC-008 | DOCUMENTED | Roles and matrix required by Security Master Audit §38.3. | Write the authorization matrix before admin features. |
| SEC-009 | NOT STARTED | Pydantic in stack; no request schemas yet. | Explicit input schemas; forbid extra fields; tests. |

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
| SEC-020 | DOCUMENTED | Standing Standards §7.2 rate rules; `docs/adr/001-*` state machine. | Trades API slice. Rounding conflict open (`docs/adr/018-security-review-remediation.md` §3). |
| SEC-021 | DOCUMENTED | `webhook_shared_secret` placeholder only; Banking Integration Spec. | Signature check, replay window, `provider_event_id` idempotency (`docs/adr/002-*` §4.5). |
| SEC-022 | IMPLEMENTED (demo) | Release builds never advance a trade on the user's "I have paid" (`tradeStore.ts`, test "SEC-01"). | Server: only partner evidence moves state. |
| SEC-023 | DOCUMENTED | `docs/adr/001-*`; demo phases guarded (`trade.test.tsx`). | PostgreSQL-authoritative state machine with row locks and idempotency keys (Standing Standards §6–7). |
| SEC-024 | DOCUMENTED | `docs/adr/002-*`; Appendix D. | Reconciliation jobs and mismatch alerts. |
| SEC-025 | IMPLEMENTED (partial, demo) | Step-up on beneficiary changes; own-name payout accounts only; TOTP replay blocked. | 24-hour payout hold, new-device alerts, server quote locking. |

## F. Data, privacy and secrets

| ID | State | Evidence | Gap / next action |
|---|---|---|---|
| SEC-026 | NOT STARTED | — | Hosting/KMS decision; TLS everywhere; column-level protection for KYC data. |
| SEC-027 | IMPLEMENTED (partial) | Gitleaks over full history in CI with canary; sensitive-file guard; `.env.example` placeholders only. | Approved secret manager; rotation procedure. |
| SEC-028 | DOCUMENTED | SSN never stored (`RegionScreens.tsx`); retention approach is illustrative (`docs/08-compliance/03_Compliance_Operations_Manual_v1.1.md` §5.3). | Ratified retention periods; access controls on KYC storage. |
| SEC-029 | IMPLEMENTED | Demo data synthetic (`example.com`, mock NIN record). | Replace demo phone with a confirmed reserved test number (review SEC-13). |
| SEC-030 | DOCUMENTED | Security Master Audit §38.5. | Backups + a recorded restore exercise. |

## G. Build, deployment and dependencies

| ID | State | Evidence | Gap / next action |
|---|---|---|---|
| SEC-031 | **BLOCKED** | PRs are used, but **branch protection is unavailable**: GitHub returns 403 "Upgrade to GitHub Pro or make this repository public" (checked 2026-10-17). The repo must stay private (licensed fonts). | Product owner: upgrade the plan (GitHub Pro / Team) so `main` can require a reviewed PR and passing checks; then add CODEOWNERS. |
| SEC-032 | IMPLEMENTED | CI: pytest (unit + PostgreSQL integration), ruff, mypy strict, bandit, ESLint, typecheck, jest/vitest, pip-audit, npm audit gate, gitleaks (`.github/workflows/ci.yml`). | No TypeScript SAST beyond ESLint (CodeQL needs GitHub Advanced Security on private repos). |
| SEC-033 | NOT STARTED | Lockfiles exist (`uv.lock`, `package-lock.json`). | Generate SBOM (e.g. CycloneDX) in CI and keep it as an artifact. |
| SEC-034 | NOT STARTED | `app_env` setting exists; no environments deployed. | Separate accounts/credentials/data per environment. |
| SEC-035 | NOT STARTED | No deployment. | OIDC short-lived deploy identity; rollback runbook. |

## H. Detection and incident readiness

| ID | State | Evidence | Gap / next action |
|---|---|---|---|
| SEC-036 | IMPLEMENTED (partial) | JSON structured logging with timestamps (`backend/app/core/logging.py`); no secrets in config errors. | Correlation/request IDs, actor context, redaction rules. |
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
| FX-05 | IMPLEMENTED | No balance/wallet wording guard test in the app (`no-balance.test.ts`); custody truth in Standing Standards §2. |
