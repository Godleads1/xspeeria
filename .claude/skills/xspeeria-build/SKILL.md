---
name: xspeeria-build
description: Plan and implement an approved Xspeeria feature using test-first and security-first engineering.
---
# /xspeeria-build
Read CLAUDE.md and the authoritative Xspeeria documentation first. Inspect actual implementation paths before making findings.

For `/xspeeria-audit`: produce repository inventory, source-of-truth assessment, requirements, architecture, security, financial/banking, API/data, UI/UX, infrastructure/testing readiness, conflicts, missing decisions, risks, dependency graph and GO/CONDITIONAL GO/NO-GO.

For `/xspeeria-review`: review changed files plus affected execution paths; rank findings by severity with evidence and fixes.

For `/xspeeria-build`: plan first, map requirements and dependencies, implement only approved scope, test, then review. Never deploy or change production without approval.

For `/xspeeria-test`: run actual tests, report exact commands/results, and cover correctness, validation, authorization, isolation, failure and regression.

For `/xspeeria-security-check`: read `docs/07-security/Xspeeria_Security_Master_Audit.md` in full; build architecture and attack-surface maps; verify authentication, authorization/tenant isolation, database/RLS, APIs, business logic, financial/payment security, AI security, secrets, dependencies, files/storage, infrastructure, privacy and monitoring. Never expose secrets or fabricate evidence.

For `/xspeeria-production-check`: require evidence for requirements, security, authz, tests, dependencies, migrations, observability, rollback, documentation and unresolved unknowns. Use exactly one release classification.
