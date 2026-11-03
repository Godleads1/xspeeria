# ADR-086 — Several Adverts Take Turns in the Advert Slot

| Attribute | Value |
|---|---|
| **Status** | **IMPLEMENTED** — 2026-11-03 |
| **Decision ID** | DEC-094 |
| **Authority** | Owner, 2026-11-03: *"for the ad, many ads can be posted and it will be auto sliding itself"*. |
| **Amends** | ADR-067 Decision 1 ("one slot, everyone sees the same advert … the one that started last") and its "Not built: rotation". |

## Decisions

1. **Every advert that is switched on and inside its dates takes a turn** in the Market screen's advert slot. Everyone still sees the same adverts.
   - **Order:** the newest start first.
   - **Limit:** at most **10** take turns at once (`MAX_SHOWING`). An 11th waits for a free place, and the console marks it **"Waiting for a free place"**.
2. **The app slides by itself.**
   - Each advert stays **5 seconds** (`ROTATE_SECONDS`, sent by the server), then the next slides in, round and round.
   - Small dots show which one is showing.
   - Swiping left or right moves by hand.
   - A finger on the advert pauses the sliding (8 seconds at most).
   - **One advert:** no dots, no sliding.
   - **The phone's "Reduce motion" setting:** the slot never slides by itself (swiping still works).
   - Screen readers hear "Advert 2 of 3: <name>" and a hint to swipe.
   - Tapping opens the advert's link, only if it is a full `https://` address (ADR-067 Decision 4).
3. **Server:**
   - `GET /api/v1/adverts/showing` (signed-in users) returns `{rotate_seconds, items}`, newest first.
   - The app may fetch the picture of **any advert in the rotation**, and still nothing scheduled, ended, switched off or waiting.
   - `GET /api/v1/adverts/current` stays for older app builds and returns the first advert in the rotation.
4. **Console** (Advert Placement Setup):
   - The line at the top says how many adverts take turns, how long each stays, and the limit.
   - Each advert taking turns shows its turn ("2 of 3").
5. **5 seconds and 10 adverts are starting values,** set in `backend/app/services/adverts.py`. Changing them is an owner decision.

## Evidence

- `backend/tests/integration/test_admin_adverts.py`:
  - 11 adverts: 10 take turns, newest first;
  - the app can fetch every picture in the rotation, and not the waiting or scheduled ones;
  - staff see each one's turn and the waiting one;
  - switching one off lets the waiting one join;
  - the list needs a login;
  - the existing ADR-067 tests are updated (two adverts now both show, newest first).
- `mobile/__tests__/adverts.test.tsx`:
  - slides every 5 seconds, newest first, round and round;
  - the link of the advert showing is opened;
  - no sliding with Reduce motion;
  - one advert has no dots;
  - the app asks for `/adverts/showing`.
- `mobile/__tests__/advert-carousel.test.tsx`: a finger on the advert pauses it.
- `admin/__tests__/adverts.test.tsx`: the rotation line, each turn, "Waiting for a free place".
