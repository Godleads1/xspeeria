---
name: xspeeria-test
description: Run and analyze the Xspeeria test strategy with risk-based, security-focused, financial-integrity and regression coverage.
---

# /xspeeria-test

## Purpose

Validate the Xspeeria implementation through actual automated and manual testing evidence.

Testing must verify not only whether functionality works, but whether it fails safely under invalid, unauthorized, malicious, duplicated, concurrent, and dependency-failure conditions.

## Required sequence

1. Read `CLAUDE.md`.
2. Read `DOCUMENT_INDEX.md`.
3. Identify the authoritative requirements for the feature being tested.
4. Inspect the actual implementation and affected execution paths.
5. Load relevant Xspeeria domain skills.
6. Identify normal behavior.
7. Identify security-sensitive behavior.
8. Identify financial-sensitive behavior where applicable.
9. Identify external dependency behavior where applicable.
10. Inspect existing tests.
11. Run the relevant existing test suite.
12. Add or recommend missing risk-based tests.
13. Re-run affected tests.
14. Report exact test evidence.

## Mandatory functional coverage

Where applicable test:

- Happy path
- Invalid input
- Missing required input
- Boundary values
- Invalid state transitions
- Dependency failures
- Timeout behavior
- Retry behavior
- Duplicate requests
- Concurrency
- Ordering problems
- Regression scenarios

## Mandatory authentication and authorization coverage

Where applicable test:

- Unauthenticated access
- Invalid authentication
- Expired authentication
- Revoked authentication
- Unauthorized role
- Unauthorized resource access
- Cross-user access
- Cross-tenant access
- Privilege escalation attempts
- Client-supplied ownership identifiers
- Client-supplied roles or permissions

Never assume authentication proves authorization.

## Mandatory API security coverage

For sensitive APIs test:

- Server-side authorization
- Object-level authorization
- Function-level authorization
- Input validation
- Output/data minimization
- Rate limiting where required
- Malformed requests
- Unexpected content types
- Excessive field submission
- Sensitive error disclosure
- Enumeration resistance where applicable

Sensitive API responses must not expose unnecessary internal or confidential data.

## Mandatory secrets testing

Verify that secrets are not exposed through:

- frontend bundles
- API responses
- source control
- application logs
- exception traces
- test output
- configuration committed to the repository

Never print actual secret values during testing.

Report only whether exposure exists and where.

## Mandatory financial coverage

For money, exchange, fees, settlement, payment, or transaction functionality test:

- Decimal/fixed-precision handling
- Currency validation
- Amount validation
- Server-authoritative financial values
- Transaction-state transitions
- Duplicate transaction prevention
- Idempotency
- Retry handling
- Timeout handling
- Reversal behavior
- Concurrent operations
- Provider disagreement
- Reconciliation behavior
- Audit-trail creation

Never use binary floating point as authoritative monetary state.

## Mandatory webhook/integration coverage

Where applicable test:

- Missing signature
- Invalid signature
- Replay attempt
- Duplicate event
- Out-of-order event
- Unknown event
- Invalid payload
- Provider timeout
- Provider failure
- Idempotent processing

A webhook must never be trusted merely because it reached the expected endpoint.

## Mandatory data isolation coverage

Where applicable verify that:

User A cannot access User B's protected resources.

Tenant A cannot access Tenant B's protected resources.

Normal users cannot access administrative resources.

Public endpoints cannot expose private resources.

Client manipulation cannot bypass server-side access controls.

## Evidence requirements

Never claim a test passed unless it actually ran and passed.

For every executed test command report:

- Command executed
- Environment
- Result
- Tests passed
- Tests failed
- Tests skipped
- Errors
- Relevant warnings

## Coverage assessment

After testing, report:

- Requirements tested
- Requirements not tested
- Security coverage
- Authorization coverage
- Financial coverage where applicable
- Integration coverage where applicable
- Remaining coverage gaps
- Regression risk
- Recommended next actions

## Failure rule

If tests cannot be executed, state:

`TEST EXECUTION NOT VERIFIED`

Explain why.

If required evidence is unavailable, state:

`UNKNOWN — NOT VERIFIED`

Never fabricate test results.

## Completion rule

`/xspeeria-test` may report successful validation only when the relevant tests were actually executed and no unresolved CRITICAL or HIGH test-related blocker remains.