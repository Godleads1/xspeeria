# ADR-049 — Profile Photo and Banner Storage: Cloudflare R2

| Attribute | Value |
|---|---|
| **Status** | **APPROVED (vendor)**, design **PROPOSED** — 2026-10-19. Not built. |
| **Decision ID** | DEC-056 |
| **Authority** | Product owner, 2026-10-19: asked "where can we store it and profile banner too"; offered Cloudflare R2 / Amazon S3 / Firebase Storage; first answered "do this Firebase Storage", then "Cloudflare R2 (my pick) use this". **R2 supersedes the Firebase Storage answer.** |

## Decision

Profile photos and profile banners are stored in a **private Cloudflare R2 bucket**, never in PostgreSQL and never in a public bucket.

## Design (to build)

- The app asks the server for a short-lived (minutes) presigned upload URL for **its own** photo or banner; the server picks the object key (random, never from the client).
- The server then checks the upload: real image type by content (JPEG/PNG/WebP), size limits (proposed 5 MB photo, 8 MB banner), re-encodes/resizes, and **strips metadata (e.g. GPS location)** before it is shown to anyone.
- Viewing is through short-lived signed links only.
- R2 keys live only in the server `.env`/secret store; never in the app, never in chat or git.

## Built so far (2026-10-26, ADR-060)

Staff photos in the admin console use this design's rules: server-made random keys, content-type check, 5 MB, metadata removed, served only through the server to signed-in staff. Storage interface `app/providers/object_store.py`; a local-folder stand-in for developer computers only. The R2 client itself and customer photos are not built yet.

## Needs before building

A Cloudflare account and an R2 bucket (owner action); a data-processing agreement entry for Cloudflare (Standing Standards vendor rules); exact size limits confirmed.
