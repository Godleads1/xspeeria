# ADR-089 — Production Container Images

| Attribute | Value |
|---|---|
| **Status** | **IMPLEMENTED** — 2026-11-03 (images build and run; nothing is pushed or deployed) |
| **Decision ID** | DEC-100 |
| **Authority** | Owner, 2026-11-03: *"go"* on the work that needs no hosting ("production container files for the API, the worker and the admin console"). Package 4 of the plan for 500 users at once. |

## Decisions

1. **Two images**, built from the repository root:

   | Image | File | Runs |
   |---|---|---|
   | **API + worker** | `backend/Dockerfile` | The API by default (`start-api`). The worker with `python -m app.worker` (ADR-085). Migrations with `alembic -c /app/alembic.ini upgrade head`, run as a separate, approved release step and never automatically on live. |
   | **Admin console** | `admin/Dockerfile` | `node admin/server.js` (Next.js standalone server). |

2. **Settings come only from the environment at run time.** No `.env` file or secret is copied into an image (`.dockerignore`), and none is baked into a layer.
   - The console's `ADMIN_API_ORIGIN` (the API address the console server forwards to) is a **build argument**, because Next.js fixes its forwarding rules when it builds. It isn't a secret.
3. **Base images are pinned by digest:** Python 3.12 slim and Node 22 slim (Debian bookworm), plus uv 0.11.32.
   - They are pulled from the AWS public mirror of the Docker official images, which avoids Docker Hub's pull limits.
   - Python packages are installed exactly as locked in `uv.lock`, without the dev tools. npm packages are installed exactly as in `package-lock.json`, for the console and the token package only, with install scripts off.
4. **Runs as an unprivileged user.**
   - The API runs as user 10001, and the code it runs is owned by root and read-only to it.
   - The console runs as the image's `node` user.
5. **The API process:**
   - one Uvicorn process per vCPU (`WEB_CONCURRENCY`, default 2);
   - no `server` header;
   - one request log, the app's own (Uvicorn's access log is off).
   - **Proxy headers are not trusted** (ADR-025 §4) until the trusted-proxy setting is decided with the hosting.
6. **Stopping:** on SIGTERM the API stops taking connections and finishes requests in progress (up to 25 s), and the worker finishes its round.
   - The console's Next.js server exits at once on SIGTERM (exit code 143). It holds no state; a request in flight at that moment is retried by the browser.
7. **Health checks:**
   - each image checks its own liveness (`/health` for the API, the home page for the console);
   - the load balancer should use `/health/ready` (ADR-088).
8. **CI builds both images on every pull request** and smoke-tests the API image:
   - it answers `/health`;
   - it runs as user 10001;
   - it sends no `server` header;
   - it stops with exit code 0.

   Nothing is pushed; pushing to a registry comes with the deploy pipeline and the hosting.

## Not done yet

- **Image scanning** for known vulnerabilities, and **pushing to a registry**: with the deploy pipeline, once the host is chosen.
- **The trusted-proxy setting:** with the host (ADR-085, ADR-087).

## Evidence (3 Nov 2026, local Docker 29.8)

**API image (348 MB):**
- runs with production settings against PostgreSQL 16: `/health` 200, user 10001, code not writable, no `server` header;
- `docker stop` exits 0 after both Uvicorn processes say they finished;
- `alembic current` reports `0041 (head)`;
- the worker image logs `worker_started` with its jobs, and stops cleanly with `worker_stopped`.

**Console image (426 MB):**
- serves the console with all its security headers, including the per-page script nonce;
- forwards `/api/v1/admin/...` to the API (the API's own refusal came back through it);
- runs as `node`.

**Console code checks after the `output: 'standalone'` change:** vitest 176 passed; tsc and eslint clean.
