# ADR-078 — Row-Level Security on Customers' Private Tables (the Second Lock)

| Attribute | Value |
|---|---|
| **Status** | **IMPLEMENTED** — 2026-11-02 |
| **Decision ID** | DEC-085 |
| **Authority** | Product owner, 2026-11-02: *"do these: Postgres row-level security is not enabled (readiness review H-3). It's not Supabase and no database key is in any client, so this is a second lock, not the first. Every query is scoped to the signed-in user in code and covered by tests."* ADR-025 §1.4 had already reserved RLS as "a second layer". |

## Context

The first lock stays where it was: every customer route takes the caller from `current_principal` (never from the request) and filters on it, and the tests prove it (SEC-006, ADR-025 §2). No database credential is in the phone app or the console; only the backend connects. RLS is there so that one forgotten `WHERE user_id = …` in a customer request can't return another customer's private rows.

## Decisions

1. **Per-transaction scope** (`backend/app/db/row_scope.py`). Every transaction on every connection the backend opens starts with two transaction-local settings:
   - `xspeeria.scope`: `system` or `user`;
   - `xspeeria.user_id`: the signed-in customer, in `user` scope.

   Being transaction-local (`set_config(…, true)`), they disappear at commit or rollback, so a pooled connection never carries one customer's scope into another request. The hook sits on the engine (`build_engine`), so it covers ORM sessions, Core connections and Alembic.
2. **Who gets which scope.**
   - A request starts in `system` scope, because sign-in has to find the session before it knows who is asking.
   - As soon as `current_principal` has authenticated a customer, the rest of that request is in `user` scope. The open transaction is switched at once.
   - Background jobs, staff (admin) routes and command-line tools stay in `system` scope. They act for the service, and their own checks (staff roles, ADR-060) limit them.
   - The scope is a context variable, so it is per asyncio task. Concurrent requests and jobs can't see each other's.
3. **Policies** (migration `0038`). Each covered table gets `ENABLE` and `FORCE ROW LEVEL SECURITY` and a policy:
   - `system` scope sees every row;
   - `user` scope reads and writes only rows whose `user_id` is the signed-in customer (`USING` and `WITH CHECK`);
   - **no scope sees nothing.** That's any connection that bypasses the hook: `psql` as the app role, or a stray script. The database fails closed.

   `FORCE` holds the table owner to the policies too, in case a deployment connects with the migration role by mistake. Superusers and `BYPASSRLS` roles still bypass RLS, so the app must never use one (ADR-025 §1.4).
4. **Covered tables** are those private to one customer that a customer request never reads for anyone else:
   - `auth_sessions`, `mfa_factors`, `mfa_challenges`, `recovery_codes`, `trusted_devices`, `step_up_grants`, `verification_checks` (sign-in and second checks);
   - `kyc_cases` (identity checks);
   - `beneficiaries` (payout accounts);
   - `idempotency_records`, `tier_checks`, `notifications`;
   - `customer_activity`, `fraud_alerts` (written by the service, read only by staff).
5. **Notifications** may be *added* for someone else from a customer's request, because taking an offer tells its owner in the same transaction (ADR-044). Reading, changing and deleting stay own-rows-only. PostgreSQL's `ON CONFLICT` has to see the row it would collide with, so that one cross-customer insert uses a savepoint and ignores a duplicate instead (`app/services/notifications.py`).
6. **Deliberately not covered.** These tables are shared by design, so the code checks remain their lock. `backend/tests/integration/test_row_level_security.py` lists them with reasons. A new table with a customer column fails that test until it is covered or listed.
   - `offers`, `offer_groups`: the marketplace (taking one offer of a group hides the owner's others);
   - `matches`, `settlement_legs`, `match_payout_selections`: both sides of a deal;
   - `offer_queue_entries`: the owner sees the line;
   - `disputes`, `dispute_messages`: both parties and staff;
   - `push_tokens`: a phone's token moves to whoever signs in on it next.

7. **Stepping up, narrowly.** Two pieces of the service's own work run inside a customer's request but need both parties' rows:
   - opening the escrow steps reads both sides' payout accounts;
   - the pretend bank's messages and commands, in the simulation only.

   Each runs inside `acting_for_service(db, "<reason>")`, which switches to `system` scope and back. The test lists every use with its reason and fails on a new one, so each new use is a security review.

## Consequences

- A customer request can't read, change or create another customer's covered rows, even if the code forgets its filter.
- Staff and jobs are unaffected, and so are their checks. RLS does not limit staff; staff roles (ADR-060) and the audit log do.
- Hand-written SQL against covered tables as a non-superuser must first run `SELECT set_config('xspeeria.scope', 'system', true)`, or it sees no rows. That's intended.
- **Not verified:** what the managed-Postgres provider does with roles, and whether the deployment's login user has `BYPASSRLS`. Check it at deployment: `SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = current_user` must return `f, f`. `UNKNOWN — NOT VERIFIED` until the infrastructure milestone.

## Evidence

`backend/tests/integration/test_row_level_security.py`, against PostgreSQL 16:

- policies on and forced for exactly the covered tables, and nowhere else;
- with the code's filter removed, a customer sees only their own rows, also in a later transaction of the same request;
- a customer can't update or insert another customer's rows (`row-level security` error);
- a customer can notify someone else but not read what that person was told;
- a connection with no scope, the owner or `xspeeria_app`, sees nothing, and the setting is gone after the transaction;
- an empty or unknown scope matches nothing, with no cast error;
- scope never leaks between tasks or out of a request;
- every table with a customer column is covered or listed with a reason.

The whole backend suite also passes with the policies on (see the PR).
