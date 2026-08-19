---
name: xspeeria-production-check
description: Run the final Xspeeria production-readiness release gate.
---

# /xspeeria-production-check

## Purpose

Determine whether Xspeeria is safe and sufficiently prepared for its intended release stage.

## Required sequence

1. Read CLAUDE.md.
2. Read DOCUMENT_INDEX.md.
3. Identify authoritative requirements.
4. Inspect actual implementation.
5. Review security evidence.
6. Review architecture.
7. Review authorization and tenant isolation.
8. Review tests and test results.
9. Review dependencies.
10. Review migrations.
11. Review observability.
12. Review rollback and recovery.
13. Review documentation.
14. Identify unresolved unknowns.
15. Produce exactly one release classification.

## Production gate

Evaluate:

- Requirements
- Architecture
- Security
- Authentication
- Authorization
- Tenant isolation
- Database
- APIs
- Financial integrity
- Tests
- Dependencies
- Migrations
- Monitoring
- Logging
- Observability
- Backups
- Recovery
- Rollback
- Documentation
- Operational readiness

## Release classifications

Use exactly one:

### DO NOT LAUNCH

Critical blockers remain.

### LAUNCH ONLY AFTER CRITICAL FIXES

Launch is possible after specified blockers are resolved and verified.

### LIMITED-PILOT

Suitable only for controlled users/environments with explicit limitations.

### PRODUCTION READY

Evidence supports production release.

## Required output

Provide:

- Executive release summary
- Evidence reviewed
- Critical blockers
- High-risk findings
- Medium/low findings
- Required remediation
- Verification requirements
- Residual risks
- Final release classification

Never equate "it works" with "it is secure."

Never claim production readiness without evidence.
