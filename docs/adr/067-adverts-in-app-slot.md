# ADR-067 — Adverts in the App's Advert Slot

| Attribute | Value |
|---|---|
| **Status** | **IMPLEMENTED** — 2026-10-26 (server, migration 0029, console, app Market screen) |
| **Decision ID** | DEC-074 |
| **Authority** | Product owner, 2026-10-20 (ADR-056 decision 2): "the place advert here is done from the web admin, and then everyone using the app sees it in that same location. the size must fit the advert placeholder. so let the advert placeholder still stay in the mvp until the web admin changes it." Owner 2026-10-26: Adverts "with advert upload, later", then "do this now". Figma "Advert Placement Setup" and "Add an Advert". Builds on ADR-049 (picture storage rules) and ADR-060 (permissions). |
| **Constraints** | ADR-049: pictures are never stored in PostgreSQL and are checked by their content. SEC-008. Uploaded files are checked for scripts and links; SVG is refused. |

## Decisions

1. **One slot, everyone sees the same advert.** The Market screen's advert slot (Figma node 787:4204, 342 × 113) shows the advert that is switched on and inside its dates. If several qualify, it shows **the one that started last**. When none qualifies, the app keeps its "Place advert here" placeholder.
2. **What staff set:**
   - the advert name;
   - the post date and end date (Lagos time in the console; the server requires a time zone);
   - an optional link;
   - the picture.

   Staff can edit an advert, replace its picture, or switch it off and on. Adverts are never deleted, because they are the record of what was shown.
3. **Picture rules**, checked by the server and checked first in the console for a quick answer:
   - the type is read from the file's own bytes: JPEG, PNG or WebP only, never SVG;
   - at most 5 MB;
   - hidden details (camera data, GPS location, comments) are removed (ADR-049);
   - it must be **at least 342 × 113 and the slot's shape within 3 %** (1026 × 339 recommended for sharp phones).

   The picture lives in the object store (a local folder on a developer computer; Cloudflare R2 once the owner sets it up, ADR-049). PostgreSQL keeps only its key, type and pixel size. Without storage, adding an advert says so (503).
4. **Link.** It must be a full `https://` address, checked by the server, again in the app before opening, and by a database CHECK. Other schemes (`javascript:`, `http:`, app-internal links) never open.
5. **Who.** A new permission module **`adverts`** (read, create, update; delete and approve exist but are unused). Migration 0029 gives the Super Admin role all of it. Other roles get it only when staff choose to in Role setup. The console menu shows "Advert Placement Setup" under Setups to staff with `adverts.read`.
6. **The app.** `GET /api/v1/adverts/current` (signed-in users) returns the advert showing now, or `null`, without who added it. Its picture comes from `GET /api/v1/adverts/{id}/image`, with the token, **only for the advert showing now**, so scheduled or switched-off adverts can't be fetched. The app accepts only that image path. Any failure leaves the placeholder.
7. **Design corrections to Figma:**
   - "Select Audience" is left out, because the owner said everyone sees the advert;
   - the sample adverts ("FCMB Advert", "Qatar Airways Advert") are placeholders;
   - the list shows a status (Showing now, Scheduled, Ended, Switched off) and a thumbnail.

## Not built

- Several slots, rotation, or audience targeting.
- Click counts.
- The Cloudflare R2 client: this needs the owner's account and bucket, and a vendor record (ADR-049).
- Re-encoding pictures: no image library is installed, so pixels are kept as uploaded and only hidden details are removed.

## Evidence

- `backend/tests/integration/test_admin_adverts.py`:
  - an advert shows in the app with hidden details removed;
  - only the key, type and size are in PostgreSQL;
  - a later advert takes the slot from its start, and switching it off brings the earlier one back;
  - the app can't fetch a picture that isn't showing;
  - audit entries;
  - the slot's shape and size are enforced, and SVG and GIF are refused;
  - link, date, time-zone and unknown-field validation (including `audience`);
  - Ops admin has no access until given it, and the Super Admin has it;
  - a signed-out app gets 401;
  - no DELETE grant;
  - 503 without storage.
- `admin/__tests__/adverts.test.tsx`: the slot shape rule, the list, switching off, picture and https requirements, no audience field, read-only staff.
- `mobile/__tests__/adverts.test.tsx`: only https links open, the image path is checked, the placeholder shows without an advert, and the live advert opens its link.
