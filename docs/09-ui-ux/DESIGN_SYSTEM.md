
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

> **`UNKNOWN — NOT VERIFIED` — no accent/gold in the observed Figma palette.** The design
> documents carry `color.accent.gold` `#F4C21F` (premium accents, badges, KYC-verified marker).
> The observed Figma palette contains **no accent or gold role**. Whether the accent is retired,
> renamed, or simply absent from the Figma Design System page is undetermined. `#F4C21F` is
> retained in the design documents pending that determination and must not be treated as
> Figma-confirmed.

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

Use an 8pt spacing system, SF Pro/Inter typography, 16px cards, 24px buttons.


Components:
- Status Overview Card (never displays a stored balance — Xspeeria is wallet-less/non-custodial)
- Quick Actions
- Transaction Card
- Floating Navigation

Luxury minimal fintech aesthetic inspired by Apple HIG.
