# ADR-023 — Exact Figma Home and Cards in Development Builds (Demo Figures)

| Attribute | Value |
|---|---|
| **Status** | **APPROVED** |
| **Date** | 2026-10-18 |
| **Decision ID** | DEC-029 |
| **Authority** | Product owner, 2026-10-18: "use the exactly cards design for now and also the home too"; asked whether that includes Figma's balance and card figures, chose **"Exact incl. balances, demo"** — `DOCUMENT_INDEX.md` §1 rank 2 |
| **Amends** | `docs/adr/004-home-screen-layout.md` (Home hero, activity rows, Account Readiness) and `docs/adr/012-cards-preview.md` ("Create yours", disabled actions, empty history) — **in development builds only** |
| **Narrow exception to** | The on-screen no-balance rule (`docs/13-governance/XSPEERIA_STANDING_STANDARDS.md` §2 as applied in ADR-004, FX-05) — for Figma's placeholder figures in development builds only |
| **Does not change** | Custody (Standing Standards §2.1–2.3): Xspeeria still holds no money and has no balance, wallet or card programme. Release builds are unchanged. |

## 1. Decision

To let the design be reviewed exactly as drawn, **development builds** (`DEMO_MODE`, from
`__DEV__`) render Figma's Home and Cards frames with Figma's own placeholder figures:

- **Home (Figma 39:2882):** the black "Available Balance $500.89" card, the five Figma
  transaction rows in Figma order (NGN - USD, NGN - CAD, Shopping, NGN - EUR, NGN - AUD)
  with status chips and "View All", and **no Account Readiness** (Figma has none). Market
  rates stay live data (USD/GBP/EUR, within the ADR-020 ceiling).
- **Cards (Figma 266:5584):** card text "**** **** **** 4892" with 500.08 USD / 40.23 EUR /
  45,783.83 NGN; Details as a filled navy circle, Freeze Card (snowflake) and More outlined;
  four card transactions (Transfer to Adebayo −$30, Airbnb −$120, Figma −$45, Card funded
  +$260); **no "Create yours"** button (Figma has none; it can be restored). The card shadow
  and sheen were removed to match Figma.

## 2. Safeguards

1. **One place.** All figures live in `mobile/src/features/demo/figmaDemo.ts`, the only
   folder exempt from the prohibited-wording scan.
2. **Release builds get nothing.** Every export is `null` / empty when `DEMO_MODE` is false;
   screens then fall back to the ADR-004 best-rate card, the real activity list, Account
   Readiness, "Preview · USD", a masked number and an empty history. (Release builds also
   show `UnavailableBuild` until the backend exists, ADR-018.)
3. **Marked.** Every demo figure carries a "Demo" tag on screen and "Demo" in its
   accessibility label; the balance card's label says "Demo figure, not real money".
4. **Display text only.** Nothing reads, sums or stores these strings; they are not amounts
   anyone holds. No card can be issued, frozen or funded: every card action shows
   "Cards are not available".
5. **No brand logos.** Airbnb and Figma rows use generic icons (building, pen).
6. **Tests:** `mobile/__tests__/no-balance.test.ts` (demo folder gated on `DEMO_MODE`; all
   exports empty when it is false), `navigation.test.tsx` (Cards demo and release rendering,
   Home route), `home.test.tsx` (Home demo and release rendering).

## 3. Consequences and limits

- Screenshots or recordings of a development build show a balance. They **must not** be used
  in marketing, investor, partner or regulatory material, because Xspeeria has no balance
  (Standing Standards §2.3). Use release-style rendering for any external material.
- Showing real balances, a wallet or issued cards remains a product-identity change needing
  explicit human approval and regulatory review (Standing Standards §2.3, ADR-012 §3).
- Artwork: the Home card texture, the avatar photo and sharper 3x card backgrounds could not
  be exported (Figma MCP plan limit reached 2026-10-18); current artwork is used. Licences
  for card and Welcome artwork are still to be confirmed.

## 4. Implementation

`mobile/src/features/demo/figmaDemo.ts`, `home/BestRateCard.tsx` (`HeroCard` with badge),
`home/FigmaActivityList.tsx`, `home/HomeScreen.tsx` (`demoHero`, `demoActivity`,
`showReadiness`), `app/(app)/(tabs)/index.tsx`, `cards/CardsScreen.tsx` (`demoText`,
`demoTransactions`), `components/icons.tsx` (tag, snowflake, arrowOut, arrowIn, pen,
building).
