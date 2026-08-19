---
name: xspeeria-security-check
description: Perform the Xspeeria fintech security gate against actual repository, configuration, test and implementation evidence.
---

# /xspeeria-security-check

## Purpose

Perform an evidence-based security assessment of the actual Xspeeria implementation.

This command does not assume that documented controls exist in code.

Security claims require implementation evidence.

## Mandatory authority

Read in this order:

1. `CLAUDE.md`
2. `DOCUMENT_INDEX.md`
3. `docs/07-security/Xspeeria_Security_Master_Audit.md`
4. `.claude/skills/xspeeria-security/SKILL.md`
5. Relevant architecture, API, financial, banking, compliance and infrastructure specifications
6. Actual implementation
7. Actual tests and configuration

Read the Security Master Audit in full before producing a final security conclusion.

---

# 1. AUDIT PRINCIPLE

Use:

`DENY BY DEFAULT — VERIFY BY EVIDENCE`

Never infer security merely because:

- authentication exists
- middleware exists
- an endpoint is hidden
- the frontend restricts access
- RLS is enabled
- a security package is installed
- a control appears in documentation
- a test file exists

Verify actual execution paths.

---

# 2. REQUIRED INITIAL RECONNAISSANCE

Before findings, map:

- application entry points
- FastAPI routers
- public endpoints
- authenticated endpoints
- privileged/admin endpoints
- authentication flows
- authorization mechanisms
- database access paths
- financial operations
- banking/payment integrations
- webhook endpoints
- upload/storage paths
- background workers
- scheduled jobs
- external integrations
- secrets/configuration sources
- logging/monitoring paths
- deployment/infrastructure boundaries

Produce an attack-surface map.

---

# 3. TRUST-BOUNDARY MAP

Identify trust boundaries between:

- internet and application
- client and API
- API and database
- API and Redis
- API and workers
- application and banking/payment providers
- provider and webhook receiver
- application and storage
- user and administrative functions
- normal user and compliance functions
- normal user and financial functions
- application and infrastructure
- AI/LLM components and deterministic systems, if present

Record what security control protects each boundary.

---

# 4. FASTAPI SECURITY REVIEW

Inspect actual FastAPI implementation for:

- router exposure
- dependency-based authentication
- authorization dependencies
- security scopes where applicable
- request validation
- response schemas
- exception handling
- middleware
- CORS configuration
- trusted-host configuration where applicable
- HTTPS/proxy assumptions
- debug configuration
- documentation/OpenAPI exposure decisions
- rate limiting
- upload handling
- background tasks
- dependency injection security

Do not assume a route is protected because another route is protected.

Review sensitive endpoints individually.

---

# 5. AUTHENTICATION REVIEW

Verify:

- credential validation
- password handling
- password hashing configuration
- token issuance
- token verification
- token expiry
- token revocation strategy where required
- session handling where applicable
- password reset
- OTP/verification flows
- brute-force protections
- account enumeration resistance
- MFA requirements where applicable
- sensitive-operation reauthentication where required

Authentication must fail closed.

---

# 6. AUTHORIZATION REVIEW

For every sensitive operation determine:

- authenticated actor
- required role/permission
- target resource
- ownership rule
- permitted state
- server-side authorization mechanism

Explicitly test or trace:

`USER A → USER B RESOURCE`

`TENANT A → TENANT B RESOURCE`

`NORMAL USER → ADMIN FUNCTION`

`NORMAL USER → COMPLIANCE FUNCTION`

`NORMAL USER → PRIVILEGED FINANCIAL FUNCTION`

Unauthorized access must fail.

Never accept client-supplied identity or privilege as authoritative.

---

# 7. API DATA-EXPOSURE REVIEW

Inspect response schemas and serialization.

Look for unnecessary exposure of:

- PII
- KYC data
- banking information
- transaction internals
- provider metadata
- administrative fields
- compliance notes
- security configuration
- internal identifiers
- fraud/risk internals
- secrets

Require explicit response models for sensitive APIs where appropriate.

Return only data required for the authorized operation.

---

# 8. SECRET SECURITY REVIEW

Search appropriate repository and configuration locations for potential:

- API keys
- passwords
- tokens
- private keys
- database credentials
- banking credentials
- payment-provider credentials
- webhook secrets
- JWT secrets
- cloud credentials
- SMTP credentials

Never print discovered secret values.

Report:

`POTENTIAL SECRET EXPOSURE`

with:

- location
- category
- severity
- remediation

Verify `.gitignore`.

Verify `.env.example` contains placeholders only.

Check whether frontend-accessible configuration exposes server secrets.

---

# 9. DATABASE SECURITY REVIEW

Inspect:

- connection configuration
- database roles
- least privilege
- ORM usage
- raw SQL
- parameterization
- ownership checks
- constraints
- indexes relevant to security/integrity
- migrations
- privileged functions
- service credentials
- RLS/policies where applicable
- backup/security assumptions

Never conclude:

`RLS enabled = secure`

Verify actual policy behavior.

---

# 10. FINANCIAL SECURITY REVIEW

Trace each material financial flow:

REQUEST  
→ AUTHORIZATION  
→ VALIDATION  
→ AMOUNT/RATE/FEE DETERMINATION  
→ TRANSACTION CREATION  
→ PROVIDER/BANK INTERACTION  
→ STATE TRANSITION  
→ SETTLEMENT  
→ RECONCILIATION  
→ AUDIT TRAIL

Verify:

- Decimal/fixed precision
- currency validation
- server-authoritative values
- permitted state transitions
- idempotency
- duplicate handling
- retry behavior
- timeout behavior
- concurrency
- reversal behavior
- reconciliation
- auditability

Client input must not determine authoritative:

- balance
- exchange rate
- fee
- settlement status
- payment status
- transaction status

without server-side authoritative validation.

---

# 11. BANKING/PAYMENT SECURITY

Treat every financial provider as an external trust boundary.

Verify:

- credential storage
- outbound authentication
- TLS assumptions
- request validation
- timeout handling
- retry strategy
- idempotency
- duplicate responses/events
- provider downtime
- provider disagreement
- reconciliation
- audit trails

Never invent provider behavior.

If official provider behavior cannot be established:

`UNKNOWN — NOT VERIFIED`

---

# 12. WEBHOOK SECURITY

For every webhook inspect:

- signature verification
- timestamp/freshness verification where supported
- replay resistance
- payload validation
- event identity
- duplicate-event handling
- idempotency
- ordering behavior
- unknown-event behavior
- error handling
- logging
- financial-state implications

A webhook must never be trusted merely because it reached the endpoint.

---

# 13. KYC / PII / COMPLIANCE DATA

Identify sensitive personal and compliance information.

Verify:

- collection minimization
- access control
- storage protection
- API exposure
- logging behavior
- upload protection
- administrative access
- deletion/retention behavior where documented
- auditability

Do not expose raw KYC/compliance information to users or services that do not require it.

Do not invent legal retention requirements.

---

# 14. FILE / STORAGE SECURITY

For uploads verify:

- authorization
- size limits
- permitted file types
- content validation where applicable
- filename handling
- storage location
- public/private access
- retrieval authorization
- malicious-content considerations
- metadata exposure

Sensitive files must not become publicly retrievable by default.

---

# 15. BUSINESS-LOGIC ABUSE

Review whether legitimate functionality can be abused.

Examples:

- repeated quote generation
- transaction duplication
- race conditions
- settlement manipulation
- state skipping
- referral/promotion abuse where applicable
- enumeration
- verification abuse
- OTP abuse
- resource exhaustion
- bypassing workflow sequence

Security review must cover business logic, not merely conventional vulnerabilities.

---

# 16. RATE LIMITING

Identify sensitive or expensive operations requiring abuse protection.

Review:

- login
- registration
- OTP
- password reset
- verification
- quotes
- matching
- transaction creation
- financial operations
- uploads
- external API calls

Record missing or ineffective rate limits.

---

# 17. LOGGING / OBSERVABILITY

Verify logs do not expose:

- passwords
- tokens
- secrets
- private keys
- raw credentials
- unnecessary KYC/PII
- sensitive financial data

Verify important security/financial actions have sufficient audit evidence.

Where applicable require:

- actor
- action
- target
- result
- timestamp
- correlation identifier

---

# 18. DEPENDENCY / SUPPLY-CHAIN REVIEW

Inspect relevant:

- Python dependencies
- frontend dependencies
- lock files
- container images
- CI/CD actions
- external packages

Assess:

- unnecessary dependencies
- unpinned dependencies
- known vulnerabilities where tooling/evidence is available
- suspicious provenance
- abandoned packages
- excessive permissions

Do not fabricate vulnerability results when scanners were not executed.

---

# 19. INFRASTRUCTURE REVIEW

Where implementation exists, inspect:

- environment separation
- secrets management
- network exposure
- TLS
- container configuration
- privileged execution
- database exposure
- Redis exposure
- storage permissions
- CI/CD permissions
- production configuration
- backup controls
- monitoring
- recovery controls

Never deploy or alter production during an audit.

---

# 20. SECURITY TEST EVIDENCE

Inspect and, when permitted, execute relevant security tests.

Require coverage where applicable for:

- unauthenticated access
- unauthorized access
- object-level authorization
- function-level authorization
- cross-user isolation
- cross-tenant isolation
- privilege escalation
- malformed input
- invalid states
- replay
- duplicate requests
- concurrency
- sensitive-data exposure
- secret exposure
- rate-limit abuse
- provider failure

Never claim a test passed unless it actually ran and passed.

---

# 21. SAFE SECRET-SCANNING RULE

Security auditing must not leak the very secrets it is attempting to detect.

When searching:

- report file/path
- classify probable secret type
- redact values
- never paste discovered credentials into findings
- never transmit credentials to external services
- never rotate credentials automatically

---

# 22. FINDING SEVERITY

Use:

## CRITICAL

Likely or demonstrated compromise of financial integrity, authentication, authorization, secrets, sensitive data, or privileged systems with severe impact.

## HIGH

Material exploitable weakness requiring remediation before normal production release.

## MEDIUM

Meaningful weakness with constrained exploitability or impact.

## LOW

Limited security weakness or defense-in-depth issue.

## INFORMATIONAL

Observation or improvement without demonstrated material security impact.

---

# 23. REQUIRED FINDING FORMAT

For every finding provide:

- ID
- Severity
- Domain
- Affected path/component
- Evidence
- Attack/failure scenario
- Exploitability
- Business impact
- Remediation
- Verification method
- Residual risk

Do not include actual secret values.

---

# 24. REQUIRED OUTPUT

Produce:

1. Executive security summary
2. Evidence reviewed
3. Attack-surface map
4. Trust-boundary map
5. Authentication assessment
6. Authorization assessment
7. API/data-exposure assessment
8. Secret-management assessment
9. Database assessment
10. Financial-security assessment
11. Banking/payment assessment
12. Webhook assessment
13. KYC/PII assessment
14. Business-logic abuse assessment
15. Dependency assessment
16. Infrastructure assessment
17. Logging/monitoring assessment
18. Test-evidence assessment
19. Findings by severity
20. Unknown/unverified areas
21. Required remediation
22. Retest requirements
23. Residual risks
24. Final security release recommendation

---

# 25. EVIDENCE STATES

Use:

`DOCUMENTED`

`IMPLEMENTED`

`VERIFIED`

`UNKNOWN — NOT VERIFIED`

`DOCUMENTED BUT NOT IMPLEMENTED`

`IMPLEMENTED BUT NOT DOCUMENTED`

Never promote DOCUMENTED to VERIFIED without evidence.

---

# 26. FINAL SECURITY CLASSIFICATION

Return exactly one:

### SECURITY NO-GO

Critical security blockers or unacceptable unknowns prevent release.

### SECURITY CONDITIONAL

Material security remediation or verification is required before broader release.

### SECURITY LIMITED-PILOT

Security evidence supports only a tightly controlled pilot with documented restrictions.

### SECURITY VERIFIED FOR CURRENT RELEASE SCOPE

Evidence supports the reviewed release scope.

This classification does not constitute a legal, regulatory, banking or compliance certification.

---

# 27. NON-NEGOTIABLE RULE

Never reduce a finding's severity merely to achieve a favorable release classification.

Never fabricate evidence.

Never expose secrets.

Never bypass authorization to make functionality work.

When evidence is unavailable:

`UNKNOWN — NOT VERIFIED`