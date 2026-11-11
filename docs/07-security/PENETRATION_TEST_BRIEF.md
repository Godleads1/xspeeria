# Penetration Test Brief (SEC-040)

**For the owner to send to a security testing firm.** Readiness blocker C-6: an independent test is required before launch. Reviews done by Claude don't count as independent.

## 1. What Xspeeria is

A peer-to-peer currency exchange for verified customers. Any two supported currencies can be exchanged in a deal (ADR-111, 2026-11-11), not only naira against another. Each person pays with the currency of a country where their identity check is approved, and never buys that currency.

- **Currencies:** US dollars, pounds, euros, Canadian dollars, and ten African currencies (ADR-107).
- **Off for now:** the yuan, until legal clearance (ADR-105).
- **Who can switch them:** a Super Admin turns currencies on or off (ADR-106).
- **How a deal works:** customers post and take offers. A **partner bank holds each side's money in escrow** in its own country and pays out (ADR-001). Xspeeria never holds funds.
- **Money rules:**
  - rates have up to 3 decimals;
  - the CFA franc and the Ugandan shilling have no cents;
  - a 1% fee on each side.

*Updated 2026-11-10 for everything built since the first version (#101), and 2026-11-11 for deals in any pair (ADR-111).*

## 2. In scope

| Target | Technology | Notes |
|---|---|---|
| **API** (`/api/v1`) | Python, FastAPI, PostgreSQL 16 | Customer sign-in (PIN, codes, face check, the "redo identity check"), offers, deals, payout accounts (bank and mobile money), identity checks for 18 countries, disputes, notifications, and the **"Need help?" form for locked-out customers, which works without a login** (a private key on the phone, ADR-103). The public routes are listed in `test_route_access.py`; everything else needs a login. |
| **Admin console** | Next.js (staff only) | Staff roles and permissions, two-person approvals, Super Admin hardware keys (ADR-081), emergency controls. |
| **Mobile app** | React Native (Expo SDK 58), Android and iOS builds | Secure storage of tokens, fingerprint unlock, certificate handling, screens hiding data. |
| **Webhooks** | Signed messages from Didit and the (pretend) partner bank | Signature checks, replay. |
| **Behind the load balancer** | `TRUSTED_PROXIES` (ADR-109) | Can a customer choose the address that rate limits count, by sending `X-Forwarded-For`? |

**Test against the test environment, never the live one.** No real money may move there.

> **Open decision before booking.** The pretend bank (ADR-037) and the demo robots run **only** with `APP_ENV=local`; the server refuses them anywhere else. A hosted test environment therefore has **no escrow** unless one of these is chosen:
> - (a) the chosen partner bank's sandbox;
> - (b) a separately approved test-only setting for the pretend bank on that one server.
>
> Running the hosted server as `local` is not an option, because it also turns on other developer switches. Until this is decided, the money paths (§3.3) can only be tested on a tester's own copy.

## 3. What we most want tested

1. **Authorization:**
   - can one customer read or change another's offers, deals, payout accounts, identity data or notifications?
   - can staff exceed their role?
   - The database has row-level security as a second lock (ADR-078).
2. **Account takeover:**
   - PIN guessing and lockouts, code reuse;
   - session and refresh-token handling, new-phone checks;
   - the PIN reset flow, including when Compliance asked for a new identity check (ADR-104);
   - the no-login "Need help?" thread: can anyone read or write another person's request, or learn whether a phone number has an account?
3. **Money logic:**
   - can a deal's rate or amount change after it's accepted?
   - can payout accounts be swapped mid-deal?
   - can escrow steps be skipped or replayed?
   - is idempotency safe?
   - can a rate above the official limit, a 4th decimal, or cents in a no-cents currency get through?
   - can a switched-off currency still be traded?
   - does the daily reconciliation (ADR-110) catch money in and out that don't match?
   - **Any pair (ADR-111):**
     - can a customer pay with a currency of a country where they aren't verified, or buy the currency they pay with?
     - can they get past a cross limit (for example above GHS 11.604 per USD) by flipping the pair's order or quoting it the other way?
     - can they see offers selling their own country's currency?
     - are both sides of a deal with no naira (for example US dollars for cedis) paid in and out through the right country's escrow, with the right fee?
     - can a deal's tier limit be dodged by trading in a pair without naira?
4. **Staff console:** sign-in (password, email code, security key), session cookies, CSRF, the pause and sign-everyone-out controls, audit-log tampering.
5. **Mobile app:** stored secrets, traffic interception, reverse engineering (no secrets should be in the app).
6. **Usual web risks:** injection, uploads (staff photos, adverts), security headers and CSP, rate limits, information leaks in errors.

## 4. What we provide

- Test customer accounts at several identity tiers and countries, and staff accounts for each role (Super Admin, Compliance Officer, Ops Admin, Support Agent), including one with a security key.
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
