<!-- SOURCE DOCUMENT: 07_Banking_Integration_Specification_v1.1.docx -->
<!-- Converted to Markdown for Claude/Claude Code repository use. -->
<!-- Source content is preserved; this conversion does not establish new business or technical authority. -->

**XSPEERIA**

Wallet-less Peer-to-Peer Fiat Currency Exchange

**DOCUMENT 07 OF 05 — BANK-INT**

**Banking Integration Specification**

*Provider-Agnostic Settlement Architecture, Webhook Contracts & Reconciliation*

|                  |                                                                                        |
|------------------|----------------------------------------------------------------------------------------|
| **Attribute**    | **Value**                                                                              |
| Document Version | v1.0 — Draft                                                                           |
| Document Owner   | Payments Lead (Internal) — external banking/risk advisor TBD, pending Legal engagement |
| Review Cycle     | Quarterly, and upon onboarding any new banking partner                                 |
| Classification   | Confidential — Banking Partner Distribution Copy                                       |
| Status           | Draft — Pre-Development Blueprint                                                      |
| Date             | August 2026                                                                            |

Version History

|             |          |               |                                                                                        |
|-------------|----------|---------------|----------------------------------------------------------------------------------------|
| **Version** | **Date** | **Author**    | **Summary of Changes**                                                                 |
| v0.1        | 2026-07  | Payments Lead | Initial draft aligned to ARCHITECTURE.md and SECURITY.md webhook-verification posture  |
| v1.0        | 2026-08  | Payments Lead | Full settlement lifecycle, webhook spec, reconciliation, and failure-scenario playbook |

Table of Contents

Executive Summary

This specification defines how Xspeeria integrates with banking and payment-rail partners to settle matched FX transactions, beginning with the NGN⇄GBP pilot corridor and extending to NGN⇄USD as the Year 2 corridor per the 5-Year Business Plan. It is deliberately provider-agnostic: it defines an internal Banking Abstraction Layer (BAL) and a contract that any compliant banking partner must satisfy, rather than naming or assuming behavior from a specific institution. This document names no banking licence, regulatory approval, or specific partner relationship as held or pending — those are business/legal facts outside this document’s authority and must be confirmed separately by Compliance and Legal.

> **ASSUMPTION:** *No source document specifies an actual banking partner, licence, or settlement rail. Every mechanism below (webhook contract, reconciliation cadence, SLA figures) is a reference architecture consistent with ARCHITECTURE.md’s module list (Settlement) and SECURITY.md’s webhook-verification requirement, intended to be the specification a real banking partner integration is built against once one is contracted.*

1\. Settlement Philosophy

Xspeeria is wallet-less: the platform never custodies user funds between the two legs of an exchange. Settlement is domestic-only on both legs: coordinated and verified by Xspeeria, but each leg is executed by a licensed local partner within its own country, never as a single cross-border transfer between the two matched parties' accounts. Each corridor uses two independently held, country-local escrow accounts — one per currency, held by the licensed partner in that jurisdiction. Both parties fund their own local escrow account via a domestic transfer; once both escrows independently confirm funded status, each partner releases funds domestically to the beneficiary designated by the other party. No currency crosses either border at any point. This has two direct architectural consequences:

- Xspeeria's Settlement service is a state machine and verification layer, not a ledger of custodied balances — the escrow accounts themselves are held and controlled by the licensed partner in each jurisdiction, not by Xspeeria.

- Every settlement requires two independent legs to reach `PAID_OUT`, each confirmed by a signature-verified webhook from that leg's own partner, before the settlement may be marked `COMPLETED`. No single custodial account nets them internally, and each leg's escrow account only ever holds funds sourced from and released to parties within its own country.

- Per ADR-001, the two legs are identified by semantic party role (`REQUESTER`, `ACCEPTER`) and an immutable UUID `leg_id`, not by currency and not by ordinal position. Currency and jurisdiction are attributes of a leg, so the state machine is corridor-agnostic and direction-agnostic.

- `FUNDED` is reversible; `PAID_OUT` is not. Once a partner has paid a beneficiary domestically, Xspeeria — holding no funds and having no cross-border reach — cannot claw it back. Any outcome in which one leg is `PAID_OUT` and the other has permanently failed is an unresolved exposure, is recorded as `RECOVERY_REQUIRED`, and may never be represented as a completed settlement or as a clean reversal.

2\. Banking Abstraction Layer

The Banking Abstraction Layer (BAL) is an internal service boundary that isolates the Settlement service (Document 05) from any single partner’s API shape. Adding a new banking partner means implementing the BAL interface, not modifying Settlement business logic.

***Figure: Banking Abstraction Layer architecture***

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p>```mermaid</p>
<p>graph TB</p>
<p>SETTLE[Settlement Service]</p>
<p>BAL[Banking Abstraction Layer]</p>
<p>ADAPTER1[Partner Adapter A]</p>
<p>ADAPTER2[Partner Adapter B]</p>
<p>WEBHOOK[Webhook Ingress Handler]</p>
<p>QUEUE[(Celery / Redis)]</p>
<p>SETTLE --&gt; BAL</p>
<p>BAL --&gt; ADAPTER1</p>
<p>BAL --&gt; ADAPTER2</p>
<p>ADAPTER1 -.webhook.-&gt; WEBHOOK</p>
<p>ADAPTER2 -.webhook.-&gt; WEBHOOK</p>
<p>WEBHOOK --&gt; QUEUE</p>
<p>QUEUE --&gt; SETTLE</p>
<p>```</p></td>
</tr>
</tbody>
</table>

The BAL exposes four provider-agnostic operations that every adapter must implement: initiateTransfer, verifyAccount, checkTransferStatus, and validateWebhookSignature. No calling code above the BAL is aware of provider-specific request/response shapes.

3\. Partner Interface Contracts

3.1 Bank Transfer (Outbound Initiation)

|                         |                   |              |                                                                                               |
|-------------------------|-------------------|--------------|-----------------------------------------------------------------------------------------------|
| **Field**               | **Type**          | **Required** | **Description**                                                                               |
| source_account_ref      | string            | Yes          | Tokenized reference to the sending party’s validated bank account, never a raw account number |
| destination_account_ref | string            | Yes          | Tokenized reference to the receiving party’s validated bank account                           |
| amount                  | string (Decimal)  | Yes          | Transfer amount, serialized as a string per Document 05 monetary conventions                  |
| currency                | string (ISO 4217) | Yes          | NGN or USD at launch                                                                          |
| settlement_id           | UUID              | Yes          | Xspeeria-internal correlation identifier, echoed back on every webhook                        |
| narration               | string            | No           | Human-readable transfer memo, capped to partner’s field-length limit                          |

3.2 Payment Verification

After a transfer is initiated, the BAL polls checkTransferStatus as a fallback and primarily relies on the partner’s webhook (Section 5) as the source of truth, since polling alone is insufficient for timely settlement-state updates at the volumes this platform targets.

3.3 Account Validation

Before a user’s bank account can be used as a settlement destination, it is validated via the partner’s account-name-inquiry capability: Xspeeria submits an account number and bank code, and the partner returns the account holder’s registered name for the user to confirm matches their KYC-verified legal name (Document 05, KYCCases.legal_name) before the account is saved.

3.4 Webhook Interface

See Section 5 for the full webhook contract. At the interface-contract level, every partner adapter must be capable of receiving and acknowledging webhook callbacks for at minimum: transfer.completed, transfer.failed, and transfer.reversed events.

4\. Settlement Lifecycle

4.1 NGN → USD Corridor

***Figure: NGN to USD settlement sequence***

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p>```mermaid</p>
<p>sequenceDiagram</p>
<p>participant NGNParty as NGN-paying Party</p>
<p>participant App as Xspeeria App</p>
<p>participant Settle as Settlement Service</p>
<p>participant BAL as Banking Abstraction Layer</p>
<p>participant Bank as Banking Partner</p>
<p>participant USDParty as USD-paying Party</p>
<p>App-&gt;&gt;Settle: Match confirmed (Document 05)</p>
<p>Settle-&gt;&gt;Settle: phase = INITIALIZING</p>
<p>Bank-&gt;&gt;BAL: escrow provisioned (both legs)</p>
<p>Settle-&gt;&gt;Settle: phase = AWAITING_FUNDING</p>
<p>Settle--&gt;&gt;NGNParty: Instructions: fund local escrow (leg REQUESTER)</p>
<p>Settle--&gt;&gt;USDParty: Instructions: fund local escrow (leg ACCEPTER)</p>
<p>Bank-&gt;&gt;BAL: webhook escrow.funded (leg_id = REQUESTER)</p>
<p>BAL-&gt;&gt;Settle: leg REQUESTER = FUNDED (release still blocked)</p>
<p>Bank-&gt;&gt;BAL: webhook escrow.funded (leg_id = ACCEPTER)</p>
<p>BAL-&gt;&gt;Settle: leg ACCEPTER = FUNDED</p>
<p>Settle-&gt;&gt;Settle: assert both FUNDED + beneficiaries validated</p>
<p>Settle-&gt;&gt;Settle: release_authorized_at set; phase = RELEASING; outbox x2</p>
<p>BAL-&gt;&gt;Bank: release (leg REQUESTER, idempotency key)</p>
<p>BAL-&gt;&gt;Bank: release (leg ACCEPTER, idempotency key)</p>
<p>Bank-&gt;&gt;BAL: webhook transfer.completed (leg_id = REQUESTER)</p>
<p>Bank-&gt;&gt;BAL: webhook transfer.completed (leg_id = ACCEPTER)</p>
<p>BAL-&gt;&gt;Settle: both legs PAID_OUT</p>
<p>Settle-&gt;&gt;Settle: phase = COMPLETED</p>
<p>Settle--&gt;&gt;NGNParty: Settlement complete notification</p>
<p>Settle--&gt;&gt;USDParty: Settlement complete notification</p>
<p>```</p></td>
</tr>
</tbody>
</table>

4.2 GBP → NGN Corridor (Pilot; NGN⇄USD follows the identical pattern from Year 2)

The GBP→NGN direction follows the identical sequence with the two legs' currencies, escrow accounts, and domestic release destinations inverted; the state machine itself is currency-direction-agnostic by design, which is what allows NGN⇄USD to be added in Year 2 without redesign. In both directions, release from either escrow account is gated on both escrow accounts reporting funded status — a single-sided funding event never triggers a release.

4.3 Partner-Facing State Vocabulary and BAL Mapping

> **RECONCILED — ADR-001 (DEC-003), 2026-08-18.** The values below are the **partner-facing vocabulary only**. They are not Xspeeria settlement states. Xspeeria's canonical internal model is defined in `docs/adr/001-transaction-state-machine.md` and `Appendix_D` Section 5.1: a 9-state `SettlementLeg` model authoritative for per-leg financial facts, and a 10-phase forward-only `Settlement.phase` model for workflow decisions. The BAL translates between the two; no calling code above the BAL is aware of partner vocabulary.

**Two hazards in the earlier version of this section, corrected here:**

1. **`verified` name collision.** This document previously used `verified` to mean *"partner has confirmed receipt of both legs"* — money **in**, before release — while `Appendix_D` used `VERIFIED` to mean bank-verified payout, money **out**. A developer mapping naively between the two would release funds at the moment escrows fund. Xspeeria's canonical vocabulary no longer contains `VERIFIED` at all; the payout fact is the leg state `PAID_OUT`.
2. **Inverted ordering.** This document previously ordered `verified → processing → completed` while `Appendix_D` Section 3 ordered `Bank Processing → Bank Verified → Completed`. The canonical leg sequence is `FUNDED → RELEASE_SENT → PAID_OUT`.

**Mapping table (implemented as tested code at the BAL boundary, not as prose):**

|                              |                                          |                                                                             |
|------------------------------|------------------------------------------|-----------------------------------------------------------------------------|
| **Partner value**            | **Canonical (leg-scoped)**               | **Notes**                                                                   |
| initiated                    | `ESCROW_PROVISIONED`                     | Escrow account exists for this leg                                          |
| funds_pending_verification   | `FUNDED` — **for that leg only**         | **Lossy: resolvable only by `leg_id`.** Never applies to both legs at once |
| verified                     | `FUNDED` — **not** a payout confirmation | Collision hazard 1 above                                                    |
| processing                   | `RELEASE_SENT`                           | Partner acknowledged the release command                                    |
| completed                    | `PAID_OUT`                               | Irreversible; beneficiary has the funds                                     |
| failed                       | `PAYOUT_FAILED` or `PROVISION_FAILED`    | Resolved by the leg's current state                                         |
| reversed                     | `RETURNED`                               | Escrow returned to the funding party                                        |

**A webhook that does not carry a resolvable `leg_id` must be rejected, never defaulted to a leg.** Because a settlement has two legs emitting identical event types, an unresolvable leg identity makes single-sided release reachable regardless of how correct the state machine is.

**Aggregate phase is never set by a partner.** Partners report leg facts; Xspeeria derives and decides. In particular, no partner event may directly cause `COMPLETED` — that phase requires both legs `PAID_OUT`, which is Xspeeria's determination.

5\. Webhook Specification

5.1 Required Headers

|                      |                                                                             |
|----------------------|-----------------------------------------------------------------------------|
| **Header**           | **Description**                                                             |
| X-Xspeeria-Signature | HMAC-SHA256 signature of the raw request body, hex-encoded                  |
| X-Xspeeria-Timestamp | Unix timestamp (seconds) at which the partner sent the webhook              |
| X-Xspeeria-Event-Id  | Partner-generated unique event identifier, used for replay-protection dedup |
| Content-Type         | application/json                                                            |

5.1.1 Evidence Versus Accepted Truth (ADR-002 / DEC-004)

A partner webhook is **evidence, not automatically authoritative financial truth**. Every message received — valid, invalid, forged, duplicate or contradictory — is persisted append-only to `webhook_receipts` with an explicit verdict. That store carries **no financial authority** and a raw webhook never mutates financial state.

A message becomes an accepted `settlement_event` only after all of: authentication (§5.2), replay and idempotency checks (§5.3, §5.5), schema validation, settlement and leg correlation, transition validation, and financial invariant validation against ADR-001.

Evidence classification:

|                             |                                                                                                                  |                               |
|-----------------------------|------------------------------------------------------------------------------------------------------------------|-------------------------------|
| **Class**                   | **Handling**                                                                                                     | **Becomes an accepted event?** |
| Duplicate                   | Absorbed by §5.3/§5.5. Acknowledged 200, not reprocessed. Receipt retained.                                       | No — already is one           |
| Replay suspected            | Rejected. Receipt retained as security evidence. Alert raised.                                                    | No                            |
| Valid, delayed              | Accepted normally. Carries the partner timestamp and the acceptance timestamp; lateness never reorders the ledger. | Yes                           |
| Valid, prerequisite missing | **Quarantined and re-evaluated on every subsequent acceptance for that settlement. Never silently discarded.** Promoted when the prerequisite arrives; ages out to a reconciliation exception. | Yes — deferred |
| Impossible / contradictory  | Retained as evidence. **Never promoted.** Reconciliation exception plus a blocking hold; human adjudication. Resolution is a new authorized event, never an overwrite. | No |

**Processing is two-stage.** Stage 1 authenticates, deduplicates, persists the receipt and returns 200 within the §5.4 window, creating **no financial state**. Stage 2 is an asynchronous worker that validates the evidence and performs **one local atomic database transaction** writing the accepted event, both ADR-001 projections, the accounting ledger entries and lines, audit records and outbox rows. **No network call occurs inside that transaction**; outbound partner calls are dispatched from the outbox after commit with deterministic idempotency keys.

5.2 HMAC Signature Verification

The BAL computes HMAC-SHA256 over the exact raw request body bytes using a per-partner shared secret (stored in AWS Secrets Manager per Document 06, Section 5.3) and performs a constant-time comparison against X-Xspeeria-Signature. Any mismatch results in an immediate 401 response and the payload is discarded without processing, consistent with SECURITY.md’s webhook-verification requirement.

5.3 Replay Protection

Two independent controls: (1) X-Xspeeria-Timestamp must be within 5 minutes of server-received time, rejecting stale replays; (2) X-Xspeeria-Event-Id is checked against a 30-day Redis set of previously-processed event IDs — a duplicate ID is acknowledged with 200 but not reprocessed, protecting against both malicious replay and benign partner-side redelivery.

5.4 Retry Policy

Xspeeria’s webhook endpoint always returns within 2 seconds by immediately enqueueing the verified payload to Celery (Document 05, Section 6) and returning 200 — processing happens asynchronously so a slow downstream step never causes the partner to time out and retry unnecessarily. If Xspeeria’s endpoint is unreachable, the partner’s own retry policy governs; the BAL is designed to be idempotent against any redelivery schedule a partner may use.

5.5 Idempotency

Every webhook-triggered state transition is keyed on **(settlement_id, leg_id, event_type, provider_event_id)** and is a no-op if that transition has already been applied, making the entire ingestion path safe under at-least-once delivery semantics. The key is enforced by a unique database constraint, not by application logic.

> **CORRECTED — ADR-001 (DEC-003), defect D-13.** This section previously keyed deduplication on `(settlement_id, event_type)`. A settlement has two legs that emit identical event types, so that key cannot distinguish one leg's `transfer.completed` from the other's. Under at-least-once delivery it would either swallow the second leg's confirmation as a duplicate — leaving a funded leg unrecorded — or treat one leg's redelivery as evidence that both legs had funded. Both outcomes are paths to single-sided release that survive an otherwise correct state machine, because deduplication sits above it. `leg_id` is mandatory.

**Outbound idempotency keys are deterministically derived** so that a retry after a crash computes the identical key and the partner deduplicates rather than executing a second transfer:

`idempotency_key = sha256(settlement_id | leg_id | operation | release_authorized_at)`

**Release dispatch uses a transactional outbox.** Release authorization commits the phase change, the `ReleaseAuthorized` event and both outbox rows in a single database transaction. Dispatch to each partner then proceeds independently and at-least-once. A successful dispatch to one leg is never rolled back because the other failed — it cannot be, since the command has already reached that partner. The failing leg retries against the same key; after exhausting retries a `DISPATCH_FAILURE` hold opens and alerts operations, with no change to financial state. Xspeeria never persists "both commands were dispatched" as a fact, because it is not one: only per-leg partner acknowledgement (`RELEASE_SENT`) is verifiable, and it arrives asynchronously.

6\. Reconciliation

6.1 Daily Reconciliation

A scheduled Celery Beat job (Document 06, Section 6) runs nightly. Per ADR-002 this is a **four-way** comparison, not a two-way one:

|                                      |                                                                          |
|--------------------------------------|--------------------------------------------------------------------------|
| **Check**                            | **Detects**                                                              |
| Partner report ↔ accepted events     | Missing, extra or amount-mismatched partner activity                     |
| Accepted events ↔ state projections  | Projection drift — a defect, not a money problem                         |
| Accepted events ↔ accounting ledger  | Missing or duplicated postings                                           |
| Ledger internal                      | Per-currency balance of every entry; suspense-account ageing             |

Any settlement present in one system and not the other is flagged into an exceptions queue for manual review before the books are considered closed for that day. **A reconciliation mismatch never silently rewrites historical financial facts** — it creates a `ReconciliationException`, opens a `RECONCILIATION` hold where the settlement is non-terminal, and parks the amount in a suspense account until cleared. Clearing is an explicit compensating entry posted from an authorized resolution event. Suspense ageing thresholds are **P-10 TBD — Finance / Compliance**.

6.2 Weekly Reconciliation

A rollup reconciliation aggregates the seven daily reconciliations into a weekly settlement report, cross-checked against aggregate volume figures for the Business Dashboard (Document 04, Section 5.4) and used as the basis for any partner-facing settlement report (Section 6.4).

6.3 Exception Handling

|                                                    |                                                                                                                                         |
|----------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------|
| **Exception Type**                                 | **Handling**                                                                                                                            |
| Settlement in Xspeeria, absent from partner report | Escalate to partner support channel same-day; hold settlement in verified-pending state, do not mark completed on Xspeeria’s side alone |
| Settlement in partner report, absent from Xspeeria | Investigate for a missed/failed webhook; manually trigger BAL status re-check before any manual ledger correction                       |
| Amount mismatch between systems                    | Immediate freeze of the affected settlement, routed to the Dispute flow (Document 05, Section 3.8) pending manual investigation         |

6.4 Settlement Reports

A partner-facing settlement report is produced weekly (and available on-demand) summarizing total volume, transaction count, and exception count per currency leg — the artifact both parties reconcile against for any billing or dispute conversation.

7\. Failure Scenarios

Timeout

|                    |                                                                                                                                                        |
|--------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Aspect**         | **Specification**                                                                                                                                      |
| Detection          | checkTransferStatus poll or expected webhook does not arrive within the partner’s stated SLA window (Section 8)                                        |
| Recovery           | Escalate to partner support; the leg remains in its last verified state and the settlement phase does not advance — never falsely advanced, never falsely failed |
| User Communication | Settlement Tracking screen (Document 04) shows an extended-processing state with an explicit "this is taking longer than usual" message, never silence |
| Audit Logging      | Full timeline entry logged to AuditLog (Document 05) with the exact SLA breach duration                                                                |

Duplicate Webhook

|                    |                                                                                                                   |
|--------------------|-------------------------------------------------------------------------------------------------------------------|
| **Aspect**         | **Specification**                                                                                                 |
| Detection          | Same X-Xspeeria-Event-Id received more than once                                                                  |
| Recovery           | Deduplicated automatically per Section 5.3; second and subsequent deliveries are acknowledged but not reprocessed |
| User Communication | No user-visible effect — this is fully absorbed by the idempotency layer                                          |
| Audit Logging      | Duplicate delivery logged at debug level for observability, not treated as an incident                            |

Partial Settlement

|                    |                                                                                                                                                                                               |
|--------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Aspect**         | **Specification**                                                                                                                                                                             |
| Detection          | One leg reaches `FUNDED` or `PAID_OUT` while the other fails or times out                                                                                                                     |
| Recovery           | **Before release:** one leg `FUNDED`, the other not — release is structurally unreachable (both legs must be `FUNDED`), so no funds move. On window expiry the funded escrow is returned and the settlement unwinds to `CLOSED_UNWOUND`. **After release:** one leg `PAID_OUT` and the other permanently `PAYOUT_FAILED` is an unresolved exposure — the settlement enters `RECOVERY_REQUIRED`, which is non-terminal, carries an explicit outstanding exposure amount, and closes only by authorized human action. It may never be represented as `COMPLETED` or as a reversal. Beneficiary pre-validation (Section 3.3) before release authorization removes the dominant cause of permanent payout failure |
| User Communication | Both parties notified of the specific leg still pending, with a clear "we are holding your confirmed leg safely" message consistent with the wallet-less, no-custody design principle         |
| Audit Logging      | Both leg statuses individually logged with timestamps for full auditability                                                                                                                   |

Failed Payout

|                    |                                                                                                                                            |
|--------------------|--------------------------------------------------------------------------------------------------------------------------------------------|
| **Aspect**         | **Specification**                                                                                                                          |
| Detection          | Banking partner reports a definitive transfer.failed for a leg (e.g., invalid destination account)                                         |
| Recovery           | The leg transitions to `PAYOUT_FAILED`; the escrow still holds the funds. The receiving party is prompted to re-verify their destination account details (Section 3.3), after which the leg may retry to `RELEASE_SENT`. `PAYOUT_FAILED` is retryable and is **not** a terminal settlement outcome — the settlement phase depends on whether the other leg has already reached `PAID_OUT` (see Partial Settlement above) |
| User Communication | Immediate, specific notification naming the failure reason in plain language, plus a clear retry action                                    |
| Audit Logging      | Failure reason and partner’s raw error code logged verbatim to AuditLog for support/partner escalation                                     |

Bank Downtime

|                    |                                                                                                                                                                   |
|--------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Aspect**         | **Specification**                                                                                                                                                 |
| Detection          | Partner reports a maintenance window or Xspeeria detects elevated timeout/error rates from a partner adapter                                                      |
| Recovery           | BAL circuit-breaker marks the affected adapter unhealthy; new settlements requiring that partner are queued rather than attempted against a known-down dependency |
| User Communication | Marketplace/Settlement screens display a scoped service-status banner if a specific corridor leg is affected, rather than a generic app-wide error                |
| Audit Logging      | Circuit-breaker state transitions logged; feeds the P2/P1 alerting policy in Document 06, Section 6.3                                                             |

8\. Banking SLA

> **ASSUMPTION:** *The following SLA figures are illustrative reference targets for evaluating and contracting a real banking partner — they are not commitments made by, or confirmed with, any actual partner, and must be replaced with the executed partner agreement’s real terms once one exists.*

|                                             |                                           |                        |
|---------------------------------------------|-------------------------------------------|------------------------|
| **Metric**                                  | **Target**                                | **Measurement Window** |
| Webhook delivery latency (partner-side)     | Under 60 seconds from transfer completion | Rolling 30-day         |
| Account name-inquiry response time          | Under 5 seconds                           | Per-request            |
| Transfer completion time (NGN domestic leg) | Under 15 minutes for 95% of transfers     | Rolling 30-day         |
| Transfer completion time (USD domestic leg) | Under 4 hours for 95% of transfers        | Rolling 30-day         |
| Partner API availability                    | 99.9% monthly uptime                      | Monthly                |
| Partner support response (P1 incident)      | Under 30 minutes                          | Per-incident           |
| Reconciliation report availability          | By 06:00 UTC daily for prior-day activity | Daily                  |

Appendix A: Regulatory Posture Disclaimer

This document intentionally does not name, describe, or imply possession of any money-transmission licence, forex-trading authorization, or banking-partner agreement. Although no leg of a settlement physically crosses the border under this specification's escrow-and-release model (applicable to the NGN⇄GBP pilot corridor and, from Year 2, NGN⇄USD), the coordinated two-leg outcome produces the same economic effect as a cross-border transfer, and is expected to be treated as such by regulators in both Nigeria and the United States — this specification's domestic-only fund flow reduces where custody sits (with the local licensed partner in each jurisdiction, not with Xspeeria) but does not, by itself, remove Xspeeria's own likely need for money-transmission-equivalent registration as the orchestrating party. The licensing, partner-selection, and compliance-approval work required to legally operate this corridor — for both Xspeeria and its escrow-holding partners — is outside this document's scope and must be completed by Legal and Compliance functions independently, with this specification serving only as the technical integration blueprint once licensed partners and a legal structure are in place.
