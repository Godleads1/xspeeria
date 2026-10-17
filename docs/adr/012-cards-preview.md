# ADR-012 — Cards Tab: Preview with "Create yours"

| Attribute | Value |
|---|---|
| **Status** | **APPROVED** |
| **Date** | 2026-10-17 |
| **Decision ID** | DEC-018 |
| **Authority** | Product owner, 2026-10-17: Figma "Debit Cards" frames plus "add button that reads create yours and when users clicks that, it should says, the cards are not available now" — `DOCUMENT_INDEX.md` §1 rank 2 |
| **Replaces** | The Cards "Coming soon" placeholder (DEC-005). The tab stays marked coming soon. |

## 1. Decision

The Cards tab shows the Figma layout as a **preview**: "Debit Cards" header, a swipeable
carousel of USD / EUR / NGN virtual-card designs with page dots, the Details / Freeze Card
/ More actions, a **Create yours** button, and a Transaction History section.
"Create yours" (and ⋮) say: *"Xspeeria cards are not available yet."*

## 2. Recorded deviations from Figma

| Figma | Implementation | Why |
|---|---|---|
| Card balances (500.08 USD, 40.23 EUR, 45,783.83 NGN) | "Preview · USD" etc. | Xspeeria is wallet-less and never shows a balance (PRODUCT.md, design bible, no-balance guard) |
| Card number ending 4892 | `•••• •••• •••• ••••` | No card exists |
| Transaction list incl. "Card funded +$260" | Empty state: card transactions will appear once cards are available | Funding a card implies holding customer money |
| Details / Freeze Card / More active | Shown disabled | No card to act on |
| 3D glowing currency artwork | Original SVG artwork in the same style | Artwork not exportable (view-only) |
| — | "Create yours" button added | Product owner request |

## 3. Open — product, legal and partner decision before cards can launch

Issuing cards (with balances or funding) would make Xspeeria hold or move customer money,
which the approved non-custodial model rules out. Launching cards needs: the card-issuing
partner and programme model, licensing, whether a card can exist without a stored balance,
and updates to the business plan and design rules.
