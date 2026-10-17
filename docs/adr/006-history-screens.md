# ADR-006 — History List and Transaction Receipt

| Attribute | Value |
|---|---|
| **Status** | **APPROVED** |
| **Date** | 2026-10-17 |
| **Decision ID** | DEC-012 |
| **Authority** | Product owner: "follow the Figma mobile design strictly" (ADR-003 §1.3) and "let's do the history", 2026-10-17 — `DOCUMENT_INDEX.md` §1 rank 2 |

---

## 1. Decision

The History tab follows the Figma frames (file `5ayAjPFxxHmEQIrEjauHTB`):

- **Transaction History** (`342:6121`): title and ⋮, start/end date fields, and rows —
  flag, "You bought **500 USD**", "Rate - NGN 1,257/USD", date (DD/MM/YYYY). Newest first.
- **Receipt** (`344:6152`), opened by tapping a row: a ticket with status, reference, the
  NGN ⇄ foreign corridor, amount and rate; transaction details; settlement (payout)
  accounts; and transaction progress.

## 2. Corrections to the Figma content (recorded, not silent)

| Figma | Implementation | Why |
|---|---|---|
| 500 USD at 1,257 → Transaction Amount 125,900 NGN | 628,500.00 NGN | The Figma figures do not add up; amounts are computed in integers |
| Transaction Fee 1,259 NGN (1%) | **Coordination Fee 375.00 NGN**, flat | Business plan §5 / BRS ASSUMPTION-BRS-04: a flat coordination fee, not a percentage (₦375 is the plan's illustrative figure) |
| Full account numbers (e.g. 0783989633) | Bank name + `•••• 9633` | Full account numbers are never shown or held in the app (security baseline) |
| "TRANSACTION SUCESSFUL", "Refrence" | "SUCCESSFUL", "Reference" | Typo correction |
| Progress shows one step | All stages: accepted → escrow opened → you funded → counterparty funded → payout accounts → released → paid out | Mapped onto ADR-001 leg states; reached stages show a time |
| Receipt as a sheet with no close control | Back control top-left | Android has no swipe-to-dismiss on this presentation |
| Date fields with a calendar picker | Tapping a field opens an in-app calendar sheet (month/year navigation; end can't precede start; Clear date) | Pure JS, styled like the app's sheets — no native date-picker module, so no rebuild |

For **sell** trades the receipt shows the NGN the seller receives and no NGN-side fee:
who pays the fee on each side is a business decision still open (BRS §11), so none is
assumed.

## 3. Open items

- The History **⋮ menu** follows the product owner's Figma reference: **Contact support** and **Download Statement**, each explaining it is coming until its screen exists. **Block card** is omitted: Cards is COMING SOON and the approved spec forbids exposing any card functionality until it ships — add it back with the Cards feature.
- All data is mock (`mobile/src/features/history/data.ts`). Third-party payout accounts
  (DEC-007) remain subject to legal/partner-bank confirmation.
