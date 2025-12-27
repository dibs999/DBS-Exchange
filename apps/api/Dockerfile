# Production Dockerfile for DBS Exchange API
# Optimized for horizontal scaling

FROM node:20-alpine AS base
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Dependencies stage
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
COPY packages/contracts/package.json ./packages/contracts/

RUN pnpm install --frozen-lockfile --prod=false

# Build stage
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY . .

WORKDIR /app/packages/shared
RUN pnpm build || true

WORKDIR /app/apps/api
RUN pnpm build

# Production stage
FROM base AS runner
ENV NODE_ENV=production

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 api

# Copy built files
COPY --from=builder --chown=api:nodejs /app/apps/api/dist ./dist
COPY --from=builder --chown=api:nodejs /app/apps/api/package.json ./
COPY --from=builder --chown=api:nodejs /app/apps/api/node_modules ./node_modules
COPY --from=builder --chown=api:nodejs /app/packages/shared/dist ../packages/shared/dist
COPY --from=builder --chown=api:nodejs /app/packages/shared/package.json ../packages/shared/

# Copy database schemas
COPY --from=builder --chown=api:nodejs /app/apps/api/src/db/*.sql ./src/db/

USER api

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

EXPOSE 3001

CMD ["node", "dist/index.js"]
