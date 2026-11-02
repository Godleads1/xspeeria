# ADR-077 — SBOM in CI, a Quieter `/health`, and a Script Policy for the Console

| Attribute | Value |
|---|---|
| **Status** | **IMPLEMENTED** — 2026-11-02 |
| **Decision ID** | DEC-084 |
| **Authority** | Product owner, 2026-11-02: *"do these"*. These were three gaps from the Production Readiness Review of 27 Oct: SEC-033 (SBOM), SEC-014 / M-1 (`/health` names the environment), and M-4 (the console's Content-Security-Policy has no `script-src`). |

## Decisions

1. **SBOM (SEC-033).** Every CI run builds a CycloneDX bill of materials of what ships, and keeps it with the build for 90 days.
   - **Python:** `uv export --format cyclonedx1.5` from `uv.lock`, runtime packages only.
   - **npm:** the official `@cyclonedx/cyclonedx-npm` at an exact version (6.0.1), production packages only. `npm sbom` was tried first, but it refuses the whole tree when one optional, platform-only package is absent (`@img/sharp-wasm32`'s `@emnapi/runtime`).
   - `scripts/check_sbom.py` fails the build if an SBOM is empty, broken, or lists a component without a name and version.
2. **`/health` (SEC-014, M-1)** answers `{"status": "ok"}` only. The environment name, app name and API version told an unauthenticated caller which deployment they had reached. Super Admins see those on System Health (ADR-072).
3. **Console script policy (M-4).** `admin/proxy.ts` gives every page a fresh nonce:
   - the policy is `script-src 'self' 'nonce-…' 'strict-dynamic'`, plus `'unsafe-eval'` in development only;
   - it keeps `frame-ancestors 'none'`, `base-uri 'self'`, `object-src 'none'` and `form-action 'self'`;
   - Next.js puts the nonce on its own scripts, and the root layout puts it on the theme script (ADR-064);
   - pages now render per request, because a nonce can't be built into a static page. That's fine for a staff console.
   - Styles are unchanged: React `style` attributes can't carry a nonce.
4. **`/tsconfig.json` is ignored.** Expo writes that stub when `expo start` runs from the repo root; each workspace has its own.

## Evidence

- `backend/tests/unit/test_sbom_check.py`: a real SBOM passes; empty, wrong-format or nameless ones fail.
- Local runs: the Python SBOM listed 40 components and the npm SBOM 696.
- `backend/tests/unit/test_health.py`: only `{"status": "ok"}`, nothing naming the deployment.
- `admin/__tests__/csp.test.ts`: a nonce-only script policy, a different nonce each page, the nonce passed to the renderer, `unsafe-eval` in development only.
