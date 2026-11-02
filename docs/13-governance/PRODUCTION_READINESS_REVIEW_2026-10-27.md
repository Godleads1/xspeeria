# Production Readiness Review — 27 October 2026

| Attribute | Value |
|---|---|
| **Reviewed** | `main` at `540921e` (after PR #85), the repository documents, CI, and test runs made today |
| **Requested by** | Product owner, 2026-10-27 ("Production readiness review") |
| **Method** | `/xspeeria-production-check`. Each gate is checked against files and test runs in the repository. Anything not shown by evidence is marked UNKNOWN. This is an AI-run review; it does **not** replace the independent security test (SEC-040). |
| **Classification** | **DO NOT LAUNCH** |

## 1. Summary

The software is far along: the server, the mobile app and the admin console are built and well tested. But Xspeeria has **no way to run for real customers yet**:
- no partner bank, so money can't move;
- no licence opinion;
- no hosting, backups or monitoring;
- no SMS or email provider. Without these, sign-up is switched off outside a developer's computer.

None of these can be fixed by writing more code alone. They need accounts, partners and decisions from the owner.

**Good enough today for:** development, internal demos, and showing partners and investors the product, with the demo-figure rule (ADR-023).

**The next stage that makes sense is a closed pilot.** Real people use real hosting and real sign-in, but money moves only in the simulation, or with a sandbox bank. It needs the items marked **Pilot** in §5.

## 2. Evidence reviewed

| Area | Evidence | Result |
|---|---|---|
| Tests (server) | Full suite on PR #84's branch, PostgreSQL 16: **1199 passed** (27 Oct) | VERIFIED |
| Tests (console) | vitest **138 passed**, `tsc`, `eslint`, `next build` (27 Oct) | VERIFIED |
| Tests (app) | jest **696 passed**, `tsc`, `eslint` (27 Oct) | VERIFIED |
| CI | `.github/workflows/ci.yml`: ruff, mypy strict, bandit, pytest with an "integration tests really ran" check, pip-audit, npm audit gate (ADR-017), gitleaks over full history, sensitive-file guard. Last finished run on `main` (`0c1e8c5`) **succeeded**. Runs for `b6b4fd8` and `540921e` were still going during this review. | VERIFIED / runs pending |
| Repository | Private: yes. Branch protection on `main`: **not available** (GitHub plan, HTTP 403). | VERIFIED |
| Security register | `docs/07-security/SECURITY_EVIDENCE_REGISTER.md`: 40 SEC + 5 FX items. **9 not started** (SEC-012, 014, 033, 034, 035, 037, 038, 039, 040), 8 documented only (SEC-019, 020, 024, 028, 030; FX-01, 02, 04), 1 blocked (SEC-031), FX-03 open. SEC-012's "no cookie auth" note is out of date: the console uses a cookie, protected as below. | VERIFIED |
| Deployment | `docker-compose.yml` starts a local database only. No application image, no environments, no deploy pipeline. | VERIFIED (absent) |
| Money | Integer minor units everywhere. Escrow is a simulation with a pretend bank that only works locally (ADR-037). Dev flags refuse to start outside `APP_ENV=local` (`main.py` checks). | VERIFIED |
| Webhooks | Didit results: forged, old and replayed events change nothing (`test_kyc_api.py`). Partner-bank webhook: signed simulation only (SEC-021). | VERIFIED (simulation) |
| Console CSRF | `X-Xspeeria-Admin` header required on every console route (router-level), SameSite=Strict httpOnly cookie, Secure outside local (`test_admin_staff.py`). | VERIFIED |

## 3. Critical blockers (any one stops a launch with real customers)

| # | Blocker | Why it matters | Who |
|---|---|---|---|
| C-1 | **No partner bank** (escrow, payouts, sandbox, webhook keys, reconciliation files, agreement) | Xspeeria never holds money; without a bank nothing settles. FX-02 and SEC-024 (reconciliation) can't be built without the bank's documents. | Owner |
| C-2 | **No licence opinion** for Nigeria, the UK and the US (Decision 4) | Running money movement without the right permission is a legal risk. | Owner + lawyer |
| C-3 | **No hosting**: separate test and live environments, secret manager, deploy pipeline with rollback (SEC-034, SEC-035) | There is nowhere safe to run it. Keys would sit in `.env` files. | Owner (account), then Build |
| C-4 | **No backups or restore test**, and no way to switch off deal flows in an emergency (SEC-030, SEC-039) | A database loss would be permanent, and an incident couldn't be contained. | Build, after C-3 |
| C-5 | **No SMS or email provider** | Only developer senders exist (`providers/sms.py`, `providers/email.py`: console and recording). Developer senders refuse to run outside `APP_ENV=local`, and with no email sender sign-up answers 503 (`test_sign_up_is_off_without_an_email_sender`). So customers can't join or get security alerts. | Owner chooses; Build connects **2026-11-02:** the Resend email sender is built and switched off until the account and domain exist (ADR-082); SMS still needs a provider. |
| C-6 | **No independent security test** (SEC-040) | Required before launch. The 17 Oct review was AI-run and doesn't count. | Owner engages, Build fixes |
| C-7 | **No monitoring, alerting or incident plan** (SEC-037, SEC-038) | Attacks, outages and failed payments would go unnoticed. | Build + an on-call person |

## 4. High and medium findings

| # | Finding | Severity | Notes |
|---|---|---|---|
| H-1 | The rate limiter is in memory (`core/rate_limit.py`) | High at more than one server | Correct for one server; needs Redis, or a database-backed limiter, before scaling (ADR-025 §4). **Addressed 2026-11-02 (ADR-080):** limits are counted in PostgreSQL and shared by every server; a trusted-proxy setting is still needed with hosting. |
| H-2 | Keys come from environment variables; no rotation (SEC-026/027) | High | `JWT_SECRET_KEY`, `MFA_ENCRYPTION_KEY`, `BENEFICIARY_ENCRYPTION_KEY`, `KYC_IDENTITY_KEY`. Move to the secret manager with C-3. |
| H-3 | No database row-level security (ADR-025 §1.4) | High (defence in depth) | Every query is scoped in code and tested; RLS would be a second lock. **Addressed 2026-11-02 (ADR-078):** forced policies on customers' private tables; deployment must confirm the app's login user has no `BYPASSRLS`. |
| H-4 | `main` can't require reviews or passing checks (SEC-031) | High | Needs GitHub Pro/Team. Today anyone with write access could push straight to `main`. |
| H-5 | No hardware security key for the Super Admin (ADR-051 Decision 2) | High before live money | Staff sign in with password + email code; the owner decided a hardware key is required before live money. |
| H-6 | FX-03: the 24-hour payout hold was removed (DEC-044); compensating fraud checks are simple rules (ADR-068) | High before live money | Accepted for the simulation only. Needs the owner's fraud plan before real payouts. |
| M-1 | `/health` returns the environment name (SEC-014) | Medium | Trim it, or keep it internal; add an API inventory. |
| M-2 | No SBOM in CI (SEC-033) | Medium | Lockfiles exist; add CycloneDX output. |
| M-3 | Background sweeps run inside every API server (`main.py`) | Medium | Row locks with `skip_locked` and one-alert-per-rule unique indexes limit double work. Behaviour with several servers is **UNKNOWN — NOT VERIFIED**; test it, or run sweeps in one worker. |
| M-4 | Console Content-Security-Policy has no `script-src` | Medium | `admin/next.config.ts` sets frame-ancestors, base-uri, object-src, form-action and the other baseline headers. A script policy with nonces needs middleware, and the no-flash theme script needs a hash (ADR-064). |
| M-5 | node-forge npm exception until 27 Nov 2026 (ADR-017) | Medium | Build tooling only; no patched version exists yet. |
| M-6 | Translations are machine drafts (ADR-053, ADR-060) | Medium | Native-speaker review before launch. |
| L-1 | Several to-do items were out of date | Low | Fixed in this review (§6). |

## 5. Required remediation, in order

| Step | Stage | What | Depends on |
|---|---|---|---|
| 1 | Pilot | Choose and open: SMS provider, email provider (Resend needs the domain), hosting account with a secret manager; Build then connects the SMS and email providers | Owner, then Build |
| 2 | Pilot | Build: application container, staging and live environments, deploy pipeline with rollback, keys in the secret manager | Step 1 |
| 3 | Pilot | Build: daily encrypted backups + one recorded restore; a "pause all deals" switch | Step 2 |
| 4 | Pilot | Build: error tracking, alerts (sign-in failures, staff permission changes, webhook failures, stuck deals), incident and recovery runbooks; name an on-call person | Step 2 |
| 5 | Pilot | Trim `/health`; SBOM in CI; console script policy (nonces + theme-script hash); GitHub plan upgrade and branch protection | — |
| 6 | Live money | Partner bank (sandbox → live), webhook verification, reconciliation jobs and mismatch alerts (FX-02, SEC-024) | Owner: bank |
| 7 | Live money | Licence opinion and the lawyer's conditions; terms of service and privacy policy | Owner: lawyer |
| 8 | Live money | Super Admin hardware key; fraud plan replacing the 24-hour hold (FX-03); Redis limiter before a second server; RLS | Steps 2, 6 |
| 9 | Live money | Independent penetration test, fixes, retest | Steps 2–8 |

## 6. To-do list corrections made with this review

Items in `PENDING_ACTIONS.md` §4 that the code shows are done or replaced:
- **PIN reset:** built. Forgot PIN uses the SMS code plus a face check (after KYC) or an email code (before KYC) (ADR-046, ADR-054; `test_second_check_api.py` forgot-PIN tests). What remains is Support's procedure for a customer who can't pass the face check.
- **Email address verification:** built. Sign-up needs the email code before any session starts (`test_sign_up_needs_the_email_code_before_any_session`). A real email provider remains open (C-5).
- **Passkeys:** replaced by fingerprint on a trusted phone plus a face check (ADR-054, owner 2026-10-20).
- **Step-up on sensitive actions:** built for adding and removing payout accounts, choosing payout accounts, taking an offer, changing PIN and changing contact details (`STEP_UP_ACTIONS`, `consume_step_up` in `offers.py`/`auth.py`).
- **24-hour payout hold:** removed by the owner (DEC-044). The open item is now H-6 (FX-03).

## 7. Residual risks after the steps above

- **Upstream issues:** the vendors (Didit, the bank, the SMS and email providers) can fail or change. Each needs a vendor review and an exit plan (Standing Standards).
- **Human-review points:**
  - held identity checks (two people, ADR-069);
  - refunds (two people, ADR-065);
  - fraud alerts.

  These depend on staffing and response times.
- **The simulation:** it proves the order of steps, not a real bank's behaviour. Expect changes once the bank's documents arrive.

## 8. Final classification

**DO NOT LAUNCH.** Critical blockers C-1 to C-7 remain. Most need the owner to open accounts or engage partners before any build work can close them.
