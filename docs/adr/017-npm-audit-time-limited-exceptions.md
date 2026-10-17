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

## 5. Consequences

- CI is green while these advisories are open; it turns red automatically on 2026-11-17
  unless they are fixed upstream (and the entries removed) or re-approved.
- When Expo ships patched dependencies, update and delete the matching entries; the gate
  enforces the deletion.
- Tests: `backend/tests/unit/test_npm_audit_gate.py` (normal, failure and abuse cases).
