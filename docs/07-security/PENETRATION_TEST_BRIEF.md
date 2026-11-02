# Penetration Test Brief (SEC-040)

**For the owner to send to a security testing firm.** Readiness blocker C-6: an independent test is required before launch. Reviews done by Claude don't count as independent.

## 1. What Xspeeria is

A peer-to-peer currency exchange (NGN ⇄ USD/GBP) for verified customers. Customers post and take offers; a **partner bank holds the money in escrow** and pays out (ADR-001). Xspeeria never holds funds.

## 2. In scope

| Target | Technology | Notes |
|---|---|---|
| **API** (`/api/v1`) | Python, FastAPI, PostgreSQL 16 | Customer sign-in (PIN, codes, face check), offers, deals, payout accounts, identity checks, disputes, notifications. 18 routes work without a login; everything else needs one (`test_route_access.py`). |
| **Admin console** | Next.js (staff only) | Staff roles and permissions, two-person approvals, Super Admin hardware keys (ADR-081), emergency controls. |
| **Mobile app** | React Native (Expo SDK 58), Android and iOS builds | Secure storage of tokens, fingerprint unlock, certificate handling, screens hiding data. |
| **Webhooks** | Signed messages from Didit and the (pretend) partner bank | Signature checks, replay. |

**Test against the test environment, never the live one.** It runs the **pretend bank** (ADR-037), so no real money moves.

## 3. What we most want tested

1. **Authorization:**
   - can one customer read or change another's offers, deals, payout accounts, identity data or notifications?
   - can staff exceed their role?
   - The database has row-level security as a second lock (ADR-078).
2. **Account takeover:** PIN guessing and lockouts, code reuse, session and refresh-token handling, new-phone checks, the PIN reset flow.
3. **Money logic:**
   - can a deal's rate or amount change after it's accepted?
   - can payout accounts be swapped mid-deal?
   - can escrow steps be skipped or replayed?
   - is idempotency safe?
4. **Staff console:** sign-in (password, email code, security key), session cookies, CSRF, the pause and sign-everyone-out controls, audit-log tampering.
5. **Mobile app:** stored secrets, traffic interception, reverse engineering (no secrets should be in the app).
6. **Usual web risks:** injection, uploads (staff photos, adverts), security headers and CSP, rate limits, information leaks in errors.

## 4. What we provide

- Test customer accounts at several identity tiers, and staff accounts for each role (Super Admin, Compliance Officer, Ops Admin, Support Agent), including one with a security key.
- The test environment's addresses, and an Android build of the app (plus TestFlight for iOS, once available).
- Architecture documents on request: the decision records (ADRs), the security register and the readiness review.

## 5. Rules

- Test only the addresses we list. No denial-of-service. No social engineering of staff unless agreed separately.
- **Do not test Didit, the partner bank or other third parties directly.**
- Stop and call the on-call person ([`ON_CALL_GUIDE.md`](ON_CALL_GUIDE.md)) if you find live customer data or a critical issue.
- Test data only. Delete what you collected at the end.

## 6. What we want back

- A report with each finding's severity (CVSS or similar), the steps to reproduce it and the suggested fix. Map the findings to **OWASP ASVS level 2** and, for the app, **OWASP MASVS**.
- A short summary for the partner bank and regulators.
- **A free retest** of the fixes within an agreed time.

## 7. Before booking

The test environment must exist first (hosting, C-3). Ask firms for a quote, their timeline, references from fintech clients, and their certifications (e.g. CREST or OSCP-certified testers).
