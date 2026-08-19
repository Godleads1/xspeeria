---
name: xspeeria-audit
description: Run a complete Xspeeria repository and documentation readiness audit without modifying production code.
---

# /xspeeria-audit

## Purpose

Perform a comprehensive audit of the current Xspeeria project before implementation or major changes.

## Required sequence

1. Read CLAUDE.md.
2. Read DOCUMENT_INDEX.md.
3. Read MANIFEST.md.
4. Identify the authoritative Xspeeria documentation.
5. Inspect the actual repository structure and implementation.
6. Load relevant domain skills.
7. Compare documented requirements against implementation.
8. Record contradictions and unknowns.
9. Do not modify production code during the audit.

## Audit domains

- Requirements
- Source-of-truth integrity
- Architecture
- Security
- Authentication and authorization
- Tenant isolation
- Database and RLS
- APIs and data contracts
- Financial integrity
- Banking/payment integrations
- UI/UX
- Testing
- Infrastructure
- Observability
- Dependencies
- Documentation
- Production readiness

## Required output

Produce:

- Executive summary
- Repository inventory
- Source-of-truth assessment
- Requirements assessment
- Architecture assessment
- Security assessment
- Financial/banking assessment
- API/data assessment
- UI/UX assessment
- Testing assessment
- Infrastructure assessment
- Documentation assessment
- Contradictions
- Missing decisions
- Risks
- Dependency/impact map
- Recommended remediation
- GO / CONDITIONAL GO / NO-GO

Never claim something is verified without repository evidence.
Use UNKNOWN — NOT VERIFIED when evidence is unavailable.
