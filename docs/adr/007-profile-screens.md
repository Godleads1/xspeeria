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

## 2. Recorded deviations

| Figma | Implementation | Why |
|---|---|---|
| "Jeremiah Philips", photo avatar | "David Peters", initials avatar | One mock person across Home and Profile; no profile photos yet |
| Coloured 3D icons per row | Navy line glyphs in a soft circle | The icon artwork could not be exported; swap in exports when available |
| FAQ subtitle "Get support or send feedback" (duplicate of Contact Support) | "Find answers to common questions" | Placeholder correction |
| Working Light/Dark switch | Switch shown **disabled**, subtitle "Dark mode is coming soon" | No dark palette exists yet; a switch that did nothing would mislead |
| Delete Profile (one tap) | Confirmation dialog that explains consequences; nothing is deleted yet | Irreversible action; account closure must handle open trades and legal record retention |
| Phone "+238938383838" | `+234 803 838 3838` | Placeholder correction (Nigerian format) |

## 3. Open items

- Rows other than Account details explain they are coming next. Planned order: Security,
  KYC and limits, Manage Beneficiaries (payout accounts; third-party payouts per DEC-007
  pending legal/partner-bank confirmation), Contact Support, FAQ, Terms and Conditions.
- **Referral Program (Figma `1041:11976`) needs a product decision before it is built:**
  its copy promises "a 10% bonus on your next currency exchange" and shows "Total Earnings
  $0". The business plan sets a flat coordination fee (not a percentage), and the app may
  show no stored balance; a referral reward has to be defined in those terms first.
- Gender is displayed because Figma shows it; whether it is collected at all is a KYC/
  privacy decision (data minimisation) to confirm.
