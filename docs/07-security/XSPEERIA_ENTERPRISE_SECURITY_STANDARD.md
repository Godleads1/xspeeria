# XSPEERIA ENTERPRISE SECURITY STANDARD

**Security by design: a mandatory engineering and release standard for Xspeeria.**

| Attribute | Value |
|---|---|
| **Status** | **APPROVED — supplied by the product owner as mandatory, 2026-10-17**; C1 decided the same day (`docs/adr/019-review-decisions-and-multi-offer-fill.md` §1) |
| **Owner** | Product owner (Godleads) |
| **Relationship** | **Extends** `docs/07-security/Xspeeria_Security_Master_Audit.md` (the standing baseline, Standing Standards §4). It adds requirements and release gates; it removes none. Where the two differ, the **stricter** applies until a human decides otherwise (§6). |
| **Evidence register** | `docs/07-security/SECURITY_EVIDENCE_REGISTER.md` — current state of every requirement |
| **Evidence states** | Standing Standards §5. CI success is IMPLEMENTED-class evidence, never production VERIFIED. |

> This document states requirements. It is not a claim that any control exists or works.
> Never state "Xspeeria security is complete" (Standing Standards §4.5).

---

## 1. Why Xspeeria needs this

Xspeeria is a **walletless peer-to-peer fiat exchange marketplace** (Standing Standards §2):
no customer funds, wallets or balances are held; settlement runs through regulated partner
banks. Even so, a compromised account, a manipulated quote, a forged payment confirmation
or an unauthorised change to a transaction can cause real financial harm **without the
attacker ever touching the database**. The controls below are designed around that.

## 2. Foundation standards

Complementary references used to build one Xspeeria baseline with explicit tests and
evidence. They are not separate certifications, and Xspeeria claims none of them.

| Standard | How Xspeeria uses it |
|---|---|
| **OWASP ASVS 5.0.0** | Verify backend, web-service and admin-console controls. Target: Level 2 for all services; Level 3 for authentication, authorization and the money path. |
| **OWASP MASVS v2** (with MASTG for testing) | Verify mobile storage, cryptography, authentication, network, platform, code quality, resilience and privacy. |
| **OWASP API Security Top 10 (2023)** | Test object- and function-level authorization, authentication, resource consumption, sensitive business flows, SSRF, misconfiguration, inventory and unsafe consumption of partner APIs. |
| **NIST SP 800-218 (SSDF) v1.1** | Secure development lifecycle: protected source, vulnerability response, secure release. |

## 3. Mandatory requirements (SEC-001 – SEC-040)

Severity is the requirement's importance for release (§5), not a finding severity.
"Audit" names the overlapping Security Master Audit section.

### A. Identity and authentication

| ID | Sev | Requirement | Maps to | Audit |
|---|---|---|---|---|
| SEC-001 | Critical | Passwords and PINs are stored only with a modern, properly configured password-hashing algorithm (server-side); never plaintext, never reversible. | ASVS V6, V11 | B5 |
| SEC-002 | Critical | MFA is required for privileged staff and administrators; sensitive account changes require re-authentication (step-up). | ASVS V6; MASVS-AUTH | B6 |
| SEC-003 | Critical | Login, OTP and password/PIN-reset endpoints enforce rate limits, attempt limits, expiry and replay protection. | ASVS V6; API2, API4 | B8, B9, K |
| SEC-004 | Critical | Sessions and refresh tokens have controlled lifetimes, secure storage, rotation and revocation. | ASVS V7, V9; MASVS-STORAGE | B3, B4 |
| SEC-005 | Critical | Account recovery is never weaker than normal authentication. | ASVS V6 | B6 |

### B. Authorization and account isolation

| ID | Sev | Requirement | Maps to | Audit |
|---|---|---|---|---|
| SEC-006 | Critical | Every sensitive API action enforces authorization on the server, not only in the mobile UI. | ASVS V8; API5 | C1, F |
| SEC-007 | Critical | No user can reach another user's profile, verification documents, exchange requests or payment records by changing an ID. | ASVS V8; API1 | C3, C4 |
| SEC-008 | Critical | Staff roles and administrative actions follow least privilege and separation of duties. | ASVS V8; API5 | C5, S, 38.3 |
| SEC-009 | Critical | Mass assignment and unauthorised changes to sensitive fields are prevented. | ASVS V15; API3 | E3 |

### C. API and backend protection

| ID | Sev | Requirement | Maps to | Audit |
|---|---|---|---|---|
| SEC-010 | Critical | All input is validated server-side; database access is parameterised; output is handled safely. | ASVS V1, V2 | E1, D7, E4 |
| SEC-011 | High | Request-size limits, timeouts, rate limits and abuse controls on sensitive endpoints. | ASVS V4; API4, API6 | K, F |
| SEC-012 | Critical | CSRF protection wherever cookie authentication is used; protection against injection, SSRF and open redirects. | ASVS V1, V3, V15; API7 | L, N, O |
| SEC-013 | High | Strict CORS, security headers, TLS and safe production configuration. | ASVS V3, V12, V13; API8 | L, U |
| SEC-014 | High | APIs and dependencies are inventoried; debug endpoints and unnecessary public interfaces are removed. | ASVS V13; API9 | J, U |

### D. Mobile application security

| ID | Sev | Requirement | Maps to | Audit |
|---|---|---|---|---|
| SEC-015 | Critical | Tokens and sensitive device data live in OS-protected storage (Keychain/Keystore); no secret is embedded in the app. | MASVS-STORAGE, MASVS-CRYPTO | A1, A3 |
| SEC-016 | High | TLS is verified; sensitive data does not leak through logs, crash reports, clipboard or screenshots where appropriate. | MASVS-NETWORK, MASVS-STORAGE, MASVS-PLATFORM | A5, X |
| SEC-017 | High | Deep links, universal/app links, WebViews, exported components and inter-app communication are reviewed. | MASVS-PLATFORM | X |
| SEC-018 | High | Release builds are tested for exposed keys, insecure local storage, reverse-engineering risk and tampering assumptions. | MASVS-CODE, MASVS-RESILIENCE | A6 |
| SEC-019 | Critical | The client is never trusted for identity, exchange rates, payment status, transaction amounts or permissions. | MASVS-CODE; ASVS V2 | E2, G |

### E. Financial transaction integrity

| ID | Sev | Requirement | Maps to | Audit |
|---|---|---|---|---|
| SEC-020 | Critical | The server calculates or verifies exchange quotes, fees, limits and transaction state. | ASVS V2; API6 | G1, G2 |
| SEC-021 | Critical | Payment-partner webhooks are authenticated, replay-resistant and processed idempotently. | ASVS V4; API10 | E7, T |
| SEC-022 | Critical | A client success screen, redirect, "I have paid" tap or transfer screenshot never counts as proof of payment. | ASVS V2 | H, G3 |
| SEC-023 | Critical | Transactions enforce valid state transitions, atomic updates and duplicate-request protection. | ASVS V2, V15 | G4, G5, 38.2 |
| SEC-024 | Critical | Partner events are reconciled against internal records; mismatches and suspicious activity raise alerts. | ASVS V16 | H, Q |
| SEC-025 | Critical | Protection against account takeover, beneficiary substitution, quote manipulation and transaction replay. | ASVS V2, V6; API6 | G1, G6 |

### F. Data, privacy and secrets

| ID | Sev | Requirement | Maps to | Audit |
|---|---|---|---|---|
| SEC-026 | Critical | Data is encrypted in transit; sensitive stored data is protected with managed keys and defined access policies. | ASVS V11, V12, V14 | R, U |
| SEC-027 | Critical | Secrets live in an approved secret manager, are rotated, and never appear in Git history. | ASVS V13; SSDF PS.1 | A1, A4 |
| SEC-028 | Critical | Access to identity/KYC records is restricted; retention and deletion rules are defined and enforced. | ASVS V14; MASVS-PRIVACY | R, M |
| SEC-029 | High | Development and testing use synthetic or sanitised data only. | ASVS V14 | R |
| SEC-030 | Critical | Backups are encrypted, access-controlled and proven by actual restoration exercises. | SSDF PO.5 | 38.5 |

### G. Build, deployment and dependencies

| ID | Sev | Requirement | Maps to | Audit |
|---|---|---|---|---|
| SEC-031 | High | Production changes require reviewed pull requests and protected branches. | SSDF PS.1, PW.7 | 38.7 |
| SEC-032 | High | CI runs automated tests, static analysis, dependency scanning and secret scanning. | SSDF PW.7, PW.8 | J, Y |
| SEC-033 | High | A software bill of materials (SBOM) is generated and reviewed; vulnerable dependencies are addressed. | SSDF PS.3, RV.1 | J1, J4 |
| SEC-034 | Critical | Development, test and production credentials, infrastructure and data are separated. | ASVS V13 | U |
| SEC-035 | Critical | Deployment credentials are restricted, short-lived identity is used where supported, and a rollback procedure exists. | SSDF PO.5 | U, 38.6 |

### H. Detection and incident readiness

| ID | Sev | Requirement | Maps to | Audit |
|---|---|---|---|---|
| SEC-036 | High | Security events are recorded with timestamps, correlation IDs and actor context, without secrets or OTPs. | ASVS V16 | Q, A5 |
| SEC-037 | High | Alerts on repeated authentication failures, privilege changes, unusual transaction activity and webhook anomalies. | ASVS V16 | Q |
| SEC-038 | High | Incident triage, containment, credential rotation, evidence preservation and customer communication are documented. | SSDF RV.2, RV.3 | Q |
| SEC-039 | Critical | Restoration, disaster recovery and the ability to disable affected transaction flows are tested. | SSDF PO.5 | V, 38.5 |
| SEC-040 | Critical | Independent security testing is arranged, and repeated after material security changes. | SSDF PW.8 | 38.6 |

## 4. Xspeeria-specific financial requirements

| ID | Requirement |
|---|---|
| **FX-01 Exchange request integrity** | A user cannot change the rate, fee, recipient, amount or status of an exchange by editing a request in the app or replaying an API call. The server owns every one of these values (Standing Standards §7). |
| **FX-02 Payment partner verification** | Payment status comes only from the partner's authenticated server-to-server mechanism. Validate signature, expected account, currency, amount, reference and event uniqueness. Never trust a redirect, a client tap or a screenshot of a transfer. |
| **FX-03 Fraud and account takeover** | Risk-based checks for suspicious account changes, repeated OTP failures, unusual transaction patterns and attempts to redirect funds (e.g. new beneficiary + immediate payout; ADR `docs/adr/008-two-factor-authentication.md` 24-hour hold). A controlled way to freeze affected transactions and escalate suspected fraud. |
| **FX-04 Reconciliation and auditability** | A reliable, append-only transaction history reconciled against partner records. Corrections are new, attributed entries; staff can never silently rewrite history (`docs/adr/002-financial-event-ledger-architecture.md`). |
| **FX-05 No custody by design** | None of the above may introduce an internal wallet, customer balance or custody function (Standing Standards §2). A control that needs one is redesigned, not shipped. |

## 5. Release gates

A requirement only protects anyone if failing it stops a release.

| Finding severity | Required response |
|---|---|
| **Critical** | Block release. Fix and retest before deployment. |
| **High** | **Block release** if it exposes sensitive data, permits unauthorised access or threatens transaction integrity. Any other High needs a documented risk acceptance (approver, compensating controls, expiry). Decided C1, 2026-10-17. |
| **Medium** | Assign an owner, a remediation deadline and a documented mitigation before release. |
| **Low** | Track and resolve through normal security maintenance. |

**Mandatory before production** (in addition to Security Master Audit §34 and §38.6):

- [ ] No unresolved Critical or High exploitable vulnerability in the agreed security assessment.
- [ ] Automated authorization tests prove users cannot access other users' data (SEC-006, SEC-007).
- [ ] Authentication, OTP abuse and account recovery tested (SEC-001 – SEC-005).
- [ ] Partner webhook verification, replay protection, idempotency and transaction-state controls pass (SEC-021, SEC-023, FX-02).
- [ ] Production secrets and permissions reviewed (SEC-027, SEC-034, SEC-035).
- [ ] Backup restoration and incident response exercised (SEC-030, SEC-038, SEC-039).
- [ ] Independent penetration testing covered the mobile app, backend APIs and critical transaction workflows (SEC-040).
- [ ] Every exception has written approval, compensating controls and an expiry date (pattern: `docs/adr/017-npm-audit-time-limited-exceptions.md`).

## 6. Reconciliation with existing governance

| # | Topic | Resolution |
|---|---|---|
| **C1** | **High-severity release rule** | **DECIDED 2026-10-17 by the product owner** (`docs/adr/019-review-decisions-and-multi-offer-fill.md` §1): the relaxation of Security Master Audit §6 is approved for release purposes; the §5 table governs. Critical findings always block. |
| C2 | ID collision | Requirements use three-digit IDs (`SEC-001`). Review findings use the report's own prefix with two digits (`SEC-01`, `QA-01`, `FIN-01` in `docs/07-security/reviews/`). They are different things; always cite the report path with a finding ID. |
| C3 | Baseline count | This standard adds 40 requirements and 5 financial requirements to the 112 Master Audit controls. Nothing is removed (Standing Standards §4.3). |
| C4 | AI review vs independent testing | Assistant-run reviews are AI-IDENTIFIED evidence (Standing Standards §5). They do not satisfy SEC-040, which needs independent human-led testing. |

## 7. How this standard is applied

1. Every PR that touches a requirement's area cites the SEC/FX ID and updates the register.
2. A requirement moves to **IMPLEMENTED** only with code in the repository, and to
   **VERIFIED** only with a named test, scan or human verification (Standing Standards §5).
3. Remediation runs in small staged PRs, highest risk first, each with tests and an
   independent review.
4. Before release, authorised security testing runs in a controlled environment and its
   reports, results and remediation evidence are kept in `docs/07-security/reviews/`.
