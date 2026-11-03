# Xspeeria admin console (ADR-089). Build from the repository root:
#   docker build -f admin/Dockerfile --build-arg ADMIN_API_ORIGIN=https://api.example.ng \
#     -t xspeeria-admin .
# ADMIN_API_ORIGIN is the API's address as the console server reaches it. Next.js fixes its
# forwarding rules when it builds, so it is a build argument; it is not a secret.

ARG NODE_IMAGE=public.ecr.aws/docker/library/node:22-bookworm-slim@sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da

# --- 1. Install exactly what the lockfile says, then build --------------------------------------
FROM ${NODE_IMAGE} AS build
ARG ADMIN_API_ORIGIN
ENV NEXT_TELEMETRY_DISABLED=1 ADMIN_API_ORIGIN=${ADMIN_API_ORIGIN}
WORKDIR /src
COPY package.json package-lock.json ./
COPY packages ./packages
COPY mobile/package.json ./mobile/package.json
COPY admin ./admin
# An optional CA file (secret "ca") for builds behind an inspecting proxy; never stored in a layer.
RUN --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; \
    test -n "$ADMIN_API_ORIGIN" || { echo "ADMIN_API_ORIGIN is required" >&2; exit 1; }; \
    npm ci --workspace @xspeeria/admin --workspace @xspeeria/tokens --include-workspace-root \
      --ignore-scripts --no-audit --no-fund \
 && npm run build --workspace @xspeeria/admin

# --- 2. The runtime image: only the standalone server and its static files -----------------------
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build /src/admin/.next/standalone ./
COPY --from=build /src/admin/.next/static ./admin/.next/static
COPY --from=build /src/admin/public ./admin/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"]
STOPSIGNAL SIGTERM
CMD ["node", "admin/server.js"]
