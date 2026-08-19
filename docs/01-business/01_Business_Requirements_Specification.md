<!-- SOURCE DOCUMENT: 01_Business_Requirements_Specification.docx -->
<!-- Converted to Markdown for Claude/Claude Code repository use. -->
<!-- Source content is preserved; this conversion does not establish new business or technical authority. -->

# Table of Contents

# XSPEERIA

## Business Requirements Specification (BRS)

**Document Classification:** Confidential — Investor / Board / Regulatory Distribution **Version:** 1.0 (Draft for Stakeholder Review) **Audience:** Investors, Board, Executives, Banking Partners, Engineering Leadership **Companion Documents:** Technical Design Specification (TDS), Compliance & Operations Manual (COM)

## Document Control

| Field           | Value                                                 |
|-----------------|-------------------------------------------------------|
| Document Owner  | Product & Strategy                                    |
| Review Cycle    | Quarterly, or upon major scope change                 |
| Status          | Draft — Pre-Development                               |
| Launch Corridor | NGN ⇄ GBP (pilot); NGN ⇄ USD Year 2                   |
| Distribution    | Investors, Board, Executives, Engineering, Compliance |

# TABLE OF CONTENTS

1.  Executive Summary
2.  Company Vision
3.  Market Problem
4.  Opportunity Analysis
5.  User Personas
6.  Business Objectives
7.  Product Scope
8.  Functional Requirements
9.  User Stories
10. Business Process Flows
11. Pricing & Revenue Model
12. Success Metrics
13. KPIs
14. Risk Register
15. MVP Definition
16. Product Roadmap

# 1. EXECUTIVE SUMMARY

Xspeeria is a premium, wallet-less, peer-to-peer fiat currency exchange platform. It connects individuals and businesses who need to exchange currency — starting with the Nigerian Naira and British Pound corridor (NGN ⇄ GBP) — directly with one another, with NGN ⇄ USD added as the second corridor in Year 2, with settlement executed through licensed banking and payment partners rather than through Xspeeria holding customer funds.

Xspeeria is explicitly **not** a cryptocurrency exchange, not a custodial wallet, and not a bank. It is a matching and orchestration layer that sits above regulated settlement rails, built for a specific, underserved population: diaspora communities, freelancers, SMEs, importers, exporters, and remote workers who currently rely on informal, opaque, or expensive channels to move money between Nigeria and the United States.

This document sets out the business rationale, target users, functional scope, and success criteria for the platform, and is intended to be the source of truth for product, engineering, and compliance teams as they move from specification into build.

**\[ASSUMPTION-BRS-01\]** All figures presented in this document (market size references, illustrative pricing, growth targets) are directional planning inputs for internal alignment, not audited financial projections, and should be validated against primary market research before being used in external investor materials.

# 2. COMPANY VISION

## 2.1 Vision Statement

To become the most trusted peer-to-peer currency exchange network for underserved corridors — starting with NGN ⇄ GBP, with NGN ⇄ USD following in Year 2 — by replacing opaque, high-friction currency conversion with a transparent, secure, and fairly priced marketplace.

## 2.2 Mission

Xspeeria exists to give diaspora communities, freelancers, and small businesses direct, peer-driven access to fair exchange rates, without requiring either party to surrender custody of their funds to a third party during the exchange process.

## 2.3 Long-Term Positioning

Xspeeria is designed from day one as a multi-corridor platform, with NGN ⇄ GBP as the pilot corridor and NGN ⇄ USD as the Year 2 corridor, per the 5-Year Business Plan's corridor expansion roadmap (Section 8). The architecture (see TDS Section 13.3) and this specification treat currency pair as a configurable dimension, not a structural constraint, so that additional corridors (e.g., NGN⇄USD, GHS⇄GBP, KES⇄USD) can be added modularly as the business validates demand and secures the necessary banking partnerships in each new market.

## 2.4 Brand Positioning

Xspeeria is positioned as a **premium, trust-first** product — closer in feel to Apple Wallet, Revolut Ultra, and Stripe than to informal peer-to-peer forums or grey-market currency brokers. This positioning is a deliberate response to the market problem described in Section 3: the existing alternatives are either informal and risky, or formal and expensive/slow. Xspeeria’s differentiation is combining the trust and polish of a regulated fintech product with the pricing efficiency of a peer-to-peer marketplace.

# 3. MARKET PROBLEM

## 3.1 The Core Problem

Individuals and businesses who need to convert Naira to US Dollars (or vice versa) currently face a fragmented set of poor options:

| Channel                                                                     | Problem                                                                                                                            |
|-----------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------|
| Informal/black-market currency traders                                      | No recourse if a counterparty doesn’t pay; rates can be exploitative; no audit trail; high personal risk                           |
| Traditional bank FX desks                                                   | Slow, often subject to unofficial rate spreads, limited daily/monthly allowances, heavy documentation burden                       |
| Money transfer operators (MTOs)                                             | High fees, especially for smaller transfers common among freelancers/individuals; rates often less favorable than true market rate |
| Social media / community FX groups (e.g., WhatsApp/Telegram trading groups) | Entirely informal, no dispute resolution, high fraud risk, no compliance oversight                                                 |

## 3.2 Why This Problem Persists

- **Regulatory friction** makes it costly for small players to become licensed money transmitters, so the market is dominated by either large, slow incumbents or unregulated informal networks.
- **Currency scarcity dynamics** in the Nigerian market create persistent gaps between official and parallel-market rates, pushing users toward informal channels regardless of the risk.
- **Trust infrastructure is missing** — there is no widely trusted, technology-native platform that lets two parties transact directly with confidence that funds and settlement are properly verified.

## 3.3 Who Feels This Problem Most Acutely

Diaspora Nigerians sending or receiving money, Nigerian freelancers being paid in USD by foreign clients, and SMEs/importers/exporters needing reliable FX for trade — all groups for whom currency conversion is a recurring, not one-off, need, and for whom cumulative fees and unfavorable rates compound significantly over time.

# 4. OPPORTUNITY ANALYSIS

## 4.1 Market Opportunity

**\[ASSUMPTION-BRS-02\]** The Nigeria–US remittance and cross-border payment corridor is one of the largest Africa-linked corridors globally, driven by a large Nigerian diaspora population in the US and a growing Nigerian freelance/remote-work economy. Precise volume figures should be sourced from primary market research (e.g., World Bank remittance data, central bank statistics) before inclusion in investor-facing materials; none are asserted here as verified fact.

## 4.2 Structural Tailwinds

| Tailwind                                                                  | Relevance to Xspeeria                                                                            |
|---------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------|
| Growth of remote work and global freelancing among Nigerian professionals | Recurring, predictable USD-denominated income needing conversion                                 |
| Persistent gap between official and parallel exchange rates               | Demand for a transparent marketplace rate discovery mechanism                                    |
| Rising smartphone and mobile banking penetration in Nigeria               | Enables a mobile-first product to reach the target audience directly                             |
| Diaspora remittance growth                                                | Structural, recurring demand for the GBP→NGN direction (pilot), with USD→NGN following in Year 2 |
| SME/import-export digitization                                            | Growing willingness among small businesses to use digital-first financial tools                  |

## 4.3 Competitive Landscape (Qualitative)

| Competitor Type                | Examples (Category)                    | Xspeeria’s Differentiation                                                                                              |
|--------------------------------|----------------------------------------|-------------------------------------------------------------------------------------------------------------------------|
| Traditional MTOs               | Western Union–style operators          | Lower fees via peer-to-peer rate discovery; modern UX                                                                   |
| Digital remittance apps        | App-based diaspora remittance products | Peer-to-peer marketplace pricing vs. fixed spread; wallet-less design                                                   |
| Informal FX networks           | WhatsApp/Telegram trading groups       | Formal dispute resolution, KYC-verified counterparties, audit trail                                                     |
| Crypto-based off-ramp products | Stablecoin-to-fiat services            | Xspeeria is explicitly not a crypto product — appeals to users who want a fiat-only, more regulator-familiar experience |

**\[ASSUMPTION-BRS-03\]** Specific named competitors and their pricing are not asserted in this document to avoid unverified competitive claims; a detailed competitive teardown should be produced as a supporting research artifact before investor presentation.

## 4.4 Why Now

- Mobile-first fintech adoption in Nigeria has reached a maturity level where a marketplace-style product is viable.
- Regulatory frameworks around licensed payment partnerships (rather than requiring Xspeeria itself to become a bank) allow a capital-efficient path to market.
- No dominant, trusted, technology-native peer-to-peer FX marketplace currently owns this corridor.

# 5. USER PERSONAS

## 5.1 Persona: Diaspora Remitter

**Profile:** Nigerian-born professional living in the United States, sends money home regularly to family.

| Dimension       | Detail                                                                                                                     |
|-----------------|----------------------------------------------------------------------------------------------------------------------------|
| Goals           | Get the best possible NGN rate for USD sent home; trust that the recipient will actually receive funds                     |
| Pain Points     | MTO fees erode value; official bank rates are unfavorable; informal channels are risky                                     |
| Behaviors       | Sends money monthly or around specific events (school fees, family needs); price-sensitive but trust-sensitive first       |
| Financial Needs | Predictable, recurring small-to-medium transfers (illustrative range, not a stated limit)                                  |
| User Journey    | Sign up → KYC → Create FX request (GBP→NGN) → Get matched → Confirm → Fund → Track settlement → Recipient confirms receipt |

## 5.2 Persona: Freelancer

**Profile:** Nigeria-based freelancer or remote worker paid in USD by international clients.

| Dimension       | Detail                                                                                                                     |
|-----------------|----------------------------------------------------------------------------------------------------------------------------|
| Goals           | Convert USD earnings to NGN at a fair rate quickly, without heavy bank documentation                                       |
| Pain Points     | Bank FX desks are slow and rate-unfavorable; needs funds quickly for living expenses                                       |
| Behaviors       | Converts USD to NGN frequently, often in smaller, recurring batches tied to invoice cycles                                 |
| Financial Needs | Fast turnaround, rate transparency, reliable recurring use                                                                 |
| User Journey    | Sign up → KYC → List USD as an offer or request → Matched with counterparty → Transaction → Settlement to NGN bank account |

## 5.3 Persona: SME

**Profile:** Small-to-medium Nigerian business owner needing USD/NGN conversion for operational needs.

| Dimension       | Detail                                                                                                         |
|-----------------|----------------------------------------------------------------------------------------------------------------|
| Goals           | Reliable, larger-volume currency conversion for business operations                                            |
| Pain Points     | Bank allowances and documentation requirements slow down operations; unpredictable access to USD               |
| Behaviors       | Periodic, business-cycle-driven conversion needs; values reliability over marginal rate optimization           |
| Financial Needs | Larger transaction sizes, business-verifiable KYC (EDD likely applicable — see COM)                            |
| User Journey    | Business sign up → Enhanced KYC/EDD → Create FX request → Match → Transaction → Settlement to business account |

## 5.4 Persona: Importer

**Profile:** Nigerian business importing goods priced in USD, needs USD to pay foreign suppliers.

| Dimension       | Detail                                                                                                                        |
|-----------------|-------------------------------------------------------------------------------------------------------------------------------|
| Goals           | Access USD reliably and at a fair rate to pay suppliers on time                                                               |
| Pain Points     | Central bank USD allocation constraints; delays in traditional channels risk supplier relationships                           |
| Behaviors       | Time-sensitive, often recurring around shipment/order cycles                                                                  |
| Financial Needs | Timely access to larger USD amounts, predictable settlement timelines                                                         |
| User Journey    | Sign up → EDD KYC → Create USD FX request → Match with NGN-side sellers → Transaction → Settlement to supplier-facing account |

## 5.5 Persona: Exporter

**Profile:** Nigerian business earning USD from exports, needs to convert to NGN for local operations.

| Dimension       | Detail                                                                                                               |
|-----------------|----------------------------------------------------------------------------------------------------------------------|
| Goals           | Convert export earnings (USD) to NGN at favorable rates to fund local operations                                     |
| Pain Points     | Mandatory repatriation and conversion processes through traditional banks can be slow and costly                     |
| Behaviors       | Recurring, tied to export/shipment cycles                                                                            |
| Financial Needs | Larger transaction sizes, business KYC, reliable settlement                                                          |
| User Journey    | Sign up → EDD KYC → List USD offer → Match with NGN-side buyers → Transaction → Settlement to local business account |

# 6. BUSINESS OBJECTIVES

## 6.1 Strategic Objectives (Year 1)

| Objective                                                                                    | Rationale                                                                        |
|----------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------|
| Successfully launch and stabilize the NGN⇄GBP corridor (pilot)                               | Validates the core product and matching model before multi-corridor expansion    |
| Establish trusted licensed banking/payment partnerships on both sides of the corridor        | Prerequisite for any settlement activity; foundational to regulatory credibility |
| Achieve a KYC/compliance program that satisfies banking partner and regulatory due diligence | Required for partner onboarding and continued operation                          |
| Build a repeatable, auditable transaction lifecycle                                          | Reduces operational risk and builds trust with users, partners, and regulators   |
| Establish initial liquidity (active offers/requests) sufficient for reliable matching        | Marketplace products require a critical mass of both sides to function           |

## 6.2 Business Model Objectives

- Generate revenue through transparent, disclosed transaction fees (see Section 11), not through opaque spread manipulation.
- Build a defensible trust moat through compliance rigor and dispute-resolution quality, rather than compete purely on rate.

# 7. PRODUCT SCOPE

## 7.1 In Scope (MVP)

- NGN ⇄ GBP corridor only
- Individual and SME user onboarding with tiered KYC
- Marketplace for FX requests and offers
- Automated exact and partial matching (see TDS Section 9)
- Wallet-less, escrow-state transaction lifecycle
- Settlement via licensed banking/payment partners
- Dispute case management
- Push/SMS/email notifications
- Admin/back-office tooling for compliance and operations

## 7.2 Out of Scope (MVP)

- Any additional currency corridor beyond NGN⇄GBP in Year 1 (NGN⇄USD is in scope from Year 2 per the 5-Year Business Plan)
- Custodial wallet or stored-value balance functionality
- Cryptocurrency or stablecoin support
- Multi-offer aggregated matching (an `FXRequest` fulfilled by combining multiple smaller `Offers`)
- Web application client (mobile-first launch only, per **\[ASSUMPTION-TDS-03\]** in the TDS)
- Automated, fully AI-driven transaction approval (AI remains advisory-only per platform-wide principle)

## 7.3 Future Scope (Post-MVP, Indicative)

- Additional corridors (e.g., NGN⇄USD, GHS⇄GBP, KES⇄USD), modular per architecture design, per the 5-Year Business Plan's Year 2+ roadmap
- Multi-offer aggregated matching
- Web client
- Recurring/scheduled FX requests for predictable-need users (e.g., monthly remitters)
- Loyalty/relationship pricing for high-frequency verified users

# 8. FUNCTIONAL REQUIREMENTS

Each feature area below includes description, business rules, acceptance criteria, edge cases, and dependencies.

## 8.1 Authentication

**Description:** Users register and authenticate via email/phone plus password, with mandatory multi-factor authentication.

**Business Rules:** - Registration requires a verifiable email and phone number. - MFA is mandatory before any financial action (offer/request creation, match confirmation). - Sessions expire and require re-authentication per security policy (see TDS Section 11.1).

**Acceptance Criteria:** - User cannot create an FX request or offer without MFA-verified session. - Failed login attempts trigger progressive lockout.

**Edge Cases:** - User loses access to MFA device — requires an identity-verified account recovery flow (defined jointly with Compliance, see COM). - Duplicate account attempts using the same verified phone/ID — must be blocked or flagged for review.

**Dependencies:** KYC module (for recovery identity verification), Notification module (for OTP delivery).

## 8.2 KYC (Know Your Customer)

**Description:** Tiered identity verification gating access to marketplace and transaction functionality.

**Business Rules:** - No user may create an FX request, offer, or participate in a match without an `approved` KYC status (see TDS Section 5.3.2, 6.2). - Verification level and risk rating determine transaction limits (thresholds defined in COM AML Policy). - Business accounts (SME, Importer, Exporter personas) require Enhanced Due Diligence (EDD).

**Acceptance Criteria:** - KYC submission flow captures ID document + liveness check. - Sanctions/PEP screening is run automatically on every submission. - Manual review queue is available for ambiguous results.

**Edge Cases:** - Document quality insufficient for automated verification — routes to manual review, not automatic rejection. - User attempts to resubmit after rejection — must be rate-limited to prevent verification-farming abuse.

**Dependencies:** Third-party KYC/liveness provider, sanctions screening provider, Admin module (manual review).

## 8.3 Marketplace

**Description:** Users create and browse FX requests and offers.

**Business Rules:** - Only KYC-approved users may create listings. - Listings must specify amount, currency pair, and desired/offered rate. - Listings have a defined expiry window.

**Acceptance Criteria:** - User can create, view, and cancel their own active listings. - Expired listings are automatically removed from active matching candidates.

**Edge Cases:** - User attempts to edit an offer that is already partially matched — must only allow edits to the unmatched remainder, never to the already-matched portion.

**Dependencies:** KYC module (gating), Matching Engine (consumer of new listings).

## 8.4 FX Requests

**Description:** A structured request from a user to convert a specified amount from one currency to another at a target rate.

**Business Rules:** See Marketplace rules above; additionally, a user may not hold more than a defined number of simultaneous active requests (operational limit, to be tuned post-launch).

**Acceptance Criteria:** Request appears in matching candidate pool immediately upon KYC-gated creation.

**Edge Cases:** Rate requested is far outside prevailing market rate — system should flag for user confirmation rather than silently rejecting (avoids false negatives on legitimate but aggressive pricing).

**Dependencies:** Marketplace module, Matching Engine.

## 8.5 Offers

**Description:** A structured offer from a user to provide a specified amount of currency at a stated rate.

**Business Rules and Acceptance Criteria:** Mirror FX Requests (Section 8.4), from the supply side.

**Edge Cases:** Same offer partially matched multiple times across separate `Match` records — aggregate matched amount must never exceed offer amount (enforced at DB level, see TDS Section 6.2/9.3).

**Dependencies:** Marketplace module, Matching Engine.

## 8.6 Matching

**Description:** Automated pairing of compatible offers and requests.

**Business Rules:** See TDS Section 9.5 for full matching rules table (rate compatibility, currency pair exactness, expiry handling, KYC re-check, self-match prevention).

**Acceptance Criteria:** A proposed match is generated within an acceptable latency window of a compatible offer/request becoming available; both parties are notified.

**Edge Cases:** Simultaneous compatible candidates — resolved via price-time priority (best rate first, then oldest listing first).

**Dependencies:** Marketplace module, Redis (locking), Notification module.

## 8.7 Transactions

**Description:** The lifecycle of a confirmed match through to completed settlement, per the state machine defined in TDS Section 10.

**Business Rules:** No state may be skipped; every transition is logged (see TDS Section 10.3).

**Acceptance Criteria:** Users can view real-time transaction status; system enforces funding timeouts.

**Edge Cases:** Sender claims to have sent funds but partner verification disagrees — routes to manual review, not automatic dispute closure.

**Dependencies:** Matching module, Settlement module, Disputes module.

## 8.8 Settlement

**Description:** Actual fiat movement executed via licensed banking/payment partners, released only once **both** settlement legs are independently confirmed `FUNDED` by their respective partner (ADR-001 / DEC-003).

**Business Rules:** Settlement is always asynchronous and partner-driven; Xspeeria never directly moves customer funds internally (wallet-less principle). Each leg is domestic-only. Release is structurally impossible while either escrow is unfunded, and a settlement is complete only when both legs reach `PAID_OUT`.

**Acceptance Criteria:** Settlement state is reflected accurately and promptly based on signature-verified partner webhook confirmation, per leg. The two legs may confirm at different times, and the interface must represent that honestly rather than implying simultaneity.

**Edge Cases:** Partner payout failure on one leg while the other has already paid out is an unresolved customer exposure — it enters `RECOVERY_REQUIRED`, remains non-terminal and operationally visible, and is never represented as a completed or reversed settlement. Failure before any payout unwinds cleanly: funded escrows are returned in full and the settlement closes as `CLOSED_UNWOUND`. Counterparty non-funding within the settlement window returns the funded party's escrow before the order is re-matched — rematching never reuses funds from the prior settlement.

**Dependencies:** Banking/payment partner APIs, Celery async processing (TDS Section 8.6).

## 8.9 Notifications

**Description:** Push, SMS, and email communication for key lifecycle events.

**Business Rules:** Notifications must never include sensitive KYC document content; financial amounts may be included per user notification preferences.

**Acceptance Criteria:** User receives timely notification for match proposal, funding reminders, settlement completion, and dispute updates.

**Dependencies:** Push/SMS/email providers, all transactional modules (as event producers).

## 8.10 Disputes

**Description:** Structured case management for contested transactions.

**Business Rules:** Disputes may be opened within a defined post-transaction window (see COM SLA table); resolution requires documented evidence review.

**Acceptance Criteria:** Dispute status is trackable by the complainant; resolution is logged with rationale.

**Edge Cases:** Both parties file conflicting disputes on the same transaction — must be merged into a single case, not processed as two independent cases.

**Dependencies:** Transaction module, Admin module, object storage (evidence).

## 8.11 Profile

**Description:** User-managed account information, including beneficiary bank details and notification preferences.

**Business Rules:** Changes to beneficiary bank details for business accounts may require re-verification (EDD-linked control, see COM).

**Acceptance Criteria:** Users can view and update permitted profile fields; sensitive changes (e.g., linked bank account) trigger a confirmation step.

**Dependencies:** KYC module (for verification-linked changes).

## 8.12 Admin

**Description:** Back-office tooling for compliance officers, operations administrators, and support agents.

**Business Rules:** Role-based access strictly enforced (see TDS Section 11.2); all admin actions are audit-logged.

**Acceptance Criteria:** Compliance officers can review and resolve KYC manual-review queue items; ops admins can view and intervene on stuck transactions; support agents have scoped access to assigned tickets.

**Dependencies:** All other modules (as data/action surface), Audit Log store.

# 9. USER STORIES

## 9.1 Authentication & KYC

| Story                                                                                                         | Priority | Acceptance Criteria                                                                        |
|---------------------------------------------------------------------------------------------------------------|----------|--------------------------------------------------------------------------------------------|
| As a new user, I want to register with my email and phone, so that I can begin using Xspeeria.                | P0       | Registration succeeds only with valid, verifiable email/phone; duplicate accounts blocked. |
| As a user, I want to complete KYC verification, so that I can access the marketplace.                         | P0       | KYC flow captures document + liveness; status reflected in-app within defined SLA.         |
| As a business owner, I want to complete enhanced KYC, so that I can transact at business-appropriate volumes. | P0       | EDD flow captures business registration documents and UBO information (per COM).           |

## 9.2 Marketplace & Matching

| Story                                                                                                                  | Priority | Acceptance Criteria                                                                              |
|------------------------------------------------------------------------------------------------------------------------|----------|--------------------------------------------------------------------------------------------------|
| As a verified user, I want to create an FX request, so that I can find a counterparty to convert my currency.          | P0       | Request appears in matching pool immediately; visible in my active listings.                     |
| As a verified user, I want to create an offer, so that I can supply currency to the marketplace.                       | P0       | Offer appears in matching pool immediately; partial matching supported.                          |
| As a user, I want to be automatically matched with a compatible counterparty, so that I don’t have to manually search. | P0       | Match proposed within acceptable latency; both parties notified.                                 |
| As a user, I want to confirm or decline a proposed match, so that I retain control over my transaction.                | P0       | Declining releases both sides back to the active pool; confirming proceeds to `Confirmed` state. |

## 9.3 Transactions & Settlement

| Story                                                                                                            | Priority | Acceptance Criteria                                                                 |
|------------------------------------------------------------------------------------------------------------------|----------|-------------------------------------------------------------------------------------|
| As a user, I want to see real-time status of my transaction, so that I know what to expect and when.             | P0       | Status updates reflect current state machine position without manual refresh delay. |
| As a user, I want to confirm that I’ve sent funds, so that settlement can proceed.                               | P0       | Confirmation triggers partner verification step, not immediate settlement.          |
| As a user, I want to receive notification when settlement completes, so that I know the transaction is finished. | P0       | Notification sent within defined SLA of `Completed` state.                          |

## 9.4 Disputes

| Story                                                                                     | Priority | Acceptance Criteria                                                                           |
|-------------------------------------------------------------------------------------------|----------|-----------------------------------------------------------------------------------------------|
| As a user, I want to open a dispute if a transaction goes wrong, so that I have recourse. | P0       | Dispute creation available within defined window post-transaction; evidence upload supported. |
| As a user, I want to track my dispute status, so that I know it’s being handled.          | P1       | Status visible in-app; resolution rationale communicated.                                     |

## 9.5 Admin

| Story                                                                                                                    | Priority | Acceptance Criteria                                                          |
|--------------------------------------------------------------------------------------------------------------------------|----------|------------------------------------------------------------------------------|
| As a compliance officer, I want to review flagged KYC submissions, so that I can approve or reject them with confidence. | P0       | Manual review queue surfaces all relevant screening and document data.       |
| As an ops admin, I want to see stuck or failed transactions, so that I can intervene.                                    | P0       | Dashboard surfaces settlements in `RECOVERY_REQUIRED`, any settlement with an open blocking `SettlementHold`, and any open `ReconciliationException` (ADR-001 / DEC-003). |

# 10. BUSINESS PROCESS FLOWS

## 10.1 User Onboarding

    flowchart TD
        Start([User downloads app]) --> Register["Register: email, phone, password"]
        Register --> Verify["Verify email/phone (OTP)"]
        Verify --> MFA["Set up MFA"]
        MFA --> KYCStart["Begin KYC: upload ID + liveness"]
        KYCStart --> Screen["Automated verification + sanctions screening"]
        Screen --> Decision{"Result"}
        Decision -- Clear --> Approved["KYC Approved"]
        Decision -- Flagged --> Manual["Manual Review by Compliance"]
        Manual --> ManualDecision{"Decision"}
        ManualDecision -- Approve --> Approved
        ManualDecision -- Reject --> Rejected["KYC Rejected — user notified with reason"]
        Approved --> Access["Full marketplace access granted"]

## 10.2 KYC Approval

    flowchart TD
        Submit["User submits ID + liveness"] --> Auto["Automated document + biometric check"]
        Auto --> Sanctions["Sanctions/PEP screening"]
        Sanctions --> Risk["Risk rating assigned (low/medium/high)"]
        Risk --> Gate{"Auto-approvable?"}
        Gate -- Yes, low risk, clean --> Approve["Status: Approved"]
        Gate -- No: hit, high risk, or low confidence --> Queue["Queued for manual review"]
        Queue --> Officer["Compliance officer reviews case"]
        Officer --> FinalDecision{"Officer decision"}
        FinalDecision -- Approve --> Approve
        FinalDecision -- Reject --> Reject["Status: Rejected"]
        FinalDecision -- Request more info --> MoreInfo["User asked for additional documentation"]
        MoreInfo --> Submit

## 10.3 Offer Creation

    flowchart TD
        A["Verified user opens 'Create Offer'"] --> B["Enter amount, currency pair, rate"]
        B --> C["System validates KYC status and limits"]
        C --> D{"Valid?"}
        D -- Yes --> E["Offer published to marketplace"]
        D -- No --> F["Error shown: reason (e.g., limit exceeded, KYC insufficient)"]
        E --> G["Offer enters matching candidate pool"]

## 10.4 Matching

    flowchart TD
        New["New offer or request created"] --> Search["System searches compatible counter-side candidates"]
        Search --> Found{"Compatible match found?"}
        Found -- No --> Wait["Remains active in marketplace, awaiting future match"]
        Found -- Yes --> Propose["Match proposed to both parties"]
        Propose --> BothConfirm{"Both parties confirm?"}
        BothConfirm -- Yes --> Proceed["Transaction created — proceeds to funding stage"]
        BothConfirm -- No / Timeout --> Release["Match cancelled — both sides return to active pool"]

## 10.5 Settlement

    flowchart TD
        Funded["Sender confirms funds sent"] --> Verify["Partner verifies incoming funds"]
        Verify --> Confirmed{"Verified?"}
        Confirmed -- Yes --> Trigger["Settlement instruction triggered to banking partners"]
        Confirmed -- No --> Escalate["Escalated for manual review"]
        Trigger --> Payout["Payout processed on both sides of corridor"]
        Payout --> Complete["Transaction marked Completed — both parties notified"]

## 10.6 Dispute Resolution

    flowchart TD
        Open["User opens dispute"] --> Intake["Case intake — dispute logged"]
        Intake --> Evidence["Both parties invited to submit evidence"]
        Evidence --> Review["Ops/Compliance reviews case and evidence"]
        Review --> Mediate{"Resolution reached?"}
        Mediate -- Yes, favor complainant --> Remedy["Remedy applied per policy (e.g., refund escalation)"]
        Mediate -- Yes, favor respondent --> Uphold["Original transaction outcome upheld"]
        Mediate -- No, insufficient evidence --> Escalate["Escalated to senior case review"]
        Remedy --> Close["Case closed — both parties notified"]
        Uphold --> Close
        Escalate --> Review

# 11. PRICING & REVENUE MODEL

## 11.1 Revenue Mechanism

Xspeeria generates revenue through a transparent, disclosed transaction fee applied at the point of a completed transaction, rather than through an undisclosed spread embedded in the exchange rate. This is a deliberate trust-building decision consistent with the platform’s premium, transparency-first positioning (Section 2.4).

**\[ASSUMPTION-BRS-04\] Per the 5-Year Business Plan (Section 5), Xspeeria's fee is a flat coordination fee — a fixed multiple (illustratively 7.5x) of the prevailing local instant-transfer cost on each side of the corridor, not a percentage of the transaction amount. Specific multiples, minimum floor fees, and any volume-based discount structure are commercial/pricing decisions to be finalized by the business team and are not asserted as fixed figures in this document. The mechanism (a disclosed, flat, transaction-linked fee) is the requirement; the exact multiple and floor are configurable business parameters.**

## 11.2 Illustrative Fee Structure (Flat Coordination Fee, Not a Final Rate — see 5-Year Business Plan Section 5)

| Fee Component                                                           | Applied To                                                               | Notes                                                                |
|-------------------------------------------------------------------------|--------------------------------------------------------------------------|----------------------------------------------------------------------|
| Transaction fee                                                         | Both parties or fee-payer designated at listing time (business decision) | Disclosed to both parties prior to match confirmation                |
| No fee on cancelled/unmatched listings                                  | N/A                                                                      | Ensures users aren’t penalized for unmatched liquidity               |
| No fee on disputes resolved in complainant’s favor with a refund remedy | N/A                                                                      | Fee is only earned on genuinely completed, undisputed value transfer |

## 11.3 Revenue Model Considerations

- Revenue scales with transaction volume and frequency, favoring the recurring-use personas (Diaspora Remitter, Freelancer) as primary volume drivers, with SME/Importer/Exporter personas contributing higher average transaction value.
- Because Xspeeria does not profit from a hidden spread, the rate offered to users should track close to true market rate, reinforcing the trust-first positioning.

# 12. SUCCESS METRICS

| Metric                      | Definition                                                                     | Relevance                                                |
|-----------------------------|--------------------------------------------------------------------------------|----------------------------------------------------------|
| Verified User Growth        | Number of users completing KYC approval per period                             | Indicates funnel health and trust in onboarding          |
| Match Rate                  | % of active offers/requests successfully matched within a defined window       | Core marketplace liquidity health indicator              |
| Transaction Completion Rate | % of confirmed matches that reach `Completed` state without dispute or failure | Reliability of the core product experience               |
| Average Time to Settlement  | Time from both legs `FUNDED` to settlement phase `COMPLETED`                   | Operational efficiency and partner reliability           |
| Dispute Rate                | % of completed transactions resulting in a dispute                             | Trust and quality signal                                 |
| Repeat Usage Rate           | % of users transacting more than once in a defined period                      | Indicates product-market fit for recurring-need personas |

# 13. KPIs

| KPI Category | KPI                                         | Illustrative Target Framing                                   |
|--------------|---------------------------------------------|---------------------------------------------------------------|
| Growth       | Monthly verified user additions             | Defined per go-to-market plan, not asserted here              |
| Liquidity    | Ratio of matched to unmatched active volume | Target: sustained upward trend post-launch                    |
| Reliability  | Transaction completion rate                 | Target: high-90s percentage range, refined post-launch data   |
| Trust        | Dispute rate as % of completed transactions | Target: low single-digit percentage, refined post-launch data |
| Compliance   | KYC manual review turnaround time           | Target: within SLA defined in COM                             |
| Financial    | Revenue per completed transaction           | Tracked against fee model in Section 11                       |

**\[ASSUMPTION-BRS-05\]** Numeric KPI targets above are described qualitatively (directional ranges) rather than as committed figures, since committing specific numeric targets without operating data would misrepresent certainty this document does not have.

# 14. RISK REGISTER

| Risk                                                | Category            | Likelihood | Impact    | Mitigation                                                                                                             |
|-----------------------------------------------------|---------------------|------------|-----------|------------------------------------------------------------------------------------------------------------------------|
| Banking/payment partner integration delays          | Operational         | Medium     | High      | Early partner engagement; phased rollout; TDS Section 8.6 async settlement design tolerates partner latency            |
| Insufficient two-sided liquidity at launch          | Business            | High       | High      | Seed liquidity strategy (e.g., market-maker arrangements) — business decision, flagged for GTM planning                |
| Regulatory classification risk (money transmission) | Compliance          | Medium     | High      | Structured as a technology/matching layer over licensed partners (ADR-003 in TDS); legal review required before launch |
| Fraud via fake or manipulated KYC documents         | Compliance/Security | Medium     | High      | Automated + manual review, sanctions screening, liveness checks (Section 8.2)                                          |
| Currency volatility between match and settlement    | Financial           | Medium     | Medium    | Rate locked at match confirmation; funding timeout window minimizes exposure                                           |
| Dispute volume overwhelming manual review capacity  | Operational         | Low-Medium | Medium    | SLA-driven case management, escalation matrix (see COM)                                                                |
| Data breach involving KYC documents                 | Security            | Low        | Very High | Encryption at rest, signed URL access, least-privilege IAM (TDS Section 11.3, 11.6)                                    |
| Partner-side settlement failure                     | Operational         | Medium     | High      | Failure before any payout unwinds cleanly with escrows returned. Asymmetric failure enters `RECOVERY_REQUIRED` — non-terminal, exposure quantified, Ops/Compliance escalation built into the settlement state machine (TDS Section 10, ADR-001) |

# 15. MVP DEFINITION

## 15.1 MVP Success Criteria

The MVP is considered successful when Xspeeria can demonstrably:

1.  Onboard and KYC-verify users (individual and business) reliably and within acceptable turnaround time.
2.  Support creation of FX requests and offers in the NGN⇄GBP corridor (pilot), with NGN⇄USD support required from Year 2 per the 5-Year Business Plan.
3.  Automatically match compatible offers/requests (exact and partial).
4.  Take a matched transaction through the full state machine to `Completed` via real banking partner settlement.
5.  Handle disputes through a structured, auditable process.
6.  Maintain full audit traceability of every financial state change.

## 15.2 MVP Feature Checklist

| Feature                                       | Included in MVP   |
|-----------------------------------------------|-------------------|
| NGN⇄GBP corridor (pilot); NGN⇄USD from Year 2 | Yes               |
| Tiered KYC (individual + business/EDD)        | Yes               |
| Offer/Request marketplace                     | Yes               |
| Exact + partial matching                      | Yes               |
| Multi-offer aggregated matching               | No (Phase 2)      |
| Wallet-less escrow-state transactions         | Yes               |
| Real banking partner settlement integration   | Yes               |
| Disputes                                      | Yes               |
| Admin/back-office                             | Yes               |
| Web client                                    | No (mobile-first) |
| Additional corridors                          | No                |

# 16. PRODUCT ROADMAP

## 16.1 Roadmap Overview

    flowchart LR
        Phase0["Phase 0\nFoundation:\nCompliance, banking\npartnerships, core build"] --> Phase1["Phase 1\nMVP Launch:\nNGN⇄GBP corridor (pilot),\nlimited liquidity"]
        Phase1 --> Phase2["Phase 2\nScale Corridor:\nLiquidity growth,\nmulti-offer matching"]
        Phase2 --> Phase3["Phase 3\nExpand:\nAdditional corridors,\nweb client"]
        Phase3 --> Phase4["Phase 4\nDeepen:\nRecurring FX requests,\nrelationship pricing"]

## 16.2 Phase Definitions

| Phase                    | Focus                                                                               | Exit Criteria (Illustrative)                                                         |
|--------------------------|-------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------|
| Phase 0 — Foundation     | Secure banking/payment partnerships, finalize compliance program, build MVP per TDS | Partner integrations tested in sandbox; compliance program reviewed by legal counsel |
| Phase 1 — MVP Launch     | Launch NGN⇄GBP (pilot) to an initial user cohort                                    | Sustained successful transaction completion rate; initial liquidity established      |
| Phase 2 — Scale Corridor | Grow liquidity, introduce multi-offer matching                                      | Match rate and repeat usage trending toward target ranges (Section 13)               |
| Phase 3 — Expand         | Add additional corridors, consider web client                                       | Successful replication of Phase 1 launch playbook to a second corridor               |
| Phase 4 — Deepen         | Recurring FX requests, relationship/loyalty pricing for high-frequency users        | Retention and frequency metrics support investment in deeper personalization         |

**\[ASSUMPTION-BRS-06\]** Phase exit criteria are described qualitatively; specific numeric thresholds should be set by leadership once Phase 1 operating data is available.

## Document End Notes

This Business Requirements Specification is the business source of truth and should be read alongside the Technical Design Specification (which defines how these requirements are implemented) and the Compliance & Operations Manual (which defines the regulatory, risk, and operational procedures required to run the business safely). Any change to Product Scope (Section 7) or MVP Definition (Section 15) should be reviewed jointly by Product, Engineering, and Compliance leadership.
