# Xspeeria Incident Response Plan

| Attribute | Value |
|---|---|
| **Status** | **DOCUMENTED** — 2026-11-01. Not yet exercised (SEC-038 needs one recorded exercise before launch; Enterprise Security Standard release gate). |
| **Authority** | Product owner, 2026-11-01: "do this monitoring, alerts or incident plan"; alerts go to **Super Admins** (ADR-074). |
| **Meets** | SEC-038 (triage, containment, credential rotation, evidence preservation, customer communication). Works with SEC-037 alerts (ADR-074), System Health (ADR-072), outage notices (ADR-066), the activity logs (ADR-060, ADR-073). |
| **Owner** | The on-call Super Admin is the **incident lead** until they hand over. The product owner decides anything that can't be undone. |

Xspeeria never holds customer money: the partner bank's escrow does. An incident here is about **people's accounts, their data, deals in escrow and the trust of the partner bank**. When in doubt, stop the harm first and investigate second, but never destroy evidence to do it.

## 1. What counts as an incident

Anything that does, or could, harm customers, their data or their deals:
- someone getting into an account or a staff login that isn't theirs;
- data seen, copied or changed by someone who shouldn't have it;
- a deal stuck, paid wrongly, or money needing recovery;
- the app or the admin console down or failing for many people;
- forged or failing messages from the partner bank or Didit;
- a leaked secret (a key in a chat, a repository, a screenshot or a log).

An alert (ADR-074) is a **signal**, not yet an incident. The incident lead decides.

## 2. How serious is it

The same four levels as the alerts and the Infrastructure Handbook §6.3.

| Level | Meaning | Examples | Start within | Update people every |
|---|---|---|---|---|
| **P1 — Critical** | Money, accounts or data are being harmed now, or the service is down | A deal needing money recovered; escrow processing stopped; webhooks failing; a leaked live key; a confirmed account takeover; data seen by the wrong people | 15 minutes, any hour | 1 hour |
| **P2 — High** | Likely harm soon, or a security control under attack | Many failed sign-ins (an attack); a staff role changed unexpectedly; forged webhooks refused; an outside service failing; a high-severity fraud alert | 1 hour | 4 hours |
| **P3 — Medium** | Something is wrong but contained | One API slow or failing for some calls; records that don't match the bank | Next working day | Daily |
| **P4 — Low** | Worth fixing, no harm | Old dependencies; small noise in the figures | Weekly review | — |

Raise the level the moment you learn more. Lowering it needs the incident lead.

## 3. The steps

### 3.1 Notice and open the incident

1. An alert arrives (System Health › Alerts, the staff bell, and email once an email provider exists), or someone reports a problem.
2. On the alert, press **"I'm on it"**. That is the record of who took it and when.
3. Open an **incident record**: a new document named `INC-YYYYMMDD-n` (for now, a private document the owner can see; a ticket system later). Write down:
   - the time you noticed and the level;
   - the alert reference (for example `#3F2A91C4`);
   - what you know and what you don't.

   Times are in **Lagos time** (Africa/Lagos), like the console.
4. For **P1 and P2**, tell the product owner straight away.

### 3.2 Understand (triage)

Use what already exists before guessing:

| Question | Where to look |
|---|---|
| Is the service up? Which API, job or outside service fails? | Admin › **System Health** (ADR-072): warnings, every API, jobs, escrow queues |
| Who did what, from which address? (staff) | Admin › **Audit log** (append-only, ADR-060) |
| What did this customer do, and when? | Admin › Users › a customer › **Activity** (ADR-073; Super Admin; kept 5 years) |
| What happened to this deal, step by step? | Admin › **Deals** › the deal's timeline (ADR-073) |
| Is a customer flagged? | Admin › **Fraud** (ADR-068) |
| What did the bank or Didit send us? | `webhook_receipts` and `kyc_webhook_events` tables (each message kept with its verdict) |
| What did the server log? | The server's JSON logs, by request ID. **Where they are kept depends on hosting, which isn't chosen yet (C-3).** |

Write each finding into the incident record with the time you found it.

### 3.3 Contain: stop the harm

Pick only what the situation needs, and write down every action and its time.

| Situation | What to do now | How |
|---|---|---|
| A customer account is being misused | Suspend it: every session ends at once and the customer's offers are hidden | Admin › Users › **Suspend** (Super Admin, reason required; ADR-062) |
| A staff account is misused | Set it to inactive: its sessions end at once | Admin › Staff › change status (ADR-060) |
| A staff role was given too much | Change or delete the role; check the audit log for what was done with it | Admin › Roles (now limited to roles within your own powers, F-014) |
| A deal must not progress | A **dispute** pauses that deal's escrow (blocking hold) | Admin › Disputes › open a case for the customer (ADR-063) |
| Money already in escrow must go back | Ask for a refund; a second person approves it | Admin › Reversals (ADR-065) |
| Customers need to know about a problem | Post an outage notice; every signed-in app user sees it on Home | Admin › Outages (ADR-066) |
| A secret leaked | Rotate it (§3.4) | — |
| Forged webhooks | They're already refused (signature, time window, duplicates). If the shared secret may be known, rotate it. | §3.4 |

**Not built yet.** Each of these is needed before live money, and has a manual workaround until then:

| Missing | What it would do | Workaround today |
|---|---|---|
| **"Pause all deals" switch** (SEC-039) | Stop new deals and escrow progress everywhere | Stop the server (§3.6), then post an outage notice |
| **"End every session" action** | Sign out every customer and staff member | Stop the server and ask the developer to revoke all session rows, with the owner's approval, recorded in the incident |
| **Blocking an IP address range** | Stop an attack from one place | Depends on hosting (C-3); add rules at the hosting firewall or CDN |

### 3.4 Rotate secrets

Rotate a secret whenever it may have been seen by anyone who shouldn't have it: in a chat, a screenshot, a commit, a log or a laptop that was lost. Gitleaks scans every commit and its full history in CI. A finding there means **rotate first**, then remove the secret from the repository. Removing it doesn't remove it from history.

| Secret | What it protects | Effect of rotating | Ready? |
|---|---|---|---|
| `JWT_SECRET_KEY` | Signs 15-minute access tokens | Current access tokens stop working; the app refreshes them with its refresh token, so **sessions continue**. To end sessions too, see "End every session" above. | Yes: change the value and restart |
| `WEBHOOK_SHARED_SECRET` | Messages from the partner bank | Must change at the bank at the same moment, or bank messages are refused | Simulation only; the real procedure comes from the bank's agreement |
| `DIDIT_API_KEY`, `DIDIT_WEBHOOK_SECRET` | Identity checks | New key from Didit's console; set both, restart | Yes |
| `BENEFICIARY_ENCRYPTION_KEY` | Payout account numbers (sealed) | **Data sealed with the old key can't be read with a new one** | **No: needs a re-encryption tool.** Gap, before live money |
| `KYC_IDENTITY_KEY` | The one-person-one-account document key | Old document keys stop matching new ones | **No: needs a re-keying tool.** Gap, before live money |
| `MFA_ENCRYPTION_KEY` | Sealed second-factor data | As above | Check whether still in use; rotation tool needed if so |
| `SENTRY_DSN` | Where error reports go | Errors go to the new project | Yes |
| Staff passwords | Console sign-in | Sessions end; codes issued earlier stop working (F-003) | Yes: each person changes theirs |
| Customer PINs | App sign-in | Other sessions end; checks started earlier stop working (F-001) | Yes: the customer changes it, or uses Forgot PIN |

Keys live in environment variables today. A secret manager with rotation is planned with hosting (C-3, H-2).

### 3.5 Keep the evidence

Evidence is needed to understand what happened, for the partner bank and for any regulator or court.
- **Never delete or edit** audit, activity, deal, dispute or webhook records. Most can't be: the database refuses it, or the app has no permission to delete.
- Before changing anything on a server or the database, take a **snapshot or backup** where hosting allows, and note its name and time in the incident record. (Backups: SEC-030, not built yet.)
- **Export** what you looked at: audit log rows, activity rows, deal timelines, System Health. Note the time of each export.
- Keep **logs** for the incident's period. Note the request IDs you followed.
- Write down **who knew what, when**, and every action taken.
- Store the evidence where only the incident lead and the owner can read it.
- Customer data in evidence stays as private as it is in the app: last 4 digits of account numbers at most, no PINs or codes (they're never stored anyway).

### 3.6 Fix and recover

1. Find the cause, not just the symptom. A fix goes through the normal checks: tests, review, CI.
2. Restore the service. If a release caused it, roll back to the last good one (Infrastructure Handbook §7.4 and the Rollback runbook in §8). **The deploy pipeline with rollback isn't built yet (C-3).**
3. Check deals that were in progress during the incident, one by one, against the deal timeline:
   - Funded legs: are they still safe in escrow?
   - Payouts: did they go to the right accounts?
   - Records: are any that don't match the bank resolved?
4. Lift containment step by step, and watch the alerts.

### 3.7 Tell people

| Who | When | How | Who decides |
|---|---|---|---|
| Product owner | P1/P2: at once | Phone or message | Incident lead |
| Customers affected | As soon as the facts are clear enough not to mislead | Outage notice in the app (ADR-066); email once a provider exists | Owner |
| A customer whose account or data was affected | Promptly, once confirmed | Personally: what happened, what we did, what they should do (for example change PIN) | Owner |
| Partner bank | As the agreement requires | **Agreement not signed yet (C-1)** | Owner |
| Regulators (data protection, payments) | Within the legal deadline after learning of a personal-data breach | **The duties and deadlines must be confirmed by counsel (C-2) and added here before launch.** Don't guess them in an incident. | Owner + lawyer |

What to say:
- **Do:** what happened, in plain words; what it means for them; what we've done; what they should do; when they'll hear from us next.
- **Don't:** guess at a cause, blame anyone, promise what isn't certain, or share another customer's information.

### 3.8 Close and learn

1. Resolve the alerts with a note saying what was found and done. The note is kept with the alert.
2. Within **5 working days** of a P1 or P2, hold a blameless review and record:
   - a timeline;
   - the cause;
   - what went well and what didn't;
   - actions, each with an owner and a date.
3. Make the actions real: issues, tests, rule changes. Update this plan if a step was wrong or missing.
4. Add the incident and its review to the security evidence register when it proves or changes a control.

## 4. Quick cards by alert

What each alert usually means and where to start (rules: ADR-074).

| Alert | Start here |
|---|---|
| **Many failed customer sign-ins** | System Health › `POST /api/v1/auth/login`. Customers › the accounts named in Fraud (PIN lockouts). If one account: suspend it if misused. If many: likely a password-spraying attack; involve hosting for address blocking (C-3). |
| **Many failed staff sign-ins** | Audit log › `login_failed`, `login_locked` by address. Locked accounts stay locked 15 minutes. Tell staff to expect it; never share codes. |
| **A staff account or role was changed** | Audit log › the entry. Was it expected? If not: set the account inactive, undo the change, and check what was done with it. |
| **Unusually many deals** | Deals list for the last hour. A promotion, or abuse? Check Fraud. A dispute pauses a deal's escrow if needed. |
| **A deal needs money recovered** | The deal's timeline and the reversal process. Tell the owner (P1). |
| **A high-severity fraud alert** | Fraud › the case (ADR-068). |
| **Webhooks are being refused** | System Health › webhooks. Someone may be forging messages, or a partner changed its secret or clock. Check with the partner before rotating. |
| **A webhook is failing** | Server errors on our side: logs by request ID; the partner will retry. P1 while it lasts. |
| **An API is failing** | System Health › the API; logs; Sentry, once switched on. A recent release? Roll back. |
| **An outside service is failing** | Their status page; System Health › outside services. Post an outage notice if customers are affected. |
| **A background job is failing** | System Health › jobs: the error type. Logs at that time. |
| **Escrow processing has stopped** | P1. System Health › jobs and escrow queues. Restart the worker. Check deals whose funding windows passed while it was down. |

## 5. Before launch (gaps)

These must be in place before live money; most also before the pilot.
- An **on-call rota**: who answers out of hours, and how they're reached. Owner to name people.
- An **email provider**, so alerts reach Super Admins without the page open (C-5).
- **Hosting** with central logs, backups and a rollback pipeline (C-3, C-4).
- The **pause-all-deals switch** (SEC-039), an **end-every-session** action, and **key rotation tools** for `BENEFICIARY_ENCRYPTION_KEY` and `KYC_IDENTITY_KEY`.
- **Legal duties** confirmed (C-2) and the partner bank's incident clauses (C-1) added to §3.7.
- **One recorded exercise** of this plan (a table-top drill of a P1), with its review filed. SEC-038 asks for it to be *exercised*, not only written.
