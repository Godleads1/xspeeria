<!-- SOURCE DOCUMENT: Xspeeria_UIUX_AppFlow_Spec_v2.docx -->
<!-- Converted to Markdown for Claude/Claude Code repository use. -->
<!-- Source content is preserved; this conversion does not establish new business or technical authority. -->

<img src="media/image1.png" style="width:4.66667in;height:1.32292in" alt="logo-day (5)" />

Wallet-less Peer-to-Peer Fiat Currency Exchange

**UI/UX Design & App Flow Specification**

Version 2.0 — Wallet-less Consistency Fix, Full MVP Scope (22 screens)

|                      |                                                                                                             |
|----------------------|-------------------------------------------------------------------------------------------------------------|
| **Attribute**        | **Value**                                                                                                   |
| **Document Version** | v2.0                                                                                                        |
| **Supersedes**       | UI_UX_SCREEN_SPEC.md v1 (Master Prompt Kit) and Product Design Specification v1.0 (Full Document Book)      |
| **Status**           | Draft — pre-development, ready for design/product sign-off                                                  |
| **Scope**            | Full MVP — 22 screens across 4 journeys (Onboarding, Core Application, Account & Support, Business & Admin) |
| **Date**             | August 2026                                                                                                 |
| **Classification**   | Internal — Confidential — Pre-Development Blueprint                                                         |

> **`UNKNOWN — NOT VERIFIED` — missing normative security baseline.** Screen behaviours below previously cited a repository document named `SECURITY.md` as their normative source. **No such document exists**, and the security-baseline decision (Decision 2) remains **OPEN**. Those citations now read "the applicable approved security policy", which is **not yet determined**; the behaviours described therefore lack their expected normative grounding. Frontend behaviour is never an authoritative security control in any case — authorization is enforced server-side.

# 1. What Changed in This Version

The v1.0 UI/UX Screen Spec and Product Design Specification disagreed with each other. The Master Prompt Kit's UI_UX_SCREEN_SPEC.md had already been corrected to remove a stored balance and wallet ID from Home, but the fuller Product Design Specification (the DOCX book) still specified a “Balance Card” showing a balance and wallet ID, and a five-tab bottom navigation including “Cards” and “Scan” — both of which directly contradict Xspeeria's core wallet-less, non-custodial architecture. This version resolves that contradiction everywhere it appeared, and extends the spec from one confirmed screen (Home) to all 22 MVP screens with a consolidated app flow.

## 1.1 Fixes applied

- Home screen: “Balance Card” → “Status Overview Card.” No balance figure or wallet ID anywhere — shows active FX request count, pending settlement count, and a preferred currency-pair shortcut instead.

- Bottom navigation: “Home, Cards, Scan, Analytics, Profile” → “Home, Marketplace, Track, Notifications, Profile.” Cards and Scan don't correspond to any MVP feature (cards is a deferred Phase 12 item; no scanning flow exists anywhere in the product docs) and Analytics isn't in PRODUCT_REQUIREMENTS_DOCUMENT.md's MVP list.

- Home quick actions: “Deposit, Send, Utility, More” (wallet-style actions that imply a custodial balance) → “New FX Request, Browse Marketplace, Track Transaction, Support” (marketplace-native actions), matching the terminology already fixed in UI_UX_SCREEN_SPEC.md v1.

- Typography token “Display” usage note: “Balance amount on Home” → “Status count numerals on Home, KPI figures on Business Dashboard.”

- Elevation token elevation.2 usage note: “Balance Card, floating transaction cards” → “Status Overview Card, floating transaction cards.”

- Component library entry “Balance Card” → “Status Overview Card,” redefined to explicitly exclude balance/wallet-ID display rather than carrying a caveat note alongside a contradictory name.

- Appendix open item “Are Cards and Analytics in MVP scope?” is resolved: no, removed from primary navigation. Re-add a Cards tab only once the Phase 12 optional debit-card feature actually ships.

# 2. Design Principles

Xspeeria's design language is Apple Wallet × Revolut Ultra × Stripe × Linear: restrained, high-contrast, generously spaced, engineered for trust. In a category where users are exchanging real money peer-to-peer without a custodial wallet holding their balance between steps, every visual decision is justified against one of three criteria: it reduces cognitive load during a financial decision, it reinforces trust and security perception, or it accelerates task completion for time-sensitive FX activity.

|                                    |                                                                                                                                              |
|------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------|
| **Principle**                      | **Applied rule**                                                                                                                             |
| **One primary action per screen**  | Every screen has exactly one high-emphasis (filled, primary-colour) action; everything else is secondary or ghost.                           |
| **Amounts and figures are sacred** | All currency and numeric values render in tabular (monospaced-figure) type, right-aligned in lists, never truncated.                         |
| **Status is always visible**       | Any transaction, offer, or match in a non-terminal state shows a persistent status chip — the user is never left guessing what happens next. |
| **No dead ends**                   | Every empty and error state includes a specific next action, never just an apology.                                                          |
| **Motion has meaning**             | Animation communicates a state change (matched, settled) — never decoration for its own sake.                                                |

# 3. Design System

## 3.1 Colour tokens

|                     |          |                                                             |
|---------------------|----------|-------------------------------------------------------------|
| **Token**           | **Hex**  | **Usage**                                                   |
| color.primary.blue  | \#1F3A8A | Brand identity, primary buttons, headers, active nav, links |
| color.success.green | \#10B981 | Completed settlement, positive outcome, success toast       |
| color.alert.red     | \#EF4444 | Errors, failed transactions, destructive actions, disputes  |
| color.accent.gold   | \#F4C21F | Premium accents, badges, KYC-verified marker, rare emphasis — **no Figma counterpart, `UNKNOWN — NOT VERIFIED`** |
| color.bg.base       | \#FFFFFF | Application canvas — default screen background              |
| color.text.primary  | \#111827 | Body copy, headings                                         |

> **RECONCILED — Xspeeria Figma, the primary visual source of truth for application UI/UX.**
> `color.primary.blue` was `#001B68`, `color.success.green` was `#179A43`, `color.alert.red` was
> `#E52421`; each is now the Figma-observed value. These are **FIGMA-OBSERVED COLOURS / CANDIDATE
> APPLICATION TOKENS**, not frozen production tokens — the Figma holds painted swatches, **not** a
> bound token/variable system, so no production token set exists and none may be claimed until
> human approval freezes one.
>
> `color.bg.base` = `#FFFFFF` was corrected earlier against the human decision in `PRODUCT.md`
> “Brand Commitments”, 2026-08-20, and is **unchanged** — the Figma agrees. The pre-Figma
> supporting neutral `#F8FAFC` is superseded by the Figma supporting soft surface `#F8F9FD`.
>
> **`UNKNOWN — NOT VERIFIED`:** `color.accent.gold` `#F4C21F` has **no counterpart in the observed
> Figma palette**. It is retained pending human determination and must not be represented as
> Figma-confirmed.
>
> **Observed in the Figma with no token defined here** — naming these requires design-system
> approval and is not done in this pass: Secondary `#3B82F6`, Body text `#4B5563`, Warning
> `#F59E0B`, Supporting soft surface `#F8F9FD`, Border/divider `#E5E7EB`, Disabled text `#9CA3AF`.
>
> **Logo/brand-asset colours are a separate question** and are not settled by the Figma — see
> `PRODUCT.md` “Brand Commitments”. Full observed palette, the Figma Success-swatch label defect,
> and measured WCAG contrast findings: `DESIGN_SYSTEM.md`.
>
> **Consequence (unchanged):** `surface.card` `#FFFFFF` is the same value as the canvas and must be
> separated by border, elevation or spacing, never by fill.


## 3.2 Typography

**FIX APPLIED:** *“Display” usage changed from “Balance amount on Home” to remove the wallet-balance reference.*

|                                     |                        |                                                                  |
|-------------------------------------|------------------------|------------------------------------------------------------------|
| **Style**                           | **Size / line height** | **Usage**                                                        |
| Display (34/41, Bold)               | 34 / 41                | Status count numerals on Home, KPI figures on Business Dashboard |
| Title 1 (28/34, Bold)               | 28 / 34                | Screen titles                                                    |
| Title 2 (22/28, Semibold)           | 22 / 28                | Section headers, modal titles                                    |
| Headline (17/22, Semibold)          | 17 / 22                | Card titles, list item primary text                              |
| Body (15/20, Regular)               | 15 / 20                | Default body copy                                                |
| Numeral — Tabular (17–34, Semibold) | 17–34                  | All currency and numeric values, tabular-figure variant          |

## 3.3 Spacing, radius, elevation

**FIX APPLIED:** *radius.xl and elevation.2 usage changed from “Balance Card” to “Status Overview Card.”*

|                             |                                |                                                  |
|-----------------------------|--------------------------------|--------------------------------------------------|
| **Token**                   | **Value**                      | **Usage**                                        |
| space.2 / space.3 / space.4 | 8 / 16 / 24px                  | Base unit / card padding / section gaps          |
| space.6                     | 32px                           | Screen-edge margins                              |
| radius.md                   | 16px                           | Standard cards, inputs                           |
| radius.lg                   | 24px                           | Buttons, bottom sheets                           |
| radius.xl                   | 32px                           | Status Overview Card                             |
| elevation.1                 | 0 1px 2px rgba(17,24,39,0.06)  | Resting cards                                    |
| elevation.2                 | 0 4px 12px rgba(0,27,104,0.12) | Status Overview Card, floating transaction cards |
| elevation.3                 | 0 8px 24px rgba(0,27,104,0.18) | Modals, bottom sheets, FAB                       |

## 3.4 Motion

|                 |                             |                                                                        |
|-----------------|-----------------------------|------------------------------------------------------------------------|
| **Token**       | **Duration / curve**        | **Usage**                                                              |
| motion.instant  | 100ms ease-out              | Button press feedback                                                  |
| motion.fast     | 180ms ease-in-out           | Toast, chip state change                                               |
| motion.base     | 240ms ease-in-out           | Screen transitions, modal open                                         |
| motion.slow     | 400ms ease-out              | Match / settlement success (calm confidence, not celebratory confetti) |
| motion.skeleton | 1200ms loop, linear shimmer | Loading skeletons                                                      |

# 4. App Flow

Four flows cover the full MVP. Rendered versions of the first three accompany this document; the mermaid source below is included so the flows can be reproduced or edited directly in any Markdown/mermaid-aware tool.

## 4.1 App structure map

Every screen sits under one of five bottom-navigation destinations, reached only after identity verification. This is the corrected structure — no Cards, Scan, or Analytics tab.

flowchart TD

A\["New user"\] --\> B\["Sign up + verify identity\n(OTP, MFA, KYC)"\]

B --\> Home\["Home"\]

B --\> Market\["Marketplace"\]

B --\> Track\["Track"\]

B --\> Notif\["Notifications"\]

B --\> Profile\["Profile"\]

## 4.2 Onboarding & authentication flow

flowchart LR

Splash\["Splash"\] --\> Onboard\["Onboarding\n(3-slide carousel)"\]

Onboard --\> RegLogin\["Register / Login"\]

RegLogin --\> OTP\["OTP / MFA"\]

OTP --\> KYC\["KYC\n(document + liveness)"\]

KYC --\>\|Auto-approved\| Home\["Home"\]

KYC --\>\|Manual review\| Pending\["Pending review\n(async notification)"\]

Pending --\> Home

## 4.3 Core money journey — browse to settlement

This is the highest-stakes UX surface in the product: users watch real money move through the settlement state machine without ever seeing a custodial balance. The screen flow below maps that backend model to user-facing screens.

Per ADR-001 (DEC-003), the UI renders the read-only `Transaction.status` projection — `initiated`, `settling`, `completed`, `unwinding`, `recovery`, `closed`, `on_hold` — derived from `Settlement.phase` (`INITIALIZING`, `AWAITING_FUNDING`, `RELEASING`, `COMPLETED`, `UNWINDING`, `CLOSED_UNWOUND`, `RECOVERY_REQUIRED`, `CLOSED_RECOVERED`, `CLOSED_WITH_LOSS`, `CANCELLED`). The frontend never writes settlement state and never asserts that funds have moved.

Three UX consequences of the canonical model:

- **Per-leg funding is now visible and honest.** A user sees their own leg's state precisely and the counterparty's only coarsely — *awaiting counterparty* versus *counterparty funded* — enough for the "we are holding your confirmed leg safely" message required by Banking Specification Section 7, without exposing a signal usable to game the rematch flow.
- **Asynchronous partner legs are expected, not exceptional.** The two legs complete at different speeds by design, so the Settlement Tracking screen must render one leg complete and one still processing as a normal state, with an extended-processing message rather than silence.
- **`recovery` is never presented as a generic failure.** It means funds are unresolved and a human is working the case; the screen must say so plainly and must not be folded into a `failed` state.

The **Confirm Funds Sent** action is advisory only. It records a user claim for support and dispute evidence and may drive messaging, but it does not advance settlement state — only a signature-verified partner webhook can do that. UI copy must not imply the transaction has progressed because the user tapped it.

flowchart TD

Market\["Marketplace\n(browse offers/requests)"\] --\> Create\["Create Offer / Request\n(amount, rate, pair)"\]

Create --\> Details\["Offer / Request Details"\]

Details --\>\|Accept\| Match\["Match Details\n(both parties confirm)"\]

Match --\>\|Proceed\| Settle\["Settlement Tracking\n(funds verified, no custody held)"\]

Settle --\>\|Both legs settled\| Complete\["Transaction Timeline\n(completed)"\]

Match --\>\|Raise issue\| Dispute\["Disputes"\]

## 4.4 Account, support & operations flow

flowchart TD

Profile\["Profile"\] --\> Settings\["Settings\n(security, notifications, language)"\]

Profile --\> KYCFlow\["KYC status / re-verification"\]

Notif\["Notifications"\] --\> DeepLink\["Deep link to Match / Settlement / Dispute"\]

Support\["Support"\] --\> Ticket\["New ticket / existing thread"\]

Match\["Match Details"\] --\>\|Raise dispute\| Disputes\["Disputes"\]

BizDash\["Business Dashboard"\] --\> Statement\["Export statement (async)"\]

AdminQueue\["Admin Mobile"\] --\> KYCQueue\["KYC review queue"\]

AdminQueue --\> DisputeQueue\["Dispute queue"\]

# 5. Screen-by-Screen Specification

All 22 MVP screens, grouped by journey. Each spec covers layout, visual hierarchy, component tree, navigation, and the four required states (empty, error, loading) plus micro-interactions and accessibility notes. Home carries the wallet-less fix; every other screen is reproduced from the source Product Design Specification with terminology aligned to the corrected navigation model.

## 5.1 Onboarding & Authentication

### Splash

|                        |                                                                                            |
|------------------------|--------------------------------------------------------------------------------------------|
| **Aspect**             | **Specification**                                                                          |
| **Layout**             | Full-bleed Primary Blue background, centered Xspeeria wordmark, no interactive elements    |
| **Visual Hierarchy**   | Single focal point: logo mark                                                              |
| **Component Tree**     | SafeAreaView \> LogoMark                                                                   |
| **Navigation**         | Auto-advances to Onboarding (first launch) or Home (returning, valid session) after 1200ms |
| **Empty State**        | N/A                                                                                        |
| **Error State**        | N/A (silent retry on session check failure, then routes to Login)                          |
| **Loading State**      | Logo scale-in 0→1.0 over motion.base                                                       |
| **Micro-interactions** | None (transient)                                                                           |
| **Accessibility**      | Respects reduce-motion: static logo, no scale animation                                    |

### Onboarding

|                        |                                                                                                       |
|------------------------|-------------------------------------------------------------------------------------------------------|
| **Aspect**             | **Specification**                                                                                     |
| **Layout**             | 3-slide horizontal carousel, illustration top 60%, headline + body bottom 40%, pagination dots + Skip |
| **Visual Hierarchy**   | Illustration \> Headline \> Supporting copy \> CTA                                                    |
| **Component Tree**     | PagerView \> Slide\[\] \> (Illustration, Title, Body) + Bottom(Dots, SkipButton, NextButton)          |
| **Navigation**         | Swipe or Next through 3 slides → Register; Skip → Register directly                                   |
| **Empty State**        | N/A                                                                                                   |
| **Error State**        | N/A                                                                                                   |
| **Loading State**      | N/A (static content, no network)                                                                      |
| **Micro-interactions** | Slide transition follows finger 1:1 during drag; snap with motion.base spring on release              |
| **Accessibility**      | Each slide’s illustration marked decorative; headline read by screen reader on slide focus            |

### Register

|                        |                                                                                                                                           |
|------------------------|-------------------------------------------------------------------------------------------------------------------------------------------|
| **Aspect**             | **Specification**                                                                                                                         |
| **Layout**             | Scrollable form: header, full name, email, phone, password (with strength meter), terms checkbox, primary CTA, login link                 |
| **Visual Hierarchy**   | Title \> Form fields (top-to-bottom) \> Legal checkbox \> CTA \> Secondary link                                                           |
| **Component Tree**     | ScrollView \> Header \> FormFields\[TextInput\] \> PasswordStrengthMeter \> Checkbox \> PrimaryButton \> GhostButton(link)                |
| **Navigation**         | Submit → OTP (email/phone verification); "Log in" link → Login                                                                            |
| **Empty State**        | N/A                                                                                                                                       |
| **Error State**        | Inline per-field validation errors (Error state on Text Input) + banner for server-side errors (e.g., email already registered)           |
| **Loading State**      | Primary Button shows Loading state during submission; fields disabled during submit                                                       |
| **Micro-interactions** | Password strength meter animates color/width over motion.fast per keystroke (debounced)                                                   |
| **Accessibility**      | Password field has a visible show/hide toggle with accessibilityLabel "Show password"; strength meter has text equivalent, not color-only |

### Login

|                        |                                                                                                                                             |
|------------------------|---------------------------------------------------------------------------------------------------------------------------------------------|
| **Aspect**             | **Specification**                                                                                                                           |
| **Layout**             | Centered form: logo, email, password, "Forgot password?" link, primary CTA, "Create account" link, biometric quick-login button if enrolled |
| **Visual Hierarchy**   | Logo \> Form \> Forgot link \> CTA \> Secondary link \> Biometric shortcut                                                                  |
| **Component Tree**     | ScrollView \> Logo \> FormFields \> GhostButton(forgot) \> PrimaryButton \> GhostButton(register) \> BiometricButton                        |
| **Navigation**         | Submit → MFA (if enabled) or Home; Forgot Password link → Forgot Password; Register link → Register                                         |
| **Empty State**        | N/A                                                                                                                                         |
| **Error State**        | Inline field errors + banner for invalid credentials (rate-limited after 5 attempts per the applicable approved security policy)                                |
| **Loading State**      | Primary Button Loading state                                                                                                                |
| **Micro-interactions** | Biometric icon pulses once on screen mount if Face ID/Touch ID available                                                                    |
| **Accessibility**      | Rate-limit lockout message explicitly states retry time, announced via live region                                                          |

### Forgot Password

|                        |                                                                         |
|------------------------|-------------------------------------------------------------------------|
| **Aspect**             | **Specification**                                                       |
| **Layout**             | Single email field, explanatory copy, submit CTA, back link             |
| **Visual Hierarchy**   | Title \> Explanation \> Email field \> CTA                              |
| **Component Tree**     | ScrollView \> Header \> TextInput \> PrimaryButton \> GhostButton(back) |
| **Navigation**         | Submit → confirmation screen ("check your email") → back to Login       |
| **Empty State**        | N/A                                                                     |
| **Error State**        | Inline email-format validation                                          |
| **Loading State**      | Primary Button Loading state                                            |
| **Micro-interactions** | Confirmation state cross-fades in place of form (motion.base)           |
| **Accessibility**      | Confirmation message announced via live region on submit success        |

### MFA

|                        |                                                                                                                     |
|------------------------|---------------------------------------------------------------------------------------------------------------------|
| **Aspect**             | **Specification**                                                                                                   |
| **Layout**             | OTP Input component, countdown resend timer, channel indicator (SMS/Email/Authenticator)                            |
| **Visual Hierarchy**   | Channel indicator \> OTP Input \> Resend timer/link                                                                 |
| **Component Tree**     | Header \> OTPInput \> CountdownText/ResendGhostButton                                                               |
| **Navigation**         | Auto-submits on 6th digit → Home (or next protected screen); "Use another method" → channel selection               |
| **Empty State**        | N/A                                                                                                                 |
| **Error State**        | Error state on OTP Input + shake animation on incorrect code; lockout after configured max attempts per the applicable approved security policy |
| **Loading State**      | Digits disabled during verification call; spinner overlays OTP row                                                  |
| **Micro-interactions** | Success: OTP row flashes success-green border before navigation                                                     |
| **Accessibility**      | Resend button disabled state clearly communicated with remaining-seconds label, not just grayed out                 |

## 5.2 Core Application

**FIX APPLIED:** *Rewritten — see Section 1.1.*

### Home

|                        |                                                                                                                                                                                                                                                                                                                                                                                                                   |
|------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Aspect**             | **Specification**                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Layout**             | Header (avatar, greeting, notification bell) \> Status Overview Card (radius 32, solid Xspeeria Blue, active FX requests count, pending settlements count, preferred currency-pair shortcut — no balance figure, no wallet ID, ever) \> Quick Actions (New FX Request, Browse Marketplace, Track Transaction, Support) \> Recent Transactions (up to 3 cards: pair, stage chip, next action) \> Bottom Navigation |
| **Visual Hierarchy**   | Status Overview Card is the dominant visual element; Quick Actions second; Recent Transactions third                                                                                                                                                                                                                                                                                                              |
| **Component Tree**     | SafeAreaView \> Header \> StatusOverviewCard \> QuickActionsRow\[4\] \> RecentTransactionsSection(TransactionCard×3) \> BottomNavigation                                                                                                                                                                                                                                                                          |
| **Navigation**         | Bell → Notifications; currency-pair chip on Status Card → Marketplace pre-filtered to that pair; Quick Actions → respective flows; Transaction Card → Match Details or Settlement Tracking depending on current stage; Bottom Nav → top-level sections (Home, Marketplace, Track, Notifications, Profile)                                                                                                         |
| **Empty State**        | Recent Transactions section shows Empty State (“No transactions yet — create your first offer”) if zero history                                                                                                                                                                                                                                                                                                   |
| **Error State**        | Status Overview Card shows a compact inline error + retry if activity counts fail to fetch; rest of screen remains interactive                                                                                                                                                                                                                                                                                    |
| **Loading State**      | Status Overview Card and Transaction Cards render Loading Skeleton matching final dimensions on cold load                                                                                                                                                                                                                                                                                                         |
| **Micro-interactions** | Status counts increment on load; pull-to-refresh triggers a brief flat-fill pulse on the Status Overview Card                                                                                                                                                                                                                                                                                                     |
| **Accessibility**      | No balance or account-number figures ever appear on this screen — removes the shoulder-surfing concern the v1 spec flagged; nothing sensitive to hide behind a show/hide toggle                                                                                                                                                                                                                                   |

### Marketplace

|                        |                                                                                                                                  |
|------------------------|----------------------------------------------------------------------------------------------------------------------------------|
| **Aspect**             | **Specification**                                                                                                                |
| **Layout**             | Segmented control (Offers / Requests), filter bar (currency, amount range, rate), scrollable list of listing cards, FAB "Create" |
| **Visual Hierarchy**   | Segmented control \> Filters \> Listings (rate-sorted) \> FAB                                                                    |
| **Component Tree**     | Header \> SegmentedControl \> FilterBar \> FlatList(ListingCard) \> FAB                                                          |
| **Navigation**         | Tap listing → Offer Details / Match Details; FAB → Create Offer or Create Request (context menu)                                 |
| **Empty State**        | Illustration + "No offers match your filters" with "Clear filters" CTA                                                           |
| **Error State**        | Inline retry banner if listings fail to load, cached last-known list shown if available                                          |
| **Loading State**      | Listing list renders 5 skeleton rows on load                                                                                     |
| **Micro-interactions** | New listings matching active filters slide in from top with a brief highlight pulse                                              |
| **Accessibility**      | Filter bar fully operable via screen reader with explicit "N filters active" summary                                             |

### Create Offer

|                        |                                                                                                           |
|------------------------|-----------------------------------------------------------------------------------------------------------|
| **Aspect**             | **Specification**                                                                                         |
| **Layout**             | Multi-step form: amount + currency pair → desired rate → settlement window → review                       |
| **Visual Hierarchy**   | Step indicator \> Current step form \> Primary CTA (Next/Submit)                                          |
| **Component Tree**     | ScrollView \> StepIndicator \> StepForm(varies) \> PrimaryButton \> GhostButton(back)                     |
| **Navigation**         | Next through steps → Review → Submit → Offer Details (confirmation)                                       |
| **Empty State**        | N/A                                                                                                       |
| **Error State**        | Inline validation per step (e.g., rate outside market band triggers a warning, not a hard block)          |
| **Loading State**      | Submit shows Loading state; step transitions have no network dependency until final submit                |
| **Micro-interactions** | Step indicator segment fills over motion.fast on advance; rate-vs-market comparison bar animates on entry |
| **Accessibility**      | Step indicator announces "Step 2 of 4: Desired rate" on each transition                                   |

### Create Request

|                        |                                                                              |
|------------------------|------------------------------------------------------------------------------|
| **Aspect**             | **Specification**                                                            |
| **Layout**             | Mirrors Create Offer structure with inverted currency direction framing      |
| **Visual Hierarchy**   | Identical structure to Create Offer                                          |
| **Component Tree**     | Identical component tree to Create Offer                                     |
| **Navigation**         | Identical navigation pattern to Create Offer, terminating at Request Details |
| **Empty State**        | N/A                                                                          |
| **Error State**        | Identical validation pattern to Create Offer                                 |
| **Loading State**      | Identical to Create Offer                                                    |
| **Micro-interactions** | Identical to Create Offer                                                    |
| **Accessibility**      | Identical to Create Offer                                                    |

### Offer Details

|                        |                                                                                                                                                       |
|------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Aspect**             | **Specification**                                                                                                                                     |
| **Layout**             | Offer summary card, counterparty preview (rating, verification badge), rate breakdown, action buttons (Accept / Edit / Cancel depending on ownership) |
| **Visual Hierarchy**   | Offer summary dominant, counterparty trust signals secondary, actions bottom-anchored                                                                 |
| **Component Tree**     | ScrollView \> OfferSummaryCard \> CounterpartyPreview \> RateBreakdownTable \> ActionButtonRow                                                        |
| **Navigation**         | Accept → Match Details; Edit → Create Offer (pre-filled); Cancel → confirmation Modal → Marketplace                                                   |
| **Empty State**        | N/A (offer existence is precondition for screen)                                                                                                      |
| **Error State**        | Full-screen error state if offer was withdrawn/expired since navigation, with "Back to Marketplace" CTA                                               |
| **Loading State**      | Full-card skeleton on load                                                                                                                            |
| **Micro-interactions** | Accept CTA shows a brief confirming pulse before transitioning to Match Details                                                                       |
| **Accessibility**      | Counterparty verification badge has explicit text alternative ("KYC Verified"), not gold-icon-only                                                    |

### Match Details

|                        |                                                                                                                                                    |
|------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------|
| **Aspect**             | **Specification**                                                                                                                                  |
| **Layout**             | Matched-pair summary (both parties, agreed rate, amounts), settlement instructions, status timeline preview, chat/dispute entry point              |
| **Visual Hierarchy**   | Match confirmation banner top, settlement instructions center, status timeline bottom                                                              |
| **Component Tree**     | Header \> MatchConfirmationBanner \> SettlementInstructionsCard \> StatusTimelinePreview \> ActionRow(Message, Dispute)                            |
| **Navigation**         | Proceed → Settlement Tracking; Message → in-app thread; Dispute → Disputes flow                                                                    |
| **Empty State**        | N/A                                                                                                                                                |
| **Error State**        | Banner-level error if match was invalidated (counterparty cancelled) with clear next-step CTA                                                      |
| **Loading State**      | Skeleton on initial load                                                                                                                           |
| **Micro-interactions** | Confirmation banner celebrates with a single restrained checkmark animation (motion.slow), not confetti — consistent with "calm confidence" pillar |
| **Accessibility**      | Status timeline items individually announced in reading order with current step flagged "current"                                                  |

### Settlement Tracking

|                        |                                                                                                                                       |
|------------------------|---------------------------------------------------------------------------------------------------------------------------------------|
| **Aspect**             | **Specification**                                                                                                                     |
| **Layout**             | Step-by-step settlement progress rendered per leg — your leg precisely, the counterparty's coarsely (Awaiting → Funded → Releasing → Paid out) — plus the overall `Transaction.status` projection, estimated time remaining, and support entry point. The two legs may complete at different times; the layout must present that as normal, not as an error. A `recovery` state is shown explicitly as "we are resolving this with our partner", never as a generic failure |
| **Visual Hierarchy**   | Vertical stepper is dominant element                                                                                                  |
| **Component Tree**     | Header \> VerticalStepper(steps\[\]) \> EstimatedTimeText \> SupportLinkRow                                                           |
| **Navigation**         | Tap "Get help" → Support; automatic navigation to success state on completion webhook                                                 |
| **Empty State**        | N/A                                                                                                                                   |
| **Error State**        | Failed-step state highlighted in alert-red on the stepper itself with explanation + "Contact support" CTA                             |
| **Loading State**      | Current/future steps shown de-emphasized (gray) until reached; no full-screen skeleton needed as structure is known upfront           |
| **Micro-interactions** | Completed step transitions from pending (gray) to success-green with a checkmark draw-on animation over motion.base                   |
| **Accessibility**      | Each step change is announced via a polite live region so users tracking passively are informed of progress                           |

### Transaction Timeline

|                        |                                                                                                                                          |
|------------------------|------------------------------------------------------------------------------------------------------------------------------------------|
| **Aspect**             | **Specification**                                                                                                                        |
| **Layout**             | Chronological list of all transaction events (created, matched, settled) as a vertical activity feed with full transaction detail on tap |
| **Visual Hierarchy**   | Reverse-chronological feed, most recent at top                                                                                           |
| **Component Tree**     | FlatList(TimelineEventCard) grouped by date headers                                                                                      |
| **Navigation**         | Tap event → relevant detail screen (Match Details / Settlement Tracking / Dispute)                                                       |
| **Empty State**        | Illustration + "No activity yet" with CTA to Marketplace                                                                                 |
| **Error State**        | Inline retry banner, cached data shown if available                                                                                      |
| **Loading State**      | 6 skeleton rows on cold load                                                                                                             |
| **Micro-interactions** | New events entering at top slide in with a brief highlight                                                                               |
| **Accessibility**      | Date group headers are sticky and separately announced when scrolled past                                                                |

## 5.3 Account & Support

### Notifications

|                        |                                                                                              |
|------------------------|----------------------------------------------------------------------------------------------|
| **Aspect**             | **Specification**                                                                            |
| **Layout**             | Grouped list (Today / This week / Earlier), read/unread visual distinction, swipe-to-dismiss |
| **Visual Hierarchy**   | Chronological groups, unread items visually weighted                                         |
| **Component Tree**     | SectionList(NotificationRow) grouped by recency                                              |
| **Navigation**         | Tap notification → relevant deep link (transaction, dispute, KYC status)                     |
| **Empty State**        | Illustration + "You’re all caught up"                                                        |
| **Error State**        | Inline retry banner                                                                          |
| **Loading State**      | 4 skeleton rows                                                                              |
| **Micro-interactions** | Unread dot fades out on read (motion.fast) rather than disappearing instantly                |
| **Accessibility**      | Unread state communicated via accessibilityLabel prefix "Unread:", not dot color alone       |

### KYC

|                        |                                                                                                                                     |
|------------------------|-------------------------------------------------------------------------------------------------------------------------------------|
| **Aspect**             | **Specification**                                                                                                                   |
| **Layout**             | Multi-step: personal details → document capture (camera) → selfie liveness → review → pending/approved/rejected status screen       |
| **Visual Hierarchy**   | Step indicator \> current step \> progress reassurance copy                                                                         |
| **Component Tree**     | StepIndicator \> StepForm/CameraCapture \> PrimaryButton                                                                            |
| **Navigation**         | Advances through steps → Pending Review screen → (async) Approved/Rejected notification → Profile                                   |
| **Empty State**        | N/A                                                                                                                                 |
| **Error State**        | Rejected state gives specific, actionable reason (e.g., "Document photo blurry — retake") never a generic failure                   |
| **Loading State**      | Document upload shows determinate progress bar, not indeterminate spinner                                                           |
| **Micro-interactions** | Camera capture frame pulses gold on successful document edge-detection lock                                                         |
| **Accessibility**      | Camera-based steps include a manual file-upload fallback for users unable to use camera capture (accessibility + device constraint) |

### Profile

|                        |                                                                                                                      |
|------------------------|----------------------------------------------------------------------------------------------------------------------|
| **Aspect**             | **Specification**                                                                                                    |
| **Layout**             | Avatar + name + verification badge header, account details list, linked bank accounts, security section entry        |
| **Visual Hierarchy**   | Identity header dominant, settings list below                                                                        |
| **Component Tree**     | Header(Avatar, Name, Badge) \> ListSection(AccountDetails) \> ListSection(LinkedAccounts) \> ListSection(Security)   |
| **Navigation**         | Each row → respective detail/edit screen; Security → Settings (security tab)                                         |
| **Empty State**        | N/A (profile always exists post-registration)                                                                        |
| **Error State**        | Inline error only on specific failed sub-section (e.g., linked accounts fetch fails independently of profile header) |
| **Loading State**      | Header + list skeleton on cold load                                                                                  |
| **Micro-interactions** | Verification badge appears with a subtle scale-in once KYC approval is confirmed                                     |
| **Accessibility**      | Each list row meets 44px minimum touch target regardless of visual density                                           |

### Settings

|                        |                                                                                                            |
|------------------------|------------------------------------------------------------------------------------------------------------|
| **Aspect**             | **Specification**                                                                                          |
| **Layout**             | Grouped settings list: Notifications, Security (MFA, biometric, password), Language/Region, Legal, Log out |
| **Visual Hierarchy**   | Standard iOS-pattern grouped list                                                                          |
| **Component Tree**     | SectionList(SettingsRow, toggles/chevrons as appropriate)                                                  |
| **Navigation**         | Each row → sub-screen or inline toggle; Log out → confirmation Modal → Login                               |
| **Empty State**        | N/A                                                                                                        |
| **Error State**        | Toggle-level inline error if a preference fails to save, with automatic revert                             |
| **Loading State**      | N/A (static list, toggles show brief inline spinner on save)                                               |
| **Micro-interactions** | Toggle switches animate over motion.instant per platform-native conventions                                |
| **Accessibility**      | Toggles expose accessibilityRole="switch" with current state announced                                     |

### Support

|                        |                                                                                                      |
|------------------------|------------------------------------------------------------------------------------------------------|
| **Aspect**             | **Specification**                                                                                    |
| **Layout**             | FAQ search, categorized help articles, "Contact us" entry (chat/ticket), active ticket status if any |
| **Visual Hierarchy**   | Search dominant at top, categories below, contact CTA persistent                                     |
| **Component Tree**     | SearchField \> CategoryGrid \> ArticleList \> PersistentContactButton                                |
| **Navigation**         | Article tap → article detail; Contact → new ticket flow or existing thread                           |
| **Empty State**        | "No results" state within search specifically, not the whole screen                                  |
| **Error State**        | Inline retry for article list                                                                        |
| **Loading State**      | Skeleton for category grid and article list independently                                            |
| **Micro-interactions** | Search results fade in as user types (debounced)                                                     |
| **Accessibility**      | Category grid items are equally sized touch targets ≥ 44px regardless of label length                |

### Disputes

|                        |                                                                                                                |
|------------------------|----------------------------------------------------------------------------------------------------------------|
| **Aspect**             | **Specification**                                                                                              |
| **Layout**             | Dispute list (open/resolved), dispute detail with evidence thread, file-upload for evidence, resolution status |
| **Visual Hierarchy**   | List view → detail thread pattern, consistent with Transaction Timeline                                        |
| **Component Tree**     | FlatList(DisputeCard) → DisputeDetailThread(Message/Evidence items) \> EvidenceUploadRow                       |
| **Navigation**         | Open dispute → detail thread; "Raise dispute" (from Match Details) → new dispute form                          |
| **Empty State**        | Illustration + "No disputes" (positive-framed empty state)                                                     |
| **Error State**        | Inline retry on thread load failure                                                                            |
| **Loading State**      | Skeleton list + skeleton thread independently                                                                  |
| **Micro-interactions** | New message/evidence item slides in at bottom of thread with auto-scroll                                       |
| **Accessibility**      | Evidence thread items announced in chronological order with sender identity explicit                           |

## 5.4 Business & Admin

### Business Dashboard

|                        |                                                                                                                          |
|------------------------|--------------------------------------------------------------------------------------------------------------------------|
| **Aspect**             | **Specification**                                                                                                        |
| **Layout**             | SME/importer-oriented summary: aggregate FX volume, active offers/requests, settlement calendar, downloadable statements |
| **Visual Hierarchy**   | KPI summary cards top, activity/calendar below                                                                           |
| **Component Tree**     | Header \> KPICardRow \> SettlementCalendar \> RecentActivityList \> ExportButton                                         |
| **Navigation**         | KPI cards → filtered Transaction Timeline; Export → statement generation (async, notification on ready)                  |
| **Empty State**        | Illustration + "No business activity yet — verify your business account" if business KYC incomplete                      |
| **Error State**        | Inline retry per KPI card independently (cards are independently fetched)                                                |
| **Loading State**      | KPI cards and calendar show independent skeletons                                                                        |
| **Micro-interactions** | KPI numbers count up on load; calendar date cells highlight on hover (web) / press (mobile)                              |
| **Accessibility**      | KPI cards expose full value + label + trend direction as a single accessible string, not three separate fragments        |

### Admin Mobile

|                        |                                                                                                                                     |
|------------------------|-------------------------------------------------------------------------------------------------------------------------------------|
| **Aspect**             | **Specification**                                                                                                                   |
| **Layout**             | Condensed admin console for on-call operations staff: pending KYC queue, dispute queue, system health snapshot                      |
| **Visual Hierarchy**   | Queue-first layout, system health as a persistent top strip                                                                         |
| **Component Tree**     | HealthStripBanner \> TabBar(KYC Queue / Disputes / Alerts) \> QueueList(ActionableCard)                                             |
| **Navigation**         | Queue item → detail/action screen (approve/reject KYC, resolve dispute) with RBAC-gated actions per the applicable approved security policy                     |
| **Empty State**        | Illustration + "Queue clear" (positive)                                                                                             |
| **Error State**        | Full-screen retry state if queue fails to load (this is an operational tool; silent partial failure is not acceptable)              |
| **Loading State**      | List skeleton                                                                                                                       |
| **Micro-interactions** | Approved/resolved items animate out of the queue list (slide + fade) rather than instantly vanishing                                |
| **Accessibility**      | Destructive/high-consequence actions (reject KYC, force-resolve dispute) require an explicit confirmation Modal, never a single tap |

# 6. Key Components

**FIX APPLIED:** *“Balance Card” component redefined as “Status Overview Card” with balance/wallet-ID display explicitly excluded, rather than carrying a contradictory name with a caveat note.*

|                          |                                                                                                                                                                                                                                                                                                  |
|--------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Component**            | **Specification**                                                                                                                                                                                                                                                                                |
| **Status Overview Card** | Primary trust surface on Home. Displays FX marketplace/transaction activity — active request count, pending settlement count, preferred currency-pair shortcut. Never displays a stored balance or wallet ID: Xspeeria is wallet-less and non-custodial, and this card must not imply otherwise. |
| **Bottom Navigation**    | Primary app navigation, persistent across top-level screens: Home, Marketplace, Track, Notifications, Profile. No Cards, Scan, or Analytics tab in MVP.                                                                                                                                          |
| **Transaction Card**     | Represents a single transaction/settlement in lists and the Home “Recent Transactions” rail. Shows currency pair, current state-machine stage, and next available action — never a balance figure.                                                                                               |
| **Primary Button**       | Single highest-emphasis action per screen. Height 52px, radius.lg (24px), scale to 0.97 on press, light haptic.                                                                                                                                                                                  |

# 7. Accessibility

Xspeeria targets WCAG 2.1 AA conformance across mobile and admin surfaces, treated as a compliance and trust requirement consistent with a regulated financial product, not an optional enhancement. Conformance is verified at three checkpoints: automated contrast/touch-target linting in CI on every component PR, a manual VoiceOver/TalkBack pass on every new screen before merge, and a full WCAG AA audit each quarter.

# Appendix A: Open Design Decisions

Items still requiring explicit product/design sign-off before implementation:

- Final icon set licensing (Phosphor vs. SF Symbols-derived custom set) for cross-platform parity.

- Whether Admin (Next.js) requires a distinct component library instance or directly consumes the mobile token set via a shared package.

- Exact copy for empty/error states across all 22 screens — this spec defines structure and intent; final microcopy needs a content-design pass.

- Resolved in this version, no longer open: balance visibility on Home (removed entirely, not hidden-by-default) and whether Cards/Analytics are in MVP scope (they are not).
