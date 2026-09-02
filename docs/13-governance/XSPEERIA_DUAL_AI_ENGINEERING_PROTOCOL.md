XSPEERIA
DUAL-AI SECURE ENGINEERING PROTOCOL
Claude Code + DeepSeek + Gemini + CodeRabbit + CI + Human Approval

VERSION: 1.1
STATUS: HUMAN-ADOPTED GOVERNANCE PROTOCOL
PURPOSE: Secure AI-assisted development of Xspeeria
PREPARED BY: Claude Code (AI), at explicit human request
PREPARED AGAINST: branch main, commit
  313eff39f1e0af60805835ba993d59e45b877db0

ADOPTION RECORD

ADOPTED BY:    Human Owner
ADOPTION DATE: 2026-09-02
ADOPTED PROPOSAL SOURCE REVISION (SHA-256):
  533d45fd30934185006b3473018e8c17a1c59cbc69cbc609d64baa4a476f9b95

The SHA-256 above identifies the exact PROPOSAL REVISION the Human
Owner approved for adoption. This file necessarily differs from that
revision, because recording the adoption status is itself a change to
the file. The tracked document revision is identified by the git
commit that introduces it, NOT by that SHA-256. The two must not be
conflated.

Adoption authorized no work under this protocol. PR merge, Gemini
operational use, CD3 implementation, staging and production all remain
NOT AUTHORIZED. See section 0, 0.3, 4A.1, 21A and 32.1.

SECTION NUMBERING NOTE

Every section number used by v1.0 is preserved here with its original
meaning, so that existing audit references to a v1.0 section number
remain correct. All new v1.1 material carries a stable additive
identifier (0, 2A, 4A, 4A.1, 4A.2, 4B, 6A, 6B, 9.1, 14A, 19A, 21A)
or is
appended as a new top-level section after the final v1.0 section
(31, 32). No original v1.0 section was renumbered.

HUMAN RULINGS NOTE

The governance questions Q1 through Q8, and the Gemini interim rule,
were ruled on by the Human Owner and recorded 2026-09-02. The rulings
are recorded in section 32 and are given operative effect in sections
0.1, 0.2, 0.3, 0.4, 4A.1, 4A.2, 6A, 6B, 9.1 and 10. Recording those
rulings did not adopt this protocol, did not clear Gemini for
operational use, and did not authorize CD3 implementation. Matters that
remain open after those rulings are listed in 32.1. See section 0.

The Q3 authority-order ruling was subsequently REVISED by the Human
Owner, also on 2026-09-02. The revised ruling is operative in 0.2 and
recorded in section 32 under Q3, where the superseded ordering is
retained for history with no further effect.


======================================================================
0. ADOPTION AND SCOPE OF AUTHORITY NOTICE
======================================================================

ADOPTION STATUS: HUMAN-ADOPTED.

This protocol was explicitly adopted by the Human Owner on 2026-09-02,
at proposal source revision SHA-256
533d45fd30934185006b3473018e8c17a1c59cbc69cbc609d64baa4a476f9b95.

Its authority is bounded by 0.2 and applies prospectively from its
effective adoption / merge revision per 0.4. Tracking is proceeding
under the route defined in 0.3.

WHAT ADOPTION DID NOT DO

Adoption established this protocol AS GOVERNANCE. It did not authorize
any work under it. Specifically, adoption of this document:

- does not authorize any implementation
- does not authorize any merge
- does not authorize any deployment
- does not supersede any existing human decision
- does not supersede CLAUDE.md, DOCUMENT_INDEX.md,
  docs/00-source-of-truth/,
  docs/13-governance/XSPEERIA_STANDING_STANDARDS.md, approved ADRs,
  or any other higher-authority source under 0.2

Adoption of a governance document is not authorization of the work it
governs. Every gate in 2A remains separately required.

An AI-prepared proposal is not an approval. Preparation of a document
is not adoption of it. What adopted this protocol was an explicit,
recorded Human Owner decision - not this text, and not any AI
statement about this text.

Adoption of this protocol established the Gemini ROLE DEFINITION only.
It did NOT establish Gemini operational clearance, which remains
NOT CLEARED. See 4A.1 and 4A.2.


----------------------------------------------------------------------
0.1  STATUS OF v1.0
     HUMAN RULING RECORDED 2026-09-02 (Q1)
----------------------------------------------------------------------

v1.0 is treated as NEVER FORMALLY ADOPTED.

v1.0 never held normative authority. Nothing in this document creates
retrospective approval for it, and no past action may be justified by
appeal to v1.0 as if it had been in force.

v1.1 was explicitly adopted by the Human Owner on 2026-09-02. It is
therefore the FIRST authoritative version of this protocol. It is not
an amendment to an already-authoritative v1.0.


----------------------------------------------------------------------
0.2  AUTHORITY RANKING
     HUMAN RULING RECORDED 2026-09-02 (Q3)
     REVISED RULING RECORDED 2026-09-02, SUPERSEDING THE ORIGINAL
     Q3 AUTHORITY-ORDER RULING
----------------------------------------------------------------------

This protocol ranks BELOW all of the following. This is a statement
about where THIS protocol sits. It is not a ranking of those sources
against each other.

  - CLAUDE.md
  - all explicit human-approved architecture and engineering
    decisions, including
    docs/13-governance/XSPEERIA_STANDING_STANDARDS.md and approved
    ADRs under docs/adr/
  - DOCUMENT_INDEX.md
  - docs/00-source-of-truth/

The relative authority of those higher-order repository documents is
governed by the existing repository authority model and the applicable
human-ratified standing standards. THIS PROTOCOL DOES NOT REDEFINE
THAT HIERARCHY and must not be cited as stating it.

This protocol must not override any higher-authority source.

Where this protocol conflicts with any higher-authority source:

STOP - HUMAN DECISION REQUIRED

Where higher-authority sources conflict with EACH OTHER and repository
governance does not unambiguously resolve the conflict:

STOP - HUMAN DECISION REQUIRED

Do not silently prefer either document.

SUPERSESSION NOTE

This revised ruling supersedes ONLY the previously approved Q3
authority-order ruling, which listed DOCUMENT_INDEX.md above
XSPEERIA_STANDING_STANDARDS.md and omitted approved ADRs. That
superseded ordering has no further effect.

This revision does not adopt this protocol and does not authorize
tracking, commit, PR, merge, Gemini operational use, CD3
implementation, staging, or production. See section 0 and 32.1.


----------------------------------------------------------------------
0.3  TRACKING ROUTE
     HUMAN RULING RECORDED 2026-09-02 (Q2)
----------------------------------------------------------------------

This protocol remains UNTRACKED during proposal preparation.

After all approved governance rulings are incorporated and the final
proposal is reviewed, it may become tracked ONLY through a dedicated
governance PR carrying:

- revision-bound review
- applicable CI
- CodeRabbit review where available and applicable
- explicit human merge authorization

As ruled, this did NOT itself authorize git add, commit, push, PR
creation, or merge. It defined the only permitted route, not
permission to take it.

ADOPTION-STATUS NOTE, RECORDED 2026-09-02

The Human Owner has since adopted this protocol and authorized
tracking it through exactly the dedicated governance PR route defined
above. That authorization covers branch creation, staging this file
alone, commit, push, and PR creation.

It does NOT authorize MERGE. Merge remains subject to explicit Human
Owner authorization bound to the exact reviewed PR head revision, and
the revision-bound review, CI and CodeRabbit requirements above
continue to apply in full.


----------------------------------------------------------------------
0.4  EFFECT ON ADOPTION
     HUMAN RULING RECORDED 2026-09-02 (Q8)
----------------------------------------------------------------------

v1.1 was adopted on 2026-09-02. It applies PROSPECTIVELY from its
effective adoption / merge revision.

Previously merged work is NOT automatically reopened solely because
this protocol is adopted.

Existing or historical work must still be revisited where separately
required by:

- an unresolved existing governance gate
- a material change
- a security or production incident
- an audit finding
- a compliance finding
- an integrity concern
- an explicit human instruction

Prospective effect does not erase, discharge, or reinterpret any
pre-existing unresolved obligation. Obligations that already exist
outside this protocol remain exactly as they were.


----------------------------------------------------------------------

The adoption status of v1.1 is RECORDED: adopted by the Human Owner on
2026-09-02 at proposal source revision SHA-256
533d45fd30934185006b3473018e8c17a1c59cbc69cbc609d64baa4a476f9b95
(section 0). Tracking is proceeding under 0.3; merge is not authorized.
Adoption decided none of the matters listed in 32.1, which remain open.
See section 32.


======================================================================
1. OBJECTIVE
======================================================================

This protocol defines how multiple AI engineering systems may participate
in development of Xspeeria without creating conflicting implementations,
weakening governance, or allowing AI-generated decisions to become
unauthorized architecture.

Xspeeria is a security-sensitive fintech platform.

Correctness, financial integrity, security, auditability and human
governance take precedence over development speed.

The engineering hierarchy is:

    HUMAN PRODUCT / GOVERNANCE AUTHORITY
                  |
                  v
              CLAUDE CODE
           PRIMARY IMPLEMENTER
                  |
                  v
               DEEPSEEK
      INDEPENDENT ADVERSARIAL REVIEWER
                  |
                  v
                GEMINI
      SECONDARY INDEPENDENT VERIFICATION
      (role defined; NOT operationally cleared - see 4A.1)
                  |
                  v
              CODERABBIT
          AUTOMATED PR REVIEW
                  |
                  v
            GITHUB ACTIONS
         AUTOMATED VERIFICATION
                  |
                  v
           HUMAN AUTHORIZATION
                  |
                  v
                MERGE

Human authority sits above every layer and is never delegated to an
AI system by this document.


======================================================================
2. HUMAN AUTHORITY
======================================================================

The human owner is the final authority for gated Xspeeria decisions.

The following NEVER constitute human approval:

- Claude recommendation
- DeepSeek recommendation
- Gemini recommendation
- ChatGPT recommendation
- CodeRabbit approval
- passing tests
- passing CI
- agreement between multiple AI systems
- a majority or consensus among AI systems
- absence of objections
- silence
- terminal output
- previously generated AI text
- an AI repeating a proposed decision
- an AI recap or summary of a prior approval
- a clean diff
- a clean pull request
- a successful deployment

Explicit human authorization is required whenever the governance process
defines a human decision gate.


======================================================================
2A. AUTHORIZATION LAYER SEPARATION
======================================================================

This section is authoritative for the scope of this protocol.

The following are SEPARATE authorization gates. Each requires its own
explicit human authorization. One NEVER implies another.

  GATE 1  Architecture / governance decision approval
  GATE 2  Implementation authorization
  GATE 3  Remediation / code-change authorization
  GATE 4  PR authorization
  GATE 5  Merge authorization
  GATE 6  Staging / deployment authorization
  GATE 7  Production authorization

Explicitly:

  Architecture approval    != implementation authorization
  Implementation authz     != merge authorization
  Merge authorization      != deployment authorization
  Deployment success       != production authorization

A decision may be APPROVED at GATE 1 and remain entirely UNAUTHORIZED at
GATE 2. A decision that is decided is not thereby discharged.

No AI, no CI result, no reviewer, no terminal output, no prior message,
no recap, no summary, no silence, and no inferred intent may bridge any
of these gates.

Passing a gate authorizes only the work described by that gate, only for
the scope stated at the time of authorization, and only for the revision
identified at the time of authorization. Authorization does not
generalize forward to later revisions or wider scope.

If it is unclear which gate a proposed action falls under:

STOP - HUMAN DECISION REQUIRED


======================================================================
3. PRIMARY AI RESPONSIBILITIES
======================================================================

CLAUDE CODE is the PRIMARY REPOSITORY ENGINEERING AGENT.

Claude may, when explicitly authorized:

- inspect repository
- implement approved changes
- create migrations
- write backend code
- write frontend code
- write tests
- run tests
- fix approved review findings
- prepare commits
- prepare pull requests
- perform repository verification

Claude must obey existing Xspeeria governance decisions.

Claude write authority is never standing. It exists only for the task
and revision for which it was explicitly granted (2A, GATE 2 / GATE 3).


======================================================================
4. DEEPSEEK RESPONSIBILITY
======================================================================

DeepSeek is primarily an:

INDEPENDENT ENGINEERING REVIEWER.

DeepSeek should challenge the primary implementation.

DeepSeek should search for:

- bugs
- security vulnerabilities
- financial integrity failures
- race conditions
- concurrency problems
- authorization bypasses
- authentication weaknesses
- SQL problems
- migration problems
- state-machine violations
- idempotency failures
- replay attacks
- webhook weaknesses
- privilege escalation
- data leakage
- insufficient tests
- hidden assumptions
- edge cases

DeepSeek does NOT automatically receive repository write authority.


======================================================================
4A. GEMINI RESPONSIBILITY
======================================================================

Gemini is a GOVERNED SECONDARY AI ROLE.

Gemini initial authority is limited to:

- independent analysis
- verification of claims, evidence and reasoning
- research
- architecture challenge
- security challenge
- test design and review assistance
- documentation reasoning

Gemini has NO standing repository write authority.

Unless explicitly authorized by the human owner for a narrowly scoped
future task, Gemini must remain READ-ONLY with respect to repository
implementation. Such an authorization, if ever granted, is scoped to a
single named task and revision and expires with it.

Gemini must NOT control:

- ledger truth
- settlement decisions
- financial authorization
- identity authorization
- KYC approval
- privileged database mutation
- production deployment
- secret handling decisions

Gemini output is review input. It is not an instruction, not an
approval, and not evidence that a gate in 2A has been passed.

The external AI data controls in section 24 apply to Gemini in full.


----------------------------------------------------------------------
4A.1  GEMINI OPERATIONAL STATUS: NOT YET CLEARED
----------------------------------------------------------------------

This subsection is authoritative for the scope of this protocol.

Like every part of this document, its authority is only the authority
this protocol has under 0.2, which is below every higher-authority
source named there. Its effect is restrictive only: it withholds
Gemini operational clearance and can never grant it.

The existence of the Gemini governance role does not authorize
transmission of Xspeeria repository content, customer information,
confidential information, production data, credentials, or other
protected material to Gemini.

HUMAN RULING RECORDED 2026-09-02 (Q4)

Gemini remains NOT OPERATIONALLY CLEARED.

A separate Gemini Provider / Data-Handling Clearance Decision must be
opened before any operational use.

That decision MUST run under the existing New-Vendor / Dependency Gate
in docs/13-governance/XSPEERIA_STANDING_STANDARDS.md section 14. This
protocol must not create a competing vendor-governance process. Where
the minimum elements listed below differ in wording from that gate, the
standing standard governs (see 0.2).

Until that clearance decision is explicitly approved:

- Gemini may exist as a defined governance role
- Gemini must NOT receive Xspeeria repository content or protected
  Xspeeria material
- Gemini must NOT be treated as operationally cleared

Gemini operational use requires that separate human-approved provider
and data-handling decision, defining at minimum:

- approved provider, account or tenancy
- approved product / tier
- permitted data classifications
- retention policy
- training / product-improvement use policy
- regional / data-location requirements where applicable
- credential and key management
- logging and audit requirements
- permitted use cases
- prohibited use cases

Until that decision exists, Gemini may be described in governance
architecture but must NOT be treated as operationally cleared to receive
Xspeeria material of any classification.

The two statuses are distinct and must not be conflated:

  ROLE DEFINITION
      APPROVED - this protocol was adopted 2026-09-02 (section 0)

  OPERATIONAL PROVIDER / DATA USE
      NOT CLEARED - REQUIRES SEPARATE HUMAN DECISION

This subsection does not remove Gemini from the risk-based review model
in sections 6 through 10. Gemini remains part of that model as a defined
role. What is withheld is operational use, not role membership.

CLEARANCE INTERACTION - DECIDED

Sections 9 and 10 assign Gemini a recommended and a mandatory review
position respectively. While operational clearance is absent, that
position cannot be exercised. How work proceeds in that state was ruled
on by the Human Owner and is governed by 4A.2, the GEMINI INTERIM RULE.

That ruling governs the interim state only. It does not create Gemini
operational clearance, which remains outstanding and is still a
separate human decision.

Do not invent the provider or data-handling decision. Do not treat any
AI statement, including this document, as that decision.


----------------------------------------------------------------------
4A.2  GEMINI INTERIM RULE - WHILE OPERATIONAL CLEARANCE IS ABSENT
      HUMAN RULING RECORDED 2026-09-02
----------------------------------------------------------------------

This subsection governs the INTERIM STATE only: the state in which
Gemini has a defined governance role under 4A but has no approved
provider / data-handling clearance under 4A.1.

Until Gemini receives approved provider / data-handling clearance:

- Gemini absence does NOT automatically make all CRITICAL work
  impossible.
- For a CRITICAL change where Gemini verification would otherwise be
  mandatory under section 10, the Human Owner MAY grant a documented
  GEMINI-UNAVAILABILITY WAIVER.
- That waiver MUST be exact-revision-bound, scope-bound, one-time, and
  MUST include rationale. The waiver mechanics in 6B apply in full.
- The waiver does NOT constitute Gemini provider approval.
- The waiver does NOT weaken any other CRITICAL control.
- DeepSeek adversarial review remains MANDATORY unless separately and
  explicitly governed.
- Deterministic validation remains MANDATORY.
- CodeRabbit review remains MANDATORY where required, unless separately
  waived by explicit, revision-bound human rationale.
- Explicit human authorization remains REQUIRED at every applicable
  high-impact gate in 2A.
- After Gemini becomes operationally cleared, the normal CRITICAL
  review requirements of section 10 apply without this interim
  accommodation.

THIS INTERIM RULE MUST NOT BE READ AS AUTHORIZING GEMINI OPERATIONAL
USE. Gemini operational use remains NOT CLEARED (4A.1). This rule
describes only how CRITICAL work may proceed while Gemini is absent.

Absence of a recorded waiver is not a waiver. Silence is not a waiver.


======================================================================
4B. MULTI-AI OPERATING MODEL
======================================================================

The normal operating model is:

    HUMAN OWNER
        |
        v
    CLAUDE CODE
    primary implementation agent
        |
        v
    DEEPSEEK
    independent adversarial reviewer
        |
        v
    GEMINI
    secondary independent verification / research where required
    (role defined; operational use NOT CLEARED - see 4A.1)
        |
        v
    CODERABBIT
    PR / diff reviewer
        |
        v
    GITHUB ACTIONS
    deterministic automated evidence
        |
        v
    HUMAN AUTHORIZATION
        |
        v
    MERGE

The sequence may vary by risk class (sections 6 through 10). Layers may
be omitted where the risk class permits, run in a different order, or
run in parallel.

What does not vary:

- human authority remains final
- the authorization gates of 2A remain separate
- no AI layer may substitute for the human authorization layer
- reordering or omitting an AI layer never removes a human gate


======================================================================
5. REPOSITORY WRITE OWNERSHIP
======================================================================

Only ONE AI agent should own a working implementation branch at a time.

Default:

CLAUDE = WRITE ACCESS

DEEPSEEK = READ-ONLY REVIEW

GEMINI = READ-ONLY VERIFICATION / RESEARCH, and only once
         operationally cleared per 4A.1

Never allow two AI systems to simultaneously make independent changes to
the same branch.

This prevents:

- conflicting commits
- architectural drift
- accidental reversions
- inconsistent assumptions
- merge conflicts
- governance confusion


======================================================================
6. RISK-BASED REVIEW
======================================================================

Not every change requires independent AI review.

Classify every task:

LOW RISK
MEDIUM RISK
HIGH RISK
CRITICAL

Classification is itself a governance act. Where the correct class is
genuinely unclear, classify upward, or escalate.

Risk class determines which REVIEW layers are required. It never
determines whether human authorization is required. Human gates are
fixed by 2A and by the governing decision record.


----------------------------------------------------------------------
6A. CLASSIFICATION AUTHORITY
    HUMAN RULING RECORDED 2026-09-02 (Q7)
----------------------------------------------------------------------

Claude MAY propose the initial risk classification for a task.

- LOW and MEDIUM: work may proceed on the proposed classification,
  subject to the existing escalation rules in section 27 and to any
  stricter rule elsewhere in governance.
- HIGH and CRITICAL: the classification requires HUMAN OWNER
  confirmation before work proceeds under it.

Where the correct class is genuinely ambiguous, the task is classified
UPWARD temporarily, or:

STOP - HUMAN DECISION REQUIRED

No AI may downgrade a risk classification in order to bypass a control,
shorten a review path, or avoid a human gate. A downgrade is a
governance act reserved to the Human Owner.


----------------------------------------------------------------------
6B. WAIVER MECHANICS
    HUMAN RULING RECORDED 2026-09-02 (Q6)
----------------------------------------------------------------------

Every governance waiver permitted anywhere in this protocol - including
those referenced in sections 4A.2, 9, 10 and 25 - MUST be:

- explicit
- written
- revision-bound (bound to the exact revision it covers)
- scope-bound (bound to the named work it covers)
- one-time by default
- attributable to the Human Owner
- recorded together with the relevant evidence (14A where applicable)

No waiver automatically extends to:

- another commit
- another PR
- another branch
- another release
- later similar work
- indefinite future use

A waiver that does not satisfy every element above is not a waiver.
Silence, omission, prior practice, and AI inference are not waivers.


======================================================================
7. LOW-RISK CHANGES
======================================================================

Examples:

- spacing
- typography
- harmless UI styling
- marketing copy
- static informational pages
- accessibility improvements that do not alter authorization
- documentation formatting
- non-financial component cleanup

Required:

- Claude implementation
- applicable tests
- applicable CI
- applicable CodeRabbit review
- human merge authorization

DeepSeek and Gemini review are OPTIONAL, unless another rule in this
protocol, a standing standard, or a human decision requires them.


======================================================================
8. MEDIUM-RISK CHANGES
======================================================================

Examples:

- ordinary API endpoints
- notifications
- user preferences
- search
- pagination
- non-sensitive profile features
- ordinary frontend state management
- non-financial database changes

Required:

- Claude implementation
- independent AI review selected on the basis of the specific risk
  (DeepSeek, Gemini where cleared, or both)
- deterministic validation (tests and CI appropriate to the change)
- CodeRabbit review where a PR exists
- human authorization


======================================================================
9. HIGH-RISK CHANGES
======================================================================

Examples:

- authentication
- authorization
- MFA
- session management
- KYC
- PII
- bank account information
- admin permissions
- database migrations affecting financial data
- financial calculations
- partner APIs
- webhooks
- transaction processing
- matching concurrency
- reconciliation
- compliance controls

Required:

- Claude implementation
- DeepSeek independent review MANDATORY
- Gemini independent verification STRONGLY RECOMMENDED, subject to the
  operational clearance in 4A.1; whether it is required for a given
  HIGH-risk change is decided by the Human Owner per 9.1
- deterministic validation MANDATORY
- CodeRabbit review MANDATORY for PR changes, unless a human-approved
  exception with recorded rationale exists
- review provenance record per 14A MANDATORY
- human authorization MANDATORY


----------------------------------------------------------------------
9.1  GEMINI VERIFICATION DISCRETION AT HIGH RISK
     HUMAN RULING RECORDED 2026-09-02 (Q5)
----------------------------------------------------------------------

For HIGH-risk work, the HUMAN OWNER decides whether Gemini independent
verification is required. That discretion belongs to the Human Owner.
It is not Claude's, DeepSeek's, or any reviewer's to exercise.

If Gemini is NOT used for a HIGH-risk change, the decision and its
rationale MUST be recorded and revision-bound (14A; mechanics per 6B).

Silence or omission is not such a decision. An unrecorded absence of
Gemini review is a governance gap, not an exercise of discretion.

While Gemini operational clearance is absent (4A.1), this discretion is
exercised against that constraint, and 4A.2 governs the interim state.


======================================================================
10. CRITICAL CHANGES
======================================================================

Examples:

- settlement state machine
- money representation
- accounting ledger
- payout execution
- funding confirmation
- release instruction
- return instruction
- authoritative transaction state
- database financial immutability
- production banking integration
- financial idempotency
- financial concurrency
- privileged database roles
- cryptographic controls
- security architecture
- production financial deployment

Required:

- human-approved architecture as the baseline (2A, GATE 1)
- explicit implementation authorization (2A, GATE 2)
- Claude implementation and self-verification
- DeepSeek adversarial review MANDATORY
- Gemini independent verification MANDATORY, subject to the operational
  clearance in 4A.1, unless the human owner explicitly waives it with
  recorded rationale; while operational clearance is absent 4A.2
  governs, and every such waiver must satisfy 6B
- deterministic validation MANDATORY (tests, security tests, CI)
- CodeRabbit review MANDATORY where a PR exists, unless explicitly
  waived by the human owner with recorded rationale
- review provenance record per 14A MANDATORY
- explicit human authorization at EVERY applicable high-impact gate
  in 2A

Reference workflow:

    Human-approved architecture
        |
        v
    Explicit implementation authorization
        |
        v
    Claude implementation
        |
        v
    Claude self-verification
        |
        v
    DeepSeek adversarial review
        |
        v
    Gemini independent verification (where cleared per 4A.1)
        |
        v
    Claude finding analysis and classification
        |
        v
    Human ruling where architecture is implicated
        |
        v
    Authorized remediation
        |
        v
    Focused re-review where necessary
        |
        v
    Automated tests + security tests
        |
        v
    CodeRabbit
        |
        v
    CI
        |
        v
    Human review
        |
        v
    Explicit merge authorization

Production deployment requires a separate production authorization
(2A, GATE 7; section 29).


======================================================================
11. DEEPSEEK REVIEW RULE
     (v1.1: extended to all independent reviewers)
======================================================================

For high-risk and critical changes, each independent reviewer
(DeepSeek; Gemini where operationally cleared per 4A.1) receives:

- approved architecture
- relevant ADR
- human decisions
- changed files
- diff
- tests
- migration
- relevant schemas
- known assumptions
- the exact commit SHA and base SHA under review

Independent reviewers must NOT be asked:

"Rewrite this however you think is best."

Instead:

"Review this implementation against the approved Xspeeria contract."

Review input must be sanitized per section 24 before it leaves the
repository boundary. Sanitization does not substitute for the
operational clearance required by 4A.1.


======================================================================
12. MASTER DEEPSEEK REVIEW PROMPT
     (v1.1: also used for Gemini verification once cleared)
======================================================================

Use for DeepSeek, and for Gemini where Gemini is performing independent
verification and is operationally cleared per 4A.1:

You are the independent security and correctness reviewer for Xspeeria.

READ-ONLY REVIEW.

DO NOT modify repository files.

DO NOT create commits.

DO NOT push.

DO NOT merge.

DO NOT reinterpret approved human decisions.

Review the supplied implementation against the approved architecture.

Try to break it.

Look specifically for:

1. security vulnerabilities
2. authorization bypasses
3. authentication weaknesses
4. financial integrity violations
5. race conditions
6. concurrency failures
7. idempotency failures
8. replay vulnerabilities
9. state-machine violations
10. invalid database assumptions
11. SQL vulnerabilities
12. migration problems
13. rollback problems
14. privilege escalation
15. data leakage
16. PII exposure
17. logging of secrets
18. webhook spoofing
19. duplicate financial execution
20. missing negative tests
21. missing boundary tests
22. hidden assumptions
23. governance violations

For every finding provide:

SEVERITY:
Critical / High / Medium / Low / Informational

FILE:

LINE:

CATEGORY:

DESCRIPTION:

ATTACK OR FAILURE SCENARIO:

EXPECTED BEHAVIOR:

RECOMMENDED CORRECTION:

DOES THIS REQUIRE A NEW ARCHITECTURAL DECISION?
YES / NO

DOES THIS CONFLICT WITH AN EXISTING HUMAN DECISION?
YES / NO

Do not make changes.

Return findings only.


======================================================================
13. FINDING HANDOFF
     (v1.1: classification applies to all AI reviewers)
======================================================================

Findings from ANY AI reviewer (DeepSeek, Gemini, CodeRabbit, or other)
must NOT automatically become implementation instructions.

Claude must evaluate each finding and classify it as exactly one of:

VALID
PARTIALLY VALID
INVALID
REQUIRES HUMAN DECISION

with reasoning and evidence for the classification.

No AI finding becomes an implementation instruction merely because
another AI agrees with it.

No majority vote, consensus score, quorum, confidence score, or level of
AI agreement may cross a human authorization gate.

A finding classified VALID is a candidate for remediation. It is not
remediation authorization. Acting on it still requires 2A, GATE 3.


======================================================================
14. DISAGREEMENT RULE
     (v1.1: multi-AI)
======================================================================

If independent reviewers disagree with each other, or with Claude, on a
HIGH or CRITICAL issue:

DO NOT let one AI overrule another automatically.

DO NOT resolve the disagreement by counting agreeing AI systems.

Classify the disagreement.

Material disagreement involving any of:

- architecture
- security
- authorization
- money
- settlement
- ledger / accounting
- database integrity
- regulatory posture
- identity / KYC
- production access
- secrets
- irreversible or destructive actions

must cause:

STOP - HUMAN DECISION REQUIRED

The single exception: the disagreement is conclusively resolved by
deterministic evidence (a reproducible test, a schema fact, a migration
result, a documented human decision) entirely within already-approved
architecture. "Conclusively" means the evidence eliminates the
disagreement, not that it favours one side.

If resolution would require new architecture, new interpretation of an
approved decision, or a judgement call about acceptable risk, the
exception does not apply.

When in doubt:

STOP - HUMAN DECISION REQUIRED


======================================================================
14A. REVIEW PROVENANCE RECORD
======================================================================

Every independent AI review used as evidence for a HIGH or CRITICAL
change must be recorded. Where applicable, capture:

- provider
- model / model family
- role (adversarial review, verification, research)
- date and time
- repository
- branch
- exact commit SHA reviewed
- base SHA
- files or diff actually reviewed
- governing ADR / decision baseline
- prompt or review-instruction version used
- findings
- severity per finding
- evidence supplied to the reviewer
- Claude disposition per finding (section 13 classification)
- human ruling where one was required
- final status

A review that cannot be tied to the exact relevant revision must NOT be
treated as authoritative evidence for that revision.

Consequences:

- a review of an earlier SHA is not evidence for a later SHA
- a review of a subset of the diff is evidence only for that subset
- an undated or unattributed review is not evidence
- a remembered, summarized or paraphrased review is not evidence

Where a required provenance record is missing or incomplete, the review
is treated as ABSENT for gate purposes.


======================================================================
15. SECURITY ADVERSARIAL REVIEW
======================================================================

Independent reviewers should sometimes be explicitly instructed to act
adversarially.

Examples:

"Find a way to cause duplicate settlement."

"Find a way to bypass authorization."

"Find a way to modify historical financial definitions."

"Find a way to replay this webhook."

"Find a race condition in matching."

"Find a way for User A to access User B data."

"Find a way an administrator could exceed their privileges."

The purpose is defensive security review only.


======================================================================
16. TEST GENERATION
======================================================================

Independent reviewers may recommend additional tests.

Claude remains responsible for integrating approved tests.

Useful categories:

- positive tests
- negative tests
- boundary tests
- concurrency tests
- replay tests
- authorization tests
- idempotency tests
- migration tests
- rollback tests
- failure-recovery tests
- malformed-input tests

A recommended test is not an authorized change. Adding tests to the
repository is a code change and requires 2A, GATE 2 or GATE 3.


======================================================================
17. CODERABBIT
======================================================================

CodeRabbit remains an independent PR review layer.

CodeRabbit does not replace DeepSeek or Gemini.

DeepSeek and Gemini do not replace CodeRabbit.

They serve different purposes.

DeepSeek:
architecture-aware adversarial review.

Gemini:
secondary independent verification and research
(role defined; operational use NOT CLEARED - see 4A.1).

CodeRabbit:
PR / diff-oriented automated review.


======================================================================
18. CI
======================================================================

CI is authoritative evidence that automated checks ran.

CI is NOT evidence that the architecture is correct.

CI is NOT authorization at any gate in 2A.

CI should eventually cover as applicable:

- unit tests
- integration tests
- PostgreSQL tests
- security tests
- linting
- type checking
- secret scanning
- dependency scanning
- SAST
- migration verification
- frontend checks


======================================================================
19. XSPEERIA FINANCIAL RULE
======================================================================

No AI may independently alter the canonical financial architecture.

Current authoritative money representation:

integer minor units
+
currency
+
scale
+
currency_def_version

Do not replace with floating-point financial representation.

Binary floating point must never be used for authoritative monetary
state.


======================================================================
19A. FINANCIAL AUTHORITY BOUNDARY
======================================================================

AI may:

- analyze
- recommend
- classify
- explain
- detect anomalies
- assist with support
- propose actions

AI must NOT itself be the authoritative system for:

- account balances
- settlement truth
- ledger truth
- final money movement authorization
- reconciliation truth
- payout authorization
- KYC approval
- sanctions / compliance final disposition
- privileged database mutation

Authoritative financial state remains controlled by the approved
deterministic application and database architecture.

An AI output is an input to a deterministic system. It is never the
system of record, and it is never the authorizing actor for money
movement.


======================================================================
20. SETTLEMENT RULE
======================================================================

Xspeeria is a walletless peer-to-peer fiat currency exchange
marketplace, per docs/13-governance/XSPEERIA_STANDING_STANDARDS.md.
Settlement occurs through applicable regulated banking/payment partners.

The walletless architecture must not be weakened. Xspeeria must not be
rewritten into a stored-value, wallet, escrow-wallet, or custody
product. Any proposal introducing stored customer balances or fund
custody is a product-identity change requiring explicit human approval
and regulatory review. It is never an implementation detail.

Do not modify canonical SettlementLeg states or transitions without
explicit human authorization.

Do not allow the client to authoritatively assert:

FUNDED
PAID_OUT
RETURNED

Production confirmation must come from approved trusted mechanisms.


======================================================================
21. CURRENCY DEFINITION RULE
======================================================================

Approved correction policy:

VERSION-ONLY - NEVER IN-PLACE.

Existing currency-definition rows are intended to be immutable.

CD3 approved architecture requires:

UPDATE prohibited
DELETE prohibited
TRUNCATE prohibited
whole-row immutability

New versions may be INSERTED.

Implementation requires its own authorization. See 21A.


======================================================================
21A. CD3 GOVERNANCE BOUNDARY
======================================================================

Recorded fact:

GATE 4.1B-CD3 architecture decisions CD3-H1 through CD3-H9 have human
approval, recorded 2026-09-01 in PROGRESS.md.

Equally recorded fact:

CD3 IMPLEMENTATION IS NOT AUTHORIZED.

This protocol does not authorize, and must not be cited as
authorizing, any of the following:

- CD3 enforcement implementation
- CD3 database triggers or trigger SQL
- migrations
- mutation-verification tests
- CD3 enforcement verification tests
- database roles or role changes
- GRANT / REVOKE
- ADR-003
- Decision 2
- S-2
- S-3
- Milestone 4.1C
- staging deployment
- production deployment

CD3 is DECIDED, NOT DISCHARGED.

This is the canonical illustration of 2A: architecture approval at
GATE 1 with no authorization at GATE 2. The existence of an approved CD3
contract, and the existence of this protocol describing it, together
authorize nothing.

PROGRESS.md remains the authoritative record of CD3 status. This
document restates that record; it does not amend it.


======================================================================
22. DATABASE RULE
======================================================================

PostgreSQL 16 is the authoritative money-path database and the
authoritative money-path consistency authority.

Do not replace it with:

SQLite
browser state
frontend state
NoSQL
Redis
Base44
Supabase
Firebase

as authoritative financial storage without a new explicit human
architecture decision.


======================================================================
23. FRONTEND RULE
======================================================================

The frontend is UNTRUSTED for authoritative financial decisions.

The browser may request.

The backend decides.

Frontend restrictions are not security controls.


======================================================================
24. EXTERNAL AI RULE
     (v1.1: external AI data controls)
======================================================================

Do not expose unnecessary real production data to external AI systems,
including Claude, DeepSeek, Gemini, CodeRabbit, or any other provider.

Specifically protected:

- customer PII
- KYC documents
- bank information
- payment credentials
- passwords
- authentication tokens
- API secrets
- private keys
- encryption keys
- confidential customer financial information
- proprietary production datasets

Prefer instead:

- synthetic data
- redacted fixtures
- minimized examples
- structurally equivalent test records

Minimization is the default: supply the least data that permits a
correct review.

Any future use of sensitive production data with an AI provider requires
separate security, legal and privacy review, and explicit human
authorization. Convenience, urgency, or reviewer request is not a
sufficient basis.

This section governs WHAT data may be sent to an approved provider. It
does not by itself establish that a given provider is approved. For
Gemini, see 4A.1.


======================================================================
25. SPEED OPTIMIZATION
======================================================================

Multi-AI review must NOT unnecessarily slow ordinary development.

LOW:
Claude only by default.

MEDIUM:
Independent review selected by risk.

HIGH:
DeepSeek mandatory; Gemini strongly recommended, subject to 4A.1.
Whether Gemini is required for a given HIGH-risk change is decided by
the Human Owner per 9.1, and a decision not to use Gemini must be
recorded and revision-bound (9.1, 6B). See section 9 for the governing
requirement list.

CRITICAL:
DeepSeek adversarial review mandatory; Gemini verification mandatory
subject to 4A.1, absent a recorded human waiver. While Gemini
operational clearance is absent, 4A.2 governs; every waiver must
satisfy 6B. See section 10 for the governing requirement list.

This section is a summary of sections 7 through 10. It does not create,
relax, or vary any requirement. Where this summary and sections 7
through 10 differ, sections 7 through 10 govern.

This preserves speed while applying stronger controls where failure
would have greater consequences.

Speed is never a reason to bypass a human gate in 2A.


======================================================================
26. NO DUPLICATED IMPLEMENTATION
======================================================================

Do NOT routinely ask two AI systems to independently implement the same
feature.

That wastes time and creates competing architectures.

Instead:

Claude:
IMPLEMENT.

DeepSeek:
ATTACK / REVIEW.

Gemini:
VERIFY / RESEARCH, once operationally cleared per 4A.1.

Claude:
REMEDIATE, when remediation is authorized.


======================================================================
27. ESCALATION
======================================================================

Immediately escalate to the human owner when:

- architecture must change
- an existing human decision appears wrong
- implementation cannot satisfy approved architecture
- a security requirement conflicts with functionality
- regulatory assumptions are required
- a destructive migration becomes necessary
- an irreversible operation is proposed
- production credentials are required
- financial semantics are ambiguous
- the applicable authorization gate is unclear
- independent reviewers materially disagree (section 14)
- required review provenance is missing (14A)
- a workflow step requires an AI provider that is not operationally
  cleared (4A.1)


======================================================================
28. MERGE AUTHORITY
======================================================================

No AI system has standing authority to merge gated Xspeeria changes.

A clean review means:

READY FOR HUMAN DECISION.

It does NOT mean:

AUTHORIZED TO MERGE.

Merge authorization is specific to a named PR at a named head commit.
It does not extend to a later commit on the same PR.


======================================================================
29. PRODUCTION AUTHORITY
======================================================================

Merge authorization does not automatically authorize deployment.

Deployment to staging does not authorize deployment to production.

A successful deployment is not authorization for anything that follows
it.

Production financial changes require whatever production gate is defined
for that milestone, granted explicitly by the human owner.


======================================================================
30. CORE PRINCIPLE
======================================================================

The purpose of multiple AI systems is not to obtain artificial
consensus.

The purpose is to create independent scrutiny.

CLAUDE BUILDS.

DEEPSEEK CHALLENGES.

GEMINI VERIFIES, once operationally cleared.

CODERABBIT REVIEWS THE PR.

CI VERIFIES DETERMINISTICALLY.

THE HUMAN DECIDES.

Independent scrutiny raises confidence. It never transfers authority.


======================================================================
31. CHANGE LOG - v1.0 TO v1.1
======================================================================

SECTION NUMBER STABILITY

All thirty v1.0 section numbers are preserved with their original
subject matter and original meaning:

  1  OBJECTIVE
  2  HUMAN AUTHORITY
  3  PRIMARY AI RESPONSIBILITIES
  4  DEEPSEEK RESPONSIBILITY
  5  REPOSITORY WRITE OWNERSHIP
  6  RISK-BASED REVIEW
  7  LOW-RISK CHANGES
  8  MEDIUM-RISK CHANGES
  9  HIGH-RISK CHANGES
  10 CRITICAL CHANGES
  11 DEEPSEEK REVIEW RULE
  12 MASTER DEEPSEEK REVIEW PROMPT
  13 FINDING HANDOFF
  14 DISAGREEMENT RULE
  15 SECURITY ADVERSARIAL REVIEW
  16 TEST GENERATION
  17 CODERABBIT
  18 CI
  19 XSPEERIA FINANCIAL RULE
  20 SETTLEMENT RULE
  21 CURRENCY DEFINITION RULE
  22 DATABASE RULE
  23 FRONTEND RULE
  24 EXTERNAL AI RULE
  25 SPEED OPTIMIZATION
  26 NO DUPLICATED IMPLEMENTATION
  27 ESCALATION
  28 MERGE AUTHORITY
  29 PRODUCTION AUTHORITY
  30 CORE PRINCIPLE

An audit reference to any v1.0 section number resolves to the same
subject in v1.1.

NEW v1.1 IDENTIFIERS

  0    ADOPTION AND SCOPE OF AUTHORITY NOTICE
  2A   AUTHORIZATION LAYER SEPARATION
  4A   GEMINI RESPONSIBILITY
  4A.1 GEMINI OPERATIONAL STATUS: NOT YET CLEARED
  4A.2 GEMINI INTERIM RULE
  4B   MULTI-AI OPERATING MODEL
  6A   CLASSIFICATION AUTHORITY
  6B   WAIVER MECHANICS
  9.1  GEMINI VERIFICATION DISCRETION AT HIGH RISK
  14A  REVIEW PROVENANCE RECORD
  19A  FINANCIAL AUTHORITY BOUNDARY
  21A  CD3 GOVERNANCE BOUNDARY
  31   CHANGE LOG (this section)
  32   HUMAN-DECIDED GOVERNANCE QUESTIONS - Q1-Q8

AMENDMENTS

A. Added 2A, AUTHORIZATION LAYER SEPARATION: seven explicit gates,
   none implying another.
B. Added 4A, GEMINI RESPONSIBILITY: governed secondary AI role,
   read-only, with explicit financial and identity exclusions; and
   4A.1, recording that operational provider and data use is NOT
   CLEARED and requires a separate human decision.
C. Added 4B, MULTI-AI OPERATING MODEL, and updated the section 1
   hierarchy to include Gemini.
D. Extended finding classification to all AI reviewers (section 13) and
   extended the disagreement rule (section 14) to multi-AI, with the
   explicit STOP - HUMAN DECISION REQUIRED outcome and a narrow
   deterministic-evidence exception.
E. Clarified risk-class requirements in sections 7-10 and 25,
   distinguishing mandatory from recommended layers per class.
F. Added 14A, REVIEW PROVENANCE RECORD, required for HIGH and CRITICAL
   changes, with revision binding.
G. Strengthened section 24, EXTERNAL AI RULE: broader protected list,
   explicit preference for synthetic and redacted data, separate review
   required for any production-data use, and an explicit statement that
   the section governs data classification rather than provider
   approval.
H. Added 19A, FINANCIAL AUTHORITY BOUNDARY.
I. Preserved and, where they were implicit, made explicit the
   Xspeeria-specific rules: PostgreSQL 16 as money-path consistency
   authority (22), integer minor-unit money with currency, scale and
   currency_def_version (19), VERSION-ONLY currency correction (21),
   walletless P2P settlement (20), untrusted frontend (23), external AI
   data restrictions (24), human merge authority (28), separate
   production authority (29).
J. Added 21A, CD3 GOVERNANCE BOUNDARY: records CD3-H1 to CD3-H9 human
   approval while stating that no CD3 implementation is authorized.
K. Converted all diagram glyphs to plain ASCII to eliminate the
   mojibake risk class. No substantive text was altered for style.
L. Added section 0 (no-authority notice) and section 32, which records
   governance questions Q1-Q8. Q1-Q8 were subsequently ruled on by the
   Human Owner and are recorded as HUMAN-DECIDED.
M. Section titles for 11, 12, 13, 14 and 24 carry a parenthetical
   v1.1 note where scope was extended. The v1.0 title text is retained
   verbatim on the same line so audit references remain resolvable.

N. Recorded the Human Owner rulings of 2026-09-02 on Q1-Q8 and on the
   Gemini interim state, and gave them operative effect in 0.1, 0.2,
   0.3, 0.4, 4A.1, 4A.2, 6A, 6B, 9.1 and 10. Section 32 was converted
   from an open-question register to a human-decided record retaining
   the original issue and its rationale for each question. Recording
   these rulings did not adopt this protocol (section 0), did not
   clear Gemini for operational use (4A.1), and did not authorize CD3
   implementation (21A).

O. Recorded the Human Owner's REVISED Q3 authority-order ruling of
   2026-09-02, superseding only the original Q3 authority-order
   ruling. 0.2 and the section 32 Q3 record now state only that this
   protocol ranks below CLAUDE.md, all explicit human-approved
   architecture and engineering decisions (including the Standing
   Standards and approved ADRs), DOCUMENT_INDEX.md and
   docs/00-source-of-truth/, and expressly decline to rank those
   sources against each other. The superseded ordering, which placed
   DOCUMENT_INDEX.md above XSPEERIA_STANDING_STANDARDS.md and omitted
   approved ADRs, is retained in section 32 for history and has no
   further effect. Alongside it: section 25 gained cross-references to
   9.1, 6B and sections 7-10 and an explicit statement that it is a
   summary which creates no requirement; 32.1 gained a pointer to
   XSPEERIA_STANDING_STANDARDS.md section 15 and PROGRESS.md for open
   decisions, changing no decision status; and 4A.1 scope-qualified
   "authoritative" to the scope of this protocol. No substantive risk,
   review, waiver, financial, security or CD3 requirement was changed.
   This entry records edits to a proposal. It does not adopt this
   protocol, does not authorize tracking, commit, PR or merge, does not
   clear Gemini, and does not authorize CD3 implementation.

P. Recorded HUMAN ADOPTION of this protocol by the Human Owner on
   2026-09-02, at proposal source revision SHA-256
   533d45fd30934185006b3473018e8c17a1c59cbc69cbc609d64baa4a476f9b95.
   Adoption-status wording only: the header status block and adoption
   record, section 0 (retitled ADOPTION AND SCOPE OF AUTHORITY
   NOTICE), 0.1, 0.3 status note, 0.4, the adoption-status paragraph
   preceding section 1, the 4A.1 scope sentence, the Gemini ROLE
   DEFINITION status line, section 32 preamble, 32.1 and the closing
   block. No substantive policy rule was changed. Q1-Q8 rulings, the
   Gemini Interim Rule (4A.2), waiver mechanics (6B), classification
   authority (6A), the risk-class requirements (7-10, 25), and all
   financial, security, database, settlement, currency, external-AI
   and CD3 provisions are unchanged. Adoption authorized no work: PR
   merge, Gemini operational use, CD3 implementation, staging and
   production all remain NOT AUTHORIZED.

No provision of v1.0 was removed or weakened, and no v1.0 section was
renumbered.


======================================================================
32. HUMAN-DECIDED GOVERNANCE QUESTIONS - Q1-Q8
======================================================================

STATUS: HUMAN-DECIDED. Recorded 2026-09-02.

Q1 through Q8 were open governance questions raised by this proposal.
They were ruled on by the Human Owner and are recorded here with the
original issue and the reason it mattered preserved, so that the record
shows what was decided and why the decision was needed.

Each entry below records four things:

  ISSUE           the original open question, unaltered in substance
  WHY IT MATTERED the governance risk that made it a question
  HUMAN RULING    the Human Owner decision
  PROTOCOL RULE   where the ruling takes operative effect

Recording these rulings did not, by itself, adopt this protocol.
Adoption was a separate, explicit Human Owner decision taken afterward
and recorded in section 0 (2026-09-02). The rulings are operative
within the scope stated in 0.2, and never above a higher-authority
source.

The Gemini interim state was ruled on at the same time and is recorded
as 4A.2. It does not grant Gemini operational clearance.


----------------------------------------------------------------------
Q1. ADOPTION STATUS OF v1.0 - HUMAN-DECIDED
----------------------------------------------------------------------

ISSUE
    This file is untracked and no commit or decision record adopts
    v1.0. This proposal therefore treats neither version as ratified.
    If v1.0 was in fact intended to be in force, that intent is not
    recorded anywhere the repository can evidence.

WHY IT MATTERED
    If v1.0 were treated as authoritative without evidence, past work
    could be retrospectively justified by appeal to a protocol that was
    never ratified, and v1.1 would be mis-framed as an amendment to a
    document already in force.

HUMAN RULING
    v1.0 was NEVER FORMALLY ADOPTED.
    If v1.1 is later adopted, it becomes the FIRST authoritative
    version of this protocol.

PROTOCOL RULE
    Recorded and operative in 0.1. v1.0 holds no normative authority,
    creates no retrospective approval, and may not be cited to justify
    any past action.


----------------------------------------------------------------------
Q2. LOCATION AND TRACKING OF THIS PROTOCOL - HUMAN-DECIDED
----------------------------------------------------------------------

ISSUE
    An untracked governance document cannot be cited by SHA, cannot be
    reviewed in a PR, and is invisible to CI. 14A requires
    revision-bound evidence, which this document cannot itself provide
    while untracked. Whether, when and how this document becomes
    tracked was a human decision.

WHY IT MATTERED
    Tracking a governance document is itself a governance act. Doing it
    incidentally, inside an unrelated change, would place a protocol in
    the repository without dedicated review.

HUMAN RULING
    The document REMAINS UNTRACKED during proposal preparation.
    After final human review it MAY become tracked ONLY through a
    dedicated governance PR carrying revision-bound review, applicable
    CI, CodeRabbit review where applicable, and explicit human merge
    authorization.
    This ruling does NOT itself authorize tracking, staging, commit,
    push, PR creation, or merge.

PROTOCOL RULE
    Recorded and operative in 0.3. The ruling defines the only
    permitted future route to tracking; it is not permission to take
    that route.


----------------------------------------------------------------------
Q3. RELATIONSHIP TO XSPEERIA_STANDING_STANDARDS.md AND CLAUDE.md
    - HUMAN-DECIDED (REVISED RULING)
----------------------------------------------------------------------

ISSUE
    CLAUDE.md defines an authority order in which this document is not
    named. This proposal assumed it ranks below CLAUDE.md,
    DOCUMENT_INDEX.md, docs/00-source-of-truth/ and the standing
    standards, and adds no authority of its own. That ranking was
    asserted in section 0 but had not been human-ratified.

WHY IT MATTERED
    An AI-prepared document asserting its own place in the authority
    order is self-granted authority. Without ratification, a conflict
    between this protocol and higher governance had no defined
    resolution.

    A second problem was identified after the original ruling: by
    stating a relative ORDER among the sources above it, the protocol
    ordered documents it has no authority to order. That order placed
    DOCUMENT_INDEX.md above XSPEERIA_STANDING_STANDARDS.md, which
    conflicts with XSPEERIA_STANDING_STANDARDS.md section 1.1, and it
    omitted approved ADRs and other explicit human-approved
    architecture and engineering decisions entirely.

SUPERSEDED RULING (retained for history, NO FURTHER EFFECT)
    The original Q3 ruling recorded the ranking:
      1. CLAUDE.md
      2. DOCUMENT_INDEX.md
      3. docs/00-source-of-truth/
      4. docs/13-governance/XSPEERIA_STANDING_STANDARDS.md
      5. this protocol
    That authority-order ruling is SUPERSEDED by the revised ruling
    below and has no further effect. It is retained only so the reason
    for the revision survives.

HUMAN RULING (REVISED, RECORDED 2026-09-02)
    The Xspeeria Dual-AI Engineering Protocol ranks BELOW:
      - CLAUDE.md
      - all explicit human-approved architecture and engineering
        decisions, including the Xspeeria Standing Standards and
        approved ADRs
      - DOCUMENT_INDEX.md
      - docs/00-source-of-truth/

    The relative authority of higher-order repository documents is
    governed by the existing repository authority model and the
    applicable human-ratified standing standards. This protocol does
    not redefine that hierarchy.

    If higher-authority sources conflict and repository governance does
    not unambiguously resolve the conflict:
    STOP - HUMAN DECISION REQUIRED.

    This ruling supersedes ONLY the previously approved Q3
    authority-order ruling. It does not adopt this protocol and does
    not authorize tracking, commit, PR, merge, Gemini operational use,
    CD3 implementation, staging, or production.

PROTOCOL RULE
    Recorded and operative in 0.2. This protocol must not override any
    higher-authority source, must not be cited as stating the relative
    order of those sources, and no AI may silently prefer either
    document in a conflict.


----------------------------------------------------------------------
Q4. GEMINI ONBOARDING PRECONDITIONS - HUMAN-DECIDED
----------------------------------------------------------------------

ISSUE
    4A.1 records that Gemini operational use is NOT CLEARED and
    enumerates what a clearance decision must define. The decision
    itself does not exist. Which account, tenancy, tier, data
    classifications, retention, training-use, region, key management,
    logging, and permitted or prohibited use cases apply remained
    undetermined.

WHY IT MATTERED
    Defining a governance role for an external AI provider is easily
    mistaken for permission to send that provider repository content,
    customer data, or credentials. It is not.

HUMAN RULING
    Gemini remains NOT OPERATIONALLY CLEARED.
    Any future Gemini provider / data-handling clearance MUST run under
    XSPEERIA_STANDING_STANDARDS.md section 14, New-Vendor / Dependency
    Gate.
    No Gemini provider decision is authorized or created by this
    protocol or by this ruling.

PROTOCOL RULE
    Recorded and operative in 4A.1. Role definition and operational
    clearance remain distinct statuses and must not be conflated. The
    interim state, while clearance is absent, is governed by 4A.2.

STILL OPEN (NOT decided here)
    The actual Gemini provider / data-handling clearance decision.


----------------------------------------------------------------------
Q5. "STRONGLY RECOMMENDED" AT HIGH RISK - HUMAN-DECIDED
----------------------------------------------------------------------

ISSUE
    Section 9 makes Gemini verification strongly recommended rather
    than mandatory, per the amendment instruction. This creates a
    discretionary layer. Who exercises that discretion, and whether a
    decision not to use Gemini must be recorded, was unspecified.

WHY IT MATTERED
    An unowned discretionary control degrades silently: the layer is
    simply never used, and no record shows that anyone decided to skip
    it.

HUMAN RULING
    For HIGH-risk work, the HUMAN OWNER decides whether Gemini
    verification is required.
    If Gemini is not used, the decision and its rationale MUST be
    recorded and revision-bound.
    Silence or omission is NOT such a decision.

PROTOCOL RULE
    Recorded and operative in 9.1, with the section 9 requirement list
    updated to point to it. Waiver and recording mechanics per 6B and
    14A.


----------------------------------------------------------------------
Q6. WAIVER MECHANICS - HUMAN-DECIDED
----------------------------------------------------------------------

ISSUE
    Sections 9, 10 and 25 permit human waivers with recorded rationale.
    Where such waivers are recorded, and whether a waiver is scoped to
    one revision, was unspecified.

WHY IT MATTERED
    An unscoped waiver becomes a standing exemption. Without revision
    binding, a single past approval can be reused to excuse later,
    different work.

HUMAN RULING
    Every governance waiver MUST be explicit, written, revision-bound,
    scope-bound, one-time by default, attributable to the Human Owner,
    and recorded with the relevant evidence.
    No waiver automatically extends to another commit, PR, branch,
    release, later similar work, or indefinite future use.

PROTOCOL RULE
    Recorded and operative in 6B, which governs every waiver referenced
    anywhere in this protocol, including the Gemini-unavailability
    waiver in 4A.2. A waiver failing any element is not a waiver.


----------------------------------------------------------------------
Q7. CLASSIFICATION AUTHORITY - HUMAN-DECIDED
----------------------------------------------------------------------

ISSUE
    Section 6 requires every task to be risk-classified but did not
    state who classifies, or whether a Claude-proposed classification
    of HIGH or CRITICAL requires human confirmation.

WHY IT MATTERED
    Risk class selects the review layers. If an AI can set the class
    unchecked, it can select its own oversight, and the entire
    risk-based model becomes self-certifying.

HUMAN RULING
    Claude MAY propose the initial risk classification.
    LOW/MEDIUM may proceed, subject to existing escalation rules.
    HIGH/CRITICAL require Human Owner confirmation.
    Ambiguity classifies UPWARD temporarily, or requires:
    STOP - HUMAN DECISION REQUIRED.
    No AI may downgrade risk to bypass controls.

PROTOCOL RULE
    Recorded and operative in 6A. A downgrade is a governance act
    reserved to the Human Owner.


----------------------------------------------------------------------
Q8. RETROACTIVE EFFECT - HUMAN-DECIDED
----------------------------------------------------------------------

ISSUE
    Whether this protocol, if adopted, applies to work already merged,
    or only to work initiated after adoption, was unspecified.

WHY IT MATTERED
    Unbounded retroactivity would reopen completed work without cause;
    unbounded prospectivity could be misread as discharging obligations
    that already exist independently of this protocol.

HUMAN RULING
    If v1.1 is later adopted, it applies PROSPECTIVELY from its
    effective adoption / merge revision.
    Previously merged work is NOT automatically reopened solely because
    of this protocol.
    Historical work may still require review because of:
      - an unresolved existing governance gate
      - a material change
      - a security or production incident
      - an audit finding
      - a compliance finding
      - an integrity concern
      - an explicit human instruction

PROTOCOL RULE
    Recorded and operative in 0.4. Prospective effect does not erase,
    discharge, or reinterpret any pre-existing unresolved obligation.


----------------------------------------------------------------------
32.1  WHAT THESE RULINGS DID NOT DECIDE
----------------------------------------------------------------------

The following remain OPEN and require separate human decisions. Nothing
in Q1-Q8 or in 4A.2 authorizes any of them:

- ADOPTION of this protocol. NOT decided by the Q1-Q8 rulings. It was
  subsequently decided by a separate, explicit Human Owner adoption on
  2026-09-02 (section 0).
- TRACKING of this file. NOT decided by the Q1-Q8 rulings. Tracking
  through the dedicated governance PR route in 0.3 was subsequently
  authorized by the Human Owner on 2026-09-02. MERGE of that PR
  remains NOT AUTHORIZED and requires explicit Human Owner
  authorization bound to the exact reviewed PR head revision.
- GEMINI PROVIDER / DATA-HANDLING CLEARANCE. Gemini operational use
  remains NOT CLEARED (4A.1, Q4).
- CD3 IMPLEMENTATION, which remains NOT AUTHORIZED (21A).
- Any future merge or production authorization (28, 29).

The list above is not exhaustive. Open Xspeeria governance decisions
are recorded authoritatively in
docs/13-governance/XSPEERIA_STANDING_STANDARDS.md section 15, and in
PROGRESS.md where that document is the authoritative record. Nothing in
Q1-Q8, in 4A.2, or anywhere in this protocol decides, defaults,
narrows, or changes the status of any decision recorded there. Those
records govern their own status; this protocol only points to them.

Where a question in this section is decided, the ruling governs. Where
a matter is listed above, or recorded as open in an authoritative
record, the conservative reading applies: assume the stricter gate, and
escalate rather than infer.


======================================================================
END OF PROTOCOL - VERSION 1.1 - HUMAN-ADOPTED
======================================================================

This protocol was adopted by the Human Owner on 2026-09-02 (section 0),
at proposal source revision SHA-256
533d45fd30934185006b3473018e8c17a1c59cbc69cbc609d64baa4a476f9b95.

Its authority is bounded by 0.2. Adoption authorized no work under it;
every gate in 2A remains separately required.

GEMINI OPERATIONAL USE:  NOT CLEARED (see 4A.1, 4A.2).
CD3 IMPLEMENTATION:      NOT AUTHORIZED (see 21A).
PR MERGE:                NOT AUTHORIZED (see 0.3, 28).
STAGING:                 NOT AUTHORIZED (see 2A GATE 6, 29).
PRODUCTION:              NOT AUTHORIZED (see 2A GATE 7, 29).
