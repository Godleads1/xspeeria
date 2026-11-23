# ADR-112 — Fixes from the 40-Point Security Check

| Attribute | Value |
|---|---|
| **Status** | **IMPLEMENTED** — 2026-11-23. Not verified by an outside tester; CI does not run (GitHub billing). |
| **Decision ID** | DEC-124 |
| **Authority** | Owner, 2026-11-23: asked for the code to be checked against the 40-point security checklist, then "go" on the six code fixes listed under "What to fix" in that check (Claude Doc "Xspeeria security check against the 40-point checklist"). |
| **Changes** | ADR-075 (a second emergency switch beside "Pause all deals"); ADR-047 (a phone change now signs out other sessions); the staff password rule (one more check). |

## Decision

1. **Text messages only to the countries Xspeeria serves** (SMS pumping).
   - The server sends a code only to numbers whose calling code is one the app's phone picker offers: +1, +20, +27, +33, +44, +49, +86, +212, +221, +233, +234, +251, +254, +255, +256, +260, +263 (`auth_rules.SUPPORTED_CALLING_CODES`).
   - Other numbers get `VAL_422_INVALID_PHONE` "Phone numbers from this country can't be used on Xspeeria yet." at sign-up, PIN reset by text and phone change. No code is sent.
   - Adding a corridor country means adding its calling code here as well.
2. **An overall cap on text messages:** at most **60 codes a minute to all numbers together** (`SMS_ALL_NUMBERS_PER_MINUTE`; ×20 in the relaxed local setting). Above it, every request for a code gets the usual "too many attempts" answer for a minute, and the log line `sms_all_numbers_cap_reached` is written. The per-number limits (5 an hour, 10 a day) are unchanged.
   - 60 a minute is a starting value, not a measured one. Raise it when real sign-up volume needs more.
3. **A new phone number signs out every other session** (`revoke_reason = 'phone_change'`). The session that made the change stays signed in, as with a PIN change.
4. **"Pause sign-ups and text messages"**, a Super Admin switch in Emergency controls (System Health), for an attack on sign-up or a text-message bill running up.
   - While paused: no new accounts and no text-message codes (sign-up, PIN reset by text, phone change, the text part of a code check). The answer is `SYS_503_SERVICE_UNAVAILABLE` with `details.reason = "signups_paused"`.
   - Still working: signing in with the PIN, Face ID, the face check, email codes, deals.
   - Same rules as "Pause all deals": Super Admin only (checked by the server), reason of 5–500 characters, staff audit log (`signups_paused` / `signups_resumed`), P1 alert `emergency_control_used` for the other Super Admins. At most one pause is open (`signup_pauses`, unique index). Rows are kept.
5. **Leaked staff passwords are refused.** A new or reset staff password is checked, ignoring case, against 30,447 leaked passwords of 12 or more characters (`app/data/leaked_passwords_12plus.txt.gz`). The list was built on 2026-11-23 from SecLists (MIT licence): `100k-most-used-passwords-NCSC.txt`, `Pwdb_top-1000000.txt` and `rockyou-75.txt`. The check is local; no password leaves the server.
6. **Production refuses a wildcard browser origin.** The API won't start in production if `CORS_ALLOWED_ORIGINS` holds `*` or any origin that isn't `https://`.
7. **One partner event is accepted once at most.** A unique index on `webhook_receipts (partner_id, provider_event_id)` covers the verdicts that change money (`ACCEPTED`, `QUARANTINED`, `CONTRADICTORY`). Duplicates are still recorded as `DUPLICATE`. This backs up the re-check under the settlement lock.
8. **A test that failed only alongside other files** (`test_row_level_security`, the offer test) now loads the currency rows itself.

Migration **0053**: `signup_pauses`, the `phone_change` revoke reason and the unique receipts index. It builds only if no database already holds two accepted copies of one partner event; that would be a finding in its own right.

## Not verified / owner actions

- **The 60-a-minute cap** is an estimate. Check it against the SMS provider's own limits and fraud controls once one is chosen. `UNKNOWN — NOT VERIFIED`.
- **CI** (pip-audit, npm audit, bandit, gitleaks) is still blocked by GitHub billing.
- Everything else from the check (SPF/DKIM/DMARC, an outside penetration test, hosting) is unchanged.

## Tests

`backend/tests/integration/test_security_checklist.py`; `admin/__tests__/emergency.test.tsx` (pause and resume sign-ups; hidden from anyone but a Super Admin).
