<!-- SOURCE DOCUMENT: Appendix_D_Financial_Correctness_Settlement_Specification_Xspeeria_v1.1.docx -->
<!-- Converted to Markdown for Claude/Claude Code repository use. -->
<!-- Source content is preserved; this conversion does not establish new business or technical authority. -->

# Financial Correctness & Settlement Specification

**Document ID:** XSP-APP-D-001  
**Product:** Xspeeria  
**Version:** 1.1  
**Classification:** Confidential – Engineering & Compliance  
**Status:** Approved for MVP Development

# 1. Purpose of This Document

This appendix defines the financial correctness rules governing every transaction on Xspeeria. It is the single source of truth for engineers, auditors, compliance officers, banking partners, and AI development tools.

Core principle: Xspeeria itself is a non-custodial marketplace and never receives, stores, lends, or owns customer funds. Every settlement is executed through two independently held, country-local escrow accounts — one per currency, each held by the licensed banking partner in that jurisdiction — never through a single cross-border transfer and never through an Xspeeria-controlled account.

# 2. Non-Custodial Financial Architecture

Xspeeria provides identity verification, marketplace matching, rate discovery, transaction orchestration, audit logging, and compliance monitoring. Partner banks are responsible for customer accounts, escrow custody, transfer execution, and settlement confirmation, each within their own jurisdiction only — no partner ever moves funds across the border on Xspeeria's behalf.

# 3. Financial Lifecycle

> **RECONCILED — ADR-001 (DEC-003), 2026-08-18.** The state vocabulary in Sections 3, 5, 7, 8, 11 and 15 has been superseded by the canonical model in `docs/adr/001-transaction-state-machine.md`. The financial *principles* in this document are unchanged and remain authoritative; only the state representation has changed. See Section 5 for the canonical model and Section 17 for the defects in the original text that ADR-001 corrects.

Transaction lifecycle: Order Created → Order Validated → Match Created → Settlement Created → Escrow Provisioning (Both Legs) → Local Escrow Funding (Both Legs) → Release Authorization → Domestic Payout (Both Legs) → Completed. Settlement legs are domestic-only: each party funds a local escrow account held by the licensed partner in their own country, and funds are released to both beneficiaries only once both escrow accounts confirm funded status — no currency crosses either border. If either party fails to fund within the settlement window, the transaction returns to the matching pool per Section 5. Disputes are handled through an exception workflow without Xspeeria itself taking custody of funds at any point.

# 4. Matching Engine Specification

Algorithm: Price-Time Priority.

Rules:  
• Best exchange rate executes first.  
• If rates are equal, the earliest order has priority.  
• Market orders execute immediately.  
• Limit orders wait until the requested rate becomes available.  
• Large orders may be partially filled by multiple counterparties while remaining a single customer transaction group.

# 5. Settlement Orchestration

Xspeeria generates settlement instructions only. Each corridor uses two local escrow accounts, one per currency, held by the partner bank in that jurisdiction. Release to both beneficiaries is atomic and conditional on both escrow accounts independently confirming funded status; a single-sided funding event holds the transaction open and never triggers release. If the counterparty fails to fund within the settlement window (plus any granted extension), the funded party's escrow is returned in full and the order is re-opened for matching with a new counterparty; repeated non-funding affects the non-funding party's risk score. Partner banks validate beneficiaries, execute the domestic payout, and return signed webhook confirmations.

**Beneficiary pre-validation (ADR-001 §5.3):** release authorization requires that both destination accounts have already been validated via the partner's account-name-inquiry capability. Release must not be authorized against an unvalidated beneficiary account.

**TBD — Product / Risk / Banking Partner SLA:** the settlement window duration, extension policy, and who may grant an extension are governance-deferred parameters. They must be implemented as configurable policy values, never hard-coded constants.

**TBD — Product / Legal:** whether the coordination fee is charged to the funded party where a counterparty fails to fund is a governance-deferred parameter and must not be assumed in implementation.

## 5.1 Canonical Settlement State Model (ADR-001)

Per ADR-001, financial facts and workflow state are separate concerns. `SettlementLeg` is authoritative for per-leg financial facts; `Settlement.phase` records Xspeeria's own workflow decisions and contains no funding or payout vocabulary, so it cannot contradict leg facts.

**SettlementLeg.state — 9 states.** Exactly two legs per settlement, one per currency/jurisdiction, identified by semantic party role (`REQUESTER`, `ACCEPTER`) and an immutable UUID `leg_id`:

`PENDING`, `ESCROW_PROVISIONED`, `FUNDED`, `RELEASE_SENT`, `PAID_OUT`, `RETURN_SENT`, `RETURNED`, `PROVISION_FAILED`, `PAYOUT_FAILED`.

The three money facts — `FUNDED`, `PAID_OUT`, `RETURNED` — may be set only by a signature-verified, in-replay-window partner webhook. `PAID_OUT` is irreversible and has zero outbound transitions.

**Settlement.phase — 10 phases, forward-only:**

`INITIALIZING`, `AWAITING_FUNDING`, `RELEASING`, `COMPLETED`, `UNWINDING`, `CLOSED_UNWOUND`, `RECOVERY_REQUIRED`, `CLOSED_RECOVERED`, `CLOSED_WITH_LOSS`, `CANCELLED`.

Terminal phases: `COMPLETED`, `CLOSED_UNWOUND`, `CLOSED_RECOVERED`, `CLOSED_WITH_LOSS`, `CANCELLED`. **No settlement may enter a terminal phase while customer funds remain unresolved** — that is, while any leg is `FUNDED` and neither `PAID_OUT` nor `RETURNED`.

`COMPLETED` requires both legs `PAID_OUT`. Completed settlements are immutable and may never be edited.

## 5.2 Asymmetric Outcomes

`FUNDED` is reversible; `PAID_OUT` is not. Where one leg is `PAID_OUT` and the other has permanently failed, the settlement enters `RECOVERY_REQUIRED` — non-terminal, carrying an explicit outstanding exposure amount, closable only by authorized human action to `CLOSED_RECOVERED` or `CLOSED_WITH_LOSS`. There is no path from an asymmetric outcome to a clean terminal state, and such a settlement may never be represented as completed or as reversed.

`CLOSED_WITH_LOSS` means the recovery case has been financially closed with a recognized loss. It does **not** mean Xspeeria automatically bears that loss. Loss allocation is recorded separately and governed by contract, insurance/indemnity, applicable law and approved policy. **TBD — Legal / Partner Contracting / Insurance & Risk.**

## 5.3 Dispute, Reconciliation and Compliance Holds

Disputes, reconciliation exceptions and compliance holds are separate entities, never settlement phases. A `SettlementHold` (types `COMPLIANCE`, `DISPUTE`, `RECONCILIATION`, `DISPATCH_FAILURE`, `RISK`) blocks phase progression without altering financial state; multiple holds may be open concurrently. Post-completion disputes never mutate the completed record — financial correction occurs only through a new compensating settlement.

## 5.4 Rematching

Rematching must not reuse funds from the previous settlement. Any funded escrow must first be returned and confirmed `RETURNED`. Only after the settlement reaches `CLOSED_UNWOUND` may a new settlement be created, linked through `rematched_to`.

# 6. Bank Integration Standard

All financial institutions connect through a standardized Bank Adapter Layer. Required APIs include Account Verification, Escrow Account Provisioning, Escrow Funding Confirmation, Create Settlement, Status Lookup, Webhook Confirmation, and Reverse Transfer. Every adapter operates strictly within its own jurisdiction — no adapter is permitted to initiate or receive a cross-border transfer. Business logic must never depend directly on a specific bank.

# 7. Event-Sourced Financial Ledger

Xspeeria stores immutable financial events instead of customer balances.

> **RECONCILED — ADR-002 (DEC-004), 2026-08-18.** This section's prohibition targets **customer cash balances**, not Xspeeria's own books. Two distinct artifacts exist, and they are not the same thing:
>
> - **`settlement_events`** — the append-only root of Xspeeria's *accepted internal truth*. A domain-event journal, not an accounting ledger.
> - **A separate append-only double-entry accounting ledger** for **Xspeeria's own economic activity only** — its fees, losses, recoveries, partner receivables/payables and reconciliation differences.
>
> The accounting ledger is **not** a customer wallet ledger and does not represent Xspeeria ownership of customer principal held by regulated banking/payment partners. **Customer principal movements — `FUNDED`, `PAID_OUT`, `RETURNED` — must never create real-book accounting entries for the principal itself.** No customer wallet, customer balance or customer cash-ledger table may be introduced under any configuration.
>
> See `docs/adr/002-financial-event-ledger-architecture.md`.

## 7.1 Evidence Versus Accepted Truth

A raw partner message is **evidence, not automatically authoritative financial truth**. Three stores, with different authority:

| Store | Authority |
|---|---|
| `webhook_receipts` | **None.** Append-only evidence of every message received — valid, invalid, forged or contradictory. |
| `pending_events` | **None.** Quarantine for valid evidence awaiting a prerequisite. |
| `settlement_events` | **Root of accepted internal truth.** |

A partner message becomes an accepted `settlement_event` only after authentication, replay/idempotency checks, schema validation, settlement/leg correlation, transition validation and financial invariant validation.

**Valid but premature or out-of-order evidence is quarantined and re-evaluated — never silently discarded.** Impossible or contradictory partner evidence is retained, never silently mutates financial state, and creates a reconciliation and security workflow for human adjudication.

## 7.2 Ledger Architecture — Requirements Only

The following are **architectural requirements**. They constrain how accounting is recorded and never what the accounting is:

double entry · append-only history · balanced per currency · immutable source event reference · exact money representation with no binary floating point · corrections by compensating entry only · versioned posting rules · reconciliation and suspense capability · deterministic replay · versioned configurable currency definitions · pure posting rules with no I/O and no projection reads · chart of accounts as configuration rather than code.

Posting identity is `UNIQUE(source_event_id, posting_rule_id)`. `posting_rule_version` is recorded for deterministic historical replay but is **not** part of the uniqueness key — a policy or rule version change must never silently repost historical events. Historical accounting corrections require explicit compensating entries.

**Accounting policy is NOT determined and must not be invented** through examples, sample schemas, comments, tests, seed data or implementation defaults. The following remain open: chart of accounts (**P-1**), revenue recognition (**P-2**), exposure recognition (**P-3**), loss recognition (**P-4**), recovery accounting (**P-5**), partner receivable/payable treatment (**P-6**), memorandum escrow accounting (**P-7**), reporting currency (**P-8**), FX accounting treatment (**P-9**), suspense ageing and quarantine thresholds (**P-10**), checkpoint frequency and external anchoring (**P-11**). **TBD — Finance / Accounting / Legal / Compliance / Product / Banking Partner as applicable.**

Any memorandum escrow or control book is **optional and remains P-7 TBD**. If adopted it must be aggregate by partner and currency, **never per customer**, and must not assert Xspeeria ownership.



Required events (ADR-001). Every leg-scoped event carries `leg_id`:

**Order and match:** `OrderCreated`, `MatchCreated`, `SettlementCreated`.

**Escrow and funding (leg-scoped):** `EscrowProvisioned`, `EscrowProvisioningFailed`, `EscrowFunded`.

**Release and payout:** `ReleaseAuthorized` (settlement-scoped, set-once), `ReleaseSent` (leg-scoped), `PayoutConfirmed` (leg-scoped), `PayoutFailed` (leg-scoped).

**Unwind and return (leg-scoped):** `EscrowReturnInitiated`, `EscrowReturned`, `EscrowReturnFailed`.

**Outcome:** `SettlementCompleted`, `SettlementUnwound`, `FundingWindowExpired`, `SettlementCancelled`, `RecoveryRequired`, `RecoveryClosedWithoutLoss`, `RecoveryClosedWithLoss`, `RematchInitiated`.

**Holds, disputes and reconciliation:** `HoldOpened`, `HoldClosed`, `DisputeOpened`, `DisputeResolved`, `ReconciliationMismatchDetected`, `ReconciliationExceptionResolved`.

`BothEscrowsFunded` is deliberately **not** an event: it is derivable from the two `EscrowFunded` events and a stored duplicate could disagree with them. Likewise `BankProcessing` and `BankVerified` are replaced by the leg-scoped `ReleaseSent` and `PayoutConfirmed`, removing the naming collision documented in ADR-001 §1.2.

Prohibited: wallet balance tables and internal customer cash ledgers.

# 8. Idempotency & Transaction Integrity

Every settlement request requires a globally unique Settlement ID, Match ID, **Leg ID**, Idempotency Key, and Bank Reference. Duplicate requests must return the previous result instead of creating another settlement.

**Leg ID is mandatory (ADR-001, defect D-13).** A settlement has two legs that emit the same event types. An idempotency or deduplication key of `(settlement_id, event_type)` cannot distinguish one leg's `transfer.completed` from the other's, and under at-least-once delivery will either swallow the second leg's confirmation as a duplicate or read one leg's redelivery as both legs funded. Both outcomes are paths to single-sided release.

Inbound webhook deduplication is keyed on **`(settlement_id, leg_id, event_type, provider_event_id)`**, enforced by a unique database constraint rather than application logic. A partner webhook that does not carry a resolvable `leg_id` must be rejected, never defaulted to a leg.

Outbound idempotency keys are **deterministically derived**, so that a retry after a crash computes the identical key and the partner deduplicates rather than executing twice:

`idempotency_key = sha256(settlement_id | leg_id | operation | release_authorized_at)`

**Release dispatch is a transactional outbox operation.** Release authorization — asserting both legs `FUNDED`, both beneficiaries validated, no blocking hold, and `release_authorized_at IS NULL` — commits the phase change, the `ReleaseAuthorized` event and both outbox rows in a single database transaction under `SELECT ... FOR UPDATE` on the settlement and both legs. Dispatch to partners then proceeds independently and at-least-once. A successful dispatch to one leg is never rolled back because the other failed; the failing leg retries against the same key, and after exhausting retries a `DISPATCH_FAILURE` hold opens without any change to financial state.

# 9. Dispute Resolution Framework

Disputes concern evidence rather than custody. Evidence automatically includes Settlement ID, Match ID, Bank Reference, KYC snapshot, device fingerprint, IP address, timestamp, exchange rate, and audit history.

SLA: Critical 4 hours, High 24 hours, Medium 72 hours, Low 5 business days.

# 10. Fraud & Risk Engine

Every user receives a dynamic 0–100 risk score. Signals include new device, VPN detection, failed KYC attempts, identity mismatch, rapid transaction spikes, sanctions screening, and blacklisted bank accounts. Configurable velocity controls automatically prevent abuse.

# 11. Daily Reconciliation Engine

Xspeeria reconciles Settlement ID, Leg ID, Amount, Currency, Beneficiary, State, and Timestamp against partner bank records daily.

**Reconciliation never rewrites financial state (ADR-001 §7.2).** Any mismatch creates a `ReconciliationException` record — including against `COMPLETED` settlements, which would otherwise require mutating an immutable record. Where the settlement is non-terminal, a `SettlementHold` of type `RECONCILIATION` opens alongside the exception and blocks phase progression while the financial state remains exactly where it was. Resolution closes the exception and the hold. Where money is genuinely wrong, the remedy is a new compensating settlement, never a state rewrite or a restoration of a prior state.

There is no `RECONCILIATION_REQUIRED` settlement state. The earlier formulation — which directed that a mismatch "places the transaction into RECONCILIATION_REQUIRED" — contradicted this document's own immutability rule for completed transactions, and restoring a prior state after investigation would have constituted an arbitrary-state-write capability. All phase transitions are forward-only.

# 12. AML & Compliance Controls

Automated monitoring detects structuring, unusual transaction frequency, high-risk corridors, sanctions exposure, multiple identities, and suspicious device activity. Compliance officers may pause matching, request enhanced KYC, escalate to banks, and suspend accounts.

# 13. Audit Trail Specification

Every sensitive action records Audit ID, User ID, Actor, Action, Previous Value, New Value, Device ID, IP Address, and Timestamp. Minimum retention period: 7 years, configurable by jurisdiction.

# 14. Database Constraints

Mandatory unique identifiers: User ID, Match ID, Settlement ID, **Leg ID**, Bank Reference, and Dispute ID. Customer balance tables are strictly prohibited in the Xspeeria database.

Per ADR-002, that prohibition is absolute and applies under every configuration: no customer wallet, customer balance, or customer cash-ledger table may exist. It does **not** prohibit Xspeeria's own append-only double-entry accounting ledger, which records only Xspeeria's own economic activity and never the customer principal held by partners.

Ledger tables are append-only. Application database roles have INSERT only — `UPDATE` and `DELETE` are revoked at the role level and additionally blocked by triggers. Historical financial records are never rewritten; corrections are explicit compensating entries. Tamper evidence uses per-entry content hashes and periodic signed checkpoint verification, **not** a globally serialized hash chain.

# 15. Claude Code Mandatory Engineering Rules

Never store customer balances, never allow frontend completion of transactions, never bypass bank webhooks, never release either leg of a settlement until both local escrow accounts are independently confirmed funded by their respective partner's webhook, never route any leg of a settlement across a border, and never edit completed records. Always use immutable event sourcing, idempotency validation, unique settlement identifiers, and complete audit logging.

Additional prohibitions (ADR-001 §5.2). Each is a hard invariant, not a runtime convention:

- Never authorize release unless **both** legs are `FUNDED` and **both** beneficiary accounts are validated.
- Never mark a settlement `COMPLETED` unless **both** legs are `PAID_OUT`.
- Never enter `UNWINDING` or `CLOSED_UNWOUND` while **any** leg is `PAID_OUT` — a partial payout must never be represented as a reversal.
- Never transition out of a leg's `PAID_OUT` state.
- Never enter any terminal phase while a leg is `FUNDED` and neither `PAID_OUT` nor `RETURNED`.
- Never apply a backward phase transition; there are none.
- Never write `release_authorized_at` twice.
- Never set a money fact from client input, or from an unverified, unsigned or replayed webhook.
- Never allow a partner to advance a leg it is not assigned to.
- Never `UPDATE` or `DELETE` a row in the append-only event store.
- Never reuse funds from a previous settlement when rematching; the escrow must be returned and confirmed `RETURNED` first.
- Never encode an assumption that Xspeeria bears a recovery loss.

Additional prohibitions (ADR-002 / DEC-004):

- Never treat a raw partner webhook as authoritative financial truth; it is evidence until accepted.
- Never allow a raw webhook to mutate financial state directly.
- Never silently discard valid but premature or out-of-order partner evidence — quarantine and re-evaluate it.
- Never promote impossible or contradictory partner evidence to an accepted event; retain it and raise the reconciliation workflow.
- Never post a real-book accounting entry against customer principal (`FUNDED`, `PAID_OUT`, `RETURNED`).
- Never introduce a customer wallet, balance, or cash-ledger table, in any book, under any configuration.
- Never create a memorandum account scoped to an individual customer.
- Never `UPDATE` or `DELETE` a ledger entry or line.
- Never post an unbalanced entry, and never balance across currencies without explicit FX treatment.
- Never make a network call inside the financial transaction.
- Never write an accepted event and its ledger posting as separate non-atomic writes.
- Never key ledger posting on `source_event_id` alone, and never include `posting_rule_version` in the uniqueness key.
- Never treat a projection as more authoritative than `settlement_events`.
- Never hard-code accounting treatment before Finance approval.

# 16. Success Criteria

A transaction is financially correct only when both users are KYC verified, fraud checks pass, matching follows Price-Time Priority, settlement and leg identifiers are generated, both beneficiary accounts are validated before release authorization, both legs reach `PAID_OUT` via signature-verified partner webhooks, immutable audit records exist, and reconciliation succeeds.

# 17. Defects Corrected by ADR-001

The following defects in the original text of this document were identified during the Phase 0 audit and corrected by ADR-001. They are recorded here so a reader who remembers the earlier version is not confused, and so the corrections are not silently lost.

| ID | Defect in original text | Correction |
|---|---|---|
| D-1 | No failure state, despite Section 6 mandating a Reverse Transfer adapter API | Leg-level `PAYOUT_FAILED` / `PROVISION_FAILED`; phase determined by outstanding exposure |
| D-2 | No reversal or refund state | `UNWINDING` → `CLOSED_UNWOUND`; asymmetric cases route to `RECOVERY_REQUIRED` |
| D-3 | Escrow return moved customer money with no state and no event | `RETURN_SENT`/`RETURNED` leg states; `EscrowReturnInitiated`/`EscrowReturned`/`EscrowReturnFailed` events |
| D-4 | Section 11 mandated mutating completed records that Sections 5 and 15 declare immutable | `ReconciliationException` entity; financial state never changes |
| D-5 | `DISPUTED` as a state contradicted this document's own immutability rule | `Dispute` entity + `DISPUTE` hold |
| D-6 | `ESCROW_A` / `ESCROW_B` were positional and undefined across corridors and directions | Semantic party roles `REQUESTER` / `ACCEPTER` plus immutable UUID `leg_id` |
| D-7 | `RECONCILIATION_REQUIRED` was mandated by Section 11 but absent from the Section 5 state list | Replaced by the exception entity; no such state exists |
| D-8 | No escrow-provisioning failure state | Leg-level `PROVISION_FAILED` |
| D-9 | Order-lifecycle states (`OPEN`, `MATCHED`) were mixed into the settlement state machine | Removed; these belong to the Match entity |
| D-10 | No release-command state; no record of the release decision itself | `release_authorized_at` set-once fact + transactional outbox + leg `RELEASE_SENT` |
| D-11 | No expiry state distinct from counterparty timeout | `FundingWindowExpired` event + closure reason |
| D-12 | `BothEscrowsFunded` duplicated a derivable fact and could disagree with it | Removed; derived from the two `EscrowFunded` events |
| D-13 | Idempotency keys lacked a leg identifier — a path to single-sided release above the state machine | `leg_id` mandatory in all keys; see Section 8 |

Two further defects were corrected in adjacent documents: the `verified` naming collision between this document and `07_Banking_Integration_Specification_v1.1.md` §4.3, and the inverted `PROCESSING` / `VERIFIED` ordering between the two. See ADR-001 §1.2.

# Appendix D Approval Statement

This specification is the authoritative engineering standard for all monetary workflows within Xspeeria, and remains so. Where its state representation conflicts with ADR-001, ADR-001 governs as a human-approved architecture decision (`DOCUMENT_INDEX.md` §1 rank 2). All financial principles in this document — non-custodial operation, domestic-only legs, dual-escrow release gating, event sourcing, prohibition of balance tables, idempotency, reconciliation and auditability — are unchanged.

Any implementation that contradicts this document or ADR-001 shall be considered non-compliant and must not be deployed to production.

**Subject to applicable licensing and regulatory approval.**
