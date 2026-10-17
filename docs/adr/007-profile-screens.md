# ADR-007 — Profile Menu and Account Details

| Attribute | Value |
|---|---|
| **Status** | **APPROVED** |
| **Date** | 2026-10-17 |
| **Decision ID** | DEC-013 |
| **Authority** | Product owner: "follow the Figma mobile design strictly" (ADR-003 §1.3) and "let's do the profile", 2026-10-17 — `DOCUMENT_INDEX.md` §1 rank 2 |

---

## 1. Decision

- **Profile** (`268:6134`): avatar, name and "Account details" ›; rows for Manage
  Beneficiaries, KYC and limits, Security, FAQ, Contact Support, Referral Program, Terms and
  Conditions; the Switch Mode row; red **Delete Profile**.
- **Account details** (`1041:11224`): grey band, large avatar, public handle and rating,
  a card of personal details, and **KYC approved regions** with Approved/Pending pills.

- **Manage Beneficiaries** (Profile → Manage Beneficiaries, amendment A1, 2026-10-17): back
  + title, "Search name", currency chips All · USD · NGN · GBP · GHS, saved payout accounts
  (initials avatar with a flag badge, name, account, bank, delete) and a navy "+" button.
- **Select Destination Country** ("+" on Manage Beneficiaries, amendment A2, 2026-10-17):
  back + "Manage Beneficiaries", heading, helper text, "Search country", and rows of round
  flag · country · currency code.
- **Account Details** (after choosing a country, amendment A3, 2026-10-17): outlined
  fields with notched labels and a navy "Add Beneficiary" button. A new beneficiary is
  saved as **Awaiting bank verification** until the partner's account-name inquiry
  confirms it (Banking spec v1.1 §3.3; `BENEFICIARIES.validation_state`).
- **KYC and limits** (amendment A4, 2026-10-17): a card per tier with "Tier N",
  "Limit: X Naira per month", required documents, and a "Current Level" pill or a navy
  "Upgrade" button. Adds token `brand.tint` (`navy100 #CBD2EA`) for the pill.
- **Security** (amendment A5, 2026-10-17): Change Password ›, 2 FA authentication ›, and
  a working **Allow Screenshot** switch (default on, as in Figma). Turning it off blocks
  screenshots and screen recording app-wide via `expo-screen-capture` (`~57.0.0`, in Expo
  Go; a new EAS dev build is needed for the custom client). In memory only for now. It is a
  privacy convenience, never a security control.
- **Change Password** (Security → Change Password, amendment A6, 2026-10-17): three
  masked outlined fields (old, new, confirm) and a navy "Change password" button. Client
  checks only: required, confirmation matches, new differs from old. Passwords stay in
  component state, are never logged or stored, and are cleared on submit. With no backend,
  submit says the password has not been changed.
- **FAQ** (amendment A7, 2026-10-17): "How can we help you?", keyword search, topic cards
  (Getting Started, How to Sell, Payments) that filter the list, "Top Questions" with
  "View all", and expandable question cards. Adds token `brand.secondarySurface`
  (`blue50 #EFF6FF`) and line icons hexagon, dollar, minus.
- **Referral Program** (amendment A8, 2026-10-17): illustration, "Refer a friend, get 10%
  off!", referral code with Copy, a "Friends joined" count box, and "Invite Friends" (system
  share sheet). Reward per ADR-009.
- **Terms and Conditions** (amendment A9, 2026-10-17): scrollable document with bold title
  block, numbered sections, sub-headings and bullets; the contact email opens the mail app.
  Text transcribed verbatim from Figma (`src/features/legal/privacyPolicy.ts`).

## 2. Recorded deviations

| Figma | Implementation | Why |
|---|---|---|
| "Jeremiah Philips", photo avatar | "David Peters", initials avatar | One mock person across Home and Profile; no profile photos yet |
| Coloured 3D icons per row | Original colour icons in the same style (`src/components/menuIcons.tsx`: gradients, highlight, ground shadow), one per row | The Figma artwork could not be exported (view-only); product owner chose "create yours instead", 2026-10-17. Ours, so no third-party licence needed |
| FAQ subtitle "Get support or send feedback" (duplicate of Contact Support) | "Find answers to common questions" | Placeholder correction |
| Working Light/Dark switch | Switch shown **disabled**, subtitle "Dark mode is coming soon" | No dark palette exists yet; a switch that did nothing would mislead |
| Delete Profile (one tap) | Confirmation dialog that explains consequences; nothing is deleted yet | Irreversible action; account closure must handle open trades and legal record retention |
| Phone "+238938383838" | `+234 803 838 3838` | Placeholder correction (Nigerian format) |
| Beneficiary account "920298299309" in full | `•••• 9309` (last 4 only; the device never holds the full number) | Security rule: never show or store full bank account numbers on the client |
| Chip label "GHC" | "GHS" | The Ghana cedi's ISO 4217 code is GHS (GHC was retired in 2007) |
| Trash icon deletes on tap | Confirmation dialog (Cancel / Delete) | Destructive action |
| One US-format form for every country (Routing Number, Bank Name, Account Number, Account Type) | US form kept for USD; Nigeria = Bank Name + 10-digit NUBAN account number; UK = Sort Code + Bank Name + 8-digit account number | Routing numbers and checking/savings types do not exist in NGN/GBP banking |
| Fifth field "Account Type * — enter" (duplicate label) | Read-only **Account Name — "Confirmed by your bank"**, plus "You can only add accounts in your own name" | Banking spec §3.3: the holder name comes from the partner's name inquiry and must match the KYC legal name; it is never typed by the user |
| Full account number held by the app | Only the last 4 digits kept on the device; full number to be sent once to the server, stored as tokenised `account_ref` (API Data Dictionary, BENEFICIARIES) | Security rule; no backend yet, so the full number is discarded |
| Security row "Hide Balance" (toggle) | **Omitted** | Xspeeria is wallet-less and never shows a stored balance (design bible, no-balance rule enforced by `no-balance.test.ts`); the toggle would imply one exists |
| Change Password / 2FA open working flows | Change Password form built (A6) without any length/complexity rule; 2FA built to ADR-008 (DEC-014) | Password, MFA and session specifics are **Open Decision 2** (Standing Standards §15); MFA is required to transact (§7.7), so 2FA will not be optional once built |
| FAQ: "How to create a account?" … "Tradebase account"; other questions lorem ipsum | Ten questions written from approved docs (`src/features/faq/data.ts`); "Tradebase" → "Xspeeria"; grammar fixed | Placeholder/product-name slip. Answers avoid unapproved figures and claims: no fee amount (business plan says reconfirm before publishing), no "licensed" claim, no settlement-window length. **Needs Legal/Compliance review before release** |
| Referral: "10% bonus on your next currency exchange"; "Total Earnings $0" | "10% off the coordination fee on your next exchange"; "Friends joined 0" | ADR-009: discount on Xspeeria's fee only; no earnings or balance shown |
| Referral 3D illustration | Original SVG illustration in the same style (two figures, paper plane) | Artwork not exportable (view-only); ours, no licence needed |
| Destination list = every country (Afghanistan, Albania, … incl. "Antarctica — XCD") | Only documented corridors: Nigeria (NGN), United Kingdom (GBP) selectable; United States (USD) shown as "Coming in Year 2" | **Doc conflict, conservative choice:** PRD "First Corridor" and Banking spec v1.1 allow payouts only via licensed domestic partners in the NGN⇄GBP pilot and NGN⇄USD Year 2 corridors; a world list would offer unsupported and sanctioned destinations. Adding countries needs a product + compliance decision |

## 3. Open items

- Manage Beneficiaries is mock-only: delete affects the on-screen list, and "+" says the
  add flow is next. **Saving or paying out to a third party's account depends on DEC-007**
  (legal/partner-bank confirmation); the add flow must also verify account name with the
  bank server-side, never trust a client-entered name.
- Rows other than Account details and Manage Beneficiaries explain they are coming next. Planned order: Security,
  KYC and limits, Manage Beneficiaries (payout accounts; third-party payouts per DEC-007
  pending legal/partner-bank confirmation), Contact Support, FAQ, Terms and Conditions.
- **Referral Program — RESOLVED by ADR-009 (DEC-015), built as amendment A8.** Original note:
  its copy promises "a 10% bonus on your next currency exchange" and shows "Total Earnings
  $0". The business plan sets a flat coordination fee (not a percentage), and the app may
  show no stored balance; a referral reward has to be defined in those terms first.
- **KYC tier limits and requirements are PLACEHOLDERS, not approved values.** The figures
  (₦50,000 / ₦100,000 / ₦150,000 per month) and the identical document list on every tier
  come from Figma. The Compliance Operations Manual (ASSUMPTION-COM-01, §3) says tier
  thresholds are set by Compliance and Risk before go-live, and CDD requires photo ID,
  liveness and verified contact details. Open questions for the product owner/Compliance:
  the real limit per tier (and whether limits are per month or per rolling window), what
  each tier requires, and whether the pilot also needs a GBP-side limit. Limits must be
  enforced server-side; the app only displays them.
- "Upgrade" is shown only on tiers above the user's current tier (Figma shows it on both
  higher tiers); it explains that higher-tier verification is coming next.
- Gender is displayed because Figma shows it; whether it is collected at all is a KYC/
  privacy decision (data minimisation) to confirm.

## 4. Terms and Conditions text — DRAFT, needs Legal review before release

The Figma text is the product owner's and is shown verbatim. These points conflict with
approved docs or are unverified claims (CLAUDE.md: never invent compliance claims):

1. **Wrong document.** The "Terms and Conditions" page contains a *Privacy Policy*. No Terms
   of Service text exists yet.
2. **Dates.** Effective 1 Oct 2025 is later than Last Updated 1 Aug 2025.
3. **"We comply with … GDPR, CCPA, NDPR, PIPEDA".** Unverified compliance claim. Nigeria's
   NDPR has been largely superseded by the Nigeria Data Protection Act 2023; whether CCPA or
   PIPEDA apply depends on corridors and entities (pilot is NGN⇄GBP).
4. **"Licensed financial partners worldwide" / "Licensed Escrow & Settlement Partners".**
   The Banking spec v1.1 §11 says no licence or partner agreement may be implied as held;
   corridors are NGN⇄GBP then NGN⇄USD, not worldwide.
5. **"Registered in Canada and Nigeria, with technology development in the UK".** Company
   facts for Legal to confirm.
6. **"AI rate optimization".** Xspeeria does not set rates (users do; no spread, Business
   Plan §5). Remove or explain.
7. **"Biometric verification".** Special-category data under UK GDPR; needs a stated legal
   basis and the KYC provider named once chosen.
8. **TLS 1.3, AES-256, "GDPR-compliant data centers in the EU".** Hosting and encryption
   choices are not decided; do not publish as fact.
9. **Retention 5 / 7 years.** The Compliance Operations Manual marks retention periods as
   assumptions needing sign-off.
10. **"Binding corporate rules with our partners".** BCRs apply within a corporate group, not
    with outside partners.
11. **Cookies / "browser settings".** The mobile app uses no browser cookies; this section
    fits the website only.
12. **"[Data Protection Contact Email]"** is an unfilled placeholder.
13. **Phone "+234701399012"** has 9 digits after +234; Nigerian numbers have 10. It is not
    made tappable until corrected.
