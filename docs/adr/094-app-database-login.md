# ADR-094 — The Server Logs In to the Database as `xspeeria_app`

| Attribute | Value |
|---|---|
| **Status** | **IMPLEMENTED** — 2026-11-03 |
| **Decision ID** | DEC-105 |
| **Authority** | Owner, 2026-11-03: *"Yes"* to fixing the database login grants (the ADR-085 finding: log in as the tables' owner, or complete the `xspeeria_app` grants). |

## Decision

- **The live server logs in as `xspeeria_app`,** the non-owning role (ADR-025 §1.4, ADR-028).
  - It holds only the rights each table needs.
  - It cannot change table definitions, switch off the row rules (ADR-078) or the append-only triggers, or empty a table.
- **The tables' owner is used only to run migrations,** with a separate login and password.
- **The grants are complete.** The whole integration suite was run with every connection the server opens switched to `xspeeria_app` (3 Nov 2026).
  - **First run:** one table was refused. `idempotency_records` was refused 1,005 times, because the app locks a record before deciding (`SELECT … FOR UPDATE`), and PostgreSQL allows that only with UPDATE rights on at least one column.
  - **Migration 0042:** grants UPDATE on **`expires_at` only**. The app never changes these rows, and could already delete one, so this adds no power.
  - **Second run:** nothing refused; 732 of 735 tests passed. The 3 failures were the migration tests' expected latest migration, now updated.

## Keeping it complete

- `backend/tests/as_app_role.py`, a pytest plugin, runs the server's own connections as `xspeeria_app` while the test fixtures keep the owner login:
  ```
  uv run pytest -p tests.as_app_role tests/integration
  ```
- It was checked both ways: with the new grant removed, the deal tests fail with "permission denied for table idempotency_records"; with it, they pass.
- **Run it before each release, and after any migration that adds a table.** It is not in the per-PR CI because it doubles the integration time. Adding it is a one-line CI step if wanted.
- `test_offers_api.py::test_app_role_grants` checks that the new grant is exactly `UPDATE (expires_at)`.

## With hosting

- **Two database logins:**
  1. **Migrations:** the tables' owner.
  2. **The API and the worker:** `xspeeria_app` (`DATABASE_URL`). Neither is a superuser or has `BYPASSRLS`.
- Both passwords are kept in the secret manager.
