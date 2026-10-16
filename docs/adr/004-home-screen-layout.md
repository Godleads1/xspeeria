# ADR-004 — Home Screen Layout (Figma Home with a Best-Rate Hero)

| Attribute | Value |
|---|---|
| **Status** | **APPROVED** |
| **Date** | 2026-10-16 |
| **Decision ID** | DEC-008 |
| **Amends** | `docs/09-ui-ux/UI_UX_SCREEN_SPEC.md` § Home Screen (header, primary action, activity sections) |
| **Keeps** | The no-balance rule and Account Readiness from the same spec, unchanged |
| **Authority** | Human decision by the product owner, 2026-10-16 — `DOCUMENT_INDEX.md` §1 rank 2 |

---

## 1. Context

The only Home design in Figma (file `5ayAjPFxxHmEQIrEjauHTB`, node `39:2882`) shows an
"Available Balance" card. Xspeeria is wallet-less and non-custodial, so a balance is
forbidden (`UI_UX_SCREEN_SPEC.md`, enforced by `mobile/__tests__/no-balance.test.ts`). The
product owner chose to replace the balance card with a **best rate today** card and,
given the spec's warning that a large single figure in the hero reads as a balance,
approved the layout below.

## 2. Decision

Home, top to bottom:

1. **Header (Figma):** avatar, "Welcome" and the user's name, help and notification
   buttons. Initials replace the photo until profile photos exist.
2. **Best-rate card:** label "Best NGN → USD rate today"; the rate is always written with
   both currencies — `1 USD = 1,603.78 NGN` — never as a lone number; a "Trade now"
   button routes to the Marketplace. This is Home's single primary action.
3. **Account Readiness:** unchanged from the spec. Absent from the Figma frame but kept,
   because it is the only route to the steps a user must finish before trading.
4. **Current market rates (Figma):** corridor and NGN price per unit. The Figma gold
   stars are omitted: gold is reserved for decorative rating indicators.
5. **Recent transactions (Figma):** swap glyph, corridor, amount, status chip, date, a
   next action where one exists, and "View all" to History. Currency swaps only — the
   Figma "Shopping" row is dropped while Cards is COMING SOON.

## 3. Recorded deviations from Figma

| Figma | Implementation | Why |
|---|---|---|
| Balance card, black with texture image | Best-rate card on `color.brand.primary` | No balance may exist; the texture image could not be exported |
| Chip and contactless glyphs on the card | Omitted | They imply a payment card |
| Photo avatar | Initials on brand fill | No profile photos yet |
| Three rates repeat 1,190.47 | Distinct mock values | Placeholder correction (allowed) |
| Gold stars on rates | Omitted | Gold reserved for ratings |
| "Shopping" transaction | Omitted | Cards is COMING SOON |
| Amounts as `450,000` | `450000.00 NGN` via the `Amount` primitive | `Amount` is the only currency renderer; digit grouping there is a separate change |

## 4. Data

All Home data is mock (`mobile/src/fixtures`). Rates are decimal strings and are only
ever formatted as text — never converted to floating point.
