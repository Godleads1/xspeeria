# XSPEERIA DOCUMENT INDEX

## Purpose

This document defines the authoritative documentation map for the Xspeeria repository.

Claude Code must use this index to locate requirements, determine document authority, identify conflicts, and trace implementation decisions.

Documentation is not proof of implementation.

Implementation is not proof of correctness.

Verification requires evidence.

---

# 1. GLOBAL AUTHORITY ORDER

Unless a more specific authority rule is defined below, use the following order:

1. `CLAUDE.md`
2. Explicit human-approved architecture and engineering decisions
3. `DOCUMENT_INDEX.md`
4. `docs/00-source-of-truth/`
5. Domain-specific authoritative documents under `docs/`
6. Supporting documents under `docs/`
7. `reference/`
8. Existing implementation

Existing code is evidence of implementation, not proof of requirements.

If authoritative documents materially conflict and this index does not resolve the conflict:

`STOP — DOCUMENT CONFLICT REQUIRES HUMAN DECISION`

Never silently choose between conflicting authoritative requirements.

## 1.1 Primary-versus-Primary Conflict Rule

Several documents are designated PRIMARY, each for its own domain. The authority order above does not rank two primaries against each other. When two or more PRIMARY documents materially conflict on the same subject:

1. **Do not choose.** Rank 1 (`CLAUDE.md`) and rank 2 (human-approved decisions) are the only sources that can resolve it. If neither addresses the conflict, stop and report it.
2. **Check rank 2 first.** An approved architecture decision, recorded as an ADR under `docs/adr/`, resolves the conflict for every document it names. Approved ADRs sit at rank 2 and override all PRIMARY documents on the specific subject they decide, and only on that subject.
3. **Identify the safety-bearing document.** Where a conflict concerns money, custody, authorization, or personal data, the document that imposes the *stricter* constraint is the working assumption until a human decides — never the more permissive one. This is a holding position for reporting, not a licence to proceed.
4. **Domain adjacency does not confer authority.** A document being PRIMARY for its own domain does not make it authoritative for a neighbouring domain merely because it mentions it. A banking specification describing settlement states is not thereby authoritative over the financial specification's state model.
5. **Report the conflict with evidence:** each document, its designated authority, the exact section, the conflicting text, and the material consequence of choosing each side.

### Resolved primary-versus-primary conflicts

| Subject | Conflicting primaries | Resolution |
|---|---|---|
| Transaction/settlement state model | `docs/05-financial/Appendix_D_...v1.1.md` §5 · `docs/03-architecture/Xspeeria_Master_Prompt_Python_Backend.md` §8 · `docs/06-banking/07_Banking_Integration_Specification_v1.1.md` §4.3 · `docs/04-api-data/05_API_Contract_Data_Dictionary.md` Settlement/Transaction entities · `docs/03-architecture/02_Technical_Design_Specification.md` §10 | **ADR-001 (DEC-003), approved 2026-08-18** — `docs/adr/001-transaction-state-machine.md` |
| Financial event and accounting-ledger model | `docs/05-financial/Appendix_D_...v1.1.md` §7/§14 · `docs/04-api-data/05_API_Contract_Data_Dictionary.md` entities · `docs/03-architecture/Xspeeria_Master_Prompt_Python_Backend.md` §7 · `docs/03-architecture/02_Technical_Design_Specification.md` §6 | **ADR-002 (DEC-004), approved 2026-08-18** — `docs/adr/002-financial-event-ledger-architecture.md` |
| Application brand primary and mobile bottom navigation | `PRODUCT.md` Brand Commitments (B) · `docs/09-ui-ux/DESIGN_SYSTEM.md` · `docs/13-governance/CORRECTIONS_v3.md` §9.1 · `docs/02-product/04_Product_Design_Specification.md` colour tables | **ADR-003 (DEC-005, DEC-006), approved 2026-10-16** — `docs/adr/003-brand-primary-and-bottom-navigation.md` |
| Home screen layout | `docs/09-ui-ux/UI_UX_SCREEN_SPEC.md` § Home Screen · Figma Home frame `39:2882` | **ADR-004 (DEC-008), approved 2026-10-16** — `docs/adr/004-home-screen-layout.md` |
| Mobile Market screen | `docs/09-ui-ux/Xspeeria_UIUX_AppFlow_Spec_v2.md` § Marketplace · Figma Market frames `79:399`, `94:557`, `436:7771`, `106:1150` | **ADR-005 (DEC-011), approved 2026-10-17** — `docs/adr/005-market-screen.md` |

---

# 1.2 ARCHITECTURE DECISION RECORDS

`docs/adr/`

Approved ADRs are human-approved architecture decisions and sit at **rank 2** of the global authority order — above `DOCUMENT_INDEX.md` and above every document under `docs/`.

An ADR is authoritative only for the subject it decides. It does not extend to adjacent subjects by implication, and it does not override `CLAUDE.md`.

An ADR marked `PROPOSED` carries no authority. Only `APPROVED` ADRs bind. Superseding an approved ADR requires a new ADR and explicit human approval.

**Citation convention — numbering collision.** `docs/03-architecture/02_Technical_Design_Specification.md` §15 contains its own TDS-internal ADR-001 … ADR-006, whose numbering is independent of and collides with this register. Cite **repository ADRs by path** (`docs/adr/001-…`) and **TDS-internal ADRs as `TDS ADR-00N`**. A bare `ADR-00N` is ambiguous and must not be used. Where the two conflict on the same subject, the repository ADR governs, per rank 2 of the authority order.

| ADR | Subject | Status |
|---|---|---|
| `001-transaction-state-machine.md` | Canonical transaction/settlement state machine (DEC-003) | **APPROVED** — 2026-08-18 |
| `002-financial-event-ledger-architecture.md` | Financial event acceptance and accounting-ledger architecture (DEC-004) | **APPROVED** — 2026-08-18 |
| `003-brand-primary-and-bottom-navigation.md` | Mobile bottom navigation (DEC-005) and application brand primary `#001A6E` (DEC-006) | **APPROVED** — 2026-10-16 |
| `004-home-screen-layout.md` | Home screen layout: Figma Home with a best-rate hero (DEC-008) | **APPROVED** — 2026-10-16 |
| `005-market-screen.md` | Market tab (Figma Buy/Sell) and Select Match (DEC-011) | **APPROVED** — 2026-10-17 |
| `006-history-screens.md` | History list and transaction receipt (DEC-012) | **APPROVED** — 2026-10-17 |
| `007-profile-screens.md` | Profile menu and Account details (DEC-013) | **APPROVED** — 2026-10-17 |
| `008-two-factor-authentication.md` | Two-factor authentication: passkey/authenticator, no SMS, step-up, recovery (DEC-014; resolves the MFA part of Open Decision 2) | **APPROVED** — 2026-10-17 |
| `009-referral-reward.md` | Referral reward: 10% off the coordination fee for both people; count, not earnings (DEC-015) | **APPROVED** — 2026-10-17 |
| `010-dark-mode.md` | Dark mode: Switch Mode toggles a dark scheme for every screen; `brand.fill` role; rules for future screens (DEC-016) | **APPROVED** — 2026-10-17 |
| `011-profile-editing.md` | Profile editing: photo/banner; phone & email changed only after a code to the new address + 2FA; date of birth via ID review (DEC-017) | **APPROVED** — 2026-10-17 |
| `012-cards-preview.md` | Cards tab as a preview of the Figma design with "Create yours" (cards not available); no balances or card transactions (DEC-018) | **APPROVED** — 2026-10-17 |
| `013-onboarding-and-login.md` | Onboarding and log-in from Figma in demo mode; protected routes; PIN rules; no account enumeration (DEC-019) | **APPROVED** — 2026-10-17 |
| `014-confirm-trade-flow.md` | Confirm-trade flow: confirm sheet + 2FA, transaction in progress, completed + rating, trades in History; demo bank (DEC-020) | **APPROVED** — 2026-10-17 |
| `015-sell-flow.md` | Sell flow: offer matches, green actions, seller fee in sent currency (to be confirmed), sell receipt in Figma layout (DEC-021) | **APPROVED** — 2026-10-17 |
| `016-new-location-region-kyc.md` | New-location prompt and US identity check (SSN, ID document, selfie) with pending region; demo trigger (DEC-022) | **APPROVED** — 2026-10-17 |
| `017-npm-audit-time-limited-exceptions.md` | npm audit gate: high threshold kept; exact-advisory exceptions, max 31 days, enforced by `scripts/check_npm_audit.py` (DEC-023) | **APPROVED** — 2026-10-17 |
| `018-security-review-remediation.md` | Independent security/QA/financial review: DEMO_MODE from the build, per-user data cleared on log-out, TOTP single-use, strict money input; two rounding/partial-fill conflicts open (DEC-024) | **APPROVED** — 2026-10-17 |
| `019-review-decisions-and-multi-offer-fill.md` | High-severity release rule relaxed with risk acceptance (C1); rounding half to even; one request filled from several listings, each part explicit (DEC-025) | **APPROVED** — 2026-10-17 |
| `020-official-rate-ceiling.md` | The official rate is the reference ceiling: `0 < rate ≤ official rate`, hard block above, no floor; source/cadence still open (DEC-026) | **APPROVED** — 2026-10-17 |
| `021-percentage-fee-and-split-payouts.md` | Coordination fee = 1% of what each side sends (supersedes the flat fee in Business Plan §5 / BRS-04 / CORRECTIONS_v3 §2); per-trade 5-minute windows; payouts split across own accounts, paid by the partner bank, confirmation to both sides (DEC-027) | **APPROVED** — 2026-10-17 |
| `022-payout-destination-welcome-location.md` | Payout Destination (own-name accounts, last 4 only, 24-hour hold for new accounts, no balance wording), Welcome slides with corrected claims, location → country only for KYC region (DEC-028) | **APPROVED** — 2026-10-18 |
| `023-figma-exact-home-cards-demo.md` | Exact Figma Home and Cards in development builds: Figma's balance, card figures and transactions as "Demo" display text, gated on DEMO_MODE (release builds unchanged); no "Create yours"; narrow exception to the on-screen no-balance rule (DEC-029) | **APPROVED** — 2026-10-18 |
| `024-session-pin-sms-limits.md` | Decision 2 (part): 5-minute idle lock, 7-day maximum session, 6-digit PIN, SMS codes capped at 5/hour and 10/day per phone (server-enforced) (DEC-030) | **APPROVED** — 2026-10-18 |
| `025-auth-1-server-sign-in.md` | Decision 2 resolved (Argon2id PIN hashing, request limits, recovery, S-2 server-side permission checks, S-3 individual accounts, in-house auth, F-16 logging rule); contract API names + verify-phone; authorizes Milestone AUTH-1 (DEC-031) | **APPROVED** — 2026-10-18 |
| `026-auth-2-two-factor.md` | Server 2FA: required at sign-up, TOTP (encrypted, single-use codes), recovery codes, 30-day trusted devices, single-use 5-minute step-up, 5-wrong-codes lock, 24-hour payout hold; authorizes Milestone AUTH-2 (DEC-032) | **APPROVED** — 2026-10-18 |
| `027-app-server-connection.md` | App connected to the server sign-in and 2FA (development builds): reordered sign-up (phone → email → PIN → SMS code → authenticator), local-only developer SMS, secure token storage, 4-minute keep-alive (DEC-033) | **APPROVED** — 2026-10-18 |
| `028-cd3-enforcement-and-milestone-4-1c.md` | GATE 4.1B-CD3 built: triggers refuse UPDATE/DELETE/TRUNCATE on currency definitions, non-owning runtime role `xspeeria_app`, no routine downgrade; authorizes Milestone 4.1C (offers); "records with amounts are information, not money" (DEC-034) | **APPROVED** — 2026-10-18 |
| `029-milestone-4-1c-offers.md` | Milestone 4.1C offers: publish (24-hour `Idempotency-Key`), marketplace listings, edit rate, withdraw; minimum ₦10,000 / 10 USD·GBP·EUR; no expiry; KYC refused except local-only dev bypass; ratifies `VAL_422_RATE_ABOVE_CEILING`; resolves idempotency TTL (DEC-035) | **APPROVED** — 2026-10-18 |
| `030-app-market-server-offers.md` | App Market in server mode: real listings, Create Offer publishes (one Idempotency-Key per offer), My Offers with withdraw; buy requests and taking offers say "coming soon"; offer routes no longer share the sign-in limit (DEC-036) | **PROPOSED** — 2026-10-18 |
| `031-milestone-4-1d-accept-and-match.md` | Milestone 4.1D: `POST /offers/{id}/accept` creates a Match (information, not money) under the offer row lock with 24-hour idempotency and a `trade.accept` authenticator approval; minimum or exact rest; Match only (no Transaction yet); 60 market requests a minute per user (DEC-037) | **APPROVED** — 2026-10-18 |
| `032-app-take-offer.md` | App: Take offer screen — fresh offer read, amount (Take all), authenticator code → step-up → accept with one Idempotency-Key per take; Deal recorded screen (DEC-038) | **PROPOSED** — 2026-10-18 |
| `033-app-my-deals.md` | App: My Deals (Market ⋮ and after a take) — deals from both sides with exact naira total, fixed rate, date, and what comes next (DEC-039) | **PROPOSED** — 2026-10-18 |
| `034-app-two-factor-settings.md` | App: 2FA settings on the server — new recovery codes and replacing the authenticator, each after a server-checked code; replacement ends trust everywhere and holds payouts 24 h (DEC-040) | **PROPOSED** — 2026-10-18 |
| `035-milestone-4-1e-payout-accounts-and-preparation.md` | Milestone 4.1E: own payout accounts (sealed number, last 4 only, pretend bank check local-only), per-deal choice with exact split, 30-minute window → `funding_ready` or expiry returning the amount to the offer; resolves Standing Standards §15 row 9 (DEC-041) | **APPROVED** — 2026-10-18 (details in §4 PROPOSED) |
| `036-app-payout-accounts.md` | App: payout accounts (last 4 only, add/remove with a code) and choosing them per deal with exact split and time left; My Deals shows each deal's step (DEC-042) | **PROPOSED** — 2026-10-18 |
| `037-milestone-4-1f-escrow-simulation.md` | Milestone 4.1F: escrow steps with a pretend partner bank only (local) — two domestic legs, amount + 1% in, signed partner messages as the only money facts, 5-minute funding window, failed deal refunded in full incl. fee, release once, 24-hour payout hold respected; migration 0009; no ledger; sets U-1/U-2 for the simulation (DEC-043); payouts immediate, 24-hour hold of ADR-008/022 removed (DEC-044) | **APPROVED** — 2026-10-19 (simulation only; details in §4 PROPOSED) |
| `038-app-escrow-steps.md` | App: escrow steps on a deal — amount + 1% fee + total, the bank's escrow details, 5-minute countdown, steps ticked from bank-confirmed states, "Simulate my transfer" only with the pretend bank; 24-hour hold wording removed (DEC-045) | **PROPOSED** — 2026-10-19 |
| `039-kyc-1-didit-identity-checks.md` | Milestone KYC-1: Didit identity checks — hosted ID + selfie capture, signed results, server re-checks ID/liveness/face/sanctions and 18+, no ID images stored, market needs an approved check; migration 0010 (DEC-046) | **APPROVED** — 2026-10-19 (details in §4 PROPOSED) |
| `040-app-identity-check.md` | App: identity check screen — Figma heading, opens Didit's hosted check (https only), re-checks the server on return, plain words per status; Market offers it on AUTH_403_KYC_REQUIRED (DEC-047) | **PROPOSED** — 2026-10-19 |
| `041-kyc-one-person-one-account.md` | One verified account per person — an approval matching a person already verified on another account (keyed hash of the ID document, or a Didit face/document match) is held for review, not approved; `KYC_IDENTITY_KEY`; migration 0011 (DEC-048) | **APPROVED** — 2026-10-19 (rule; mechanism PROPOSED) |
| `042-new-country-identity-check.md` | Identity checks per country (NG, GB, US): a deal needs verification in the country you pay from; proof is an ID issued by that country; new country suggested from a trusted proxy header and confirmed by the user; same person on one account (name/DOB match); migration 0012 (DEC-049) | **APPROVED** — 2026-10-19 (rules; server build PROPOSED) |
| `043-mvp-corridors-uk-and-us.md` | MVP corridors are Nigeria ⇄ UK **and** Nigeria ⇄ US (US moved from Year 2); Business Plan §8 and PRD carry a pointer (DEC-050) | **APPROVED** — 2026-10-19 |
| `044-notifications-n1-in-app.md` | Notifications N-1 (server): messages recorded in the same transaction as identity results, offer taken and each escrow phase (both parties); once per fact; ids only, words in the app; list/mark read; 404 for others' (contract deviation); N-2 app built (bell badge, notification centre, Figma-style banner); N-3 push (Expo + FCM/APNs) and N-4 email (Resend) / SMS next; migration 0013 (DEC-051) | **APPROVED** — 2026-10-19 (scope; details PROPOSED) |
| `045-app-remaining-screens.md` | App: connecting the remaining demo screens — part 1: signed-in and trusted devices; part 2: History and Home from real deals; per-country identity check, new-location prompt from the server's suggestion, approved regions from the server (DEC-052) | **PROPOSED** — 2026-10-19 |
| `046-pin-change-and-reset.md` | Change PIN (current PIN + authenticator approval; other devices signed out) and Forgot PIN (SMS code + authenticator or recovery code; every device signed out); codes carry a purpose; migration 0014 (DEC-053) | **PROPOSED** — 2026-10-19 |
| `047-phone-number-change.md` | Phone number change: approval, code to the new number bound to the user, then the change (409 if another account has it); email changes only through Support; date of birth and legal name come from the verified ID (DEC-054) | **PROPOSED** — 2026-10-19 |
| `048-biometric-unlock.md` | Face ID/fingerprint unlock after the 5-minute idle lock (server builds): per-session key behind the biometric prompt, trusted devices only, never past 7 days, wrong key ends the session (DEC-055) | **PROPOSED** — 2026-10-19 |
| `049-profile-images-cloudflare-r2.md` | Profile photo and banner in a private Cloudflare R2 bucket with server-issued upload links; supersedes the Firebase Storage answer (DEC-056) | **APPROVED (vendor)**, design PROPOSED — 2026-10-19 |
| `050-support-through-disputes-referral-on-hold.md` | Support tickets run through the admin Disputes module; referral on hold until reward rules are given (DEC-057) | **APPROVED** — 2026-10-19 |
| `051-admin-console-decisions.md` | Admin console scope: email-code staff 2FA (hardware key for Super Admin before live money), escrow float as a record not revenue, one approver never on own request, Cards/Adverts hidden, disputes from app and staff, Figma corrections (DEC-058) | **APPROVED** — 2026-10-19 |
| `052-notifications-n3-phone-push.md` | Phone push via Expo (FCM/APNs): token bound to the signed-in session, each notification pushed once while fresh, no personal details on the lock screen, `PUSH_ENABLED` switch (DEC-059) | **PROPOSED** — 2026-10-19 |
| `053-app-languages.md` | App in seven languages (English UK/US, French, Arabic right to left, Spanish, Chinese Simplified, Portuguese): English sentences as keys, picker on sign-in and Profile, legal texts English-only, native review before launch (DEC-060) | **PROPOSED** — 2026-10-19 |
| `054-face-check-replaces-authenticator.md` | Face check (live selfie vs KYC photo) replaces the authenticator app as the second check after KYC; SMS + email codes before KYC; email alerts; paying in from another person's account not allowed (owner, 2026-10-20) (DEC-061) | **APPROVED** — 2026-10-20; Decision 1 **IMPLEMENTED** (server + app, migration 0017); Decision 2: not allowed |
| `055-identity-details-from-the-id-check.md` | Name, date of birth and gender shown on the profile come from the approved ID check (gender stored as M/F, shown only to the user); no sample person in server builds (DEC-062) | **APPROVED** — 2026-10-20; **IMPLEMENTED** (migration 0018) |
| `056-buy-requests-adverts-cards.md` | Buy requests built as offers paying naira (R5-9 resolved for the app; part-fills allowed); advert placeholder stays until the web admin sets adverts; demo card stays, real cards need an issuing partner (DEC-063) | **APPROVED** — 2026-10-20; buy requests **IMPLEMENTED** |
| `057-disputes-and-support-cases.md` | Disputes on deals with escrow (DISPUTE hold freezes release and timeout), support cases without a deal, private per-party messages, files later (DEC-064) | **APPROVED** — 2026-10-20; **IMPLEMENTED** (migration 0019); staff side with the admin console |
| `058-verification-tiers-and-limits.md` | Tiers 0–3 limit trading (naira equivalent per day/month: ₦500k/₦2m, ₦5m/₦20m, ₦20m/₦100m), BVN and proof of address for higher tiers; AI rate forecasting scope (DEC-065) | **APPROVED** — 2026-10-20; limits built 2026-10-26 (Tiers 0–1); BVN, address, proof-of-address and source-of-funds checks built 2026-10-26 (Tiers 2–3) |
| `059-market-search-queue-edit-multicurrency.md` | Home market search (sort: best rate, newest, oldest, amount; filters: currency, rate range, amount, status); location rule (hide listings selling your own country's currency); edit offers before any part is taken; payment extension and 3-person waiting queue; buy requests in up to 5 currencies (DEC-066) | **APPROVED** — 2026-10-21; corrected 2026-10-26 (status filter Available now / Success); built 2026-10-26 |
| `060-admin-staff-accounts-roles-audit.md` | Admin console staff (ADR-051 A-1): separate staff accounts, password + email code, httpOnly SameSite=Strict session cookie (15 min idle, 8 h max), per-module role permissions with no self-escalation, built-in TDS §11.2 roles, authorization matrix, append-only audit log, first Super Admin by command line; console screens: log-in, set password, staff, roles, audit log, profile; staff phone (required) and photo (no metadata, never in the database); console in the seven app languages with Arabic right to left, six-box email code, Password Changed toast; My profile (staff change only their own name and phone), bell with empty Notification panel (DEC-067) | **IMPLEMENTED** — server and console screens 2026-10-26; A-3 not built |
| `061-admin-analytics-dashboard.md` | Admin Analytics Dashboard: real figures only (no sample tiles), Cards hidden, Adverts later with advert upload, escrow as a record not revenue, real corridors, Lagos calendar periods compared with the period before, CSV/PDF export; `dashboard.read` checked on the server (DEC-068) | **IMPLEMENTED** — 2026-10-26 |
| `063-admin-disputes.md` | Admin Dispute Resolution: staff-managed dispute categories (start with the app's four; app shows the active list), 24-hour SLA, list/case/raise for a customer, reply/assign/escalate, close with an outcome (ends the escrow pause, never moves money; refunds via reversals), migration 0026 (DEC-070) | **IMPLEMENTED** — 2026-10-26 |
| `064-admin-dark-mode-dashboard-design.md` | Admin console dark mode (Light/Dark/System, DEC-016 colours, no-flash boot script — needs a CSP hash later) and the owner-approved dashboard redesign: greeting banner, template-written "Today at a glance" (labelled not AI) with non-blocking streaming text, tiles with trend lines from new read-only server series, status and corridor donuts, ranked corridors (DEC-071) | **IMPLEMENTED** — 2026-10-26 |
| `065-admin-reversals.md` | Reversals: "Process Refund" on a dispute asks; a different staff member approves (never your own request: server, DB CHECK, console); only money still in escrow goes back to whoever paid it in, in full; a REVERSAL hold pauses the payout meanwhile; closure reason REVERSED; fixes ADR-063 re-check after a hold closes; migration 0027 (DEC-072) | **IMPLEMENTED** — 2026-10-26 |
| `066-service-outage-notices.md` | Service outage notices: staff report an outage (service, message, severity, start, expected end); every signed-in app user sees it on Home until resolved; nothing is blocked; outages.read/create/update; migration 0028 (DEC-073) | **IMPLEMENTED** — 2026-10-26 |
| `067-adverts-in-app-slot.md` | Adverts: staff upload a picture (JPEG/PNG/WebP, the 342×113 slot shape, hidden details removed, object store not PostgreSQL), dates and an https link; everyone sees the one showing now on the Market screen; new `adverts` permission module (Super Admin); migration 0029 (DEC-074) | **IMPLEMENTED** — 2026-10-26 |
| `068-fraud-management.md` | Fraud Management: simple rules over Xspeeria's own data (PIN and sign-in code lock-outs, 3+ disputes against one person in 30 days, payout account in another name) plus staff reports; raised once per thing; work and resolve (confirmed or false alarm); an alert never blocks by itself; migration 0030 (DEC-075) | **IMPLEMENTED** — 2026-10-26 |
| `069-identity-check-review.md` | Staff review of identity checks: checks Xspeeria holds (duplicate, mismatch, incomplete) are approved by two people (recommend + confirm by someone else) or rejected by one with a reason the customer reads; Didit's own reviews stay in Didit's console; held approvals keep their identity facts; migration 0031 (DEC-076) | **IMPLEMENTED** — 2026-10-27 |
| `070-staff-bell-notifications.md` | Staff bell: work waiting for the signed-in person, read live from the queues and limited to what their role can act on (held identity checks, refunds and checks waiting for a second person, open fraud alerts, new disputes); never your own requests; count = new since you last opened it; background checks don't keep an idle session alive; migration 0032 (DEC-077) | **IMPLEMENTED** — 2026-10-27 |
| `062-customer-suspend-close.md` | Admin Users: customer list and counts; Suspend (temporary: logged out, offers leave the market, deals keep settling), Reactivate, Close (for good, phone and email stay taken); Super Admin only with a reason, audit-logged; migration 0025 (DEC-069) | **IMPLEMENTED** — 2026-10-26 |
| `071-app-choose-country-to-verify.md` | App: "Verify your identity" asks which country you will pay from (Nigeria, UK, US) with each one's status from the server, then opens that country's check; Account details offers "Verify another country" (DEC-078) | **IMPLEMENTED** — 2026-10-27 |
| `072-api-monitoring-system-health.md` | API monitoring: every API counted and timed per minute (our own routes by template, webhooks, every outside system: Didit, push, SMS, email, bank), background jobs, escrow queues and the database on a System Health page; warnings in plain words; counts and timings only; Super Admin only; 30 days; migration 0033 (DEC-079) | **IMPLEMENTED** — 2026-10-27 |
| `073-customer-activity-log-deal-timeline.md` | Customer activity log and deal timeline: every customer change and sign-in step recorded by route template (no body, no secrets), merged with staff actions about them; deals found by the reference customers see, with every step from offer to payout; append-only, kept 5 years; Super Admin only; migration 0034 (DEC-080) | **IMPLEMENTED** — 2026-10-27 |
| `074-ops-alerts-incident-plan.md` | Operations alerts for Super Admins (sign-in attacks, staff access changes, unusual deals, money at risk, webhook, API, service, job and escrow failures; P1–P4; one live alert per condition; acknowledge and resolve with a note; P1/P2 emailed once an email provider exists); Sentry wired in but off, strictly scrubbed; incident response plan; migration 0036 (DEC-081) | **IMPLEMENTED** — 2026-11-01 (plan documented, not yet exercised) |
| `075-emergency-controls.md` | Emergency controls for Super Admins: pause all deals with the clocks frozen (no new offers, takes or payout choices; bank commands held; open windows get the paused time back on resume, recorded on each deal) and sign everyone out; reason required, audited, P1 alert; migration 0037 (DEC-082) | **IMPLEMENTED** — 2026-11-02 |
| `076-key-rotation.md` | Key rotation: `app.cli.rotate_keys beneficiary` re-seals payout account numbers from the previous key to the new one (dry run, idempotent, fails closed on unreadable rows); `KYC_IDENTITY_KEY_PREVIOUS` keeps duplicate detection working across an identity-key change (DEC-083) | **IMPLEMENTED** — 2026-11-02 |
| `077-sbom-health-console-csp.md` | CycloneDX SBOMs (Python and npm) built and kept on every CI run; `/health` answers status only; the admin console gets a per-page nonce script policy (`script-src 'self' 'nonce-…' 'strict-dynamic'`) (DEC-084) | **IMPLEMENTED** — 2026-11-02 |
| `078-row-level-security.md` | Row-level security as the second lock (readiness H-3): every transaction tells PostgreSQL its scope (`system`, or `user` + the signed-in customer, transaction-local); forced policies on customers' private tables (sign-in, second checks, identity checks, payout accounts, notifications, …); no scope sees nothing; shared deal tables listed with reasons; migration 0038 (DEC-085) | **IMPLEMENTED** — 2026-11-02 |
| `079-exposure-hardening.md` | Only a named list of routes works without a login (test-enforced); API started with `python -m app.serve` (no `server: uvicorn` header); validation errors no longer name the validator; throwaway email domains refused at sign-up (public CC0 list, pinned); existing account lockout + per-address limits recorded (DEC-086) | **IMPLEMENTED** — 2026-11-02 |
| `080-shared-rate-limits.md` | Shared rate limits in PostgreSQL (readiness H-1): every limit counted in `rate_limit_hits` whenever a database is set, so all servers share counts and restarts forget nothing; same limits; own transaction + advisory lock per key; keys stored only as SHA-256; hourly clean-up; migration 0039 (DEC-087) | **IMPLEMENTED** — 2026-11-02 |
| `081-super-admin-security-keys.md` | Super Admin hardware security keys (WebAuthn/FIDO2): password → email code → touch the key; single-use 5-minute challenges, copied-key and look-alike-site refusal; `SUPER_ADMIN_KEY_REQUIRED` (compulsory in production; key-setup-only session until a key is added); lost key removed by another Super Admin or a server command, audited and alerted; migration 0040 (DEC-088) | **IMPLEMENTED** — 2026-11-02 |
| `082-resend-email-sender.md` | Email through Resend (ADR-044 provider): codes, "was this you?" alerts and operations alerts; on only with `RESEND_API_KEY` + `EMAIL_FROM` (verified domain); plain text, no links; one retry with the same idempotency key, never a duplicate; nothing logged (DEC-089) | **IMPLEMENTED** — 2026-11-02 (off until set up) |
| `083-third-party-payouts-and-confirmation.md` | Payouts may go to anyone's account (owner, DEC-007 resolved), e.g. a school's; adding an account is confirmed twice (the typed details, then the bank's holder name, with "No, remove it"); the deal payout choice shows holder names and asks "Check who will be paid"; the name-mismatch fraud alert now fires only for a new account used within 24 hours; Banking spec §3.3 amended for payout accounts (DEC-090) | **IMPLEMENTED** — 2026-11-02 |
| `084-not-me-security-emails.md` | An email for every log-in, account change, payout account change and deal step, each with a one-time "this wasn't me" link (7 days, hash only stored); opening it changes nothing; its button freezes the account at once (suspended, sessions and trusted phones ended, unreleased deals held, high fraud alert, confirmation email); a Super Admin's Reactivate lifts the holds; amends ADR-082 (one link allowed) and ADR-054 (DEC-091) | **IMPLEMENTED** — 2026-11-02 (emails once Resend is set up) |
| `085-background-worker-and-load-test.md` | Background jobs can run in one worker (`python -m app.worker`, web servers with `RUN_BACKGROUND_JOBS=false` still report and watch the alert rules); `DB_POOL_SIZE`/`DB_MAX_OVERFLOW`; a repeatable load test and its first results (2-core sandbox: fast to about 50 customers at once, ~18 ms server CPU per request, database not the limit, no oversold offers); fixed: taking an offer was refused under the row rules; findings on the app role's grants and shared mobile addresses (DEC-093) | **IMPLEMENTED** — 2026-11-03 |
| `086-advert-rotation.md` | Several adverts take turns in the Market advert slot (owner): every advert switched on and inside its dates, newest first, at most 10; the app slides every 5 seconds, swipe by hand, a touch pauses, never slides with Reduce motion; `GET /api/v1/adverts/showing`; the console shows each turn and "Waiting for a free place"; amends ADR-067 (DEC-094) | **IMPLEMENTED** — 2026-11-03 |
| `087-rate-limits-shared-addresses.md` | Many Nigerian phones share one network address (owner: "split limits"): the per-address limit applies only before sign-in and is raised from 10 to 60/min; signed-in account routes are limited per customer (60/min); the 5-wrong-PIN lockout stays; a test keeps each route in the right list; amends ADR-025 §1.2 (DEC-095) | **IMPLEMENTED** — 2026-11-03 |
| `088-readiness-check.md` | `GET /health/ready` for the load balancer: 200 "ready" only when the database answers within 2 s, else 503 "not_ready"; says nothing else; answer kept 1 s per process; `/health` stays liveness only (DEC-099) | **IMPLEMENTED** — 2026-11-03 |
| `091-cheaper-requests.md` | Fewer database steps per request: the session idle clock is written at most every 30 s (no row lock), a rate-limit check is one statement; ~12–18% less CPU, 3 fewer SQL statements per signed-in request; lighter logging middleware tried and dropped (DEC-102) | **IMPLEMENTED** — 2026-11-03 |

### Accounting policy is not architecture

ADR-002 establishes **architectural requirements** for the accounting ledger — double entry, append-only history, per-currency balancing, immutable source-event reference, exact money representation, compensating corrections, posting-rule versioning, reconciliation and suspense capability, deterministic replay.

It does **not** establish accounting policy. The chart of accounts, revenue recognition, exposure recognition, loss recognition, recovery accounting, receivable/payable treatment, memorandum escrow accounting, reporting currency and FX accounting treatment are **NOT APPROVED** and remain owned by Finance, Accounting, Legal, Compliance, Product and Banking Partner as applicable.

**No accounting-policy determination may become normative through examples, sample schemas, comments, tests, seed data or implementation defaults.** Where such a determination is required, state `HUMAN / LEGAL / COMPLIANCE VERIFICATION REQUIRED` and the owning function, and proceed no further on that path.

---

# 2. BUSINESS SOURCE OF TRUTH

## Primary

`docs/00-source-of-truth/00_5-Year_Business_Plan_SOURCE_OF_TRUTH.md`

Use for:

- company vision
- business model
- strategic objectives
- target markets
- corridor strategy
- commercial strategy
- partner strategy
- growth assumptions
- long-term business direction

Financial forecasts, targets, market assumptions, and projections must not be represented as verified actual performance unless evidence establishes that status.

---

# 3. BUSINESS REQUIREMENTS

## Primary

`docs/01-business/01_Business_Requirements_Specification.md`

Use for:

- business capabilities
- business rules
- functional objectives
- stakeholder requirements
- operating requirements
- business constraints

Business requirements do not override the approved technical architecture where the requirement itself is technology-independent.

---

# 4. PRODUCT

## Primary

`docs/02-product/04_Product_Design_Specification.md`

## Supporting

`docs/02-product/PRODUCT_REQUIREMENTS_DOCUMENT.md`

Use for:

- product capabilities
- personas
- journeys
- workflows
- feature requirements
- expected user behavior
- product states
- acceptance intent

If these documents materially disagree about product behavior, report the conflict.

---

# 5. AUTHORITATIVE BACKEND ARCHITECTURE

## Human-approved architecture decision

The authoritative Xspeeria backend stack is:

- Python
- FastAPI
- PostgreSQL
- SQLAlchemy
- Pydantic
- Redis where required
- Background workers/jobs where required
- Containerized deployment where required

## Primary backend engineering specification

`docs/03-architecture/Xspeeria_Master_Prompt_Python_Backend.md`

## Supporting architecture specifications

`docs/03-architecture/02_Technical_Design_Specification.md`

`docs/03-architecture/ARCHITECTURE.md`

### Backend conflict rule

If a supporting, legacy, governance, product, or reference document proposes:

- Node.js as the Xspeeria backend
- Express
- NestJS
- Supabase as the authoritative application backend
- another conflicting backend framework

that technology choice is not authoritative.

Preserve technology-independent:

- business requirements
- product requirements
- API behavior
- data requirements
- security requirements
- financial invariants
- UX requirements
- operational requirements

Do not automatically carry the conflicting backend implementation choice into the Python/FastAPI architecture.

Frontend JavaScript/TypeScript is not prohibited.

Any future change to the authoritative backend stack requires explicit human approval.

---

# 6. API AND DATA

## Primary

`docs/04-api-data/05_API_Contract_Data_Dictionary.md`

## Supporting

`docs/04-api-data/API_DATA_DICTIONARY.md`

Use for:

- API contracts
- request structures
- response structures
- domain entities
- field definitions
- validation requirements
- data relationships
- API semantics

Implementation must conform to the approved Python/FastAPI backend architecture.

Never invent undocumented provider APIs.

---

# 7. FINANCIAL CORRECTNESS

## Primary

`docs/05-financial/Appendix_D_Financial_Correctness_Settlement_Specification_Xspeeria_v1.1.md`

This document is mandatory for implementation affecting:

- money
- currency
- rates
- fees
- transactions
- settlement
- reconciliation
- reversals
- retries
- transaction states
- financial audit trails

The canonical transaction/settlement state model is defined by **ADR-001** (`docs/adr/001-transaction-state-machine.md`), which supersedes the state vocabulary in this document's Section 5 and in every other document under `docs/`. Appendix D's financial *principles* remain authoritative and unchanged.

Non-negotiable engineering principles include:

- no binary floating point for authoritative monetary state
- use appropriate decimal/fixed precision
- server-side financial validation
- explicit transaction states
- controlled state transitions
- idempotency where applicable, keyed to include `leg_id` for any settlement-scoped operation
- duplicate/retry handling
- reconciliation, which never rewrites financial state
- auditability
- separation of financial facts, workflow state, compliance holds, disputes and reconciliation exceptions

Financial implementation must be independently reviewed before production readiness can be claimed.

---

# 8. BANKING AND PAYMENT INTEGRATIONS

## Primary

`docs/06-banking/07_Banking_Integration_Specification_v1.1.md`

Use for:

- banking integration architecture
- settlement provider interaction
- payment-provider interaction
- provider credentials
- outbound requests
- inbound webhooks
- signatures
- retries
- idempotency
- reconciliation
- provider downtime
- duplicate events
- out-of-order events
- failure handling

External providers must be treated as untrusted external systems.

Never invent provider behavior.

Production integration details require evidence from actual provider documentation and approved credentials/configuration.

---

# 9. SECURITY

## Mandatory Security Baseline

`docs/07-security/Xspeeria_Security_Master_Audit.md`

This document is mandatory for all security-sensitive implementation.

**Extended by** `docs/07-security/XSPEERIA_ENTERPRISE_SECURITY_STANDARD.md` (product owner, 2026-10-17): 40 requirements (SEC-001–SEC-040) mapped to OWASP ASVS 5.0.0, MASVS v2, API Security Top 10 and NIST SSDF; Xspeeria financial requirements FX-01–FX-05; release gates. Where the two differ, the stricter applies until a human decides (open item C1). Current state per requirement: `docs/07-security/SECURITY_EVIDENCE_REGISTER.md`. Incident response plan (SEC-038): `docs/07-security/INCIDENT_RESPONSE_PLAN.md`. Review reports: `docs/07-security/reviews/`.

Use for:

- authentication
- authorization
- tenant/user isolation
- database security
- RLS where applicable
- API security
- input validation
- rate limiting
- CORS
- CSRF where applicable
- XSS
- secrets
- webhooks
- file uploads
- storage
- dependency security
- business-logic abuse
- financial security
- privileged operations
- infrastructure security
- privacy
- logging
- monitoring
- incident readiness
- AI/LLM security where applicable

Security requirements must be verified against actual implementation evidence.

Never claim a control exists merely because it is documented.

---

# 10. COMPLIANCE

## Primary

`docs/08-compliance/03_Compliance_Operations_Manual_v1.1.md`

Use for documented operational requirements involving:

- KYC
- AML/CFT
- sanctions controls
- transaction monitoring
- privacy
- records
- escalation
- compliance operations

Claude must not invent regulatory requirements, licence status, legal conclusions, or compliance certifications.

Where professional validation is required, state:

`HUMAN / LEGAL / COMPLIANCE VERIFICATION REQUIRED`

Xspeeria must not be represented as holding a financial licence unless authoritative evidence establishes that status.

Where required, use:

`Subject to applicable licensing and regulatory approval.`

---

# 2A. CANONICAL DOMAIN GLOSSARY

**HUMAN APPROVED, 2026-08-22.** Authoritative mapping between canonical **conceptual** terminology
and existing **persisted/API** terminology. Product and UI documentation may use the conceptual
term freely; it never implies a separate table, route or entity.

**No table, route, endpoint or entity is renamed by this mapping.**

| Conceptual term | Persisted / API term | Meaning |
|---|---|---|
| **MatchAllocation** | **`Match`** | One accepted partial or full allocation of one Offer by one counterparty. One Offer carries **0..n**. Each is an independent settlement failure domain |
| **KycCase** | **`KYCCases`** | The onboarding/review case lifecycle. Canonical for onboarding and review history |
| **BeneficiaryAccount** | **`BENEFICIARIES`** | Reusable profile-level payout destination, `User → 0..n` |
| **Offer** | `Offer` | Parent matching intent. `original_amount = matched_amount + remaining_amount`; remaining is **derived** |
| **Settlement / SettlementLeg** | same | ADR-001, unchanged. Exactly two legs per settlement |
| **PayoutExecution** | `PayoutExecution` | Child payout record beneath one leg. **Never an additional leg** |
| **CorridorConfig / JurisdictionProfile** | *(configuration schemas)* | Versioned configuration and policy interfaces — **not runtime-editable persisted entities yet** |
| **MfaFactor** | *(none yet)* | Conceptual `User → MfaFactor 0..n`. Persistence and policy **OPEN — Decision 2** |

Two structural notes:

- **`Match` is extended, not renamed.** There is **no** second `MatchAllocation` table or entity.
- **`KYC_PROFILES`** in `02_Technical_Design_Specification.md` §5, if retained, is a **summary /
  projection / current-profile representation** — **not** a competing canonical case lifecycle.

Canonical relationship chain, unchanged where ADR-001 governs:

```
Offer → Match (0..n) → Transaction (1, match_id UNIQUE) → Settlement (1)
      → SettlementLeg (exactly 2) → PayoutExecution (0..n)
```

---

# 11. UI / UX

## Primary visual source of truth — application UI/UX

The **Xspeeria Figma** (`docs/references/figma/Xspeeria.fig` — human-provided design source,
**untracked pending a versioning decision**). Human authority, 2026-08-22. Where a document in this
section disagrees with the Figma on a **visual** matter (colour, surface, spacing, visual
hierarchy), the Figma governs. The documents below remain authoritative for screen behaviour,
flows, states, interaction detail and accessibility requirements that the Figma does not settle.

Two limits on that authority:

- The Figma contains **painted swatches, not a bound token/variable system**. Xspeeria therefore has
  **no production design-token system**, and none may be claimed. Observed values are recorded as
  **FIGMA-OBSERVED COLOURS / CANDIDATE APPLICATION TOKENS** until human approval freezes them.
- The Figma is **not** the authority for **logo/brand-asset colours**, which remain open pending
  confirmation against the original vector — see `PRODUCT.md` “Brand Commitments”.

Observed palette, the Figma Success-swatch label defect, and measured WCAG contrast findings are
recorded in `docs/09-ui-ux/DESIGN_SYSTEM.md`.

## Application flow

`docs/09-ui-ux/Xspeeria_UIUX_AppFlow_Spec_v2.md`

## Screen specification

`docs/09-ui-ux/UI_UX_SCREEN_SPEC.md`

## Design system — normative token authority

`docs/09-ui-ux/DESIGN_SYSTEM.md`

Authoritative for the application colour direction, the semantic token architecture
(PRIMITIVE → SEMANTIC → COMPONENT), status-family roles, border roles, primary interaction
states, the gold restriction, and the legacy-name mapping. **HUMAN APPROVED, 2026-08-22.**
Where another UI/UX document states a colour value or token role that conflicts with it, this
document governs. Values are **candidate production tokens, not frozen**, and no application
code exists — **IMPLEMENTATION STATUS: NOT IMPLEMENTED**. Typography is a **PARTIAL FREEZE**:
**Inter is HUMAN APPROVED as the financial/numeric face**; brand/UI typography remains **OPEN**
with Satoshi the leading candidate and **not** production-approved; Nunito Sans is **not** an
Xspeeria production standard.

## Design bible

`docs/09-ui-ux/xspeeria-design-bible.md`

Use for:

- application flows
- navigation
- screen behavior
- component behavior
- loading states
- empty states
- error states
- success states
- accessibility
- responsive behavior
- visual consistency
- design tokens
- interaction patterns

Frontend controls must never be treated as authoritative security controls.

Authorization must be enforced server-side.

---

# 12. INFRASTRUCTURE AND DEVOPS

## Primary

`docs/10-infrastructure/06_Infrastructure_DevOps_Handbook.md`

Use for:

- environments
- infrastructure
- deployment
- CI/CD
- secrets management
- logging
- monitoring
- observability
- backups
- disaster recovery
- rollback
- operational readiness

Production deployment requires explicit human approval.

---

# 13. INVESTOR MATERIAL

## Reference

`docs/12-investor/08_Investor_Board_Strategy_Book_v1.1.md`

Use for:

- investor narrative
- board strategy
- strategic communication
- fundraising context

Investor material does not override engineering, financial, security, banking, or compliance specifications.

Claims in investor material must not automatically be treated as verified implementation facts.

---

# 14. GOVERNANCE AND EXECUTION

## Corrections

`docs/13-governance/CORRECTIONS_v3.md`

Corrections must be reviewed when older documentation appears inconsistent.

## Execution Manual

`docs/13-governance/EXECUTION_MANUAL.md`

Use for approved execution processes where they do not conflict with higher-authority requirements.

## Legacy Production Master Prompt

`docs/13-governance/MASTER PROMPT #U2014 BUILD XSPEERIA MVP (PRODUCTION).md`

This document is retained as governance/legacy implementation material.

It is NOT authoritative for backend technology selection where it conflicts with the human-approved Python/FastAPI architecture.

Valid technology-independent requirements may still be extracted from it.

Do not delete or silently ignore it.

Report material conflicts.

## Testing locally with demo data

`docs/TEST_FROM_START_TO_FINISH.md`

Owner request 2026-10-27. `app.cli.seed_demo` adds demo customers, demo staff, pretend escrow banks and offers. `TEST_LIMITS_DEV` raises the sign-in limits. The app's browser version runs at localhost:8081. Everything is refused unless `APP_ENV=local`.

## Production Readiness Review (2026-10-27)

`docs/13-governance/PRODUCTION_READINESS_REVIEW_2026-10-27.md`

Release gate result: **DO NOT LAUNCH**. It lists the critical blockers (partner bank, licence, hosting, backups, SMS/email, monitoring, independent test) and the order to fix them. It is an AI-run review, so it does not replace SEC-040. Repeat the review before any pilot.

## Launch planning (2026-11-02)

Prepared for owner decisions. Nothing in them is chosen or built.

- `docs/07-security/ON_CALL_GUIDE.md`: who answers alerts (on call: **Chinedu Egbuchulam**, named 2026-11-02), response times by level, first five minutes, hand-over. Backup: **Oluwaseun Adesanya** (named 2026-11-03).
- `docs/13-governance/HOSTING_OPTIONS_2026-11.md`: what Xspeeria needs from a host. Covers the **CBN circular of 15 June 2026** (payment data stored in Nigeria from 1 January 2027), a Nigerian cloud vs the AWS Lagos Local Zone vs own servers, and the questions to ask providers and the lawyer.
- `docs/13-governance/FRAUD_OPTIONS_2026-11.md`: seven checks that could replace the removed 24-hour payout hold (FX-03), with a suggested starting set.
- `docs/07-security/PENETRATION_TEST_BRIEF.md`: scope, priorities, rules and deliverables for the independent test (SEC-040).
- `docs/13-governance/GITHUB_MAIN_PROTECTION.md`: the exact ruleset for `main` once the GitHub plan is upgraded (SEC-031).

---

# 15. REFERENCE MATERIAL

`reference/`

Reference material exists for:

- archival sources
- converted source documents
- original documentation
- comparison
- traceability

Reference material does not automatically override authoritative documents under `docs/`.

If an authoritative Markdown document materially differs from its reference source:

1. identify the difference;
2. determine whether the difference is intentional;
3. report material conflicts;
4. do not silently rewrite either document;
5. request human approval where necessary.

---

# 16. IMPLEMENTATION EVIDENCE

Existing source code is evidence of what has been implemented.

It is not automatically evidence of what should have been implemented.

When code conflicts with authoritative requirements:

- identify the conflict
- determine affected execution paths
- assess security/financial impact
- propose remediation
- do not silently redefine the requirement to match the code

---

# 17. EVIDENCE STATES

Use these states consistently:

### DOCUMENTED

A requirement or control exists in authoritative documentation.

### IMPLEMENTED

Repository evidence shows implementation exists.

### VERIFIED

Implementation has been inspected and appropriate evidence/tests support the claim.

### UNKNOWN — NOT VERIFIED

Available evidence is insufficient.

### DOCUMENTED BUT NOT IMPLEMENTED

Documentation requires the capability but implementation evidence is absent.

### IMPLEMENTED BUT NOT DOCUMENTED

Implementation exists without corresponding authoritative documentation.

### CONTRADICTION

Two materially relevant sources disagree.

Documentation is not implementation.

Implementation is not verification.

---

# 18. DOCUMENT-NOT-FOUND PROTOCOL

Before declaring a required Xspeeria document missing:

1. Search `docs/` recursively.
2. Search `reference/` recursively.
3. Check filename variations.
4. Check capitalization differences.
5. Check Markdown conversions of source DOCX/PDF documents.
6. Check `DOCUMENT_INDEX.md`.

If still missing, report:

`DOCUMENT NOT FOUND`

Include:

- requested document/path
- locations searched
- similar files discovered
- impact of the missing document
- whether work can safely continue

Never fabricate missing content.

---

# 19. REQUIREMENT TRACEABILITY

Before implementing a material feature, Claude should be able to trace:

BUSINESS REQUIREMENT  
→ PRODUCT REQUIREMENT  
→ ARCHITECTURE  
→ DATA  
→ API  
→ SECURITY CONTROL  
→ FINANCIAL CONTROL, IF APPLICABLE  
→ UI/UX  
→ TEST  
→ OBSERVABILITY  
→ DOCUMENTATION

If a critical link cannot be established:

`UNKNOWN — NOT VERIFIED`

Do not invent the missing requirement.

---

# 20. RELEASE AUTHORITY

Documentation alone can never establish production readiness.

Production readiness requires evidence for:

- requirements
- implementation
- architecture
- security
- authorization
- financial integrity
- tests
- dependencies
- migrations
- monitoring
- logging
- backups
- recovery
- rollback
- documentation
- unresolved risks

The final release gate must use the Xspeeria production-readiness process.