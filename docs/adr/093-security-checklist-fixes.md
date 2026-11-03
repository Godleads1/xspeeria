# ADR-093 — Security Checklist Fixes: Vite Patch, Weekly Dependency Report, HTTPS-Only Header

| Attribute | Value |
|---|---|
| **Status** | **IMPLEMENTED** — 2026-11-03 |
| **Decision ID** | DEC-103 |
| **Authority** | Owner, 2026-11-03, on the 20-point security checklist review: *"fix these"* — (1) the moderate npm findings, planned rather than forced; (2) a weekly report that includes developer tools; (3) the HTTPS-only header (HSTS) on the hosting checklist. |

## 1. Moderate npm advisories

Audit on 3 Nov 2026 (before this change):
- **Shipped packages:** 0 critical, 0 high, 28 moderate, 1 low.
- **Developer tools included:** 48 moderate, 2 low.

The packages with their own advisories:

| Package | Advisory | Where it's used | Action |
|---|---|---|---|
| `vite` 6.4.4 | `server.fs.deny` bypassed with queries (GHSA-8g5g-mxqh-grgj) | Admin console test runner (Vitest), local only | **Fixed:** 6.4.5 (patch release). |
| `glob` 7–13 | AbortSignal cancellation bypass (GHSA-3g3m-2fjr-6pw4) | Expo's build tools (`@expo/cli`, `@expo/config`…), Jest coverage | **Planned**, see below. |
| `minimatch` < 11.0.1 | Denial of service via pattern amplification (GHSA-g3hv-75wg-m249) | Same | **Planned.** |
| `deepmerge` 4.3.1 | Prototype poisoning (GHSA-gcqx-w48m-w2h4), low | React Native tooling | No fixed version published. Watched weekly. |

**Why `glob` and `minimatch` were not forced:**
- **Expo is already on the newest release** (58.0.22). npm's own suggested "fix" is Expo 51, which is older. There is no Expo upgrade that fixes this today.
- **Forcing the new versions breaks npm.** It was tried with npm `overrides` (`glob ^14.0.3`, `minimatch ^11.0.4`):
  - npm 10 left `glob` out of the install altogether, so Expo's build tools would fail;
  - rebuilding the lock file failed with an npm crash (`Cannot read properties of null (reading 'edgesOut')`).
  - Also, the new major versions change their programming interface, and the old callers (Jest's `test-exclude`, `glob` 7 users) were written for the old one.
- **The risk is low.** Both advisories need someone to control the file patterns that these build tools search. They run only on a developer's computer and in CI, are never bundled into the phone app, and never run on the server.

**The plan:**
1. The weekly report (section 2) lists these advisories every Monday.
2. When an Expo 58 patch release (or Expo 59) depends on `glob` ≥ 14.0.2 and `minimatch` ≥ 11.0.1, upgrade Expo with `npx expo install expo@<version> --fix`. Then run the mobile tests, `expo config`, and an EAS preview build.
3. Jest 30 (already released) uses the newer `glob`. Moving the mobile tests from Jest 29 to 30 waits for Expo's `jest-expo` to support it.
4. If a **high** or **critical** advisory appears in these packages before then, the per-pull-request gate (ADR-017) already blocks it, so it must be fixed or given a written, time-limited exception.

## 2. Weekly dependency report

- **The workflow:** `.github/workflows/weekly-dependency-report.yml`. It runs on **Mondays at 06:17 Lagos time**, and on demand.
- **What it checks:** every npm and Python package, **developer tools included**. The per-pull-request gate checks only what ships.
- **The report:** written by `scripts/weekly_dependency_report.py` into the run summary. It lists every advisory with its package and severity.
- **When it fails:** the run fails, so GitHub notifies the repository owner, on:
  - any high or critical npm advisory, in any package;
  - any Python advisory (the per-PR `pip-audit --strict` already blocks these);
  - a scan that produced no usable report (never a false pass).
- **Moderates and lows** are listed, not blocking.
- It changes nothing in the repository and has read-only permissions.

## 3. HTTPS-only header (HSTS)

- **On the API:** every answer now carries:
  - `Strict-Transport-Security: max-age=63072000; includeSubDomains` (the same value as the admin console);
  - `X-Content-Type-Options: nosniff`.
  This applies to errors too, and in every environment except a developer's own computer (`APP_ENV=local`, plain `http://localhost`, where HSTS would get in the way).
- **On the hosting checklist:** the load balancer must serve HTTPS only, redirect plain HTTP to HTTPS, and keep (or set) the same header. Check it on the live address with `curl -sI https://<api address>/health`.

## Evidence

- `npm audit` after the change: no `vite` advisory; 0 high, 0 critical.
- **Admin console:** 176 tests passed and the production build succeeded on Vite 6.4.5 (3 Nov 2026).
- `backend/tests/unit/test_fingerprint.py::test_https_only_header_outside_a_developers_computer`.
- `backend/tests/unit/test_weekly_dependency_report.py` (5 tests: moderates listed, not blocking; high or critical fails; any Python finding fails; a broken scan fails).
- The script was run against the real `npm audit` and `pip-audit` output of 3 Nov 2026.
- The workflow's first scheduled run: `UNKNOWN — NOT VERIFIED` until it has run on GitHub. It can be started from the Actions tab ("Run workflow").
