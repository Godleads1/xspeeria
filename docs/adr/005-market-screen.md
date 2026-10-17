# ADR-005 — Market Screen (Figma Buy/Sell) and Select Match

| Attribute | Value |
|---|---|
| **Status** | **APPROVED** |
| **Date** | 2026-10-17 |
| **Decision ID** | DEC-011 |
| **Supersedes** | `docs/09-ui-ux/Xspeeria_UIUX_AppFlow_Spec_v2.md` § Marketplace layout (Offers/Requests segmented control, filter bar, FAB) for the mobile app |
| **Authority** | Product owner, 2026-10-16/17: "follow the Figma mobile design strictly" (ADR-003 §1.3) and "let's do Market" — `DOCUMENT_INDEX.md` §1 rank 2 |

---

## 1. Decision

The Market tab follows the Figma frames (file `5ayAjPFxxHmEQIrEjauHTB`):

- **Buy** (`79:399` empty, `1019:11897`, `94:557` filled): currency to buy, amount, current
  market trend with "See Details", rate with a match-potential pill, **Create request**,
  then **Available offers** with **Buy**, and the advert slot.
- **Sell** (`436:7771`): amount to sell, currency to receive, trend, rate, green
  **Create Offer**, then **Available USD request** with **Sell**.
- **Select Match** (`106:1150`): summary (amount, rate, amount to pay), the matching
  listings, and a red **Cancel request**.
- Currency sheet after `1019:9284`.

The Figma wording ("Create request", "Create Offer") is kept, under the Figma-strict rule.

## 2. Money handling

Typed amounts and rates are parsed straight to integer hundredths
(`mobile/src/features/market/money.ts`); the amount to pay is computed with BigInt and
rounded half-up. No value passes through binary floating point. Route parameters for
Select Match are treated as untrusted and re-validated. All client checks are for form
feedback only; the server must re-validate.

## 3. Recorded deviations and open items

| Figma | Implementation | Why |
|---|---|---|
| Advert slot with a stock photo of a person | The Figma artwork, supplied by the product owner (`mobile/assets/images/market-advert.png`) | **Open:** confirm the stock-photo licence before release; supply a 3× export (current file is 282 × 88 and will look soft) |
| "Select Matching buying currency…" | "Select a currency to buy to see available offers" | Typo/placeholder correction |
| Sell sheet "Currencies you are licensed to sell" | "…licensed to receive" | It lists the currency received |
| Faded disabled "Create request" | Same, via opacity | Matches Figma; disabled controls are exempt from contrast rules |
| Sell green `#208B3A` with white label | Label 19 pt bold (large text) | White on `#208B3A` is 4.37:1 — passes only as large text |

**Open:** the **Buy/Sell** buttons on listings and the confirm-trade flow (Figma
`120:990` → `190:1791`) are the next build. Until then they show an honest
"next screen to be built — nothing has been sent" notice. The bell has no destination
yet and is disabled. The **⋮ menu** follows the product owner's Figma reference (My Requests (Buy), My Offers (Sell), Disputes, AI Rate Forecasting, Cancel); each item explains it is coming until its screen exists. Match potential is a mock heuristic (position inside the band).
