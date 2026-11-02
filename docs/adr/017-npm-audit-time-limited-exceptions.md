# ADR-017 — Time-Limited npm Audit Exceptions

| Attribute | Value |
|---|---|
| **Status** | **APPROVED** |
| **Date** | 2026-10-17 |
| **Decision ID** | DEC-023 |
| **Authority** | Product owner, 2026-10-17: chose option **"1"** (allow the listed advisories for a limited time, by ID, with an expiry) over keeping the gate red — `DOCUMENT_INDEX.md` §1 rank 2 |

## 1. Context

CI ran `npm audit --omit=dev --audit-level=high`. On 2026-10-17 new advisories were
published against the Expo / React Native toolchain. Every finding with a non-breaking fix
was fixed (commit `bce4b70`: Next.js 16.4.2, sharp 0.35.5, brace-expansion, compression,
js-yaml, shell-quote, source-map-js; Python urllib3 2.8.0). No `npm audit fix --force`.

Two **high** findings were left with no fixed version anywhere (verified with `npm view`
on 2026-10-17: the latest published release of each is inside the vulnerable range):

| Advisory | Package | Path | In the app bundle? |
|---|---|---|---|
| GHSA-vfj7-8cjw-p6xm | braces ≤3.0.3 (latest 3.0.3) | @expo/cli → @expo/metro-file-map → micromatch; jest; metro | No — bundler, file watcher, test runner |
| GHSA-86w9-cpqp-85rv | node-forge ≤1.4.0 (latest 1.4.0) | @expo/cli, @expo/code-signing-certificates | No — CLI-side code signing |

npm's only proposed "fix" is a major downgrade (jest 30 / expo 44), which would break the
approved SDK 57 stack.

## 2. Decision

- The audit **threshold stays at high**. A new script, `scripts/check_npm_audit.py`,
  replaces the bare command and decides pass/fail from the JSON report.
- A high/critical advisory may pass only if `.github/npm-audit-exceptions.json` lists that
  exact **advisory ID and package**, with reason, approver, approval date and expiry.
- Each exception lasts **at most 31 days**. The two above expire **2026-11-16**.
- The gate **fails** on: any unlisted high/critical; an expired exception; a severity
  escalation beyond what was approved; an exception that no longer matches a finding
  (so fixed items get removed); an error or empty audit report.
- Renewing or adding an exception needs explicit human approval, recorded in the file and
  in this ADR's log.

### Compensating controls (required by `docs/07-security/XSPEERIA_ENTERPRISE_SECURITY_STANDARD.md` §5)

- Both packages run only in build, bundling and test tooling on developer machines and
  ephemeral CI runners; neither is in the app bundle users install.
- `expo-updates` (over-the-air updates, the user of Expo code signing) is not installed, so
  the node-forge signature-verification path is not used by Xspeeria.
- CI runners have read-only repository permissions and no deployment credentials.
- Every new high/critical advisory still fails CI; the remaining node-forge exception expires on 2026-11-27 (renewed 2026-10-27).

## 3. Moderates (non-blocking, unchanged policy)

| Advisory | Package | Path | Note |
|---|---|---|---|
| GHSA-w5hq-g745-h8pq | uuid <11.1.1 | @expo/config-plugins → xcode | iOS prebuild tooling only |
| GHSA-hp3w-g68c-fv3c | sprintf-js | jest coverage → js-yaml 3 → argparse | Test tooling only |
| GHSA-vcc3-ghjq-m6fr | decode-uri-component ≤0.4.2 | expo-router → query-string | **Is in the app bundle** (URL/deep-link parsing). DoS on malformed percent-encoding; on a phone this would freeze the user's own app, not a server. Fix needs expo-router 58 (SDK upgrade). Track with the next SDK upgrade. |

## 4. Review log

| Date | Change | By |
|---|---|---|
| 2026-10-17 | Created; braces and node-forge accepted until 2026-11-16 | Product owner (option 1) |
| 2026-10-17 | Gate hardened after review (ADR-018): future-dated approvals, unknown severities and npm count mismatches now fail | Independent review |
| 2026-10-26 | braces exception removed (the advisory no longer matches any installed version). zod GHSA-mrhx-c7xc-m3w5 (high, <4.6.6) accepted until 2026-11-25: reached only via @expo/cli (zod 3), not in the app bundle; the fix is zod 4, which Expo has not adopted | Product owner ("yes") |
| 2026-10-27 | zod fixed instead of excepted: root `package.json` override pins zod to 4.6.7 (only consumer is @expo/cli, which uses the zod 3/4-compatible core API: object, string, enum, array, union, literal, strict, describe). Checked: Expo CLI schemas parse/reject correctly, `expo config`, `expo export --platform android`, `expo start`, mobile tsc and jest (691) pass. zod exception deleted. node-forge renewed to 2026-11-27: still no patched release (latest 1.4.0; Expo SDK 57 and 58 CLIs both depend on it) | Product owner ("Renew to 27 Nov") |
| 2026-11-02 | New advisories published since 27 Oct turned CI red on PR #90. node-forge **fixed instead of excepted**: updated to 1.4.2 (patched; @expo/cli and @expo/code-signing-certificates accept ^1.3.3), which clears GHSA-86w9 and five new highs, so the node-forge exception was deleted. decode-uri-component GHSA-qr28-fpjm-wq7f (high, ≤0.5.0, denial of service) **accepted until 2026-12-02**: reached via expo-router 57 → query-string 7.1.3, which is in the app bundle; the only patched release (0.5.1) is ESM-only and query-string 7 loads it with CommonJS, so an override would break link parsing; npm's fix is expo-router 58 (Expo SDK 58), planned as its own upgrade | Product owner ("31-day exception") |
| 2026-11-02 | **Expo SDK 58 upgrade** (owner: "do these"): expo 58.0.22, expo-router 58.0.29, React Native 0.88.1, React 19.3.0 (app and console). expo-router 58 no longer uses query-string, so decode-uri-component is gone and its exception was deleted. **No exceptions remain.** Checked: npm audit gate passes; app tsc, eslint and jest (708); console vitest (160), tsc and next build; `expo export --platform android` bundles | Product owner ("do these") |

## 5. Consequences

- CI is green while these advisories are open; it turns red automatically on 2026-11-28
  unless they are fixed upstream (and the entries removed) or re-approved.
- When Expo ships patched dependencies, update and delete the matching entries; the gate
  enforces the deletion.
- Tests: `backend/tests/unit/test_npm_audit_gate.py` (normal, failure and abuse cases).
