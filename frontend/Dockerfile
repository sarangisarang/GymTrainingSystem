# syntax=docker/dockerfile:1
#
# Frontend image — Next.js 15 (App Router) production server.
#
# Multi-stage build:
#   deps    → install node_modules (cached on package-lock changes)
#   builder → next build, emits the self-contained .next/standalone bundle
#   runner  → minimal runtime: Node + standalone server + static assets only
#
# Requires `output: "standalone"` in next.config.mjs.
#
# Build: docker build -t gymtracker-frontend ./frontend
# Run:   docker run --rm -p 3000:3000 \
#          -e NEXT_PUBLIC_API_BASE=http://localhost:8000 gymtracker-frontend

# ── deps ──────────────────────────────────────────────────────────────────
FROM node:20-slim AS deps
WORKDIR /app
# Install against the lockfile only, so this layer is cached unless deps change.
COPY package.json package-lock.json ./
RUN npm ci

# ── builder ─────────────────────────────────────────────────────────────────
FROM node:20-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* vars are inlined at build time. The API base can be overridden
# at build with --build-arg; it defaults to the local backend for dev images.
ARG NEXT_PUBLIC_API_BASE=http://localhost:8000
ENV NEXT_PUBLIC_API_BASE=$NEXT_PUBLIC_API_BASE
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── runner ────────────────────────────────────────────────────────────────
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Run as the unprivileged user that ships with the node image.
USER node

# Copy only what the standalone server needs:
#   - public/                     static files served as-is
#   - .next/standalone            the traced server + minimal node_modules
#   - .next/static                hashed JS/CSS chunks
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

EXPOSE 3000

# Liveness probe — the app responds on / once the server is up.
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# `server.js` is the entrypoint emitted by Next.js standalone output.
CMD ["node", "server.js"]
