# ADR-034 — 2FA Settings in the App, Using the Server

| Attribute | Value |
|---|---|
| **Status** | **PROPOSED** — built for development builds; awaiting product-owner review |
| **Date** | 2026-10-18 |
| **Decision ID** | DEC-040 |
| **Authority** | `PENDING_ACTIONS.md` *Build* item "2FA settings in the app". The product owner said "Starts" on 2026-10-18. |
| **Builds on** | ADR-008 and ADR-026 (rules and server endpoints), ADR-027 (server mode) |

## What the app does (server builds only)

**Profile › Security › 2 FA authentication**

- Shows **"2 FA is on"**. It is always on, because it is set up at sign-up and cannot be turned
  off.
- **Recovery codes › Get new codes**
  1. Asks for the current authenticator code.
  2. The app sends it to `POST /v1/auth/step-up` (`recovery_codes.regenerate`) and then calls
     `POST /v1/users/me/recovery-codes`.
  3. The ten new codes are shown once, on the existing screen that blocks screenshots. The old
     codes stop working.
- **Authenticator app › Replace**
  1. Asks for the current code, warning that every phone will need a code again and that
     payouts are held for 24 hours.
  2. The app calls step-up (`mfa.change`) and then `…/mfa/replace/start`.
  3. The new secret is kept **in memory**, never in the route, and shown on the existing set-up
     screen (QR code and key).
  4. The new app's first code goes to `…/mfa/replace/confirm`.
  5. The server makes the new app the active one, ends trust on every device and holds payouts
     for 24 hours. This phone also forgets its trusted-device token.

**How codes are handled**
- The code is checked by the server, never on the phone. The server's message is shown as
  written.
- Wrong codes count towards the server's lock: 5 wrong codes lock it for 15 minutes.
- The code field clears after each try, because each code works once.

Demo builds keep the on-device mock unchanged.

## Evidence

- `mobile/__tests__/two-factor-server.test.tsx` covers:
  - "always on" status;
  - new codes need the code and come from the server;
  - a wrong code keeps the sheet open and clears the field;
  - Replace needs the code and then opens the set-up screen, which finishes after the first
    code;
  - the request order and headers (step-up, then start with `X-Step-Up-Token`);
  - confirm clears the pending secret and this phone's trusted-device token;
  - nothing is sent without a session.
- End-to-end run on 2026-10-18 against a real local server:
  - The screen showed "2 FA is on".
  - A wrong code was refused, and ten new recovery codes followed with the right code.
  - The authenticator was replaced with a different secret.
  - Afterwards the **old app's code was refused** and the new app's code worked.
