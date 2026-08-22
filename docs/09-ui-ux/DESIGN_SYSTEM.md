
# XSPEERIA BRAND DESIGN SYSTEM

> **APPLICATION UI COLOUR AUTHORITY — FIGMA.** For application UI/UX, the Xspeeria Figma is the
> **primary visual source of truth**. The values below are **FIGMA-OBSERVED COLOURS / CANDIDATE
> APPLICATION TOKENS**, read from the Figma Design System page and from actual fills. They are
> **not frozen production tokens**: the Figma contains painted swatches, **not** a bound
> token/variable system, so no production token set exists yet and none may be claimed. Freezing
> requires human approval. Logo/brand-asset colours are a **separate question** — see `PRODUCT.md`
> “Brand Commitments”.

Primary: #1F3A8A
Secondary: #3B82F6
Application canvas / pure white: #FFFFFF
Supporting soft surface (secondary/sunken regions only, never the screen background): #F8F9FD
Border / divider: #E5E7EB
Headline text: #111827
Body text: #4B5563
Disabled text: #9CA3AF
Success: #10B981
Warning: #F59E0B
Error: #EF4444

> **Figma documentation defect — recorded, not corrected here.** The Figma Success swatch has a
> fill of `#10B981` while its visible text label reads `#FFFFFF`. The **observed fill `#10B981`
> governs**; the label is a defect in the Figma and should be fixed at source. This repository
> does not modify the Figma.

> **RESOLVED — HUMAN APPROVED, 2026-08-22.** The observed Figma palette contains **no accent or
> gold role**, and `#F4C21F` is **not** Figma-confirmed. Gold is retained for **decorative rating
> indicators only** and is not a status colour. Full restriction and the identity-verification
> consequence are in *Accent / gold* below.

> **Superseded values.** `#001B68` (primary), `#179A43` (success), `#E52421` (error) and `#F8FAFC`
> (supporting surface) were the pre-Figma application values. `#FFFFFF` as the primary canvas is
> unchanged and remains consistent with both the Figma and the human decision in `PRODUCT.md`
> “Brand Commitments”, 2026-08-20.

> **`UNKNOWN — NOT VERIFIED` — accessibility consequences of the Figma palette.** Measured WCAG 2.1
> contrast against the `#FFFFFF` canvas, computed from the hex values above. These are **findings
> for human design review, not approved remedies** — no colour has been altered to fix them:
>
> | Figma colour | Ratio on `#FFFFFF` | Consequence |
> |---|---|---|
> | Primary `#1F3A8A` | 10.34:1 | Passes AA/AAA as text; white-on-primary is also 10.34:1 |
> | Headline text `#111827` | 17.74:1 | Passes AAA |
> | Body text `#4B5563` | 7.56:1 | Passes AAA for normal text |
> | Secondary `#3B82F6` | 3.68:1 | **Fails** AA 4.5:1 for normal-size text; passes 3:1 for large text and UI components. White text on `#3B82F6` is likewise 3.68:1 |
> | Error `#EF4444` | 3.76:1 | **Fails** AA 4.5:1 for normal-size text; white-on-error is 3.76:1 |
> | Success `#10B981` | 2.54:1 | **Fails** AA text and the 3:1 non-text/UI-component threshold; white-on-success is 2.54:1 |
> | Warning `#F59E0B` | 2.15:1 | **Fails** AA text and 3:1 non-text; requires dark text on the fill |
> | Disabled text `#9CA3AF` | 2.54:1 | Permitted only because disabled controls are exempt from WCAG 1.4.3; must never carry meaning alone |
> | Border/divider `#E5E7EB` | 1.24:1 | **Fails** the 3:1 threshold for meaningful UI boundaries; acceptable for purely decorative dividers only |
> | Supporting surface `#F8F9FD` | 1.05:1 | Effectively no separation from the canvas — panels must be distinguished by border, elevation or spacing, never by fill alone |
>
> Status and feedback colours must therefore never be the **sole** carrier of meaning: pair every
> success/warning/error state with an icon and text label. Resolving the failing ratios is a human
> design decision and must not be resolved by silently darkening the Figma values.

---

# Semantic token architecture — **HUMAN APPROVED**

**IMPLEMENTATION STATUS: NOT IMPLEMENTED. VERIFICATION STATUS: NOT VERIFIED.** No application
code exists and no code consumes these tokens. This section is normative design documentation only.

## Tiers

```
PRIMITIVE   raw values — never referenced by a component
   ↓
SEMANTIC    the only tier application components may consume
   ↓
COMPONENT   exceptions only; expect near-zero
```

Rules, all **HUMAN APPROVED**:

- Application components consume **semantic** tokens. They do not reference primitives.
- Names are **role-based**, not hue-based: `color.brand.primary`, never `color.primary.blue`.
- **No 50–950 ramp is exposed to product code.** Ramps live in the primitive tier.
- No component-specific token unless a genuine exception is demonstrated.
- Alpha derivations (10% tints and similar) are computed, not tokenised, unless a real reusable
  role requires one.
- **No `info` status family** until an actual product need exists.

## Semantic tokens

Contrast is measured WCAG 2.1, against `color.bg.canvas` `#FFFFFF` unless stated.

### Surfaces

| Token | Value | Role | Contrast |
|---|---|---|---|
| `color.bg.canvas` | `#FFFFFF` | Primary application canvas — the default screen background | — |
| `color.bg.sunken` | `#F8F9FD` | Supporting/sunken surface **only**: grouped list backgrounds, table header rows, read-only recaps, empty states | 1.05:1 vs canvas |
| `color.bg.overlay` | `#00000066` | Modal scrim | — |

`color.bg.sunken` provides **almost no separation on its own**. It must be paired with border,
spacing or elevation — never relied on as the sole separator, and never inverted into a
soft-grey page behind white cards, which measures the same 1.05:1.

### Text

| Token | Value | Role | Contrast |
|---|---|---|---|
| `color.text.primary` | `#111827` | Headings, high-emphasis labels, primary content | 17.74:1 ✓ AAA |
| `color.text.secondary` | `#4B5563` | **Body copy**, descriptions, supporting text, metadata | 7.56:1 ✓ AAA |
| `color.text.disabled` | `#9CA3AF` | **Genuinely disabled/inactive text only** | 2.54:1 — permitted only under the WCAG 1.4.3 disabled exemption; must never be the sole carrier of meaning |
| `color.text.on-fill` | `#FFFFFF` | Text on a filled brand or status surface | see each fill |

**HUMAN APPROVED, 2026-08-22 — the text role separation is frozen.** `color.text.secondary`
`#4B5563` is the normal supporting/body-text colour: it is directly **FIGMA OBSERVED**, carries
7.56:1 on the canvas, and holds a role distinct from `color.text.primary`.

**`color.border.strong` `#6B7280` is not a text token.** It is a boundary value. Where `#6B7280`
appears as readable text it is scoped to a specific interaction/component state — the disabled
control treatment (fill `#F3F4F6`, label `#6B7280`) — and that usage must never be generalised
into `color.text.secondary`.

### Borders

| Token | Value | Role | Contrast |
|---|---|---|---|
| `color.border.subtle` | `#E5E7EB` | **Decorative only** — dividers, table rules, container edges | 1.24:1 |
| `color.border.strong` | `#6B7280` | **Meaningful boundaries** — text inputs, selectable rows, interactive form fields, any boundary that communicates structure or input affordance | 4.83:1 ✓ |
| `color.border.focus` | `#1D4ED8` | Focus ring | 6.70:1 ✓ |

**Normative:** `color.border.subtle` **must not** be the sole boundary of a text input, a
selectable row, or any interactive form field. At 1.24:1 it fails the 3:1 non-text threshold, so
such a control is not perceivable. Use `color.border.strong`.

### Brand

| Token | Value | Role | Contrast |
|---|---|---|---|
| `color.brand.primary` | `#1F3A8A` | Brand identity, primary buttons, headers, active nav, links | 10.34:1 ✓; `#FFFFFF` on it 10.34:1 ✓ |
| `color.brand.secondary` | `#3B82F6` | Accent, icons, **large text only** (≥18.66px bold / 24px), meaningful boundaries | 3.68:1 — **fails AA for normal-size text**; passes 3:1 for large text and UI components. For normal-size text or a small filled label, use `#2563EB` (5.17:1) |

### Status families

One colour does not perform every role. **HUMAN APPROVED.** The Figma base is preserved in every
family; the darker values are **additions, not replacements**.

| Family | `.fill` (base) | `.surface` | `.border` | `.text` |
|---|---|---|---|---|
| `color.success` | `#10B981` **FIGMA OBSERVED** | `#ECFDF5` | `#059669` | `#047857` |
| `color.warning` | `#F59E0B` **FIGMA OBSERVED** | `#FFFBEB` | `#D97706` | `#B45309` |
| `color.error` | `#EF4444` **FIGMA OBSERVED** | `#FEF2F2` | `#EF4444` | `#B91C1C` |

Measured, and the constraints that follow from the measurements:

| Value | On canvas | On its own surface | Permitted use |
|---|---|---|---|
| `success.fill` `#10B981` | 2.54:1 | — | Filled badge **with `color.text.primary` `#111827`** (6.99:1 ✓). **Not** a standalone icon on canvas (< 3:1), **not** text, **not** a boundary |
| `success.border` `#059669` | 3.77:1 ✓ | 3.58:1 ✓ | Meaningful boundary, icon |
| `success.text` `#047857` | 5.48:1 ✓ | 5.21:1 ✓ | Normal-size text |
| `success.surface` `#ECFDF5` | 1.05:1 | — | Banner/chip background; `color.text.primary` on it 16.84:1 ✓ |
| `warning.fill` `#F59E0B` | 2.15:1 | — | Filled badge **with `#111827`** (8.26:1 ✓). **Not** a standalone icon, text or boundary |
| `warning.border` `#D97706` | 3.19:1 ✓ | 3.07:1 ✓ | Meaningful boundary, icon — marginal; prefer `#B45309` where a safety margin matters |
| `warning.text` `#B45309` | 5.02:1 ✓ | 4.84:1 ✓ | Normal-size text |
| `warning.surface` `#FFFBEB` | 1.04:1 | — | Banner/chip background |
| `error.fill` `#EF4444` | 3.76:1 | — | Icon ✓, large text ✓, boundary ✓, filled badge with `#111827` (4.71:1 ✓). **Not** normal-size text, and **not** a fill carrying a white normal-size label (3.76:1) |
| `error.border` `#EF4444` | 3.76:1 ✓ | — | Meaningful boundary — no separate value needed |
| `error.text` `#B91C1C` | 6.47:1 ✓ | **5.91:1 ✓** | Normal-size text. **`#DC2626` is deliberately not used**: it measures 4.41:1 on `error.surface`, below AA for normal text |
| `error.surface` `#FEF2F2` | 1.09:1 | — | Banner/chip background |

**Normative:** a status colour is never the sole carrier of meaning. Every success, warning and
error state pairs colour with an icon **and** a text label.

### Primary interaction states

**HUMAN APPROVED as candidate application states.** They remain candidate production tokens until
the design-system freeze completes.

| Token | Value | `color.text.on-fill` on it |
|---|---|---|
| `interaction.primary.default` | `#1F3A8A` | 10.34:1 ✓ |
| `interaction.primary.hover` | `#1E40AF` | 8.72:1 ✓ |
| `interaction.primary.pressed` | `#172554` | 14.69:1 ✓ |
| `interaction.primary.focus` | `#1D4ED8` — 2px ring with a 2px `color.bg.canvas` offset | 6.70:1 vs canvas |
| `interaction.primary.disabled` | fill `#F3F4F6`, label `#6B7280` | 4.39:1 |

Rationale, recorded so it is not re-litigated: the base is a **dark** navy, so darkening alone has
little perceptual headroom before it reads as black. States move **bidirectionally** — lighter on
hover, darker on press — which keeps each step distinct while holding the white label above 4.5:1
throughout.

Two constraints:

- The focus ring is **`#1D4ED8`, not `color.brand.secondary`.** `#3B82F6` measures only **2.81:1
  against `#1F3A8A`** and would be invisible on the primary button itself.
- Disabled uses a **fill swap, not reduced opacity.** Lowering the opacity of the navy over an
  arbitrary background produces an unpredictable contrast ratio.

**Superseded:** `#002885` (hover) and `#001350` (pressed) are withdrawn. Both were hand-derived
from `#001B68`, which is no longer the application primary.

### Accent / gold — **HUMAN APPROVED: narrowly scoped, decorative only**

Gold is **not** a financial or status semantic colour. It **must not** represent KYC approval,
verified identity, success, funding confirmation, settlement completion, or warning.

A narrowly scoped decorative role is permitted for **rating indicators only**, and the numeric
rating must always accompany the mark — which independently satisfies the rule that colour is
never the sole carrier of meaning. No broad application accent-gold dependency may be created.

`#F4C21F` measures **1.67:1** and the logo-derived `#FEB700` **1.75:1** on canvas — both below the
3:1 non-text threshold, so the glyph itself needs an outline or a darker fill to be perceivable.
**That treatment is `UNKNOWN — NOT VERIFIED` and is not resolved here.**

**Identity verification uses the brand-primary family, not gold and not success-green.**
Verification is an **identity fact**, not a financial success state, and the two must stay
visually distinct.

## Legacy token name mapping

The design documents still use hue-based names. They map as follows; the semantic name is
authoritative going forward.

| Legacy name | Semantic token | Value change |
|---|---|---|
| `color.primary.blue` | `color.brand.primary` | `#001B68` → `#1F3A8A` |
| *(none)* | `color.brand.secondary` | new — `#3B82F6` |
| `color.success.green` | `color.success.fill` | `#179A43` → `#10B981` |
| `color.alert.red` | `color.error.fill` | `#E52421` → `#EF4444` |
| `color.accent.gold` | *(no semantic token)* | retained as a decorative rating role only |
| `color.bg.base` | `color.bg.canvas` | `#F8FAFC` → `#FFFFFF` |
| *(none)* | `color.bg.sunken` | new — `#F8F9FD` |
| `color.text.primary` | `color.text.primary` | unchanged `#111827` |
| `color.gray.600` | `color.text.secondary` | `#6B7280` → `#4B5563` — **HUMAN APPROVED**, frozen |
| `color.gray.400` | `color.text.disabled` | unchanged `#9CA3AF` |
| `color.gray.100` | `color.border.subtle` | `#F3F4F6` → `#E5E7EB` |
| *(none)* | `color.border.strong` | new — `#6B7280`. A boundary value, **not** a text token |
| `color.primary.blue.hover` | `interaction.primary.hover` | `#002885` → `#1E40AF` |
| `color.primary.blue.pressed` | `interaction.primary.pressed` | `#001350` → `#172554` |
| `color.overlay.scrim` | `color.bg.overlay` | unchanged `#00000066` |

## Open items — **NOT FROZEN**

- **Typography — PARTIAL FREEZE.** See the dedicated section below. Inter is **HUMAN APPROVED** as
  the financial/numeric face; Satoshi remains **OPEN**; Nunito Sans is **not** an Xspeeria
  production standard.
- **Accent/gold glyph treatment** — see above.

---

# Typography — **PARTIAL FREEZE**

**IMPLEMENTATION STATUS: NOT IMPLEMENTED. VERIFICATION STATUS: NOT VERIFIED.** No font files exist
in this repository and none may be added by documentation work.

## Inter — **HUMAN APPROVED, 2026-08-22: the Xspeeria financial / numeric typeface**

Inter is approved across applicable surfaces for numeric content where precision, alignment or
financial legibility matters:

currency amounts · exchange rates · fees · percentages · financial totals · transaction amounts ·
settlement amounts · allocation amounts · numeric table columns · admin operational data ·
right-aligned monetary values · any other numeric data requiring tabular alignment.

**The normative requirement is the rendering outcome, not the preprocessing method:**

> **Financial numerics must support tabular/lining figures wherever alignment requires it.**

How that outcome is achieved is an **implementation decision and is not frozen**. In particular, a
pre-built Inter instance carrying `tnum` as its default is an **implementation recommendation
only**, not a frozen architecture requirement. It is recorded because `fontVariant:
['tabular-nums']` is **not reliably applied to custom fonts on iOS** (expo/expo issue #20048) while
Android does support it (React Native PR #27006) — so a runtime feature call alone cannot be
assumed to deliver the outcome. Any method that delivers the outcome is acceptable.

**Inter is not required on non-numeric text.** Do not force two typefaces into every screen: Inter
is required specifically where numeric correctness and alignment matter.

## Satoshi — **OPEN. Leading mobile/brand UI candidate. NOT production-approved.**

Satoshi is the dominant face in the Figma mobile work and remains the leading candidate for brand
and UI typography. It **must not** be described as production-approved. Blocking items:

1. Primary licence verification — the ITF Free Font Licence text has not been obtained as a
   first-party artifact.
2. Mobile-app embedding rights.
3. Redistribution and bundling rights — redistribution of the font files is reportedly prohibited.
4. The exact licence applicable to the Satoshi files actually used in the Figma.
5. Web self-hosting versus CDN decision — self-hosting reportedly requires written consent.
6. Production specimen review.
7. React Native delivery strategy.

**No font files may be downloaded, added or embedded** while these are open.

## Nunito Sans — **not selected as an Xspeeria production standard**

Nunito Sans is dominant in the Figma admin work, but it is **not adopted**. Its admin usage appears
**inherited from imported/adapted design material** rather than deliberately chosen; the provenance
and licence of that material are **`UNKNOWN — NOT VERIFIED`**; and its numeric suitability is not
sufficiently established for financial data.

**This is not a mandate to redesign the admin.** Admin structure, layout and operational UI
architecture are preserved. Typography may be harmonised later without replacing them.

## Current status by surface

| Surface | Role | Status |
|---|---|---|
| Mobile | Brand / UI typography | **OPEN** — Satoshi leading candidate |
| Mobile | Financial / numeric | **Inter — HUMAN APPROVED** |
| Admin | Headings / chrome | **OPEN** — Satoshi if licence verification succeeds; Inter across admin is an acceptable fallback |
| Admin | Financial / data / tables | **Inter — HUMAN APPROVED** |

## Fallback stacks — implementation guidance only

These are **not brand authority** and freeze no assumption about proprietary or locally installed
font availability. Where the platform supports it, **financial numerics must retain tabular
alignment in fallback**.

| Surface | Guidance |
|---|---|
| iOS | Brand → system (SF Pro) while Satoshi is open. Numerics → Inter, falling back to the system face with tabular figures, which the platform supports for system fonts |
| Android | Brand → system (Roboto) while Satoshi is open. Numerics → Inter, falling back to the system face with tabular figures |
| Web | Numerics → Inter with `font-variant-numeric: tabular-nums`, then `system-ui` and the platform sans stack |
| Admin web | Numerics → Inter with `font-variant-numeric: tabular-nums` on every numeric cell, then `system-ui` and the platform sans stack |

---

# Layout, spacing and platform

Use an 8pt spacing system, 16px cards, 24px buttons. Typography is a **PARTIAL FREEZE** — see above.

## Visual hierarchy — **HUMAN APPROVED**

Hierarchy is built in this order. Surface tint is fourth, not first, because the Figma direction
is deliberately white-heavy and `color.bg.sunken` carries only 1.05:1.

1. **Spacing and grouping**
2. **Typography** — `color.text.primary` (17.74:1) against `color.text.secondary` (7.56:1) is a
   large perceptual step and does more work than any tint
3. **Subtle borders**
4. **Supporting surface**
5. **Restrained elevation**

**Normative:** no card-on-card layouts, and no shadow-heavy interfaces. Cards sit on the canvas as
`color.bg.canvas` with a `color.border.subtle` hairline and generous padding — not as raised
elevation.

## Mobile / admin consistency — **HUMAN APPROVED**

**One Xspeeria brand, with different density for the customer app and the operator admin.**

**Shared across both surfaces:** brand colours; semantic status colours **and their meanings**;
logo and wordmark treatment; core spacing logic; form and error semantics; financial number
formatting principles; **state vocabulary**.

**Admin may legitimately differ in:** density; table structures; sidebar navigation; keyboard
interactions; information volume per screen; reduced motion; compact forms.

Do not force mobile card layouts into admin, and do not force admin dashboard density into mobile.

**Normative:** status vocabulary is semantically consistent between customer and operator
surfaces. **No new settlement state may be invented for UI presentation** — the state vocabulary
is owned by `docs/adr/001-transaction-state-machine.md`.

---

Components:
- Account Readiness region (Home) — identity/KYC, security/MFA, eligibility only; never a balance
- Activity items (open Offers, allocations requiring attention, in-flight settlements)
- Quick Actions
- Transaction Card
- Floating Navigation — Home, Marketplace, Track, Cards *(Coming Soon)*, Profile

Luxury minimal fintech aesthetic inspired by Apple HIG.

---

# Design source and evidence state

| Item | State |
|---|---|
| Application colour direction | **HUMAN APPROVED** |
| Semantic token architecture | **HUMAN APPROVED** in principle; values are candidate production tokens |
| Figma production tokens | **DO NOT EXIST** — the Figma holds painted swatches, not bound variables |
| Application code using these tokens | **NONE** — IMPLEMENTATION STATUS: NOT IMPLEMENTED |
| Home / navigation changes | Documented only — **NOT IMPLEMENTED** |
| Typography — financial/numeric (Inter) | **HUMAN APPROVED** |
| Typography — brand/UI (Satoshi) | **OPEN — NOT FROZEN, not production-approved** |
| Typography — Nunito Sans | **Not selected as a production standard** |
| `docs/references/figma/Xspeeria.fig` | **HUMAN-PROVIDED DESIGN SOURCE · UNTRACKED · VERSIONING DECISION OPEN** |
| Logo / brand-asset colours | Separate question — pending vector confirmation, see `PRODUCT.md` |
