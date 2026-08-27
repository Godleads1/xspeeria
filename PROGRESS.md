# XSPEERIA DEVELOPMENT PROGRESS

## Current Phase

**PHASE 1 — CONTROLLED IMPLEMENTATION GO** — human decision, 2026-08-22.

Supersedes *PHASE 0 — DOCUMENTATION & ARCHITECTURE READINESS* and its blanket
implementation prohibition.

| | |
|---|---|
| **Controlled implementation** | **GRANTED** — within explicitly approved milestones only |
| **Full implementation GO** | **NOT GRANTED** |
| **Production activation** | **NOT GRANTED** |

## Current Status

Milestone 1 — Foundation, design system and app shell.

Application implementation may begin **only** inside an approved milestone. No domain
persistence, no partner integration and no live financial behaviour is authorized.

## Approved Architecture Decisions

### Backend

Python + FastAPI

### Primary backend engineering authority

`docs/03-architecture/Xspeeria_Master_Prompt_Python_Backend.md`

## Completed

- [x] Repository documentation structure created
- [x] Claude engineering system created
- [x] 10 domain skills installed
- [x] 6 command skills installed
- [x] 5 specialist agents installed
- [x] Security/QA hooks installed
- [x] Engineering workflows installed
- [x] Security Master Audit added
- [x] Python/FastAPI selected as authoritative backend
- [x] CLAUDE.md restored and populated
- [x] AGENTS.md restored
- [x] DOCUMENT_INDEX.md created
- [x] xspeeria-test skill repaired
- [x] xspeeria-security skill hardened
- [x] xspeeria-security-check skill hardened
- [x] .gitignore populated
- [x] .env.example populated
- [x] initial repository secret scan completed with no confirmed secrets
- [x] Phase 0 audit completed (`AUDIT_PHASE0_2026-08-18.md`)
- [x] Decision 1 approved — canonical transaction/settlement state machine (ADR-001 / DEC-003)
- [x] Decision 1 document reconciliation completed
- [x] Decision 5 approved — financial event and accounting-ledger architecture (ADR-002 / DEC-004)
- [x] Decision 5 document reconciliation completed
- [x] Documentation-integrity corrections — dangling `SECURITY.md` references repointed, primary canvas set to
      `#FFFFFF`, TDS KYC vocabulary corrected (`CORRECTIONS_v3.md` §7). Closes no decision.
- [x] Application UI palette reconciled to the Figma-observed colours (`CORRECTIONS_v3.md` §8). **Partial —
      documentation only.** Values are FIGMA-OBSERVED / CANDIDATE, **not frozen production tokens**; the Figma
      has painted swatches, not bound variables, so Xspeeria has no production design-token system.
- [x] Design-system freeze Phase 1 — human decisions converted to normative documentation
      (`CORRECTIONS_v3.md` §9): application colour direction, semantic token architecture, border
      roles, primary interaction states, gold restriction, Home account-readiness structure, bottom
      navigation, mobile/admin consistency. **Documentation only — IMPLEMENTATION STATUS: NOT
      IMPLEMENTED, VERIFICATION STATUS: NOT VERIFIED.**
- [x] Typography partial freeze — **Inter HUMAN APPROVED as the financial/numeric typeface**
      (`CORRECTIONS_v3.md` §10). Documentation only; no font files added.
- [x] Canonical domain model reconciliation — documentation only (`CORRECTIONS_v3.md` §11,
      ADR-001 Amendment A1). Glossary at `DOCUMENT_INDEX.md` §2A. **No code, no migration, no new
      ADR/DEC number.**
      *HISTORICAL: this entry predates the Phase 1 controlled-implementation GO of 2026-08-22.
      The blanket implementation prohibition it originally referenced is **SUPERSEDED** — see
      **Current Phase** above and **Milestone 1 boundary — approved scope** below, which now
      carry the standing constraints.*
- [ ] Design-system freeze Phase 2 — **NOT COMPLETE.** Open: **Satoshi** brand/UI typography, blocked
      on primary licence verification, mobile-app embedding, redistribution/bundling rights, the
      licence covering the Figma-used files, web self-hosting vs CDN, specimen review and React Native
      delivery strategy; admin headings/chrome; gold rating-glyph execution; logo/brand-asset colours
      pending vector confirmation; production token freeze. See `DESIGN_SYSTEM.md`, `CORRECTIONS_v3.md`
      §9.6 and §10.
- [ ] Versioning decision for `docs/references/figma/Xspeeria.fig` (~70.1 MB) — human-provided design source,
      untracked pending decision. Not staged, gitignored or LFS-tracked.
- [ ] Decision 2 — security baseline authority
- [ ] Decision 3 — corridor substrate (NGN⇄GBP pilot)
- [ ] Decision 4 — regulatory posture confirmation
- [x] Architecture approved for controlled implementation — Phase 1 GO, 2026-08-22
- [x] Implementation started — Milestone 1: foundation, design system, app shell
- [x] **Milestone 1 / Phase 1 engineering foundation COMPLETE** — PR #5 squash-merged to `main`
      as `a3eb4c0`, 2026-08-25
- [x] **DECISION S4-1 — authoritative money persistence, HUMAN-APPROVED 2026-08-25.** Every
      persisted authoritative transactional monetary amount is exact integer minor units:
      `amount_minor BIGINT` + `currency CHAR(3)` + `scale SMALLINT` + `currency_def_version
      VARCHAR(32)`, immutably bound. `NUMERIC(18,2)`, `NUMERIC(20,4)` and decimal-based money are
      **withdrawn** as authoritative semantics; `NUMERIC`/`DECIMAL` survives only as an explicitly
      derived, non-authoritative presentation value with justified need. **Rates are not monetary
      amounts** and remain `NUMERIC(12,6)`. `Money(minor, currency, scale)` is unchanged;
      `currency_def_version` is carried alongside it in persistence, not added to the value object.
      Reconciled in ADR-002, TDS §6.2/§6.4 and API dict §5.
- [x] **DECISION S4-2 — Match `server_order_key`, HUMAN-APPROVED 2026-08-25.** `server_order_key
      BIGINT NOT NULL UNIQUE` — server-generated, immutable, durable, orderable, never
      client-supplied. A PostgreSQL sequence/identity is acceptable and **the value need not be
      gapless**. Canonical acceptance ordering remains `accepted_at ASC, server_order_key ASC`;
      `accepted_at` is **not** replaced as the primary criterion. Added to the API dict Match
      schema and the TDS index strategy.
- [x] **DECISION S4-3 — Stage 4 persistence/CI engineering baseline, HUMAN-APPROVED 2026-08-25.**
      PostgreSQL 16, SQLAlchemy 2.x async, asyncpg, Alembic. **SQLite must not be used** as the
      authoritative integration/concurrency database for the money path — `SELECT … FOR UPDATE`,
      uniqueness races, transactional idempotency, constraints and concurrent acceptance are tested
      on PostgreSQL only. *This approval covers engineering baseline and CI only; it resolves no
      regulatory, hosting, cloud-provider or production-deployment decision.*
- [x] **DECISION S4-4 — KYC persistence authority, HUMAN-APPROVED 2026-08-25.** Canonical KYC case
      persistence/API authority is `KYCCases` / `KycCase`. `kyc_profiles` is **summary/projection
      only** and is never a second authoritative KYC workflow. Lifecycle remains
      `pending_documents → under_review → approved | rejected`; jurisdiction-specific document
      requirements stay configuration/legal-authority driven and are not invented.
- [x] **DECISION H-2 — CI integration/concurrency environment, HUMAN-APPROVED 2026-08-25.**
      PostgreSQL 16 runs as a **GitHub Actions service container**, and that is the primary
      integration/concurrency test environment. **Testcontainers is not required on the primary CI
      path.**
- [x] **DECISION H-3 — no Redis in Milestone 4.1, HUMAN-APPROVED 2026-08-25.** PostgreSQL remains
      the single consistency authority for **Offer row locking, transactional acceptance,
      idempotency uniqueness and concurrency control**. **Redis locks and Redis-held idempotency
      state must not be introduced into the money path.**
- [x] **DECISION H-5 — Alembic migration location, HUMAN-APPROVED 2026-08-25.** Migrations live at
      the repository root in **`migrations/`**, matching
      `Xspeeria_Master_Prompt_Python_Backend.md` §191. **`backend/migrations/` must not be used.**
- [ ] **Idempotency retention/TTL — NOT DECIDED.** No expiry duration is approved. Milestone 4.1
      persists `created_at` only, with **no `expires_at` and no automatic expiry semantics**. If
      retention becomes necessary it is a separate human decision plus a future migration.

## Current Blockers

**Decisions 2, 3 and 4 remain OPEN.** They continue to block the specific areas they
govern — security parameters, corridor and rate configuration, and regulatory posture —
and they continue to block **production activation**. They **no longer block** the
approved Milestone 1 foundation work.

| Decision | Still blocks | Does not block |
|---|---|---|
| **2 — security baseline** | Every numeric security parameter: MFA qualification, timeouts, lockout, password policy, session expiry, rate limits, recovery. RLS-vs-application authorization (S-2), tenant model (S-3) | Deny-by-default structure, config handling, validation framework, logging foundations, trusted timestamps |
| **3 — corridor substrate** | Production corridors, currencies, reference-rate provider, cadence, staleness policy | Configuration interfaces and fixtures that name no production value |
| **4 — regulatory posture** | Production KYC/vendor behaviour, jurisdiction legal requirements | Generic KYC UI shells and jurisdiction-configured abstractions |

Decisions 1 and 5 are resolved and reconciled (DEC-003, DEC-004).

Governance-deferred parameters awaiting external owners: U-1, U-2, U-5, U-8, U-9, U-10
(ADR-001 §11, plus the preparation-window duration added by Amendment A1) and P-1 … P-11
(ADR-002 §9.2). None has been defaulted or assumed.

**Production financial-semantics blocker:** the `PayoutExecution` child-to-leg aggregate
derivation remains **OPEN** (ADR-001 §14.7). No implementation may derive leg state or a
phase transition from child payout records.

## Next Action

1. Complete and review **Milestone 1** — foundation, design system and app shell.
2. Take Decision 2 (security baseline authority) — gates the admin-authorized phase
   transitions in ADR-001 §5.1 and the database-role model in ADR-002 §8. **S-3**
   (tenant/organization model) is worth resolving first: retrofitting tenant scoping
   after tables exist is expensive.
3. Open Decisions 3 and 4 with Legal/Compliance in parallel — longest lead time.
4. Open P-1 … P-11 with Finance and Accounting — none may be assumed by implementation.
5. Resolve the `PayoutExecution` aggregate semantics before any settlement work.

**Superseded instruction:** *"Do not begin implementation until Decisions 2, 3 and 4 are
resolved."* Replaced by the human decision of 2026-08-22 recorded above. Implementation
is permitted **only** within approved milestones; the open decisions still gate their own
areas and gate production activation.

## Milestone 1 boundary — approved scope

**Permitted:** backend application scaffolding, configuration, structured logging, error
envelope, money primitives, health endpoint, test harness; Expo/React Native shell with
the approved navigation and Home structure; Next.js admin shell; the shared semantic
token package; quality tooling and CI.

**Prohibited:** any domain persistence or migration (Offer, Match, Transaction,
Settlement, SettlementLeg, Beneficiary, KYC, MFA factor, PayoutExecution); production
partner calls; payment execution; live settlement instructions; real KYC vendor calls;
production corridor configuration; production reference-rate integration; production
ledger posting logic; Satoshi font files.

## Decision Log

### DEC-001 — Backend Architecture

**Decision:** Python + FastAPI

**Status:** APPROVED

**Impact:** Conflicting Node/TypeScript backend implementation choices are not authoritative. Frontend TypeScript remains permitted where documented.

### DEC-002 — Security Posture

**Decision:** Security is deny-by-default, least-privilege, server-authorized, evidence-verified.

**Status:** APPROVED

### DEC-003 — Canonical Transaction/Settlement State Machine

**Decision:** Adopt the hardened four-concern model recorded in `docs/adr/001-transaction-state-machine.md`.

- `SettlementLeg` (9 states) is authoritative for per-leg financial facts.
- `Settlement.phase` (10 phases, forward-only) holds workflow decisions only and contains no monetary vocabulary.
- Financial facts, workflow state, compliance holds, disputes, reconciliation exceptions and immutable events are separate concerns.
- `PAID_OUT` is irreversible. `COMPLETED` requires both legs `PAID_OUT`.
- No settlement may enter a terminal phase while customer funds remain unresolved.
- `RECOVERY_REQUIRED` is mandatory for asymmetric exposure and must remain operationally visible.
- Release authorization uses a transactional outbox; idempotency keys include `leg_id`.
- Reconciliation never rewrites financial state.
- Rematching must not reuse funds from the previous settlement.
- `CLOSED_WITH_LOSS` does not assign the loss to Xspeeria.

**Status:** APPROVED — 2026-08-18

**Supersedes:** the five conflicting state models recorded as contradiction C-1 in `AUDIT_PHASE0_2026-08-18.md`.

**Impact:** Reconciled across `Appendix_D`, `05_API_Contract_Data_Dictionary.md`, `Xspeeria_Master_Prompt_Python_Backend.md`, `02_Technical_Design_Specification.md`, `07_Banking_Integration_Specification_v1.1.md`, `DOCUMENT_INDEX.md`, `CORRECTIONS_v3.md`, plus consequential UI/UX and compliance references.

**Governance-deferred:** U-1, U-2, U-5, U-8, U-9, U-10 — see ADR-001 §11. These must be implemented as configurable policy values and must not be assumed.

### DEC-004 — Financial Event and Accounting-Ledger Architecture

**Decision:** Adopt the hardened model recorded in `docs/adr/002-financial-event-ledger-architecture.md`.

- `settlement_events` is the append-only **root of accepted internal truth**; `webhook_receipts` is append-only **evidence with no financial authority**; `pending_events` quarantines valid evidence awaiting a prerequisite.
- A partner message is accepted only after authentication, replay/idempotency check, schema validation, settlement/leg correlation, transition validation and financial invariant validation.
- Valid but premature or out-of-order evidence is quarantined and re-evaluated, **never silently discarded**. Contradictory evidence is retained but never promoted.
- A **separate append-only double-entry accounting ledger** records **Xspeeria's own economic activity only**. It is not a customer wallet ledger. Customer principal movements (`FUNDED`, `PAID_OUT`, `RETURNED`) never create real-book entries for the principal.
- No customer wallet, balance or cash-ledger table may exist. Any memorandum escrow book is optional (**P-7 TBD**), aggregate by partner/currency, never per customer.
- Append-only; corrections by compensating entry only; historical records never rewritten.
- Exact integer minor units with versioned, configurable currency definitions. No binary floating point in authoritative monetary state. Entries balance per currency.
- Posting identity `UNIQUE(source_event_id, posting_rule_id)`; `posting_rule_version` recorded but not in the key, so a version change can never silently repost history.
- Two-stage processing: fast ingress receipt and ack with no financial state, then one local atomic transaction writing events, projections, ledger entries and lines, audit and outbox rows. **No network call inside that transaction.**
- Tamper evidence by DB role restrictions, per-entry content hashes and periodic signed checkpoints — **not** a globally serialized hash chain.
- The chart of accounts is configuration, not code.

**Status:** APPROVED — 2026-08-18

**Supersedes:** contradiction C-4 in `AUDIT_PHASE0_2026-08-18.md`.

**Impact:** Reconciled across `Appendix_D`, `05_API_Contract_Data_Dictionary.md`, `Xspeeria_Master_Prompt_Python_Backend.md`, `02_Technical_Design_Specification.md`, `07_Banking_Integration_Specification_v1.1.md`, `DOCUMENT_INDEX.md`, `CORRECTIONS_v3.md`, plus compliance and infrastructure references.

**Governance-deferred:** P-1 … P-11 — see ADR-002 §9.2. **NOT APPROVED and must not be invented** through examples, sample schemas, comments, tests, seed data or implementation defaults.

**ADR-001 status:** UNCHANGED. No amendment required.

**Evidence state:** DOCUMENTED. No implementation exists.