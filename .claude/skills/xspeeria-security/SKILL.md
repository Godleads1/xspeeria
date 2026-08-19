---
name: xspeeria-security
description: Apply mandatory security controls to all Xspeeria architecture, APIs, data, financial operations, integrations and implementation.
---

# XSPEERIA SECURITY ENGINEERING STANDARD

## Purpose

Security is a mandatory architectural property of Xspeeria, not a final-stage feature.

Every material implementation decision must be evaluated for:

- confidentiality
- integrity
- availability
- authentication
- authorization
- least privilege
- data isolation
- financial integrity
- auditability
- abuse resistance
- privacy
- operational security

Use:

`docs/07-security/Xspeeria_Security_Master_Audit.md`

as the mandatory project security baseline.

Documentation alone is not evidence that a control is implemented.

---

# 1. SECURITY DEFAULT

Xspeeria operates on:

`DENY BY DEFAULT — ALLOW EXPLICITLY`

Access must never exist merely because no restriction was implemented.

Every sensitive operation requires an explicit authorization rule.

Never weaken a security control merely to make a feature work.

---

# 2. TRUST BOUNDARIES

Treat all of the following as untrusted unless cryptographically or operationally verified:

- browser clients
- mobile clients
- user input
- URL parameters
- request headers
- cookies
- uploaded files
- webhook requests
- external APIs
- payment providers
- banking providers
- third-party integrations
- AI/LLM output
- client-side application state

Frontend validation is usability functionality.

It is NOT an authoritative security control.

Security decisions must be enforced server-side.

---

# 3. SECRETS

The following must never be exposed to frontend/mobile clients:

- database passwords
- API secrets
- private API keys
- service-role credentials
- banking credentials
- payment-provider secrets
- webhook signing secrets
- JWT signing secrets/private keys
- encryption keys
- SMTP credentials
- cloud credentials
- private certificates
- infrastructure credentials
- administrative tokens

Secrets must never be:

- hardcoded in source code
- committed to Git
- placed in public configuration
- returned through APIs
- embedded in frontend bundles
- exposed in exception messages
- printed during testing
- written to application logs
- included in screenshots or documentation

`.env.example` may contain variable NAMES and safe placeholders only.

It must never contain real credentials.

Production secrets should be provided through an approved secret-management mechanism.

---

# 4. SECRET FAILURE RULE

If a secret is discovered in:

- repository history
- source code
- configuration
- logs
- documentation
- frontend bundles

do not print or repeat the value.

Report:

`POTENTIAL SECRET EXPOSURE`

Identify only:

- file/path
- secret category
- exposure mechanism
- severity
- remediation requirement

Actual compromised credentials must be treated as requiring human-controlled rotation.

Claude must never rotate credentials without explicit approval.

---

# 5. AUTHENTICATION

Authentication establishes identity.

Authentication does NOT establish permission.

Protected endpoints must reject:

- missing credentials
- invalid credentials
- expired credentials
- revoked credentials where applicable

Authentication failures must not unnecessarily reveal account information.

Sensitive authentication flows require abuse controls.

---

# 6. AUTHORIZATION

Every sensitive API operation must enforce authorization server-side.

Authorization must answer:

1. Who is the authenticated actor?
2. What action are they requesting?
3. What resource are they requesting?
4. Do they own or have explicit permission to access it?
5. Does their role permit this action?
6. Does the current resource state permit the operation?

Never trust client-supplied:

- `userId`
- `tenantId`
- `role`
- `permission`
- `isAdmin`
- ownership
- account status
- verification status

Authoritative identity must come from the verified server-side authentication context.

---

# 7. OBJECT-LEVEL AUTHORIZATION

Knowing or guessing a resource identifier must never grant access.

For resources such as:

- user profiles
- transactions
- exchange requests
- orders
- settlement records
- bank accounts
- beneficiaries
- KYC records
- compliance records
- uploaded documents

the server must verify that the authenticated actor is permitted to access the specific object.

Test:

`USER A → USER B RESOURCE = DENIED`

where access is not explicitly authorized.

---

# 8. FUNCTION-LEVEL AUTHORIZATION

Privileged functionality must not be protected merely by hiding buttons or routes.

Administrative, compliance, financial and operational functions require explicit server-side authorization.

A normal user must not gain privileged access by:

- changing a URL
- modifying an API request
- changing a role field
- manipulating frontend state
- calling an undocumented endpoint directly

---

# 9. DATA MINIMIZATION

APIs must return only the information required for the authorized operation.

Do not expose unnecessary:

- personal data
- KYC information
- banking information
- internal identifiers
- provider metadata
- security configuration
- fraud/risk internals
- internal notes
- administrative fields
- compliance-only information

Never serialize entire database objects into API responses merely because it is convenient.

Use explicit response schemas.

---

# 10. SENSITIVE DATA

Sensitive information must receive stronger protection according to its classification.

Examples include:

- identity information
- KYC documents
- bank information
- transaction information
- authentication information
- compliance information
- security events
- financial records

Sensitive values must not appear unnecessarily in:

- logs
- analytics
- traces
- error responses
- monitoring dashboards
- test fixtures
- screenshots

Use masking/redaction where appropriate.

---

# 11. API SECURITY

Every API endpoint must define:

- purpose
- authentication requirement
- authorization rule
- accepted input
- validation
- output schema
- allowed state transitions
- error behavior
- rate-limit requirement
- audit requirement
- tests

Unknown or undocumented sensitive endpoints must not automatically be exposed.

Validate server-side.

Reject unexpected or prohibited fields where appropriate.

---

# 12. INPUT VALIDATION

All client input is untrusted.

Validate:

- type
- length
- format
- range
- enum values
- identifiers
- currency
- amount
- state transitions
- uploaded content
- structured payloads

Do not rely solely on frontend validation.

Use parameterized database operations.

Avoid unsafe dynamic SQL.

---

# 13. ERROR HANDLING

External errors must not expose:

- stack traces
- SQL
- internal paths
- secrets
- tokens
- credentials
- infrastructure details
- provider credentials
- sensitive business rules

Detailed diagnostics belong in protected server-side observability systems with appropriate redaction.

---

# 14. FINANCIAL SECURITY

Financial operations require additional controls.

Never trust client-supplied authoritative:

- exchange rates
- fees
- balances
- settlement state
- payment state
- transaction state
- financial permissions

Authoritative monetary values must be validated/calculated server-side.

Never use binary floating point for authoritative money.

Use appropriate Decimal/fixed precision.

Financial state changes must be:

- authorized
- validated
- deterministic where applicable
- idempotent where applicable
- auditable
- reconcilable

---

# 15. TRANSACTION STATE SECURITY

Financial state transitions must follow explicit permitted transitions.

A client must never directly force states such as:

- paid
- completed
- settled
- reversed
- refunded
- approved

without authoritative server/provider evidence and required authorization.

Invalid state transitions must fail closed.

---

# 16. WEBHOOK SECURITY

Never trust a webhook because it reached the correct URL.

Where supported by the provider, verify:

- cryptographic signature
- timestamp/freshness
- expected provider
- payload validity
- replay resistance
- event identity
- duplicate processing
- idempotency
- event ordering

Webhook processing must not blindly overwrite financial state.

---

# 17. DATABASE SECURITY

Database access must follow least privilege.

Application credentials must not automatically have administrative privileges.

Privileged database credentials must never be exposed to clients.

Where RLS or equivalent policies exist:

`RLS ENABLED != RLS VERIFIED`

Verify actual policies and test unauthorized access.

Schema-level constraints should protect important invariants where appropriate.

---

# 18. FILE AND DOCUMENT SECURITY

Uploads must be treated as hostile.

Where applicable validate:

- file size
- permitted type
- actual content/type
- filename handling
- storage path
- authorization
- retrieval permissions

Sensitive documents should not be publicly addressable by default.

Do not rely solely on filename extensions.

---

# 19. RATE LIMITING AND ABUSE

Apply appropriate abuse controls to sensitive or expensive operations including:

- login
- registration
- OTP
- password reset
- verification
- quote creation
- transaction creation
- exchange matching
- financial operations
- uploads
- expensive external API calls

Rate limits must be enforced server-side.

---

# 20. LOGGING AND AUDIT

Security-sensitive and financial actions should generate appropriate audit evidence.

Where applicable record:

- actor
- action
- target
- timestamp
- result
- correlation/request identifier
- relevant state transition

Never log:

- passwords
- full authentication tokens
- private keys
- API secrets
- database credentials
- raw sensitive credentials

Audit trails should resist unauthorized alteration.

---

# 21. DEPENDENCY SECURITY

Before introducing a dependency evaluate:

- necessity
- maintenance
- provenance
- security history
- permissions
- transitive impact

Do not add packages merely for convenience when existing trusted capabilities are sufficient.

Lock/pin dependencies according to the project's dependency-management strategy.

---

# 22. ADMINISTRATIVE ACCESS

Administrative capability must receive stronger controls than normal user capability.

Admin functionality must not depend on frontend hiding.

Sensitive administrative actions should be:

- authenticated
- explicitly authorized
- auditable
- protected against privilege escalation

High-impact actions may require additional human-controlled safeguards.

---

# 23. ENVIRONMENT SEPARATION

Development, test, staging and production must be treated as separate trust environments.

Do not casually reuse:

- production secrets
- production credentials
- production financial integrations
- production customer data

in development or test environments.

Claude must not contact real financial systems without explicit human approval.

---

# 24. AI / LLM SECURITY

If AI functionality is introduced:

Treat model output as untrusted.

Do not allow model-generated content to directly authorize:

- financial transactions
- account changes
- privileged operations
- database administration
- security changes

without deterministic validation and appropriate authorization.

Protect against prompt injection where external/untrusted content enters an AI workflow.

---

# 25. SECURITY TEST REQUIREMENTS

Security-sensitive features require negative and abuse-case testing.

Where applicable test:

- unauthenticated request
- unauthorized request
- cross-user access
- cross-tenant access
- privilege escalation
- malformed input
- unexpected fields
- replay
- duplicate request
- rate-limit abuse
- invalid state transition
- sensitive-data exposure
- secret exposure
- dependency failure
- concurrency/race behavior

Passing the happy path is not sufficient.

---

# 26. SECURITY FINDINGS

Classify findings:

- CRITICAL
- HIGH
- MEDIUM
- LOW
- INFORMATIONAL

For every material finding provide:

- affected component/path
- evidence
- attack/failure scenario
- impact
- remediation
- verification method

Never fabricate evidence.

---

# 27. UNKNOWN SECURITY STATE

If implementation evidence is unavailable, use:

`UNKNOWN — NOT VERIFIED`

Do not convert absence of evidence into a security claim.

---

# 28. RELEASE SECURITY GATE

Xspeeria must not be classified as production-ready while unresolved CRITICAL security findings remain.

HIGH findings require explicit resolution or documented human risk acceptance appropriate to the intended release stage.

Security documentation alone cannot satisfy the release gate.

Actual implementation and test evidence are required.

---

# 29. SECURITY CHANGE CONTROL

Claude must not:

- disable security controls to make tests pass
- bypass authorization
- expose secrets for debugging convenience
- make sensitive endpoints public
- weaken financial validation
- disable auditability
- grant excessive database permissions
- deploy security-sensitive changes to production

without explicit human approval.

When implementation convenience conflicts with security:

`SECURITY TAKES PRIORITY`