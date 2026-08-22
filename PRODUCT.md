# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

> Human decision, 2026-08-20: Xspeeria ships on iOS and Android as one product that genuinely adapts its design language per OS (HIG on iOS, Material on Android), plus a Next.js web admin/business surface. This supersedes the iOS-only framing in `docs/09-ui-ux/` (SF Pro, iPhone 16 Pro canvas, "inspired by Apple HIG"), which specifies no Android counterpart. Those documents need an Android design pass; until it exists, Android specifics are `UNKNOWN — NOT VERIFIED`, not inferable from the iOS specs.

## Stack

Confirmed by the user, 2026-08-20, matching current repository architecture documentation:

- Mobile app: React Native / Expo (iOS + Android)
- Admin / business web surface: Next.js
- Backend foundation: Python + FastAPI — human-approved architecture.
- PostgreSQL, SQLAlchemy, and Pydantic appear in current repository technical documentation. PRODUCT.md does not independently promote documented implementation choices into human-approved architecture.

No scaffold exists in this repository yet — the repo currently contains documentation, governance, CI, and test directories only. Every frontend surface is greenfield.

## Users

Recurring-need FX participants in African diaspora corridors, not one-off senders. Five documented personas (`docs/01-business/01_Business_Requirements_Specification.md` §5):

- **Diaspora remitter** — sends or receives money across a corridor on a recurring schedule.
- **Freelancer / remote worker** — Nigeria-based, paid in foreign currency by international clients, converting regularly.
- **SME** — small business with recurring cross-border FX needs.
- **Importer** and **Exporter** — trade FX, higher average transaction value, lower frequency.

Business personas (SME, Importer, Exporter) require Enhanced Due Diligence. Volume is driven by the recurring personas; value by the trade personas.

Admin/operations staff are a second audience, served by the Next.js surface (business dashboard, statements, operational review).

## Product Purpose

Xspeeria matches verified counterparties with reciprocal currency needs and orchestrates settlement through regulated banking and payment partners.

Xspeeria does not receive, hold, store, or custody customer funds. Funding, confirmation, settlement, and payout occur through the applicable regulated partner rails and arrangements.

The exact legal characterization of partner-held funds, safeguarding, escrow, settlement accounts, or equivalent mechanisms remains subject to the applicable corridor, partner structure, licensing analysis, and regulatory approval.

Success means a match is found quickly and settlement completes with the user never losing sight of where their transaction is or what happens next.

## Positioning

- **Wallet-less and non-custodial.** Xspeeria never holds customer funds and never displays a stored balance or wallet identifier. There is no FX book and no proprietary trading position.
- **Flat, disclosed coordination fee** charged locally on each side of a match — not a percentage, and not a margin hidden inside the exchange rate.
- **Explicitly not** a cryptocurrency exchange, not a custodial wallet, not a bank. It is a matching and orchestration layer above regulated settlement rails.

The design consequence is a standing test, taken from `docs/09-ui-ux/xspeeria-design-bible.md`: does this visual choice, even implicitly, suggest Xspeeria custodies funds? If yes it is wrong regardless of how clean it looks. A balance figure has no meaning in this product.

## Operating Context

- **Corridor selection remains unresolved.** Repository documents currently conflict:
  - some material references Nigeria–US / NGN ⇄ USD;
  - other material references NGN ⇄ GBP as a proposed Year-1 pilot.
- No corridor is authoritative until the relevant human governance decision is closed.
- Design work must remain corridor-configurable and must not hard-code GBP, USD, the UK, or the US as the production launch corridor.

- **Transaction eligibility is gated.** Approved KYC is required before transaction participation, and qualifying MFA is also required before a customer becomes `TRANSACTION_ELIGIBLE`.
- The UI must distinguish account creation, identity verification, security/MFA readiness, and transaction eligibility rather than collapsing them into a single “verified” state.
- **Per-leg funding visibility is deliberately asymmetric.** A user sees their own leg's state precisely and the counterparty's only coarsely (*awaiting counterparty* vs *counterparty funded*) — enough to convey safety without leaking a signal that could be used to game rematching.
- **MVP scope is 22 screens** across four journeys: Onboarding & Authentication (6), Core Application (7), Account & Support (5), Business & Admin (2 + Support). Specified in `docs/09-ui-ux/Xspeeria_UIUX_AppFlow_Spec_v2.md` §5.
- Settlement is asynchronous and multi-step; users return to check state, and notifications carry deep links back into a transaction.

## Capabilities and Constraints

**MVP capabilities:** authentication, tiered KYC, FX marketplace, matching engine, regulated-partner settlement with dual confirmation, transaction timeline, notifications, disputes, business dashboard with async statement export.

**Hard constraints:**

- Never display a stored balance, wallet ID, or account-number figure anywhere in the product. **This extends to any aggregate currency figure in a hero position** — a large single amount reads as a balance regardless of its label. Amounts stay attached to the individual Offer or allocation they belong to. **HUMAN APPROVED, 2026-08-22.**
- **Home has no balance region.** The former balance region is **Account Readiness**, carrying exactly three dimensions: Identity / KYC, Security / qualifying MFA, Eligible to transact. It collapses to a compact confirmation once all three are satisfied. Beneficiary, payout and funding readiness are **allocation-specific** and must never become Home account-readiness dimensions. **HUMAN APPROVED, 2026-08-22.**
- Bottom navigation is **Home, Marketplace, Track, Cards, Profile** — **HUMAN APPROVED, 2026-08-22**, superseding the earlier *Home, Marketplace, Track, Notifications, Profile*. **Cards is COMING SOON**: it opens a real destination, never a dead or disabled tab, and exposes no card functionality, no card balances, and nothing implying stored-value wallet or card functionality. Notifications live behind the bell, notification centre and push. No Scan flow exists; Analytics is out of MVP scope.
- **Gold is not a status colour.** It must never represent KYC approval, verified identity, success, funding confirmation, settlement completion or warning. A narrowly scoped decorative role for rating indicators is permitted. Identity verification uses the brand-primary family — verification is an identity fact, not a financial success state. **HUMAN APPROVED, 2026-08-22.**
- Financial state must be exact — never binary floating point (`CLAUDE.md`).
- Frontend restrictions are not security controls; authorization is verified server-side.
- Canonical transaction and settlement state semantics are owned by ADR-001 / DEC-003. UI design may present approved states but must not create, rename, merge, remove, or reinterpret canonical financial states.

- Canonical financial event and accounting architecture is owned by ADR-002 / DEC-004. UI design must not define ledger truth, financial event semantics, reversibility, reconciliation behavior, or loss allocation.

**Undecided — do not resolve by implementation default:**

- Icon set licensing (Phosphor vs. an SF Symbols-derived custom set) for cross-platform parity.
- Whether the Next.js admin gets its own component library instance or consumes the mobile token set via a shared package.
- Final microcopy for empty and error states across all 22 screens — the specs define structure and intent only.
- The Android design language counterpart to the documented iOS patterns.
- Accounting policy of every kind is owned by Finance/Legal/Compliance and must never become normative through examples, seed data, or UI copy.

## Brand Commitments

- **Name:** Xspeeria. **Tagline:** *Connecting People. Connecting Currencies. Connecting Benefit.*

- **Official logo/wordmark:** the approved Xspeeria logo is stored at `assets/brand/xspeeria-logo.png` and is the canonical brand mark. Do not redesign, redraw, substitute, recolor, distort, or materially alter it without explicit design approval.

- **Two distinct colour questions — do not conflate them.** **(A) Logo / brand-asset colours** are
  governed by the official logo and remain open pending vector confirmation. **(B) Application UI
  colours** are governed by the **Xspeeria Figma**, which is the **primary visual source of truth
  for application UI/UX** (human authority, 2026-08-22). The logo values below are **not** the
  authority for the application palette.

- **(A) Official brand palette — logo artwork:** Xspeeria's core brand colors are derived from the official logo supplied by the user: navy blue, green, red, and gold/yellow. The official logo is the visual source of truth for brand identity.

- **(A) Logo colour references — still unconfirmed:** approximately `#001A6E` navy blue, `#208B3B` green, `#F90A09` red, and `#FEB700` gold/yellow. These are **logo/brand-asset** values and must still be confirmed against the original vector/brand asset before being frozen. They are **not** application UI tokens and must not be used as such.

- **(B) Application UI palette — HUMAN APPROVED, 2026-08-22:** Primary `#1F3A8A`, Secondary
  `#3B82F6`, canvas `#FFFFFF`, supporting soft surface `#F8F9FD`, border/divider `#E5E7EB`,
  headline text `#111827`, body text `#4B5563`, disabled text `#9CA3AF`, success `#10B981`,
  warning `#F59E0B`, error `#EF4444`. `#1F3A8A` is **deliberately retained** and must not be
  normalised to `#1E3A8A` merely because that is a framework default. The resemblance of this
  palette to Tailwind defaults does not invalidate it.

  The **semantic architecture** built on these values is also approved: status families split
  into `.fill` / `.surface` / `.border` / `.text` so that one colour never performs every role;
  `#E5E7EB` is a decorative boundary only, with `#6B7280` as the strong boundary for controls;
  primary interaction states are `#1F3A8A` / `#1E40AF` / `#172554` with a `#1D4ED8` focus ring.
  Full normative detail, measured WCAG contrast, and the legacy-name mapping are in
  `docs/09-ui-ux/DESIGN_SYSTEM.md`.

  These remain **candidate production tokens**, **not frozen** — the Figma contains painted
  swatches, **not** a bound token/variable system, so Xspeeria has **no production design-token
  system** and none may be claimed. **IMPLEMENTATION STATUS: NOT IMPLEMENTED. VERIFICATION
  STATUS: NOT VERIFIED** — no application code exists or consumes them. The Figma Success-swatch
  label defect (fill `#10B981`, label text `#FFFFFF`) is recorded in `DESIGN_SYSTEM.md`.

- **RESOLVED — HUMAN APPROVED, 2026-08-22:** the observed Figma palette contains **no accent/gold
  role**, and `#F4C21F` is not Figma-confirmed. Gold is retained for **decorative rating
  indicators only** and is never a status colour. The glyph treatment remains `UNKNOWN — NOT
  VERIFIED` — at 1.67:1 on canvas the mark needs an outline or a darker fill.

- **Primary interface background:** `#FFFFFF` pure white is the required default background across Xspeeria mobile and web interfaces.

- **Supporting neutral surface:** `#F8F9FD` (Figma-observed; supersedes the earlier `#F8FAFC`) may be used only for secondary surfaces such as subtle panels, grouped sections, inactive areas, or low-emphasis containers where visual separation from the white canvas is required. At 1.05:1 against the canvas it provides almost no separation on its own — pair it with border, elevation or spacing.

- **Text roles — HUMAN APPROVED, 2026-08-22:** `#111827` for headings, high-emphasis labels and primary content; `#4B5563` for **body copy**, descriptions, supporting text and metadata; `#9CA3AF` for genuinely disabled/inactive text only. `#6B7280` is the strong boundary value for controls, **not** a body-text token — its use as a disabled-control label stays scoped to that interaction state.

- White is the dominant canvas. Xspeeria must not use tinted, dark, gradient, or brand-colored page backgrounds as the default product surface unless a specific design state has been explicitly approved.

- Supporting semantic tokens such as borders, muted text, surfaces, hover states, focus rings, disabled states, success backgrounds, warning backgrounds, and destructive backgrounds may be derived from the official brand palette, but must preserve accessibility and require design-system approval.

- **Typefaces are undecided — OPEN, NOT FROZEN.** SF Pro / Inter is documented intent, not a licensed decision. **Satoshi** is the leading mobile candidate from the Figma, and **must not** be declared production-standard pending licence verification, mobile and web embedding rights, confirmed tabular/lining figure support, and React Native support with an asset strategy. Admin typography is open pending admin design provenance, dashboard-kit licence, dense-table legibility and numeric rendering. **Neither Satoshi nor Nunito Sans is production-standard.** The tabular-figure commitment below gates every candidate. Record the choice when it is made.

- **8pt spacing system.** Currency and numeric values render in tabular figures, right-aligned in lists, never truncated.
- **Visual references only:** aspects of Apple Wallet's polish, Revolut's financial information clarity, Stripe's precision, and Linear's interaction discipline may inform visual craft.
- These references do not define product architecture or product metaphors. Xspeeria must never visually imply stored-value wallet functionality, custody, card balances, cryptocurrency trading, or banking services.
- **Voice:** plain, specific, non-apologetic. No dead ends — every empty and error state names a next action.

## Evidence on Hand

**Exists:** the **Xspeeria Figma** at `docs/references/figma/Xspeeria.fig` — human-provided design source, ~70.1 MB, **UNTRACKED PENDING A VERSIONING DECISION** (not staged, not committed, not gitignored, not in Git LFS; how it is versioned is a human decision that has not been taken). It is the primary visual source of truth for application UI/UX, and it carries **painted swatches, not bound variables** — there is no production token system. The official logo/wordmark at `assets/brand/xspeeria-logo.png`; the full 22-screen UI/UX spec (`docs/09-ui-ux/Xspeeria_UIUX_AppFlow_Spec_v2.md`, `xspeeria-design-bible.md`); the Product Design Specification (`docs/02-product/04_Product_Design_Specification.md`, status *Draft — Pre-Development Blueprint*); business requirements and personas; the 5-Year Business Plan.

**Does not exist — never fabricate:**

- No customers, testimonials, case studies, press, or partner names. The banking partner is described by selection criteria only; no institution is named.
- No verified performance metrics. Every figure in the business plan (6.0M users, $22B GMV, $260M revenue, $1.2B valuation) is an illustrative Year-5 *target* under a deliberately aggressive planning case with modeled bear scenarios. Rendering any of it as achieved performance is a compliance failure, not a design liberty.
- No illustrations, photography, icon set, or font files in the repository. The onboarding carousel's three illustrations do not exist yet.
- The pilot has not run. Xspeeria is pre-launch.

## Product Principles

1. **Custody is the interface.** If a screen could be misread as Xspeeria holding the money, it is wrong — no balances, no wallet framing, no exceptions.
2. **State is never a guess.** Anything in a non-terminal state shows where it is and what happens next, persistently.
3. **Price is legible.** The flat coordination fee is shown plainly on both sides; nothing about cost is inferred from a rate.
4. **Recurring, not one-off.** These users convert money repeatedly — reward familiarity and speed over first-run hand-holding after activation.
5. **Institutional seriousness is a feature.** Visual quality is read as regulatory credibility by SMEs and importers moving meaningful sums.

## Accessibility & Inclusion

**WCAG 2.1 AA** conformance across mobile and admin surfaces is a design and release requirement, not an enhancement.

Accessibility verification target:
1. automated contrast and touch-target checks must be introduced when the frontend scaffold exists;
2. manual VoiceOver/TalkBack review must be performed for applicable new screens before release;
3. periodic WCAG AA audits must be performed according to the approved accessibility process.

These controls must not be described as implemented or verified until the corresponding tooling and evidence exist.

Specific standing requirements: status and verification are never signalled by color alone; numeric KPIs are announced as one string rather than fragments; motion respects reduced-motion preferences; disabled states explain why they are disabled, including remaining seconds where applicable.
