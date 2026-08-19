# XSPEERIA — CLAUDE CODE ENGINEERING CONSTITUTION

Build Xspeeria as a production-oriented, security-first platform using repository documentation as the implementation source of truth.

## Authority
1. CLAUDE.md
2. DOCUMENT_INDEX.md
3. docs/00-source-of-truth/
4. docs/
5. reference/ (archival/source material)
6. existing code (evidence of implementation, not proof of requirements)

If documents conflict, STOP, report the conflict, and request a decision. Never silently choose.

## Non-negotiable rules
- Never invent requirements, credentials, APIs, schemas, provider behavior, or compliance claims.
- Never expose secrets; redact values.
- Frontend restrictions are not security controls.
- Authentication is not authorization.
- Verify authorization server-side.
- Treat client input as untrusted.
- Never use binary floating point for authoritative monetary state.
- Financial state changes must be auditable and idempotent where applicable.
- Never trust client-supplied userId, tenantId, role, price, balance, transaction status, or permission.
- Do not deploy, migrate production, rotate credentials, or contact real financial systems without explicit human approval.
- Do not claim tests passed unless they actually ran and passed.
- If evidence is unavailable, say `UNKNOWN — NOT VERIFIED`.

## Required loop
PLAN → TRACE REQUIREMENTS → IMPLEMENT → TEST → SECURITY REVIEW → CODE REVIEW → DOCUMENT → REPORT

## Definition of Done
Requirements mapped; authorization/security verified; server validation present; normal/failure/abuse tests present; observability adequate; docs updated; no unresolved critical/high issue introduced.

## Security baseline
Use `docs/07-security/Xspeeria_Security_Master_Audit.md` as the mandatory security baseline.

## Evidence states
DOCUMENTED / IMPLEMENTED / VERIFIED / UNKNOWN

## Style
Be evidence-based, conservative with assumptions, explicit about trade-offs, and prefer small reversible changes.

## Approved Backend Architecture

The authoritative backend architecture for Xspeeria is:

- Python
- FastAPI
- PostgreSQL
- SQLAlchemy
- Pydantic
- Redis where required
- Background workers/jobs where required
- Containerized deployment where required

The primary backend engineering specification is:

`docs/03-architecture/Xspeeria_Master_Prompt_Python_Backend.md`

### Architecture Conflict Rule

If another Xspeeria document proposes Node.js, Express, NestJS, Supabase-as-backend, or another conflicting backend implementation:

1. Do not treat that backend technology choice as authoritative.
2. Preserve the document as product, historical, or reference material where appropriate.
3. Extract technology-independent business, product, UX, API, data, security, and functional requirements.
4. Do not copy conflicting backend implementation decisions into the Python/FastAPI architecture.
5. Report any material conflict that cannot safely be reconciled.

Frontend JavaScript or TypeScript requirements are not invalidated by this decision.

This decision governs the Xspeeria backend only.

### Architecture Change Control

Claude must not silently replace or migrate the Xspeeria backend away from Python/FastAPI.

Any future change to the authoritative backend stack requires explicit human approval.

Until such approval exists:

`Python + FastAPI = AUTHORITATIVE XSPEERIA BACKEND`