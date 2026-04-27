# ---------------------------
# Stage 1: Build the app
# ---------------------------
FROM node:20-alpine AS builder

# Install required build tools and ca-certificates for SSL
RUN apk add --no-cache git python3 make g++ ca-certificates

# Install pnpm globally
RUN npm install -g pnpm

# Set working directory
WORKDIR /app

# Copy root package files for monorepo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy mobile vault service package.json
COPY services/mobile_vault/package.json ./services/mobile_vault/

# Copy common folder and root tsconfig
COPY common ./common
COPY tsconfig.json ./

# Install dependencies using pnpm workspaces
RUN pnpm install --frozen-lockfile

# Copy mobile vault service source code
COPY services/mobile_vault ./services/mobile_vault

# Build the TypeScript code
RUN pnpm --filter mobile-vault-service run build

# ---------------------------
# Stage 2: Production image
# ---------------------------
FROM node:20-slim

WORKDIR /app

# Install ca-certificates for SSL and additional network tools
RUN apt-get update && apt-get install -y \
    ca-certificates \
    openssl \
    curl \
    dnsutils \
    iputils-ping \
    && rm -rf /var/lib/apt/lists/* \
    && update-ca-certificates

# Install pnpm with registry configuration
RUN npm install -g pnpm --registry https://registry.npmjs.org/

# Copy built application
COPY --from=builder /app/services/mobile_vault/dist ./dist

# Copy package.json and create a production-ready package.json
COPY --from=builder /app/services/mobile_vault/package.json ./package.json

# Install only production dependencies (without workspace)
RUN pnpm install --prod --ignore-workspace

# Set Node.js options for better SSL compatibility and production debugging
ENV NODE_OPTIONS="--openssl-legacy-provider"
ENV NODE_ENV=production
ENV DEBUG=mongodb:*

# Expose the mobile vault port
EXPOSE 3124

# Run the application from the correct path
CMD ["node", "dist/src/index.js"]
