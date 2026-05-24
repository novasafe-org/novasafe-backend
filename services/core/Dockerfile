# ---------------------------
# Stage 1: Build
# ---------------------------
FROM node:20-alpine AS builder

RUN apk add --no-cache git python3 make g++ ca-certificates
RUN npm install -g pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY services/core/package.json ./services/core/
COPY tsconfig.json ./

RUN pnpm install --frozen-lockfile

COPY services/core ./services/core

RUN pnpm --filter core-service run build

# ---------------------------
# Stage 2: Production
# ---------------------------
FROM node:20-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && update-ca-certificates

RUN npm install -g pnpm --registry https://registry.npmjs.org/

COPY --from=builder /app/services/core/dist ./dist
COPY --from=builder /app/services/core/package.json ./package.json

RUN pnpm install --prod --ignore-workspace

# Persistent log directory (mount a volume here in production)
RUN mkdir -p /app/logs && chmod 755 /app/logs

ENV NODE_ENV=production
ENV CORE_PORT=3124
# Production/container: file-only JSON logs (no stdout noise)
ENV LOG_ENABLE_CONSOLE=false
ENV LOG_ENABLE_FILE=true
ENV LOG_FILE_MODE=single
ENV LOG_DIR=/app/logs
ENV LOG_JSON_FORMAT=true
ENV LOG_ENABLE_COLORS=false
ENV LOG_PRETTY_PRINT=false

EXPOSE 3124
VOLUME ["/app/logs"]

CMD ["node", "dist/index.js"]
