<!-- SOURCE DOCUMENT: 04_Product_Design_Specification.docx -->
<!-- Converted to Markdown for Claude/Claude Code repository use. -->
<!-- Source content is preserved; this conversion does not establish new business or technical authority. -->

**XSPEERIA**

Wallet-less Peer-to-Peer Fiat Currency Exchange

**DOCUMENT 04 OF 05 — PDS**

**Product Design Specification**

*Design Tokens, Component Library, Screen Specifications & Motion System*

|                  |                                                     |
|------------------|-----------------------------------------------------|
| **Attribute**    | **Value**                                           |
| Document Version | v1.0 — Draft                                        |
| Document Owner   | Head of Product Design / Principal Product Designer |
| Review Cycle     | Quarterly, or upon major brand/IA change            |
| Classification   | Internal — Confidential — Pre-Development Blueprint |
| Status           | Draft — Pre-Development Blueprint                   |
| Date             | August 2026                                         |

> **`UNKNOWN — NOT VERIFIED` — missing normative security baseline.** Screen behaviours below previously cited a repository document named `SECURITY.md` as their normative source. **No such document exists**, and the security-baseline decision (Decision 2) remains **OPEN**. Those citations now read "the applicable approved security policy", which is **not yet determined**; the behaviours described therefore lack their expected normative grounding. Frontend behaviour is never an authoritative security control in any case — authorization is enforced server-side.

Version History

|             |          |             |                                                              |
|-------------|----------|-------------|--------------------------------------------------------------|
| **Version** | **Date** | **Author**  | **Summary of Changes**                                       |
| v0.1        | 2026-07  | Design Lead | Initial draft from UI_UX_SCREEN_SPEC.md and DESIGN_SYSTEM.md |
| v1.0        | 2026-08  | Design Lead | Full component library and screen-by-screen specification    |

Table of Contents

Executive Summary

This Product Design Specification (PDS) is the reference for how Xspeeria looks, feels, and behaves across mobile (React Native / Expo) and admin (Next.js) surfaces. **Qualified 2026-08-24:** it is **not** the sole authority. `DOCUMENT_INDEX.md` assigns UI/UX behaviour, flows, states and interaction detail to the UI/UX documents, and for application visual direction the Xspeeria Figma is the primary source (human authority, 2026-08-22). Where this document and those disagree, `DOCUMENT_INDEX.md` precedence governs. It translates the brand and interaction principles established in DESIGN_SYSTEM.md and UI_UX_SCREEN_SPEC.md into implementation-ready detail: design tokens, a full component library, and screen-by-screen specifications covering layout, states, motion, and accessibility.

Xspeeria’s design language is defined as Apple Wallet × Revolut Ultra × Stripe × Linear: restrained, high-contrast, generously spaced, and engineered for trust. Every visual decision in this document is justified against one of three criteria: (1) it reduces cognitive load during a financial decision, (2) it reinforces trust and security perception, or (3) it accelerates task completion for time-sensitive FX activity.

> **ASSUMPTION:** *The two source screens explicitly specified (Home) and the design system tokens are authoritative. All other screens, component states, and motion timings in this document are derived design decisions consistent with the stated Apple Wallet × Revolut Ultra × Stripe × Linear direction and the 8pt grid, and should be reviewed by the design team before implementation sign-off.*

1\. Executive Design Philosophy

Xspeeria operates in a category where trust is the primary conversion lever. Users are exchanging real money peer-to-peer, across currencies and borders, without a custodial wallet holding their balance between steps. The design system is therefore built around four pillars:

- Clarity over decoration — every screen answers "where is my money and what happens next" within one glance.

- Calm confidence — generous whitespace, restrained color usage (blue for identity, green for success, red only for genuine risk/error, gold as a rare accent for premium moments).

- Momentum — the marketplace and matching flows are inherently multi-step; motion and progressive disclosure keep users oriented rather than anxious.

- Institutional polish — visual quality signals regulatory seriousness to a user base that includes SMEs and importers moving meaningful sums.

1.1 Design Principles in Practice

|                               |                                                                                                                          |
|-------------------------------|--------------------------------------------------------------------------------------------------------------------------|
| **Principle**                 | **Applied Rule**                                                                                                         |
| One primary action per screen | Every screen has exactly one high-emphasis (filled, primary-blue) CTA; all other actions are secondary or ghost.         |
| Financial numbers are sacred  | Per-item amounts always render in tabular (monospaced-numeral) figures, right-aligned in lists, never truncated. *Corrected 2026-08-24: "balances" is withdrawn — Xspeeria renders per-Offer, per-allocation and per-transaction amounts, never a customer balance of any kind.* |
| Status is always visible      | Any transaction, offer, or match in a non-terminal state shows a persistent status chip using the semantic color system. |
| No dead ends                  | Every empty and error state includes a specific next action, never a bare message.                                       |
| Motion has meaning            | Animation communicates state change (e.g., matched, settled) — it is never purely decorative.                            |

2\. Brand Identity

2.1 Color System

Colors are sourced directly from DESIGN_SYSTEM.md and are treated as immutable brand constants. Tints and shades below are derived extensions required for state layers (hover, pressed, disabled) and are labeled as design-system extensions.

|                     |          |                                                             |
|---------------------|----------|-------------------------------------------------------------|
| **Token**           | **Hex**  | **Usage**                                                   |
| color.primary.blue  | \#1F3A8A | Brand identity, primary buttons, headers, active nav, links |
| color.success.green | \#10B981 | Completed settlement, successful activity, success toast *(corrected 2026-08-24: "positive balance delta" is withdrawn — there is no customer balance to move)* |
| color.alert.red     | \#EF4444 | Errors, failed transactions, destructive actions, disputes  |
| color.accent.gold   | \#F4C21F | **Decorative rating indicators only.** Not a status colour. Must not represent KYC approval, verified identity, success, funding confirmation, settlement completion or warning. No Figma counterpart; glyph treatment `UNKNOWN — NOT VERIFIED` |
| color.bg.base       | \#FFFFFF | Application canvas — default screen background              |
| color.text.primary  | \#111827 | Body copy, headings                                         |

> **RECONCILED — Xspeeria Figma, the primary visual source of truth for application UI/UX.**
> `color.primary.blue` was `#001B68`, `color.success.green` was `#179A43`, `color.alert.red` was
> `#E52421`. **Corrected 2026-08-24:** those three are the **FIGMA-OBSERVED / LEGACY SOURCE
> VALUES**, and the sentence that previously said each *"is now the Figma-observed value"* was
> backwards -- it read as though the production tokens had been changed to them. They were not.
> The **APPROVED PRODUCTION SEMANTIC TOKENS** are `#1F3A8A` primary, `#3B82F6` secondary,
> `#10B981` success, `#F59E0B` warning, `#EF4444` error, and they are **unchanged**. The `.10`
> tints (`#10B9811A`, `#EF44441A`) are therefore correct: they are derived from the approved
> production tokens, not from the observed values. These observed values are **FIGMA-OBSERVED
> COLOURS / CANDIDATE
> APPLICATION TOKENS**, not frozen production tokens — the Figma holds painted swatches, **not** a
> bound token/variable system, so no production token set exists and none may be claimed until
> human approval freezes one.
>
> `color.bg.base` = `#FFFFFF` was corrected earlier against the human decision in `PRODUCT.md`
> “Brand Commitments”, 2026-08-20, and is **unchanged** — the Figma agrees. The pre-Figma
> supporting neutral `#F8FAFC` is superseded by the Figma supporting soft surface `#F8F9FD`.
>
> **RESOLVED — HUMAN APPROVED, 2026-08-22.** `color.accent.gold` `#F4C21F` has **no counterpart in
> the observed Figma palette** and is **not** Figma-confirmed. It is retained for **decorative
> rating indicators only**, always accompanied by the numeric rating. It must never represent KYC
> approval, verified identity, success, funding confirmation, settlement completion or warning.
> Identity verification uses the brand-primary family. The glyph treatment itself remains
> `UNKNOWN — NOT VERIFIED` — at 1.67:1 on canvas the mark needs an outline or a darker fill.
>
> **Observed in the Figma and since named** — Secondary `#3B82F6`, Body text `#4B5563`, Warning
> `#F59E0B`, Supporting soft surface `#F8F9FD`, Border/divider `#E5E7EB`, Disabled text `#9CA3AF`
> now carry semantic tokens in `DESIGN_SYSTEM.md`. **HUMAN APPROVED**, 2026-08-22.
>
> **Logo/brand-asset colours are a separate question** and are not settled by the Figma — see
> `PRODUCT.md` “Brand Commitments”. Full observed palette, the Figma Success-swatch label defect,
> and measured WCAG contrast findings: `DESIGN_SYSTEM.md`.
>
> **Consequence (unchanged):** `surface.card` `#FFFFFF` is the same value as the canvas and must be
> separated by border, elevation or spacing, never by fill.
>
> **DESIGN SYSTEM FREEZE — PHASE 1, HUMAN APPROVED.** The application colour direction above is
> approved. The normative semantic-token architecture — surfaces, text, borders, brand, the
> success/warning/error `.fill`/`.surface`/`.border`/`.text` families, primary interaction states,
> the gold restriction and the legacy-name mapping — lives in `DESIGN_SYSTEM.md` and governs.
> **IMPLEMENTATION STATUS: NOT IMPLEMENTED. VERIFICATION STATUS: NOT VERIFIED.** No application
> code exists. Typography is a **PARTIAL FREEZE**: **Inter is HUMAN APPROVED as the financial/
> numeric face**; brand/UI typography remains **OPEN** with Satoshi the leading candidate and
> **not** production-approved; Nunito Sans is **not** an Xspeeria production standard. See
> `DESIGN_SYSTEM.md`.


> **ASSUMPTION:** *The following tints/shades and semantic aliases are design-system extensions not present in the source documents, added for implementation completeness.*

|                            |            |                                      |
|----------------------------|------------|--------------------------------------|
| **Token**                  | **Hex**    | **Usage**                            |
| color.primary.blue.10      | \#1F3A8A1A | Selected row / active tab background |
| color.primary.blue.hover   | \#1E40AF   | Button hover → `interaction.primary.hover`. **HUMAN APPROVED.** White label 8.72:1 ✓. Supersedes `#002885` |
| color.primary.blue.pressed | \#172554   | Button pressed → `interaction.primary.pressed`. **HUMAN APPROVED.** White label 14.69:1 ✓. Supersedes `#001350` |
| color.success.green.10     | \#10B9811A | Success banner background            |
| color.alert.red.10         | \#EF44441A | Error banner background              |
| color.gray.100             | \#E5E7EB   | → `color.border.subtle`. **Decorative dividers and container edges only** (1.24:1). Must not be the sole boundary of an input or selectable row |
| color.gray.400             | \#9CA3AF   | Placeholder text, disabled icons — matches the Figma disabled-text value exactly |
| color.gray.600             | \#6B7280   | → `color.border.strong` (4.83:1 ✓) for inputs, selectable rows and interactive form fields, plus the disabled-control label. **A boundary value, not a text token.** Body copy and supporting text are `color.text.secondary` `#4B5563` — **HUMAN APPROVED** |
| color.overlay.scrim        | \#00000066 | Modal backdrop                       |

> **Figma reconciliation of the extension tokens.** The three `.10` tints are definitionally the
> base colour at 10% alpha, so they moved with their bases to the Figma-observed values. The hand-
> picked `hover` and `pressed` shades were derived from the superseded `#001B68` and have **not**
> been re-derived — re-deriving them is a design decision, not a mechanical one. `color.gray.100`
> was repointed to the Figma-observed border/divider value `#E5E7EB` because its stated role
> ("card borders, dividers") is exactly the role the Figma names.
>
> **RESOLVED — HUMAN APPROVED, 2026-08-22.** The text roles are frozen: `color.text.primary`
> `#111827` for headings, high-emphasis labels and primary content; `color.text.secondary`
> `#4B5563` for **body copy**, descriptions, supporting text and metadata; `color.text.disabled`
> `#9CA3AF` for genuinely disabled/inactive text only. `#6B7280` is `color.border.strong`, a
> **boundary value and not a text token** — its use as a disabled-control label is scoped to that
> interaction state and must not be generalised into `color.text.secondary`.

2.2 Typography

**Typeface — PARTIAL FREEZE, see `DESIGN_SYSTEM.md`.** The earlier "SF Pro (iOS) / Inter (Android, Web, Admin)" pairing is **superseded as a frozen statement**.

**Inter is HUMAN APPROVED (2026-08-22) as the Xspeeria financial/numeric typeface** on all applicable surfaces — currency amounts, rates, fees, percentages, totals, transaction/settlement/allocation amounts, numeric table columns, admin operational data and right-aligned monetary values. The normative requirement is the **rendering outcome**: financial numerics must support tabular/lining figures wherever alignment requires it. The preprocessing method is an implementation decision and is **not frozen**.

**Brand and UI typography remains OPEN.** Satoshi is the leading candidate and is **not production-approved** pending licence, embedding, redistribution, specimen and delivery-strategy verification. Inter is **not** required on non-numeric text — do not force two typefaces into every screen. System faces are fallback guidance only, not brand authority.

|                   |                        |                |                                                         |
|-------------------|------------------------|----------------|---------------------------------------------------------|
| **Style**         | **Size / Line Height** | **Weight**     | **Usage**                                               |
| Display           | 34 / 41                | Bold (700)     | Activity count numerals on Home, KPI figures on the Business Dashboard. **Corrected — never a balance amount: Xspeeria has none** |
| Title 1           | 28 / 34                | Bold (700)     | Screen titles                                           |
| Title 2           | 22 / 28                | Semibold (600) | Section headers, modal titles                           |
| Headline          | 17 / 22                | Semibold (600) | Card titles, list item primary text                     |
| Body              | 15 / 20                | Regular (400)  | Default body copy                                       |
| Callout           | 14 / 18                | Regular (400)  | Secondary descriptions                                  |
| Caption           | 12 / 16                | Regular (400)  | Timestamps, helper text, legal                          |
| Numeral (Tabular) | 17–34 / —              | Semibold (600) | All currency and numeric values — **Inter, tabular/lining figures required** |

2.3 Spacing, Radius, Elevation

|             |                                |                                               |
|-------------|--------------------------------|-----------------------------------------------|
| **Token**   | **Value**                      | **Usage**                                     |
| space.1     | 4px                            | Icon-to-label gap                             |
| space.2     | 8px                            | Base unit — all spacing is a multiple of this |
| space.3     | 16px                           | Default internal card padding                 |
| space.4     | 24px                           | Section gaps, button horizontal padding       |
| space.6     | 32px                           | Screen-edge margins                           |
| space.8     | 48px                           | Major section separation                      |
| radius.sm   | 12px                           | Chips, badges, small buttons                  |
| radius.md   | 16px                           | Standard cards, inputs (per DESIGN_SYSTEM.md) |
| radius.lg   | 24px                           | Buttons (per DESIGN_SYSTEM.md), bottom sheets |
| radius.xl   | 32px                           | Account Readiness Region (was "Balance Card") |
| elevation.0 | none                           | Flat surfaces, background                     |
| elevation.1 | 0 1px 2px rgba(17,24,39,0.06)  | Resting cards                                 |
| elevation.2 | 0 4px 12px rgba(0,27,104,0.12) | Account Readiness Region, floating transaction cards |
| elevation.3 | 0 8px 24px rgba(0,27,104,0.18) | Modals, bottom sheets, FAB                    |

2.4 Iconography

Icon set: 24×24px outline icons at 1.5px stroke weight (Phosphor / SF Symbols equivalent mapping), with a 20×20 variant for inline/dense contexts (list rows, chips). Icons never carry meaning alone — every functional icon pairs with a text label or accessible label.

2.5 Motion Language

Motion follows an "ease, don’t bounce" philosophy consistent with the Apple/Linear reference points — fintech motion should feel precise, not playful.

|                 |              |                  |                                      |
|-----------------|--------------|------------------|--------------------------------------|
| **Token**       | **Duration** | **Curve**        | **Usage**                            |
| motion.instant  | 100ms        | ease-out         | Button press feedback                |
| motion.fast     | 180ms        | ease-in-out      | Toast, chip state change             |
| motion.base     | 240ms        | ease-in-out      | Screen transitions, modal open       |
| motion.slow     | 400ms        | ease-out         | Match/settlement success celebration |
| motion.skeleton | 1200ms loop  | linear (shimmer) | Loading skeletons                    |

3\. Complete Design Token Library

Tokens are structured for direct export to a theme file consumed by React Native (Expo) and Next.js Admin, ensuring single-source styling across platforms.

3.1 Token Categories Summary

|                    |                              |                                                         |
|--------------------|------------------------------|---------------------------------------------------------|
| **Category**       | **Token Count**              | **Consumer**                                            |
| Color              | 24                           | Both platforms                                          |
| Typography         | 8 styles × 3 weight variants | Both platforms                                          |
| Spacing            | 7                            | Both platforms                                          |
| Radius             | 4                            | Both platforms                                          |
| Elevation / Shadow | 4                            | Mobile primarily; Admin uses CSS box-shadow equivalents |
| Motion             | 5                            | Mobile (Reanimated) / Admin (Framer Motion)             |
| Iconography        | 2 sizes × 1 stroke weight    | Both platforms                                          |

3.2 Semantic Token Mapping

|                     |                                 |                                    |
|---------------------|---------------------------------|------------------------------------|
| **Semantic Token**  | **Maps To**                     | **Purpose**                        |
| action.primary      | `interaction.primary.default` `#1F3A8A` | Primary button fill, active states |
| action.primary.text | `color.text.on-fill` `#FFFFFF` (10.34:1 on primary) | Text on primary buttons |
| feedback.positive   | `color.success.{fill,surface,border,text}` | Success states — one value does not serve every role; see `DESIGN_SYSTEM.md` |
| feedback.negative   | `color.error.{fill,surface,border,text}` | Error / destructive states — see `DESIGN_SYSTEM.md` |
| feedback.premium    | *(withdrawn)* | **Removed.** Gold must not mark verification. Identity verification uses the brand-primary family; decorative gold is limited to rating indicators |
| surface.base        | `color.bg.canvas` `#FFFFFF`     | Screen background                  |
| surface.card        | \#FFFFFF                        | Card surfaces — same value as the canvas; separate by border/elevation, not fill |
| border.default      | `color.border.subtle` `#E5E7EB` | **Dividers and container edges only.** Input and selectable-row boundaries use `color.border.strong` `#6B7280` |
| border.focus        | `color.border.focus` `#1D4ED8`  | Focus ring — 2px with 2px canvas offset. Not `#3B82F6`, which is 2.81:1 on primary |

4\. Component Library

Each component below specifies purpose, variants, states, spacing, accessibility, and interaction behavior. Components are built mobile-first (React Native) with Admin (Next.js/React) equivalents sharing the same token set.

4.1 Actions

Primary Button

The single highest-emphasis action on a screen (e.g., "Confirm Match", "Send").

|                      |                                                                                                                          |
|----------------------|--------------------------------------------------------------------------------------------------------------------------|
| **Attribute**        | **Specification**                                                                                                        |
| Variants             | Full-width, Inline (auto-width), Icon-leading, Icon-only (44×44 min)                                                     |
| States               | Default, Hover (web), Pressed, Disabled, Loading (inline spinner replaces label)                                         |
| Spacing (8pt grid)   | Height 52px, radius.lg (24px), horizontal padding space.4 (24px), min touch target 44×44                                 |
| Accessibility        | Role: button. Minimum contrast 4.5:1. White text on the **approved production** primary \#1F3A8A measures **10.34:1** *(corrected 2026-08-24: `#1F3A8A` is the APPROVED PRODUCTION SEMANTIC TOKEN, not a Figma-observed raw value; the Figma-observed/legacy value is `#001B68`. The approved palette is unchanged by this correction.)* (the superseded `#001B68` measured 15.48:1; the previously stated "12.6:1" was incorrect for either value). Disabled state announced via accessibilityState. |
| Interaction Behavior | Scale to 0.97 on press (motion.instant), haptic light impact on mobile press, loading state disables re-entry            |

Secondary Button

Alternative or lower-commitment action alongside a primary button (e.g., "Cancel", "Not now").

|                      |                                                                           |
|----------------------|---------------------------------------------------------------------------|
| **Attribute**        | **Specification**                                                         |
| Variants             | Full-width, Inline                                                        |
| States               | Default, Hover, Pressed, Disabled                                         |
| Spacing (8pt grid)   | Height 52px, radius.lg, 1.5px border color.primary.blue, transparent fill |
| Accessibility        | Same touch target and contrast requirements as Primary Button             |
| Interaction Behavior | No haptic; 180ms border-color fade on press                               |

Ghost Button

Tertiary, low-emphasis action, often text-only navigation (e.g., "View all", "Skip").

|                      |                                                               |
|----------------------|---------------------------------------------------------------|
| **Attribute**        | **Specification**                                             |
| Variants             | Text-only, Icon-trailing                                      |
| States               | Default, Pressed, Disabled                                    |
| Spacing (8pt grid)   | Height 44px min, no border, no fill, padding space.2 vertical |
| Accessibility        | Underline appears on focus for keyboard/switch-control users  |
| Interaction Behavior | Opacity 0.6 on press                                          |

4.2 Inputs

Text Input

Standard single-line data entry (email, name, amount).

|                      |                                                                                                                                      |
|----------------------|--------------------------------------------------------------------------------------------------------------------------------------|
| **Attribute**        | **Specification**                                                                                                                    |
| Variants             | Default, With leading icon, With trailing action (clear/reveal)                                                                      |
| States               | Empty, Focused, Filled, Error, Disabled                                                                                              |
| Spacing (8pt grid)   | Height 52px, radius.md (16px), internal padding space.3, 1px border resting / 2px border.focus on focus                              |
| Accessibility        | Label always visible (no placeholder-as-label pattern); error text linked via accessibilityDescribedBy; 4.5:1 contrast on all states |
| Interaction Behavior | Border color transitions over motion.fast; error state shakes horizontally ±4px once (120ms) on submit failure                       |

OTP Input

6-digit one-time-passcode entry for MFA and transaction confirmation.

|                      |                                                                                                                                      |
|----------------------|--------------------------------------------------------------------------------------------------------------------------------------|
| **Attribute**        | **Specification**                                                                                                                    |
| Variants             | Single (default)                                                                                                                     |
| States               | Empty, Active digit, Filled, Error, Success (auto-advance to next screen)                                                            |
| Spacing (8pt grid)   | 6 boxes, 44×52 each, 8px gap (space.2), radius.sm                                                                                    |
| Accessibility        | Auto-fill support (iOS/Android SMS autofill API); each box individually focusable for screen readers                                 |
| Interaction Behavior | Active box shows blinking caret; on full entry, auto-submits after 300ms; error state flashes red border + haptic error notification |

Dropdown / Select

Single selection from an enumerated list (e.g., country, dispute reason).

|                      |                                                                                   |
|----------------------|-----------------------------------------------------------------------------------|
| **Attribute**        | **Specification**                                                                 |
| Variants             | Default, Searchable (for long lists)                                              |
| States               | Closed, Open, Selected, Disabled                                                  |
| Spacing (8pt grid)   | Trigger height 52px matches Text Input; sheet presented as bottom sheet on mobile |
| Accessibility        | Selected option announced on close; full keyboard navigation on Admin (web)       |
| Interaction Behavior | Bottom sheet slides up over motion.base with scrim fade-in                        |

Search Field

Filtering marketplace offers/requests by currency, amount, or counterparty.

|                      |                                                             |
|----------------------|-------------------------------------------------------------|
| **Attribute**        | **Specification**                                           |
| Variants             | Default (persistent), Expandable (header-embedded)          |
| States               | Empty, Typing, Results, No results                          |
| Spacing (8pt grid)   | Height 44px, radius.sm, leading search icon 20px            |
| Accessibility        | Debounced 300ms; live region announces result count changes |
| Interaction Behavior | Clear (x) icon fades in once text.length \> 0               |

Currency Selector

Selects source/target currency for an FX request (NGN/GBP at launch/pilot; NGN/USD added Year 2).

|                      |                                                                                                  |
|----------------------|--------------------------------------------------------------------------------------------------|
| **Attribute**        | **Specification**                                                                                |
| Variants             | Pill toggle (2 currencies), Dropdown (future multi-corridor)                                     |
| States               | Default, Selected, Disabled (settlement in progress)                                             |
| Spacing (8pt grid)   | Pill height 40px, radius 20px (full pill), 4px internal gap between flag icon and code           |
| Accessibility        | Currency flag icons paired with ISO text code (never color/flag alone)                           |
| Interaction Behavior | Selected pill background fills with color.primary.blue over motion.fast; haptic selection change |

4.3 Data Display

Account Readiness Region

> **SUPERSEDES the “Balance Card” — HUMAN APPROVED.** This component previously specified a
> balance-equivalent figure and a wallet ID. **Xspeeria has no Available Balance, wallet balance,
> stored balance, custodial balance or withdrawable balance, and no aggregate balance hero.** The
> concept is **removed, not renamed** — a “net position” figure is the same prohibited affordance
> under another label. `PRODUCT.md` forbids displaying a stored balance, wallet ID or
> account-number figure anywhere in the product.

Occupies the region the Balance Card previously held on Home. Communicates whether the user can
transact — nothing more.

|                      |                                                                                                                  |
|----------------------|------------------------------------------------------------------------------------------------------------------|
| **Attribute**        | **Specification**                                                                                                |
| Dimensions           | Exactly three: **Identity / KYC**, **Security / qualifying MFA**, **Eligible to transact**. No others            |
| Excluded             | Beneficiary readiness, payout readiness and funding readiness are **allocation-specific** and must never appear here |
| Variants             | Expanded (one or more requirements outstanding), **Collapsed** (all three satisfied — compact confirmation line) |
| States               | Loaded, Loading (skeleton), Error (inline retry)                                                                 |
| Spacing (8pt grid)   | radius.xl (32px), internal padding space.4                                                                       |
| Accessibility        | Each dimension exposes its state as text, never colour alone; the collapsed state announces overall eligibility  |
| Interaction Behavior | A satisfied dimension resolves in place; when the third is satisfied the region collapses to the confirmation state so it does not permanently dominate Home |
| Prohibited           | Any currency amount. No balance, no aggregate figure, no wallet or account identifier                            |

Transaction Card

Represents a single transaction/settlement in lists and the Home "Recent Transactions" rail (per UI_UX_SCREEN_SPEC.md: "three floating premium cards").

|                      |                                                                                               |
|----------------------|-----------------------------------------------------------------------------------------------|
| **Attribute**        | **Specification**                                                                             |
| Variants             | Compact (Home rail), Full (Transaction Timeline list)                                         |
| States               | Pending, Matched, Settling, Completed, Failed, Disputed                                       |
| Spacing (8pt grid)   | radius.md, elevation.1 (elevation.2 for Home floating variant), internal padding space.3      |
| Accessibility        | Status communicated via text label + color, never color alone (WCAG 1.4.1)                    |
| Interaction Behavior | Status chip cross-fades on state change; tap expands to Transaction Timeline over motion.base |

Empty State

Shown when a list/section has zero content (no transactions, no offers matching filter).

|                      |                                                                                                             |
|----------------------|-------------------------------------------------------------------------------------------------------------|
| **Attribute**        | **Specification**                                                                                           |
| Variants             | Illustration + message, Compact (icon + message)                                                            |
| States               | Default only                                                                                                |
| Spacing (8pt grid)   | Vertically centered within available space, illustration max 160×160, space.4 between illustration and text |
| Accessibility        | Illustration marked decorative (accessibilityElementsHidden); message and CTA remain in reading order       |
| Interaction Behavior | Illustration fades/scales in once on mount (motion.base)                                                    |

Loading Skeleton

Placeholder shown while async data loads (account readiness, marketplace listings, transaction detail). *Corrected 2026-08-24: the former "balance" example is withdrawn — no balance surface exists to skeleton.*

|                      |                                                                                             |
|----------------------|---------------------------------------------------------------------------------------------|
| **Attribute**        | **Specification**                                                                           |
| Variants             | Card skeleton, List-row skeleton, Text-line skeleton                                        |
| States               | Animating only                                                                              |
| Spacing (8pt grid)   | Matches exact dimensions of the content it replaces to prevent layout shift                 |
| Accessibility        | Marked accessibilityElementsHidden with a single "Loading" live-region announcement instead |
| Interaction Behavior | Shimmer sweep left-to-right, motion.skeleton (1200ms linear loop)                           |

Avatar

Represents a user (self or counterparty) in headers, marketplace listings, and chat/dispute threads.

|                      |                                                                                             |
|----------------------|---------------------------------------------------------------------------------------------|
| **Attribute**        | **Specification**                                                                           |
| Variants             | Photo, Initials fallback, Gradient (system-generated per user), With verified badge overlay |
| States               | Default, With online indicator (future)                                                     |
| Spacing (8pt grid)   | Sizes: 24 / 32 (list), 40 (default), 64 (profile header); radius = full circle              |
| Accessibility        | accessibilityLabel reads full name, not "avatar"                                            |
| Interaction Behavior | No animation; verified badge fades in once on mount if applicable. **The badge uses the brand-primary family, not gold and not success-green** — verification is an identity fact, not a financial success state |

Notification Badge

Numeric or dot indicator for unread notifications on the bell icon and bottom nav.

|                      |                                                                                                                 |
|----------------------|-----------------------------------------------------------------------------------------------------------------|
| **Attribute**        | **Specification**                                                                                               |
| Variants             | Dot (unread indicator, no count), Numeric (count, caps at "9+")                                                 |
| States               | Hidden (zero state), Visible                                                                                    |
| Spacing (8pt grid)   | Dot 8px diameter; numeric pill min 16px height, radius full, positioned top-right offset -4/-4 from parent icon |
| Accessibility        | accessibilityLabel announces "3 unread notifications", not rendered as decorative                               |
| Interaction Behavior | Pop-in scale animation (0→1.1→1.0) over motion.fast when count increases                                        |

4.4 Overlays & Feedback

Modal

Interrupts flow for a decision requiring full attention (e.g., confirm match, cancel offer).

|                      |                                                                                                                 |
|----------------------|-----------------------------------------------------------------------------------------------------------------|
| **Attribute**        | **Specification**                                                                                               |
| Variants             | Center modal (Admin/web), Bottom sheet (mobile default)                                                         |
| States               | Entering, Open, Exiting                                                                                         |
| Spacing (8pt grid)   | radius.lg top corners (bottom sheet), max-width 480px (Admin), internal padding space.4, elevation.3            |
| Accessibility        | Focus trapped within modal; scrim is a live announcement boundary; dismiss via swipe-down (mobile) or Esc (web) |
| Interaction Behavior | Slides up + scrim fades in over motion.base; drag-to-dismiss on mobile with velocity-based completion           |

Toast

Transient, non-blocking confirmation or error (e.g., "Offer created", "Connection lost").

|                      |                                                                                                                             |
|----------------------|-----------------------------------------------------------------------------------------------------------------------------|
| **Attribute**        | **Specification**                                                                                                           |
| Variants             | Success, Error, Info                                                                                                        |
| States               | Entering, Visible (auto-dismiss 4s), Exiting, Persistent (error variant, manual dismiss)                                    |
| Spacing (8pt grid)   | Full-width minus space.4 margins, radius.md, positioned top-safe-area+space.2                                               |
| Accessibility        | Announced via accessibilityLiveRegion="assertive" for errors, "polite" for success                                          |
| Interaction Behavior | Slides down from top over motion.fast, auto-dismiss unless error (which requires manual dismiss or persists until resolved) |

4.5 Navigation

Bottom Navigation

Primary app navigation, persistent across top-level screens: **Home, Marketplace, Track, Cards, Profile**. **HUMAN APPROVED.**

> **Supersession history.** The original specification listed *Home, Cards, Scan, Analytics, Profile*. That was corrected to *Home, Marketplace, Track, Notifications, Profile* because Cards and Scan matched no MVP feature. The human decision now restores a **Cards** destination as **COMING SOON** and moves Notifications out of the bar. Both prior states are recorded so the reversal is visible rather than silent.

**Cards** must open a real Coming Soon destination — never a dead or disabled tab. That destination may explain the future feature and may later carry a notify-me/waitlist CTA if separately approved. It must expose **no active card functionality**, **no card balances**, and nothing implying stored-value wallet or card functionality.

**Notifications** are reached through the notification bell, the notification centre, and push notifications for time-sensitive events — conceptually: match available, replacement match, preparation deadline, funding deadline, partner confirmation, settlement/payout progress, dispute and support events. Exact push/SMS policy is **not frozen**. Notifications do not require a permanent bottom-navigation destination.

**Scan** does not exist in the product. **Analytics** is not in MVP scope.

|                      |                                                                                                                                                           |
|----------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Attribute**        | **Specification**                                                                                                                                         |
| Variants             | Default (5 items)                                                                                                                                         |
| States               | Item: inactive, active, badge-present                                                                                                                     |
| Spacing (8pt grid)   | Height 56px + safe area inset, icons 24px, active-item label visible, inactive labels visible per Apple HIG (not icon-only)                               |
| Accessibility        | Active tab communicated via accessibilityState selected=true, not color alone                                                                             |
| Interaction Behavior | Active indicator (4px dot or bar) animates position over motion.fast on tab change. **No elevated centre FAB affordance** — no Scan item exists. The Cards item carries a persistent *Coming Soon* affordance and is fully interactive |

5\. Screen Specifications

Canvas reference for all mobile screens: iPhone 16 Pro, 393×852pt, Light Mode, respecting safe areas, per UI_UX_SCREEN_SPEC.md. Admin (Next.js) equivalents follow a 1280px-wide desktop-first grid using the same token set and are noted where materially different.

> **ASSUMPTION:** *UI_UX_SCREEN_SPEC.md formally specifies only the Home screen. All other screens below are derived from PRODUCT_REQUIREMENTS_DOCUMENT.md’s MVP scope (Authentication, KYC, FX Marketplace, Matching Engine, Settlement, Transaction Timeline, Notifications) and ARCHITECTURE.md’s module list, extended into full screen specifications consistent with the established design language. These require design review sign-off before build.*

5.1 Onboarding & Authentication

Splash

|                    |                                                                                            |
|--------------------|--------------------------------------------------------------------------------------------|
| **Aspect**         | **Specification**                                                                          |
| Layout             | Full-bleed Primary Blue background, centered Xspeeria wordmark, no interactive elements    |
| Visual Hierarchy   | Single focal point: logo mark                                                              |
| Component Tree     | SafeAreaView \> LogoMark                                                                   |
| Navigation         | Auto-advances to Onboarding (first launch) or Home (returning, valid session) after 1200ms |
| Empty State        | N/A                                                                                        |
| Error State        | N/A (silent retry on session check failure, then routes to Login)                          |
| Loading State      | Logo scale-in 0→1.0 over motion.base                                                       |
| Micro-interactions | None (transient)                                                                           |
| Accessibility      | Respects reduce-motion: static logo, no scale animation                                    |

Onboarding

|                    |                                                                                                       |
|--------------------|-------------------------------------------------------------------------------------------------------|
| **Aspect**         | **Specification**                                                                                     |
| Layout             | 3-slide horizontal carousel, illustration top 60%, headline + body bottom 40%, pagination dots + Skip |
| Visual Hierarchy   | Illustration \> Headline \> Supporting copy \> CTA                                                    |
| Component Tree     | PagerView \> Slide\[\] \> (Illustration, Title, Body) + Bottom(Dots, SkipButton, NextButton)          |
| Navigation         | Swipe or Next through 3 slides → Register; Skip → Register directly                                   |
| Empty State        | N/A                                                                                                   |
| Error State        | N/A                                                                                                   |
| Loading State      | N/A (static content, no network)                                                                      |
| Micro-interactions | Slide transition follows finger 1:1 during drag; snap with motion.base spring on release              |
| Accessibility      | Each slide’s illustration marked decorative; headline read by screen reader on slide focus            |

Register

|                    |                                                                                                                                           |
|--------------------|-------------------------------------------------------------------------------------------------------------------------------------------|
| **Aspect**         | **Specification**                                                                                                                         |
| Layout             | Scrollable form: header, full name, email, phone, password (with strength meter), terms checkbox, primary CTA, login link                 |
| Visual Hierarchy   | Title \> Form fields (top-to-bottom) \> Legal checkbox \> CTA \> Secondary link                                                           |
| Component Tree     | ScrollView \> Header \> FormFields\[TextInput\] \> PasswordStrengthMeter \> Checkbox \> PrimaryButton \> GhostButton(link)                |
| Navigation         | Submit → OTP (email/phone verification); "Log in" link → Login                                                                            |
| Empty State        | N/A                                                                                                                                       |
| Error State        | Inline per-field validation errors (Error state on Text Input) + banner for server-side errors (e.g., email already registered)           |
| Loading State      | Primary Button shows Loading state during submission; fields disabled during submit                                                       |
| Micro-interactions | Password strength meter animates color/width over motion.fast per keystroke (debounced)                                                   |
| Accessibility      | Password field has a visible show/hide toggle with accessibilityLabel "Show password"; strength meter has text equivalent, not color-only |

Login

|                    |                                                                                                                                             |
|--------------------|---------------------------------------------------------------------------------------------------------------------------------------------|
| **Aspect**         | **Specification**                                                                                                                           |
| Layout             | Centered form: logo, email, password, "Forgot password?" link, primary CTA, "Create account" link, biometric quick-login button if enrolled |
| Visual Hierarchy   | Logo \> Form \> Forgot link \> CTA \> Secondary link \> Biometric shortcut                                                                  |
| Component Tree     | ScrollView \> Logo \> FormFields \> GhostButton(forgot) \> PrimaryButton \> GhostButton(register) \> BiometricButton                        |
| Navigation         | Submit → MFA (if enabled) or Home; Forgot Password link → Forgot Password; Register link → Register                                         |
| Empty State        | N/A                                                                                                                                         |
| Error State        | Inline field errors + banner for invalid credentials (rate-limited after 5 attempts per the applicable approved security policy)                                |
| Loading State      | Primary Button Loading state                                                                                                                |
| Micro-interactions | Biometric icon pulses once on screen mount if Face ID/Touch ID available                                                                    |
| Accessibility      | Rate-limit lockout message explicitly states retry time, announced via live region                                                          |

Forgot Password

|                    |                                                                         |
|--------------------|-------------------------------------------------------------------------|
| **Aspect**         | **Specification**                                                       |
| Layout             | Single email field, explanatory copy, submit CTA, back link             |
| Visual Hierarchy   | Title \> Explanation \> Email field \> CTA                              |
| Component Tree     | ScrollView \> Header \> TextInput \> PrimaryButton \> GhostButton(back) |
| Navigation         | Submit → confirmation screen ("check your email") → back to Login       |
| Empty State        | N/A                                                                     |
| Error State        | Inline email-format validation                                          |
| Loading State      | Primary Button Loading state                                            |
| Micro-interactions | Confirmation state cross-fades in place of form (motion.base)           |
| Accessibility      | Confirmation message announced via live region on submit success        |

MFA

|                    |                                                                                                                     |
|--------------------|---------------------------------------------------------------------------------------------------------------------|
| **Aspect**         | **Specification**                                                                                                   |
| Layout             | OTP Input component, countdown resend timer, channel indicator (SMS/Email/Authenticator)                            |
| Visual Hierarchy   | Channel indicator \> OTP Input \> Resend timer/link                                                                 |
| Component Tree     | Header \> OTPInput \> CountdownText/ResendGhostButton                                                               |
| Navigation         | Auto-submits on 6th digit → Home (or next protected screen); "Use another method" → channel selection               |
| Empty State        | N/A                                                                                                                 |
| Error State        | Error state on OTP Input + shake animation on incorrect code; lockout after configured max attempts per the applicable approved security policy |
| Loading State      | Digits disabled during verification call; spinner overlays OTP row                                                  |
| Micro-interactions | Success: OTP row flashes success-green border before navigation                                                     |
| Accessibility      | Resend button disabled state clearly communicated with remaining-seconds label, not just grayed out                 |

5.2 Core Application

Home

|                    |                                                                                                                                                                                                                                                                                                   |
|--------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Aspect**         | **Specification**                                                                                                                                                                                                                                                                                 |
| Layout             | **HUMAN APPROVED.** Header (gradient avatar, greeting, notification bell) \> **Account Readiness Region** \> **Primary action** (**Create or browse an offer** — exactly one action whose destination is the **Marketplace**; *corrected 2026-08-24: "create / browse offer" read as a choice between two destinations. Home routes to the Marketplace, which may itself offer create and browse*) \> **Active activity** \> Recent activity (up to 3 cards) \> Bottom Navigation. **No Balance Card, no balance figure, no wallet ID, no currency selector tied to a balance, and no wallet-style quick actions (Deposit, Send, Utility)** |
| Visual Hierarchy   | Account Readiness is dominant while any requirement is outstanding; once it collapses, the primary action and Active activity lead. **No single aggregate currency figure occupies the hero region under any condition** — that visual affordance reads as a balance regardless of its label |
| Component Tree     | SafeAreaView \> Header \> AccountReadinessRegion \> PrimaryAction \> ActiveActivitySection \> RecentActivitySection(TransactionCard×3) \> BottomNavigation |
| Navigation         | Bell → Notification centre; readiness dimension → its completion flow (KYC, MFA enrolment); primary action → **Marketplace** (single destination; the Home primary action is **Create or browse an offer**, and the Marketplace owns the subsequent create and browse actions. *Corrected 2026-08-24: the former "Create Offer or Marketplace" published two competing destinations for one primary action and contradicted the Layout row above*); activity item → Match Details or Settlement Tracking by current stage; Bottom Nav → Home, Marketplace, Track, Cards *(Coming Soon)*, Profile |
| Active activity    | Discrete items: open Offers, MatchAllocations requiring attention, in-flight settlement activity. The most time-critical item surfaces first. **Amounts remain attached to the individual Offer or allocation they belong to and are never summed into one figure** |

> **Terminology note.** **`MatchAllocation`** is canonical **product language** for one accepted
> partial or full allocation of an Offer. It maps to the existing persisted/API entity **`Match`**
> — there is **no separate `MatchAllocation` table or entity**. See the canonical glossary in
> `DOCUMENT_INDEX.md` §2A.

| Empty State        | Active activity: "No active offers — create your first offer." Recent activity: "No transactions yet." Both name a next action |
| Error State        | Readiness region and Active activity each show a compact inline error + retry independently; the rest of the screen remains interactive |
| Loading State      | Readiness region, Active activity and Transaction Cards render Loading Skeletons matching final dimensions on cold load |
| Micro-interactions | Readiness dimensions resolve in place; pull-to-refresh triggers a brief flat-fill pulse. **No count-up animation on any currency figure** — that motion is a balance affordance |
| Accessibility      | Readiness state is conveyed as text, never colour alone. **No show/hide privacy toggle is required or permitted** — the shoulder-surfing concern is removed at source by having no balance, rather than hidden behind a toggle |

Marketplace

|                    |                                                                                                                                  |
|--------------------|----------------------------------------------------------------------------------------------------------------------------------|
| **Aspect**         | **Specification**                                                                                                                |
| Layout             | Segmented control (Offers / Requests), filter bar (currency, amount range, rate), scrollable list of listing cards, FAB "Create" |
| Visual Hierarchy   | Segmented control \> Filters \> Listings (rate-sorted) \> FAB                                                                    |
| Component Tree     | Header \> SegmentedControl \> FilterBar \> FlatList(ListingCard) \> FAB                                                          |
| Navigation         | Tap listing → Offer Details / Match Details; FAB → Create Offer or Create Request (context menu)                                 |
| Empty State        | Illustration + "No offers match your filters" with "Clear filters" CTA                                                           |
| Error State        | Inline retry banner if listings fail to load, cached last-known list shown if available                                          |
| Loading State      | Listing list renders 5 skeleton rows on load                                                                                     |
| Micro-interactions | New listings matching active filters slide in from top with a brief highlight pulse                                              |
| Accessibility      | Filter bar fully operable via screen reader with explicit "N filters active" summary                                             |

Create Offer

|                    |                                                                                                           |
|--------------------|-----------------------------------------------------------------------------------------------------------|
| **Aspect**         | **Specification**                                                                                         |
| Layout             | Multi-step form: amount + currency pair → desired rate → settlement window → review                       |
| Visual Hierarchy   | Step indicator \> Current step form \> Primary CTA (Next/Submit)                                          |
| Component Tree     | ScrollView \> StepIndicator \> StepForm(varies) \> PrimaryButton \> GhostButton(back)                     |
| Navigation         | Next through steps → Review → Submit → Offer Details (confirmation)                                       |
| Empty State        | N/A                                                                                                       |
| Error State        | Inline validation per step (e.g., rate outside market band triggers a warning, not a hard block)          |
| Loading State      | Submit shows Loading state; step transitions have no network dependency until final submit                |
| Micro-interactions | Step indicator segment fills over motion.fast on advance; rate-vs-market comparison bar animates on entry |
| Accessibility      | Step indicator announces "Step 2 of 4: Desired rate" on each transition                                   |

Create Request

|                    |                                                                              |
|--------------------|------------------------------------------------------------------------------|
| **Aspect**         | **Specification**                                                            |
| Layout             | Mirrors Create Offer structure with inverted currency direction framing      |
| Visual Hierarchy   | Identical structure to Create Offer                                          |
| Component Tree     | Identical component tree to Create Offer                                     |
| Navigation         | Identical navigation pattern to Create Offer, terminating at Request Details |
| Empty State        | N/A                                                                          |
| Error State        | Identical validation pattern to Create Offer                                 |
| Loading State      | Identical to Create Offer                                                    |
| Micro-interactions | Identical to Create Offer                                                    |
| Accessibility      | Identical to Create Offer                                                    |

Offer Details

|                    |                                                                                                                                                       |
|--------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Aspect**         | **Specification**                                                                                                                                     |
| Layout             | Offer summary card, counterparty preview (rating, verification badge), rate breakdown, action buttons (Accept / Edit / Cancel depending on ownership) |
| Visual Hierarchy   | Offer summary dominant, counterparty trust signals secondary, actions bottom-anchored                                                                 |
| Component Tree     | ScrollView \> OfferSummaryCard \> CounterpartyPreview \> RateBreakdownTable \> ActionButtonRow                                                        |
| Navigation         | Accept → Match Details; Edit → Create Offer (pre-filled); Cancel → confirmation Modal → Marketplace                                                   |
| Empty State        | N/A (offer existence is precondition for screen)                                                                                                      |
| Error State        | Full-screen error state if offer was withdrawn/expired since navigation, with "Back to Marketplace" CTA                                               |
| Loading State      | Full-card skeleton on load                                                                                                                            |
| Micro-interactions | Accept CTA shows a brief confirming pulse before transitioning to Match Details                                                                       |
| Accessibility      | Counterparty verification badge renders in the **brand-primary family with an explicit text label ("KYC Verified")** — never gold. Gold is decorative/rating-only and must not represent KYC approval or verified identity (`docs/09-ui-ux/DESIGN_SYSTEM.md`, *Accent / gold*); the earlier "not gold-icon-only" wording understated that rule and is superseded |

Match Details

|                    |                                                                                                                                                    |
|--------------------|----------------------------------------------------------------------------------------------------------------------------------------------------|
| **Aspect**         | **Specification**                                                                                                                                  |
| Layout             | Matched-pair summary (both parties, agreed rate, amounts), settlement instructions, status timeline preview, chat/dispute entry point              |
| Visual Hierarchy   | Match confirmation banner top, settlement instructions center, status timeline bottom                                                              |
| Component Tree     | Header \> MatchConfirmationBanner \> SettlementInstructionsCard \> StatusTimelinePreview \> ActionRow(Message, Dispute)                            |
| Navigation         | Proceed → Settlement Tracking; Message → in-app thread; Dispute → Disputes flow                                                                    |
| Empty State        | N/A                                                                                                                                                |
| Error State        | Banner-level error if match was invalidated (counterparty cancelled) with clear next-step CTA                                                      |
| Loading State      | Skeleton on initial load                                                                                                                           |
| Micro-interactions | Confirmation banner celebrates with a single restrained checkmark animation (motion.slow), not confetti — consistent with "calm confidence" pillar |
| Accessibility      | Status timeline items individually announced in reading order with current step flagged "current"                                                  |

Settlement Tracking

|                    |                                                                                                                                       |
|--------------------|---------------------------------------------------------------------------------------------------------------------------------------|
| **Aspect**         | **Specification**                                                                                                                     |
| Layout             | Step-by-step settlement progress rendered per leg — your leg precisely, the counterparty's coarsely (Awaiting → Funded → Releasing → Paid out) — plus the overall `Transaction.status` projection, estimated time remaining, and support entry point (ADR-001 / DEC-003). Legs may complete at different times; present that as normal. A `recovery` state is shown explicitly, never folded into a generic failure |
| Visual Hierarchy   | Vertical stepper is dominant element                                                                                                  |
| Component Tree     | Header \> VerticalStepper(steps\[\]) \> EstimatedTimeText \> SupportLinkRow                                                           |
| Navigation         | Tap "Get help" → Support; automatic navigation to success state on completion webhook                                                 |
| Empty State        | N/A                                                                                                                                   |
| Error State        | Failed-step state highlighted in alert-red on the stepper itself with explanation + "Contact support" CTA                             |
| Loading State      | Current/future steps shown de-emphasized (gray) until reached; no full-screen skeleton needed as structure is known upfront           |
| Micro-interactions | Completed step transitions from pending (gray) to success-green with a checkmark draw-on animation over motion.base                   |
| Accessibility      | Each step change is announced via a polite live region so users tracking passively are informed of progress                           |

Transaction Timeline

|                    |                                                                                                                                          |
|--------------------|------------------------------------------------------------------------------------------------------------------------------------------|
| **Aspect**         | **Specification**                                                                                                                        |
| Layout             | Chronological list of all transaction events (created, matched, settled) as a vertical activity feed with full transaction detail on tap |
| Visual Hierarchy   | Reverse-chronological feed, most recent at top                                                                                           |
| Component Tree     | FlatList(TimelineEventCard) grouped by date headers                                                                                      |
| Navigation         | Tap event → relevant detail screen (Match Details / Settlement Tracking / Dispute)                                                       |
| Empty State        | Illustration + "No activity yet" with CTA to Marketplace                                                                                 |
| Error State        | Inline retry banner, cached data shown if available                                                                                      |
| Loading State      | 6 skeleton rows on cold load                                                                                                             |
| Micro-interactions | New events entering at top slide in with a brief highlight                                                                               |
| Accessibility      | Date group headers are sticky and separately announced when scrolled past                                                                |

5.3 Account & Support

Notifications

|                    |                                                                                              |
|--------------------|----------------------------------------------------------------------------------------------|
| **Aspect**         | **Specification**                                                                            |
| Layout             | Grouped list (Today / This week / Earlier), read/unread visual distinction, swipe-to-dismiss |
| Visual Hierarchy   | Chronological groups, unread items visually weighted                                         |
| Component Tree     | SectionList(NotificationRow) grouped by recency                                              |
| Navigation         | Tap notification → relevant deep link (transaction, dispute, KYC status)                     |
| Empty State        | Illustration + "You’re all caught up"                                                        |
| Error State        | Inline retry banner                                                                          |
| Loading State      | 4 skeleton rows                                                                              |
| Micro-interactions | Unread dot fades out on read (motion.fast) rather than disappearing instantly                |
| Accessibility      | Unread state communicated via accessibilityLabel prefix "Unread:", not dot color alone       |

KYC

|                    |                                                                                                                                     |
|--------------------|-------------------------------------------------------------------------------------------------------------------------------------|
| **Aspect**         | **Specification**                                                                                                                   |
| Layout             | Multi-step: personal details → document capture (camera) → selfie liveness → review → pending/approved/rejected status screen       |
| Visual Hierarchy   | Step indicator \> current step \> progress reassurance copy                                                                         |
| Component Tree     | StepIndicator \> StepForm/CameraCapture \> PrimaryButton                                                                            |
| Navigation         | Advances through steps → Pending Review screen → (async) Approved/Rejected notification → Profile                                   |
| Empty State        | N/A                                                                                                                                 |
| Error State        | Rejected state gives specific, actionable reason (e.g., "Document photo blurry — retake") never a generic failure                   |
| Loading State      | Document upload shows determinate progress bar, not indeterminate spinner                                                           |
| Micro-interactions | Camera capture frame pulses in the success family (`color.success.border` `#059669`) on successful document edge-detection — **not gold**, which is no longer a success signal lock                                                         |
| Accessibility      | Camera-based steps include a manual file-upload fallback for users unable to use camera capture (accessibility + device constraint) |

Profile

|                    |                                                                                                                      |
|--------------------|----------------------------------------------------------------------------------------------------------------------|
| **Aspect**         | **Specification**                                                                                                    |
| Layout             | Avatar + name + verification badge header, account details list, linked bank accounts, security section entry        |
| Visual Hierarchy   | Identity header dominant, settings list below                                                                        |
| Component Tree     | Header(Avatar, Name, Badge) \> ListSection(AccountDetails) \> ListSection(LinkedAccounts) \> ListSection(Security)   |
| Navigation         | Each row → respective detail/edit screen; Security → Settings (security tab)                                         |
| Empty State        | N/A (profile always exists post-registration)                                                                        |
| Error State        | Inline error only on specific failed sub-section (e.g., linked accounts fetch fails independently of profile header) |
| Loading State      | Header + list skeleton on cold load                                                                                  |
| Micro-interactions | Verification badge appears with a subtle scale-in once KYC approval is confirmed                                     |
| Accessibility      | Each list row meets 44px minimum touch target regardless of visual density                                           |

Settings

|                    |                                                                                                            |
|--------------------|------------------------------------------------------------------------------------------------------------|
| **Aspect**         | **Specification**                                                                                          |
| Layout             | Grouped settings list: Notifications, Security (MFA, biometric, password), Language/Region, Legal, Log out |
| Visual Hierarchy   | Standard iOS-pattern grouped list                                                                          |
| Component Tree     | SectionList(SettingsRow, toggles/chevrons as appropriate)                                                  |
| Navigation         | Each row → sub-screen or inline toggle; Log out → confirmation Modal → Login                               |
| Empty State        | N/A                                                                                                        |
| Error State        | Toggle-level inline error if a preference fails to save, with automatic revert                             |
| Loading State      | N/A (static list, toggles show brief inline spinner on save)                                               |
| Micro-interactions | Toggle switches animate over motion.instant per platform-native conventions                                |
| Accessibility      | Toggles expose accessibilityRole="switch" with current state announced                                     |

Support

|                    |                                                                                                      |
|--------------------|------------------------------------------------------------------------------------------------------|
| **Aspect**         | **Specification**                                                                                    |
| Layout             | FAQ search, categorized help articles, "Contact us" entry (chat/ticket), active ticket status if any |
| Visual Hierarchy   | Search dominant at top, categories below, contact CTA persistent                                     |
| Component Tree     | SearchField \> CategoryGrid \> ArticleList \> PersistentContactButton                                |
| Navigation         | Article tap → article detail; Contact → new ticket flow or existing thread                           |
| Empty State        | "No results" state within search specifically, not the whole screen                                  |
| Error State        | Inline retry for article list                                                                        |
| Loading State      | Skeleton for category grid and article list independently                                            |
| Micro-interactions | Search results fade in as user types (debounced)                                                     |
| Accessibility      | Category grid items are equally sized touch targets ≥ 44px regardless of label length                |

Disputes

|                    |                                                                                                                |
|--------------------|----------------------------------------------------------------------------------------------------------------|
| **Aspect**         | **Specification**                                                                                              |
| Layout             | Dispute list (open/resolved), dispute detail with evidence thread, file-upload for evidence, resolution status |
| Visual Hierarchy   | List view → detail thread pattern, consistent with Transaction Timeline                                        |
| Component Tree     | FlatList(DisputeCard) → DisputeDetailThread(Message/Evidence items) \> EvidenceUploadRow                       |
| Navigation         | Open dispute → detail thread; "Raise dispute" (from Match Details) → new dispute form                          |
| Empty State        | Illustration + "No disputes" (positive-framed empty state)                                                     |
| Error State        | Inline retry on thread load failure                                                                            |
| Loading State      | Skeleton list + skeleton thread independently                                                                  |
| Micro-interactions | New message/evidence item slides in at bottom of thread with auto-scroll                                       |
| Accessibility      | Evidence thread items announced in chronological order with sender identity explicit                           |

5.4 Business & Admin

Business Dashboard

|                    |                                                                                                                          |
|--------------------|--------------------------------------------------------------------------------------------------------------------------|
| **Aspect**         | **Specification**                                                                                                        |
| Layout             | SME/importer-oriented summary: aggregate FX volume, active offers/requests, settlement calendar, downloadable statements |
| Visual Hierarchy   | KPI summary cards top, activity/calendar below                                                                           |
| Component Tree     | Header \> KPICardRow \> SettlementCalendar \> RecentActivityList \> ExportButton                                         |
| Navigation         | KPI cards → filtered Transaction Timeline; Export → statement generation (async, notification on ready)                  |
| Empty State        | Illustration + "No business activity yet — verify your business account" if business KYC incomplete                      |
| Error State        | Inline retry per KPI card independently (cards are independently fetched)                                                |
| Loading State      | KPI cards and calendar show independent skeletons                                                                        |
| Micro-interactions | KPI numbers count up on load; calendar date cells highlight on hover (web) / press (mobile)                              |
| Accessibility      | KPI cards expose full value + label + trend direction as a single accessible string, not three separate fragments        |

Admin Mobile

|                    |                                                                                                                                     |
|--------------------|-------------------------------------------------------------------------------------------------------------------------------------|
| **Aspect**         | **Specification**                                                                                                                   |
| Layout             | Condensed admin console for on-call operations staff: pending KYC queue, dispute queue, system health snapshot                      |
| Visual Hierarchy   | Queue-first layout, system health as a persistent top strip                                                                         |
| Component Tree     | HealthStripBanner \> TabBar(KYC Queue / Disputes / Alerts) \> QueueList(ActionableCard)                                             |
| Navigation         | Queue item → detail/action screen (approve/reject KYC, resolve dispute) with RBAC-gated actions per the applicable approved security policy                     |
| Empty State        | Illustration + "Queue clear" (positive)                                                                                             |
| Error State        | Full-screen retry state if queue fails to load (this is an operational tool; silent partial failure is not acceptable)              |
| Loading State      | List skeleton                                                                                                                       |
| Micro-interactions | Approved/resolved items animate out of the queue list (slide + fade) rather than instantly vanishing                                |
| Accessibility      | Destructive/high-consequence actions (reject KYC, force-resolve dispute) require an explicit confirmation Modal, never a single tap |

6\. Motion & Animation

6.1 Motion Principles

- Motion communicates causality: an action always has a visible, proportionate reaction.

- No motion exceeds 400ms outside of intentional celebratory moments (match confirmed, settlement completed), which cap at 600ms.

- All motion respects the OS-level "Reduce Motion" accessibility setting by substituting cross-fades for spatial movement, or removing animation entirely for skeleton shimmer.

6.2 Signature Moments

|                      |                                                                       |              |                                                                                              |
|----------------------|-----------------------------------------------------------------------|--------------|----------------------------------------------------------------------------------------------|
| **Moment**           | **Animation**                                                         | **Duration** | **Rationale**                                                                                |
| Match Confirmed      | Single checkmark draw-on + gentle scale pulse                         | 500ms        | Marks a trust-critical milestone without being celebratory-excessive for a financial context |
| Settlement Completed | Stepper final node fills success-green; the settlement item moves to its completed state | 600ms        | Marks completion of that settlement. **No balance exists to update and no count-up may run** |
| Activity Refresh     | Subtle shimmer sweep across the Account Readiness Region and activity items | 400ms        | Signals live data without a jarring reload. **Withdrawn: the former "Balance Refresh" entry** |
| Error Shake          | Horizontal ±4px shake, 2 cycles                                       | 240ms        | Immediate, low-ambiguity error signal                                                        |

7\. Accessibility

Xspeeria targets WCAG 2.1 AA conformance across mobile and admin surfaces, treating accessibility as a compliance and trust requirement consistent with a regulated financial product, not an optional enhancement.

7.1 Standards Checklist

|                      |                                                                                                                                          |
|----------------------|------------------------------------------------------------------------------------------------------------------------------------------|
| **Requirement**      | **Implementation Rule**                                                                                                                  |
| Color contrast       | All text meets 4.5:1 minimum (3:1 for large text ≥18pt); verified programmatically in CI against the token set                           |
| Touch targets        | Minimum 44×44pt for every interactive element, including icon-only buttons                                                               |
| Dynamic Type         | All text scales with OS-level type-size settings up to at least 200%; layouts use flex/auto-height, never fixed-height text containers   |
| VoiceOver / TalkBack | Every screen has a logical reading order matching visual hierarchy; all interactive elements have explicit accessibilityLabel/Role/State |
| Color independence   | Status is never communicated by color alone (paired with text label or icon+text)                                                        |
| Motion sensitivity   | Reduce Motion setting is respected globally per the Motion & Animation section                                                           |
| Form errors          | Errors are associated with their field programmatically (accessibilityDescribedBy) and announced via live region on submit               |
| Focus management     | Modal/bottom-sheet open moves focus to the sheet; close returns focus to the triggering element                                          |

7.2 Testing Cadence

Accessibility conformance is verified at three checkpoints: (1) automated contrast/touch-target linting in CI on every component PR, (2) manual VoiceOver/TalkBack pass on every new screen before merge, (3) full WCAG AA audit each quarter ahead of the design review cycle defined on the cover page.

Appendix A: Open Design Decisions

The following items require explicit product/design sign-off before implementation, as they extend beyond the source specification documents:

- ~~Balance visibility default (shown vs. hidden-by-default) on Home.~~ **RESOLVED — HUMAN APPROVED.** Moot: Xspeeria has no balance of any kind, so there is nothing to show or hide. See §4.3 and the Home screen specification.

- ~~Whether "Cards" and "Analytics" are in MVP scope.~~ **RESOLVED — HUMAN APPROVED.** **Cards** occupies a bottom-navigation destination as **Coming Soon**, opening a real explanatory destination — not a dead or disabled tab, and exposing no card functionality, no card balance, and nothing implying stored-value wallet or card functionality. **Analytics** is not in MVP and has no destination. **Scan** does not exist in the product.

- Final icon set licensing (Phosphor vs. SF Symbols-derived custom set) for cross-platform parity.

- Whether Admin (Next.js) requires a distinct component library instance or directly consumes the mobile token set via a shared package.
