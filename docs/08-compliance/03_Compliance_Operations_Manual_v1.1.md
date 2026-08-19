<!-- SOURCE DOCUMENT: 03_Compliance_Operations_Manual_v1.1.docx -->
<!-- Converted to Markdown for Claude/Claude Code repository use. -->
<!-- Source content is preserved; this conversion does not establish new business or technical authority. -->

# Table of Contents

# XSPEERIA

## Compliance & Operations Manual (COM)

**Document Classification:** Confidential — Compliance, Risk, Operations, Regulatory Distribution **Version:** 1.0 (Draft for Compliance & Operations Review) **Audience:** Compliance, Operations, Support, Risk, Management, Banking Partners, Regulators **Companion Documents:** Business Requirements Specification (BRS), Technical Design Specification (TDS)

## Document Control

| Field           | Value                                                                   |
|-----------------|-------------------------------------------------------------------------|
| Document Owner  | Risk & Compliance                                                       |
| Review Cycle    | Quarterly, or immediately upon regulatory or partner requirement change |
| Status          | Draft — Pre-Development / Pre-Licensing Review                          |
| Launch Corridor | NGN ⇄ GBP (pilot); NGN ⇄ USD Year 2                                     |
| Distribution    | Compliance, Operations, Support, Risk, Management                       |

**\[ASSUMPTION-COM-00\]** This manual describes a compliance and operations *program design* intended to satisfy typical banking-partner due diligence and applicable regulatory expectations for a peer-to-peer fiat exchange facilitator. It does not assert that any specific license, registration, or regulatory approval has been obtained. All thresholds, SLAs, and procedures below must be reviewed and formally approved by qualified legal counsel and the compliance leadership team, and validated against the specific licensing arrangement Xspeeria ultimately operates under, before go-live.

# TABLE OF CONTENTS

1.  Executive Overview
2.  Governance Model
3.  AML Policy
4.  KYC Operations
5.  NDPR / Data Protection
6.  Transaction Monitoring
7.  Dispute Operations
8.  Customer Support SOP
9.  Incident Response Plan
10. Business Continuity
11. Operational Runbooks
12. Audit Procedures
13. Compliance Checklists
14. Internal Controls
15. Appendix

# 1. EXECUTIVE OVERVIEW

## 1.1 Purpose

This Compliance & Operations Manual (COM) defines the policies, procedures, and controls required to operate Xspeeria safely, lawfully, and in a manner acceptable to licensed banking and payment partners and applicable regulators. It is the operational counterpart to the Business Requirements Specification (business rationale) and Technical Design Specification (technical implementation).

## 1.2 Regulatory Posture

Xspeeria operates as a wallet-less peer-to-peer fiat exchange facilitator. It does not hold customer funds in custody at any point; settlement is executed domestically on each side of the corridor through two independently held, country-local escrow accounts (NGN⇄GBP as the Year 1 pilot corridor, with NGN⇄USD added as the Year 2 corridor per the 5-Year Business Plan), each controlled by the licensed banking or payment partner in that jurisdiction — no leg of a settlement physically crosses the border, and Xspeeria itself never receives, holds, or controls either currency. This posture is a foundational design decision (see TDS ADR-003) intended to reduce — but not eliminate — the regulatory burden associated with money transmission activity: it shifts the custodial licensing burden onto the local escrow-holding partners, who must already be licensed to hold client funds in their own jurisdiction, but it does not, by itself, remove Xspeeria's own likely need for registration as a money-services business or equivalent for orchestrating a transaction whose coordinated economic effect is a cross-border transfer, even though no funds physically cross the border. It does not, by itself, exempt Xspeeria from AML/KYC, data protection, or consumer protection obligations, all of which are addressed in this manual.

## 1.3 Roles Referenced Throughout This Manual

| Role                          | Function                                                                           |
|-------------------------------|------------------------------------------------------------------------------------|
| Compliance Officer            | Owns AML/KYC policy execution, sanctions screening decisions, regulatory reporting |
| Risk Officer                  | Owns risk rating methodology, transaction monitoring rule tuning                   |
| Operations (Ops) Admin        | Owns transaction/settlement operational intervention, runbook execution            |
| Support Agent                 | Front-line customer support, ticket triage, first-level dispute intake             |
| Data Protection Officer (DPO) | Owns NDPR compliance, data subject request handling                                |
| Incident Commander            | Coordinates response during active security/operational incidents                  |

# 2. GOVERNANCE MODEL

## 2.1 Governance Structure

    flowchart TB
        Board["Board of Directors"] --> ExecCommittee["Executive Committee"]
        ExecCommittee --> RiskCommittee["Risk & Compliance Committee"]
        ExecCommittee --> OpsLead["Head of Operations"]
        ExecCommittee --> EngLead["Head of Engineering"]
        RiskCommittee --> ComplianceOfficer["Compliance Officer"]
        RiskCommittee --> DPO["Data Protection Officer"]
        OpsLead --> OpsTeam["Operations Team"]
        OpsLead --> SupportTeam["Support Team"]
        ComplianceOfficer --> KYCReviewers["KYC Review Team"]
        ComplianceOfficer --> TxnMonitoring["Transaction Monitoring Team"]

## 2.2 Committee Responsibilities

| Body                        | Responsibility                                                                                   | Meeting Cadence                       |
|-----------------------------|--------------------------------------------------------------------------------------------------|---------------------------------------|
| Risk & Compliance Committee | Approves AML policy changes, reviews sanctions hits escalations, reviews risk rating methodology | Monthly, or ad hoc on material issues |
| Executive Committee         | Approves this manual and material amendments, owns regulatory relationship strategy              | Quarterly                             |
| Board                       | Ultimate oversight, approves banking partner relationships and licensing strategy                | Quarterly                             |

## 2.3 Policy Ownership & Change Control

- All policies in this manual require Compliance Officer sign-off before amendment.
- Material changes (AML thresholds, KYC tiering, incident severity matrix) require Risk & Compliance Committee approval.
- All changes are version-controlled with an effective date and rationale logged in the Decision Log (Section 15.3).

# 3. AML POLICY

## 3.1 Customer Risk Rating

| Risk Tier | Criteria (Illustrative)                                                                                                       | Implication                                                                                                    |
|-----------|-------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------|
| Low       | Individual user, standard transaction sizes, clean screening, verified device/location consistency                            | Standard CDD; standard transaction limits                                                                      |
| Medium    | Elevated transaction frequency/size, minor screening ambiguity, new-to-corridor pattern                                       | Enhanced monitoring; may require periodic re-verification                                                      |
| High      | PEP association, sanctions-adjacent screening result, business/EDD accounts by default, high-value or high-frequency activity | Enhanced Due Diligence (EDD) mandatory; senior compliance sign-off required for onboarding and periodic review |

**\[ASSUMPTION-COM-01\]** Specific numeric thresholds separating tiers (transaction size/frequency cutoffs) must be defined jointly by Compliance and Risk leadership, informed by applicable regulatory guidance in both the Nigerian and US jurisdictions, before go-live. This document establishes the tiering *methodology*, not final numeric cutoffs.

## 3.2 Customer Due Diligence (CDD)

**Applies to:** All users (Low and Medium risk tiers by default).

**Standard CDD Requirements:** - Government-issued photo ID verification - Liveness/biometric check matching the ID - Verified phone number and email - Address information (self-declared, may be supplemented by document evidence)

## 3.3 Enhanced Due Diligence (EDD)

**Applies to:** High-risk-tier users, all business accounts (SME, Importer, Exporter personas), PEP-flagged individuals.

**Enhanced Requirements (in addition to CDD):** - Business registration documents (for business accounts) - Ultimate Beneficial Owner (UBO) identification for entities above a defined ownership threshold - Source of funds / source of wealth declaration - Senior compliance officer review and sign-off before approval - Shortened periodic re-verification cycle relative to standard CDD

## 3.4 Sanctions Screening

- Every KYC submission is screened against applicable sanctions and watchlists at onboarding.
- Screening is re-run periodically (not just at onboarding) and upon material profile changes (e.g., updated beneficiary details for business accounts).
- Any positive or ambiguous hit routes to mandatory manual review by a Compliance Officer — no automated approval path exists for any flagged screening result (see TDS Section 5.3.2 invariant).

## 3.5 Politically Exposed Persons (PEP)

- PEP status (self-declared and screening-derived) automatically assigns High risk tier and triggers EDD.
- PEP accounts require senior compliance sign-off at onboarding and at each periodic review.
- Family members and known close associates of PEPs are subject to the same elevated scrutiny per standard AML practice.

## 3.6 Ongoing Monitoring

- Risk ratings are not static — they are re-evaluated based on transaction behavior (see Section 6) and periodic re-screening.
- A change in behavior inconsistent with the user’s declared profile (e.g., sudden volume increase) triggers a risk-tier review, not an automatic restriction.

# 4. KYC OPERATIONS

## 4.1 Verification Workflow

    flowchart TD
        Submit["User submits ID + liveness selfie"] --> AutoCheck["Automated document authenticity + biometric match"]
        AutoCheck --> Screening["Sanctions/PEP screening"]
        Screening --> RiskAssign["Risk tier assignment"]
        RiskAssign --> Route{"Auto-approvable?"}
        Route -- Yes --> Approved["Approved — user notified"]
        Route -- No --> ManualQueue["Routed to manual review queue"]
        ManualQueue --> Reviewer["KYC Reviewer examines case"]
        Reviewer --> ReviewerDecision{"Decision"}
        ReviewerDecision -- Approve --> Approved
        ReviewerDecision -- Reject --> Rejected["Rejected — user notified with reason"]
        ReviewerDecision -- Escalate --> SeniorReview["Senior Compliance Officer review (EDD/PEP/sanctions-adjacent cases)"]
        SeniorReview --> Approved
        SeniorReview --> Rejected

## 4.2 Manual Review

- Manual review queue is prioritized by risk tier and submission age (oldest-first within tier, high-risk tier prioritized).
- Every manual review decision must include a documented rationale, stored against the KYC case record (feeds Audit Procedures, Section 12).
- Reviewers may not approve their own previously-rejected case on resubmission without a second reviewer’s concurrence (four-eyes principle for reversal decisions).

## 4.3 Document Handling

| Rule                | Detail                                                                                                                                               |
|---------------------|------------------------------------------------------------------------------------------------------------------------------------------------------|
| Storage             | Encrypted at rest; access via short-lived signed URLs only (see TDS Section 11.3)                                                                    |
| Retention           | Per Data Protection policy (Section 5) and applicable regulatory minimum retention requirements                                                      |
| Access logging      | Every access to a KYC document is itself logged, including by compliance staff                                                                       |
| Prohibited handling | KYC documents must never be transmitted via unencrypted email, shared drives outside the approved system, or included in support tickets/screenshots |

## 4.4 Liveness Verification

- Liveness check is mandatory for all onboarding flows; static photo submissions are rejected automatically.
- Liveness failures route to manual review rather than automatic rejection, to accommodate legitimate edge cases (e.g., lighting, connectivity issues).

## 4.5 Approval Matrix

| Case Type                               | Approval Authority                       |
|-----------------------------------------|------------------------------------------|
| Standard CDD, low risk, clean screening | Automated system approval                |
| Medium risk, minor ambiguity            | KYC Reviewer                             |
| High risk, EDD required                 | KYC Reviewer + Senior Compliance Officer |
| PEP or sanctions-adjacent hit           | Senior Compliance Officer (mandatory)    |
| Reversal of a prior rejection           | Second Reviewer concurrence required     |

# 5. NDPR / DATA PROTECTION

## 5.1 Data Lifecycle

    flowchart LR
        Collect["Collection\n(at registration/KYC)"] --> Use["Use\n(verification, matching, settlement)"]
        Use --> Store["Storage\n(encrypted, access-controlled)"]
        Store --> Retain["Retention\n(per policy period)"]
        Retain --> Delete["Deletion / Anonymization\n(at retention expiry or valid request)"]

## 5.2 Consent

- Consent for data processing is captured explicitly at registration, with clear, plain-language disclosure of what is collected and why (aligned with Nigeria Data Protection Regulation (NDPR) principles).
- Consent is granular where feasible (e.g., marketing communications consent separate from core service data processing, which is necessary for contract performance and not separately optional).

## 5.3 Retention

| Data Category                       | Illustrative Retention Approach                                                                                                       |
|-------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------|
| KYC documents and screening results | Retained per applicable AML record-keeping requirements in relevant jurisdictions (minimum period to be confirmed with legal counsel) |
| Transaction records and audit logs  | Retained per financial record-keeping requirements; audit logs are append-only for their retention period                             |
| Support tickets                     | Retained for a defined operational period, then archived/anonymized                                                                   |
| Marketing consent records           | Retained until consent withdrawal, then processing ceases                                                                             |

**\[ASSUMPTION-COM-02\]** Exact retention periods must be finalized with legal counsel against both Nigerian (NDPR) and applicable US data protection and financial record-keeping requirements; illustrative approach only is given here.

**\[TBD-COM-03 — Compliance / Legal\]** Ageing and regulatory-escalation thresholds for settlements in `RECOVERY_REQUIRED` (ADR-001 / DEC-003) are **not yet determined**. A settlement in this phase represents unresolved customer funds, which is likely to carry a reporting obligation once a threshold period elapses. The architecture must support configurable ageing and escalation rules per jurisdiction and corridor; no default threshold has been assumed. Subject to applicable licensing and regulatory approval.

**\[TBD-COM-04 — Compliance / Legal\]** The dispute window — the period after settlement completion during which a party may open a dispute — is **not yet determined**. It must be configurable by jurisdiction and corridor. Per ADR-001, a post-completion dispute never mutates the completed financial record; correction occurs only through a new compensating settlement.

**\[TBD-COM-06 — Finance / Accounting / Legal\]** Accounting policy for the Xspeeria ledger (ADR-002 / DEC-004) is **not yet determined and must not be invented**: chart of accounts (P-1), revenue recognition (P-2), exposure recognition (P-3), loss recognition (P-4), recovery accounting (P-5), partner receivable/payable treatment (P-6), memorandum escrow accounting (P-7), reporting currency (P-8), FX accounting treatment (P-9), suspense ageing and quarantine-expiry thresholds (P-10), and checkpoint frequency and external anchoring (P-11). The architecture supports double entry, per-currency balancing, append-only history, compensating corrections, reconciliation, suspense and deterministic replay **without deciding any of these policies**. No example, sample schema, comment, test, seed value or implementation default may make one normative. Subject to applicable licensing and regulatory approval.

**\[TBD-COM-05 — Legal / Partner Contracting / Insurance & Risk\]** Loss-bearing responsibility where a recovery case closes as `CLOSED_WITH_LOSS` is **not yet determined**. `CLOSED_WITH_LOSS` records that the case was financially closed with a recognized loss; it does **not** assign that loss to Xspeeria. Allocation is governed by partner contract, insurance/indemnity arrangements, applicable law and approved policy, and must be recorded separately. No assumption that Xspeeria bears the loss may be encoded in documentation or implementation.

## 5.4 Deletion

- Deletion requests are honored to the extent legally permissible — financial and AML records subject to mandatory retention periods cannot be deleted early, and this limitation is disclosed to users in the privacy policy.
- Where deletion is not immediately possible due to legal hold, data is restricted from active use and flagged for deletion at the earliest permissible date.

## 5.5 Data Subject Access Requests (DSAR)

| Step                               | Owner             | SLA (Illustrative)                        |
|------------------------------------|-------------------|-------------------------------------------|
| Request intake                     | Support/DPO       | Acknowledged within 3 business days       |
| Identity verification of requester | DPO               | Before any data is released               |
| Data compilation                   | DPO + Engineering | Within regulatory-defined response window |
| Response delivery                  | DPO               | Within regulatory-defined response window |

## 5.6 Encryption & Access Control

- PII is encrypted at rest (field-level encryption for high-sensitivity fields per TDS Section 11.3) and in transit (TLS 1.2+).
- Access to raw PII is role-restricted and logged; no engineering, support, or compliance role has blanket unrestricted access by default.

# 6. TRANSACTION MONITORING

## 6.1 Purpose

Transaction monitoring identifies behavior inconsistent with a user’s declared profile or indicative of money laundering, fraud, or structuring, complementing the point-in-time KYC/AML controls in Sections 3–4.

## 6.2 Suspicious Behavior Indicators (Illustrative, Non-Exhaustive)

| Indicator                                                                                             | Rationale                                             |
|-------------------------------------------------------------------------------------------------------|-------------------------------------------------------|
| Rapid succession of transactions just below a review threshold                                        | Possible structuring to avoid scrutiny                |
| Sudden deviation from historical transaction size/frequency                                           | Possible account compromise or change in risk profile |
| Multiple accounts linked to the same device/payment details                                           | Possible attempt to circumvent per-account limits     |
| Counterparty concentration (same two users repeatedly matching outside normal marketplace randomness) | Possible collusive or wash-trading behavior           |
| Transactions immediately followed by dispute-and-refund patterns                                      | Possible fraud or dispute-abuse pattern               |

## 6.3 Velocity Rules

- Velocity thresholds (transaction count and cumulative value per rolling time window) are defined per risk tier, with lower-risk tiers granted higher thresholds and high-risk/EDD accounts subject to tighter, more frequently reviewed thresholds.
- Breaching a velocity threshold does not automatically block the user — it generates a case for manual review (Section 6.4), preserving legitimate high-frequency use (e.g., SME/Importer personas) from false positives.

**\[ASSUMPTION-COM-03\]** Specific velocity threshold numbers are operational parameters to be tuned by the Risk team using real transaction data; not asserted as fixed figures here.

## 6.4 Manual Escalation & Case Creation

    flowchart TD
        Trigger["Monitoring rule triggered"] --> Case["Case auto-created in monitoring queue"]
        Case --> Analyst["Risk/Compliance Analyst reviews case"]
        Analyst --> Decision{"Determination"}
        Decision -- False positive --> Close["Case closed, no action"]
        Decision -- Requires more info --> RFI["Request additional info from user"]
        Decision -- Confirmed suspicious --> Escalate["Escalated to Compliance Officer"]
        Escalate --> Regulatory{"Regulatory reporting required?"}
        Regulatory -- Yes --> File["File required regulatory report per applicable law"]
        Regulatory -- No --> Restrict["Account restriction/review per internal policy"]

# 7. DISPUTE OPERATIONS

## 7.1 Case Intake

- Disputes may be opened by either party to a transaction within a defined post-transaction window (see SLA table, Section 7.5).
- Intake requires the complainant to specify the issue category (e.g., funds not received, incorrect amount, counterparty non-responsive) and initial supporting detail.

## 7.2 Evidence Collection

- Both parties are invited to submit evidence (payment confirmations, screenshots, correspondence) via the secure evidence upload flow.
- Evidence is stored per the same encryption/access-control standards as KYC documents (Section 4.3).

## 7.3 Mediation

- A dispute is first assessed for a straightforward resolution based on objective transaction/settlement records (e.g., partner-confirmed payout data) before requiring interpretive mediation.
- Where objective records are insufficient, an Ops/Compliance case handler mediates based on submitted evidence from both parties.

## 7.4 Resolution

| Outcome            | Description                                                                                                                 |
|--------------------|-----------------------------------------------------------------------------------------------------------------------------|
| Complainant upheld | Remedy applied per policy (may include facilitating a refund/reversal through partner rails, subject to partner capability) |
| Respondent upheld  | Original transaction outcome stands; complainant notified with rationale                                                    |
| Escalated          | Case referred to senior case review when evidence is insufficient or the case involves potential fraud                      |

## 7.5 SLA Table

| Stage                      | Target SLA (Illustrative)                                            |
|----------------------------|----------------------------------------------------------------------|
| Dispute acknowledgment     | Within 24 hours of filing                                            |
| Evidence collection window | Defined fixed window (e.g., several business days) from case opening |
| Initial determination      | Within a defined number of business days of evidence window closing  |
| Escalated case resolution  | Extended SLA, tracked separately with senior sign-off                |

**\[ASSUMPTION-COM-04\]** Precise SLA day-counts must be finalized by Operations leadership balancing user experience against realistic case-handling capacity; illustrative structure only is given here.

# 8. CUSTOMER SUPPORT SOP

## 8.1 Priority Levels

| Priority      | Definition                                                         | Examples                                                            |
|---------------|--------------------------------------------------------------------|---------------------------------------------------------------------|
| P0 — Critical | Active financial impact, security concern, or platform-wide outage | Suspected account compromise, funds-in-transit issue, platform down |
| P1 — High     | Individual transaction blocked or materially delayed               | Stuck transaction, failed settlement affecting a specific user      |
| P2 — Medium   | Functional issue without direct financial impact                   | KYC submission error, app bug                                       |
| P3 — Low      | General inquiry                                                    | How-to questions, feature requests                                  |

## 8.2 Escalation Matrix

| Priority | First Response SLA                                                 | Escalation Path                          |
|----------|--------------------------------------------------------------------|------------------------------------------|
| P0       | Immediate (within minutes during operating hours; on-call outside) | Support Agent → Ops/Incident Commander   |
| P1       | Within 1 business hour                                             | Support Agent → Ops Admin                |
| P2       | Within 1 business day                                              | Support Agent → relevant functional lead |
| P3       | Within 2 business days                                             | Support Agent handles directly           |

## 8.3 Response Templates (Governance Note)

- All support templates must avoid confirming or denying specific account details to unverified requesters (identity verification precedes any account-specific disclosure).
- Templates referencing KYC/AML decisions must avoid disclosing the specific detection logic behind a rejection (to prevent gaming), while still giving the user actionable next steps.

# 9. INCIDENT RESPONSE PLAN

## 9.1 Incident Categories

| Category               | Examples                                                          |
|------------------------|-------------------------------------------------------------------|
| Security incidents     | Unauthorized access, credential compromise, suspected data breach |
| Payment failures       | Partner settlement API failures, webhook processing failures      |
| Data breaches          | Confirmed unauthorized disclosure of PII or KYC data              |
| Infrastructure outages | API downtime, database failure, third-party provider outage       |

## 9.2 Severity Matrix

| Severity | Definition                                                           | Example                                                                 |
|----------|----------------------------------------------------------------------|-------------------------------------------------------------------------|
| SEV-1    | Platform-wide outage or confirmed data breach affecting customer PII | Database compromise, full platform downtime                             |
| SEV-2    | Significant partial impact                                           | Settlement partner integration down, affecting all pending transactions |
| SEV-3    | Limited impact, workaround available                                 | Single feature degraded, isolated user impact                           |
| SEV-4    | Minor, no user-facing impact                                         | Internal tooling issue                                                  |

## 9.3 Communication Workflow

    flowchart TD
        Detect["Incident detected (monitoring alert or report)"] --> Triage["Incident Commander triages severity"]
        Triage --> Sev1{"SEV-1 or SEV-2?"}
        Sev1 -- Yes --> Assemble["Assemble incident response team"]
        Sev1 -- No --> Standard["Standard ticket handling per severity"]
        Assemble --> Internal["Internal stakeholder notification (Exec, Compliance, Legal)"]
        Internal --> External{"External notification required?"}
        External -- Yes (e.g., data breach, partner-affecting) --> Notify["Notify affected users / regulators / partners per legal requirement"]
        External -- No --> Contain["Containment and remediation"]
        Notify --> Contain
        Contain --> Resolve["Resolution confirmed"]
        Resolve --> Postmortem["Post-incident review and report"]

## 9.4 Recovery Procedures

- SEV-1/SEV-2 incidents trigger the Business Continuity procedures (Section 10).
- Recovery is not considered complete until root cause is identified and either remediated or a compensating control is in place, and a post-incident report is filed (Section 9.5).

## 9.5 Post-Incident Review

Every SEV-1/SEV-2 incident requires a documented post-incident review covering: timeline, root cause, impact assessment, remediation actions, and preventive follow-ups, reviewed by the Risk & Compliance Committee.

# 10. BUSINESS CONTINUITY

## 10.1 Recovery Objectives

| Metric                         | Target (Illustrative, per TDS Section 12.4) |
|--------------------------------|---------------------------------------------|
| RTO (Recovery Time Objective)  | ≤ 4 hours for full platform restoration     |
| RPO (Recovery Point Objective) | ≤ 15 minutes of data loss                   |

**\[ASSUMPTION-COM-05\]** These targets, first proposed in the TDS as engineering defaults, require formal Operations leadership sign-off, factoring in banking partner SLA dependencies which may themselves constrain achievable recovery times.

## 10.2 Backup Strategy

- Automated daily full database backup plus continuous write-ahead-log (WAL) archiving (see TDS Section 12.4).
- Quarterly restore drills to validate backup integrity and actual (not theoretical) recovery time.
- Backups are encrypted and access-restricted equivalently to production data.

## 10.3 Continuity Scenarios

| Scenario                                                              | Continuity Approach                                                                                                                                  |
|-----------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------|
| Cloud provider regional outage                                        | Documented failover procedure to secondary region (subject to final infrastructure ADR-006 in TDS)                                                   |
| Banking partner outage (one side of corridor)                         | Settlements in `AWAITING_FUNDING`/`RELEASING` held safely per ADR-001; no forced phase transitions during partner outage. A leg already `FUNDED` stays `FUNDED` — release remains structurally blocked until both legs fund, so no partial release is possible during an outage |
| Key personnel unavailability (Compliance Officer, Incident Commander) | Documented deputy/backup assignment for every critical governance role                                                                               |

# 11. OPERATIONAL RUNBOOKS

## 11.1 Daily

| Task                                                                  | Owner           |
|-----------------------------------------------------------------------|-----------------|
| Review KYC manual review queue for aging cases                        | Compliance      |
| Review settlements in `RECOVERY_REQUIRED` (unresolved customer exposure) and any open blocking `SettlementHold` | Ops             |
| Review open `ReconciliationException` records, including those against completed settlements | Ops             |
| Review quarantined partner evidence (`pending_events`) awaiting a prerequisite, and escalate on ageing | Ops             |
| Review contradictory partner evidence retained for adjudication, and aged suspense-account balances | Ops + Finance   |
| Review overnight monitoring alerts                                    | Risk/Compliance |
| Confirm backup job completion                                         | Ops/Engineering |

## 11.2 Weekly

| Task                                                  | Owner        |
|-------------------------------------------------------|--------------|
| Review dispute case aging against SLA                 | Ops          |
| Review support ticket volume and SLA adherence        | Support Lead |
| Review velocity rule trigger volume for tuning signal | Risk         |

## 11.3 Monthly

| Task                                                                    | Owner              |
|-------------------------------------------------------------------------|--------------------|
| Risk & Compliance Committee review meeting                              | Compliance Officer |
| Reconciliation of settlement records against banking partner statements | Ops/Finance        |
| Review of KYC approval/rejection rate trends                            | Compliance         |

## 11.4 Quarterly

| Task                                                | Owner               |
|-----------------------------------------------------|---------------------|
| Backup restore drill                                | Engineering/Ops     |
| Full policy review (this manual)                    | Compliance Officer  |
| Board governance review                             | Executive Committee |
| Sanctions/PEP screening provider performance review | Compliance          |

# 12. AUDIT PROCEDURES

## 12.1 Internal Audit

- All KYC decisions, transaction state transitions, and dispute resolutions are subject to periodic internal audit sampling, drawing on the immutable audit log (TDS Section 6.2, `audit_logs` table).
- Audit sampling prioritizes high-risk-tier cases and any case involving manual override of an automated decision.

## 12.2 External Audit Readiness

- All audit log data must be exportable in a reviewer-friendly format on request from a banking partner or regulator, without requiring direct production database access.
- Audit log access is itself logged (TDS Section 12.3), ensuring auditability of the audit process.

## 12.3 Audit Trail Requirements

Per TDS Section 1.2 and Section 6.2, every state-changing action on a financial entity must produce an audit record containing: actor, timestamp, action, entity type/ID, before/after state, and correlation ID. This manual reaffirms that requirement as a compliance mandate, not merely an engineering preference.

# 13. COMPLIANCE CHECKLISTS

## 13.1 Pre-Launch Compliance Checklist

- [ ] Banking/payment partner agreements executed for both sides of the NGN⇄GBP pilot corridor (with equivalent agreements required for NGN⇄USD ahead of the Year 2 launch)
- [ ] AML policy formally approved by legal counsel in both relevant jurisdictions
- [ ] KYC/sanctions screening provider contracted and integration tested
- [ ] NDPR compliance review completed by DPO and legal counsel
- [ ] Incident Response Plan tested via tabletop exercise
- [ ] Business Continuity backup/restore drill completed successfully
- [ ] Internal Controls (Section 14) reviewed and signed off by Risk & Compliance Committee

## 13.2 New User Onboarding Checklist (Per User)

- [ ] Identity document verified
- [ ] Liveness check passed
- [ ] Sanctions/PEP screening completed, no unresolved hits
- [ ] Risk tier assigned
- [ ] EDD completed if applicable (business/PEP/high-risk)

## 13.3 Per-Transaction Compliance Checklist (System-Enforced, Listed for Audit Reference)

- [ ] Both parties KYC-approved at time of match (re-checked, not just at listing creation)
- [ ] Transaction within applicable velocity/limit thresholds for each party’s risk tier
- [ ] Audit log entries present for every state transition

# 14. INTERNAL CONTROLS

## 14.1 Segregation of Duties

| Function                       | Control                                                                                                                                   |
|--------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------|
| KYC approval                   | Reviewer and approver may be the same person for standard cases, but reversal of a prior rejection requires a second reviewer (four-eyes) |
| High-risk/PEP approval         | Requires Senior Compliance Officer, distinct from the initial KYC Reviewer                                                                |
| Manual settlement intervention | Requires Ops Admin action, logged and reviewable by Compliance                                                                            |
| Policy amendment               | Requires Compliance Officer plus Risk & Compliance Committee approval — no single individual may unilaterally change AML thresholds       |

## 14.2 Access Controls

Per TDS Section 11.2 RBAC design: `compliance_officer`, `ops_admin`, `support_agent`, and `super_admin` roles are distinct, with `super_admin` access requiring hardware-key MFA and elevated audit logging. This manual reaffirms that role separation is a compliance control, not solely a technical one, and access grants must be periodically reviewed (recommended quarterly, aligned with Section 11.4).

## 14.3 Change Management Controls

- No production change to AML thresholds, KYC gating logic, or transaction state machine rules may be deployed without joint Engineering + Compliance sign-off (reaffirming TDS “Document End Notes”).
- All such changes are logged in the Decision Log (Section 15.3).

# 15. APPENDIX

## 15.1 Forms (Index — Content Maintained Separately)

| Form                     | Purpose                                                              |
|--------------------------|----------------------------------------------------------------------|
| KYC Submission Form      | Captures individual/business identity and verification data          |
| EDD Supplementary Form   | Captures UBO, source of funds/wealth for high-risk/business accounts |
| Dispute Intake Form      | Captures complainant details, issue category, initial evidence       |
| DSAR Request Form        | Captures data subject access/deletion request details                |
| Incident Report Template | Structured post-incident review documentation                        |

## 15.2 Templates (Index — Content Maintained Separately)

- Support response templates (per priority level, Section 8)
- Regulatory reporting templates (jurisdiction-specific, maintained with legal counsel)
- User-facing KYC rejection notification template (non-disclosive of detection logic, per Section 8.3)

## 15.3 Decision Log

| Decision                                               | Date                        | Owner                    | Rationale                                                     |
|--------------------------------------------------------|-----------------------------|--------------------------|---------------------------------------------------------------|
| Adopt tiered risk rating methodology (Low/Medium/High) | Pending formal approval     | Compliance Officer       | Establishes proportionate CDD/EDD application per Section 3.1 |
| Adopt four-eyes principle for KYC rejection reversals  | Pending formal approval     | Compliance Officer       | Prevents unilateral override of a compliance decision         |
| Wallet-less, partner-settlement custody model          | Reaffirmed from TDS ADR-003 | Compliance + Engineering | Reduces custodial regulatory burden                           |

## 15.4 Decision Trees (Referenced Above)

See Section 4.1 (KYC Verification Workflow), Section 6.4 (Transaction Monitoring Escalation), and Section 9.3 (Incident Communication Workflow) for the primary operational decision trees governing this manual.

## Document End Notes

This Compliance & Operations Manual must be formally reviewed by qualified legal counsel in the Nigerian and UK jurisdictions relevant to the NGN⇄GBP pilot corridor before any production launch, with an equivalent review in the Nigerian and US jurisdictions completed ahead of the Year 2 NGN⇄USD launch. Every numeric threshold, SLA, and retention period marked as an assumption in this document represents an open item requiring sign-off from Compliance and Operations leadership, not a finalized policy.
