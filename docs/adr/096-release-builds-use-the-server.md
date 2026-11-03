# ADR-096 — Release Builds Run Against the Real Server

| Attribute | Value |
|---|---|
| **Status** | **IMPLEMENTED** — 2026-11-03 |
| **Decision ID** | DEC-108 |
| **Authority** | Owner, 2026-11-03: chose "Server-connected builds — release builds talk to the real server". Clears the blocker recorded in ADR-090. Keeps ADR-018 (a release build never runs demo data). |

## Decisions

1. **When a build runs the app:**
   - A release build (store, TestFlight or `preview` install) runs the app when it is built with an **`https://`** server address (`EXPO_PUBLIC_API_URL`, set per EAS profile on Expo's servers, ADR-090).
   - A plain `http://` address, even a private network one, is refused in a release build. The build then shows "not available", as before.
   - With no address, it also shows "not available" (ADR-018 unchanged).
   - **Development builds are unchanged:** demo mode, or server mode with any accepted address, including `http://` on a developer's own network.
2. **Demo-only screens never show in a release build.** Eleven screens exist only for the demo, because they read demo stores or mock data. Each is wrapped in `DemoOnly`, which sends a release build to Home instead, so a deep link or a stale route can't bring demo figures into a store build. The screens:
   - the demo receipt (`history/[id]`);
   - the demo match list and payout screens;
   - the old demo beneficiary screens (server builds use payout accounts);
   - the authenticator setup (retired by ADR-054);
   - the demo region check;
   - the demo trade screen;
   - the demo sign-up steps (identity, email, biometrics).
3. **What already worked in server mode stays as it is:**
   - Home and Cards figures are empty outside a development build (ADR-023);
   - demo notes, demo fill and on-screen codes are hidden;
   - demo log-in and sign-up refuse.
4. **The rule is pure and tested:** `isServerMode(demoBuild, apiUrl)`.

## Not done here

- **A real release build has not been made and installed:** it needs the owner's Expo account (`eas build --profile preview`) and a live `https://` test server. `UNKNOWN — NOT VERIFIED` on a real phone.
- **Cards:** in a release build it shows no balances (none exist without a ledger). A real wallet needs the partner bank (P-1/P-2).

## Evidence

- `mobile/__tests__/release-server-mode.test.tsx` (5 tests):
  - development builds take any accepted address;
  - release builds need `https://`;
  - demo-only screens show in development and go to Home in release;
  - every demo-only route is wrapped.
- Full app suite: 721 passed; lint and type-check clean (3 Nov 2026).
