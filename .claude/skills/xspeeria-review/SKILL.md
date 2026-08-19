---
name: xspeeria-review
description: Run a senior multi-domain review of the current Xspeeria implementation or change.
---

# /xspeeria-review

## Purpose

Perform a senior engineering review of changed code and all materially affected execution paths.

## Required sequence

1. Read CLAUDE.md.
2. Read the relevant authoritative documentation.
3. Inspect the changed files.
4. Identify affected execution paths.
5. Load relevant Xspeeria domain skills.
6. Review architecture.
7. Review security.
8. Review financial integrity where applicable.
9. Review APIs, database and data flows.
10. Review tests.
11. Review observability and documentation.

## Review priorities

Check for:

- Requirement violations
- Architectural drift
- Authorization failures
- Tenant-isolation failures
- Validation weaknesses
- Injection risks
- Unsafe error handling
- Financial invariant violations
- Race conditions
- Idempotency problems
- Dependency risks
- Missing tests
- Regression risks
- Observability gaps
- Documentation drift

## Severity

Use:

- CRITICAL
- HIGH
- MEDIUM
- LOW
- INFORMATIONAL

## Required output

For every finding provide:

- Severity
- File/path
- Evidence
- Why it matters
- Recommended remediation
- Verification method

Finish with:

- Blocking findings
- Non-blocking findings
- Required fixes
- Retest requirements
- Review conclusion

Never invent evidence.
