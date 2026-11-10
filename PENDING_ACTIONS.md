# Pending Actions

Things we agreed to do later. When it is time, pick an item, do it, and tick it off here.
Last updated: 2 Nov 2026 (checked against merged PRs up to #97).

**Owner:** *You* = product owner decision or action. *Build* = engineering work.

## 1. Next build step (agreed)

- [x] **Connect the mobile app to the server sign-in and 2FA** — *Build* — done 18 Oct 2026 for development builds (ADR-027, `docs/RUN_APP_WITH_SERVER.md`). Still to connect:
  - ~~Security screen 2FA management~~ — done (ADR-034).
  - ~~Face ID log-in (needs passkeys)~~ — replaced by fingerprint unlock and the face check (ADR-048, ADR-054).
  - ~~Profile name and details from KYC~~ — done (ADR-055, PR #48).
- [x] *(original plan, kept for reference; done, see the line above)* **Connect the mobile app to the server sign-in and 2FA**
  - Replace the demo log-in and sign-up with the real server (`/api/v1/auth/...`).
  - Add the authenticator set-up screens (QR code and secret from the server, first code, recovery codes shown once).
  - Keep the refresh token and the trusted-device token in the phone's secure storage.
  - Use the server's step-up for sensitive actions (accept a trade, add a payout account).
  - Change the PIN screens from 4 to 6 boxes (the app logic already uses 6).
  - Refs: ADR-024, ADR-025, ADR-026.

## 2. Decisions and actions waiting on you

- [ ] **Choose an SMS provider** — *You*. Until then sign-up answers "not available". (ADR-025 §2, ADR-044 N-4)
- [x] **Choose an email provider:** Resend, chosen 19 Oct 2026; the account and domain are still to do (see "Email provider" below). (ADR-026 §2)
- [ ] **Partner bank:** confirm one escrow account can pay several payout accounts per side, and how payment confirmations are sent (push, email or SMS). (ADR-021 §5)
- [x] **Official rate feed:** built 9 Nov 2026: CBN central rates via Frankfurter, hourly, last good rate for 3 days then no new offers (ADR-102). Production refuses to start without `OFFICIAL_RATE_FEED=frankfurter`; migration 0046 runs with the first deployment's database setup.
- [x] **Fee:** decided 8 Nov 2026: **flat 1%**, no minimum or maximum, no bands, no maker discount (ADR-021 §1; the banded Fair Fee of PR #121 was not adopted).
- [x] **Business Plan and investor materials:** updated 9 Nov 2026 to the 1% fee (Business Plan §1, §5, §6, §10; Investor Book §7; BRS §11.2).
- [ ] **Re-model the projections at 1% and three launch corridors (ADR-100)** — *You*: Business Plan Table 10.1 revenue is recalculated at a 1.0% take rate (lower than before), but EBITDA margins from Year 3, the scenarios (Table 10.2) and the valuations (Section 11) still use the old revenue.
- [ ] **Artwork licences:** confirm for the Welcome pictures, card designs and the advert stock photo. (ADR-012, ADR-013, ADR-005)
- [ ] **Advert banner:** send a 3× version (1026 × 339) so it is fully sharp on phones. (ADR-005)
- [ ] **Figma file:** update the PIN screens from 4 to 6 boxes. (ADR-024)
- [ ] **GitHub plan upgrade** (Pro/Team) so `main` can require reviews and passing checks. (SEC-031, ADR-019 §4)
- [x] **Third-party payouts (DEC-007):** decided 2 Nov 2026: **allowed.** A customer may be paid into any account, not only one in their own name (owner's example: a school's account for a child's fees). **Lawyer, 3 Nov 2026: acceptable under AML rules** (DEC-097). Still to confirm with the partner bank, which may have its own rules (C-1).
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
- [x] **Corrected account after a bank rejection:** decided: **a new deadline of 10 minutes** (owner, 8 and 9 Nov 2026; ADR-099). Built once the partner bank's account check exists.
- [x] **EUR payout account form:** decided 8 Nov 2026: **IBAN only**, no BIC; built (ADR-099). Euro deals still can't settle until a euro partner bank and country are chosen.
- [x] **App screens for payout accounts and choosing them for a deal** — *Build* — done 18 Oct 2026 for development builds (ADR-036).
- [x] **Escrow with a pretend bank** — approved 19 Oct 2026 (simulation only; 5-minute funding window; fee refunded in full on a failed deal); server built (ADR-037).
- [x] **ADR-037 §4:** fee stored per leg and 5 retries before a person is alerted, confirmed 8 Nov 2026 (ADR-099).
- [x] **The other ADR-037 §4 details**, confirmed 8 Nov 2026 (ADR-099): late money after a cancelled deal is checked by a staff member, then returned by the bank; escrows of a cancelled deal are left for the bank to close.
- [x] **24-hour payout hold** — decided 19 Oct 2026: removed; payouts are immediate once both sides have paid in; codes confirm account changes and each deal's choice (DEC-044).
- [x] **Wait before a new payout account can be paid** — decided 3 Nov 2026: **no wait**. Protection is the double confirmation, the new-account alert (ADR-083) and the "this wasn't me" email (ADR-084); the risk of a fast takeover payout is accepted. Reopen if the bank or lawyer asks for a cooling-off period (DEC-092).
- [x] **FX-03:** decided 9 Nov 2026: no further checks before launch. The owner relies on the new-phone face check and the "this wasn't me" freeze; the remaining risk is accepted (`FRAUD_OPTIONS_2026-11.md`). Reopened if the partner bank or the lawyer asks.
- [ ] **Legal, Risk and the bank must confirm U-1 and U-2** (fee refund, 5-minute window) before a real partner (ADR-001 §11).
- [x] **App escrow steps on a deal** — *Build* — done 19 Oct 2026 for development builds (ADR-038).
- [ ] **Ask Didit** — *You*: is Nigerian NIN/BVN lookup available, and which Nigerian documents are supported? (ADR-039). Live run 2026-10-19: Didit's NIMC/FRSC/NIS database check is listed for Nigeria but **locked until the first paid top-up**.
- [x] **Set up Didit** — *You*: workflow "Compliance workflow" published; keys in your own `.env` (2026-10-19).
- [ ] **Add `KYC_IDENTITY_KEY`** — *You*: one more line in your own `.env` (ADR-041); the server will not start with Didit on without it.
- [x] **Confirm the Nigerian ID rule** — *You*: confirmed 2026-10-19: the Nigerian check needs a **Nigerian-issued ID**; a foreign passport does not count (ADR-042).
- [x] **App: country choice and region screens** — done: region screens connected (ADR-045); "Verify your identity" now asks which country you pay from (ADR-071, 2026-10-27).
- [ ] **US and UK go-live** — *You + lawyer*: partner banks in both countries, money-transmission licensing, US SSN/privacy rules, Didit document coverage (ADR-043).
- [ ] **Canada go-live** — *You + lawyer* (ADR-100): a Canadian partner bank, Canadian legal review (money-services-business registration, provincial rules, PIPEDA), Didit coverage for Canada.
- [x] **Canada in the product:** built 9 Nov 2026 (ADR-100). The CAD payout form uses institution, transit and account numbers (owner).
- [x] **CAD rate ceiling:** decided 9 Nov 2026: worked out from the USD ceiling and the Bank of Canada rate, ₦944.70 (ADR-101).
- [x] **+1 phone numbers (US and Canada):** built 9 Nov 2026 for sign-up, log-in, forgot PIN and change phone (ADR-100).
- [x] **Email provider** — *You*: **Resend** (2026-10-19). Still to do: create the Resend account, verify the sending domain (DNS records) and put the API key in your own `.env` (never in chat or Git).
- [ ] **Push setup** — *You*: Expo account / Firebase project for phone push (N-3, ADR-044).
- [ ] **Languages** — *You*: share the Figma link with the language screens; Yoruba, Igbo, Hausa, French, Arabic and Swahili texts need native-speaker review before launch.
- [ ] **Ghana and Kenya deals** — *You*: decide which deals (cedi/shilling ⇄ naira, or ⇄ UK/US). Canada and UAE fit today's model; all four are after the MVP.
- [x] **Decide who clears held identity checks** — done 27 Oct 2026: two staff members approve, one can reject (ADR-069).
- [x] **App screens for the identity check** — *Build* — done 19 Oct 2026 for development builds (ADR-040).
- [x] **Test Didit end to end** — *You + Build*: done 2026-10-19 (web build + tunnel); results signed, received (200) and applied; found one person verified on two accounts → ADR-041.
- [ ] **Lawyer & partner-bank brief** — drafted 9 Nov 2026 (Claude Doc "Xspeeria: brief for the lawyer and the partner bank"). *You*: review and send.

## 2b. Outside needs — not possible yet (recorded 18 Oct 2026)

- [ ] **Partner bank** — escrow and payouts: API documents, test (sandbox) access, webhook security details, settlement and reconciliation files, signed agreement. Unblocks real money movement. The pretend bank (ADR-037) follows our own Banking spec; the real contract may differ.
- [ ] **Partner webhook secrets** — stored in a secret manager per partner, with rotation (the pretend bank uses a random one per run).
- [ ] **Licensing (Decision 4)** — legal opinion on CBN licence or approval for this model, and for the UK, US and Canada (the launch corridors, ADR-043 and ADR-100).
- [ ] **ID checks (KYC) and anti-money-laundering** — provider chosen: **Didit** (ADR-039, server built). Still needed: a Didit account and workflow (ID + liveness + face match + AML), its data processing agreement, NIN/BVN support (ask Didit), and a compliance officer to own the rules.
- [ ] **SMS and email provider accounts:** an SMS provider once chosen; the Resend account and its sending domain.
- [x] **Lawyer: does the CBN data-localisation circular (15 June 2026) cover Xspeeria?** — **Yes** (owner, 3 Nov 2026, DEC-096). Payment data and backups stay in Nigeria from 1 Jan 2027; a hosting region abroad (e.g. AWS Cape Town) is ruled out for it. **Lawyer, 3 Nov 2026:** third-party payouts are acceptable under AML rules (DEC-097), and Didit, Resend and photo storage (Cloudflare R2) may hold data abroad (DEC-098); the vendors' data-processing agreements are still to be signed.
- [ ] **Hosting, in Nigeria** (DEC-096) — a Nigerian cloud, or the AWS Lagos Local Zone; cloud account (database, servers; separate test and live), domain name, secret manager. Then move staff and advert photos from the local folder (`LOCAL_PHOTO_DIR`) to the private Cloudflare R2 bucket (ADR-049).
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
- [x] **Shared rate limiter** — built in the database (ADR-080, 2 Nov 2026). Still to do with hosting: a trusted-proxy setting for client addresses. (ADR-025 §4)
- [ ] **With hosting: HTTPS only (ADR-093).** The load balancer serves HTTPS only, redirects plain HTTP, and keeps the `Strict-Transport-Security` header the API sends. Check: `curl -sI https://<api address>/health`.
- [ ] **Expo `glob`/`minimatch` advisories (ADR-093):** upgrade Expo when a release picks up `glob` ≥ 14.0.2 and `minimatch` ≥ 11.0.1 (the weekly report shows it).
- [ ] **Secret manager** (key rotation tools are built: ADR-076, PR #95) for `JWT_SECRET_KEY`, `MFA_ENCRYPTION_KEY` and `BENEFICIARY_ENCRYPTION_KEY`; KMS-managed keys for payout account numbers (backend spec). (SEC-026/027)
- [x] **Database row-level security** as a second layer of permission checks — built (ADR-078, PR #96). At deployment: the app's database login must not be a superuser or have `BYPASSRLS`.
- [x] **PIN reset flow** — built: SMS code + face check or email code (ADR-046, ADR-054; `test_second_check_api.py`). (Checked 2026-10-27.)
- [x] **Support's procedure** for a customer who can't pass the face check — approved 9 Nov 2026 (Claude Doc "Support procedure: customer can't pass the face check"). Locked-out customers use "Need help?" on the log-in screen and Support replies through it (built, ADR-103).
- [x] **"Redo identity check" button** — built 9 Nov 2026 (ADR-104): Compliance asks in the console; the next new-phone log-in takes a full identity check; the same ID counts at once, a different one waits for two staff.
- [ ] **Didit: which face is used after a redo** — NOT VERIFIED (docs silent; sandbox stores no face). *You*: ask Didit support, or approve one real check in the live account (about $0.46: identity check $0.33 + face check $0.13).
- [ ] **China: is person-to-person yuan exchange allowed?** *You*: ask the lawyer. China is built but stays switched off (`CHINA_ENABLED=false`) until then. Also check the PBOC USD/CNY figure (6.7167, 10 Nov 2026, from a news report) before switching on. (ADR-105)
- [ ] **Germany, France, China: partner banks and Didit.** *You*: confirm Didit's workflow accepts German, French and Chinese IDs, and that a euro partner bank pays euro IBANs in other euro countries (SEPA). (ADR-105)
- [x] **Email address verification** — built: sign-up needs the email code before any session (ADR-054). A real email provider is still needed (§2). (Checked 2026-10-27.)
- [x] **Step-up on sensitive actions** — built: payout accounts, choosing payouts, taking offers, PIN and contact changes (`STEP_UP_ACTIONS`). The 24-hour hold was removed by the owner (DEC-044). (Checked 2026-10-27.)
- [x] **Fraud plan replacing the 24-hour hold** — decided 9 Nov 2026: the new-phone face check and the "this wasn't me" freeze, plus the alerts and deal holds already built; no further checks before launch (FX-03, §2).
- [ ] **Connect a real SMS and email provider** once chosen — *Build* (only developer senders exist).
- [x] **Super Admin hardware security key** — built (ADR-081, 2 Nov 2026). *You:* buy two keys (e.g. YubiKey) per Super Admin; register them on the live console; then `SUPER_ADMIN_KEY_REQUIRED=true`.
- [x] **Background worker and a first load test** — built (ADR-085, 3 Nov 2026). *With hosting:* set `RUN_BACKGROUND_JOBS=false` on the web servers and run one `python -m app.worker`; set `DB_POOL_SIZE`/`DB_MAX_OVERFLOW`; run the load test again on the real servers.
- [x] **Database login (ADR-085 finding)** — decided and built (ADR-094, 3 Nov 2026): the server logs in as `xspeeria_app`; grants completed (migration 0042). *With hosting:* two logins — owner for migrations, `xspeeria_app` for the API and worker.
- [ ] **Decide at hosting:** the trusted-proxy setting (the per-address limit itself was fixed: ADR-087).
- [ ] **Backups with a recorded restore** — *Build*, after hosting. (SEC-030) The "pause all deals" switch and "sign everyone out" are built (ADR-075, PR #94).
- [ ] **Deployment basics:** separate environments, deploy pipeline and a disaster-recovery runbook. (SEC-033 to SEC-039) Done already: SBOM in CI (ADR-077), operations alerts and the incident plan (ADR-074).
- [ ] **Independent penetration test** before launch. (SEC-040)
- [ ] **Rule to keep:** screenshots of the development build show demo balances — never use them in marketing, investor, partner or regulator material. (ADR-023 §3)

## 4b. Buildable now, no outside party needed (added 2 Nov 2026)

- [x] **Delete account** — built (ADR-095, 3 Nov 2026): closes at once, 14 days to restore by logging in, clean-up after 14 days, legal records kept 5 years for Compliance only (DEC-106). *Lawyer:* confirm the 5 years and keeping ID images. *Later (first due 2031):* the job that removes personal details after 5 years. *With live accounts:* ask Didit, Resend and photo storage to delete what isn't needed.
- [x] **Super Admin hardware security key** (ADR-051 Decision 2). Done (ADR-081).
- [x] **Shared rate limiter** (database-backed) — readiness H-1. Done (ADR-080).
- [x] **"This wasn't me" security emails** — built (ADR-084, 2 Nov 2026): an email for every log-in, account change, payout account change and deal step; the link freezes the account; a Super Admin reactivates it. *You:* set `PUBLIC_API_URL` to the live API's https address (needed in production).
- [x] **Resend email sender** — built (ADR-082). *You:* create the Resend account, verify the sending domain, then set `RESEND_API_KEY` and `EMAIL_FROM` (steps in ADR-082).
- [x] **Release-build settings** — built (ADR-090, 3 Nov 2026): profiles, bundle ID, store listing draft. *You:* confirm the bundle ID `com.xspeeria.app` (permanent once uploaded), supply a square app icon, approve the listing texts.
- [ ] **First release build on a real phone (ADR-096)** — *You:* on your Expo account, set `EXPO_PUBLIC_API_URL` to the test server's `https://` address for the `preview` profile, then `eas build --profile preview --platform android` and install the APK. Needs the test server (VM2) running.
- [x] **Release builds run against the server** — built 3 Nov 2026 (ADR-096): a release build with an `https://` server address runs the app; demo-only screens never show. What is left is the line above: a real build needs your Expo account and an `https://` test server (after hosting).

## 5. Housekeeping

- [x] Close PR #19 without merging: its 2FA server work already reached `main` through later PRs (ADR-026). (Checked 2026-10-27.)
- [x] Old branches deleted on GitHub by the owner, 9 Nov 2026: `fix/security-review-findings`, `feat/backend-auth-slice`, `feat/auth-1-server`, `feat/auth-2-two-factor`.
