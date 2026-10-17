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

## 2. Recorded deviations

| Figma | Implementation | Why |
|---|---|---|
| "Jeremiah Philips", photo avatar | "David Peters", initials avatar | One mock person across Home and Profile; no profile photos yet |
| Coloured 3D icons per row | Navy line glyphs in a soft circle | The icon artwork could not be exported; swap in exports when available |
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
| Destination list = every country (Afghanistan, Albania, … incl. "Antarctica — XCD") | Only documented corridors: Nigeria (NGN), United Kingdom (GBP) selectable; United States (USD) shown as "Coming in Year 2" | **Doc conflict, conservative choice:** PRD "First Corridor" and Banking spec v1.1 allow payouts only via licensed domestic partners in the NGN⇄GBP pilot and NGN⇄USD Year 2 corridors; a world list would offer unsupported and sanctioned destinations. Adding countries needs a product + compliance decision |

## 3. Open items

- Manage Beneficiaries is mock-only: delete affects the on-screen list, and "+" says the
  add flow is next. **Saving or paying out to a third party's account depends on DEC-007**
  (legal/partner-bank confirmation); the add flow must also verify account name with the
  bank server-side, never trust a client-entered name.
- Rows other than Account details and Manage Beneficiaries explain they are coming next. Planned order: Security,
  KYC and limits, Manage Beneficiaries (payout accounts; third-party payouts per DEC-007
  pending legal/partner-bank confirmation), Contact Support, FAQ, Terms and Conditions.
- **Referral Program (Figma `1041:11976`) needs a product decision before it is built:**
  its copy promises "a 10% bonus on your next currency exchange" and shows "Total Earnings
  $0". The business plan sets a flat coordination fee (not a percentage), and the app may
  show no stored balance; a referral reward has to be defined in those terms first.
- Gender is displayed because Figma shows it; whether it is collected at all is a KYC/
  privacy decision (data minimisation) to confirm.
