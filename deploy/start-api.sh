#!/bin/sh
# Start the Xspeeria API (ADR-089). One Uvicorn process per vCPU: set WEB_CONCURRENCY to the
# container's vCPU count (2 by default). On SIGTERM, Uvicorn stops taking new connections and
# finishes the requests in progress (up to 25 s) before exiting.
# Proxy headers (X-Forwarded-For) are NOT trusted: the trusted-proxy setting is decided with the
# hosting (ADR-085, ADR-087), so client addresses aren't spoofable until then.
set -eu
exec uvicorn app.main:create_app --factory \
  --host 0.0.0.0 --port "${PORT:-8000}" \
  --workers "${WEB_CONCURRENCY:-2}" \
  --no-proxy-headers --no-server-header --no-access-log \
  --timeout-graceful-shutdown 25
