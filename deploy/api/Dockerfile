# ─── Stage 1: Dependencies ───────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

# Copy workspace manifests
COPY pnpm-workspace.yaml turbo.json package.json pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/config/package.json ./packages/config/package.json
COPY packages/types/package.json ./packages/types/package.json
COPY packages/database/package.json ./packages/database/package.json
COPY packages/utils/package.json ./packages/utils/package.json

# Install all dependencies
RUN pnpm install --frozen-lockfile

# ─── Stage 2: Build ──────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

# Copy everything from deps (includes all package.json files and complete node_modules structure)
COPY --from=deps /app ./

# Copy source
COPY . .

# Generate Prisma client
RUN pnpm --filter @vyaparnet/database exec prisma generate

# Build API and its dependencies
RUN pnpm run build --filter=@vyaparnet/api

# Prune dev dependencies
RUN pnpm --filter @vyaparnet/api deploy --prod ./deploy/api

# Copy schema and generate Prisma client for production build
RUN cp packages/database/prisma/schema.prisma ./deploy/api/
RUN cd deploy/api && pnpm dlx prisma@5.22.0 generate --schema=./schema.prisma

# ─── Stage 3: Production ─────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# Non-root user (security)
# Authority: VyaparNet_Deployment_Runtime_Architecture_v1.md Section 5.1
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# Copy production build
COPY --from=builder --chown=nodejs:nodejs /app/deploy/api ./
COPY --from=builder --chown=nodejs:nodejs /app/packages/database/prisma ./prisma

# Use non-root user
USER nodejs

EXPOSE 3000

# Health check
# Authority: VyaparNet_Deployment_Runtime_Architecture_v1.md Section 5.3
HEALTHCHECK \
  --interval=30s \
  --timeout=5s \
  --start-period=15s \
  --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/main.js"]
