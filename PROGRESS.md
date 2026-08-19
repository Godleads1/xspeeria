# XSPEERIA DEVELOPMENT PROGRESS

## Current Phase

PHASE 0 — DOCUMENTATION & ARCHITECTURE READINESS

## Current Status

Engineering environment hardening and readiness verification.

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
- [ ] Decision 2 — security baseline authority
- [ ] Decision 3 — corridor substrate (NGN⇄GBP pilot)
- [ ] Decision 4 — regulatory posture confirmation
- [ ] Architecture approved
- [ ] Implementation started

## Current Blockers

Phase 0 audit verdict is **NO-GO for implementation** pending Decisions 2–5. Decision 1 is resolved and reconciled.

Governance-deferred parameters awaiting external owners: U-1, U-2, U-5, U-8, U-9, U-10 (ADR-001 §11) and P-1 … P-11 (ADR-002 §9.2). None has been defaulted or assumed.

## Next Action

1. Take Decision 2 (security baseline authority) — gates the admin-authorized phase transitions in ADR-001 §5.1 and the database-role model in ADR-002 §8.
2. Open Decisions 3 and 4 with Legal/Compliance in parallel — longest lead time, gates launch phases.
3. Open P-1 … P-11 with Finance and Accounting — P-2 blocks Phase 3, and none may be assumed by implementation.
4. Re-audit after all decisions are approved and reconciled.

Do not begin implementation until Decisions 2, 3 and 4 are resolved.

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