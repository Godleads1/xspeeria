# Xspeeria API and background worker — one image (ADR-089). Build from the repository root:
#   docker build -f backend/Dockerfile -t xspeeria-api .
# Run the API (default):   docker run ... xspeeria-api
# Run the worker (ADR-085): docker run ... xspeeria-api python -m app.worker
# Run migrations (an approved release step, never automatic on live):
#   docker run ... xspeeria-api alembic -c /app/alembic.ini upgrade head
# Settings come from the environment at run time (DATABASE_URL, JWT_SECRET_KEY, ...); no secret
# or .env file is ever copied into the image.

# Base images pinned by digest (the AWS mirror of the Docker official images, which also avoids
# Docker Hub's pull limits). Update both the tag and the digest together.
ARG PYTHON_IMAGE=public.ecr.aws/docker/library/python:3.12-slim-bookworm@sha256:e697c81897302a4c4333bade000d98038fbb21eb064f8ee1fd42d02ebcd9d337
ARG UV_IMAGE=ghcr.io/astral-sh/uv:0.11.32@sha256:df4cae8f3a96d175e2e5f992e597550000edbe78fdc2594d5cd8de1a217f504c

FROM ${UV_IMAGE} AS uv

# --- 1. Dependencies, exactly as locked (uv.lock), without the dev tools -------------------------
FROM ${PYTHON_IMAGE} AS build
COPY --from=uv /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never UV_PROJECT_ENVIRONMENT=/opt/venv
WORKDIR /src
COPY pyproject.toml uv.lock ./
# An optional CA file (secret "ca") for builds behind an inspecting proxy; never stored in a layer.
RUN --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export SSL_CERT_FILE=/run/secrets/ca; fi; \
    uv sync --locked --no-dev --no-install-project

# --- 2. The runtime image -----------------------------------------------------------------------
FROM ${PYTHON_IMAGE} AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH=/opt/venv/bin:$PATH \
    PYTHONPATH=/app/backend \
    APP_ENV=production \
    WEB_CONCURRENCY=2
# A fixed, unprivileged user; the code is owned by root and read-only to it.
RUN groupadd --system --gid 10001 xspeeria \
 && useradd --system --uid 10001 --gid xspeeria --home-dir /nonexistent --shell /usr/sbin/nologin xspeeria
COPY --from=build /opt/venv /opt/venv
WORKDIR /app
COPY alembic.ini ./alembic.ini
COPY migrations ./migrations
COPY backend/app ./backend/app
COPY deploy/start-api.sh /usr/local/bin/start-api
RUN chmod 0755 /usr/local/bin/start-api && python -m compileall -q backend/app migrations
USER 10001:10001
EXPOSE 8000
# Liveness only (no database): the container platform restarts a hung process. The load balancer
# uses /health/ready (ADR-088) to decide where to send customers.
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD ["python", "-c", "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=2).status == 200 else 1)"]
STOPSIGNAL SIGTERM
CMD ["start-api"]
