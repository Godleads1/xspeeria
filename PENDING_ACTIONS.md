# Pending Actions

Things we agreed to do later. When it is time, pick an item, do it, and tick it off here.
Last updated: 2 Nov 2026 (checked against merged PRs up to #97).

**Owner:** *You* = product owner decision or action. *Build* = engineering work.

## 1. Next build step (agreed)

- [x] **Connect the mobile app to the server sign-in and 2FA** — *Build* — done 18 Oct 2026 for development builds (ADR-027, `docs/RUN_APP_WITH_SERVER.md`). Still to connect:
  - ~~Security screen 2FA management~~ — done (ADR-034).
  - ~~Face ID log-in (needs passkeys)~~ — replaced by fingerprint unlock and the face check (ADR-048, ADR-054).
  - ~~Profile name and details from KYC~~ — done (ADR-055, PR #48).
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
- [x] **Connect the app's Market screen to the server offers** — *Build* — done 18 Oct 2026 for development builds (ADR-030).
- [x] **Offer request limit** — decided 18 Oct 2026: 60 a minute per user (ADR-031).
- [x] **Authorise acceptance and `Match`** — approved 18 Oct 2026; built (ADR-031), Match only.
- [ ] **Confirm the Match response details** — *You* (ADR-031 §3): `your_role`, `counter_currency`, the extra `GET /matches/mine`.
- [x] **Connect the app's "Buy" button to taking an offer** — *Build* — done 18 Oct 2026 for development builds (ADR-032).
- [x] **My Deals screen** — *Build* — done 18 Oct 2026 for development builds (ADR-033).
- [x] **2FA settings in the app** (replace authenticator, new recovery codes) — *Build* — done 18 Oct 2026 for development builds (ADR-034).
- [x] **Payout accounts and preparation** — approved 18 Oct 2026 (30 minutes; sealed number, last 4 shown; pretend bank check); server built (ADR-035).
- [ ] **Confirm ADR-035 §4 details** — *You*: stage names, routes, changing a choice until both sides have chosen, 10 accounts per deal.
- [ ] **Corrected account after a bank rejection: same deadline or a new one?** — *You* (Standing Standards §15 row 10).
- [ ] **EUR payout account form** (IBAN/BIC?) — *You*; EUR payout accounts are refused until then.
- [x] **App screens for payout accounts and choosing them for a deal** — *Build* — done 18 Oct 2026 for development builds (ADR-036).
- [x] **Escrow with a pretend bank** — approved 19 Oct 2026 (simulation only; 5-minute funding window; fee refunded in full on a failed deal); server built (ADR-037).
- [ ] **Confirm ADR-037 §4 details** — *You*: fee stored per leg; 5 retries before a person is alerted; late money after a cancelled deal kept for a person; escrows of a cancelled deal left for the bank to close.
- [x] **24-hour payout hold** — decided 19 Oct 2026: removed; payouts are immediate once both sides have paid in; codes confirm account changes and each deal's choice (DEC-044).
- [ ] **Before go-live: fraud checks to replace the 24-hour hold** — *You + Build* (FX-03): e.g. extra checks when a new account is paid right away, and a way to freeze a deal.
- [ ] **Legal, Risk and the bank must confirm U-1 and U-2** (fee refund, 5-minute window) before a real partner (ADR-001 §11).
- [x] **App escrow steps on a deal** — *Build* — done 19 Oct 2026 for development builds (ADR-038).
- [ ] **Ask Didit** — *You*: is Nigerian NIN/BVN lookup available, and which Nigerian documents are supported? (ADR-039). Live run 2026-10-19: Didit's NIMC/FRSC/NIS database check is listed for Nigeria but **locked until the first paid top-up**.
- [x] **Set up Didit** — *You*: workflow "Compliance workflow" published; keys in your own `.env` (2026-10-19).
- [ ] **Add `KYC_IDENTITY_KEY`** — *You*: one more line in your own `.env` (ADR-041); the server will not start with Didit on without it.
- [x] **Confirm the Nigerian ID rule** — *You*: confirmed 2026-10-19: the Nigerian check needs a **Nigerian-issued ID**; a foreign passport does not count (ADR-042).
- [x] **App: country choice and region screens** — done: region screens connected (ADR-045); "Verify your identity" now asks which country you pay from (ADR-071, 2026-10-27).
- [ ] **US and UK go-live** — *You + lawyer*: partner banks in both countries, money-transmission licensing, US SSN/privacy rules, Didit document coverage (ADR-043).
- [x] **Email provider** — *You*: **Resend** (2026-10-19). Still to do: create the Resend account, verify the sending domain (DNS records) and put the API key in your own `.env` (never in chat or Git).
- [ ] **SMS provider** — *You*: later (ADR-044 N-4).
- [ ] **Push setup** — *You*: Expo account / Firebase project for phone push (N-3, ADR-044).
- [ ] **Languages** — *You*: share the Figma link with the language screens; Yoruba, Igbo, Hausa, French, Arabic and Swahili texts need native-speaker review before launch.
- [ ] **Ghana and Kenya deals** — *You*: decide which deals (cedi/shilling ⇄ naira, or ⇄ UK/US). Canada and UAE fit today's model; all four are after the MVP.
- [x] **Decide who clears held identity checks** — done 27 Oct 2026: two staff members approve, one can reject (ADR-069).
- [x] **App screens for the identity check** — *Build* — done 19 Oct 2026 for development builds (ADR-040).
- [x] **Test Didit end to end** — *You + Build*: done 2026-10-19 (web build + tunnel); results signed, received (200) and applied; found one person verified on two accounts → ADR-041.
- [ ] **Lawyer & partner-bank brief** — *Build* drafts, *You* send: licence route questions and what a partner bank must provide.

## 2b. Outside needs — not possible yet (recorded 18 Oct 2026)

- [ ] **Partner bank** — escrow and payouts: API documents, test (sandbox) access, webhook security details, settlement and reconciliation files, signed agreement. Unblocks real money movement. The pretend bank (ADR-037) follows our own Banking spec; the real contract may differ.
- [ ] **Partner webhook secrets** — stored in a secret manager per partner, with rotation (the pretend bank uses a random one per run).
- [ ] **Licensing (Decision 4)** — legal opinion on CBN licence or approval for this model, and for the UK, US and EU.
- [ ] **ID checks (KYC) and anti-money-laundering** — provider chosen: **Didit** (ADR-039, server built). Still needed: a Didit account and workflow (ID + liveness + face match + AML), its data processing agreement, NIN/BVN support (ask Didit), and a compliance officer to own the rules.
- [ ] **SMS and email provider accounts.**
- [ ] **Hosting** — cloud account (database, Redis, servers; separate test and live), domain name, secret manager. Then move staff and advert photos from the local folder (`LOCAL_PHOTO_DIR`) to the private Cloudflare R2 bucket (ADR-049).
- [ ] **App stores** — Apple Developer and Google Play accounts; native build (also needed for passkeys).
- [ ] **Admin panel inputs** — staff roles and permissions; who reviews disputes, ID checks and frozen accounts.
- [ ] **Monitoring** — alerting tool and an on-call person (runbooks can be written by *Build*).
- [ ] **Security sign-off** — independent penetration tester; GitHub plan upgrade.
- [ ] **Content** — artwork licences, legal review of app wording, terms of service, privacy policy.

## 3. Waiting on something else

- [ ] **Sharper Figma artwork** when the Figma daily limit resets (or you export them): Home card texture (51:1720), avatar photo (39:2968), card backgrounds (1036:4840 / 4864 / 4888) at 3×. (ADR-023)
- [x] **node-forge npm audit exception** — no longer needed: the Expo SDK 58 upgrade (PR #92) left no npm audit exceptions (`.github/npm-audit-exceptions.json` is empty). (2 Nov 2026)

## 4. Before going live (production)

Full review with the release classification: `docs/13-governance/PRODUCTION_READINESS_REVIEW_2026-10-27.md` (**DO NOT LAUNCH** — partner bank, licence, hosting, backups, SMS/email, monitoring and an independent test are still missing).

- [x] ~~**Passkeys**~~ — replaced by fingerprint on a trusted phone + face check (ADR-054, owner 2026-10-20). (Checked 2026-10-27.)
- [ ] **Shared rate limiter (Redis)** before running more than one server; trusted-proxy setting for client addresses. (ADR-025 §4)
- [ ] **Secret manager** (key rotation tools are built: ADR-076, PR #95) for `JWT_SECRET_KEY`, `MFA_ENCRYPTION_KEY` and `BENEFICIARY_ENCRYPTION_KEY`; KMS-managed keys for payout account numbers (backend spec). (SEC-026/027)
- [x] **Database row-level security** as a second layer of permission checks — built (ADR-078, PR #96). At deployment: the app's database login must not be a superuser or have `BYPASSRLS`.
- [x] **PIN reset flow** — built: SMS code + face check or email code (ADR-046, ADR-054; `test_second_check_api.py`). (Checked 2026-10-27.)
- [ ] **Support's procedure** for a customer who can't pass the face check (lost phone, changed appearance) — *Build drafts, You approve*. (ADR-054)
- [x] **Email address verification** — built: sign-up needs the email code before any session (ADR-054). A real email provider is still needed (§2). (Checked 2026-10-27.)
- [x] **Step-up on sensitive actions** — built: payout accounts, choosing payouts, taking offers, PIN and contact changes (`STEP_UP_ACTIONS`). The 24-hour hold was removed by the owner (DEC-044). (Checked 2026-10-27.)
- [ ] **Fraud plan replacing the 24-hour hold** before real payouts (FX-03) — see §2.
- [ ] **Connect a real SMS and email provider** once chosen — *Build* (only developer senders exist).
- [ ] **Super Admin hardware security key** before live money — *Build* (ADR-051 Decision 2).
- [ ] **Backups with a recorded restore** — *Build*, after hosting. (SEC-030) The "pause all deals" switch and "sign everyone out" are built (ADR-075, PR #94).
- [ ] **Deployment basics:** separate environments, deploy pipeline and a disaster-recovery runbook. (SEC-033 to SEC-039) Done already: SBOM in CI (ADR-077), operations alerts and the incident plan (ADR-074).
- [ ] **Independent penetration test** before launch. (SEC-040)
- [ ] **Rule to keep:** screenshots of the development build show demo balances — never use them in marketing, investor, partner or regulator material. (ADR-023 §3)

## 4b. Buildable now, no outside party needed (added 2 Nov 2026)

- [ ] **Delete account** in the app and server (the screen says it isn't built). Needs your rule for records kept by law.
- [ ] **Super Admin hardware security key** (ADR-051 Decision 2).
- [ ] **Shared rate limiter** (database-backed until Redis exists) — readiness H-1.
- [ ] **Resend email sender** behind the existing interface — ready to switch on when the account and domain exist.
- [ ] **Release-build settings** for the app (EAS profiles, store metadata) — ready for when the store accounts exist.

## 5. Housekeeping

- [x] Close PR #19 without merging: its 2FA server work already reached `main` through later PRs (ADR-026). (Checked 2026-10-27.)
- [ ] Delete old branches on GitHub: `fix/security-review-findings`, `feat/backend-auth-slice`, `feat/auth-1-server`, `feat/auth-2-two-factor`.
