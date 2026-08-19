# XSPEERIA SECURITY MASTER AUDIT
## Production-Grade Security, Privacy, Resilience & Business-Logic Assessment

**Document Type:** Security Master Audit Prompt  
**Target:** Xspeeria  
**Primary Use:** Claude / Claude Code / repository-connected AI security audit  
**Assessment Standard:** Production-grade, evidence-based, security-first  
**Audit Principle:** Do not assume security. Verify it.

---

# 0. AUDIT MANDATE

You are conducting a **comprehensive security audit of Xspeeria**.

Xspeeria is not to be treated as a generic AI-generated/vibe-coded application. Treat it as a **production-oriented platform that may process user accounts, sensitive business information, documents, transactions, property/infrastructure information, AI-generated outputs, administrative data, and third-party integrations**.

Your objective is to determine whether Xspeeria can safely operate in production and to identify vulnerabilities that could result in:

- unauthorized access;
- account takeover;
- privilege escalation;
- tenant/data isolation failure;
- database exposure;
- sensitive-data leakage;
- financial loss;
- fraudulent transactions;
- API/AI abuse;
- denial of service;
- excessive third-party/API costs;
- malicious file execution;
- supply-chain compromise;
- privacy violations;
- business-logic manipulation;
- administrative compromise;
- regulatory/compliance exposure;
- reputational damage.

## NON-NEGOTIABLE RULE

**Do not tell me that Xspeeria is secure because the application works.**

Functional correctness is not security.

Do not mark an item `PASS` merely because:

- a security library is installed;
- authentication exists somewhere;
- RLS is enabled somewhere;
- an environment variable exists;
- a route appears protected from the frontend;
- a UI hides a feature;
- a package is present;
- a middleware file exists;
- the application was generated using a reputable AI model;
- no obvious vulnerability was found during a superficial scan.

Security controls must be **verified in their actual execution path**.

---

# 1. AUDIT OBJECTIVES

Determine:

1. What Xspeeria's architecture actually is.
2. What data Xspeeria stores, processes, transmits, and exposes.
3. Who can access each class of data.
4. Which actions each user role can perform.
5. Whether authorization is enforced server-side.
6. Whether users/tenants can access another user's or tenant's data.
7. Whether privileged functions can be abused.
8. Whether APIs can be called directly without the intended UI.
9. Whether database controls correctly enforce isolation.
10. Whether authentication and sessions are secure.
11. Whether secrets are protected.
12. Whether payments and financial logic can be manipulated.
13. Whether AI/LLM functionality can be abused.
14. Whether uploads and stored files are secure.
15. Whether third-party integrations can be forged or abused.
16. Whether dependencies introduce supply-chain risk.
17. Whether logging and monitoring are sufficient.
18. Whether privacy controls are adequate.
19. Whether business logic can be bypassed.
20. Whether Xspeeria is safe to launch.

---

# 2. OPERATING MODE

Work through the audit in **four passes**.

## PASS 0 — EVIDENCE & LIMITATIONS

Before auditing:

- Identify what files, repositories, environments, databases, deployment configurations, and documentation are actually available.
- Separate what you can inspect from what you cannot.
- Do not invent evidence.
- Do not claim to have executed commands that you could not execute.
- Do not claim to have inspected a live database unless access was actually available.
- Do not claim external configuration was verified unless it was actually verified.

Use:

`UNKNOWN — NOT VERIFIED`

when the available evidence is insufficient.

For every UNKNOWN item, state exactly what must be checked manually.

---

# 3. PASS 1 — ARCHITECTURE DISCOVERY

Read the codebase systematically before making security findings.

Build an architecture map covering:

### Application

- frontend framework;
- backend framework;
- language;
- routing;
- server actions;
- API routes;
- middleware;
- background jobs;
- scheduled jobs;
- queues;
- cron jobs;
- edge/serverless functions.

### Database

- database technology;
- schema;
- migrations;
- tables;
- relationships;
- views;
- functions;
- triggers;
- RLS;
- indexes;
- storage.

### Authentication

- authentication provider;
- login;
- signup;
- OAuth;
- MFA;
- password reset;
- email verification;
- sessions;
- refresh tokens;
- cookies;
- JWT handling.

### Authorization

Map:

- roles;
- permissions;
- ownership;
- organizations;
- tenants;
- admin users;
- staff;
- super-admins;
- service accounts;
- API keys.

### Integrations

Identify:

- payment providers;
- email;
- SMS;
- AI/LLM providers;
- analytics;
- maps;
- cloud storage;
- webhooks;
- external APIs;
- identity providers.

### Deployment

Identify:

- hosting;
- CI/CD;
- production/staging environments;
- environment variables;
- build pipeline;
- source maps;
- logging;
- monitoring;
- CDN;
- WAF;
- secrets management.

### Data Flow

Create a conceptual data-flow map:

`User → Frontend → API/Server → Auth → Business Logic → Database/External Service → Response`

Identify every trust boundary.

---

# 4. PASS 2 — ATTACK-SURFACE MAPPING

Identify every externally reachable or security-sensitive entry point.

Include:

- pages;
- API endpoints;
- server actions;
- RPC functions;
- database functions;
- webhooks;
- authentication callbacks;
- file-upload endpoints;
- payment endpoints;
- admin endpoints;
- cron endpoints;
- background jobs;
- AI endpoints;
- public forms;
- search endpoints;
- invitation endpoints;
- password reset endpoints;
- email verification endpoints;
- export/download endpoints;
- sharing links;
- public profile endpoints.

Create an attack-surface inventory.

For each endpoint record:

| Endpoint | Method | Auth Required | Role | Input | Data Access | External Calls | Rate Limited | Risk |
|---|---|---|---|---|---|---|---|---|

---

# 5. PASS 3 — SYSTEMATIC SECURITY AUDIT

Every checklist item must receive exactly one verdict:

- `PASS`
- `FAIL`
- `PARTIAL`
- `N/A`
- `UNKNOWN`

Do not skip checklist items.

For every PASS, provide evidence.

For every FAIL, provide a finding.

For every PARTIAL, explain the gap.

For every UNKNOWN, state what evidence is missing.

---

# 6. SEVERITY MODEL

Use:

### 🔴 CRITICAL

A vulnerability that can reasonably cause:

- major unauthorized data exposure;
- full account takeover;
- administrative compromise;
- unrestricted database access;
- severe financial loss;
- complete tenant isolation failure;
- remote code execution;
- catastrophic integrity failure.

**Production impact:** Immediate launch blocker.

### 🟠 HIGH

A vulnerability that can cause significant:

- unauthorized access;
- privilege escalation;
- sensitive data exposure;
- financial manipulation;
- account compromise;
- business-logic abuse.

**Production impact:** Must be fixed before normal production launch.

### 🟡 MEDIUM

A meaningful security weakness with limited scope, additional prerequisites, or lower impact.

### 🔵 LOW

Limited impact or defense-in-depth issue.

### ⚪ INFORMATIONAL

Not directly exploitable but relevant to security maturity.

---

# 7. FINDING FORMAT

For every FAIL finding, use:

```text
FINDING #[NUMBER]

Severity:
Category:
Title:
Production Blocker: YES / NO

Affected Component:
File:
Line:
Endpoint:
Role/User Type:

CWE:
OWASP Category:

Evidence:

What is wrong:

Why it matters:

Attack scenario:

Attacker prerequisites:

Potential impact:

Exploitability:

Business impact:

Vulnerable code/configuration:

Recommended remediation:

Corrected implementation:

Security control that should prevent recurrence:

Estimated remediation effort:

Verification test:

Regression risk:
```

Do not provide destructive exploitation instructions. Keep testing focused on safe verification and remediation.

---

# 8. SECTION A — SECRETS & ENVIRONMENT SECURITY

## A1. Hardcoded Secrets

Search all source, configuration, scripts, fixtures, test files, documentation, and committed artifacts for:

- API keys;
- passwords;
- tokens;
- private keys;
- JWTs;
- database credentials;
- webhook secrets;
- OAuth secrets;
- cloud credentials;
- SMTP credentials;
- payment secrets.

Look for patterns including:

- `sk_live_`
- `sk_test_`
- `Bearer`
- `eyJ`
- `ghp_`
- `gho_`
- `github_pat_`
- `xoxb-`
- `xoxp-`
- `AKIA`
- private key headers;
- suspicious long strings.

## A2. Environment Files

Verify:

- `.env`;
- `.env.local`;
- `.env.production`;
- `.env*.local`

are appropriately ignored and never exposed.

Check Git history where available.

## A3. Public Environment Variables

Verify framework public prefixes do not expose secrets.

Examples:

- Next.js `NEXT_PUBLIC_`
- Vite `VITE_`
- CRA `REACT_APP_`

Public values must never include server-only credentials.

## A4. Secret Rotation

If secrets appear exposed or committed:

- identify the secret;
- determine likely exposure;
- recommend immediate revocation;
- recommend replacement;
- recommend history cleanup where appropriate.

Never reproduce live secrets in the report.

## A5. Logging

Check whether logs expose:

- tokens;
- passwords;
- authorization headers;
- PII;
- payment data;
- database credentials;
- environment variables.

## A6. Source Maps & Build Artifacts

Verify production source maps do not expose sensitive implementation details.

## A7. Startup Validation

Verify required secrets are validated and the application fails safely when missing.

---

# 9. SECTION B — AUTHENTICATION

## B1. Authentication Middleware

Verify authentication middleware actually protects intended routes.

## B2. Default-Deny Architecture

Prefer protected-by-default routing over fragile exception lists.

## B3. Session Security

Verify:

- secure cookies;
- HttpOnly;
- SameSite;
- expiration;
- refresh-token handling;
- session invalidation;
- logout behavior.

## B4. JWT Validation

Verify security-sensitive server operations validate identity correctly.

For Supabase, distinguish appropriately between:

- `getUser()`
- `getSession()`

Do not assume local session data is sufficient for authorization.

## B5. Password Security

Check:

- secure password handling;
- password reset;
- reset-token expiry;
- single-use behavior;
- email verification.

## B6. MFA

If MFA exists, verify it cannot be bypassed through alternate login paths.

## B7. OAuth

Verify:

- state;
- callback validation;
- redirect URI restrictions;
- token handling.

## B8. Account Enumeration

Check whether login/reset/signup responses reveal whether accounts exist.

## B9. Brute Force Protection

Check rate limits and lockout/abuse controls.

---

# 10. SECTION C — AUTHORIZATION & ACCESS CONTROL

This section is **mandatory and high priority**.

Do not confuse authentication with authorization.

Determine:

> Who is allowed to perform each action on each object?

## C1. Role Enforcement

Verify roles are enforced server-side.

## C2. Privilege Escalation

Attempt to identify paths where:

- normal users can invoke admin endpoints;
- roles can be changed by users;
- hidden UI controls are treated as authorization;
- client-supplied role fields are trusted.

## C3. IDOR / BOLA

Test for insecure direct object references.

Examples:

```text
/api/users/USER_ID
/api/documents/DOCUMENT_ID
/api/projects/PROJECT_ID
/api/payments/PAYMENT_ID
```

Verify the server confirms ownership/permission.

## C4. Horizontal Access Control

User A must not access User B's data.

## C5. Vertical Access Control

Normal users must not access admin/staff functionality.

## C6. Tenant Isolation

If Xspeeria supports organizations, companies, teams, properties, or tenants:

Verify every query and mutation enforces the correct tenant boundary.

Test:

`Tenant A → Tenant B`

for:

- reads;
- updates;
- deletes;
- searches;
- exports;
- downloads;
- analytics;
- AI context;
- notifications.

## C7. Ownership Changes

Verify users cannot manipulate ownership fields.

---

# 11. SECTION D — DATABASE SECURITY

## D1. RLS

If using Supabase/Postgres with client-side access:

Verify RLS is enabled on every relevant table.

## D2. RLS Policies

Verify policies actually enforce intended access.

## D3. WITH CHECK

Verify INSERT/UPDATE policies use appropriate `WITH CHECK`.

## D4. Identity Source

Use trusted authenticated identity, such as `auth.uid()`, rather than mutable user metadata.

## D5. Service Role

Verify service-role credentials are server-only.

## D6. Storage Policies

Audit storage buckets and object policies.

## D7. SQL Injection

Check:

- raw SQL;
- string concatenation;
- template-generated queries;
- RPC functions;
- unsafe dynamic SQL.

## D8. SECURITY DEFINER

Audit all `SECURITY DEFINER` functions.

Check:

- search_path;
- authorization;
- input validation;
- privilege boundaries.

## D9. Database Functions

Check for functions that can be called by unauthorized users.

## D10. Data Integrity

Check:

- foreign keys;
- uniqueness;
- constraints;
- ownership constraints;
- race conditions;
- transaction boundaries.

---

# 12. SECTION E — SERVER-SIDE VALIDATION

## E1. Schema Validation

All API/server inputs must be validated server-side.

Look for:

- Zod;
- Valibot;
- Yup;
- ArkType;
- equivalent controls.

## E2. Identity

Never trust client-supplied:

```json
{
  "userId": "..."
}
```

for authorization.

## E3. Mass Assignment

Check whether clients can submit fields they should not control.

Examples:

- role;
- owner_id;
- tenant_id;
- verified;
- approved;
- price;
- balance;
- subscription;
- permissions.

## E4. XSS

Check:

- `dangerouslySetInnerHTML`;
- `innerHTML`;
- unsafe markdown;
- HTML rendering;
- user-generated content.

## E5. HTTP Methods

Verify state-changing operations are not exposed through unsafe GET requests.

## E6. Error Handling

Prevent:

- stack traces;
- SQL errors;
- filesystem paths;
- secret names;
- internal architecture details.

## E7. Webhook Verification

All security-sensitive webhooks must validate signatures.

---

# 13. SECTION F — API SECURITY

Inventory every API endpoint.

For each endpoint verify:

- authentication;
- authorization;
- validation;
- rate limiting;
- method enforcement;
- CORS;
- error handling;
- output filtering;
- pagination;
- resource limits.

Check:

- mass assignment;
- excessive data exposure;
- API versioning;
- replay attacks;
- request size;
- pagination abuse;
- expensive queries.

---

# 14. SECTION G — BUSINESS LOGIC SECURITY

This is a major Xspeeria-specific audit area.

Do not limit the audit to technical vulnerabilities.

Analyze whether a legitimate user can manipulate application logic.

Check:

## G1. Price Manipulation

Can users alter:

- price;
- quantity;
- discounts;
- fees;
- balances;
- subscription level?

## G2. Status Manipulation

Can clients submit:

- approved;
- verified;
- completed;
- paid;
- active;
- admin;
- trusted?

## G3. Workflow Bypass

Can users skip required steps?

## G4. Duplicate Actions

Can users submit the same transaction multiple times?

## G5. Race Conditions

Check concurrent requests around:

- payments;
- inventory;
- approvals;
- credits;
- bookings;
- quotas;
- account changes.

## G6. Replay

Can requests or webhooks be replayed?

## G7. Referral/Reward Abuse

If applicable, check:

- referral fraud;
- coupon abuse;
- reward duplication;
- self-referrals.

---

# 15. SECTION H — PAYMENTS & FINANCIAL SECURITY

If Xspeeria handles payments, subscriptions, invoices, balances, or financial transactions:

Audit:

- payment provider integration;
- secret keys;
- client/server separation;
- webhook signatures;
- payment status verification;
- price validation;
- amount validation;
- currency validation;
- duplicate payment handling;
- refund authorization;
- subscription manipulation;
- invoice manipulation;
- transaction reconciliation;
- idempotency.

Never trust payment success information supplied solely by the frontend.

---

# 16. SECTION I — AI / LLM SECURITY

If Xspeeria uses AI:

## I1. Prompt Injection

Check whether untrusted user content can manipulate system instructions.

## I2. Sensitive Context Leakage

Verify AI prompts do not expose:

- secrets;
- private tenant data;
- unrelated users' data;
- internal system prompts;
- credentials.

## I3. Cross-Tenant AI Leakage

Ensure Tenant A cannot cause the AI to retrieve Tenant B's information.

## I4. Tool Authorization

If AI can invoke tools/actions, verify:

- authorization;
- scope;
- user identity;
- parameter validation;
- confirmation requirements.

## I5. Excessive Agency

AI must not have unrestricted access to:

- databases;
- payments;
- email;
- deletion;
- admin actions.

## I6. Output Handling

Treat model output as untrusted input.

Check for:

- XSS;
- SQL injection;
- command injection;
- unsafe rendering.

## I7. Cost Abuse

Check whether users can trigger unlimited expensive AI calls.

## I8. Model/Data Privacy

Determine what user data is sent to external AI providers and whether this is appropriate.

---

# 17. SECTION J — DEPENDENCY & SUPPLY-CHAIN SECURITY

## J1. Package Audit

Inspect:

- `npm audit`;
- `pnpm audit`;
- `yarn audit`;
- `bun audit`;

when available.

Do not falsely claim command execution if unavailable.

## J2. Hallucinated Packages

Identify suspicious packages.

## J3. Lockfile

Verify a lockfile is committed.

## J4. Outdated Dependencies

Pay special attention to:

- authentication;
- crypto;
- database;
- framework;
- payment;
- parsing;
- file processing.

## J5. Unused Dependencies

Identify unnecessary attack surface.

## J6. Install Scripts

Check dependencies for dangerous lifecycle scripts where evidence is available.

## J7. CI/CD Dependencies

Audit third-party GitHub Actions or equivalent automation.

---

# 18. SECTION K — RATE LIMITING & ABUSE

Check:

- login;
- signup;
- password reset;
- OTP;
- AI endpoints;
- email;
- SMS;
- payment;
- search;
- exports;
- uploads;
- expensive API calls.

Verify rate limits are server-side.

Prefer durable distributed stores where required.

---

# 19. SECTION L — CORS, CSRF & BROWSER SECURITY

Check:

- CORS;
- wildcard origins;
- credentialed requests;
- CSRF;
- SameSite;
- CSP;
- HSTS;
- X-Content-Type-Options;
- Referrer-Policy;
- Permissions-Policy;
- frame protections.

---

# 20. SECTION M — FILE UPLOAD & STORAGE SECURITY

If uploads exist:

Check:

- MIME validation;
- file signatures/magic bytes where appropriate;
- size limits;
- filename handling;
- path traversal;
- executable content;
- malware handling;
- storage permissions;
- private/public separation;
- signed URLs;
- download authorization.

---

# 21. SECTION N — SSRF & SERVER-SIDE REQUEST SECURITY

If users can provide URLs or trigger server-side fetches:

Check for SSRF.

Test conceptually against:

- internal services;
- localhost;
- private IP ranges;
- cloud metadata endpoints;
- internal admin services.

Verify allowlists and network restrictions where appropriate.

---

# 22. SECTION O — COMMAND / CODE / TEMPLATE INJECTION

Search for user-controlled input reaching:

- shell commands;
- subprocesses;
- dynamic code;
- templates;
- SQL;
- filesystem operations;
- serialization/deserialization.

Pay special attention to AI-generated helper functions.

---

# 23. SECTION P — PATH TRAVERSAL & FILESYSTEM SECURITY

Check user-controlled:

- filenames;
- paths;
- download locations;
- export names;
- import paths.

Prevent:

```text
../
../../
absolute paths
```

and equivalent encoded forms.

---

# 24. SECTION Q — LOGGING, MONITORING & INCIDENT RESPONSE

Assess:

- authentication logging;
- authorization failures;
- admin actions;
- payment events;
- security events;
- suspicious API usage;
- webhook failures;
- AI abuse;
- rate-limit events.

Verify logs do not expose sensitive information.

Determine whether the team could detect:

- account takeover;
- mass data extraction;
- privilege escalation;
- abnormal AI usage;
- payment fraud.

---

# 25. SECTION R — PRIVACY & DATA PROTECTION

Identify all personal/sensitive data.

Create a data inventory:

| Data | Source | Storage | Purpose | Who Can Access | Retention | External Sharing |
|---|---|---|---|---|---|---|

Check:

- data minimization;
- access controls;
- deletion;
- export;
- retention;
- consent where relevant;
- third-party transfers;
- privacy notices;
- sensitive-data exposure.

Do not make legal compliance claims without sufficient evidence.

Clearly distinguish:

`Technical observation`

from:

`Legal/compliance conclusion`.

---

# 26. SECTION S — ADMIN & INTERNAL FUNCTIONS

Audit:

- admin dashboards;
- role management;
- user impersonation;
- account deletion;
- data exports;
- system settings;
- feature flags;
- billing controls;
- manual approvals.

Verify admin functions are strongly protected.

Check whether hidden admin routes remain reachable.

---

# 27. SECTION T — WEBHOOKS & INTEGRATIONS

For every webhook:

- signature verification;
- timestamp validation;
- replay protection;
- idempotency;
- authentication;
- payload validation;
- authorization;
- logging.

Check external integrations for:

- over-privileged credentials;
- excessive scopes;
- insecure callbacks;
- weak error handling.

---

# 28. SECTION U — DEPLOYMENT & INFRASTRUCTURE

Assess:

- production secrets;
- staging isolation;
- debug mode;
- source maps;
- HTTPS;
- TLS;
- security headers;
- server permissions;
- container security if applicable;
- CI/CD;
- deployment credentials;
- exposed admin interfaces;
- database network exposure;
- backups;
- recovery.

---

# 29. SECTION V — AVAILABILITY & RESILIENCE

Security includes availability.

Check:

- request limits;
- payload limits;
- upload limits;
- query limits;
- pagination;
- expensive operations;
- timeouts;
- retry storms;
- queue abuse;
- AI cost exhaustion;
- database exhaustion.

---

# 30. SECTION W — DATA EXPORT & DOWNLOAD SECURITY

Check every:

- export;
- CSV;
- PDF;
- report;
- document;
- image;
- signed URL;
- download endpoint.

Verify authorization occurs at download time, not only when the link is created.

Check predictable URLs and object IDs.

---

# 31. SECTION X — FRONTEND SECURITY

The frontend is not a trust boundary.

Check for:

- hidden security controls;
- exposed API keys;
- insecure local storage;
- unsafe HTML;
- client-only authorization;
- sensitive data rendered unnecessarily;
- debug information;
- exposed internal routes;
- insecure URL parameters.

---

# 32. SECTION Y — TESTING STRATEGY

For each important vulnerability, recommend a safe verification test.

Tests should answer:

- Can User A access User B's object?
- Can a normal user call an admin endpoint?
- Can a user alter ownership?
- Can an unauthenticated request invoke the endpoint?
- Can a client manipulate price/status/role?
- Can an AI request access unauthorized context?
- Can a webhook be replayed?
- Can an expensive endpoint be abused?

Do not perform destructive actions against production systems.

---

# 33. XSPEERIA SECURITY SCORE

Calculate an overall score from 0–100.

Suggested weighting:

| Domain | Weight |
|---|---:|
| Authentication | 10 |
| Authorization / Tenant Isolation | 15 |
| Database / RLS | 10 |
| API Security | 10 |
| Secrets | 8 |
| Business Logic | 12 |
| Payments / Financial Security | 8 |
| AI Security | 8 |
| Dependencies / Supply Chain | 6 |
| File / Storage | 4 |
| Infrastructure | 4 |
| Logging / Monitoring | 2 |
| Privacy / Data Protection | 3 |
| **TOTAL** | **100** |

If a domain is genuinely not applicable, redistribute its weight proportionally and explain the adjustment.

Do not inflate the score.

A serious Critical vulnerability should substantially reduce the score.

---

# 34. PRODUCTION READINESS GATE

Give exactly one final classification:

## 🔴 DO NOT LAUNCH

Use when there is:

- critical data exposure;
- authentication bypass;
- major authorization failure;
- tenant isolation failure;
- severe payment vulnerability;
- exposed privileged credentials;
- critical remote code execution;
- equivalent catastrophic risk.

## 🟠 LAUNCH ONLY AFTER CRITICAL FIXES

Significant High/Critical issues exist but are clearly remediable.

## 🟡 LIMITED / PILOT LAUNCH

No catastrophic vulnerability found, but important controls remain incomplete or unverified.

## 🟢 PRODUCTION READY

No known critical/high blocker remains based on the available evidence, and core security controls are demonstrably implemented.

Important:

**Production Ready does not mean "100% secure."**

It means the audit found no known blocking issue based on available evidence.

---

# 35. FINAL REPORT

Produce the final report in exactly this structure.

# XSPEERIA SECURITY MASTER AUDIT REPORT

## 1. Executive Security Verdict

Include:

- final classification;
- security score;
- one-paragraph executive summary;
- biggest security risk;
- biggest strength;
- biggest unknown.

## 2. Architecture Summary

Explain the actual architecture discovered.

## 3. Attack Surface

Provide the endpoint/component inventory.

## 4. Security Scorecard

| Domain | Score | Status | Key Finding |
|---|---:|---|---|

## 5. Critical Findings

List every Critical issue.

## 6. High Findings

List every High issue.

## 7. Medium Findings

List every Medium issue.

## 8. Low / Informational Findings

List every Low and Informational issue.

## 9. Authentication Assessment

Detailed result.

## 10. Authorization & Tenant Isolation Assessment

Detailed result.

## 11. Database & RLS Assessment

Detailed result.

## 12. API Security Assessment

Detailed result.

## 13. Business Logic Assessment

Detailed result.

## 14. Payment & Financial Security Assessment

Detailed result if applicable.

## 15. AI/LLM Security Assessment

Detailed result if applicable.

## 16. Secrets Assessment

Detailed result.

## 17. Dependency/Supply-Chain Assessment

Detailed result.

## 18. File & Storage Assessment

Detailed result.

## 19. Infrastructure Assessment

Detailed result.

## 20. Privacy/Data Protection Assessment

Detailed technical assessment.

## 21. Logging & Monitoring Assessment

Detailed result.

## 22. What Xspeeria Is Already Doing Right

List verified strengths.

## 23. Quick Wins — Under 10 Minutes

Prioritize easy improvements.

## 24. 24-Hour Remediation Plan

What must be fixed immediately.

## 25. 7-Day Remediation Plan

What should be fixed within one week.

## 26. 30-Day Security Roadmap

Security maturity improvements.

## 27. 60-Day Security Roadmap

Advanced controls.

## 28. 90-Day Security Roadmap

Production-grade security maturity.

## 29. Security Checklist

Produce a compact table:

| ID | Control | Verdict | Severity | Evidence |
|---|---|---|---|---|

Every checklist item must appear.

## 30. Unverified Items

List everything that could not be verified because access/evidence was unavailable.

## 31. Required External Verification

Clearly list checks that require:

- live database access;
- cloud dashboard access;
- deployment configuration;
- CI/CD;
- DNS;
- payment provider dashboard;
- Supabase dashboard;
- production environment;
- third-party provider configuration.

## 32. Final Launch Decision

Use exactly one:

`🔴 DO NOT LAUNCH`

`🟠 LAUNCH ONLY AFTER CRITICAL FIXES`

`🟡 LIMITED / PILOT LAUNCH`

`🟢 PRODUCTION READY`

Then explain the decision.

---

# 36. MASTER CHECKLIST

The following checklist must be explicitly marked.

### Secrets

- [ ] A1 Hardcoded secrets
- [ ] A2 Environment file protection
- [ ] A3 Public environment variables
- [ ] A4 Secret rotation
- [ ] A5 Logging leaks
- [ ] A6 Source maps/build artifacts
- [ ] A7 Startup validation

### Authentication

- [ ] B1 Authentication middleware
- [ ] B2 Default-deny routing
- [ ] B3 Session security
- [ ] B4 JWT validation
- [ ] B5 Password security
- [ ] B6 MFA
- [ ] B7 OAuth
- [ ] B8 Account enumeration
- [ ] B9 Brute-force protection

### Authorization

- [ ] C1 Role enforcement
- [ ] C2 Privilege escalation
- [ ] C3 IDOR/BOLA
- [ ] C4 Horizontal access control
- [ ] C5 Vertical access control
- [ ] C6 Tenant isolation
- [ ] C7 Ownership changes

### Database

- [ ] D1 RLS
- [ ] D2 RLS policies
- [ ] D3 WITH CHECK
- [ ] D4 Identity source
- [ ] D5 Service-role isolation
- [ ] D6 Storage policies
- [ ] D7 SQL injection
- [ ] D8 SECURITY DEFINER
- [ ] D9 Database functions
- [ ] D10 Data integrity

### Validation/API

- [ ] E1 Schema validation
- [ ] E2 Server-side identity
- [ ] E3 Mass assignment
- [ ] E4 XSS
- [ ] E5 HTTP methods
- [ ] E6 Error leakage
- [ ] E7 Webhook verification
- [ ] API authentication
- [ ] API authorization
- [ ] API rate limiting
- [ ] API output filtering
- [ ] API resource limits

### Business Logic

- [ ] G1 Price manipulation
- [ ] G2 Status manipulation
- [ ] G3 Workflow bypass
- [ ] G4 Duplicate actions
- [ ] G5 Race conditions
- [ ] G6 Replay attacks
- [ ] G7 Referral/reward abuse

### Payments

- [ ] Payment secret isolation
- [ ] Payment verification
- [ ] Amount validation
- [ ] Currency validation
- [ ] Webhook security
- [ ] Idempotency
- [ ] Refund authorization
- [ ] Subscription protection

### AI

- [ ] Prompt injection
- [ ] Cross-tenant AI leakage
- [ ] Sensitive context exposure
- [ ] Tool authorization
- [ ] Excessive agency
- [ ] Output validation
- [ ] AI cost abuse
- [ ] Model/provider privacy

### Supply Chain

- [ ] Package audit
- [ ] Hallucinated packages
- [ ] Lockfile
- [ ] Outdated dependencies
- [ ] Unused dependencies
- [ ] Install scripts
- [ ] CI/CD dependencies

### Abuse/Availability

- [ ] Rate limiting
- [ ] Authentication abuse protection
- [ ] AI abuse protection
- [ ] Upload limits
- [ ] Request limits
- [ ] Query limits
- [ ] Timeouts
- [ ] Retry controls

### Browser/Web

- [ ] CORS
- [ ] CSRF
- [ ] CSP
- [ ] HSTS
- [ ] Secure cookies
- [ ] Security headers

### File/Storage

- [ ] MIME validation
- [ ] File size validation
- [ ] Path traversal
- [ ] Executable upload prevention
- [ ] Storage authorization
- [ ] Signed URL authorization

### Server/Infrastructure

- [ ] SSRF
- [ ] Command injection
- [ ] Path traversal
- [ ] Debug mode
- [ ] Production configuration
- [ ] Deployment secrets
- [ ] CI/CD security
- [ ] Backup/recovery

### Monitoring/Privacy

- [ ] Security logging
- [ ] Admin audit logging
- [ ] Abuse detection
- [ ] Incident visibility
- [ ] Data inventory
- [ ] Data minimization
- [ ] Retention
- [ ] Deletion
- [ ] Export/access controls

---

# 37. FINAL INSTRUCTIONS TO CLAUDE

Before producing the report:

1. Read the entire available codebase.
2. Do not make premature findings.
3. Build the architecture model first.
4. Map the attack surface.
5. Trace authentication and authorization end-to-end.
6. Trace sensitive data end-to-end.
7. Trace payment flows end-to-end where applicable.
8. Trace AI flows end-to-end where applicable.
9. Inspect database policies and migrations.
10. Inspect API routes and server actions.
11. Inspect admin functionality.
12. Inspect external integrations.
13. Inspect dependency manifests and lockfiles.
14. Inspect deployment configuration.
15. Inspect logging and error handling.
16. Explicitly test for cross-user and cross-tenant authorization weaknesses conceptually or through safe available tests.
17. Prioritize exploitable vulnerabilities over theoretical concerns.
18. Do not overstate vulnerabilities.
19. Do not understate vulnerabilities.
20. Do not assume frontend restrictions are security controls.
21. Do not assume authentication equals authorization.
22. Do not assume RLS is correctly configured merely because it is enabled.
23. Do not assume an installed package is safe.
24. Do not expose actual secrets in the final report.
25. Never fabricate evidence, file paths, line numbers, command output, or test results.

If the repository is too large to inspect in one pass, continue systematically until all relevant files are reviewed.

If something cannot be verified, write:

`UNKNOWN — NOT VERIFIED`

and explain exactly what evidence is required.

The final report must be suitable for review by:

- a CTO;
- enterprise security architect;
- senior software engineer;
- investor conducting technical due diligence;
- enterprise customer security team.

The objective is not to make Xspeeria look secure.

The objective is to determine **whether Xspeeria is actually secure, what could go wrong, what must be fixed, and whether it is safe to launch.**

# END OF XSPEERIA SECURITY MASTER AUDIT

---

# 38. PRE-BUILD CONTROL PACK — SEVEN REQUIRED ADDITIONS

The following seven controls are mandatory for Xspeeria before production implementation is considered complete. They are not substitutes for the security audit; they are **design-time control documents and approval gates** that the engineering process must produce and maintain.

Claude MUST inspect these controls if they exist in the repository. If they do not exist, Claude MUST flag them as **MISSING** and create a proposed version or implementation plan rather than silently assuming them.

---

## 38.1 THREAT MODEL

**Required artifact:** `docs/07_THREAT_MODEL.md`

Build an explicit Xspeeria threat model before or alongside implementation.

### Threat actors to model

- Unauthenticated internet attacker
- Authenticated malicious user
- Compromised user account
- Malicious counterparty / marketplace participant
- Fraudulent beneficiary or bank account holder
- Privileged support operator
- Compliance operator
- Finance/settlement operator
- Administrator
- Compromised administrator account
- Malicious insider
- Compromised third-party provider
- Compromised API credential
- Supply-chain attacker
- Automated bot / credential-stuffing attacker
- Prompt-injection attacker targeting AI features
- Attacker attempting cross-user or cross-tenant access
- Attacker attempting transaction manipulation
- Attacker attempting to abuse webhooks or asynchronous jobs

### Assets to protect

At minimum identify:

- User identities
- Authentication/session credentials
- KYC/identity information
- Personal data
- Financial information
- Transaction records
- Marketplace orders/offers
- Beneficiary information
- Bank/payment-provider references
- Internal risk/fraud decisions
- Administrative controls
- API credentials and secrets
- AI prompts, context and outputs
- Audit logs
- Uploaded documents
- System configuration
- Database records
- Settlement/reconciliation state

### Required threat analysis

For each major asset and flow, document:

1. Asset
2. Trust boundary
3. Threat actor
4. Attack vector
5. Security property at risk
6. Potential impact
7. Existing control
8. Residual risk
9. Required mitigation
10. Owner
11. Verification method

Use a lightweight STRIDE-style analysis where appropriate:

- Spoofing
- Tampering
- Repudiation
- Information disclosure
- Denial of service
- Elevation of privilege

### Mandatory high-risk flows

Threat-model at minimum:

- Registration
- Login
- MFA/OTP if applicable
- Password reset
- KYC submission
- KYC review
- Marketplace creation
- Offer acceptance
- Matching
- Transaction creation
- Funding
- Settlement
- Cancellation
- Refund/reversal
- Bank/provider callbacks
- Webhooks
- Admin actions
- Document upload/download
- AI request/response flows
- Data export
- Account deletion

Claude MUST NOT mark the threat model complete simply because authentication exists.

---

## 38.2 FINANCIAL STATE MACHINE

**Required artifact:** `docs/05_FINANCIAL_STATE_MACHINE.md`

Xspeeria's transaction lifecycle MUST be explicitly defined. Claude MUST NOT invent transaction states during implementation.

### Required state-machine specification

For every financial transaction define:

- State name
- State meaning
- Allowed entry transitions
- Allowed exit transitions
- Actor permitted to cause transition
- Required authorization
- Required evidence
- Database invariants
- External provider dependency
- Idempotency requirement
- Timeout behavior
- Retry behavior
- Failure behavior
- Reconciliation behavior
- Audit event

### Example lifecycle

```text
Settlement.phase (workflow decisions only, forward-only)

INITIALIZING → AWAITING_FUNDING → RELEASING → COMPLETED
                              ↘ UNWINDING → CLOSED_UNWOUND
                                RELEASING → RECOVERY_REQUIRED → CLOSED_RECOVERED
                                                              → CLOSED_WITH_LOSS
                              ↘ CANCELLED

SettlementLeg.state (authoritative per-leg money facts, two legs per settlement)

PENDING → ESCROW_PROVISIONED → FUNDED → RELEASE_SENT → PAID_OUT
```

Updated 2026-08-18 to reflect ADR-001 (DEC-003). The earlier example in this section used a single linear chain with `ESCROW_A_FUNDED`/`ESCROW_B_FUNDED` as aggregate states; those are now per-leg facts identified by semantic party role (`REQUESTER`, `ACCEPTER`), never by ordinal position.

The actual state machine MUST be taken from `docs/adr/001-transaction-state-machine.md` and the authoritative Xspeeria product and financial specifications rather than assumed from this example.

**Audit focus for this area.** Verify in the actual execution path, not from documentation:

- Release cannot occur unless **both** legs are `FUNDED` and both beneficiary accounts validated.
- `COMPLETED` cannot occur unless **both** legs are `PAID_OUT`.
- A settlement with any leg `PAID_OUT` can never be represented as unwound or reversed.
- No settlement reaches a terminal phase while a leg is `FUNDED` and neither `PAID_OUT` nor `RETURNED`.
- Money facts are settable only by signature-verified, in-replay-window partner webhooks — never by client input.
- Webhook deduplication keys include `leg_id`; a webhook with an unresolvable leg is rejected, not defaulted.
- `Transaction.status` is not writable through any API path.
- No backward phase transitions exist, and no admin action can mutate a terminal settlement.

### Illegal transition testing

The implementation MUST explicitly test that users cannot:

- Skip required states
- Re-enter completed states incorrectly
- Mark a transaction as funded without verified evidence
- Release settlement without required conditions
- Modify another user's transaction
- Modify transaction ownership after creation
- Replay a settlement request
- Trigger duplicate settlement
- Create money through retries
- Change amount/currency after authorization without a controlled flow
- Bypass KYC/risk requirements
- Forge provider callbacks
- Mark a failed transaction as completed without authorized reconciliation

### Money invariants

Where financial amounts are involved:

- Never use binary floating-point for authoritative money calculations.
- Use the specified decimal representation and rounding policy.
- Validate currency independently from amount.
- Enforce minimum/maximum transaction limits.
- Preserve immutable transaction history.
- Use idempotency keys for externally repeatable operations.
- Ensure retries cannot create duplicate financial effects.
- Ensure reconciliation can detect missing, duplicated or mismatched transactions.

Claude MUST identify any undocumented financial invariant as a blocking design gap rather than inventing one.

---

## 38.3 AUTHORIZATION MATRIX

**Required artifact:** `docs/08_AUTHORIZATION_MATRIX.md`

Authentication proves identity. Authorization determines what that identity is allowed to do. These MUST be audited separately.

### Required roles

The exact production roles must come from the authoritative Xspeeria specification. At minimum evaluate whether the system needs differentiated permissions for:

- User
- Support
- Compliance
- Finance/Settlement
- Administrator
- Service/System account

Do not grant privileges merely because a role name exists.

### Required matrix

For every sensitive action document:

| Action | User | Support | Compliance | Finance | Admin | Service | Additional condition |
|---|---|---|---|---|---|---|---|
| Create transaction | | | | | | | |
| View own transaction | | | | | | | |
| View another user's transaction | | | | | | | |
| Modify transaction | | | | | | | |
| Cancel transaction | | | | | | | |
| Review KYC | | | | | | | |
| Approve/reject KYC | | | | | | | |
| Release settlement | | | | | | | |
| Reverse/refund | | | | | | | |
| View sensitive financial data | | | | | | | |
| Export data | | | | | | | |
| Manage users | | | | | | | |
| Change roles | | | | | | | |
| Configure integrations | | | | | | | |
| View security/audit logs | | | | | | | |

Every blank cell MUST be intentionally classified as:

- ALLOW
- DENY
- CONDITIONAL

### Authorization rules

Claude MUST verify:

- Object-level authorization
- Function-level authorization
- Role-based authorization
- Attribute-based conditions where required
- Ownership checks
- Tenant isolation where applicable
- Admin privilege boundaries
- Support-user limitations
- Service-account limitations
- Sensitive-action reauthentication/step-up controls where appropriate

### Mandatory abuse cases

Test conceptually or through safe automated tests for:

- IDOR/BOLA
- Horizontal privilege escalation
- Vertical privilege escalation
- User-to-admin escalation
- Support-to-admin escalation
- Cross-tenant access
- Role manipulation
- Parameter tampering
- User-ID substitution
- Object-ID enumeration

---

## 38.4 PROVIDER INTEGRATION CONTRACT

**Required artifact:** `docs/10_BANKING_INTEGRATIONS.md`

All external financial, KYC, messaging, AI and other critical providers MUST be treated as replaceable integrations behind explicit interfaces/adapters.

### Provider categories

At minimum evaluate:

- Banking providers
- Payment providers
- KYC/identity providers
- AML/risk providers
- Messaging providers
- Email providers
- SMS/OTP providers
- AI/LLM providers
- Storage providers
- Analytics/observability providers

Only integrations actually required by Xspeeria should be implemented.

### Required provider contract

For each provider define:

- Provider name
- Purpose
- Environment configuration
- Authentication mechanism
- Required permissions/scopes
- Request schema
- Response schema
- Timeout
- Retry policy
- Idempotency behavior
- Rate limits
- Webhook behavior
- Signature verification
- Error mapping
- Reconciliation mechanism
- Failure mode
- Fallback behavior
- Data shared
- Data retained
- Security requirements
- Compliance requirements
- Provider-specific assumptions

### Adapter pattern

Use interfaces similar to:

```python
class BankProviderAdapter:
    async def initiate_settlement(...): ...
    async def verify_funding(...): ...
    async def get_transaction_status(...): ...
    async def reconcile(...): ...
```

The exact implementation MUST follow the authoritative technical architecture.

### Provider failure rules

Claude MUST verify behavior for:

- Provider timeout
- Provider unavailable
- Duplicate callback
- Delayed callback
- Callback replay
- Partial response
- Unknown transaction status
- Provider-side reversal
- Network retry
- Application retry
- Credential expiry
- Rate limit response
- Schema change
- Provider outage during settlement

Xspeeria MUST NOT assume that a successful API request means final financial settlement unless the provider contract explicitly establishes that fact.

---

## 38.5 DISASTER RECOVERY & BUSINESS CONTINUITY

**Required artifact:** `docs/14_DISASTER_RECOVERY.md`

Xspeeria MUST define how the platform behaves when critical components fail.

### Required targets

Define explicit:

- RPO — Recovery Point Objective
- RTO — Recovery Time Objective

These values MUST be approved as business/engineering decisions and MUST NOT be fabricated by Claude.

### Failure scenarios

At minimum address:

- Primary database outage
- Database corruption
- Accidental data deletion
- Redis outage
- API outage
- Web application outage
- Cloud-region outage
- Provider outage
- Banking integration outage
- KYC provider outage
- Messaging provider outage
- AI provider outage
- Credential compromise
- Secret rotation failure
- Malicious deployment
- Supply-chain compromise
- Ransomware/destructive access scenario
- Lost webhook events
- Duplicate webhook events
- Stuck financial transactions
- Failed reconciliation

### Backup requirements

Document:

- What is backed up
- Backup frequency
- Encryption
- Access controls
- Retention
- Backup location
- Backup immutability where appropriate
- Restore procedure
- Restore verification
- Disaster test frequency

### Recovery requirements

Every critical recovery procedure MUST include:

1. Detection
2. Containment
3. Decision authority
4. Recovery steps
5. Data integrity verification
6. Reconciliation
7. Customer communication
8. Post-incident review

A backup that has never been successfully restored MUST NOT be treated as a verified recovery capability.

---

## 38.6 PRODUCTION READINESS CHECKLIST

**Required artifact:** `docs/15_PRODUCTION_READINESS.md`

Before production launch, Xspeeria MUST pass a formal readiness review.

### Required categories

```text
Security                         PASS / FAIL / UNKNOWN
Authentication                  PASS / FAIL / UNKNOWN
Authorization                   PASS / FAIL / UNKNOWN
Tenant isolation                PASS / FAIL / UNKNOWN / N/A
Financial correctness           PASS / FAIL / UNKNOWN
Transaction state machine       PASS / FAIL / UNKNOWN
KYC/AML                         PASS / FAIL / UNKNOWN / N/A
Database security               PASS / FAIL / UNKNOWN
API security                    PASS / FAIL / UNKNOWN
Webhook security                PASS / FAIL / UNKNOWN / N/A
Third-party integrations        PASS / FAIL / UNKNOWN
Secrets management              PASS / FAIL / UNKNOWN
Dependency security             PASS / FAIL / UNKNOWN
Infrastructure                  PASS / FAIL / UNKNOWN
Monitoring                      PASS / FAIL / UNKNOWN
Alerting                        PASS / FAIL / UNKNOWN
Logging                         PASS / FAIL / UNKNOWN
Backups                         PASS / FAIL / UNKNOWN
Disaster recovery               PASS / FAIL / UNKNOWN
Incident response               PASS / FAIL / UNKNOWN
Testing                         PASS / FAIL / UNKNOWN
Performance                     PASS / FAIL / UNKNOWN
Accessibility                   PASS / FAIL / UNKNOWN
Privacy/data controls            PASS / FAIL / UNKNOWN
Compliance                      PASS / FAIL / HUMAN REVIEW REQUIRED
Legal/regulatory status         PASS / FAIL / HUMAN REVIEW REQUIRED
Banking/provider contracts      PASS / FAIL / HUMAN VERIFICATION REQUIRED
```

### Launch gates

Claude MUST NOT declare Xspeeria production-ready when any of the following exists without explicit human approval:

- Critical security vulnerability
- High-severity exploitable authorization issue
- Unresolved cross-user/cross-tenant data exposure
- Uncontrolled financial state transition
- Duplicate-settlement risk
- Unverified webhook authenticity
- Exposed production secret
- Unverified backup/recovery capability
- Unknown handling of sensitive financial data
- Unknown authentication boundary
- Unknown authorization boundary
- Unresolved production configuration weakness

### Final launch decision

The report MUST end with exactly one of:

```text
🔴 DO NOT LAUNCH
🟠 LAUNCH ONLY AFTER CRITICAL FIXES
🟡 LIMITED / PILOT LAUNCH
🟢 PRODUCTION READY
```

The decision MUST include evidence and unresolved risks.

---

## 38.7 HUMAN APPROVAL GATES & DEVELOPMENT GOVERNANCE

**Required artifact:** `docs/16_HUMAN_APPROVAL_GATES.md`

Claude is an engineering assistant, not the final authority for Xspeeria's financial, legal, security or regulatory decisions.

### Required development lifecycle

Every major feature should follow:

```text
REQUIREMENT
    ↓
ARCHITECTURE / DESIGN
    ↓
THREAT ANALYSIS
    ↓
IMPLEMENTATION PLAN
    ↓
HUMAN APPROVAL
    ↓
IMPLEMENTATION
    ↓
UNIT TESTS
    ↓
INTEGRATION TESTS
    ↓
SECURITY TESTS
    ↓
CODE REVIEW
    ↓
DOCUMENTATION UPDATE
    ↓
RELEASE APPROVAL
```

### Mandatory human approval areas

Claude MUST request human approval before finalizing decisions involving:

- Financial transaction rules
- Money movement logic
- Settlement authorization
- Refund/reversal rules
- KYC/AML policy
- Legal/regulatory interpretation
- Banking/provider selection
- Production secrets
- Production infrastructure
- Privileged roles
- Administrative permissions
- Data retention policy
- Customer data sharing
- Material security exceptions
- Production launch

### Claude operating rules

Claude MUST:

- State assumptions explicitly.
- Identify contradictions instead of silently choosing one.
- Preserve the designated source of truth.
- Never invent credentials, provider behavior, regulatory requirements or financial rules.
- Never claim a security control is implemented without evidence.
- Never mark an item verified when it was not inspected.
- Prefer reversible changes during early development.
- Produce tests alongside security-sensitive implementation.
- Update relevant documentation when architecture changes.
- Keep an auditable record of important decisions.

### Phase approval model

Use the following development gates:

```text
GATE 0 — Documentation & Architecture Approved
GATE 1 — Foundation Approved
GATE 2 — Authentication & Authorization Approved
GATE 3 — Core Marketplace Approved
GATE 4 — Financial Transaction Engine Approved
GATE 5 — Provider Integrations Approved
GATE 6 — Security & Compliance Review Approved
GATE 7 — Production Readiness Approved
```

Claude MUST NOT silently progress past a blocked gate.

---

# 39. REQUIRED DOCUMENTATION STRUCTURE

The Xspeeria repository SHOULD contain the following control documents, using the existing source-of-truth hierarchy:

```text
/docs/
│
├── 00_SOURCE_OF_TRUTH.md
├── 01_BUSINESS_PLAN.md
├── 02_PRODUCT_REQUIREMENTS.md
├── 03_ARCHITECTURE.md
├── 04_API_DATA_DICTIONARY.md
├── 05_FINANCIAL_STATE_MACHINE.md
├── 06_SECURITY_MASTER_AUDIT.md
├── 07_THREAT_MODEL.md
├── 08_AUTHORIZATION_MATRIX.md
├── 09_COMPLIANCE.md
├── 10_BANKING_INTEGRATIONS.md
├── 11_DESIGN_SYSTEM.md
├── 12_UI_UX_SPEC.md
├── 13_INFRASTRUCTURE.md
├── 14_DISASTER_RECOVERY.md
├── 15_PRODUCTION_READINESS.md
└── 16_HUMAN_APPROVAL_GATES.md
```

If the repository uses different filenames, preserve the existing naming convention while maintaining the same seven control areas.

---

# 40. PRE-BUILD VERIFICATION COMMAND

Before writing production code, Claude MUST produce a **Documentation & Architecture Readiness Report** with:

1. Confirmed source-of-truth documents
2. Architecture selected
3. Backend stack selected
4. Authentication architecture selected
5. Database architecture selected
6. Financial state machine status
7. Threat model status
8. Authorization matrix status
9. Provider integration strategy
10. Disaster recovery strategy
11. Production readiness framework
12. Human approval gates
13. Contradictions discovered
14. Missing information
15. Decisions requiring the founder/technical owner
16. Proposed Phase 0 implementation plan

The report MUST distinguish:

- `VERIFIED`
- `SUPPORTED BY DOCUMENTATION`
- `PROPOSED`
- `UNKNOWN`
- `REQUIRES HUMAN APPROVAL`

Do not begin full implementation until the documentation/architecture review has been completed.

---

# 41. UPDATED MASTER PRINCIPLE

Xspeeria must be built as a **controlled financial technology platform**, not merely as a functional web application.

The engineering objective is therefore:

```text
FUNCTIONAL
   +
SECURE
   +
AUTHORIZED
   +
FINANCIALLY CORRECT
   +
AUDITABLE
   +
RESILIENT
   +
COMPLIANT-BY-DESIGN
   +
HUMAN-APPROVED
   =
PRODUCTION-READY XSPEERIA
```

A feature is not considered complete merely because it works in the UI.

It is complete only when its:

- requirements;
- architecture;
- authorization;
- security controls;
- financial invariants;
- error handling;
- auditability;
- tests;
- documentation;
- operational behavior;
- and required human approvals

have been addressed.

# END OF ADDITIONAL XSPEERIA CONTROL PACK
