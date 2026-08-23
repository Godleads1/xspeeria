# Xspeeria

Wallet-less, non-custodial peer-to-peer fiat currency exchange. Xspeeria never holds
customer funds, never displays a stored balance, and coordinates settlement through
regulated banking partners. Subject to applicable licensing and regulatory approval.

**Status: PHASE 1 — CONTROLLED IMPLEMENTATION.** Implementation is permitted only within
approved milestones. Full implementation GO and production activation are **not**
granted. See `PROGRESS.md`.

## Layout

| Path | What it is |
|---|---|
| `backend/` | Python 3.12+ / FastAPI application. Layering: `api → services → domain + repositories + providers` |
| `mobile/` | Expo / React Native customer app (Expo Router) |
| `admin/` | Next.js operator console |
| `packages/tokens/` | Shared semantic design tokens — the single source of truth for both front ends |
| `docs/` | Governance, architecture, product and design documentation |
| `docs/adr/` | Ratified architecture decisions |

## Authority

Documentation governs implementation. Read in this order: `CLAUDE.md`,
`DOCUMENT_INDEX.md`, then the relevant `docs/` domain. `DOCUMENT_INDEX.md` §2A carries
the canonical domain glossary — conceptual names map to existing persisted names, and
nothing is renamed for terminology.

`docs/adr/001-transaction-state-machine.md` and
`docs/adr/002-financial-event-ledger-architecture.md` are human-ratified and govern
settlement and ledger semantics. `docs/04-api-data/05_API_Contract_Data_Dictionary.md`
is a **derived draft and not ratified**: its endpoint and error-code names are proposals.

## Development

Python, via [uv](https://docs.astral.sh/uv/) — `uv.lock` is the single source of
dependency truth:

```bash
uv sync --all-groups
uv run ruff check .
uv run mypy backend
uv run pytest
```

JavaScript, via npm workspaces:

```bash
npm install
npm run typecheck
npm run test
```

Milestone 1 needs no database, Redis, Celery, partner credentials or secrets. The
backend boots and its tests pass with none of them configured.

## Claude engineering layer

The repository also carries a project-local Claude Code engineering layer: domain
skills, slash commands, specialist review agents and security/QA hooks. See
`MANIFEST.md`; setup script at `scripts/install-xspeeria-claude.ps1`.
