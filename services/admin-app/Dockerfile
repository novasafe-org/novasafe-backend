# ---------------------------
# Stage 1: Build
# ---------------------------
FROM node:20-alpine AS builder

RUN apk add --no-cache git python3 make g++ ca-certificates
RUN npm install -g pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY services/admin-app/package.json ./services/admin-app/
COPY tsconfig.json ./

RUN pnpm install --frozen-lockfile

COPY services/admin-app ./services/admin-app

RUN pnpm --filter admin-app-service run build

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

COPY --from=builder /app/services/admin-app/dist ./dist
COPY --from=builder /app/services/admin-app/package.json ./package.json

RUN pnpm install --prod --ignore-workspace

RUN mkdir -p /app/logs /app/uploads && chmod 755 /app/logs /app/uploads

ENV NODE_ENV=production
ENV ADMIN_PORT=3130
ENV PORT=3130
ENV LOG_ENABLE_CONSOLE=false
ENV LOG_ENABLE_FILE=true
ENV LOG_FILE_MODE=single
ENV LOG_DIR=/app/logs
ENV LOG_JSON_FORMAT=true
ENV MEDIA_STORAGE_PATH=/app/uploads

EXPOSE 3130
VOLUME ["/app/logs", "/app/uploads"]

CMD ["node", "dist/index.js"]
