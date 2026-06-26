# ---------------------------
# Stage 1: Build
# ---------------------------
FROM node:20-alpine AS builder

ARG APP_VERSION=1.0.0
ARG BUILD_NUMBER=unknown
ARG GIT_COMMIT=unknown
ARG GIT_BRANCH=main
ARG REPOSITORY=novasafe-admin-api
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
COPY services/admin-app/package.json ./services/admin-app/
COPY tsconfig.json ./

RUN pnpm install --frozen-lockfile

COPY services/admin-app ./services/admin-app

RUN pnpm --filter admin-app-service run build

ENV HUSKY=0
RUN pnpm --filter admin-app-service deploy --prod --legacy /prod/admin

# ---------------------------
# Stage 2: Production
# ---------------------------
FROM node:20-bookworm-slim

ARG APP_VERSION=1.0.0
ARG BUILD_NUMBER=unknown
ARG GIT_COMMIT=unknown
ARG GIT_BRANCH=main
ARG REPOSITORY=novasafe-admin-api
ARG RELEASED_AT

WORKDIR /app

RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && update-ca-certificates

COPY --from=builder /prod/admin/ ./

# Runtime only needs node — drop bundled npm/corepack (Trivy flags their deps).
RUN rm -rf /usr/local/lib/node_modules/npm \
    /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack

RUN mkdir -p /app/logs /app/uploads && chmod 755 /app/logs /app/uploads

ENV NODE_ENV=production
ENV ADMIN_PORT=3130
ENV PORT=3130
ENV APP_VERSION=$APP_VERSION
ENV BUILD_NUMBER=$BUILD_NUMBER
ENV GIT_COMMIT=$GIT_COMMIT
ENV GIT_BRANCH=$GIT_BRANCH
ENV REPOSITORY=$REPOSITORY
ENV RELEASED_AT=$RELEASED_AT
ENV DEPLOY_ENV=production
ENV LOG_ENABLE_CONSOLE=false
ENV LOG_ENABLE_FILE=true
ENV LOG_FILE_MODE=single
ENV LOG_DIR=/app/logs
ENV LOG_JSON_FORMAT=true
ENV MEDIA_STORAGE_PATH=/app/uploads

EXPOSE 3130
VOLUME ["/app/logs", "/app/uploads"]

CMD ["node", "dist/index.js"]
