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

Version History

|             |          |             |                                                              |
|-------------|----------|-------------|--------------------------------------------------------------|
| **Version** | **Date** | **Author**  | **Summary of Changes**                                       |
| v0.1        | 2026-07  | Design Lead | Initial draft from UI_UX_SCREEN_SPEC.md and DESIGN_SYSTEM.md |
| v1.0        | 2026-08  | Design Lead | Full component library and screen-by-screen specification    |

Table of Contents

Executive Summary

This Product Design Specification (PDS) is the single authoritative reference for how Xspeeria looks, feels, and behaves across mobile (React Native / Expo) and admin (Next.js) surfaces. It translates the brand and interaction principles established in DESIGN_SYSTEM.md and UI_UX_SCREEN_SPEC.md into implementation-ready detail: design tokens, a full component library, and screen-by-screen specifications covering layout, states, motion, and accessibility.

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
| Financial numbers are sacred  | Amounts and balances always render in tabular (monospaced-numeral) figures, right-aligned in lists, never truncated.     |
| Status is always visible      | Any transaction, offer, or match in a non-terminal state shows a persistent status chip using the semantic color system. |
| No dead ends                  | Every empty and error state includes a specific next action, never a bare message.                                       |
| Motion has meaning            | Animation communicates state change (e.g., matched, settled) — it is never purely decorative.                            |

2\. Brand Identity

2.1 Color System

Colors are sourced directly from DESIGN_SYSTEM.md and are treated as immutable brand constants. Tints and shades below are derived extensions required for state layers (hover, pressed, disabled) and are labeled as design-system extensions.

|                     |          |                                                             |
|---------------------|----------|-------------------------------------------------------------|
| **Token**           | **Hex**  | **Usage**                                                   |
| color.primary.blue  | \#001B68 | Brand identity, primary buttons, headers, active nav, links |
| color.success.green | \#179A43 | Completed settlement, positive balance delta, success toast |
| color.alert.red     | \#E52421 | Errors, failed transactions, destructive actions, disputes  |
| color.accent.gold   | \#F4C21F | Premium accents, badges, KYC-verified marker, rare emphasis |
| color.bg.base       | \#F8FAFC | App background                                              |
| color.text.primary  | \#111827 | Body copy, headings                                         |

> **ASSUMPTION:** *The following tints/shades and semantic aliases are design-system extensions not present in the source documents, added for implementation completeness.*

|                            |            |                                      |
|----------------------------|------------|--------------------------------------|
| **Token**                  | **Hex**    | **Usage**                            |
| color.primary.blue.10      | \#001B681A | Selected row / active tab background |
| color.primary.blue.hover   | \#002885   | Button hover                         |
| color.primary.blue.pressed | \#001350   | Button pressed                       |
| color.success.green.10     | \#179A431A | Success banner background            |
| color.alert.red.10         | \#E524211A | Error banner background              |
| color.gray.100             | \#F3F4F6   | Card borders, dividers               |
| color.gray.400             | \#9CA3AF   | Placeholder text, disabled icons     |
| color.gray.600             | \#6B7280   | Secondary text, captions             |
| color.overlay.scrim        | \#00000066 | Modal backdrop                       |

2.2 Typography

Typeface: SF Pro (iOS) / Inter (Android, Web, Admin) — a native-first pairing that preserves platform-appropriate rendering while keeping visual parity, per DESIGN_SYSTEM.md.

|                   |                        |                |                                                         |
|-------------------|------------------------|----------------|---------------------------------------------------------|
| **Style**         | **Size / Line Height** | **Weight**     | **Usage**                                               |
| Display           | 34 / 41                | Bold (700)     | Balance amount on Home                                  |
| Title 1           | 28 / 34                | Bold (700)     | Screen titles                                           |
| Title 2           | 22 / 28                | Semibold (600) | Section headers, modal titles                           |
| Headline          | 17 / 22                | Semibold (600) | Card titles, list item primary text                     |
| Body              | 15 / 20                | Regular (400)  | Default body copy                                       |
| Callout           | 14 / 18                | Regular (400)  | Secondary descriptions                                  |
| Caption           | 12 / 16                | Regular (400)  | Timestamps, helper text, legal                          |
| Numeral (Tabular) | 17–34 / —              | Semibold (600) | All currency and numeric values, tabular-figure variant |

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
| radius.xl   | 32px                           | Balance Card (per UI_UX_SCREEN_SPEC.md)       |
| elevation.0 | none                           | Flat surfaces, background                     |
| elevation.1 | 0 1px 2px rgba(17,24,39,0.06)  | Resting cards                                 |
| elevation.2 | 0 4px 12px rgba(0,27,104,0.12) | Balance Card, floating transaction cards      |
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
| action.primary      | color.primary.blue              | Primary button fill, active states |
| action.primary.text | color.bg.base (#F8FAFC on blue) | Text on primary buttons            |
| feedback.positive   | color.success.green             | Success states                     |
| feedback.negative   | color.alert.red                 | Error / destructive states         |
| feedback.premium    | color.accent.gold               | Verified / premium markers         |
| surface.base        | color.bg.base                   | Screen background                  |
| surface.card        | \#FFFFFF                        | Card surfaces atop base background |
| border.default      | color.gray.100                  | Dividers, input borders (resting)  |
| border.focus        | color.primary.blue              | Input border on focus              |

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
| Accessibility        | Role: button. Minimum contrast 4.5:1 (white text on \#001B68 = 12.6:1). Disabled state announced via accessibilityState. |
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

Balance Card

Primary trust surface on Home; displays available balance-equivalent and wallet ID. Wallet-less architecture note: this reflects net position across pending settlements, not a custodial balance.

|                      |                                                                                                                  |
|----------------------|------------------------------------------------------------------------------------------------------------------|
| **Attribute**        | **Specification**                                                                                                |
| Variants             | Default (single corridor), Expanded (multi-corridor carousel, future)                                            |
| States               | Loaded, Loading (skeleton), Hidden (privacy toggle "••••")                                                       |
| Spacing (8pt grid)   | radius.xl (32px) per UI_UX_SCREEN_SPEC.md, Xspeeria Blue Gradient fill, internal padding space.4, elevation.2    |
| Accessibility        | Amount exposed to screen readers only when privacy toggle is off; privacy toggle has explicit accessibilityLabel |
| Interaction Behavior | Gradient shifts subtly on pull-to-refresh; amount count-up animates over motion.base when balance changes        |

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

Placeholder shown while async data loads (balance, marketplace listings, transaction detail).

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
| Interaction Behavior | No animation; verified badge (gold) fades in once on mount if applicable                    |

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

Primary app navigation, persistent across top-level screens (per UI_UX_SCREEN_SPEC.md: Home, Cards, Scan, Analytics, Profile).

|                      |                                                                                                                                                           |
|----------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Attribute**        | **Specification**                                                                                                                                         |
| Variants             | Default (5 items)                                                                                                                                         |
| States               | Item: inactive, active, badge-present                                                                                                                     |
| Spacing (8pt grid)   | Height 56px + safe area inset, icons 24px, active-item label visible, inactive labels visible per Apple HIG (not icon-only)                               |
| Accessibility        | Active tab communicated via accessibilityState selected=true, not color alone                                                                             |
| Interaction Behavior | Active indicator (4px dot or bar) animates position over motion.fast on tab change; center "Scan" item may be elevated as a distinct FAB-style affordance |

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
| Error State        | Inline field errors + banner for invalid credentials (rate-limited after 5 attempts per SECURITY.md posture)                                |
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
| Error State        | Error state on OTP Input + shake animation on incorrect code; lockout after configured max attempts per SECURITY.md |
| Loading State      | Digits disabled during verification call; spinner overlays OTP row                                                  |
| Micro-interactions | Success: OTP row flashes success-green border before navigation                                                     |
| Accessibility      | Resend button disabled state clearly communicated with remaining-seconds label, not just grayed out                 |

5.2 Core Application

Home

|                    |                                                                                                                                                                                                                                                                                                   |
|--------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Aspect**         | **Specification**                                                                                                                                                                                                                                                                                 |
| Layout             | Per UI_UX_SCREEN_SPEC.md: Header (gradient avatar, greeting, notification bell) \> Balance Card (radius 32, Xspeeria Blue Gradient, balance, wallet ID, currency selector) \> Quick Actions (Deposit, Send, Utility, More) \> Recent Transactions (3 floating premium cards) \> Bottom Navigation |
| Visual Hierarchy   | Balance Card is the dominant visual element; Quick Actions second; Recent Transactions third                                                                                                                                                                                                      |
| Component Tree     | SafeAreaView \> Header \> BalanceCard \> QuickActionsRow\[4\] \> RecentTransactionsSection(TransactionCard×3) \> BottomNavigation                                                                                                                                                                 |
| Navigation         | Bell → Notifications; Balance Card currency selector → in-place switch; Quick Actions → respective flows; Transaction Card → Transaction Timeline; Bottom Nav → top-level sections                                                                                                                |
| Empty State        | Recent Transactions section shows Empty State ("No transactions yet — Create your first offer") if zero history                                                                                                                                                                                   |
| Error State        | Balance Card shows a compact inline error + retry if balance fetch fails, rest of screen remains interactive                                                                                                                                                                                      |
| Loading State      | Balance Card and Transaction Cards render Loading Skeleton matching final dimensions on cold load                                                                                                                                                                                                 |
| Micro-interactions | Balance count-up animation on load; pull-to-refresh triggers a brief gradient shimmer on Balance Card                                                                                                                                                                                             |
| Accessibility      | Balance amount hidden by default behind a "show/hide" toggle is a recommended pattern for shoulder-surfing protection — flagged for product decision, not yet in source spec                                                                                                                      |

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
| Accessibility      | Counterparty verification badge has explicit text alternative ("KYC Verified"), not gold-icon-only                                                    |

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
| Micro-interactions | Camera capture frame pulses gold on successful document edge-detection lock                                                         |
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
| Navigation         | Queue item → detail/action screen (approve/reject KYC, resolve dispute) with RBAC-gated actions per SECURITY.md                     |
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
| Settlement Completed | Stepper final node fills success-green, balance updates with count-up | 600ms        | Reinforces the causal link between settlement and balance change                             |
| Balance Refresh      | Subtle gradient shimmer sweep across Balance Card                     | 400ms        | Signals live data without a jarring reload                                                   |
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

- Balance visibility default (shown vs. hidden-by-default) on Home.

- Whether "Cards" and "Analytics" (present in UI_UX_SCREEN_SPEC.md bottom navigation) are in MVP scope, given PRODUCT_REQUIREMENTS_DOCUMENT.md does not list a cards or analytics feature in the MVP.

- Final icon set licensing (Phosphor vs. SF Symbols-derived custom set) for cross-platform parity.

- Whether Admin (Next.js) requires a distinct component library instance or directly consumes the mobile token set via a shared package.
