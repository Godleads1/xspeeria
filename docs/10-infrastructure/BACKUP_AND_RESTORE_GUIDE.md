# Backup and Restore Guide

**Owner request, 2026-11-10:** a backup guide. This closes the *written* part of readiness item **C-4** and **SEC-030** ("Backups are encrypted, access-controlled and proven by actual restoration exercises").

Nothing here has been run on a real server yet: hosting isn't chosen ([`HOSTING_OPTIONS_2026-11.md`](../13-governance/HOSTING_OPTIONS_2026-11.md)). Until **one restore test is recorded** (§6), SEC-030 stays **not verified**.

## 1. Rules that come from decisions already made

| Rule | Source |
|---|---|
| The database **and its backups** stay in Nigeria (payment data, from 1 Jan 2027). Confirm the backup location in the hosting contract, in writing. | DEC-096, `HOSTING_OPTIONS_2026-11.md` |
| Daily backups at least, plus one **recorded** restore test before the pilot. | Readiness review C-4, step 3 |
| Backups are encrypted and only a named few can read them. | SEC-030 |
| A restore goes to a **new** database, never over the old one. | Infrastructure Handbook §7.2 |
| The append-only money records (`settlement_events`, `webhook_receipts`, ledger tables) are checked after a restore before they're trusted. | Handbook §7.1.1 |

**Recovery targets.** The handbook proposes losing at most **5 minutes** of data and being back within **30 minutes to 2 hours**. These figures are an *assumption* written for AWS RDS, not yet agreed (Handbook §7.1). Agree them with the hosting provider's actual backup options, then write them here. Until then they are `UNKNOWN — NOT VERIFIED`.

## 2. What must be backed up

| What | Where it lives | How |
|---|---|---|
| **The PostgreSQL database**: everything about customers, offers, deals, escrow evidence, staff and audit logs | The database server | §3 |
| **The keys** in the server's settings, listed below | The server's environment or secret manager | §4. **Never in the same place as the database backup.** |
| Staff photos, adverts | Cloudflare R2 (ADR-049) | Provider versioning; lower priority |

Not needed:
- **Didit** keeps the identity-check documents. Xspeeria keeps only the results.
- **The partner bank** keeps the money.
- **The pretend bank** forgets everything on restart and is never used outside `APP_ENV=local`.

## 3. The database

**If the host offers managed PostgreSQL** (a Nigerian cloud, ADR option A):
1. Turn on daily automatic backups **and** point-in-time recovery (continuous WAL archiving).
2. Keep them at least 35 days, the Handbook's proposal.
3. Ask in writing:
   - where the backups are stored (it must be Nigeria);
   - whether they're encrypted;
   - who at the provider can read them.

**If we run PostgreSQL ourselves** (for example, the AWS Lagos Local Zone, option B):

- **Every night**, a full dump, encrypted before it leaves the server:
  ```bash
  pg_dump --format=custom --no-owner --dbname "$BACKUP_DATABASE_URL" \
    | age -r "$BACKUP_PUBLIC_KEY" > "xspeeria-$(date -u +%Y%m%dT%H%MZ).dump.age"
  ```
  `age` (or GPG) encrypts with a **public** key. The private key that can open backups is kept offline by two named people.
- **Continuously:** WAL archiving (for example `pgBackRest` or `wal-g`) to storage in Nigeria, so a restore can go to any minute.
- **Copies:** keep one copy on a different machine or provider in Nigeria, with **write-once** or versioned storage, so the server's own login can't delete the backups.
- **Who:** the backup login has read-only database rights. It is not the app's login (`xspeeria_app`) and not the owner's.

**Check every night that it worked.** The backup job should report to the operations alerts (ADR-074): a missing or failed backup must page someone. Wiring it in comes with the hosting setup.

## 4. The keys (back up separately)

These live in the server's settings. **Losing them is as bad as losing the database**, and leaking them is worse:

| Setting | If lost |
|---|---|
| `BENEFICIARY_ENCRYPTION_KEY` (and `…_PREVIOUS` during a rotation) | Saved payout account numbers can never be read again. |
| `KYC_IDENTITY_KEY` | The "one ID, one account" check can't recognise earlier IDs (ADR-041). |
| `JWT_SECRET_KEY` | Everyone is signed out (harmless). |
| `MFA_ENCRYPTION_KEY` | Not needed since ADR-054 (harmless). |
| `DIDIT_API_KEY`, `DIDIT_WEBHOOK_SECRET`, `RESEND_API_KEY`, the partner bank's keys | Get new ones from the provider. |

**Where to keep them:**
- in the hosting provider's secret manager;
- plus **one sealed offline copy** (an encrypted file or a printed envelope in a safe), held by two named people.

Never put them in a chat, an email, the repository or the database backup.

## 5. Restoring

**Use it when** data is lost or corrupted, a migration fails partway (Handbook §8, "restore from the pre-migration snapshot"), or for the restore test.

1. **Stop the damage.** If customers could be affected, use the emergency **pause all deals** switch in the admin console (ADR-075). Record the time in the incident record ([`INCIDENT_RESPONSE_PLAN.md`](../07-security/INCIDENT_RESPONSE_PLAN.md)).
2. **Restore into a new, empty database.** Never restore over the damaged one, so it can still be examined.
   ```bash
   age -d -i backup-private-key.txt xspeeria-YYYYMMDDTHHMMZ.dump.age \
     | pg_restore --no-owner --role="$OWNER_ROLE" --dbname "$NEW_DATABASE_URL"
   ```
   `$OWNER_ROLE` is the login the migrations run as, the tables' owner. It is never the app's login, `xspeeria_app`.
   Or use the provider's "restore to a point in time".
3. **Check the restored copy before using it:**
   - the schema is at the version the code expects: `uv run alembic current` shows the same head as `uv run alembic heads`;
   - the main tables have sensible row counts (`users`, `offers`, `matches`, `settlements`, `settlement_legs`, `settlement_events`) compared with the last known figures (System health, ADR-072);
   - the app's database login (`xspeeria_app`) still has only its own rights, and row-level security is on (ADR-078). The test suite's `test_migrations.py` checks this on a test copy;
   - **the money adds up:** run the daily reconciliation over *all* deals (ADR-110) and expect no new exceptions. Any exception is a P1 investigation before going live again.
4. **Point the servers at the restored database**, by changing `DATABASE_URL`, and restart them. Keep the old one untouched until the incident is closed.
5. **Deleted data comes back with an old backup.** The clean-up jobs remove it again within the hour:
   - help requests closed over 12 hours ago (ADR-103);
   - accounts past their 14 days (ADR-095);
   - activity older than 5 years (ADR-073).

   Check they ran, on System health → jobs. Tell Compliance if a restore brought back data a customer had asked to delete.
6. **Partner bank:** ask the partner for its record of every escrow that moved after the backup's time. Compare it with ours. Anything missing on our side is entered **only from the partner's signed messages**, never typed in by hand (ADR-037, L-22).
7. **Resume deals** in the console. Write up what happened and how much data was lost.

## 6. The restore test (do before the pilot, then every 3 months)

1. Take last night's backup.
2. Restore it to a separate test server, following §5 steps 2–3.
3. Record in `docs/07-security/SECURITY_EVIDENCE_REGISTER.md` (SEC-030):
   - the date;
   - who did it;
   - the backup's time;
   - how long the restore took;
   - the row counts;
   - the reconciliation result;
   - anything that went wrong.
4. Delete the test copy afterwards. It holds real customer data.

## 7. Open items

- Hosting choice and the provider's written answers on backup location and encryption (owner, C-3).
- Agreed recovery targets (Engineering and Compliance, Handbook §7.1).
- The two named key holders (owner).
- A backup-failure alert, wired into the operations alerts when hosting exists.
