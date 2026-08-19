# ADR-001 — Canonical Transaction/Settlement State Machine

| Attribute | Value |
|---|---|
| **Status** | **APPROVED** |
| **Date** | 2026-08-18 |
| **Decision ID** | DEC-003 |
| **Supersedes** | All prior transaction/settlement state models in the Xspeeria document suite |
| **Source** | Phase 0 Audit (`AUDIT_PHASE0_2026-08-18.md`) §13 C-1, §14 Decision 1 |
| **Authority** | Human-approved architecture decision — `DOCUMENT_INDEX.md` §1 rank 2 |

---

## 1. Context

The Phase 0 audit identified five materially incompatible transaction/settlement state machines across documents that `DOCUMENT_INDEX.md` each designates PRIMARY for their own domain:

| Source | Section | States |
|---|---|---|
| `Appendix_D_Financial_Correctness_Settlement_Specification_Xspeeria_v1.1.md` | §5 | 13 |
| `Xspeeria_Master_Prompt_Python_Backend.md` | §8 | 14 |
| `02_Technical_Design_Specification.md` | §10.2 | 13 |
| `07_Banking_Integration_Specification_v1.1.md` | §4.3 | 6 |
| `05_API_Contract_Data_Dictionary.md` | Transaction / Settlement entities | 5 / 6 |

`DOCUMENT_INDEX.md` §1 provided no rule for resolving conflicts between two documents that are each primary for their own domain, so the conflict routed to `STOP — DOCUMENT CONFLICT REQUIRES HUMAN DECISION`.

### 1.1 The material defect

Four of the five models had **no state distinguishing "escrow A funded, escrow B not funded."** `Appendix_D` §15 makes that distinction a hard prohibition:

> *"never release either leg of a settlement until both local escrow accounts are independently confirmed funded by their respective partner's webhook"*

`07_Banking_Integration_Specification_v1.1.md` §4.3 defined `funds_pending_verification` as *"At least one party has confirmed sending funds"* with a legal transition directly to `verified`. That single state collapses the funded/unfunded asymmetry the entire non-custodial design depends on.

### 1.2 Two latent naming hazards

- **`verified` collision.** Banking §4.3 `verified` = *"partner has confirmed receipt of both legs"* — money **in**, before release. Appendix D §3/§5 `VERIFIED` = **Bank Verified**, after `PROCESSING` — money **out**, payout confirmed. Same token, opposite ends of the lifecycle.
- **Inverted ordering.** Appendix D §3: `Bank Processing → Bank Verified → Completed`. Banking §4.3: `verified → processing → completed`.

### 1.3 Defects identified in Appendix D itself

Appendix D was used as the starting financial authority but was not adopted unchanged. Thirteen defects were identified; the material ones:

| ID | Defect |
|---|---|
| D-1 | No failure state, despite §6 mandating a Reverse Transfer adapter API |
| D-2 | No reversal or refund state |
| D-3 | Escrow return is customer money movement with no state and no event in §7 |
| D-4 | §11 `RECONCILIATION_REQUIRED` mandates mutating completed records that §5/§15 declare immutable |
| D-5 | `DISPUTED` as a state contradicts §5's own immutability rule |
| D-6 | `ESCROW_A`/`ESCROW_B` are positional, not semantic — undefined across corridors and directions |
| D-7 | `RECONCILIATION_REQUIRED` absent from the §5 state list |
| D-8 | No escrow-provisioning failure state |
| D-9 | Order-lifecycle states (`OPEN`, `MATCHED`) mixed into the settlement machine |
| D-10 | No release-command state |
| D-13 | §8 idempotency keys lack a leg identifier; banking §5.5 keys on `(settlement_id, event_type)`, which cannot distinguish leg 1's `transfer.completed` from leg 2's |

D-13 is a path to single-sided release that survives a correct state machine, because deduplication sits above it.

---

## 2. Decision

Adopt a **four-concern model** replacing the single-enum designs. The aggregate stores only Xspeeria's own decisions; money facts live exclusively on the legs.

### 2.1 Approved architecture principles

1. `SettlementLeg` is authoritative for per-leg financial facts.
2. `Settlement.phase` contains workflow/orchestration decisions only.
3. Financial facts, workflow state, compliance holds, disputes, reconciliation exceptions and immutable events remain separate concerns.
4. The 10-phase `Settlement` model and 9-state `SettlementLeg` model are canonical.
5. `PAID_OUT` is irreversible and has zero outbound transitions.
6. `COMPLETED` requires both legs `PAID_OUT`.
7. No settlement may enter a terminal phase while customer funds remain unresolved.
8. `RECOVERY_REQUIRED` is mandatory for asymmetric payout/return exposure and must remain operationally visible.
9. Release authorization uses the transactional outbox design in §6.
10. Reconciliation never rewrites financial state.
11. All aggregate phase transitions are forward-only.
12. Domain model uses semantic party roles `REQUESTER` and `ACCEPTER`; each `SettlementLeg` also retains an immutable UUID `leg_id` for persistence, idempotency and partner-event correlation.
13. Rematching MUST NOT reuse funds from the previous settlement. Any funded escrow must first be returned and confirmed `RETURNED`. Only after `CLOSED_UNWOUND` may a new settlement be created and linked through `rematched_to`.
14. Conditional/two-phase partner release is a preferred partner capability and architecture extension point, not an assumption of the core state machine. The core architecture must remain safe with two independent asynchronous banking/payment partners.
15. `CLOSED_WITH_LOSS` does **not** mean Xspeeria automatically bears the financial loss. It means the recovery case has been financially closed with a recognized loss. Loss allocation is separately recorded and governed by contract, insurance/indemnity, applicable law and approved policy.

### 2.2 Rationale for rejecting the alternatives

| Option | Rejected because |
|---|---|
| Banking §4.3 canonical (6 states) | Optimizes for integration convenience at the cost of the single invariant protecting customer funds |
| Appendix D §5 adopted unchanged | Carries defects D-1 through D-13 |
| A sixth clean-sheet enum | Adds a sixth vocabulary to a suite whose defining problem is five vocabularies |
| Defer until Phase 5 | Phase 3 defines the `Money` object and fee model; Phase 4 sets lifecycle states that must dock onto the transaction model |

An intermediate 19-state single-enum proposal was also rejected during review: it conflated financial facts, workflow state, compliance holds, disputes and reconciliation into one enum, and persisted nine states that were projections of leg facts — a second competing record of the same fact, able to drift from the authoritative one.

---

## 3. Naming convention

**`SCREAMING_SNAKE_CASE`** for all canonical internal states.

Rationale: matches Appendix D and the Python backend spec; native Python `Enum` convention; usable verbatim as PostgreSQL `CHECK` values; and renders internal states visually distinct from the lowercase partner vocabulary retained at the Banking Abstraction Layer boundary, so a reviewer can see at a glance whether a value is trusted-internal or untrusted-partner.

`Appendix_D` §5 `VERIFIED` is renamed **`PAID_OUT`** (leg-level) to eliminate the collision documented in §1.2.

---

## 4. Canonical model — `SettlementLeg.state` (9 states)

Authoritative for per-leg financial facts. Exactly two legs per settlement, in two distinct currencies and two distinct jurisdictions.

| State | Meaning | Money fact? | Terminal |
|---|---|---|---|
| `PENDING` | Leg created | No | No |
| `ESCROW_PROVISIONED` | Partner confirmed escrow account exists | No | No |
| `FUNDED` | **Partner webhook confirmed escrow funded** | **Yes** | No |
| `RELEASE_SENT` | Partner acknowledged release command | No | No |
| `PAID_OUT` | **Partner webhook confirmed payout to beneficiary** | **Yes** | **Yes — irreversible** |
| `RETURN_SENT` | Partner acknowledged return command | No | No |
| `RETURNED` | **Partner webhook confirmed escrow returned to funder** | **Yes** | **Yes** |
| `PROVISION_FAILED` | Escrow could not be provisioned | No | **Yes** |
| `PAYOUT_FAILED` | Payout failed; escrow still holds funds | No | No — retryable |

**Leg transitions:**

```
PENDING → ESCROW_PROVISIONED → FUNDED → RELEASE_SENT → PAID_OUT
PENDING → PROVISION_FAILED
RELEASE_SENT → PAYOUT_FAILED
PAYOUT_FAILED → RELEASE_SENT        (retry with corrected beneficiary)
PAYOUT_FAILED → RETURN_SENT
FUNDED → RETURN_SENT → RETURNED
```

The three money facts — `FUNDED`, `PAID_OUT`, `RETURNED` — may be set **only** by a signature-verified, in-replay-window partner webhook. Nothing else in the system may assert them.

`PAID_OUT` has no outbound transitions. This is the model's single most important constraint: once a partner has paid a beneficiary domestically, Xspeeria — which holds no funds and has no cross-border reach — cannot claw it back.

---

## 5. Canonical model — `Settlement.phase` (10 phases)

Xspeeria decisions only. Contains no funding or payout vocabulary, and therefore cannot contradict leg facts.

| Phase | Meaning | Terminal |
|---|---|---|
| `INITIALIZING` | Created from confirmed match; escrows provisioning | No |
| `AWAITING_FUNDING` | Both escrows provisioned; awaiting parties | No |
| `RELEASING` | Release authorized; legs executing independently | No |
| `COMPLETED` | Both legs `PAID_OUT`. Financially immutable. | **Yes** |
| `UNWINDING` | No payout occurred; returning funded escrows | No |
| `CLOSED_UNWOUND` | All funded escrows returned; nothing paid out | **Yes** |
| `RECOVERY_REQUIRED` | **Asymmetric outcome; exposure outstanding** | **No** |
| `CLOSED_RECOVERED` | Asymmetry resolved without loss | **Yes** |
| `CLOSED_WITH_LOSS` | Asymmetry financially closed with recognized loss (see §2.1.15) | **Yes** |
| `CANCELLED` | Closed before any funding | **Yes** |

### 5.1 Phase transitions — 13, all forward-only

Gates are evaluated under `SELECT ... FOR UPDATE` on the settlement and both legs, in fixed ID order, with leg state re-read inside the lock.

| # | From | To | Gate | Actor |
|---|---|---|---|---|
| 1 | — | `INITIALIZING` | Match confirmed by both parties | SYS |
| 2 | `INITIALIZING` | `AWAITING_FUNDING` | Both legs `ESCROW_PROVISIONED` | SYS |
| 3 | `INITIALIZING` | `CANCELLED` | Any leg `PROVISION_FAILED`, or party cancels — and zero legs `FUNDED` | SYS / USER |
| 4 | `AWAITING_FUNDING` | `RELEASING` | Both legs `FUNDED` ∧ both beneficiaries validated ∧ zero blocking holds ∧ `release_authorized_at IS NULL` | SYS |
| 5 | `AWAITING_FUNDING` | `UNWINDING` | Funding window expired ∧ ≥1 leg `FUNDED` | SYS |
| 6 | `AWAITING_FUNDING` | `CANCELLED` | Funding window expired ∧ zero legs `FUNDED` | SYS |
| 7 | `RELEASING` | `COMPLETED` | **Both legs `PAID_OUT`** | SYS |
| 8 | `RELEASING` | `UNWINDING` | ≥1 leg permanently `PAYOUT_FAILED` ∧ **zero legs `PAID_OUT`** | ADMIN |
| 9 | `RELEASING` | `RECOVERY_REQUIRED` | **≥1 leg `PAID_OUT` ∧ ≥1 leg permanently `PAYOUT_FAILED`** | SYS |
| 10 | `UNWINDING` | `CLOSED_UNWOUND` | All previously-`FUNDED` legs `RETURNED` | SYS |
| 11 | `UNWINDING` | `RECOVERY_REQUIRED` | Return permanently failed | SYS |
| 12 | `RECOVERY_REQUIRED` | `CLOSED_RECOVERED` | Exposure resolved, no loss | **ADMIN** |
| 13 | `RECOVERY_REQUIRED` | `CLOSED_WITH_LOSS` | Loss recognized and case financially closed (§2.1.15) | **ADMIN** |

Rematch is not a phase: `CLOSED_UNWOUND` + `closure_reason = REMATCH` + `rematched_to` FK to the new settlement. Per §2.1.13, a new settlement may be created only after `CLOSED_UNWOUND`.

### 5.2 Forbidden — invariant set

| # | Forbidden | Severity |
|---|---|---|
| F-1 | `RELEASING` with fewer than 2 legs `FUNDED` — single-sided release | **CRITICAL** |
| F-2 | `COMPLETED` with fewer than 2 legs `PAID_OUT` | **CRITICAL** |
| F-3 | `UNWINDING`/`CLOSED_UNWOUND` with any leg `PAID_OUT` — false reversal | **CRITICAL** |
| F-4 | Any transition out of `PAID_OUT` | **CRITICAL** |
| F-5 | Any transition out of `COMPLETED`, `CANCELLED`, `CLOSED_UNWOUND`, `CLOSED_RECOVERED`, `CLOSED_WITH_LOSS` | **CRITICAL** |
| F-6 | `FUNDED`, `PAID_OUT` or `RETURNED` set without a signature-verified, in-window partner webhook | **CRITICAL** |
| F-7 | Any money fact set from client input | **CRITICAL** |
| F-8 | Any leg whose source and destination jurisdictions differ | **CRITICAL** |
| F-9 | Terminal phase while any leg is `FUNDED` and neither `PAID_OUT` nor `RETURNED` — stranded funds | **CRITICAL** |
| F-10 | Any backward phase transition — none exist | **CRITICAL** |
| F-11 | `release_authorized_at` written twice | **CRITICAL** |
| F-12 | `UPDATE`/`DELETE` on `settlement_events` | **CRITICAL** |
| F-13 | Phase advancement with an open `blocks_progression` hold | High |
| F-14 | A partner advancing a leg it is not assigned to | High |
| F-15 | Any phase transition committed without re-reading leg state inside the lock | High |
| F-16 | Reusing funds from a previous settlement on rematch (§2.1.13) | **CRITICAL** |

### 5.3 Asymmetric outcomes

`FUNDED` is reversible; `PAID_OUT` is not. Any outcome where **≥1 leg is `PAID_OUT` and ≥1 leg permanently failed** falls to `RECOVERY_REQUIRED`, which is non-terminal, carries an explicit `outstanding_exposure_amount`, and closes only by authorized human action. There is no path from asymmetry to a clean terminal state.

**Preventive control:** release is gated on both beneficiary accounts having been validated via the partner's account-name-inquiry (`07_Banking_Integration_Specification_v1.1.md` §3.3) before release authorization. Invalid-destination-account failures are the dominant cause of permanent payout failure; this removes them in advance.

---

## 6. Release authorization — transactional outbox

An application process reporting "I dispatched two calls" is not a fact and is never persisted as one.

**(a) Authorization — one atomic decision, one DB transaction**

```
BEGIN
  SELECT ... FOR UPDATE  -- settlement + both legs, fixed ID order (deadlock-safe)
  ASSERT  both legs FUNDED
  ASSERT  both beneficiary accounts validated
  ASSERT  no open hold with blocks_progression
  ASSERT  release_authorized_at IS NULL          -- set-once
  SET     release_authorized_at = now()
  SET     phase = RELEASING
  INSERT  settlement_events (ReleaseAuthorized)  -- append-only
  INSERT  outbox × 2                             -- one row per leg
COMMIT
```

`release_authorized_at` is the persisted fact — immutable, set once, guarded by a partial unique index. It records that Xspeeria decided, which is true regardless of what any subsequent network call did.

**(b) Dispatch — separate, at-least-once, per-leg**

```
idempotency_key = sha256(settlement_id | leg_id | "RELEASE" | release_authorized_at)
```

Deterministic derivation is required: after a crash mid-dispatch, the retry computes the identical key, so the partner deduplicates rather than double-releasing.

**(c) Never unwind a successful dispatch**

If leg 1's release succeeds and leg 2's call fails, leg 1 is not rolled back — it cannot be. Leg 2 retries with backoff against the same key until success or permanent failure. After N attempts a `SettlementHold` of type `DISPATCH_FAILURE` opens and alerts operations, and **no financial state changes**.

**(d) Residual**

Between leg 1's release and leg 2's acknowledgement there is a window in which leg 1 could pay out and leg 2 fail permanently → `RECOVERY_REQUIRED`. No purely client-side design closes it with two independent asynchronous partners. Conditional/two-phase partner release would close it structurally and is an extension point per §2.1.14, not a core assumption. Beneficiary pre-validation (§5.3) is the practical mitigation.

---

## 7. Separation of concerns

| Concern | Home | Cardinality | Mutability |
|---|---|---|---|
| **Financial facts** | `SettlementLeg.state` (9) + `settlement_events` | 2 legs / settlement | Legs forward-only; events append-only, `UPDATE`/`DELETE` revoked at DB-role level |
| **Workflow / orchestration** | `Settlement.phase` (10) + `release_authorized_at` + `outbox` | 1 / settlement | Phase forward-only; `release_authorized_at` set-once |
| **Compliance holds** | `SettlementHold` entity | 0..n concurrent | Open/close; never deleted |
| **Disputes** | `Dispute` entity | 0..n | Own lifecycle; never mutates a settlement |
| **Reconciliation exceptions** | `ReconciliationException` entity | 0..n | Own lifecycle; never mutates a settlement |

`SettlementHold` types: `COMPLIANCE`, `DISPUTE`, `RECONCILIATION`, `DISPATCH_FAILURE`, `RISK` — each with `blocks_progression BOOLEAN`. Multiple holds coexist; progression requires zero open blocking holds.

### 7.1 Disputes

A dispute is never a settlement phase. Pre-completion disputes open a `SettlementHold` of type `DISPUTE`. Post-completion disputes do not touch settlement state at all; financial correction occurs only via a **new compensating settlement** carrying `compensates_settlement_id`. This satisfies the dispute window while honoring `Appendix_D` §15, and follows the mechanism already endorsed by `02_Technical_Design_Specification.md` §7.4: *"corrections require a compensating Transaction event, never a mutation."*

### 7.2 Reconciliation

Reconciliation never changes financial state. Every mismatch creates a `ReconciliationException` — including against `COMPLETED` settlements, which resolves defect D-4 without weakening immutability. If the settlement is non-terminal, a `RECONCILIATION` hold opens alongside it. Resolution closes the exception and the hold. If money is genuinely wrong, the remedy is a compensating settlement, never a state rewrite.

There is no `RECONCILIATION_REQUIRED → prior state` transition. Restoring a prior state would be an arbitrary-state-write primitive available to any compromised or mistaken admin account. Zero backward transitions exist in the model.

---

## 8. Partner vocabulary mapping (Banking Abstraction Layer)

`07_Banking_Integration_Specification_v1.1.md` §4.3 states are retained as the **partner-facing vocabulary**, translated at the BAL boundary. The mapping is code with tests, not prose.

| Partner value | Canonical | Lossy? |
|---|---|---|
| `initiated` | leg `ESCROW_PROVISIONED` | No |
| `funds_pending_verification` | leg `FUNDED` for **that leg only** | **YES — resolvable only by `leg_id`** |
| `verified` | leg `FUNDED` (**not** `PAID_OUT` — see §1.2) | **NAME COLLISION** |
| `processing` | leg `RELEASE_SENT` | No |
| `completed` | leg `PAID_OUT` | No |
| `failed` | leg `PAYOUT_FAILED` or `PROVISION_FAILED` | Resolvable by phase |
| `reversed` | leg `RETURNED` | No |

A partner webhook that does not carry a resolvable `leg_id` **must be rejected**, not defaulted.

---

## 9. Migration mapping from superseded models

### 9.1 `Appendix_D` §5 (13 states)

| Superseded | Canonical |
|---|---|
| `OPEN`, `MATCHED` | Not settlement states — Match entity (D-9) |
| `INSTRUCTION_SENT` | phase `INITIALIZING` → `AWAITING_FUNDING` |
| `AWAITING_ESCROW_FUNDING` | phase `AWAITING_FUNDING`, zero legs `FUNDED` |
| `ESCROW_A_FUNDED` | leg(`REQUESTER`).state = `FUNDED`, other not (D-6 resolved) |
| `ESCROW_B_FUNDED` | leg(`ACCEPTER`).state = `FUNDED`, other not |
| `BOTH_ESCROWS_FUNDED` | both legs `FUNDED` |
| `PROCESSING` | ≥1 leg `RELEASE_SENT` |
| `VERIFIED` | both legs `PAID_OUT` (renamed — §1.2) |
| `COMPLETED` | phase `COMPLETED` |
| `CANCELLED` | phase `CANCELLED` |
| `DISPUTED` | `Dispute` entity + `DISPUTE` hold (D-5 resolved) |
| `REMATCH_REQUIRED` | phase `CLOSED_UNWOUND` + `closure_reason = REMATCH` |
| `RECONCILIATION_REQUIRED` (§11) | `ReconciliationException` + `RECONCILIATION` hold (D-4, D-7 resolved) |

### 9.2 `Xspeeria_Master_Prompt_Python_Backend.md` §8 (14 states)

| Superseded | Canonical |
|---|---|
| `DRAFT`, `MATCHED` | Pre-settlement — Match entity |
| `ACCEPTED` | phase `INITIALIZING` |
| `FUNDING_PENDING` | phase `AWAITING_FUNDING` |
| `FUNDS_CONFIRMED` | leg-level `FUNDED` — the single-sided-release gap |
| `ESCROW_CONFIRMED` | both legs `FUNDED` |
| `SETTLEMENT_PENDING` | phase `RELEASING` |
| `SETTLED` | both legs `PAID_OUT` |
| `COMPLETED` | phase `COMPLETED` |
| `CANCELLED` | phase `CANCELLED` |
| `EXPIRED` | `FundingWindowExpired` event + `closure_reason` |
| `FAILED` | leg `PAYOUT_FAILED`/`PROVISION_FAILED`; phase per exposure |
| `DISPUTED` | `Dispute` entity |
| `REVERSED` | phase `CLOSED_UNWOUND` (clean) or `CLOSED_RECOVERED`/`CLOSED_WITH_LOSS` (asymmetric) |

### 9.3 `02_Technical_Design_Specification.md` §10.2 (13 states)

| Superseded | Canonical |
|---|---|
| `Proposed`, `Confirmed` | Match entity |
| `AwaitingFunds` | phase `AWAITING_FUNDING` |
| `FundsReceived` | leg-level `FUNDED` — TDS assumed a singular sender |
| `SettlementInitiated` | phase `RELEASING` |
| `SettlementPending` | ≥1 leg `RELEASE_SENT` |
| `Completed` | phase `COMPLETED` — now strictly terminal, superseding TDS §10.3 |
| `SettlementFailed` | leg `PAYOUT_FAILED`; phase per exposure |
| `ManualReview` | `SettlementHold` / `RECOVERY_REQUIRED` |
| `Refunded` | phase `CLOSED_UNWOUND` |
| `Cancelled` | phase `CANCELLED` — **but timeout with a funded leg now routes to `UNWINDING`, never `CANCELLED` (F-9)** |
| `Disputed`, `Resolved` | `Dispute` entity |

### 9.4 `05_API_Contract_Data_Dictionary.md`

`Settlement.status` is replaced by `Settlement.phase`. `Transaction.status` is retained as a **read-only derived projection**:

| `Transaction.status` | Derived from |
|---|---|
| `initiated` | `INITIALIZING`, `AWAITING_FUNDING` |
| `settling` | `RELEASING` |
| `completed` | `COMPLETED` |
| `unwinding` | `UNWINDING` |
| `recovery` | `RECOVERY_REQUIRED` |
| `closed` | `CLOSED_UNWOUND`, `CLOSED_RECOVERED`, `CLOSED_WITH_LOSS`, `CANCELLED` |
| `on_hold` | any open `blocks_progression` hold |

Any API accepting a write to `Transaction.status` is a defect.

---

## 10. Consequences

### Positive

- Single-sided release becomes structurally unreachable rather than runtime-checked.
- The aggregate has no vocabulary for money facts, so it cannot contradict the legs.
- Asymmetric outcomes cannot be represented as success or as a clean reversal.
- Zero backward transitions; the append-only event log is a complete history.
- Asynchronous partner acknowledgement is handled natively, consistent with the differing per-leg SLA targets in `07_Banking_Integration_Specification_v1.1.md` §8.
- Compliance holds compose — *"under compliance review AND reconciliation mismatch"* is now expressible.

### Negative

- More machinery than a 6-state model: a derivation function, a DB trigger, an outbox and three new entities.
- The derivation function is safety-critical and must be pure and exhaustively property-tested.
- Cross-table gates cannot be a simple `CHECK`; they depend on a trigger plus correct locking. A missing `FOR UPDATE` reintroduces the race (F-15).
- `RECOVERY_REQUIRED` is non-terminal by design and will accumulate without operational follow-through.

### Dependencies

- **Decision 5 (ledger model)** — this ADR presumes `settlement_events` is an append-only ledger. Unresolved.
- **Decision 2 (security baseline)** — admin transitions 8, 12, 13 assume MFA-protected admin roles. Unresolved.
- **Decision 3 (corridor)** — F-8 jurisdiction validation requires a settled corridor. Unresolved.

---

## 11. Governance-deferred parameters

The architecture must implement each of these as a **configurable policy value**, never a hard-coded constant, and must not encode a default that presumes the outcome.

| ID | Parameter | Owner | Status |
|---|---|---|---|
| U-1 | Coordination fee treatment after counterparty timeout/rematch | Product + Legal | **TBD — Product/Legal** |
| U-2 | Funding/settlement window duration and extension policy | Product + Risk + Banking Partner SLA | **TBD — Product/Risk** |
| U-5 | Dispute window duration, configurable by jurisdiction/corridor | Compliance + Legal | **TBD — Compliance/Legal** |
| U-8 | Loss-bearing responsibility on `CLOSED_WITH_LOSS` | Legal + Partner Contracting + Insurance/Risk | **TBD — Legal**. No assumption that Xspeeria bears the loss may be encoded (§2.1.15) |
| U-10 | `RECOVERY_REQUIRED` ageing and regulatory escalation thresholds | Compliance + Legal | **TBD — Compliance/Legal** |
| U-9 | Conditional/two-phase partner release capability | Partner Selection | **TBD** — extension point only (§2.1.14) |

---

## 12. Regulatory note

Nothing in this ADR names, describes, or implies possession of any money-transmission licence, forex-trading authorization, or banking-partner agreement. The escrow-and-release model reduces where custody sits — with the licensed partner in each jurisdiction, not with Xspeeria — but does not by itself remove Xspeeria's own likely need for money-transmission-equivalent registration as the orchestrating party.

**Subject to applicable licensing and regulatory approval.**

`HUMAN / LEGAL / COMPLIANCE VERIFICATION REQUIRED` before any partner engagement or settlement implementation.

---

## 13. Verification status

This ADR is `DOCUMENTED`. No implementation exists. Nothing in it is `IMPLEMENTED` or `VERIFIED`.
