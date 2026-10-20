# ADR-052 — Notifications N-3: Phone Push

| Attribute | Value |
|---|---|
| **Status** | **PROPOSED** — 2026-10-19 |
| **Decision ID** | DEC-059 |
| **Authority** | Product owner, 2026-10-19: chose "Phone push" (ADR-044) and Firebase for push; set up Firebase project `xspeeria-f4e77` (Android app `com.xspeeria.app`), uploaded the FCM V1 key to Expo and added `GOOGLE_SERVICES_JSON` as an Expo secret file variable ("expo file done"). Data dictionary *Devices* (`push_token`, `platform`). Confirms ADR-044's proposed delivery path: Expo push service → FCM (Android) / APNs (iOS). |

## Decision

1. **Tokens** — after sign-in the app asks once for permission, gets its Expo push token and sends it with `PUT /api/v1/users/me/push-token {token, platform}` (ios/android; token format checked). The token is bound to the **current session**: pushes go only to tokens whose session is live, so log-out, a PIN reset, a revoked device or the 7-day limit stop them. A token that reappears under another account or session moves there (a phone changing hands never receives the old owner's messages). `DELETE` turns push off for this phone.
2. **Sending** — every in-app notification (ADR-044) is pushed once: a `push_deliveries` row is written in the same transaction that handles it (`sent` or `no_device`). Only fresh, unread ones (under 1 hour) are pushed, so an outage never floods phones with old news. On a transport failure nothing is recorded and the next round retries. Tokens the push service reports as `DeviceNotRegistered` are disabled.
3. **Content** — a short English title and body (languages work replaces them) plus the event name and ids. Never names, amounts or account numbers (lock screens). Tapping opens the screen rebuilt by the app from the event and validated ids; push contents are untrusted.
4. **Switch** — `PUSH_ENABLED` (default `false`); optional `EXPO_ACCESS_TOKEN`. The background sender runs every `PUSH_TICK_SECONDS` (5) only when enabled.
5. **While the app is open** the in-app banner shows news; no system pop-up.

## Channel policy

All events in ADR-044's list go to push. SMS and email channels: N-4/N-5.

## Files

Server: `models/notifications.py` (`PushToken`, `PushDelivery`), migration `0016`, `providers/push.py`, `services/push.py`, `api/v1/push.py`, `main.py` loop. App: `src/features/notifications/push.ts`, `app.config.js` (adds `googleServicesFile` from `GOOGLE_SERVICES_JSON` and the `expo-notifications` plugin), `expo-notifications`, `expo-device`. `google-services.json` and `GoogleService-Info.plist` are git-ignored and blocked by `scripts/check_sensitive_files.py`.

## Evidence

`backend/tests/integration/test_push_api.py` (6), `mobile/__tests__/push.test.ts` (6).

## Not verified

A real push to a phone: needs a new development build (EAS) installed on an Android phone and `PUSH_ENABLED=true` on the server. iOS needs an Apple Developer account (APNs key).
