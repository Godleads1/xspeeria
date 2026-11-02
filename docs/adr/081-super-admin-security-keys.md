# ADR-081 — Super Admin Hardware Security Keys

| Attribute | Value |
|---|---|
| **Status** | **IMPLEMENTED** — 2026-11-02 |
| **Decision ID** | DEC-088 |
| **Authority** | ADR-051 Decision 2 (owner): *"Email code now, key later … Release gate: Super Admin must use a hardware security key before real customer money goes live."* Compliance Manual §14.2 requires a hardware key. Owner, 2026-11-02: *"go"* on item 6, *"Super Admin hardware key isn't built yet (required before live money)"*. Readiness review H-5. |

## Decisions

1. **What a key is.** A FIDO2 / WebAuthn security key (YubiKey and similar), registered from **My Profile › Password › Security keys**.
   - Only Super Admins add keys.
   - Only the public key is stored (`staff_security_keys`, migration 0040); the private key never leaves the physical key.
   - Up to 10 keys per person. **Register a spare.**
2. **Signing in with a key.** Once a Super Admin has a key, signing in takes three steps:
   - email and password;
   - the emailed code;
   - **a touch of the key**.

   Rules for the key step:
   - The challenge is random, single-use and valid for **5 minutes**.
   - Any failure ends the sign-in, and the person starts again with the password: wrong key, wrong site, a replayed answer, or a key whose use counter didn't go up (a possible copy).
   - A key signed on a look-alike website can't be used here, because the browser binds the answer to the site's address.
3. **When keys become compulsory.** `SUPER_ADMIN_KEY_REQUIRED=true`.
   - **The server refuses to start in production without it**, because production means live money.
   - Production also needs `STAFF_KEY_RP_ID` and `STAFF_KEY_ORIGIN` set to the console's real `https` address.
   - A Super Admin who has no key yet still signs in with password and code, but **that session can only add a key** (plus see who they are and log out). Every other console route answers `ADMIN_403_KEY_SETUP_REQUIRED`. Adding the key opens the console.
   - While keys are required, the last key can't be removed.
4. **A lost key.**
   - Another Super Admin uses **Staff › ⋮ › Remove security keys**, with a reason. The person's keys are removed, they are signed out, and they sign in with password and code until they add a new key.
   - If there is no other Super Admin, an operator with server access runs `python -m app.cli.staff_keys remove --email … --reason …`.

   Both are written to the audit log, and both raise the **staff access changed** alert (P2, ADR-074), so the other Super Admins see it. Adding a key raises the same alert.
5. **Other staff are unchanged:** password plus email code (ADR-060).

## Consequences

- **What isn't proven:** that the authenticator is a separate hardware key rather than a laptop's or phone's built-in one (Windows Hello, Touch ID).
  - The console asks the browser for a "cross-platform" key, and a hardware key is what that normally means.
  - Checking the maker's attestation certificate is **not** done (`attestation: none`). That would need the maker's certificates and an allowed-models list, and the owner hasn't asked for it. **`UNKNOWN — NOT VERIFIED`** that every registered key is a hardware key.
  - The procedure (§14.2) is to register keys in person on supplied YubiKeys.
- A key is bound to the console's web address. Keys registered on `localhost` don't work on the live console, and the reverse, so each Super Admin registers keys again on the live address.
- **Before live money:**
  1. Buy at least **two keys per Super Admin**.
  2. Set the three settings.
  3. Have each Super Admin add their keys.
  4. Confirm the production server starts.

## Evidence

- **`backend/tests/integration/test_staff_security_keys.py` (10 tests, PostgreSQL 16).** A software FIDO2 key (`tests/soft_key.py`) signs exactly like a real one, so the real py_webauthn checks run. Covered:
  - add a key, then sign-in needs it;
  - look-alike site, wrong key and wrong relying party are refused;
  - replay and a copied key (counter not increased) are refused;
  - the key step expires after 5 minutes;
  - the required mode: a key-setup-only session, then the console opens; the last key can't be removed;
  - other staff are unaffected;
  - removing a spare; the same key twice is refused;
  - another Super Admin removes a lost key; the server command;
  - production refuses to start without the settings.
- **`admin/__tests__/security-keys.test.tsx` (8 tests):** the key step at sign-in, cancel and retry, refusal restarting the sign-in, adding and removing keys, the key-setup screen.
- **A real browser** (Chromium with its virtual FIDO2 key, against the real server and console):
  - signed in, added "Virtual YubiKey" on My Profile, signed out;
  - signed in again: the key step appeared after the email code, and touching the key opened the console;
  - a different key was refused.
- Library: `py_webauthn` 3.0.1 (Duo Labs, BSD-3-Clause), pinned exactly. The browser side uses the built-in WebAuthn API; no new npm package.
