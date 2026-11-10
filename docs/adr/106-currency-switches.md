# ADR-106 — Super Admin Currency On/Off Switches

| Attribute | Value |
|---|---|
| **Status** | **IMPLEMENTED** — 2026-11-10 |
| **Decision ID** | DEC-118 |
| **Authority** | Owner, 2026-11-10, asked "what if superadmin want to add new currencies". Then answered: **"Switch built ones on/off (Recommended)"**; on switching off, **"Hide offers, finish deals (Recommended)"**; approval, **"One Super Admin"**; China, **"Both must be on (Recommended)"**. |
| **Builds on** | ADR-102 (rate limits in force), ADR-105 (China switched off, `CHINA_ENABLED`). |

## Decision

1. **Built-in currencies only.** A new currency is still added by a developer, because each one needs its own payout form, rate-limit source, country rules and partner bank. In the admin console, under **Settings → Currencies**, a **Super Admin** switches a built-in currency off or back on, with a reason (5–300 characters).
   - `POST /api/v1/admin/currencies/{code}`. One Super Admin, effective at once.
   - The change is recorded in `currency_switches` and in the staff audit log (`currency_switched_on` / `currency_switched_off`).
   - Every staff member can see the list (`GET /api/v1/admin/currencies`).
2. **What "off" means** (owner: "Hide offers, finish deals"):
   - **The rate limit goes.** The currency has no rate limit in force, because `current_ceilings` leaves it out.
   - **Hidden from the market.** Its offers are no longer listed, and they can't be taken, queued for or re-priced (409 "no longer available").
   - **Nothing new.** New offers, buy requests and payout accounts in it are refused (403 `BUS_403_NOT_AVAILABLE`).
   - **Matched deals carry on** to the end, because nothing after the match uses the rate limits.
   - **Switching back on** lists the waiting offers again.
3. **Naira can't be switched off**, because every deal has a naira side. The database refuses a naira row too.
4. **China: both must be on.** The yuan is off by default. The switch can't turn it on while the server's `CHINA_ENABLED` legal lock is off (409), and the routes keep refusing the yuan and China checks while that lock is off (ADR-105).
5. **No row means the built-in default:** every currency on, except the yuan.
6. **The app** follows the server's rate limits:
   - "Find a deal" and the payout-account tabs show only the currencies the server offers now.
   - The Market's currency list keeps a currency with no current rate limit (stale feed or switched off) but takes no rate in it, as in ADR-102. The yuan stays hidden there until offered.

**Data.** Migration **0050**: `currency_switches` (currency, enabled, reason, changed_at, changed_by_staff_id). It has no user column, so no row policy. The app role may read, add and update it, but only the Super Admin route writes. Local resets keep it, like the pause history.

## Evidence

- `backend/tests/integration/test_currency_switches.py`:
  - the list (naira locked, yuan off and waiting for legal clearance);
  - switching the euro off hides its offers and rate limit and refuses takes, new offers and euro accounts, while a matched deal carries on;
  - switching it back on lists the offers again, with audit entries;
  - only a Super Admin switches, a reason is needed, and naira, unknown codes and the yuan without `CHINA_ENABLED` are refused;
  - with `CHINA_ENABLED`, the yuan still waits for the switch.
- `admin/__tests__/currencies.test.tsx`: a Super Admin switches with a reason; naira and the locked yuan have no switch; other staff see the list only.
- `mobile/__tests__/payouts.test.tsx`: a switched-off currency has no payout tab.
