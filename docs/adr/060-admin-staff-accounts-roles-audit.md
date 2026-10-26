# ADR-060 — Admin Console Staff: Accounts, Sign-in, Roles and Audit Log (A-1)

| Attribute | Value |
|---|---|
| **Status** | **IMPLEMENTED** — server (A-1) and console screens (A-2) 2026-10-26; A-3 not built |
| **Decision ID** | DEC-067 |
| **Authority** | Builds ADR-051 A-1 (owner decisions 2026-10-19). Roles from the Technical Design Specification §11.2; permission model from ADR-051 (per module Read / Create / Update / Delete / Approve); controls SEC-002, SEC-003, SEC-008, FX-04; Compliance Operations Manual §14; Security Master Audit §38.3 (authorization matrix, abuse cases) and B3 (cookie sessions). Owner instruction 2026-10-26: "Start one" (the admin console). |

## What is built

**Staff are separate from customers** — their own tables (migration 0023): `staff_roles`, `staff_accounts`, `staff_codes`, `staff_sessions`, `staff_audit_log`. A staff log-in never works in the app and a customer log-in never works in the console.

### Sign-in (ADR-051 Decision 1)

1. `POST /api/v1/admin/auth/login` — email + password (Argon2id). 5 wrong passwords lock the account for 15 minutes (as the customer PIN, SEC-003); an unknown email answers the same message, spends the same hashing time and locks the same way, so the console never reveals who is staff.
2. `POST /api/v1/admin/auth/verify` — the 6-digit code sent to the staff email (cannot be switched off). 10 minutes, 5 tries, single use, stored as a keyed HMAC.
3. The session is a random 256-bit token in a cookie: **httpOnly, SameSite=Strict, path `/api/v1/admin`, Secure** everywhere except `APP_ENV=local`. Stored only as SHA-256 and checked against its row on every request. It ends after **15 minutes without a request** (the API contract's 15-minute access token) and after **8 hours** in any case, at log-out, when the password changes or is reset, when the person's role changes and when the account is disabled.
4. Every admin route needs the header `X-Xspeeria-Admin: 1`. With SameSite=Strict cookies and no cross-site CORS for admin cookies, a page on another site can't make a staff member's browser act in the console (cross-site request forgery).

**Passwords:** 12–128 characters, not repetitive, not containing the email name (NIST SP 800-63B: length, not symbol rules). Forgot password emails a code (same answer whether or not the email has an account; at most one code a minute per account). Invited staff set their first password the same way, so no one ever sees or sends another person's password.

**First Super Admin:** `uv run python -m app.cli.create_super_admin --email … --name "…"` (asks for the password privately). Works only while no Super Admin exists; everyone else is invited from the console.

### Roles and permissions (SEC-008)

A permission is `<module>.<action>`: modules `dashboard, users, kyc, disputes, reversals, fraud_alerts, outages, staff, roles, audit`; actions `read, create, update, delete, approve` (ADR-051's "Full Access" = all five). The role is read from the database on every request.

The API contract §3.9 names `users.read`, `users.suspend`, `disputes.resolve`, `kyc.review`; under ADR-051's model these are `users.read`, `users.update`, `disputes.approve` and `kyc.update`. (The contract's §3.9 user routes come with A-3.)

**Escalation rules** (tested): no one can
- give a role, or a person, a permission they don't hold themselves;
- edit their own role or their own account (role, status, name) through staff management;
- change, weaken or act on a role or person that holds more than they do;
- edit or delete the `super_admin` role, or invite, change or disable a Super Admin, unless they are one;
- delete a built-in role, or a role someone still has.

Unknown permission names and unknown request fields are refused.

### Authorization matrix — built-in roles (TDS §11.2)

ALLOW = may; DENY = may not; CONDITIONAL = may, under the condition given.

| Action | support_agent | compliance_officer | ops_admin | super_admin | Condition |
|---|---|---|---|---|---|
| Sign in to the console | ALLOW | ALLOW | ALLOW | ALLOW | Password + email code; Super Admin hardware key before live money (ADR-051 Decision 2) |
| See own profile and permissions | ALLOW | ALLOW | ALLOW | ALLOW | — |
| Read staff list / roles | DENY | ALLOW | DENY | ALLOW | `staff.read` / `roles.read` |
| Invite or change staff | DENY | DENY | DENY | CONDITIONAL | Never themselves; only roles within their own permissions |
| Create / edit / delete roles | DENY | DENY | DENY | CONDITIONAL | Never their own role or `super_admin`; never built-in deletion |
| Read the audit log | DENY | ALLOW | ALLOW | ALLOW | `audit.read` (Compliance reviews Ops actions, COM §14.1) |
| Edit or delete audit entries | DENY | DENY | DENY | DENY | The database refuses UPDATE and DELETE for everyone |
| Read users | ALLOW | ALLOW | ALLOW | ALLOW | Built in A-3 |
| Suspend users (`users.update`) | DENY | DENY | DENY | ALLOW | Built in A-3 |
| Review identity checks (`kyc.*`) | DENY | ALLOW | read only | ALLOW | Built in A-3; four-eyes for reversing a rejection (COM §14.1) |
| Disputes (`disputes.*`) | read, create, update | read | read | ALLOW | Built in A-3 |
| Reversals (`reversals.*`) | DENY | read | read, create, update, approve | ALLOW | Built in A-3; never approve own request (ADR-051 Decision 4) |
| Fraud alerts / outages | DENY | fraud full, outages read | outages read, create, update | ALLOW | Built in A-3 |
| Release or change money | DENY | DENY | DENY | DENY | No staff action sets FUNDED / PAID_OUT / RETURNED (ADR-001, ADR-037) |

Custom roles can be created by anyone with `roles.create`, within their own permissions.

### Audit log (FX-04)

Every sign-in event (code sent, log-in, failures, locks, log-out), password set/reset/change, staff and role change is written to `staff_audit_log` **in the same transaction** as the change, with who, when, IP address, browser and what changed. Never a password, code or token (tested). The table is append-only: a database trigger refuses UPDATE and DELETE (tested), and the application role may only read and insert. `GET /api/v1/admin/audit-log` (filter by staff or action, newest first, pages of up to 100).

## Choices made while building (no owner decision needed — say if you want them different)

- **Session length:** 15 minutes idle, 8 hours at most. Easy to change in `app/domain/staff_rules.py`.
- **Opaque session token instead of a JWT** in the cookie: it can be ended at once (log-out, disable, role change), which a JWT can't until it expires.
- **A local data reset** (`reset_local_data`) keeps staff accounts: they are not customer data.

## A-2 — console screens (built 2026-10-26)

Next.js console in `admin/`: **Log-in** (password, then email code), **Set your password** (forgot password, and invited staff via a link `…/set-password?id=…` plus the emailed code — the link alone does nothing), **Overview**, **My profile** (change password), **Staff** (list, invite, change role, disable/enable), **Roles** (list, create, edit with an area × Read/Create/Update/Delete/Approve grid and "Full access", delete unused custom roles) and **Audit log** (filter, older pages, read-only).

- **Same-site only.** The browser calls `/api/v1/admin/…` on the console's own address; the console server forwards only those paths to the API (`ADMIN_API_ORIGIN`, default `http://127.0.0.1:8000`). No CORS is opened and the session cookie stays httpOnly and SameSite=Strict — checked in a real browser: page scripts can't read it.
- **Display follows permissions, the server decides.** The menu shows only allowed areas; buttons appear only where the server would allow the action (never on yourself, never beyond your own permissions, Super Admin only by a Super Admin); permission boxes you don't hold are greyed out. Every action is still checked by the server.
- Signed-out visits go to log-in; log-out ends the session on the server. Route parameters are untrusted (the invite id is used only if it is a well-formed id).
- Tests: 44 console tests (`admin/__tests__/`), plus a real-browser run against the real API (log-in with the email code, invite, create role, audit entry, log-out).

**Matched to the owner's Figma admin file** (`Web Design` page, 2026-10-26): log-in frames (frosted card, labels on the input border, green "FORGOT PASSWORD ?", Two-Factor Authentication step, reset steps), the shell (top bar, white menu with an ADMIN section, red Logout, grey content, breadcrumbs), Staff list (search, Filter By / Status / Reset Filter, Add Staff, ⋮ row menu) and Add Staff form, Audit Logs. Not copied from Figma, on purpose: the bell and language picker (no admin notifications or console translations yet — no control that does nothing), staff photo, phone and typed User ID (ADR-051: IDs are made by the server; none stored). **Still to come from the owner:** the logo (SVG) and the log-in background image — Figma's Starter plan limit stopped the download, so a text wordmark and a CSS gradient stand in.

**Known limit (decide before going live):** the console forwards requests, so the API sees the **console server's address** for every staff request. The audit log's "Address" column then shows the console server, and the sign-in rate limit (10 a minute per address) is shared by all staff. Fixing it means trusting the console's `X-Forwarded-For` header only from the console server's own address — a change to ADR-025 §4 ("proxy headers are not trusted") that needs a decision when the hosting is chosen.

## Not built yet

- **A-3:** users, identity-check review, disputes/support, reversals with the approval rule, fraud alerts, outages, dashboard.
- **Release gates:** Super Admin hardware security key before live money (ADR-051 Decision 2); a real email provider (Resend, needs the domain); the in-memory rate limiter needs Redis before more than one server runs (ADR-025 §4); quarterly access review (COM §14.2) is a process, not code.
