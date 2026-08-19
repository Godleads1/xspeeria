# ADR-002 — Financial Event and Accounting-Ledger Architecture

| Attribute | Value |
|---|---|
| **Status** | **APPROVED** |
| **Date** | 2026-08-18 |
| **Decision ID** | DEC-004 |
| **Supersedes** | The three-way ledger-model divergence recorded as contradiction C-4 in `AUDIT_PHASE0_2026-08-18.md` |
| **Depends on** | ADR-001 (DEC-003) — **unchanged, no amendment required** |
| **Authority** | Human-approved architecture decision — `DOCUMENT_INDEX.md` §1 rank 2 |
| **Evidence state** | `DOCUMENTED`. No implementation exists. Nothing here is `IMPLEMENTED` or `VERIFIED`. |

---

## 1. Context

`AUDIT_PHASE0_2026-08-18.md` §13 C-4 recorded the ledger model stated three ways: event-sourced and balance-prohibited (`Appendix_D` §7/§14, TDS), entity tables with mutable status columns and no stated projection relationship (API contract), and *"append-only wherever practical"* with the event entity missing from the entity list (Python backend spec). The document-level divergence was closed during ADR-001 reconciliation.

The substantive question the audit did not reach, and which this ADR decides, is different and larger:

> Is an immutable domain-event journal the same thing as a financial ledger, and does a non-custodial platform need double-entry accounting at all?

### 1.1 Why the question is forced

`Appendix_D` §7 and §14 prohibit *"wallet balance tables and internal customer cash ledgers"* and *"customer balance tables."* Read narrowly this reads as prohibiting a ledger outright. Read carefully it prohibits something specific — **customer cash balances**. It says nothing about Xspeeria's own books.

ADR-001, approved, creates financial positions that are unambiguously Xspeeria's own and are not customer balances: recognized losses (`CLOSED_WITH_LOSS`), quantified exposures carried over time (`RECOVERY_REQUIRED` with `outstanding_exposure_amount`), recoveries (`CLOSED_RECOVERED`), fee receivables, and reconciliation differences (`ReconciliationException` with `expected_amount` / `observed_amount`).

None of these had a home. `settlement_events` records that they happened; nothing recorded what they meant financially, accumulated them, or proved the books balanced.

### 1.2 Rejected alternatives

| Option | Rejected because |
|---|---|
| Events only, no ledger | No provable position; every report a bespoke query; a recognized-then-recovered exposure is unrepresentable |
| Events extended with debit/credit — the journal *is* the ledger | Couples workflow schema to accounting policy on an append-only table; an accounting change would force a migration that cannot be performed |
| Full custodial ledger with customer cash accounts | Asserts custody Xspeeria does not have; violates `Appendix_D` §2, §7, §14; weakens the regulatory posture in `07_Banking_Integration_Specification_v1.1.md` Appendix A |
| Defer to a later phase | `Appendix_D` §11 requires daily reconciliation from day one; retrofit requires back-posting history that can no longer be independently verified |

An intermediate proposal keyed ledger postings on `UNIQUE(source_event_id)`, used a global `prev_entry_hash` chain, and committed the event and posting in a single transaction spanning HTTP ingress. All three were rejected during review — see §4.3, §7 and §5.

---

## 2. Decision

Three layers, acyclic. Partner evidence is the root of truth about money movement; `settlement_events` is the root of accepted internal truth; state projections and the accounting ledger both descend from it and neither causes the other.

```
Partner evidence (external truth about money movement)
        │
        ▼
webhook_receipts        ← append-only EVIDENCE. No financial authority.
        │
        │  acceptance pipeline (§3)
        ▼
settlement_events       ← append-only ROOT OF ACCEPTED INTERNAL TRUTH
        │
   ┌────┴─────┐
   ▼          ▼
projections   accounting ledger
(Settlement,  (ledger_entries,
 SettlementLeg) ledger_lines)
```

### 2.1 Binding architecture decisions

1. `settlement_events` is the append-only root of Xspeeria's accepted internal financial and domain truth.
2. Raw partner messages are evidence, not automatically authoritative financial truth.
3. `webhook_receipts` is append-only evidence storage and carries no financial authority.
4. A partner message becomes an accepted `settlement_event` only after authentication, replay/idempotency checks, schema validation, settlement/leg correlation, transition validation and financial invariant validation.
5. Valid but premature/out-of-order evidence is quarantined and re-evaluated. It is never silently discarded.
6. Impossible or contradictory partner evidence is retained, never silently mutates financial state, and creates the appropriate reconciliation/security workflow.
7. `Settlement` and `SettlementLeg` projections derive from accepted `settlement_events`.
8. Xspeeria maintains a separate append-only double-entry accounting ledger for **Xspeeria's own economic activity**.
9. The accounting ledger is **not** a customer wallet ledger and does not represent Xspeeria ownership of customer principal held by regulated banking/payment partners.
10. Customer principal movements — `FUNDED`, `PAID_OUT`, `RETURNED` — **must never create real-book Xspeeria accounting entries for the principal itself**.
11. No customer wallet, customer balance, or customer cash-ledger table may be introduced.
12. Any future memorandum escrow/control book is **optional** and remains **P-7 TBD**. If adopted it must be aggregate by partner and currency, never per customer, and must not assert Xspeeria ownership.
13. Accounting entries and lines are append-only. Application roles may not `UPDATE` or `DELETE` historical entries.
14. Corrections use explicit compensating entries. Historical financial records are never rewritten.
15. Authoritative monetary values never use binary floating point.
16. Ledger postings use exact integer minor units with versioned, configurable currency definitions.
17. Every accounting entry balances **per currency**.
18. Posting rules are deterministic, versioned pure functions with no network I/O and no projection reads.
19. Posting identity is `UNIQUE(source_event_id, posting_rule_id)`. `posting_rule_version` is recorded for deterministic historical replay but is **not** part of the uniqueness key.
20. A policy or rule version change must never silently repost historical events. Historical accounting corrections require explicit compensating entries.
21. Two-stage hybrid processing — see §5.
22. For an accepted financial event, all applicable writes occur atomically in one local PostgreSQL transaction: `settlement_events`, `SettlementLeg` projection, `Settlement` projection, `ledger_entries`, `ledger_lines`, audit records, outbox rows.
23. No network call occurs inside that financial transaction.
24. External side effects are dispatched from the transactional outbox after commit, with deterministic idempotency.
25. `settlement_events` remains authoritative if a projection defect is discovered. Projection repair is deterministic from immutable accepted history and does not rewrite that history.
26. Tamper evidence does **not** use a global serialized hash chain.
27. Layered tamper evidence — see §7.
28. Exact checkpoint frequency and external anchoring mechanism remain **P-11 TBD**.
29. The chart of accounts is configuration, not hard-coded business logic.
30. The architecture supports double entry, balancing, append-only history, compensation, reconciliation, suspense, posting-rule versioning and deterministic replay **without deciding Finance policy**.

---

## 3. Event acceptance pipeline

> A raw webhook is evidence, not truth.

| Store | Authority | Contents |
|---|---|---|
| `webhook_receipts` | **None. Evidence only.** | Every message received — valid, invalid, forged, contradictory. Append-only. |
| `pending_events` | None. Quarantine. | Valid evidence awaiting a prerequisite |
| `settlement_events` | **Root of accepted internal truth** | Only accepted, validated, non-contradictory events |

### 3.1 Stages

| # | Stage | Failure behaviour |
|---|---|---|
| 1 | Receive | — |
| 2 | **Authenticate** — HMAC-SHA256 over raw bytes, constant-time compare, ±5 min replay window (`07_Banking_Integration_Specification_v1.1.md` §5.2, §5.3) | 401. Receipt **retained** with `verdict = SIGNATURE_INVALID`. Security alert. Never promoted. |
| 3 | **Replay / idempotency** — `(settlement_id, leg_id, event_type, provider_event_id)` | Known ID → 200, no reprocessing. Receipt retained, marked `DUPLICATE`. |
| 4 | **Persist receipt**, return 200 | Storage failure → 5xx; partner redelivers; idempotency makes redelivery safe |
| 5 | **Schema validation** — Pydantic strict, `extra="forbid"` | Retained, `SCHEMA_INVALID`, `ReconciliationException` raised. Not discarded. |
| 6 | **Correlate** to settlement and leg | Unresolvable `leg_id` → `RES_422_UNRESOLVABLE_LEG`, retained, exception raised, **never defaulted to a leg** |
| 7 | **Transition and invariant validation** against ADR-001 | Five outcomes — §3.2 |
| 8 | **Accept** → one atomic financial transaction (§5) | §5.2 |

### 3.2 Evidence classification — five classes, four retained

| Class | Behaviour | Becomes an accepted event? |
|---|---|---|
| **Duplicate** | Absorbed at stage 3. Ack 200. | No — already is one |
| **Replay suspected** | Rejected. Retained as security evidence. Alert. | **No** |
| **Valid, delayed** | Accepted normally. Carries partner timestamp and `accepted_at`. Lateness never reorders the ledger. | **Yes** |
| **Valid, prerequisite missing** | **Quarantined in `pending_events`.** Re-evaluated on every subsequent acceptance for that settlement. Promoted when the prerequisite arrives. Ages out to `ReconciliationException` + hold. | **Yes — deferred** |
| **Impossible / contradictory** | Retained as evidence. **Never promoted.** `ReconciliationException` + blocking hold + human adjudication. Resolution is a new authorized event, never an overwrite. | **No — pending human decision** |

ADR-001 §H item 6 states that an out-of-order event implying an invalid transition is "rejected." **Clarifying note, not an amendment:** *not applied* and *not retained* are distinct, and only the first is intended. Valid evidence is always retained.

---

## 4. Accounting ledger

### 4.1 Scope

The ledger records what Xspeeria owns, owes, earns and loses. It does not record what customers own. Customer funds remain with the licensed partner in each jurisdiction throughout, and Xspeeria's books never assert ownership of them.

### 4.2 What may and may not be asserted

**Architecture may assert what must NOT be posted.** That derives from non-custody, which is approved architecture (`Appendix_D` §2, §7, §14).

**Architecture may not assert what MUST be posted.** That derives from accounting policy, which is Finance's (§9).

| ADR-001 trigger | Accepted event | Real-book posting |
|---|---|---|
| Leg → `FUNDED` | `EscrowFunded` | **None. Architecturally prohibited** — customer principal entering partner escrow |
| Leg → `PAID_OUT` | `PayoutConfirmed` | **None for principal. Architecturally prohibited** |
| Leg → `RETURNED` | `EscrowReturned` | **None for principal. Architecturally prohibited** |
| `COMPLETED` | `SettlementCompleted` | Per Finance-approved posting rules. **No rule asserted. P-2.** |
| `CLOSED_UNWOUND` | `SettlementUnwound` | Per Finance-approved posting rules. **No rule asserted. P-2.** |
| `RECOVERY_REQUIRED` | `RecoveryRequired` | Per Finance-approved posting rules. **No rule asserted. P-3.** |
| `CLOSED_RECOVERED` | `RecoveryClosedWithoutLoss` | Per Finance-approved posting rules. **No rule asserted. P-3, P-5.** |
| `CLOSED_WITH_LOSS` | `RecoveryClosedWithLoss` | Per Finance-approved posting rules. **No rule asserted. P-4.** Loss **allocation** remains **U-8**. |

The engineering deliverable is the posting-rule engine and its identity, versioning, purity and replay guarantees — **not the rules themselves**.

### 4.3 Posting identity

| Candidate key | Guarantees | Fails |
|---|---|---|
| `(source_event_id)` | One entry per event | Cannot express legitimate multi-entry events |
| `(source_event_id, posting_rule_id, posting_rule_version)` | Exactly-once per rule per version | **A version bump silently permits reposting the same rule for the same event — double-counting with no visible correction** |
| **`(source_event_id, posting_rule_id)`** | **Exactly-once per applicable rule, permanently** | Policy corrections must be explicit compensating entries — the correct behaviour |

**Adopted: `UNIQUE(source_event_id, posting_rule_id)`.** `posting_rule_version` is recorded on every entry for replay determinism and audit, and is deliberately excluded from the key.

Rationale: a single accepted domain event may legitimately trigger multiple applicable posting rules. For example, once Finance-approved policy defines a fee-recognition trigger, that trigger may generate separate same-currency balanced postings for each applicable side and currency, alongside other accounting consequences of the same event. Forcing all applicable rules into one entry would either break per-currency balancing or fuse unrelated accounting concerns. Because the number of applicable rules per event is a function of policy, and policy is not determined, the identity cannot be `source_event_id` alone.

### 4.4 Money representation

| Concern | Position |
|---|---|
| Binary floating point | **Prohibited everywhere in authoritative monetary state** |
| Ledger amounts | **Integer minor units** — `BIGINT` amount + ISO-4217 currency + explicit `scale` |
| Non-ledger amounts | Exact `Decimal` / `NUMERIC(20,4)` per TDS §6.4 — quoted amounts, offers, requests |
| Currency attachment | Every amount carries its currency. No bare numeric money values anywhere. |
| **Currency definitions** | **Versioned and configurable**, never scattered constants. Minor-unit rules can change; instruments may have non-standard precision. Every ledger line stores `currency_code`, `scale` and `currency_def_version` so historical entries remain interpretable after a definition change. |
| Rounding | `ROUND_HALF_EVEN` per TDS §6.4, applied at exactly one point — conversion to posting minor units. Residue posts to a suspense account, never discarded. |
| FX rate | Immutable rate snapshot per settlement, referenced by every posting. `Match.agreed_rate` is already *"Locked at match time / Immutable once set."* Representation precision is a sub-decision; FX **accounting treatment** is **P-9 TBD**. |

### 4.5 Idempotency

| Operation | Key |
|---|---|
| Webhook receipt | `provider_event_id` |
| Accepted event | `(settlement_id, leg_id, event_type, provider_event_id)` |
| **Ledger posting** | **`(source_event_id, posting_rule_id)`** |
| Release command | `sha256(settlement_id \| leg_id \| "RELEASE" \| release_authorized_at)` |
| Return command | `sha256(settlement_id \| leg_id \| "RETURN" \| return_authorized_at)` |
| Compensating entry | `UNIQUE(reverses_entry_id, posting_rule_id)` |
| Quarantine promotion | `UNIQUE(pending_event_id)` |

The ledger inherits deduplication from the event journal rather than re-solving it. That is the primary structural argument for posting from accepted events rather than from partner callbacks directly.

---

## 5. Transaction model

### 5.1 Two stages

"The posting service reads events" constrains **what it may read**, not **when it runs**. Posting rules are pure functions of `(accepted_event, posting_rule_version, policy_config)` with no I/O and no projection reads, so they execute synchronously inside the financial transaction without violating acyclicity.

A single synchronous transaction spanning HTTP ingress was rejected: `07_Banking_Integration_Specification_v1.1.md` §5.4 requires the webhook endpoint to return within 2 seconds. An outbox placed *between* the event and the ledger was also rejected — it creates a window in which an accepted financial event exists with no corresponding posting.

```
HTTP ingress ──┐  Txn 1 (small): authenticate, deduplicate, persist receipt → 200
               │  No financial state.
               │
        [async boundary — nothing financial exists across it]
               │
Worker ────────┤  Validation + posting-rule evaluation.
               │  Pure. No DB writes. No network calls.
               │
               └─ Txn 2 (atomic, local, no network):
                    INSERT settlement_events
                    UPDATE settlement_legs.state
                    UPDATE settlements.phase
                    INSERT ledger_entries
                    INSERT ledger_lines
                    INSERT audit_logs
                    INSERT outbox            ← rows only
                  COMMIT
                    ↓
                  Post-commit: dispatch outbox
```

There is no dual-write window: the only artifact crossing the async boundary is a receipt with no financial authority.

### 5.2 Failure behaviour

| Scenario | Behaviour |
|---|---|
| Event inserted, posting fails | **Impossible** — same transaction, both roll back. Receipt unprocessed; worker retries; idempotent. |
| Posting succeeds, projection fails | **Impossible** — same transaction |
| Crash mid-transaction | Rollback. No partial financial state. Another worker resumes. |
| Crash after commit, before outbox dispatch | Financial state correct and durable. Outbox rows persist. Dispatcher resumes with deterministic keys. |
| Transaction rolls back | Nothing persisted except the receipt, which carries no authority |
| Retry | Idempotent at every layer; converges to identical state |
| Poisoned receipt | Bounded retries, then quarantine + `ReconciliationException` + alert. Never dropped, never auto-skipped. |

### 5.3 Projection staleness

All writes commit atomically, so staleness is impossible except by defect. If divergence is detected:

| Artifact | Authority | Recovery |
|---|---|---|
| `settlement_events` | **Root of accepted internal truth** | Never rebuilt |
| `Settlement.phase`, `SettlementLeg.state` | Projections | **Auto-rebuildable** deterministically from accepted history, without rewriting it |
| `ledger_entries` / `ledger_lines` | Accounting record | **Never silently rebuilt.** Divergence is a P1 incident requiring human investigation and sign-off |

The asymmetry is deliberate: a silent ledger rebuild is indistinguishable from tampering.

---

## 6. Reconciliation

Four-way, daily, per `Appendix_D` §11:

| Check | Detects |
|---|---|
| Partner report ↔ accepted events | Missing, extra, or amount-mismatched partner activity |
| Accepted events ↔ projections | Projection drift — a defect, not a money problem |
| Accepted events ↔ ledger | Missing or duplicated postings |
| Ledger internal | Per-currency balance; suspense ageing |

A mismatch **never silently rewrites historical financial facts**. It creates a `ReconciliationException`, opens a `RECONCILIATION` hold if the settlement is non-terminal (ADR-001 §7.2), and parks the amount in a suspense account until cleared. Clearing is a compensating entry posted from an authorized resolution event. Suspense ageing thresholds are **P-10 TBD**.

---

## 7. Tamper evidence

A global `prev_entry_hash` chain was rejected: it forces every insert to read the current head under lock, serializing all ledger writes across all currencies and settlements. That is contention introduced for elegance, not for a stated requirement. Per-book and per-currency chains have the same defect at smaller scale.

**Adopted — four layers, none serializing:**

| Layer | Mechanism |
|---|---|
| **1 — Prevention** | `REVOKE UPDATE, DELETE` from all application roles; ledger tables owned by a role the application cannot assume; `BEFORE UPDATE/DELETE` triggers raising unconditionally |
| **2 — Per-entry integrity** | `entry_hash` over the entry's own canonical content. **No `prev` pointer.** Zero contention. Detects modification of any single entry. |
| **3 — History integrity** | Periodic **signed Merkle root** over `entry_hash` values in a sealed window, stored and anchored externally. Detects insertion, deletion, reordering. |
| **4 — Independent corroboration** | Daily four-way reconciliation against partner records |

**Residual:** entries between the last checkpoint and now are covered by layers 1, 2 and 4 but not yet 3. WAL archiving to immutable storage covers the gap. This is tamper *evidence*, not tamper *impossibility* — no application-layer design achieves the latter against infrastructure-level access. Checkpoint frequency and anchoring mechanism are **P-11 TBD**.

---

## 8. Security

| Control | Implementation |
|---|---|
| Least privilege | `app_writer`: INSERT only on `settlement_events`, `webhook_receipts`, `ledger_entries`, `ledger_lines`. No UPDATE. No DELETE. `app_reader`: SELECT only. `auditor`: SELECT only, separate credential. `migrator`: DDL only, not used at runtime. |
| Ledger write permission | **The posting service alone.** No API endpoint, admin console or support tool has INSERT. |
| Separation of duties | An admin **authorizes**; the system **posts**. No actor does both. |
| Admin restrictions | Administrators can never alter historical financial records under any circumstance |
| Preventing direct manipulation | No ORM write path to ledger models outside the posting service; enforced by the layering rule and a CI check |
| Detection | Per-entry hash verification, Merkle checkpoint verification, independent balance recomputation |

---

## 9. Architecture versus accounting policy

### 9.1 Architectural requirements — binding, no Finance approval required

| # | Requirement |
|---|---|
| AR-1 | Double entry: every posting has debit and credit lines |
| AR-2 | Append-only; no `UPDATE`/`DELETE`, enforced by DB role |
| AR-3 | Balanced per currency, per entry, in exact integer minor units |
| AR-4 | Every entry references an immutable accepted source event (`NOT NULL` FK) |
| AR-5 | Exact money representation; no binary floating point |
| AR-6 | Corrections are compensating entries; originals never altered |
| AR-7 | Posting rules versioned; version recorded on every entry |
| AR-8 | Reconciliation and suspense capability exists |
| AR-9 | Deterministic replay |
| AR-10 | Currency definitions versioned and configurable |
| AR-11 | Posting rules are pure — no I/O, no projection reads |
| AR-12 | The chart of accounts is configuration, not code |

### 9.2 Finance / accounting policy — NOT APPROVED, must not be invented

**Nothing below has been determined. No example, sample schema, comment, test, seed value or implementation default may make any of it normative.**

| ID | Policy | Owner |
|---|---|---|
| P-1 | Final chart of accounts | Finance + Accounting |
| P-2 | Revenue recognition | Finance + Product |
| P-3 | Exposure recognition | Finance + Accounting |
| P-4 | Loss recognition | Finance + Accounting |
| P-5 | Recovery accounting | Finance + Accounting |
| P-6 | Partner receivable/payable treatment | Finance + Legal + Banking Partner |
| P-7 | Memorandum escrow accounting — whether it exists at all | Finance + Accounting + Legal |
| P-8 | Reporting currency | Finance |
| P-9 | FX accounting treatment | Finance |
| P-10 | Suspense ageing and quarantine-expiry thresholds | Finance + Compliance |
| P-11 | Checkpoint frequency and external anchoring | Compliance + Security + Legal |
| U-1 | Coordination fee on timeout/rematch *(carried from ADR-001)* | Product + Legal |
| U-8 | Loss-bearing responsibility *(carried from ADR-001)* | Legal + Partner Contracting + Insurance + Finance |

### 9.3 Memorandum escrow book — optional

The canonical architecture is correct whether the memorandum book is adopted or rejected. If rejected, no real-book posting changes and no invariant weakens. If adopted under P-7, it is a separate book with its own balancing domain, touching no real-book account, **aggregate by partner and currency, never per customer**, asserting no Xspeeria ownership. Under no configuration does any customer wallet or balance table exist.

---

## 10. CRITICAL invariants

| ID | Invariant |
|---|---|
| L-1 | Every entry balances per currency: `Σ debits(C) == Σ credits(C)`, exact integer minor units |
| L-2 | No entry mixes currencies without an explicit FX position account pair |
| L-3 | Every entry has non-null `source_event_id` referencing an accepted `settlement_events` row |
| L-4 | `UNIQUE(source_event_id, posting_rule_id)`. `posting_rule_version` recorded, **not** in the key |
| L-5 | No `UPDATE`/`DELETE` on entries or lines succeeds under any application role |
| L-6 | Corrections are compensating entries; `UNIQUE(reverses_entry_id, posting_rule_id)` |
| L-7 | Every `entry_hash` matches its content; every sealed checkpoint's signed Merkle root verifies |
| L-8 | **No real-book entry may be posted against any customer principal movement (`FUNDED`, `PAID_OUT`, `RETURNED`), under any policy configuration, present or future** |
| L-9 | No customer balance, wallet or cash-ledger table exists. Memorandum accounts, if adopted, are aggregate per partner per currency and never per customer |
| L-10 | Every amount carries currency, stored `scale`, and `currency_def_version` |
| L-11 | No binary floating point in any authoritative monetary state |
| L-12 | Rounding residue posts to suspense; never discarded |
| L-13 | Posted exposure equals `Settlement.outstanding_exposure_amount` exactly |
| L-14 | A recovery entry never exceeds the exposure it reverses |
| L-15 | Suspense balances aged; threshold breach raises an exception *(threshold P-10)* |
| L-16 | The ledger never asserts a money fact absent from `settlement_events` |
| L-17 | **Given (a) the immutable accepted event stream, (b) posting rules at their recorded versions and (c) the accounting-policy configuration at its recorded version — replay from genesis reproduces the ledger exactly, entry for entry and line for line** |
| L-18 | `settlement_events` + both projections + `ledger_entries` + `ledger_lines` + audit records + outbox rows commit in one transaction. No partial financial state is observable. |
| L-19 | No network call occurs within the financial transaction |
| L-20 | No signature-valid partner message is ever discarded; every message is retained with an explicit verdict |
| L-21 | Posting rules are pure: identical inputs yield identical outputs, no I/O, no projection reads |
| L-22 | Every quarantined event is either promoted or converted to a `ReconciliationException`. None expires silently. |
| L-23 | No posting rule may be defined that violates L-8. The rule engine rejects at configuration load, not at posting time. |

**L-17 is the master invariant.** If it holds, the ledger is provably a deterministic function of accepted history.

---

## 11. Required tests

| Category | Tests |
|---|---|
| Balanced journal | Every configured posting rule balances per currency. Multi-rule events produce multiple independently balanced entries. |
| Posting cardinality | One event → N rule-driven entries, each once. A bumped rule version posts **nothing** (L-4). Version recorded correctly. |
| Property-based | Arbitrary event sequences: ledger balances; L-17 replay-equivalence; suspense converges |
| Concurrency | Simultaneous postings across settlements and currencies with **no contention on a shared hash head** — regression test for the rejected global chain |
| Duplicate-event | Same `provider_event_id` 1,000× → one event, one entry set. Both legs' identical `event_type` webhooks both post (ADR-001 D-13 regression). |
| Replay | Full replay from genesis reproduces the ledger byte-identically under recorded versions and policy config |
| Crash-recovery | Kill at every step of both stages. No duplicates, no gaps, no partial financial state (L-18). |
| Transaction boundary | No network call inside the financial transaction (L-19). Posting-rule purity (L-21). |
| Event acceptance | All five evidence classes route correctly. Signature-valid message never discarded (L-20). Early-arriving valid event quarantined then promoted. Contradictory event never promoted. |
| Quarantine | Every quarantined event promotes or converts; none expires silently (L-22) |
| Reconciliation | Injected mismatch → exception + suspense + zero mutation of history, including against `COMPLETED` settlements |
| Asymmetric settlement | One leg `PAID_OUT`, one permanently failed → per ADR-001 `RECOVERY_REQUIRED`; no posting asserted beyond configured policy |
| Immutability | `UPDATE`/`DELETE` fail at DB role level. Modified entry detected by `entry_hash`. Inserted/deleted/reordered entry detected by checkpoint. Admin write path 403. |
| Currency versioning | Historical entries remain correctly interpretable after a currency definition version change (L-10) |
| **Policy neutrality** | **The system operates correctly with an empty posting-rule set** — proving no accounting treatment is hard-coded (P-1…P-9 genuinely deferred). No rule may violate L-8 (L-23). Memorandum accounts, if enabled, are aggregate-only. |

---

## 12. ADR-001 compatibility

**ADR-001 remains approved and unchanged. No amendment is required.**

| ADR-001 element | Effect |
|---|---|
| `settlement_events` as source of truth (§7) | Strengthened — now explicitly distinguished from non-authoritative `webhook_receipts` |
| Money facts only from signature-verified webhooks (F-6, F-7) | Strengthened — the acceptance pipeline is the enforcement mechanism ADR-001 assumed but did not specify |
| Idempotency keyed with `leg_id` (D-13) | Unchanged; now the base of a layered key hierarchy |
| Append-only; `UPDATE`/`DELETE` revoked (F-12) | Unchanged; extended to ledger and receipts |
| Transactional outbox for release (§6) | Unchanged — same pattern, external effects only |
| Webhook ack within 2s (banking §5.4) | Now correctly honoured by the two-stage model |
| Forward-only transitions (F-10) | Unchanged |
| Reconciliation never rewrites state (§7.2) | Extended — never rewrites the ledger either |
| `CLOSED_WITH_LOSS` does not assign loss (§2.1.15) | Preserved; P-4 and U-8 remain open |
| Out-of-order handling (§H item 6) | Refined, not contradicted — see §3.2 clarifying note |

ADR-001 §10 listed Decision 5 as an open dependency. This ADR closes it.

---

## 13. Regulatory note

Nothing in this ADR names, describes or implies possession of any money-transmission licence, forex-trading authorization, or banking-partner agreement. The accounting ledger records Xspeeria's own economic activity only and does not represent ownership of customer principal, which remains with the licensed partner in each jurisdiction throughout.

**Subject to applicable licensing and regulatory approval.**

`HUMAN / LEGAL / COMPLIANCE VERIFICATION REQUIRED` for every item in §9.2 before the affected implementation paths are built.

---

## 14. Evidence state

`DOCUMENTED`. No implementation exists. No control in this ADR is `IMPLEMENTED` or `VERIFIED`.
