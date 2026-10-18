# Independent Review — Mobile Demo, Admin, Backend Skeleton, CI

| | |
|---|---|
| **Date** | 2026-10-17 |
| **Scope** | `main` @ `91a7152` (mobile app, admin skeleton, backend skeleton, CI) |
| **Reviewers** | Three independent read-only reviewers (security, QA, financial integrity) that had not seen the code being written; every finding re-verified against the code before remediation |
| **Standards** | OWASP MASVS v2, OWASP Mobile Top 10 (2024), OWASP ASVS L2, CWE, RFC 6238, `Xspeeria_Security_Master_Audit.md`, `XSPEERIA_STANDING_STANDARDS.md` |
| **Remediation** | ADR-018, branch `fix/security-review-findings` |
| **Evidence state** | AI-IDENTIFIED findings; fixes VERIFIED by automated tests. **Not** a penetration test, not a production security sign-off. |

## Summary

| Severity | Found | Fixed | Needs decision | Deferred to backend |
|---|---|---|---|---|
| Critical | 0 | — | — | — |
| High | 4 | 4 | 0 | 0 |
| Medium | 24 | 17 | 2 | 5 |
| Low / Info | 26 | 12 | 0 | 14 (documented) |

Duplicates across reviewers are merged below (IDs listed together).

## High — all fixed

| ID | Finding | Standard | Fix | Test |
|---|---|---|---|---|
| SEC-01 | `DEMO_MODE` hand-set; demo PIN worked regardless; trades self-completed; no release guard | MASVS-CODE-4, M8, CWE-798/489 | `DEMO_MODE = __DEV__`; release build shows "Not available yet"; log-in/sign-up/biometric refuse; no auto-advance | `security-review.test.tsx` "SEC-01" |
| SEC-03 / QA-02 | Log-out cleared nothing; next sign-up inherited 2FA secret, recovery codes, beneficiaries, trades | MASVS-AUTH-1, STORAGE-2, CWE-613/226 | `session.onUserChange` resets every user store on log-out and new account; biometric bound to account | "SEC-03 / QA-02" |
| QA-03 / SEC-10 | TOTP code reusable within its window | RFC 6238 §5.2, CWE-294 | last accepted step kept; replay = wrong attempt; enrolment code not reusable | "QA-03 / SEC-10" |
| QA-01 | Verified phone/email change never reached log-in | ADR-011, CWE-287 | `session.updateContact` from `profileStore.confirmPhone/Email` | "QA-01" |

## Medium

| ID | Finding | Status |
|---|---|---|
| SEC-02 | Biometric log-in is a stored flag, not a device-bound key | **Partly fixed** (bound to account, cleared for new accounts, legacy flag dropped). Key-backed login → backend auth slice |
| SEC-04 | TOTP key and recovery codes left on clipboard | **Fixed**: cleared after 60 s if unchanged |
| SEC-05 / QA-06 | Chat secret filter bypassable; false positives on amounts | **Fixed**: normalised matching, table-tested both ways |
| SEC-06 / QA-08 | Sign-up OTP silently reissued: unlimited guesses | **Fixed**: explicit resend after 60 s only |
| SEC-07 / QA-10 | npm-audit gate: future-dated approval, unknown severity, count mismatch passed | **Fixed** + 7 tests |
| QA-04 | Enrolment could overwrite secret / clear lock at store level | **Fixed** |
| QA-05 / FIN-06 / FIN-17 | Deep-link amount crashed Select Match; `1e3`/`0x10` accepted | **Fixed**: digits-only params, safe-quote check |
| FIN-07 | `"1,50"` parsed as 150.00 | **Fixed**: commas only as thousands groups |
| QA-07 | ABA validator accepted `000000000` | **Fixed**: prefix + zero checks |
| QA-11 | Any trade ratable, re-rating overwrote | **Fixed** |
| QA-09 | Boundary values untested | **Fixed** for TOTP ±2, lock edge, rounding ties |
| QA-12 | Dynamic routes untested | **Partly**: param parsing tested; route render tests remain a gap |
| FIN-02 | Receipt recomputed fee/total from constants | **Fixed**: recorded amounts carried into history |
| FIN-03 | Failed receipts said "Amount Paid/Received" | **Fixed** |
| FIN-04 | Seller total shown as final with fee unknown | **Fixed**: "+ fee", no "exactly" on sell |
| FIN-05 | Listing capacity never consumed | **Fixed** in demo; server serialises on Offer row later |
| FIN-08 | Extension requested near deadline could still expire | **Fixed** |
| **FIN-01** | Rounding: ADR-002 half-even vs ADR-014/009 half-up | **NEEDS DECISION** |
| **FIN-13** | Partial fill vs Standing Standards §7.3 "never clamp" | **NEEDS DECISION** |
| FIN-09 | No unwinding when one side funded | Deferred: trades API (ADR-001 T5) |
| FIN-10 | Rate precision 2 dp vs ADR-002 6 dp; scale assumed 2 | Deferred: server computes, app displays |

## Low / Info (selected)

Fixed: SEC-08 ID photos re-encoded (EXIF dropped); SEC-09 recovery codes block screenshots;
SEC-11 Android `allowBackup: false`; SEC-12 SSN excluded from autofill; SEC-14 admin
security headers (verified served); SEC-15 sign-up skips Confirm PIN via deep link;
QA-13/14 extension edge cases; QA-20/FIN-19 negative rounding; FIN-12 cancel after deadline.

Documented, not changed: SEC-13 demo phone may be a real number format (choose a reserved
test number when one is confirmed); SEC-14 CODEOWNERS / branch protection (GitHub settings,
UNKNOWN); remembered identifier in AsyncStorage; FIN-11/14/15/16 mock-data inconsistencies;
FIN-20/21 backend ledger/idempotency not implemented (ADR-001/002 DOCUMENTED); QA-15/16/17
test-hygiene items; FIN-22 referral discount not yet applied anywhere.

## Checked and sound (from the reviewers)

CSPRNG everywhere (`expo-crypto`), unbiased code generation, constant-time comparisons,
RFC test vectors for TOTP, fail-closed step-up, `Stack.Protected` routing, last-4-only
account numbers, SSN never stored, no `console.*` in the app, integer-only money with BigInt,
backend money module (HALF_EVEN, BIGINT, CHECK constraints; 191 tests), CI actions pinned
by SHA, least-privilege tokens, no `pull_request_target`, checksum-verified gitleaks with
full-history scan.

## Not verified

Real-device behaviour (Expo runtime, screen-capture, biometrics), backend integration tests
against PostgreSQL in this session, GitHub branch protection, EAS secrets, gitleaks run
locally.
