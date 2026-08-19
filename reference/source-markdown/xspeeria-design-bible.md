# XSPEERIA
## Design System & UI/UX Bible

**Version 2.0 — Confidential — Investor & Engineering Reference**

*"Trust is not a feature. It is the interface itself."*

Xspeeria is a wallet-less, non-custodial peer-to-peer fiat exchange marketplace. Every pixel in this document exists to make that promise visible: your money never touches us — it moves bank to bank, verified, timed, and transparent.

> **Source of truth:** this edition is built directly from `Xspeeria_UIUX_AppFlow_Spec_v2.docx` (Doc Version 2.0, August 2026, Internal — Confidential — Pre-Development Blueprint), the authoritative, sign-off-ready UI/UX specification covering all 22 MVP screens. Every token, flow, and screen spec below is reproduced faithfully from that source — nothing here contradicts it. This replaces an earlier internal draft that used an unsourced dark-theme palette; that draft has been fully discarded.

---

# Page 2 — What This Version Corrects

The source spec itself documents a resolved contradiction worth surfacing here, because it's a case study in the discipline this product demands: an earlier internal spec described a Home screen "Balance Card" showing a stored balance and wallet ID, and a five-tab navigation including "Cards" and "Scan." Both directly contradicted Xspeeria's wallet-less, non-custodial architecture — Xspeeria never holds customer funds, so a balance figure has no meaning.

**Resolved:**
- "Balance Card" → **Status Overview Card** — shows active FX request count, pending settlement count, and a preferred currency-pair shortcut. No balance figure, no wallet ID, anywhere, ever.
- Bottom navigation → **Home, Marketplace, Track, Notifications, Profile.** Cards is a deferred Phase 12 feature; no Scan flow exists in the product; Analytics isn't in MVP scope.
- Home quick actions → **New FX Request, Browse Marketplace, Track Transaction, Support** — marketplace-native language, not wallet-native.
- Typography and elevation token usage notes updated to remove every balance reference.

This is a template for how every future design decision should be checked: does this visual choice, even implicitly, suggest Xspeeria custodies funds? If yes, it's wrong regardless of how clean it looks.

---

# Page 3 — Design Principles

Design language: **Apple Wallet × Revolut Ultra × Stripe × Linear** — restrained, high-contrast, generously spaced, engineered for trust. Every visual decision must be justified against one of three criteria: it reduces cognitive load during a financial decision, it reinforces trust and security perception, or it accelerates task completion for time-sensitive FX activity.

| Principle | Applied rule |
|---|---|
| **One primary action per screen** | Every screen has exactly one high-emphasis (filled, primary-color) action; everything else is secondary or ghost. |
| **Amounts and figures are sacred** | All currency and numeric values render in tabular (monospaced-figure) type, right-aligned in lists, never truncated. |
| **Status is always visible** | Any transaction, offer, or match in a non-terminal state shows a persistent status chip — the user is never left guessing what happens next. |
| **No dead ends** | Every empty and error state includes a specific next action, never just an apology. |
| **Motion has meaning** | Animation communicates a state change (matched, settled) — never decoration for its own sake. |

---

# Page 4 — Color Tokens

| Token | Hex | Usage |
|---|---|---|
| `color.primary.blue` | `#001B68` | Brand identity, primary buttons, headers, active nav, links |
| `color.success.green` | `#179A43` | Completed settlement, positive outcome, success toast |
| `color.alert.red` | `#E52421` | Errors, failed transactions, destructive actions, disputes |
| `color.accent.gold` | `#F4C21F` | Premium accents, badges, KYC-verified marker, rare emphasis |
| `color.bg.base` | `#F8FAFC` | App background |
| `color.text.primary` | `#111827` | Body copy, headings |

This is the complete confirmed palette — six tokens, no more. Any additional token (secondary text tint, hairline border color, a distinct warning hue) is an implementation detail engineering will need to derive and route through design sign-off before locking; none is specified in the source and none should be treated as final without that review.

---

# Page 5 — Typography

| Style | Size / line height | Usage |
|---|---|---|
| Display (Bold) | 34 / 41 | Status count numerals on Home, KPI figures on Business Dashboard |
| Title 1 (Bold) | 28 / 34 | Screen titles |
| Title 2 (Semibold) | 22 / 28 | Section headers, modal titles |
| Headline (Semibold) | 17 / 22 | Card titles, list item primary text |
| Body (Regular) | 15 / 20 | Default body copy |
| Numeral — Tabular (Semibold) | 17–34 | All currency and numeric values, tabular-figure variant |

**Note on "Display":** this was explicitly corrected from an earlier "balance amount on Home" usage — it never renders a money figure on Home; it renders the Status Overview Card's activity counts instead.

---

# Page 6 — Spacing, Radius, Elevation

| Token | Value | Usage |
|---|---|---|
| `space.2 / space.3 / space.4` | 8 / 16 / 24px | Base unit / card padding / section gaps |
| `space.6` | 32px | Screen-edge margins |
| `radius.md` | 16px | Standard cards, inputs |
| `radius.lg` | 24px | Buttons, bottom sheets |
| `radius.xl` | 32px | Status Overview Card — reserved exclusively for this component |
| `elevation.1` | `0 1px 2px rgba(17,24,39,0.06)` | Resting cards |
| `elevation.2` | `0 4px 12px rgba(0,27,104,0.12)` | Status Overview Card, floating transaction cards |
| `elevation.3` | `0 8px 24px rgba(0,27,104,0.18)` | Modals, bottom sheets, FAB |

---

# Page 7 — Motion

| Token | Duration / curve | Usage |
|---|---|---|
| `motion.instant` | 100ms ease-out | Button press feedback |
| `motion.fast` | 180ms ease-in-out | Toast, chip state change |
| `motion.base` | 240ms ease-in-out | Screen transitions, modal open |
| `motion.slow` | 400ms ease-out | Match / settlement success — calm confidence, never celebratory confetti |
| `motion.skeleton` | 1200ms loop, linear | Loading skeletons |

---

# Page 8 — App Structure & Flows

**Structure:** every screen sits under one of five bottom-navigation destinations — **Home, Marketplace, Track, Notifications, Profile** — reached only after identity verification. No Cards, Scan, or Analytics tab.

**Onboarding & authentication:**
```
Splash → Onboarding (3-slide carousel) → Register/Login → OTP/MFA → KYC (document + liveness)
KYC —Auto-approved→ Home
KYC —Manual review→ Pending review (async notification) → Home
```

**Core money journey — the highest-stakes UX surface in the product.** Users watch real money move through the backend transaction state machine — `DRAFT → MATCHED → ACCEPTED → FUNDING_PENDING → FUNDS_CONFIRMED → ESCROW_CONFIRMED → SETTLEMENT_PENDING → SETTLED → COMPLETED` — without ever seeing a custodial balance:
```
Marketplace (browse) → Create Offer/Request (amount, rate, pair) → Offer/Request Details
  —Accept→ Match Details (both parties confirm)
    —Proceed→ Settlement Tracking (funds verified, no custody held) —Both legs settled→ Transaction Timeline (completed)
    —Raise issue→ Disputes
```

**Account, support & operations:**
```
Profile → Settings (security, notifications, language)
Profile → KYC status / re-verification
Notifications → Deep link to Match / Settlement / Dispute
Support → New ticket / existing thread
Match Details —Raise dispute→ Disputes
Business Dashboard → Export statement (async)
Admin Mobile → KYC review queue / Dispute queue
```

---

# Page 9 — Screen Specification Format

All 22 MVP screens are specified below, grouped into the four journeys shown in the flows above: **Onboarding & Authentication** (6 screens), **Core Application** (7 screens), **Account & Support** (5 screens), **Business & Admin** (2 screens — plus Support, counted above). Every screen spec covers: Layout, Visual Hierarchy, Component Tree, Navigation, Empty State, Error State, Loading State, Micro-interactions, and Accessibility — no screen ships without all nine defined.

---

# Page 10 — Onboarding & Authentication (1/2)

**Splash** — Full-bleed Primary Blue background, centered wordmark, no interactive elements. Auto-advances to Onboarding (first launch) or Home (returning, valid session) after 1200ms. Logo scale-in 0→1.0 over `motion.base`; respects reduce-motion (static logo, no animation).

**Onboarding** — 3-slide horizontal carousel, illustration top 60%, headline + body bottom 40%, pagination dots + Skip. Swipe or Next through 3 slides → Register; Skip → Register directly. Slide follows finger 1:1 during drag, snaps with `motion.base` spring on release.

**Register** — Scrollable form: header, full name, email, phone, password (with strength meter), terms checkbox, primary CTA, login link. Submit → OTP; inline per-field validation + banner for server errors (e.g. email already registered). Password field has visible show/hide toggle with `accessibilityLabel "Show password"`; strength meter has a text equivalent, not color-only.

**Login** — Centered form: logo, email, password, "Forgot password?" link, primary CTA, "Create account" link, biometric quick-login if enrolled. Submit → MFA (if enabled) or Home. Rate-limited after 5 attempts per `SECURITY.md` posture; lockout message states retry time via a live region.

---

# Page 11 — Onboarding & Authentication (2/2)

**Forgot Password** — Single email field, explanatory copy, submit CTA, back link. Submit → confirmation screen ("check your email") → back to Login. Confirmation cross-fades in place of the form over `motion.base` and is announced via a live region.

**MFA** — OTP input, countdown resend timer, channel indicator (SMS/Email/Authenticator). Auto-submits on 6th digit → Home. Error state shakes the OTP row on incorrect code; lockout after configured max attempts per `SECURITY.md`. Success flashes a green border before navigating. Resend button's disabled state shows a remaining-seconds label, not just gray-out.

---

# Page 12 — Core Application: Home & Marketplace

**Home** — Header (avatar, greeting, notification bell) → **Status Overview Card** (`radius.xl` 32px, solid Xspeeria Blue, active FX requests count, pending settlements count, preferred currency-pair shortcut — no balance, no wallet ID, ever) → Quick Actions (New FX Request, Browse Marketplace, Track Transaction, Support) → Recent Transactions (up to 3 cards: pair, stage chip, next action) → Bottom Navigation. Bell → Notifications; pair chip on Status Card → Marketplace pre-filtered to that pair; Transaction Card → Match Details or Settlement Tracking depending on current stage. Empty: "No transactions yet — create your first offer." Status counts increment on load; pull-to-refresh triggers a brief flat-fill pulse. **No balance or account-number figures ever appear on this screen** — this removes the shoulder-surfing concern flagged against the earlier v1 spec entirely, rather than hiding it behind a show/hide toggle.

**Marketplace** — Segmented control (Offers / Requests), filter bar (currency, amount range, rate), scrollable list of listing cards (rate-sorted), FAB "Create." Tap listing → Offer/Match Details; FAB → Create Offer or Create Request. Empty: "No offers match your filters" + "Clear filters" CTA. New listings matching active filters slide in from top with a brief highlight pulse. Filter bar fully screen-reader operable with an explicit "N filters active" summary.

---

# Page 13 — Core Application: Create Offer/Request & Details

**Create Offer** — Multi-step form: amount + currency pair → desired rate → settlement window → review. Step indicator fills over `motion.fast` on advance. Rate outside market band triggers a warning, not a hard block. Step indicator announces "Step 2 of 4: Desired rate" on each transition. **Create Request** mirrors this structure exactly with inverted currency-direction framing.

**Offer Details** — Offer summary card, counterparty preview (rating, verification badge), rate breakdown, action buttons (Accept / Edit / Cancel depending on ownership). Accept → Match Details; Cancel → confirmation Modal → Marketplace. Full-screen error state if the offer was withdrawn/expired since navigation. Counterparty verification badge has an explicit text alternative ("KYC Verified") — never gold-icon-only.

---

# Page 14 — Core Application: Match Details & Settlement Tracking

**Match Details** — Matched-pair summary (both parties, agreed rate, amounts), settlement instructions, status timeline preview, chat/dispute entry point. Proceed → Settlement Tracking; Dispute → Disputes flow. Confirmation banner celebrates with a single restrained checkmark animation (`motion.slow`) — **not confetti**, consistent with the "calm confidence" pillar. Status timeline items are individually announced in reading order with the current step flagged "current."

**Settlement Tracking** — Step-by-step settlement progress (Initiated → Funds Verified → Processing → Completed), estimated time remaining, support entry point. Vertical stepper is the dominant element; automatic navigation to the success state fires on the completion webhook, not a client-side guess. Failed-step state highlights alert-red on the stepper itself with a "Contact support" CTA. Completed step transitions gray → success-green with a checkmark draw-on animation over `motion.base`. Each step change is announced via a polite live region.

---

# Page 15 — Core Application: Transaction Timeline

Chronological, reverse-order activity feed of all transaction events (created, matched, settled), grouped by sticky date headers, full detail on tap → Match Details / Settlement Tracking / Dispute. Empty: "No activity yet" + CTA to Marketplace. New events entering at top slide in with a brief highlight. Date group headers are separately announced when scrolled past.

---

# Page 16 — Account & Support (1/2)

**Notifications** — Grouped list (Today / This week / Earlier), read/unread visual distinction, swipe-to-dismiss. Tap → relevant deep link (transaction, dispute, KYC status). Unread dot fades out on read (`motion.fast`) rather than disappearing instantly; unread state also carries an `accessibilityLabel` prefix "Unread:" — never color alone.

**KYC** — Multi-step: personal details → document capture (camera) → selfie liveness → review → pending/approved/rejected status. Rejected state gives a specific, actionable reason ("Document photo blurry — retake"), never a generic failure. Document upload shows a determinate progress bar, not an indeterminate spinner. Camera-based steps include a manual file-upload fallback.

**Profile** — Avatar + name + verification badge header, account details list, linked bank accounts, security section entry. Verification badge appears with a subtle scale-in once KYC approval is confirmed. Every list row meets the 44px minimum touch target regardless of visual density.

---

# Page 17 — Account & Support (2/2)

**Settings** — Grouped list: Notifications, Security (MFA, biometric, password), Language/Region, Legal, Log out. Log out → confirmation Modal → Login. Toggle-level inline error with automatic revert if a preference fails to save. Toggles expose `accessibilityRole="switch"` with current state announced.

**Support** — FAQ search, categorized help articles, "Contact us" entry (chat/ticket), active ticket status if any. Search results fade in as the user types (debounced). "No results" state applies to search specifically, not the whole screen. Category grid items are equally sized touch targets ≥44px regardless of label length.

**Disputes** — Dispute list (open/resolved), dispute detail with evidence thread, file-upload for evidence, resolution status. "Raise dispute" (from Match Details) → new dispute form. Empty state is positive-framed: "No disputes." New message/evidence items slide in at the bottom of the thread with auto-scroll. Evidence thread items are announced in chronological order with sender identity explicit.

---

# Page 18 — Business & Admin

**Business Dashboard** — SME/importer-oriented summary: aggregate FX volume, active offers/requests, settlement calendar, downloadable statements. KPI cards top, activity/calendar below. KPI cards → filtered Transaction Timeline; Export → async statement generation with a ready-notification. Empty: "No business activity yet — verify your business account" if business KYC is incomplete. Each KPI card fetches and retries independently. KPI numbers count up on load. Each KPI card exposes value + label + trend direction as a single accessible string, not three fragments.

**Admin Mobile** — Condensed console for on-call operations staff: pending KYC queue, dispute queue, system health snapshot as a persistent top strip. Queue item → approve/reject KYC or resolve dispute, RBAC-gated per `SECURITY.md`. Empty: "Queue clear" (positive). This is an operational tool — a full-screen retry state on load failure is required; silent partial failure is not acceptable. Approved/resolved items animate out of the queue (slide + fade) rather than vanishing instantly. **Destructive/high-consequence actions (reject KYC, force-resolve dispute) require an explicit confirmation Modal, never a single tap.**

---

# Page 19 — Key Components

| Component | Specification |
|---|---|
| **Status Overview Card** | Primary trust surface on Home. Displays FX marketplace/transaction activity — active request count, pending settlement count, preferred currency-pair shortcut. **Never displays a stored balance or wallet ID:** Xspeeria is wallet-less and non-custodial, and this card must not imply otherwise. |
| **Bottom Navigation** | Persistent across top-level screens: Home, Marketplace, Track, Notifications, Profile. No Cards, Scan, or Analytics tab in MVP. |
| **Transaction Card** | Represents a single transaction/settlement in lists and the Home "Recent Transactions" rail. Shows currency pair, current state-machine stage, and next available action — never a balance figure. |
| **Primary Button** | Single highest-emphasis action per screen. Height 52px, `radius.lg` (24px), scale to 0.97 on press, light haptic. |

---

# Page 20 — Accessibility, Open Items & Developer Handoff

**Accessibility:** Xspeeria targets **WCAG 2.1 AA** conformance across mobile and admin surfaces, treated as a compliance and trust requirement consistent with a regulated financial product — not an optional enhancement. Verified at three checkpoints: automated contrast/touch-target linting in CI on every component PR, a manual VoiceOver/TalkBack pass on every new screen before merge, and a full WCAG AA audit each quarter.

**Open Design Decisions — require explicit sign-off before implementation:**
- Final icon set licensing (Phosphor vs. SF Symbols-derived custom set) for cross-platform parity.
- Whether Admin (Next.js) requires a distinct component library instance or directly consumes the mobile token set via a shared package.
- Exact copy for empty/error states across all 22 screens — this spec defines structure and intent; final microcopy needs a content-design pass.
- *Resolved, no longer open:* balance visibility on Home (removed entirely, not hidden-by-default) and whether Cards/Analytics are in MVP scope (they are not).

**Developer Handoff Tokens (Tailwind-ready):**
```js
colors: {
  primary: { blue: '#001B68' },
  success: '#179A43',
  alert: '#E52421',
  accent: { gold: '#F4C21F' },
  bg: { base: '#F8FAFC' },
  text: { primary: '#111827' },
}
borderRadius: { md: '16px', lg: '24px', xl: '32px' }
spacing: { 2: '8px', 3: '16px', 4: '24px', 6: '32px' }
```

---

**THIS DOCUMENT IS THE SINGLE VISUAL SOURCE OF TRUTH FOR XSPEERIA, REPRODUCED FROM XSPEERIA_UIUX_APPFLOW_SPEC_V2.DOCX.**
