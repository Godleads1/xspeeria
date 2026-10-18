# Pending Actions

Things we agreed to do later. When it is time, pick an item, do it, and tick it off here.
Last updated: 18 Oct 2026.

**Owner:** *You* = product owner decision or action. *Build* = engineering work.

## 1. Next build step (agreed)

- [x] **Connect the mobile app to the server sign-in and 2FA** — *Build* — done 18 Oct 2026 for development builds (ADR-027, `docs/RUN_APP_WITH_SERVER.md`). Still to connect:
  - Security screen 2FA management (replace authenticator, new recovery codes) — server endpoints exist.
  - Face ID log-in (needs passkeys).
  - Profile name and details from KYC (Home still shows the demo name).
- [ ] *(original plan, for reference)* **Connect the mobile app to the server sign-in and 2FA**
  - Replace the demo log-in and sign-up with the real server (`/api/v1/auth/...`).
  - Add the authenticator set-up screens (QR code and secret from the server, first code, recovery codes shown once).
  - Keep the refresh token and the trusted-device token in the phone's secure storage.
  - Use the server's step-up for sensitive actions (accept a trade, add a payout account).
  - Change the PIN screens from 4 to 6 boxes (the app logic already uses 6).
  - Refs: ADR-024, ADR-025, ADR-026.

## 2. Decisions and actions waiting on you

- [ ] **Choose an SMS provider** — *You*. Until then sign-up answers "not available". (ADR-025 §2)
- [ ] **Choose an email provider** for security alerts (lock, new device, recovery). Until then alerts only go to the server log. (ADR-026 §2)
- [ ] **Partner bank:** confirm one escrow account can pay several payout accounts per side, and how payment confirmations are sent (push, email or SMS). (ADR-021 §5)
- [ ] **Official rate:** which CBN figure applies, and a live rate feed instead of the fixed snapshot (Decision 3). (ADR-020)
- [ ] **Fee:** decide whether the 1% fee needs a minimum or maximum. (ADR-021 §5)
- [ ] **Business Plan and investor materials:** update to the 1% fee model. (ADR-021 §1)
- [ ] **Artwork licences:** confirm for the Welcome pictures, card designs and the advert stock photo. (ADR-012, ADR-013, ADR-005)
- [ ] **Advert banner:** send a 3× version (1026 × 339) so it is fully sharp on phones. (ADR-005)
- [ ] **Figma file:** update the PIN screens from 4 to 6 boxes. (ADR-024)
- [ ] **GitHub plan upgrade** (Pro/Team) so `main` can require reviews and passing checks. (SEC-031, ADR-019 §4)
- [ ] **Third-party payouts (DEC-007):** decide whether users may pay out to accounts not in their own name.
- [x] **Authorise Milestone 4.1C** — approved 18 Oct 2026; CD3 lock built (ADR-028); offers built (ADR-029).
- [ ] **Confirm the offer interface details the contract leaves open** — *You* (ADR-029 §4): `filter[currency_pair]` written `USD/NGN`; page shape `items` + `next_offset`; the extra `GET /offers/mine` and `GET /offers/{id}`; amount filters and other sort orders not built yet.
- [ ] **Authorise acceptance and `Match`** (the next marketplace milestone) — *You*.
- [ ] **Connect the app's Market screen to the server offers** — *Build*.

## 2b. Outside needs — not possible yet (recorded 18 Oct 2026)

- [ ] **Partner bank** — escrow and payouts: API documents, test (sandbox) access, webhook security details, settlement and reconciliation files, signed agreement. Unblocks real money movement.
- [ ] **Licensing (Decision 4)** — legal opinion on CBN licence or approval for this model, and for the UK, US and EU.
- [ ] **ID checks (KYC) and anti-money-laundering** — verification provider (NIN, BVN, face match; UK/US/EU checks), sanctions screening, a compliance officer to own the rules.
- [ ] **SMS and email provider accounts.**
- [ ] **Hosting** — cloud account (database, Redis, servers; separate test and live), domain name, secret manager.
- [ ] **App stores** — Apple Developer and Google Play accounts; native build (also needed for passkeys).
- [ ] **Admin panel inputs** — staff roles and permissions; who reviews disputes, ID checks and frozen accounts.
- [ ] **Monitoring** — alerting tool and an on-call person (runbooks can be written by *Build*).
- [ ] **Security sign-off** — independent penetration tester; GitHub plan upgrade.
- [ ] **Content** — artwork licences, legal review of app wording, terms of service, privacy policy.

## 3. Waiting on something else

- [ ] **Sharper Figma artwork** when the Figma daily limit resets (or you export them): Home card texture (51:1720), avatar photo (39:2968), card backgrounds (1036:4840 / 4864 / 4888) at 3×. (ADR-023)
- [ ] **npm audit exceptions expire 16 Nov 2026** — review before then or CI will fail. (`.github/npm-audit-exceptions.json`, ADR-017)

## 4. Before going live (production)

- [ ] **Passkeys** (Face ID / fingerprint as the second factor) — needs a native app build and a website domain. (ADR-008 §3)
- [ ] **Shared rate limiter (Redis)** before running more than one server; trusted-proxy setting for client addresses. (ADR-025 §4)
- [ ] **Secret manager and key rotation** for `JWT_SECRET_KEY` and `MFA_ENCRYPTION_KEY`. (SEC-027)
- [ ] **Database row-level security** as a second layer of permission checks. (ADR-025 §1.4)
- [ ] **PIN reset flow** (requires 2FA) and Support's identity re-verification procedure. (ADR-008, ADR-025 §1.3)
- [ ] **Email address verification.** (ADR-025 §3)
- [ ] **Payout endpoints must refuse during the 24-hour payout hold**, and every sensitive endpoint must require a step-up approval. (ADR-026)
- [ ] **Deployment basics:** separate environments, deploy pipeline, SBOM, alerting, incident and disaster-recovery runbooks. (SEC-033 to SEC-039)
- [ ] **Independent penetration test** before launch. (SEC-040)
- [ ] **Rule to keep:** screenshots of the development build show demo balances — never use them in marketing, investor, partner or regulator material. (ADR-023 §3)

## 5. Housekeeping

- [ ] Merge PR #19 (2FA on the server).
- [ ] Delete old merged branches on GitHub: `fix/security-review-findings`, `feat/backend-auth-slice`, `feat/auth-1-server` (and `feat/auth-2-two-factor` after #19 merges).
