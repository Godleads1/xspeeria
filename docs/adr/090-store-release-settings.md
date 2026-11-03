# ADR-090 — App Store and Google Play Release Settings

| Attribute | Value |
|---|---|
| **Status** | **IMPLEMENTED** (settings) — 2026-11-03. **A release build can't be used yet**: see "Blocker" below. |
| **Decision ID** | DEC-101 |
| **Authority** | Owner, 2026-11-03: *"go"* on "App Store and Google Play release settings, ready for when you open the store accounts". |

## Decisions

1. **App identity** (`mobile/app.json`):
   - name **Xspeeria**;
   - iOS bundle ID **`com.xspeeria.app`**, the same as the existing Android package;
   - version **1.0.0**.

   **The bundle ID and package can't be changed after the first upload to the stores.** The owner should confirm them before the first upload.
2. **Build numbers are counted by Expo's servers** (`appVersionSource: "remote"`, `autoIncrement` on production builds). Every store upload gets a higher number without anyone editing a file.
3. **Build profiles** (`mobile/eas.json`):
   - `development`: unchanged; the developer build with the demo.
   - **`preview`**: a release build installed directly on testers' phones (Android APK, iOS internal distribution).
   - **`production`**: the store build (Android App Bundle for Google Play; iOS for TestFlight and the App Store).
   - No submit settings yet: they need the store accounts (Apple App Store Connect app ID, Google Play service account).
4. **The server address for release builds** is set with the `EXPO_PUBLIC_API_URL` environment variable on Expo's servers per profile. It isn't written into a file. It must be `https://` (ADR-027).
5. **The store listing draft** is in `docs/09-ui-ux/STORE_LISTING_DRAFT.md`: texts, category, the data-collection answers both stores ask for, and what is still needed (icon, screenshots, privacy policy, support address, a reviewer account).

## Blocker: release builds don't run the app yet

**Found while preparing this.** ADR-018 deliberately makes a release build show **"not available in this build"**.

- **Why:** the server-connected app ("server mode") only switches on in development builds, because parts of the app still fall back to demo data, and a release build must never show demo data.
- **What it means:** a store build made today would install but show only that message.
- **What's needed before any store upload:**
  - let release builds run in server mode;
  - make sure every screen that still has demo data either uses the server or is hidden in release builds (for example, Home and Cards balances, ADR-023);
  - prove it with tests.

  This is a separate piece of work, waiting for the owner's go.

## Not done (needs the owner)

- A **1024 × 1024 square app icon**. The logo is a wordmark (448 × 127); the stores need a square mark, such as the "X" on its own. Also an Android adaptive icon (foreground and background).
- **Store accounts:** Apple Developer and Google Play.
- **Privacy policy and support web addresses,** and **screenshots.**
- **A test account and test server** for the store reviewers.
- **The export-compliance answer** to Apple about encryption. The app uses only the phone's standard encryption (HTTPS, secure storage), but the owner or lawyer should confirm the answer.

## Evidence

The app's settings tests pass: `launch.test.tsx`, `location.test.tsx` and `splash.test.ts`, 15 tests.
