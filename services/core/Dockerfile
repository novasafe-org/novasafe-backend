# ---------------------------
# Stage 1: Build
# ---------------------------
FROM node:20-alpine AS builder

ARG APP_VERSION=1.0.0
ARG BUILD_NUMBER=unknown
ARG GIT_COMMIT=unknown
ARG GIT_BRANCH=main
ARG REPOSITORY=novasafe-mobile-api
ARG RELEASED_AT

RUN apk add --no-cache git python3 make g++ ca-certificates
RUN npm install -g pnpm

WORKDIR /app

ENV APP_VERSION=$APP_VERSION \
    BUILD_NUMBER=$BUILD_NUMBER \
    GIT_COMMIT=$GIT_COMMIT \
    GIT_BRANCH=$GIT_BRANCH \
    REPOSITORY=$REPOSITORY \
    RELEASED_AT=$RELEASED_AT \
    DEPLOY_ENV=production

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY scripts ./scripts
COPY services/core/package.json ./services/core/
COPY tsconfig.json ./

RUN pnpm install --frozen-lockfile

COPY services/core ./services/core

RUN pnpm --filter core-service run build

# ---------------------------
# Stage 2: Production
# ---------------------------
FROM node:20-slim

ARG APP_VERSION=1.0.0
ARG BUILD_NUMBER=unknown
ARG GIT_COMMIT=unknown
ARG GIT_BRANCH=main
ARG REPOSITORY=novasafe-mobile-api
ARG RELEASED_AT

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
ENV APP_VERSION=$APP_VERSION
ENV BUILD_NUMBER=$BUILD_NUMBER
ENV GIT_COMMIT=$GIT_COMMIT
ENV GIT_BRANCH=$GIT_BRANCH
ENV REPOSITORY=$REPOSITORY
ENV RELEASED_AT=$RELEASED_AT
ENV DEPLOY_ENV=production
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
