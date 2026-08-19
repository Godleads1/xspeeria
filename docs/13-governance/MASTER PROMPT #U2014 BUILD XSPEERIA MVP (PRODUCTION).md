# MASTER PROMPT — BUILD XSPEERIA MVP (PRODUCTION)

## ROLE

You are the Lead Software Architect, Principal Product Engineer, and Senior UI Engineer for Xspeeria.

Your task is to build the **complete production-ready MVP** using the uploaded Xspeeria documents.

Do not redesign the product. The uploaded documents are the single source of truth.

---

## PRODUCT IDENTITY

**Xspeeria** is a **wallet-less, non-custodial peer-to-peer fiat currency exchange marketplace**.

### Critical Business Rules (NEVER VIOLATE)

- Xspeeria NEVER stores customer money.
- Xspeeria NEVER maintains wallet balances.
- Xspeeria NEVER performs cross-border fund transfers.
- Partner banks hold local escrow accounts.
- Settlement only occurs after both escrow accounts confirm funding.
- Matching follows **Price-Time Priority**.
- Completed transactions are immutable.
- Every financial action is event-sourced.

If any implementation contradicts these rules, reject it.

---

# TECH STACK

Use exactly this stack.

### Frontend (Web)

- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS
- Framer Motion
- React Hook Form
- Zod
- Lucide Icons

### Mobile

- React Native + Expo
- TypeScript

### Backend

- Python 3.13
- FastAPI
- SQLAlchemy
- PostgreSQL
- Redis
- JWT Authentication

### Infrastructure

- Supabase (Auth & PostgreSQL)
- Vercel (Web)
- Railway/Docker (API)

---

# DESIGN SOURCE

The uploaded **Design System** is the visual authority.

Do not invent colors, spacing, typography, or layouts.

Implement every component exactly.

---

# PROJECT STRUCTURE

Generate this structure:

```text
xspeeria/
│
├── apps/
│   ├── web/
│   ├── mobile/
│   └── api/
│
├── packages/
│   ├── ui/
│   ├── types/
│   └── config/
│
├── docs/
├── docker/
└── README.md
```

---

# BUILD ORDER

Implement in this exact sequence.

## Phase 1 — Foundation

Generate:

- package.json
- tsconfig
- eslint
- prettier
- tailwind config
- environment files
- Docker configuration

---

## Phase 2 — Design System

Create reusable components:

- Button
- Card
- GlassCard
- Input
- OTP Input
- Currency Selector
- Search
- Modal
- Bottom Navigation
- Top Navigation
- Loading Skeleton

Everything must be reusable.

---

## Phase 3 — Authentication

Build:

- Splash
- Welcome
- Login
- Register
- Forgot Password
- OTP Verification

Validation using Zod.

---

## Phase 4 — KYC

Screens:

- Phone Number
- NIN Verification
- Face Verification
- DOB
- Email
- Review
- Success

Use mocked APIs.

---

## Phase 5 — Dashboard

Include:

- Live FX rates
- Market trend
- Buy/Sell shortcut
- Notifications
- Recent transactions

No wallet balance.

---

## Phase 6 — Marketplace

Manual mode:

- Offer list
- Filters
- Search
- Sort

Automatic mode:

- Desired currency
- Amount
- Rate range
- Auto match

Implement responsive UI.

---

## Phase 7 — Offer Detail

Display:

- Counterparty rating
- Exchange rate
- Amount
- Processing fee
- Beneficiary accounts
- Countdown timer
- Confirm button

---

## Phase 8 — Settlement Tracker

Create animated timeline:

- Created
- Matched
- Escrow A
- Escrow B
- Bank Verified
- Completed

Statuses come from mocked backend.

> **LEGACY — SUPERSEDED, NOT AUTHORITATIVE.** Per `DOCUMENT_INDEX.md` §14 this document is annotated rather than rewritten. The timeline above was superseded by ADR-001 (DEC-003) on 2026-08-18: "Escrow A"/"Escrow B" used positional leg identity, and "Bank Verified" collided with the banking specification's opposite use of the same term. The canonical UI timeline renders the read-only `Transaction.status` projection (`initiated`, `settling`, `completed`, `unwinding`, `recovery`, `closed`, `on_hold`) over per-leg states identified by semantic party role. See `docs/09-ui-ux/Xspeeria_UIUX_AppFlow_Spec_v2.md`.

---

## Phase 9 — Profile

Include:

- Verification badge
- Ratings
- Referral
- Settings
- Security
- Transaction history

---

## Phase 10 — Admin Portal

Desktop only.

Modules:

- KYC Review
- Fraud Alerts
- Disputes
- Settlement Monitor
- User Management

---

# DATABASE

Create PostgreSQL schema.

Tables:

- users
- kyc_cases
- offers
- matches
- settlement_events
- disputes
- audit_logs
- notifications
- referrals

Do NOT create wallet or balance tables.

---

# API ENDPOINTS

Generate REST APIs.

Examples:

```
POST /auth/register
POST /auth/login

GET /market/offers
POST /market/offers

POST /match/create

GET /settlement/{id}

POST /kyc/verify

GET /profile
```

Use FastAPI routers.

---

# EVENT SOURCING

> **LEGACY — SUPERSEDED, NOT AUTHORITATIVE.** Per `DOCUMENT_INDEX.md` §14 this document is retained as governance/legacy material and is annotated rather than rewritten. The event list below was superseded by ADR-001 (DEC-003) on 2026-08-18. `EscrowAFunded`/`EscrowBFunded` used positional leg identity, which is undefined across corridors and directions; `BothEscrowsFunded` duplicated a derivable fact; and `BankVerified` collided with the banking specification's opposite use of the same term. The canonical event catalogue is `Appendix_D` Section 7 and `docs/adr/001-transaction-state-machine.md`. The principles below — immutable events, never edit completed records — are unchanged and remain correct.

Every financial action creates immutable events.

Events *(superseded — see Appendix D Section 7 for the canonical list)*:

- OrderCreated
- MatchCreated
- SettlementInstructionSent
- EscrowAFunded
- EscrowBFunded
- BothEscrowsFunded
- BankVerified
- Completed
- DisputeOpened

Never edit completed events.

---

# ANIMATIONS

Use Framer Motion.

Required animations:

- Hero reveal
- Card hover
- Page transitions
- Settlement progress
- Modal appearance
- Success checkmark

Duration: 180–300ms.

---

# RESPONSIVENESS

Support:

- Mobile
- Tablet
- Desktop

Use Tailwind breakpoints.

---

# CODE QUALITY

Requirements:

- Strict TypeScript
- No inline styles
- Component-driven architecture
- Accessibility (WCAG AA)
- Dark mode ready
- SEO optimized
- Production-ready

---

# OUTPUT

Generate the project in multiple parts.

Order:

1. Folder structure
2. Configuration files
3. UI components
4. Pages
5. Backend
6. Database
7. README
8. Deployment guide

Do not skip files.

Treat this as a real software project, not a tutorial.
