# ---------------------------
# Stage 1: Build
# ---------------------------
FROM node:20-alpine AS builder

RUN npm install -g pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY services/api-playground/package.json ./services/api-playground/

RUN pnpm install --frozen-lockfile

COPY services/api-playground ./services/api-playground

RUN pnpm --filter api-playground-service run build

# ---------------------------
# Stage 2: Production
# ---------------------------
FROM node:20-slim

WORKDIR /app

RUN npm install -g pnpm

COPY --from=builder /app/services/api-playground/dist ./dist
COPY --from=builder /app/services/api-playground/package.json ./package.json
COPY --from=builder /app/services/api-playground/public ./public

RUN pnpm install --prod --ignore-workspace

ENV NODE_ENV=production
ENV PLAYGROUND_PORT=5200
ENV PLAYGROUND_ENABLED=false
ENV PLAYGROUND_REQUIRE_API_KEY=true

RUN mkdir -p /app/data && chmod 755 /app/data

EXPOSE 5200
VOLUME ["/app/data"]

CMD ["node", "dist/index.js"]
