I'm doing a full internal analysis pass before generating anything.

---

**INTERNAL PRE-GENERATION ANALYSIS**

**Sprint dependency graph:**
Auth → Products → Inventory → Cart+Orders+Payments → Dashboards → Notifications → Admin → RFQ → Hardening. Each sprint has hard dependencies on all prior sprints. No parallelization across sprint gates. Frontend/backend can parallelize within a sprint via API contracts.

**Module ordering:** Identity/Auth first (foundation). Segment engine before Catalog. Catalog before Inventory. Inventory before Cart. Cart before Order. Order before Payment. Payment before Settlement. All core modules before Admin. Admin before RFQ.

**Schema dependencies:** All 30 Prisma models exist in the frozen schema v4.3. Each sprint activates a subset. No new models needed — migration strategy is activating frozen models progressively.

**Queue dependencies:** BullMQ not needed until Sprint 4 (notifications can be synchronous in Sprint 1-3 if needed, but should be queued from Sprint 4 onward).

**Observability rollout:** Basic logging Sprint 0. Module-level metrics per sprint. Full dashboards Sprint 9.

**Security rollout:** Rate limiting Sprint 1. RBAC Sprint 1. File security Sprint 2. Webhook HMAC Sprint 4. Full security audit Sprint 9.

**Frontend/backend parallelization:** OpenAPI contract committed at sprint start → frontend uses Prism mock server → integration happens at sprint end. This is the correct decoupling strategy.

No conflicting patterns found. No architecture drift detected. Ready to generate.

---

# VYAPARNET — MASTER IMPLEMENTATION ROADMAP
## Version: v1.0 | Status: OFFICIAL EXECUTION BLUEPRINT
## Date: 2025-05-24 | Authority: All 14 Architecture Documents + Master Context Pack

---

## ROADMAP PHILOSOPHY

This roadmap is the macro-level execution blueprint for VyaparNet MVP delivery across 10 sprints (Sprint 0 through Sprint 9). It governs implementation sequencing, sprint gates, validation requirements, and governance enforcement for all human engineers and AI implementation agents.

**Absolute Rule:** No sprint begins until the prior sprint's validation gate is fully passed. This is non-negotiable.

**Execution Model:** Architecture documents are frozen. This roadmap activates them progressively, sprint by sprint, in dependency order. No new architecture decisions are made during implementation — only DDRs for clarifications.

---

## REQUIRED ARCHITECTURE CONTEXT (GLOBAL — ALL SPRINTS)

These documents are authoritative for the entire roadmap:

| Context Type | Authority Document |
|---|---|
| Governance + Constraints | `LOCKED_DECISIONS.md`, `PROJECT_CONTEXT.md` |
| Runtime Philosophy | `VyaparNet_Deployment_Runtime_Architecture_v1.md` |
| Database Authority | `VyaparNet_SCHEMA_v4_3_FINAL_FREEZE.md`, `VyaparNet_DB_Infra_Architecture.md` |
| Indexing Authority | `VyaparNet_Database_Indexing_Strategy_Official_Freeze_v1.md` |
| Module Boundaries | `VyaparNet_Module_Breakdown_Final_Enterprise_Freeze_v2.docx` |
| Workflow Sequencing | `VyaparNet_Workflow_Sequence_Diagrams_v1.md` |
| API Contracts | `VyaparNet_API_Contracts_Backend_Scaffold_Blueprint.md` |
| Implementation Patterns | `VyaparNet_Implementation_Architecture_Official_Freeze_v1.md` |
| UX + Design | `VyaparNet_Product_UX_System_v1.md` |
| Sprint Execution Rules | `VyaparNet_Sprint_Roadmap_v1.md` |
| Phase Coordination | `CURRENT_PHASE.md`, `ARCHITECTURE_INDEX.md` |

---

---

# SPRINT 0 — FOUNDATION

## 1. Sprint Identity

| Field | Value |
|---|---|
| Sprint Number | 0 |
| Sprint Name | Foundation |
| Duration | 2 weeks |
| Objective | Development environment working, CI/CD green, infra skeleton running, team fully onboarded |
| Philosophy | Nothing ships to users in this sprint. Everything that ships later depends on this sprint being perfect. Speed is irrelevant here. Correctness is everything. |

## 2. Why This Sprint Exists

**Business:** No feature can be built without a working local environment, a running database, and a functioning CI pipeline. Rushing past this sprint creates compounding friction for every subsequent sprint.

**Technical:** Turborepo build caching, Docker Compose parity between local and staging, and Prisma migrations must all be verified before a single line of domain code is written.

**Dependency:** Every subsequent sprint (1–9) assumes Sprint 0 is complete. Auth cannot be built without a running NestJS instance. The schema cannot be applied without a running PostgreSQL container.

## 3. Scope

### IN Scope
- Turborepo + pnpm monorepo initialization
- Docker Compose (PostgreSQL 15 + Redis 7)
- NestJS API scaffold (`apps/api`)
- Next.js 14 PWA scaffold (`apps/web`)
- Prisma schema application (`packages/database`) — schema v4.3 full freeze
- Core infrastructure NestJS modules: PrismaModule, RedisModule, BullMQ (registered, no workers yet), LoggerModule (Pino)
- Health check endpoints: `/health` (liveness), `/ready` (readiness)
- GitHub Actions CI pipeline: lint → typecheck → test → build
- Environment management: `.env.example` complete, staging environment configured
- Basic structured logging (Pino, JSON format)
- Graceful shutdown handler (SIGTERM)
- Team onboarding verification

### OUT of Scope
- Any business logic
- Any authentication
- Any domain APIs
- Any frontend pages beyond a placeholder
- Any queue workers
- Any background jobs
- Any external integrations

## 4. Deliverables

| Category | Deliverable |
|---|---|
| Monorepo | Turborepo + pnpm workspace, `turbo.json`, `pnpm-workspace.yaml` |
| Apps | `apps/api` (NestJS bootstrap), `apps/web` (Next.js bootstrap), `apps/admin` (stub), `apps/seller-dashboard` (stub) |
| Packages | `packages/database` (Prisma client + schema), `packages/types` (empty, typed), `packages/ui` (empty), `packages/config` (ESLint, tsconfig) |
| Database | Prisma schema v4.3 applied, first migration file generated, seed script stub |
| Infra | `docker-compose.yml` (PostgreSQL 15 + Redis 7 + Adminer), `docker-compose.prod.yml` stub |
| CI/CD | GitHub Actions: lint, typecheck, test, build pipelines |
| API | `GET /health`, `GET /health/ready` |
| Logging | Pino configured, JSON in production, pretty-print in dev |
| Shutdown | SIGTERM handler in `main.ts` |
| Env | `.env.example` complete with all required variables documented |
| Docs | Sprint 0 completion signed off in `CURRENT_PHASE.md` |

## 5. Dependency Mapping

| Dependency | Status |
|---|---|
| Architecture documents (all 14) | FROZEN — available |
| Git repository | Must be created |
| Cloud provider account (AWS/DigitalOcean) | Must be accessible |
| Docker Desktop installed on dev machines | Required |
| Node.js 20 installed | Required |
| pnpm installed | Required |

## 6. Detailed Execution Sequence

```
1. Initialize Git repository
2. Initialize pnpm workspace (pnpm-workspace.yaml)
3. Initialize Turborepo (turbo.json with pipeline config)
4. Create root package.json (scripts: dev, build, test, lint)
5. Create packages/config (eslint-config, tsconfig-base)
6. Create packages/types (empty, typed placeholder)
7. Create packages/database
   a. prisma init
   b. Apply schema v4.3 (copy from frozen document)
   c. Configure DATABASE_URL
   d. Run prisma generate
8. Create apps/api (NestJS CLI scaffold)
   a. Install core dependencies
   b. Create AppModule
   c. Create PrismaModule (singleton client)
   d. Create RedisModule (ioredis connection)
   e. Create BullMQModule (registered, no workers)
   f. Create LoggerModule (nestjs-pino)
   g. Create HealthModule (/health, /health/ready)
   h. Add SIGTERM handler to main.ts
   i. Add global validation pipe
   j. Add global exception filter (standard envelope)
9. Create apps/web (Next.js 14 App Router scaffold)
   a. Configure Tailwind CSS
   b. Configure Shadcn/UI
   c. Create placeholder home page
   d. Verify PWA manifest
10. Create apps/admin (Next.js stub)
11. Create apps/seller-dashboard (Next.js stub)
12. Create docker-compose.yml
    a. PostgreSQL 15 with health check
    b. Redis 7 with health check
    c. Adminer (DB UI for dev)
    d. Named volumes
13. Run docker-compose up → verify all services healthy
14. Run prisma migrate dev --name init → verify migration creates tables
15. Set up GitHub repository
16. Create .github/workflows/ci.yml
    a. lint job (ESLint + Prettier)
    b. typecheck job (tsc --noEmit)
    c. test job (Vitest)
    d. build job (turbo build)
    e. secret scanning (gitleaks)
    f. dependency audit (pnpm audit)
17. Create .env.example (all required variables)
18. Create CODEOWNERS file
19. Verify: pnpm install → pnpm build → all pass
20. Verify: docker-compose up → /health → 200
21. Verify: CI pipeline green on first PR
```

## 7. Folder / Module Impact

```
vyaparnet/                          (created)
├── apps/api/src/
│   ├── main.ts                     (SIGTERM, bootstrap)
│   ├── app.module.ts               (root module)
│   ├── core/
│   │   ├── prisma/                 (PrismaModule, PrismaService)
│   │   ├── redis/                  (RedisModule)
│   │   ├── bullmq/                 (BullMQModule, queue registration)
│   │   ├── logger/                 (LoggerModule, Pino)
│   │   └── health/                 (HealthController)
│   └── shared/
│       ├── filters/                (GlobalExceptionFilter)
│       └── pipes/                  (ZodValidationPipe stub)
├── apps/web/                       (Next.js stub)
├── packages/database/
│   ├── prisma/schema.prisma        (v4.3 full schema)
│   └── prisma/migrations/          (init migration)
├── packages/types/                 (empty typed package)
├── packages/config/                (eslint, tsconfig)
├── docker-compose.yml
├── turbo.json
└── .github/workflows/ci.yml
```

## 8. Database Impact

| Item | Detail |
|---|---|
| Schema applied | Prisma v4.3 full schema (all 30 models) |
| Migration | `0001_init` — creates all tables from schema |
| Indexes | All indexes defined in schema applied via migration |
| Rollback plan | `prisma migrate reset` (dev only). Prod: restore from backup |
| Backward compat | N/A (first migration, no existing data) |
| Extensions required | `pg_trgm`, `unaccent` — must be enabled in migration |

**Critical:** The GIN indexes for full-text search (`search_vector`) require raw SQL in the migration file. This must be added manually after `prisma migrate dev` generates the base migration.

```sql
-- Add to migration file manually:
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE INDEX CONCURRENTLY idx_prod_search_vector
  ON "Product" USING GIN ("search_vector") WHERE "isDeleted" = false;
CREATE INDEX CONCURRENTLY idx_prod_name_trgm
  ON "Product" USING GIN ("name" gin_trgm_ops) WHERE "isDeleted" = false;
```

## 9. API Impact

| Route | Method | Purpose | Auth |
|---|---|---|---|
| `/health` | GET | Liveness check | None |
| `/health/ready` | GET | Readiness (DB + Redis check) | None |

No business APIs in Sprint 0.

## 10. Frontend / UX Impact

- `apps/web`: Placeholder home page (title only)
- No real UX work in Sprint 0
- Verify: Next.js builds cleanly, Tailwind configured, Shadcn initialized

## 11. Runtime / Infra Impact

| Component | Action |
|---|---|
| Docker Compose | Created and verified running |
| PostgreSQL | Running, schema applied, migrations tracked |
| Redis | Running, connection verified from API |
| BullMQ | Module registered, no workers yet |
| Pino | Configured, JSON output in production |
| GitHub Actions | Pipeline created, green |

## 12. Security Requirements

| Requirement | Implementation |
|---|---|
| No secrets in code | `.env.example` with placeholders only |
| Secret scanning | gitleaks in CI pipeline |
| Dependency audit | `pnpm audit` in CI |
| No public DB exposure | Docker Compose: PostgreSQL on internal network only |
| HTTPS for staging | Cloudflare/ALB TLS — configured in staging |
| `.gitignore` | `.env`, `.env.local`, `node_modules` all excluded |

## 13. Observability Requirements

| Requirement | Implementation |
|---|---|
| Structured logs | Pino JSON format configured |
| Log levels | `warn` in production, `info` in development |
| Health metrics | `/health/ready` checks DB + Redis |
| Request logging | Pino HTTP middleware on all requests |
| Trace IDs | `X-Request-Id` header propagated in logs |

## 14. Testing Requirements

| Test Type | Requirement |
|---|---|
| Unit | PrismaModule connects. RedisModule connects. HealthController returns 200 |
| Integration | `/health` → 200. `/health/ready` → 200 with DB + Redis healthy |
| Failure test | `/health/ready` → 503 when DB is down (stop PostgreSQL container, verify) |
| CI gate | All tests pass before merge to develop |

## 15. Performance Requirements

| Metric | Target |
|---|---|
| `/health` response | < 10ms |
| `/health/ready` response | < 100ms (DB ping + Redis ping) |
| Docker Compose startup | < 30s for all services healthy |
| `pnpm build` duration | < 2 minutes |

## 16. Optimization Validation

Before closing Sprint 0, verify:
- No unused dependencies in `package.json` files
- No duplicate `node_modules` (pnpm dedup)
- Prisma client generated correctly (no type errors)
- Docker image builds cleanly (no warnings)
- No hardcoded values anywhere (all in `.env.example`)

## 17. Sprint Validation Gate

```
✅ docker-compose up → all services healthy (PostgreSQL, Redis)
✅ GET /health → HTTP 200
✅ GET /health/ready → HTTP 200 (DB connected, Redis connected)
✅ prisma migrate status → all migrations applied
✅ pnpm build → zero errors, zero TypeScript errors
✅ pnpm test → all tests passing
✅ CI pipeline → green on GitHub Actions
✅ gitleaks → zero secrets found
✅ pnpm audit → zero critical vulnerabilities
✅ .env.example → complete, all variables documented
✅ Adminer accessible at localhost:8080
✅ Redis accessible (redis-cli ping → PONG)
✅ SIGTERM handler verified (process exits cleanly)
✅ No console.log in production code (structured logger only)
✅ CODEOWNERS file committed
```

## 18. Definition of Done

All 15 validation gate items checked and passing. PR merged to `develop`. `CURRENT_PHASE.md` updated to Sprint 1. Team has verified local setup on every developer machine individually.

## 19. Failure Conditions

- Docker Compose fails to start any service
- Prisma migrations throw errors
- CI pipeline fails to complete
- TypeScript errors in any package
- Any secret found in codebase by gitleaks
- Redis connection fails from API
- `/health/ready` does not return 503 when DB is intentionally stopped

## 20. Rollback Strategy

Sprint 0 is local-only. Rollback = `docker-compose down -v` and re-run setup. No production risk.

## 21. Production Readiness Gate

**Status: LOCAL ONLY — NOT staging-ready yet.**
Staging environment configuration is created but not deployed. Deployment happens in Sprint 1 after auth module is functional enough for a meaningful staging deployment.

## 22. Known Risks

| Risk | Mitigation |
|---|---|
| Prisma schema v4.3 has complex relations that may cause migration conflicts | Review migration file manually before running |
| GIN indexes require raw SQL not supported natively by Prisma | Manually add to migration SQL file |
| pnpm workspace hoisting conflicts | Use `pnpm-workspace.yaml` with explicit package paths |
| Developer machines have different Node versions | Enforce Node 20 via `.nvmrc` + `engines` in package.json |

## 23. AI Execution Guidance

| Task | Guidance |
|---|---|
| Monorepo scaffold | Claude/GPT can generate. Human must verify turbo.json pipeline correctness |
| Prisma schema application | Use ONLY the frozen schema v4.3 document. No AI modifications to schema |
| Docker Compose | AI can generate. Human must verify network isolation and health checks |
| CI pipeline | AI can generate. Human must verify secret scanning and audit steps |
| GIN index raw SQL | Must be written by human referencing Indexing Strategy document exactly |
| SIGTERM handler | AI can generate standard pattern |

## 24. Estimated Complexity

| Dimension | Complexity |
|---|---|
| Engineering | Low-Medium (scaffolding, no business logic) |
| Operational | Low (local only) |
| Testing | Low (infrastructure health checks only) |

---

---

# SPRINT 1 — AUTHENTICATION & IDENTITY

## 1. Sprint Identity

| Field | Value |
|---|---|
| Sprint Number | 1 |
| Sprint Name | Authentication & Identity |
| Duration | 2 weeks |
| Objective | Complete, secure, production-grade authentication system with OTP, JWT, refresh tokens, RBAC, session management, device binding, and rate limiting |
| Philosophy | Authentication is the root of trust. It must be built perfectly before anything else. A flaw here compromises every sprint that follows. Security is the primary constraint, not speed. |

## 2. Why This Sprint Exists

**Business:** No buyer, seller, or admin can access the platform without authentication. Every subsequent module depends on `req.user` being reliable.

**Technical:** RBAC roles (BUYER, SELLER, ADMIN) must be established before any domain API is built. Every API from Sprint 2 onward enforces role-based access.

**Dependency:** Products (Sprint 2) requires `@CurrentUser()` decorator. Inventory (Sprint 3) requires seller ownership checks. Orders (Sprint 4) require buyer identity. None of these work without Sprint 1.

## 3. Scope

### IN Scope
- OTP send endpoint (SMS via MSG91/Twilio)
- OTP verify endpoint (JWT + refresh token generation)
- JWT validation middleware (global NestJS guard)
- Refresh token flow (rotate + revoke)
- Logout (single session revocation)
- Logout-all (all sessions revoked)
- RBAC roles: BUYER, SELLER, SELLER_MANAGER, ADMIN
- Permission-based access decorators (`@Roles`, `@Permissions`)
- Redis session storage (TTL 7 days)
- Device binding (device ID fingerprint hash)
- Rate limiting (OTP: 3/5min per phone, 5/5min per IP)
- Account lockout (5 failed OTP attempts → 15 min block)
- Auto support ticket creation on lockout (basic)
- LoginSession tracking (DB)
- OtpAttempt logging (DB)
- SecurityEvent logging (DB)
- AuditLog entry on login/logout
- User onboarding (first-time profile creation)
- Business entity creation (during onboarding)
- Address creation (during onboarding)
- `/users/me` GET and PUT endpoints
- Staging deployment (first staging deploy after Sprint 0 + Sprint 1)

### OUT of Scope
- OAuth/SSO (Phase 2)
- Biometric auth
- Account recovery beyond support ticket
- Advanced fraud scoring
- Multi-business account management (Phase 2)
- KYC document upload (Sprint 7)

## 4. Deliverables

| Category | Deliverable |
|---|---|
| Module | `modules/identity` (AuthModule, UserModule) |
| APIs | `/auth/otp/send`, `/auth/otp/verify`, `/auth/refresh`, `/auth/logout`, `/auth/logout-all`, `/users/me` (GET/PUT), `/users/onboard` |
| DTOs | `SendOtpDto`, `VerifyOtpDto`, `RefreshTokenDto`, `OnboardUserDto`, `UpdateUserDto` — all Zod-validated, in `packages/shared` |
| Guards | `JwtAuthGuard`, `RolesGuard`, `PermissionsGuard` |
| Decorators | `@CurrentUser()`, `@Roles()`, `@Permissions()`, `@Public()` |
| Middleware | Rate limiting (per IP, per phone) via Redis |
| DB | `User`, `Business`, `Address`, `LoginSession`, `OtpAttempt`, `SecurityEvent`, `AuditLog` models activated |
| Redis | OTP storage (TTL 300s), session storage (TTL 7 days), rate limit counters, lockout keys |
| SMS | MSG91/Twilio integration (abstracted behind `SmsService` interface) |
| Config | JWT config (secret, expiry), SMS config — all from env vars |
| Staging | First staging deployment (apps/api + PostgreSQL + Redis on cloud) |
| Docs | OpenAPI spec for all auth endpoints committed to `/contracts/auth.yaml` |

## 5. Dependency Mapping

| Dependency | Required Sprint |
|---|---|
| Monorepo scaffold | Sprint 0 ✅ |
| PostgreSQL running with schema | Sprint 0 ✅ |
| Redis running | Sprint 0 ✅ |
| PrismaModule | Sprint 0 ✅ |
| RedisModule | Sprint 0 ✅ |
| LoggerModule | Sprint 0 ✅ |
| GlobalExceptionFilter | Sprint 0 ✅ |
| SMS provider account (MSG91/Twilio) | Must be provisioned |
| Staging cloud account | Must be provisioned |

## 6. Detailed Execution Sequence

```
1. Create packages/shared
   a. Define Zod schemas: SendOtpSchema, VerifyOtpSchema, etc.
   b. Define shared types: UserRole enum, Segment enum, Permission enum
   c. Export from package index

2. Create modules/identity structure
   auth/
     auth.module.ts
     auth.controller.ts
     auth.service.ts
     otp.service.ts           (OTP generation, storage, verification)
     token.service.ts         (JWT generation, refresh, rotation)
     session.service.ts       (LoginSession CRUD)
   users/
     users.module.ts
     users.controller.ts
     users.service.ts
     users.repository.ts

3. Implement OtpService
   a. Generate 6-digit OTP (crypto.randomInt)
   b. Store in Redis: key=otp:{phone}, TTL=300s
   c. Rate limit check: key=ratelimit:otp:{phone}, key=ratelimit:otp:ip:{ip}
   d. Lockout check: key=lockout:{phone}
   e. Log OtpAttempt to DB (masked phone, IP, userAgent)
   f. Emit to SMSProvider (abstracted interface)

4. Implement TokenService
   a. generateAccessToken(user) → JWT (15min)
   b. generateRefreshToken() → UUID stored in Redis (7 days)
   c. verifyAccessToken(token) → payload | throw UnauthorizedException
   d. rotateRefreshToken(old) → new refresh + revoke old
   e. revokeSession(sessionId)
   f. revokeAllSessions(userId, exceptSessionId?)

5. Implement AuthService
   a. sendOtp(dto) → rate check → generate → store → send SMS → log
   b. verifyOtp(dto) → check lockout → get from Redis → verify
      → upsert User → generate tokens → create LoginSession
      → log AuditLog (LOGIN) → return tokens
   c. refresh(token) → verify → rotate → return new tokens
   d. logout(sessionId) → revoke → log AuditLog (LOGOUT)
   e. logoutAll(userId) → revoke all → log AuditLog (LOGOUT)

6. Implement JwtAuthGuard
   a. Extract token from Authorization header
   b. Verify with TokenService
   c. Attach user to request context
   d. Throw 401 if invalid/expired

7. Implement RolesGuard + PermissionsGuard
   a. Read metadata from @Roles/@Permissions decorators
   b. Check against req.user.role
   c. Throw 403 if insufficient

8. Create decorators: @CurrentUser(), @Roles(), @Permissions(), @Public()

9. Implement UsersService
   a. findById(id)
   b. upsertByPhone(phone) → create if new
   c. updateProfile(id, dto)
   d. onboard(userId, dto) → create User + Business + Address

10. Implement UsersRepository
    a. All DB queries via Prisma
    b. Always filter: isDeleted = false
    c. Always include soft-delete safety

11. Register global guards in app.module.ts
    a. JwtAuthGuard (global, skipped with @Public())
    b. RolesGuard
    c. PermissionsGuard

12. Add account lockout logic
    a. 5 failed OTP → set lockout:{phone} TTL=900s
    b. Create SupportTicket entry in DB (auto-ticket)
    c. Log SecurityEvent (FAILED_LOGIN)

13. Add rate limiting middleware (express-rate-limit + Redis store)
    a. Per IP: 100 req/min
    b. Per user: 10 req/sec
    c. OTP send: 3/5min per phone
    d. OTP verify: 5 failed → lockout

14. Write Zod validation pipe (global)
    a. Validate all incoming DTOs
    b. Return standard error envelope on failure

15. Commit OpenAPI spec: /contracts/auth.yaml

16. Write tests (unit + integration)
    a. OtpService: rate limiting, generation, expiry
    b. TokenService: generate, verify, rotate, revoke
    c. AuthService: full flow (OTP → tokens → refresh → logout)
    d. Guards: unauthorized, forbidden, authorized flows
    e. Lockout: 5 failed attempts → lockout verified
    f. Integration: POST /auth/otp/send → POST /auth/otp/verify
       → GET /users/me → POST /auth/logout

17. Deploy to staging
    a. Apply migrations on staging DB
    b. Deploy apps/api container
    c. Verify /health/ready → 200 on staging
    d. Manual OTP flow test on staging

18. Update CURRENT_PHASE.md → Sprint 1 complete
```

## 7. Folder / Module Impact

```
apps/api/src/
├── modules/
│   ├── identity/
│   │   ├── auth/
│   │   │   ├── auth.module.ts
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── otp.service.ts
│   │   │   ├── token.service.ts
│   │   │   ├── session.service.ts
│   │   │   └── tests/
│   │   └── users/
│   │       ├── users.module.ts
│   │       ├── users.controller.ts
│   │       ├── users.service.ts
│   │       ├── users.repository.ts
│   │       └── tests/
├── shared/
│   ├── guards/
│   │   ├── jwt-auth.guard.ts
│   │   ├── roles.guard.ts
│   │   └── permissions.guard.ts
│   ├── decorators/
│   │   ├── current-user.decorator.ts
│   │   ├── roles.decorator.ts
│   │   ├── permissions.decorator.ts
│   │   └── public.decorator.ts
│   └── pipes/
│       └── zod-validation.pipe.ts
packages/
└── shared/
    ├── schemas/
    │   └── auth.schemas.ts       (Zod schemas)
    └── types/
        └── auth.types.ts         (UserRole, Permission enums)
```

## 8. Database Impact

| Model | Action | Migration |
|---|---|---|
| `User` | Activate (upsert on phone) | No schema change (already in v4.3) |
| `Business` | Activate (create on onboard) | No schema change |
| `Address` | Activate (create on onboard) | No schema change |
| `LoginSession` | Activate (create on verify) | No schema change |
| `OtpAttempt` | Activate (create on attempt) | No schema change |
| `SecurityEvent` | Activate (create on suspicious activity) | No schema change |
| `AuditLog` | Activate (login/logout entries) | No schema change |

**All models already exist in schema v4.3. No new migrations needed for structure. Only data-level activation.**

**Required indexes for this sprint (must be verified active):**
```
idx_user_phone (UNIQUE, WHERE isDeleted=false) — Tier 1
idx_ls_user_exp (LoginSession) — Tier 2
idx_ls_refresh (LoginSession refreshToken) — Tier 1
idx_otp_phone_date (OtpAttempt) — Tier 2
idx_otp_ip_date (OtpAttempt) — Tier 2
idx_sev_ip_date (SecurityEvent) — Tier 2
idx_al_actor_date (AuditLog) — Tier 2
```

**Rollback plan:** If auth module causes DB issues, migration is additive (data-only). Drop LoginSession + OtpAttempt rows. No structural rollback needed.

## 9. API Impact

| Route | Method | Auth | Role | DTO |
|---|---|---|---|---|
| `/api/v1/auth/otp/send` | POST | None | Any | `SendOtpDto` |
| `/api/v1/auth/otp/verify` | POST | None | Any | `VerifyOtpDto` |
| `/api/v1/auth/refresh` | POST | RefreshToken | Any | `RefreshTokenDto` |
| `/api/v1/auth/logout` | POST | JWT | Any | None |
| `/api/v1/auth/logout-all` | POST | JWT | Any | None |
| `/api/v1/users/me` | GET | JWT | Any | None |
| `/api/v1/users/me` | PUT | JWT | Any | `UpdateUserDto` |
| `/api/v1/users/onboard` | POST | JWT | Any | `OnboardUserDto` |

All routes return standard response envelope. All errors return standard error format with machine-readable `code`.

## 10. Frontend / UX Impact

| Screen | Implementation |
|---|---|
| Login screen (OTP input) | Mobile-first, +91 prefix locked, numeric keyboard |
| OTP verification screen | 6-digit OTP input, auto-focus, auto-submit on complete |
| OTP resend | Countdown timer (30s), "Resend karein" button |
| Lockout screen | Countdown timer (15min), "Contact Support" CTA |
| First-time onboarding | Business name, type, GST (optional), address, language |
| Segment selection | Textile / Spare Parts card selection |

**UX rules (from Product UX System v1.2):**
- OTP auto-fill on Android
- Hinglish labels throughout
- Skeleton loader while OTP is being verified
- Error states: "OTP expire ho gaya", "OTP galat hai"
- All touch targets ≥ 44×44px

**Frontend mock API:** Commit `/contracts/auth.yaml` OpenAPI spec. Frontend uses Prism mock server. Frontend and backend work in parallel.

## 11. Runtime / Infra Impact

| Component | Impact |
|---|---|
| Redis | OTP keys (TTL 300s), session keys (TTL 7d), rate limit counters (TTL 60s), lockout keys (TTL 900s) |
| SMS Provider | MSG91/Twilio integration — requires API key in env |
| Staging | First staging deploy — API container + managed PostgreSQL + managed Redis |
| Docker | `apps/api` Dockerfile verified for staging build |

**Key Redis patterns used this sprint:**
```
otp:{phone}                → TTL 300s
ratelimit:otp:{phone}      → TTL 300s (counter)
ratelimit:otp:ip:{ip}      → TTL 300s (counter)
lockout:{phone}             → TTL 900s
session:{userId}:{deviceId} → TTL 604800s (7d)
```

## 12. Security Requirements

| Requirement | Implementation |
|---|---|
| OTP is 6-digit cryptographically random | `crypto.randomInt(100000, 999999)` |
| OTP stored in Redis only (never DB) | Redis GET/SET with TTL |
| JWT signed with RS256 or HS256 | Configured via env, secret in Secrets Manager |
| JWT contains: sub, role, iat, exp, jti | Minimal claims, no PII in payload |
| Refresh token is UUID (not JWT) | Redis-backed, one per device |
| Device binding | Hash of userAgent + deviceId stored with session |
| Rate limiting enforced | Redis counters, not in-memory |
| Account lockout after 5 failures | 15-minute Redis key |
| OTP logs use masked phone numbers | Only last 4 digits in logs |
| No JWT secret in logs | Logger redacts `Authorization` header |
| CORS configured | Whitelist: staging/prod domains only |
| Input validation | Zod schema on every DTO |
| Security events logged to DB | `SecurityEvent` table (FAILED_LOGIN, etc.) |
| AuditLog on every login/logout | Immutable, append-only |

## 13. Observability Requirements

| Metric | Implementation |
|---|---|
| `auth_otp_sent_total` | Counter, increment on every OTP send |
| `auth_otp_verified_total` | Counter, increment on success |
| `auth_otp_failed_total{reason}` | Counter with label: expired, invalid, rate_limit |
| `auth_login_total{role}` | Counter by role |
| `auth_lockout_total` | Counter, increment on lockout |
| `auth_session_active` | Gauge, track via Redis key count |
| Log: OTP sent (masked phone, IP hash) | INFO level |
| Log: Login success (userId, role, device) | INFO level |
| Log: Login failure (reason, IP hash) | WARNING level |
| Log: Lockout triggered (masked phone) | WARNING level |
| Alert: OTP failure rate >20% in 5min | Grafana alert |
| Alert: Lockout rate >10/min | Grafana alert (possible attack) |

## 14. Testing Requirements

| Test | Coverage |
|---|---|
| Unit: `OtpService.generateOtp()` | Correct format, uniqueness |
| Unit: `OtpService.verifyOtp()` | Valid, expired, wrong OTP |
| Unit: `OtpService` rate limit | Exceeds limit → throws |
| Unit: `TokenService.generateAccessToken()` | Valid JWT with correct claims |
| Unit: `TokenService.verifyAccessToken()` | Valid, expired, tampered |
| Unit: `TokenService.rotateRefreshToken()` | Old token revoked, new issued |
| Unit: `RolesGuard` | BUYER allowed, SELLER blocked, ADMIN allowed |
| Integration: Full OTP flow | Send → Verify → Tokens returned |
| Integration: Refresh flow | Valid refresh → new access token |
| Integration: Lockout | 5 failures → 401 with lockout message |
| Integration: Logout | Token revoked → subsequent 401 |
| Integration: Rate limit | 4th OTP in 5min → 429 |
| Failure: SMS provider down | Graceful error, no OTP stored |
| Failure: Redis down | Graceful degradation — return 503 |
| Security: JWT tampered | Reject with 401 |
| Security: Expired JWT | Reject with 401 |

Coverage target: ≥ 80% lines for auth module.

## 15. Performance Requirements

| Metric | Target |
|---|---|
| `POST /auth/otp/send` p95 | < 200ms (excluding SMS async) |
| `POST /auth/otp/verify` p95 | < 100ms |
| `POST /auth/refresh` p95 | < 50ms |
| Redis OTP read/write | < 5ms |
| DB session create | < 20ms |

## 16. Optimization Validation

Before closing Sprint 1:
- No N+1 queries in UsersRepository
- Redis connections pooled (not created per request)
- JWT secret not logged anywhere (verify with log grep)
- No session data in JWT payload (verify claims are minimal)
- Rate limit counters use Redis INCR (atomic) not read-then-write
- OTP not logged in plaintext anywhere (verify with log grep)
- No `any` TypeScript types in auth module (strict check)

## 17. Sprint Validation Gate

```
✅ POST /auth/otp/send → 200 with masked phone response
✅ POST /auth/otp/verify (correct OTP) → 200 with accessToken + refreshToken
✅ POST /auth/otp/verify (wrong OTP) → 401 with code: INVALID_OTP
✅ POST /auth/otp/verify (expired OTP) → 401 with code: OTP_EXPIRED
✅ POST /auth/otp/verify (5th failure) → 429 lockout response
✅ POST /auth/refresh (valid) → 200 with new tokens
✅ POST /auth/refresh (invalid) → 401
✅ GET /users/me (with valid JWT) → 200 with user object
✅ GET /users/me (no JWT) → 401
✅ GET /users/me (BUYER accessing ADMIN endpoint) → 403
✅ POST /auth/logout → 200, subsequent GET /users/me → 401
✅ Rate limiting verified (4th OTP in 5min → 429)
✅ OtpAttempt rows exist in DB after attempts
✅ LoginSession row created after successful login
✅ AuditLog entry created for login and logout
✅ Staging deployment: all above verified on staging URL
✅ SMS delivered on staging (MSG91/Twilio test mode)
✅ CI pipeline green
✅ Test coverage ≥ 80% for auth module
✅ No TypeScript errors
✅ No security vulnerabilities (pnpm audit)
✅ OpenAPI spec committed: /contracts/auth.yaml
✅ Rollback verified: can redeploy previous container, sessions preserved in Redis
```

## 18. Definition of Done

All 25 validation gate items passing. Auth module fully observable. Staging accessible. OpenAPI spec committed for frontend team.

## 19. Failure Conditions

- SMS provider fails silently (OTP never delivered, no error surfaced)
- JWT can be used after logout
- Rate limiting not enforced under concurrent load
- Session tokens leaking to logs
- `AuditLog` entries not created for login/logout
- Staging deployment fails health check

## 20. Rollback Strategy

- Application level: Redeploy previous Docker image. Sessions in Redis survive.
- Database level: No schema changes. No rollback needed.
- SMS level: SMS provider keys rotated if compromised.
- If staging is unstable: Tear down staging, fix locally, redeploy.

## 21. Production Readiness Gate

**Status: STAGING-READY.**
Auth module is production-grade in design. Staging deployment is mandatory. Production deployment deferred until Sprint 4 (after checkout flow is complete and meaningful commerce can happen).

## 22. Known Risks

| Risk | Mitigation |
|---|---|
| SMS provider rate limits on staging | Use test mode/sandbox, not real SMS in staging |
| Redis session TTL misconfiguration | Integration test verifies TTL explicitly |
| JWT secret rotation mid-session | Dual-key validation during rotation (documented in Secrets Rotation Policy) |
| Race condition on OTP rate limit | Redis INCR is atomic — use INCR+EXPIRE not GET+SET |
| Concurrent login from same device | Session uniqueness enforced by userId + deviceId hash |

## 23. AI Execution Guidance

| Task | Guidance |
|---|---|
| Zod schemas | AI can generate. Human verifies against API Contracts document |
| JwtAuthGuard | AI can generate standard pattern. Human verifies token claims |
| OTP generation | Must use `crypto.randomInt` — AI must not use `Math.random` |
| Redis key patterns | Must match patterns defined in LOCKED_DECISIONS.md exactly |
| Rate limiting logic | Human reviews: must use Redis INCR not in-memory counters |
| Lockout auto-ticket | Human reviews: SupportTicket creation logic |
| AuditLog entries | Human verifies: correct `AuditAction` enum used |
| SMS abstraction | Human designs interface: `SmsService` — AI implements concrete class |

## 24. Estimated Complexity

| Dimension | Complexity |
|---|---|
| Engineering | Medium-High (security-critical, many edge cases) |
| Operational | Medium (staging deploy, SMS provider setup) |
| Testing | High (security edge cases, rate limiting, concurrent access) |

---

---

# SPRINT 2 — PRODUCT CATALOG & SEARCH

## 1. Sprint Identity

| Field | Value |
|---|---|
| Sprint Number | 2 |
| Sprint Name | Product Catalog & Search |
| Duration | 2 weeks |
| Objective | Sellers can create and manage products with images. Buyers can search, filter, and view product detail pages. PostgreSQL GIN full-text search is functional with Hinglish normalization. |
| Philosophy | The catalog is VyaparNet's commercial foundation. If buyers cannot find products, the platform has no value. Search must be fast, segment-isolated, and Hinglish-aware from day one. |

## 2. Why This Sprint Exists

**Business:** Without a product catalog, there is nothing to buy. Without search, buyers cannot find what they need.

**Technical:** The `search_vector` tsvector column must be populated via trigger. GIN indexes must be active. S3/R2 image upload pipeline must work before inventory (Sprint 3) and orders (Sprint 4) can reference products.

**Dependency:** Inventory (Sprint 3) requires `Product.id` to exist. Orders (Sprint 4) require `Product.id` + `Product.basePrice`. Search must be functional before cart (Sprint 4).

## 3. Scope

### IN Scope
- Category tree API (read-only, seeded data)
- Product CRUD API (create, read, update, soft delete)
- Product image upload pipeline (S3/R2, WebP conversion, 3 variants)
- Product search API (PostgreSQL GIN + pg_trgm)
- Search suggestions API (recent + trending — stub)
- Segment isolation enforcement (all queries filter by segment)
- Seller product ownership enforcement (sellers only edit own products)
- Product approval workflow: new sellers → PENDING, trusted sellers → ACTIVE
- Product status management (DRAFT, ACTIVE, PENDING_APPROVAL, REJECTED)
- SearchProductDocument sync (populated on product create/update)
- Buyer product detail page (Next.js)
- Seller product management screen (Next.js)
- Buyer search results page (Next.js)
- ProductCreated / ProductUpdated domain events emitted to EventOutbox

### OUT of Scope
- Product variants (managed in Sprint 3 as part of inventory)
- Price management / supplier offers (Sprint 3)
- Product reviews (Sprint 5)
- OpenSearch migration (Phase 2)
- AI-assisted tagging (Phase 3)
- Bulk CSV upload (Phase 2)
- Category management admin UI (Sprint 7)

## 4. Deliverables

| Category | Deliverable |
|---|---|
| Module | `modules/catalog` (CategoryModule, ProductModule, MediaModule) |
| APIs | `/categories`, `/products` (CRUD), `/products/:id`, `/search/products`, `/search/suggestions`, `/media/upload` |
| DTOs | `CreateProductDto`, `UpdateProductDto`, `ProductListQueryDto`, `ProductSearchQueryDto` — Zod-validated in `packages/shared` |
| DB | `Category`, `Product`, `ProductMedia`, `Media`, `SearchProductDocument` models activated |
| Storage | S3/R2 integration, image compression (sharp), 3 variant generation (thumb/medium/large), WebP conversion |
| Search | PostgreSQL GIN search working, pg_trgm fuzzy, unaccent normalization, search trigger active |
| Events | `ProductCreated`, `ProductUpdated`, `ProductApproved`, `ProductRejected` emitted to EventOutbox |
| Frontend | Buyer: search results page, product detail page. Seller: product list + create/edit form |
| Seed | Category tree seeded for Textile + Spare Parts segments |
| Docs | `/contracts/products.yaml`, `/contracts/search.yaml` OpenAPI specs |

## 5. Dependency Mapping

| Dependency | Required Sprint |
|---|---|
| Auth + JWT (seller identity) | Sprint 1 ✅ |
| RBAC (SELLER role enforcement) | Sprint 1 ✅ |
| `packages/shared` Zod schemas | Sprint 1 ✅ |
| S3/R2 storage account | Must be provisioned |
| sharp npm package | New dependency |

## 6. Detailed Execution Sequence

```
1. Seed category data
   a. Textile: Sarees, Kurtis, Fabrics, Dress Materials, Men's Wear,
      Women's Wear, Kids Wear
   b. Spare Parts: 2-Wheeler, 4-Wheeler, Truck, Lubricants, Accessories
   c. Create seed script in packages/database/prisma/seed.ts

2. Implement CategoryModule
   a. CategoryRepository (read-only in MVP)
   b. CategoryService (getTree, getBySegment, getById)
   c. CategoryController (GET /categories, GET /categories/:id)

3. Create MediaModule
   a. StorageService interface (upload, getSignedUrl, delete)
   b. S3StorageService implements StorageService
   c. ImageProcessorService (sharp: resize, WebP, generate 3 variants)
   d. VirusScanService (stub for MVP — queue-based ClamAV later)
   e. MediaController (POST /media/upload)
   f. File validation: MIME whitelist, size limit 10MB

4. Implement ProductRepository
   a. findById(id, segment) — always filter segment + isDeleted
   b. findMany(query) — segment-isolated, paginated
   c. create(data) → include Product + Media relations
   d. update(id, sellerId, data) → ownership check
   e. softDelete(id, sellerId) → ownership check

5. Implement ProductService
   a. createProduct(dto, seller) → validate → create → upload images
      → create SearchProductDocument → emit ProductCreated event
   b. updateProduct(id, dto, seller) → ownership check → update
      → sync SearchProductDocument → emit ProductUpdated event
   c. getProduct(id, segment) → with relations
   d. listProducts(query) → paginated, segment-isolated
   e. Product approval logic: SELLER_MANAGER/ADMIN approves new sellers

6. Implement SearchService
   a. searchProducts(query) → PostgreSQL FTS query via Prisma $queryRaw
   b. Hinglish normalizer (unaccent + synonym table lookup)
   c. ts_rank ranking (name weight 1.0, description weight 0.4)
   d. Filters: segment, categoryId, minPrice, maxPrice, inStock
   e. Pagination: cursor-based
   f. getSuggestions(query) → trending (stub) + recent searches

7. Set up search trigger (raw SQL migration)
   a. product_search_update() trigger function
   b. BEFORE INSERT OR UPDATE ON "Product"
   c. Populates search_vector from name + description

8. Implement EventOutbox integration
   a. ProductCreated event → stored in EventOutbox table (same transaction)
   b. ProductUpdated event → same
   c. Outbox worker (polling) → processes pending events
      (basic worker, no real consumers yet — events stored for future)

9. Frontend: Buyer Search Results (Next.js)
   a. Sticky search bar
   b. Filter pills (segment-specific)
   c. Product grid (2-column mobile, 3-column desktop)
   d. Skeleton loaders
   e. Empty state: "Kuch nahi mila — sourcing request ka option"
   f. Infinite scroll (cursor-based)

10. Frontend: Product Detail Page (Next.js)
    a. Image carousel (WebP, pinch-to-zoom)
    b. Product name, code, price, MOQ
    c. Segment-specific attributes (dynamic)
    d. Stock status badge
    e. Verified seller badge
    f. "Request Quote" + "Add to Order" buttons (stubs)
    g. Skeleton loader
    h. Error state

11. Frontend: Seller Product Management (Next.js)
    a. Product list with status badges
    b. Create product form (multi-step: info → pricing → images)
    c. Image upload (drag-drop desktop, click mobile)
    d. Validation inline errors
    e. Pending approval state display

12. Write tests (unit + integration)
    a. Unit: ProductService CRUD with ownership
    b. Unit: SearchService segment isolation
    c. Unit: ImageProcessorService (resize, WebP)
    d. Integration: POST /products → verify DB + SearchProductDocument
    e. Integration: GET /search/products?q=saree → returns results
    f. Integration: GIN search with Hinglish term
    g. Integration: Segment isolation (TEXTILE query doesn't return SPARE_PARTS)
    h. Security: Seller A cannot update Seller B's product → 403

13. Commit OpenAPI specs: /contracts/products.yaml, /contracts/search.yaml

14. Update CURRENT_PHASE.md → Sprint 2 complete
```

## 7. Folder / Module Impact

```
apps/api/src/modules/
├── catalog/
│   ├── categories/
│   │   ├── categories.module.ts
│   │   ├── categories.controller.ts
│   │   ├── categories.service.ts
│   │   └── categories.repository.ts
│   ├── products/
│   │   ├── products.module.ts
│   │   ├── products.controller.ts
│   │   ├── products.service.ts
│   │   ├── products.repository.ts
│   │   └── tests/
│   └── search/
│       ├── search.module.ts
│       ├── search.controller.ts
│       ├── search.service.ts
│       └── search-normalizer.ts
├── media/
│   ├── media.module.ts
│   ├── media.controller.ts
│   ├── storage.interface.ts
│   ├── s3-storage.service.ts
│   ├── image-processor.service.ts
│   └── tests/
packages/
└── shared/schemas/
    ├── product.schemas.ts
    └── search.schemas.ts
```

## 8. Database Impact

| Model | Action | Notes |
|---|---|---|
| `Category` | Activate + seed | Seed data for Textile + Spare Parts |
| `Product` | Activate | search_vector populated via trigger |
| `ProductMedia` | Activate | Junction table |
| `Media` | Activate | Stores S3 URLs, checksums |
| `SearchProductDocument` | Activate | Synced on product create/update |
| `EventOutbox` | Activate | ProductCreated/ProductUpdated events stored |

**New migration required:**
```sql
-- 0002_search_trigger.sql
CREATE OR REPLACE FUNCTION product_search_update() RETURNS trigger AS $$
BEGIN
  NEW."search_vector" := to_tsvector('simple',
    coalesce(NEW."name", '') || ' ' ||
    coalesce(NEW."description", ''));
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER product_search_trigger
BEFORE INSERT OR UPDATE ON "Product"
FOR EACH ROW EXECUTE FUNCTION product_search_update();
```

**Required indexes (verify active):**
```
idx_prod_search_vector (GIN) — Tier 1
idx_prod_name_trgm (GIN, pg_trgm) — Tier 1
idx_prod_seg_cat_act — Tier 1
idx_prod_biz_act — Tier 1
idx_prod_slug — Tier 2
idx_cat_seg_active — Tier 2
idx_spd_seg_cat_price_date (SearchProductDocument) — Tier 2
```

**Rollback plan:** If search trigger causes issues, drop trigger. Products still exist. Search degrades to ILIKE.

## 9. API Impact

| Route | Method | Auth | Role |
|---|---|---|---|
| `/api/v1/categories` | GET | None | Public |
| `/api/v1/categories/:id` | GET | None | Public |
| `/api/v1/products` | GET | None | Public |
| `/api/v1/products` | POST | JWT | SELLER |
| `/api/v1/products/:id` | GET | None | Public |
| `/api/v1/products/:id` | PUT | JWT | SELLER (own) |
| `/api/v1/products/:id` | DELETE | JWT | SELLER (own) |
| `/api/v1/search/products` | GET | None | Public |
| `/api/v1/search/suggestions` | GET | None | Public |
| `/api/v1/media/upload` | POST | JWT | SELLER |

## 10. Frontend / UX Impact

**Buyer PWA:**
- Search results page: skeleton → product grid → pagination
- Product detail page: image carousel → specs → price → CTAs
- Empty state: "Kuch nahi mila" with sourcing request stub

**Seller Dashboard:**
- Product list: status badges (Active, Pending, Rejected)
- Create product: 3-step form, image upload, validation
- Edit product: pre-filled form
- Pending approval message: "Admin approval pending. 24 ghante mein active hoga."

**Offline behavior:** Product detail pages cached via service worker. Search requires network (graceful error if offline).

## 11. Runtime / Infra Impact

| Component | Impact |
|---|---|
| S3/R2 | Image upload, 3 variants stored, signed URL generation |
| Cloudflare CDN | Images served from CDN, cache-control: 7 days |
| EventOutbox | First real usage — events written to DB table |
| Redis | Search result cache (TTL 60s), trending search cache |
| sharp | New npm package for image processing |

## 12. Security Requirements

| Requirement | Implementation |
|---|---|
| File type validation | MIME whitelist: `image/jpeg`, `image/png`, `image/webp` |
| File size limit | 10MB max per image, 10 images max per product |
| S3 bucket private | All media served via signed URLs (CloudFront/R2) |
| Seller ownership | `product.businessId === seller.businessId` on every mutation |
| Segment isolation | `segment` filter on EVERY product query — never bypass |
| Input sanitization | Product description: DOMPurify (allowed tags: b, i, p, br) |
| No raw SQL injection | All queries via Prisma except search (use parameterized $queryRaw) |
| RBAC | Sellers cannot access other sellers' products for mutation |
| Upload path | Never use user-provided filenames. Generate UUID-based S3 keys |

## 13. Observability Requirements

| Metric | Implementation |
|---|---|
| `product_created_total` | Counter by segment |
| `product_search_query_total` | Counter |
| `product_search_latency_seconds` | Histogram (target p95 < 150ms) |
| `product_search_zero_results_total` | Counter (high rate = catalog gap) |
| `media_upload_total` | Counter |
| `media_upload_latency_seconds` | Histogram |
| `search_cache_hit_rate` | Gauge (from Redis) |
| Alert: search p95 > 300ms | Grafana alert |
| Alert: zero results rate > 20% | Grafana alert |

## 14. Testing Requirements

| Test | Detail |
|---|---|
| Unit: Search normalization | "kurtee" → matches "kurti" |
| Unit: Segment isolation | TEXTILE query never returns SPARE_PARTS products |
| Unit: Image processor | WebP output, 3 variants generated |
| Unit: Seller ownership | Wrong seller → 403 |
| Integration: Full product creation | POST → DB row + SearchProductDocument + EventOutbox |
| Integration: GIN search | Real tsvector query returns expected results |
| Integration: Image upload | File → S3 → 3 variant URLs returned |
| Integration: Signed URL | URL expires after 5 minutes |
| Performance: Search with 10K products | p95 < 150ms on staging |
| Security: Upload non-image file (PDF disguised as JPG) | 400 rejected |
| Security: Oversized file | 413 rejected |
| Failure: S3 down | Graceful error, product creation blocked (not silent fail) |

## 15. Performance Requirements

| Metric | Target |
|---|---|
| `GET /search/products` p95 | < 150ms |
| `GET /products/:id` p95 | < 100ms |
| `POST /products` p95 (including image upload) | < 3s |
| Image CDN delivery | < 500ms (Cloudflare edge) |
| Search with 10K products | p95 < 150ms (load test with seed data) |

## 16. Optimization Validation

- Search query uses GIN index (verify with `EXPLAIN ANALYZE`)
- `SearchProductDocument` insert is in same transaction as `Product` insert
- Image variants generated asynchronously (do not block API response)
- No N+1 in product list (single JOIN query)
- Search results cached in Redis (TTL 60s) for repeated queries
- Product detail page cached in Redis (TTL 5min)

## 17. Sprint Validation Gate

```
✅ GET /categories → returns seeded tree for TEXTILE and SPARE_PARTS
✅ POST /products (SELLER) → 201, product visible in GET /products
✅ POST /products (BUYER role) → 403
✅ GET /search/products?q=saree&segment=TEXTILE → returns results
✅ GET /search/products?q=saree&segment=SPARE_PARTS → empty (isolation)
✅ GET /search/products?q=kurtee → returns kurti results (fuzzy match)
✅ Image upload → 3 variants exist in S3/R2, thumbnails accessible via CDN
✅ EXPLAIN ANALYZE on search query confirms GIN index is used
✅ Seller A PUT /products/{Seller B's product} → 403
✅ Product detail page loads < 2.5s (LCP) on staging
✅ SearchProductDocument row created for every new product
✅ EventOutbox row created for ProductCreated events
✅ Search cache hit on repeated query (Redis)
✅ CI green, test coverage ≥ 80% for catalog module
✅ OpenAPI specs committed: /contracts/products.yaml, /contracts/search.yaml
✅ Zero TypeScript errors
✅ File upload: non-image file → 400
✅ Category seed data verified in staging DB
```

## 18. Definition of Done

All 18 validation gate items passing. Product creation + search functional on staging. Image CDN delivery verified. GIN index confirmed active via EXPLAIN ANALYZE.

## 19. Failure Conditions

- Search returns results across segments (isolation failure)
- Seller B can mutate Seller A's products (ownership failure)
- Images served without CDN (direct S3 URLs exposed)
- search_vector column not populated (trigger not running)
- EventOutbox not receiving product events

## 20. Rollback Strategy

- App: Redeploy previous image. Products remain in DB.
- Search trigger: `DROP TRIGGER product_search_trigger` — search degrades to ILIKE.
- Images: S3 files remain but are orphaned if product rollback occurs (cleanup job handles this — see Sprint 9).

## 21. Production Readiness Gate

**Status: STAGING-READY.** Not production-deployed yet (awaiting checkout flow in Sprint 4).

## 22. Known Risks

| Risk | Mitigation |
|---|---|
| search_vector not updating on description-only edits | Ensure trigger fires on UPDATE of name AND description columns |
| Hinglish normalization misses common terms | Pre-load SearchSynonym table from PRD-approved term list |
| S3 signed URL expiry too short for product detail pages | Set 24h TTL for product images (not documents) |
| Image processing blocking API thread | Always queue image processing via BullMQ worker (async) |

## 23. AI Execution Guidance

| Task | Guidance |
|---|---|
| Prisma $queryRaw for search | Human writes SQL. AI assists but human verifies parameterization |
| Search trigger SQL | Human writes. Reference Indexing Strategy document |
| Image processor (sharp) | AI can generate standard WebP pipeline |
| Segment isolation | Human audits every query — AI must not bypass segment filter |
| SearchProductDocument sync | Human verifies: same Prisma transaction as Product create |
| EventOutbox integration | Human verifies: atomic with product write |

## 24. Estimated Complexity

| Dimension | Complexity |
|---|---|
| Engineering | High (search, image pipeline, segment isolation) |
| Operational | Medium (S3 setup, CDN config) |
| Testing | High (GIN search correctness, segment isolation, image security) |

---

---

# SPRINT 3 — INVENTORY MANAGEMENT

## 1. Sprint Identity

| Field | Value |
|---|---|
| Sprint Number | 3 |
| Sprint Name | Inventory Management |
| Duration | 2 weeks |
| Objective | Zero-oversell guarantee. Inventory reservation system with optimistic locking, Redis distributed locking, reservation expiry, and low-stock alerts. This is the most concurrency-critical sprint in the entire roadmap. |
| Philosophy | Inventory is where money is lost if you get it wrong. No shortcuts. No race conditions. Every stock mutation is atomic, idempotent, and auditable. Test under concurrent load before this sprint closes. |

## 2. Why This Sprint Exists

**Business:** Without correct inventory, VyaparNet sells what it doesn't have. One oversell event destroys buyer trust irreparably.

**Technical:** Orders (Sprint 4) depend entirely on `InventoryService.reserve()`. If inventory is incorrect, every order is incorrect. This sprint establishes the concurrency safety that makes Sprint 4 reliable.

**Dependency:** Cart (Sprint 4) calls inventory check on add-to-cart. Order placement calls reservation. Payment failure calls reservation release. All three depend on Sprint 3.

## 3. Scope

### IN Scope
- `Inventory` model activation (stock, reservedQty, version, isLowStock)
- `InventoryReservation` model activation (with expiry)
- `InventoryMovement` model activation (audit trail)
- `InventorySnapshot` model activation (daily reconciliation)
- Stock reservation API (with Redis lock + optimistic locking)
- Stock release API (on order cancel / payment failure)
- Reservation expiry cron job (every 5 minutes via BullMQ)
- Low-stock alert job (seller notification when stock < threshold)
- Seller stock update API (update quantity + price)
- GET inventory for product (buyer: available quantity)
- GET inventory management (seller: full stock view)
- Supplier-facing stock confidence scoring (basic: LIVE/48H/CATALOG_ONLY)
- `InventoryChanged`, `StockLow` domain events to EventOutbox
- Seller inventory management screen (Next.js)
- Stock status on product detail page (Next.js)

### OUT of Scope
- Warehouse location management (Phase 2)
- Multi-supplier inventory aggregation (Phase 2)
- Inventory snapshot analytics (Sprint 9)
- Bulk inventory update via CSV (Phase 2)
- Advanced stock confidence scoring (Phase 2)

## 4. Deliverables

| Category | Deliverable |
|---|---|
| Module | `modules/inventory` (InventoryModule) |
| APIs | `GET /inventory/:productId`, `PATCH /inventory/:productId`, `POST /inventory/reserve`, `POST /inventory/release`, `GET /inventory/seller` |
| DTOs | `ReserveInventoryDto`, `ReleaseInventoryDto`, `UpdateInventoryDto` |
| DB | `Inventory`, `InventoryReservation`, `InventoryMovement`, `InventorySnapshot` models activated |
| BullMQ | `inventory` queue activated, `ReservationExpiryWorker`, `LowStockAlertWorker` |
| Redis | Inventory lock keys (TTL 30s) |
| Events | `InventoryReserved`, `InventoryReleased`, `StockLow`, `InventoryChanged` → EventOutbox |
| Frontend | Seller inventory management screen. Stock status on product detail page. |
| Docs | `/contracts/inventory.yaml` OpenAPI spec |

## 5. Dependency Mapping

| Dependency | Required Sprint |
|---|---|
| `Product` model active | Sprint 2 ✅ |
| `Business` model active (seller ownership) | Sprint 1 ✅ |
| BullMQ module registered | Sprint 0 ✅ |
| EventOutbox active | Sprint 2 ✅ |
| RBAC (SELLER role) | Sprint 1 ✅ |

## 6. Detailed Execution Sequence

```
1. Activate inventory queue in BullMQ
   a. Register 'inventory' queue
   b. Configure: priority Critical(2), max 3 retries, backoff 100ms/200ms/400ms

2. Implement InventoryRepository
   a. findByProductId(productId) → with FOR UPDATE (pessimistic read)
   b. updateWithVersion(id, update, version) → returns affected rows count
      (0 = version mismatch = concurrent modification)
   c. createReservation(data) → InventoryReservation
   d. releaseReservation(reservationId) → update status + increment stock
   e. findExpiredReservations() → status=ACTIVE, expiresAt < now()
   f. createMovement(data) → InventoryMovement (audit trail)

3. Implement InventoryService
   a. reserveStock(dto)
      i.   Acquire Redis lock: SETNX lock:inv:{productId} TTL=30s
      ii.  If lock not acquired: throw ConcurrencyException (caller retries)
      iii. SELECT stock, version FROM Inventory WHERE productId=?
      iv.  If stock < qty: release lock, throw InsufficientStockException
      v.   UPDATE Inventory SET stock = stock - qty, version = version + 1
           WHERE id=? AND version={fetched_version}
      vi.  If 0 rows updated: release lock, throw ConcurrencyException
      vii. CREATE InventoryReservation {orderId, qty, expiresAt=now+900s}
      viii. CREATE InventoryMovement {type: RESERVATION_HELD, qty, orderId}
      ix.  Release Redis lock
      x.   Emit InventoryReserved event → EventOutbox
      xi.  Return reservationId

   b. releaseStock(reservationId)
      i.   Find reservation
      ii.  UPDATE Inventory SET stock = stock + qty, reservedQty = reservedQty - qty
           version = version + 1 WHERE productId=? AND version=?
      iii. UPDATE InventoryReservation SET status = RELEASED
      iv.  CREATE InventoryMovement {type: RESERVATION_RELEASED}
      v.   Emit InventoryReleased → EventOutbox

   c. updateStock(productId, sellerId, dto)
      i.   Verify seller owns product
      ii.  UPDATE Inventory (stock, price, isLowStock)
      iii. CREATE InventoryMovement {type: ADJUSTMENT}
      iv.  Emit InventoryChanged → EventOutbox
      v.   Check if isLowStock → emit StockLow if below threshold

4. Implement ReservationExpiryWorker (BullMQ)
   a. Cron: every 5 minutes
   b. Find all ACTIVE reservations where expiresAt < now()
   c. For each: call releaseStock (with idempotency check)
   d. Log expiry count

5. Implement LowStockAlertWorker (BullMQ)
   a. Triggered by StockLow event in EventOutbox
   b. Finds seller's notification preference
   c. Enqueues notification to 'notifications' queue (stub for now)

6. Frontend: Seller Inventory Management (Next.js)
   a. Product list with stock levels (red if low)
   b. Edit stock modal (quantity + threshold)
   c. Stock history (InventoryMovement list)
   d. Low stock banner

7. Frontend: Product Detail Stock Display (Next.js)
   a. Stock badge: "In Stock" / "Low Stock" / "Out of Stock"
   b. Available quantity (for B2B transparency)

8. Write tests
   a. Unit: reserveStock — correct optimistic locking
   b. Unit: reserveStock — insufficient stock → exception
   c. Unit: releaseStock — stock correctly incremented
   d. Concurrency test: 10 concurrent reservations for qty 1 product
      → only 1 succeeds, 9 fail gracefully
   e. Integration: reserve → expire → verify stock released
   f. Integration: reserve → release → verify stock correct
   g. Failure: Redis lock unavailable → graceful ConcurrencyException

9. Load test: simulate 50 concurrent reservation requests
   (use k6 or Artillery on staging)
   → zero oversell events verified

10. Commit OpenAPI spec: /contracts/inventory.yaml
11. Update CURRENT_PHASE.md → Sprint 3 complete
```

## 7. Folder / Module Impact

```
apps/api/src/modules/
├── inventory/
│   ├── inventory.module.ts
│   ├── inventory.controller.ts
│   ├── inventory.service.ts
│   ├── inventory.repository.ts
│   └── workers/
│       ├── reservation-expiry.worker.ts
│       └── low-stock-alert.worker.ts
│   └── tests/
│       ├── inventory.service.spec.ts
│       └── inventory.concurrency.spec.ts   ← CRITICAL
```

## 8. Database Impact

| Model | Action | Critical Notes |
|---|---|---|
| `Inventory` | Activate | `version` column is critical — must default to 0 |
| `InventoryReservation` | Activate | `expiresAt` index critical for expiry job |
| `InventoryMovement` | Activate | Append-only, no UPDATE/DELETE ever |
| `InventorySnapshot` | Activate (stub) | Daily snapshot — populated by cron (Sprint 9) |

**Required indexes (verify active):**
```
idx_inv_prod — Tier 1 (stock check on order placement)
idx_inv_biz_low — Tier 2 (low stock alerts)
idx_invres_inv_stat_exp — Tier 1 (expiry job efficiency)
idx_invmov_inv_date — Tier 2 (audit trail queries)
```

**Rollback plan:** If inventory logic is unstable, revert to previous image. All InventoryMovements preserved (audit trail). Stock levels can be manually reconciled via InventorySnapshot if needed.

## 9. API Impact

| Route | Method | Auth | Role |
|---|---|---|---|
| `/api/v1/inventory/:productId` | GET | None | Public (available qty only) |
| `/api/v1/inventory/:productId` | PATCH | JWT | SELLER (own product) |
| `/api/v1/inventory/reserve` | POST | JWT | BUYER/SYSTEM |
| `/api/v1/inventory/release` | POST | JWT | SYSTEM |
| `/api/v1/inventory/seller` | GET | JWT | SELLER |

**`POST /inventory/reserve` must include `Idempotency-Key` header.**

## 10. Frontend / UX Impact

**Seller Dashboard:**
- Inventory list: red badge if `isLowStock = true`
- Edit modal: quantity input, threshold input, save confirmation
- Movement history: timeline of stock changes

**Buyer Product Detail:**
- Stock badge: color-coded (green = available, yellow = low, red = out of stock)
- Quantity stepper: max = available stock
- "Low stock" warning: "Sirf X bacha hai"

## 11. Runtime / Infra Impact

| Component | Impact |
|---|---|
| BullMQ | `inventory` queue activated. Two workers: expiry + low-stock |
| Redis | Lock keys `lock:inv:{productId}` (TTL 30s) |
| Cron | ReservationExpiryWorker: every 5 minutes |
| DB | High-write table: Inventory, InventoryMovement, InventoryReservation. Autovacuum tuned |

**Autovacuum tuning for Inventory (add to migration):**
```sql
ALTER TABLE "Inventory" SET (autovacuum_vacuum_scale_factor = 0.05);
```

## 12. Security Requirements

| Requirement | Implementation |
|---|---|
| Seller ownership on stock update | `inventory.businessId === seller.businessId` |
| Idempotency on reserve | `Idempotency-Key` header + Redis check |
| Atomic Redis lock | SETNX (not GET+SET) |
| Version check | Prisma `updateMany WHERE version=X` → 0 rows = conflict |
| Audit trail | Every stock mutation creates `InventoryMovement` |
| No stock manipulation by buyer | Reserve API — buyer can only trigger via order placement, not directly |

## 13. Observability Requirements

| Metric | Implementation |
|---|---|
| `inventory_reservation_total` | Counter |
| `inventory_reservation_failed{reason}` | Counter (insufficient_stock, concurrency, lock_failed) |
| `inventory_reservation_latency_ms` | Histogram (target p99 < 100ms) |
| `inventory_oversell_prevented_total` | Counter (critical — should always be 0 real oversells) |
| `inventory_expiry_released_total` | Counter (expiry worker) |
| `inventory_low_stock_alerts_total` | Counter |
| Alert: Any oversell event | CRITICAL alert immediately |
| Alert: Reservation failure rate > 10% | WARNING |
| Alert: Lock acquisition failure > 5% | WARNING |

## 14. Testing Requirements

| Test | Requirement |
|---|---|
| Unit: reserve with sufficient stock | Success, correct version increment |
| Unit: reserve with insufficient stock | InsufficientStockException |
| Unit: reserve with version mismatch | ConcurrencyException |
| Unit: release → stock incremented correctly | Verify qty restored |
| **Concurrency: 10 simultaneous reserves, stock=1** | **Only 1 succeeds, 9 fail, stock=0 after** |
| **Concurrency: 50 simultaneous reserves, stock=30** | **Exactly 30 succeed, 20 fail** |
| Integration: reserve → wait 16min → verify auto-released | Expiry worker functional |
| Integration: reserve → release manually | Stock correctly restored |
| Failure: Redis unavailable | ConcurrencyException (graceful), not 500 crash |
| Load: 50 concurrent reservation requests | Zero oversell on staging |

**The concurrency tests are mandatory and must pass before sprint closes.**

## 15. Performance Requirements

| Metric | Target |
|---|---|
| `POST /inventory/reserve` p99 | < 100ms |
| Expiry worker per batch (100 reservations) | < 5s |
| `GET /inventory/:productId` p95 | < 50ms |
| Lock acquisition | < 20ms |

## 16. Optimization Validation

- Redis lock uses atomic SETNX (not GET+conditional SET)
- Optimistic locking: `updateMany WHERE version=X` (not SELECT then UPDATE)
- No SELECT FOR UPDATE in reservation path (uses optimistic locking instead)
- InventoryMovement inserts batched where possible
- Expiry worker uses indexed query on `expiresAt` (idx_invres_inv_stat_exp verified)

## 17. Sprint Validation Gate

```
✅ POST /inventory/reserve (sufficient stock) → 200 with reservationId
✅ POST /inventory/reserve (insufficient stock) → 409 InsufficientStock
✅ PATCH /inventory/:productId (own product) → 200
✅ PATCH /inventory/:productId (other seller) → 403
✅ Concurrency test: 10 simultaneous reserves, stock=1 → only 1 succeeds
✅ Expiry worker: reservation auto-released after 15min (test with TTL=1min)
✅ InventoryMovement created for every stock change
✅ EventOutbox receives InventoryReserved + InventoryReleased events
✅ Low stock badge visible on product detail when isLowStock=true
✅ EXPLAIN ANALYZE: inventory queries use idx_inv_prod
✅ Load test: 50 concurrent requests on staging → zero oversell
✅ Autovacuum setting applied to Inventory table
✅ Idempotent reserve: same Idempotency-Key → same response, stock not double-decremented
✅ Redis lock TTL verified: key expires after 30s even if process crashes
✅ CI green, coverage ≥ 80% inventory module
✅ OpenAPI spec committed: /contracts/inventory.yaml
```

## 18. Definition of Done

All 16 validation gate items passing, including mandatory concurrency tests. Load test on staging with zero oversell. InventoryMovement audit trail complete.

## 19. Failure Conditions

- Any oversell event in concurrency test
- Expiry worker fails to release reservations
- Version mismatch causes hard crash instead of graceful retry
- InventoryMovement not created for a stock mutation
- Redis lock not released after process crash (TTL must enforce release)

## 20. Rollback Strategy

Application: Redeploy previous image. Stock levels preserved in DB. Expired reservations cleaned by expiry worker. If stock numbers are corrupted, restore from latest InventorySnapshot (or manual reconciliation via InventoryMovement audit trail).

## 21. Production Readiness Gate

**Status: STAGING-READY.** No production deploy yet. Inventory is too critical to deploy without full cart+order+payment flow (Sprint 4).

## 22. Known Risks

| Risk | Mitigation |
|---|---|
| Redis lock not released on process crash | TTL=30s guarantees eventual release |
| High-frequency reservation under load causes lock queue | Short TTL + immediate retry logic |
| Expiry worker misses reservations | Idempotent release logic + monitoring |
| Prisma `updateMany` returning 0 rows on valid update | Debug: version mismatch vs other condition |

## 23. AI Execution Guidance

| Task | Guidance |
|---|---|
| Redis lock pattern | Human writes. SETNX must be atomic. Must NOT use Lua scripts unless explicitly reviewed |
| Optimistic locking | Human writes `updateMany WHERE version=X`. AI must not simplify to SELECT+UPDATE |
| Concurrency tests | Human writes. Must simulate true concurrent requests (Promise.all) |
| InventoryMovement creation | AI can assist but human audits every code path creates a movement record |
| BullMQ worker setup | AI can generate standard worker pattern |

## 24. Estimated Complexity

| Dimension | Complexity |
|---|---|
| Engineering | High (concurrency-critical, Redis + DB locking) |
| Operational | Medium (BullMQ workers, autovacuum) |
| Testing | Very High (concurrency tests are mandatory and non-trivial) |

---

---

# SPRINT 4 — CART, ORDERS & PAYMENTS

## 1. Sprint Identity

| Field | Value |
|---|---|
| Sprint Number | 4 |
| Sprint Name | Cart, Orders & Payments |
| Duration | 2 weeks |
| Objective | Complete end-to-end buyer checkout: add to cart → place order → COD or Razorpay payment → order confirmation. This is the revenue sprint. |
| Philosophy | This sprint is the most complex in the roadmap. It touches inventory (Sprint 3), auth (Sprint 1), products (Sprint 2), and introduces the payment gateway. Every step must be atomic, idempotent, and rollback-safe. The checkout path must never fail silently. |

## 2. Why This Sprint Exists

**Business:** Sprint 4 is where VyaparNet generates its first revenue. Without a working checkout, every prior sprint has no business value.

**Technical:** Order placement must be a single atomic transaction: reserve inventory + create order + create order items + initiate payment + emit events. All in one Prisma transaction. Payment webhooks must be idempotent. COD must work as a complete fallback.

**Dependency:** Sprint 5 (dashboards) requires order data. Sprint 6 (notifications) requires order events. Sprint 7 (admin) requires order moderation capability.

## 3. Scope

### IN Scope
- Cart CRUD (add item, update quantity, remove item, view cart)
- MOQ validation on add-to-cart
- Cart total calculation (subtotal, tax estimate)
- Order placement (atomic: inventory + order + items in one transaction)
- Order status machine (DRAFT → PLACED → CONFIRMED → SHIPPED → DELIVERED → COMPLETED)
- COD payment (no gateway — order confirmed immediately)
- Razorpay integration (initiate, webhook verify, status poll)
- Payment idempotency (Redis + DB)
- Webhook HMAC verification (mandatory)
- Order cancellation (buyer-initiated, before shipment)
- Inventory release on cancel/payment failure
- Delivery address snapshot on order (immutable)
- `OrderCreated`, `OrderConfirmed`, `PaymentReceived`, `PaymentFailed` → EventOutbox
- Buyer cart page (Next.js)
- Buyer checkout flow (address → payment → confirm) (Next.js)
- Buyer order confirmation page (Next.js)
- **First production deployment** (after checkout is functional and tested on staging)

### OUT of Scope
- Seller order management UI (Sprint 5)
- Order tracking UI (Sprint 5)
- Supplier settlement (Sprint 7)
- Invoice PDF generation (Sprint 7)
- Return/refund flow (Sprint 8)
- Quotation/RFQ (Sprint 8)
- Split payments / credit limit (Phase 3)

## 4. Deliverables

| Category | Deliverable |
|---|---|
| Module | `modules/order` (CartModule, OrderModule), `modules/payment` (PaymentModule) |
| APIs | Cart CRUD, `/orders` (POST/GET), `/orders/:id` (GET/PUT cancel), `/payments/initiate`, `/payments/verify`, `/payments/webhook`, `/payments/:id/status` |
| DTOs | `AddToCartDto`, `CreateOrderDto`, `InitiatePaymentDto`, `VerifyPaymentDto` |
| DB | `Cart`, `CartItem`, `Order`, `OrderItem`, `OrderTracking`, `Payment`, `OrderStatusHistory` models activated |
| BullMQ | `payments` queue activated, `PaymentReconciliationWorker` |
| Redis | Cart session cache, payment idempotency keys, payment status poll cache |
| Razorpay | SDK integration, order creation, payment capture, webhook handler |
| COD | Immediate order confirmation, no gateway |
| Events | `OrderCreated`, `OrderConfirmed`, `PaymentReceived`, `PaymentFailed` → EventOutbox |
| Frontend | Cart page, checkout flow (3 steps), order confirmation page |
| Production | First production deployment (apps/api + apps/web on cloud) |
| Docs | `/contracts/orders.yaml`, `/contracts/payments.yaml` |

## 5. Dependency Mapping

| Dependency | Required Sprint |
|---|---|
| `Product`, `Inventory` models active | Sprint 3 ✅ |
| `InventoryService.reserve()` working | Sprint 3 ✅ |
| `Address` model active (shipping snapshot) | Sprint 1 ✅ |
| BullMQ (payments queue) | Sprint 0 ✅ (registered) |
| Auth + RBAC | Sprint 1 ✅ |
| Razorpay account | Must be provisioned |

## 6. Detailed Execution Sequence

```
1. Implement CartModule
   a. CartRepository: find/create/update cart (unique per userId+segment+ACTIVE)
   b. CartService:
      - addItem(userId, productId, qty) → MOQ check → stock check → upsert CartItem
      - updateItem(cartId, itemId, qty) → MOQ recheck
      - removeItem(cartId, itemId)
      - getCart(userId, segment) → with product relations
      - clearCart(cartId) → after order placed
      - calculateTotals(cart) → subtotal, tax estimate
   c. CartController: standard CRUD routes

2. Implement OrderModule
   a. OrderRepository:
      - create(data) → with items (Prisma nested create)
      - findById(id, buyerId) → ownership check
      - findMany(buyerId, filters) → paginated
      - updateStatus(id, status, actorId) → + OrderStatusHistory entry
   b. OrderService:
      - createOrder(dto, buyer): ATOMIC PRISMA TRANSACTION
          i.   Validate items (product exists, in segment, active)
          ii.  For each item: call InventoryService.reserve()
          iii. Snapshot shipping address (JSON, not FK)
          iv.  Calculate order total
          v.   prisma.$transaction(async tx => {
                 order = await tx.order.create({...})
                 await tx.orderItem.createMany({...})
                 await tx.orderStatusHistory.create({statusTo: PLACED})
                 await tx.eventOutbox.create({eventType: 'OrderCreated'})
               })
          vi.  If COD: immediately confirm (status → CONFIRMED)
          vii. If online: initiate payment, return payment URL
          viii. Return order
      - cancelOrder(orderId, buyerId): inventory release + status update
      - getOrder(orderId, buyerId): ownership check

3. Implement PaymentModule
   a. PaymentRepository: create, findByIdempotencyKey, updateStatus
   b. RazorpayService: createOrder, verifyWebhook, capturePayment
   c. PaymentService:
      - initiatePayment(dto): idempotency check → create payment record
        → call Razorpay → return checkout URL
      - handleWebhook(payload, signature): HMAC verify → process event
        → update payment → emit PaymentConfirmed/Failed to EventOutbox
      - pollStatus(paymentId): check Razorpay API for status
      - refundPayment(paymentId, reason): stub (Sprint 8)

4. Implement PaymentWebhookController
   a. POST /payments/webhook (raw body middleware — JSON must not be parsed)
   b. verifyWebhookSignature() → MANDATORY, reject if invalid
   c. Idempotency check: has this webhook eventId been processed?
   d. Process: update Payment → emit event → 200 OK

5. Implement PaymentReconciliationWorker (BullMQ)
   a. Cron: every 5 minutes
   b. Find PENDING payments older than 10 minutes
   c. Poll Razorpay API for status
   d. Update accordingly (catches missed webhooks)

6. Frontend: Cart Page (Next.js)
   a. Item list grouped by seller
   b. MOQ validation (red border + "Minimum X pieces required")
   c. Quantity stepper (max = available stock)
   d. Subtotal per seller + total
   e. Sticky "Place Order" CTA
   f. Empty state: "Cart mein kuch nahi hai"
   g. Conflict handling: stock changed since add → show warning

7. Frontend: Checkout Flow (Next.js — 3 steps)
   a. Step 1: Delivery address (saved addresses + add new)
   b. Step 2: Payment method (COD default + Razorpay online)
   c. Step 3: Review + confirm (order summary, total, terms)
   d. Progress stepper (top)
   e. "Back" navigation (restore step state)
   f. Optimistic submit pattern (immediate success UI → rollback on failure)

8. Frontend: Order Confirmation Page (Next.js)
   a. Checkmark animation (brief, <300ms)
   b. Order number (VN-XXXXX)
   c. Estimated delivery
   d. "Track Order" + "Continue Shopping" buttons
   e. Share order link

9. Duplicate order prevention
   a. If same cart items ordered within 5 minutes → warn buyer
   b. Client-side: disable submit button immediately on click
   c. Server-side: idempotency key from cartId + timestamp window

10. Write tests
    a. Unit: CartService.addItem MOQ validation
    b. Unit: OrderService.createOrder — atomic transaction verified
    c. Unit: Webhook HMAC verification (valid + invalid + tampered)
    d. Unit: Payment idempotency (same key → same response)
    e. Integration: Full COD flow (add to cart → order → confirmed)
    f. Integration: Full Razorpay flow (sandbox mode)
    g. Integration: Webhook processing (success + failure + duplicate)
    h. Failure: Payment gateway timeout → graceful 503, no order created
    i. Failure: Inventory reserve fails mid-order → transaction rolled back
    j. E2E: Playwright — buyer completes full checkout (Razorpay sandbox)

11. Deploy to PRODUCTION (after staging validation passes)
    a. Run migrations on production DB
    b. Deploy apps/api + apps/web
    c. Verify /health/ready → 200
    d. Place 1 test COD order manually
    e. Verify order in DB
    f. Monitor for 30 minutes

12. Commit OpenAPI specs: /contracts/orders.yaml, /contracts/payments.yaml
13. Update CURRENT_PHASE.md → Sprint 4 complete
```

## 7. Folder / Module Impact

```
apps/api/src/modules/
├── order/
│   ├── cart/
│   │   ├── cart.module.ts
│   │   ├── cart.controller.ts
│   │   ├── cart.service.ts
│   │   ├── cart.repository.ts
│   │   └── tests/
│   └── orders/
│       ├── orders.module.ts
│       ├── orders.controller.ts
│       ├── orders.service.ts
│       ├── orders.repository.ts
│       └── tests/
├── payment/
│   ├── payment.module.ts
│   ├── payment.controller.ts
│   ├── payment.service.ts
│   ├── payment.repository.ts
│   ├── razorpay.service.ts
│   ├── webhook.controller.ts   ← separate controller for raw body
│   └── workers/
│       └── payment-reconciliation.worker.ts
│   └── tests/
```

## 8. Database Impact

| Model | Action | Critical Notes |
|---|---|---|
| `Cart` | Activate | Unique: userId+segment+ACTIVE |
| `CartItem` | Activate | — |
| `Order` | Activate | `orderMonth` partition key must be set |
| `OrderItem` | Activate | Snapshot: product name, price at order time |
| `OrderTracking` | Activate | — |
| `Payment` | Activate | `idempotencyKey` unique index critical |
| `OrderStatusHistory` | Activate | Append-only, immutable |

**Transaction boundary (critical):**
The entire order creation MUST be in one `prisma.$transaction()`:
- `order.create`
- `orderItem.createMany`
- `orderStatusHistory.create`
- `eventOutbox.create` (OrderCreated event)

If any step fails, the entire transaction rolls back. Inventory reservation happens BEFORE the transaction (compensated by release on failure).

**Required indexes:**
```
idx_cart_user_seg_stat (UNIQUE) — Tier 1
idx_order_buyer_stat — Tier 1
idx_pay_order_stat — Tier 1
idx_pay_idem_key (UNIQUE) — Tier 1
idx_osh_order_date (OrderStatusHistory) — Tier 2
```

## 9. API Impact

| Route | Method | Auth | Role | Idempotent |
|---|---|---|---|---|
| `/api/v1/cart` | GET | JWT | BUYER | No |
| `/api/v1/cart/items` | POST | JWT | BUYER | No |
| `/api/v1/cart/items/:id` | PUT | JWT | BUYER | No |
| `/api/v1/cart/items/:id` | DELETE | JWT | BUYER | No |
| `/api/v1/orders` | POST | JWT | BUYER | Yes |
| `/api/v1/orders` | GET | JWT | BUYER | No |
| `/api/v1/orders/:id` | GET | JWT | BUYER | No |
| `/api/v1/orders/:id/cancel` | POST | JWT | BUYER | Yes |
| `/api/v1/payments/initiate` | POST | JWT | BUYER | Yes |
| `/api/v1/payments/verify` | POST | JWT | BUYER | Yes |
| `/api/v1/payments/webhook` | POST | None | System | Yes |
| `/api/v1/payments/:id/status` | GET | JWT | BUYER | No |

**`POST /orders` and `POST /payments/initiate` require `Idempotency-Key` header.**
**`POST /payments/webhook` requires raw body (no JSON parsing middleware).**

## 10. Frontend / UX Impact

**Cart Page:**
- Real-time MOQ validation with red borders
- Duplicate order warning ("Similar order placed 5 min ago")
- Conflict handling if stock changes while in cart
- Empty cart with "Browse karein" CTA

**Checkout (3 steps):**
- Step 1: Address (saved + new — Hinglish labels)
- Step 2: Payment (COD default, Razorpay option)
- Step 3: Review (no surprise charges)
- Disable submit on click (prevent double-submit)
- Error state: "Payment fail ho gaya. Retry karein."
- Network error: Draft preservation

**Order Confirmation:**
- Brief success animation (< 300ms, respect prefers-reduced-motion)
- Order number prominent
- WhatsApp share stub (Phase 2)

## 11. Runtime / Infra Impact

| Component | Impact |
|---|---|
| BullMQ | `payments` queue activated |
| Redis | Payment idempotency keys (TTL 24h), cart session cache |
| Razorpay | API keys in env vars, webhook secret in env vars |
| Production | First production deploy — monitoring must be active |
| Reconciliation cron | Every 5 minutes for missed webhooks |

## 12. Security Requirements

| Requirement | Implementation |
|---|---|
| Webhook HMAC | MANDATORY — reject all webhooks with invalid signature |
| Payment idempotency | Idempotency-Key in Redis (TTL 24h), checked before processing |
| Raw body for webhook | Separate route with `express.raw()` — JSON parser must NOT touch it |
| Buyer order ownership | All order reads: `WHERE buyerId = req.user.id` |
| OTP required for payments > ₹50,000 | Security re-verification (added to payment initiation) |
| No payment details in logs | Mask card numbers, UPI IDs in structured logs |
| Duplicate order detection | Client: disable button. Server: idempotency window |
| Cart ownership | All cart mutations: `WHERE userId = req.user.id` |

## 13. Observability Requirements

| Metric | Implementation |
|---|---|
| `order_created_total{method}` | Counter by COD/online |
| `order_confirmed_total` | Counter |
| `order_cancelled_total{reason}` | Counter |
| `payment_initiated_total` | Counter |
| `payment_success_total` | Counter |
| `payment_failed_total{reason}` | Counter |
| `checkout_funnel_step{step}` | Counter per step (add-to-cart, checkout-start, payment-start, confirmed) |
| `payment_webhook_received_total` | Counter |
| `payment_webhook_duplicate_total` | Counter |
| Alert: Payment failure rate > 5% | CRITICAL alert |
| Alert: Checkout abandon rate > 50% | WARNING |
| Alert: Missed webhook reconciled > 10 | WARNING |

## 14. Testing Requirements

| Test | Requirement |
|---|---|
| Unit: MOQ validation | < MOQ → error, ≥ MOQ → success |
| Unit: Order transaction | DB transaction rolls back entirely if one step fails |
| Unit: Webhook HMAC | Valid → process, invalid → 400 |
| Unit: Payment idempotency | Second call → same response, no double charge |
| Integration: COD full flow | Cart → Order → Confirmed, inventory decremented |
| Integration: Razorpay sandbox | Initiate → Webhook → Confirmed |
| Integration: Webhook duplicate | Second webhook → 200 but no re-processing |
| Integration: Payment failure | Inventory released, order PAYMENT_FAILED |
| Integration: Order cancel | Inventory released, order CANCELLED |
| E2E (Playwright): Full COD checkout | Browser-level test on staging |
| Failure: Razorpay timeout | Order not created, graceful 503 |
| Failure: Inventory fails mid-transaction | Transaction rolled back, cart intact |
| Failure: DB down during webhook | Webhook queued for retry, no data loss |

## 15. Performance Requirements

| Metric | Target |
|---|---|
| `POST /orders` (COD) p95 | < 300ms |
| `POST /payments/initiate` p95 | < 500ms (includes Razorpay API call) |
| Cart page load | < 1s |
| Checkout step transition | < 200ms |
| Order confirmation page | < 1s |

## 16. Optimization Validation

- Order transaction uses minimum DB round trips
- Cart totals calculated server-side (not trusted from client)
- Payment idempotency key stored atomically (Redis SET NX)
- No Razorpay API calls in hot path without circuit breaker
- Webhook processing is async (queue it, return 200 immediately)
- `orderMonth` field populated correctly on order creation

## 17. Sprint Validation Gate

```
✅ POST /cart/items (valid MOQ) → 200
✅ POST /cart/items (MOQ violation) → 400 with clear error
✅ POST /orders (COD) → 201, inventory decremented, order CONFIRMED
✅ POST /orders (Razorpay) → 201 + paymentUrl returned
✅ POST /payments/webhook (valid Razorpay signature) → 200, order CONFIRMED
✅ POST /payments/webhook (invalid signature) → 400
✅ POST /payments/webhook (duplicate) → 200 but not re-processed
✅ POST /orders/cancel → inventory released, order CANCELLED
✅ Payment idempotency: same key, second call → same response
✅ OrderStatusHistory entries exist for every status change
✅ EventOutbox receives OrderCreated + OrderConfirmed events
✅ E2E Playwright test: full COD checkout passes on staging
✅ Razorpay sandbox test: payment confirmed via webhook
✅ Cart: MOQ violation visible with red border in UI
✅ Order confirmation page shows VN-XXXXX order number
✅ Production deployment: /health/ready → 200
✅ Test COD order placed in production manually
✅ No secrets in logs (Razorpay keys, webhook secret)
✅ CI green, coverage ≥ 80% for order + payment modules
✅ Rollback verified: previous image redeployable in < 5 min
```

## 18. Definition of Done

All 19 validation gate items passing, including E2E Playwright test and manual production order verification. Checkout path is production-safe and observable.

## 19. Failure Conditions

- Inventory not released when order fails or is cancelled
- Duplicate charge possible (idempotency not working)
- Webhook accepted without HMAC verification
- Order transaction partially committed (partial order without items)
- Production health check fails after deploy

## 20. Rollback Strategy

**Application:** Redeploy previous image. Orders in DB remain. Payments must be manually reconciled via Razorpay dashboard if rollback happens post-payment. Inventory reservations: expiry worker handles any orphaned reservations.
**Production:** Rollback must be executable in < 5 minutes. Test this before Sprint 4 production deploy.

## 21. Production Readiness Gate

**Status: PRODUCTION-READY (first production deployment).**
COD flow is safe for production. Razorpay sandbox → production requires key rotation. Monitoring must be active before deploy.

## 22. Known Risks

| Risk | Mitigation |
|---|---|
| Razorpay webhook delivery delayed | Reconciliation worker polls every 5min |
| Order placed + payment gateway down | COD always available as fallback |
| Inventory release fails after order cancel | Idempotent release + manual reconciliation via InventoryMovement |
| First production deploy causes DB migration error | Run migration separately, verify before app deploy |
| Double order from mobile (network retry) | Idempotency key from cartId + timestamp window |

## 23. AI Execution Guidance

| Task | Guidance |
|---|---|
| Prisma transaction for order creation | Human writes. This is the most critical transaction in the codebase. No AI auto-generation without human review |
| HMAC webhook verification | Human writes. Reference Implementation Architecture document |
| Payment idempotency | Human writes. Redis SET NX must be atomic |
| Razorpay SDK integration | AI can generate standard integration. Human reviews API key handling |
| E2E Playwright test | Human writes. Cart → Checkout → Confirmation flow |
| Production deploy procedure | Human executes. AI can generate checklist |

## 24. Estimated Complexity

| Dimension | Complexity |
|---|---|
| Engineering | Very High (atomic transactions, payment gateway, idempotency, webhooks) |
| Operational | Very High (first production deploy, Razorpay integration) |
| Testing | Very High (E2E, webhook edge cases, concurrency) |

---

---

# SPRINT 5 — BUYER & SELLER DASHBOARDS

## 1. Sprint Identity

| Field | Value |
|---|---|
| Sprint Number | 5 |
| Sprint Name | Buyer & Seller Dashboards |
| Duration | 2 weeks |
| Objective | Both sides of the marketplace are operational. Buyers track orders and reorder. Sellers manage inventory, view orders, and mark dispatch. |
| Philosophy | The marketplace only creates value if both buyer and seller can see and act on their data. This sprint completes the minimum viable loop that makes VyaparNet a functioning commerce platform. |

## 2. Why This Sprint Exists

**Business:** Without seller order management, no seller can fulfill orders. Without buyer order tracking, no buyer knows what happened to their purchase.

**Technical:** Order status transitions require seller-side actions (confirm, mark shipped, upload proof). These must be protected by ownership checks and emit status change events.

**Dependency:** Notifications (Sprint 6) require order status change events. Admin (Sprint 7) requires order oversight capability.

## 3. Scope

### IN Scope
- Buyer orders list (paginated, status-filtered)
- Buyer order detail (items, status timeline, total)
- Buyer 1-tap reorder from past order
- Seller orders dashboard (new, processing, dispatched, completed)
- Seller order detail with action buttons (confirm, mark shipped, mark delivered)
- Seller inventory management (list, update stock, update price)
- Seller KPI dashboard (today's orders, revenue, pending count, low stock)
- Order status transitions: seller confirms → PROCESSING, marks shipped → SHIPPED
- Seller dispatch proof upload (photo/invoice S3 upload linked to order)
- Payment retry flow (if payment failed, buyer can retry within 30 min)
- Seller scorecard (basic — delivery rate, quality complaints, dispatch speed)
- `SupplierScoreUpdated`, `OrderStatusChanged` events → EventOutbox
- Seller portal PWA (Next.js — seller-dashboard app)
- Buyer order tracking page enhancement (timeline)

### OUT of Scope
- Invoicing / PDF generation (Sprint 7)
- Supplier financial settlement (Sprint 7)
- Buyer credit / khata (Phase 3)
- Return / refund workflow (Sprint 8)
- Advanced analytics dashboards (Phase 2)
- Real-time order updates via WebSocket (Phase 2 — polling sufficient)

## 4. Deliverables

| Category | Deliverable |
|---|---|
| Module | `modules/supplier` (SellerModule — seller-specific views), `modules/fulfillment` (partial) |
| APIs | `/seller/orders` (list, detail, update status), `/seller/inventory`, `/seller/dashboard/kpis`, `/seller/dispatch-proof`, `/buyer/orders` (list, detail), `/buyer/orders/:id/reorder` |
| DB | `SupplierScore` model activation, `FieldVisit`/`QualityCheckRecord` (stubs) |
| Events | `OrderStatusChanged`, `SupplierScoreUpdated` → EventOutbox |
| Frontend | Seller: orders dashboard, inventory management, KPI cards. Buyer: orders list, order detail, reorder. |
| Docs | `/contracts/seller.yaml`, `/contracts/buyer-orders.yaml` |

## 5. Dependency Mapping

| Dependency | Required Sprint |
|---|---|
| Orders in DB | Sprint 4 ✅ |
| Inventory model active | Sprint 3 ✅ |
| Product media (dispatch proof upload) | Sprint 2 ✅ |
| RBAC (SELLER, BUYER roles) | Sprint 1 ✅ |
| S3 storage (dispatch proof) | Sprint 2 ✅ |

## 6. Detailed Execution Sequence

```
1. Implement Seller Order APIs
   a. GET /seller/orders → list by sellerId, status filter, pagination
   b. GET /seller/orders/:id → full detail with items + buyer info
   c. PATCH /seller/orders/:id/status
      → SELLER confirms → PROCESSING
      → SELLER marks shipped → SHIPPED (requires trackingNumber)
      → Admin marks delivered → DELIVERED (Sprint 7)
      → Each transition: OrderStatusHistory entry + EventOutbox event
   d. POST /seller/orders/:id/dispatch-proof → S3 upload + link to order

2. Implement Seller Inventory APIs
   a. GET /seller/inventory → all products with stock levels, low-stock first
   b. PATCH /seller/inventory/:productId → update qty, price, threshold
      (calls InventoryService.updateStock)

3. Implement Seller KPI Dashboard
   a. GET /seller/dashboard/kpis →
      { todayOrders, todayRevenue, pendingOrders, lowStockCount }
   b. Queries: filtered by sellerId, today's date range, segment

4. Implement Buyer Order APIs
   a. GET /buyer/orders → list by buyerId, status filter, cursor pagination
   b. GET /buyer/orders/:id → full detail with timeline
   c. POST /buyer/orders/:id/reorder →
      Check stock for all items → add to new cart → return cartId

5. Implement Basic Seller Scorecard
   a. SellerScore: dispatch speed, correct delivery rate, complaint rate
   b. Computed from order data (no real-time — batch calculation)
   c. GET /seller/scorecard → current scores with explanation text (Hinglish)

6. Implement Payment Retry
   a. GET /payments/:id/status → if FAILED, return retryAllowed=true
      (within 30 min of failure)
   b. POST /payments/retry → re-initiate with same orderId + new idempotencyKey

7. Frontend: Seller Dashboard (apps/seller-dashboard)
   a. Login: shared auth with main app (same JWT)
   b. KPI cards: orders today, revenue, pending, low stock
   c. Orders list: status tabs, order cards with action buttons
   d. Order detail: items, buyer address, dispatch proof upload
   e. Inventory: product list, edit stock modal
   f. Scorecard: metric bars + Hinglish explanations

8. Frontend: Buyer Orders (apps/web)
   a. Orders list: status filter tabs, order cards
   b. Order detail: product thumbnails, status timeline, total
   c. Reorder button (from past completed orders)
   d. Payment retry button (from failed payment orders)

9. Write tests
   a. Unit: Seller status transition rules (invalid transitions blocked)
   b. Unit: Buyer reorder — out of stock item handling
   c. Unit: KPI calculation — correct date filtering by sellerId
   d. Integration: PATCH /seller/orders/:id/status → OrderStatusHistory created
   e. Integration: Seller A cannot update Seller B's order → 403
   f. Security: Buyer cannot access seller endpoints → 403
   g: Integration: Payment retry flow (sandbox)

10. Commit OpenAPI specs
11. Update CURRENT_PHASE.md → Sprint 5 complete
```

## 7. Folder / Module Impact

```
apps/api/src/modules/
├── supplier/
│   ├── seller-orders/
│   ├── seller-inventory/
│   ├── seller-dashboard/
│   ├── seller-scorecard/
│   └── tests/
├── order/
│   └── buyer-orders/          ← new sub-module
│       ├── buyer-orders.controller.ts
│       └── buyer-orders.service.ts
apps/
└── seller-dashboard/          ← First real pages (was stub)
```

## 8. Database Impact

| Model | Action |
|---|---|
| `SellerRating` | Activate (stub — data from orders) |
| `OrderStatusHistory` | Additional entries via seller status transitions |
| `EventOutbox` | `OrderStatusChanged` events |
| No new schema changes | All models already in v4.3 |

## 9. API Impact

All new routes under `/seller/*` require JWT + SELLER role.
All new routes under `/buyer/*` require JWT + BUYER role.
Order status transitions: seller can only move forward (PROCESSING → SHIPPED), not backward.
Invalid transitions return `422 Unprocessable` with reason.

## 10. Frontend / UX Impact

**Seller Dashboard (mobile-first):**
- KPI cards top (order-count, revenue, pending, low-stock)
- Orders: tabbed by status, swipe to view actions
- Score: bar charts + narrative ("Delivery mein thodi der ho rahi hai")
- Dispatch proof: camera-first upload (mobile)

**Buyer Orders:**
- Orders list: card-based (not table on mobile)
- Status timeline: visual steps (placed → confirmed → shipped → delivered)
- Reorder: 1-tap, adds all items to new cart
- Payment retry: visible only if payment failed within 30 min

## 11. Runtime / Infra Impact

| Component | Impact |
|---|---|
| EventOutbox | `OrderStatusChanged` events added |
| BullMQ | Notification queue will consume OrderStatusChanged (Sprint 6) |
| Redis | KPI query cache (TTL 1min) |
| S3 | Dispatch proof uploads |

## 12. Security Requirements

| Requirement | Implementation |
|---|---|
| Seller ownership on all mutations | `order.sellerId === seller.businessId` on every PATCH |
| Buyer ownership on all reads | `order.buyerId === buyer.userId` |
| Cross-role isolation | Buyer cannot reach `/seller/*`, seller cannot reach admin |
| Status transition validation | Server-side state machine — client cannot pass arbitrary status |
| Dispatch proof MIME + size validation | Same as product images |
| AuditLog on every order status change | `AuditAction.STATUS_CHANGE` |

## 13. Observability Requirements

| Metric | Implementation |
|---|---|
| `order_status_transitions_total{from,to}` | Counter |
| `seller_dispatch_time_hours` | Histogram (order confirmed → shipped) |
| `buyer_reorder_total` | Counter (key retention metric) |
| `seller_kpi_query_latency_ms` | Histogram |
| Alert: Order stuck in PROCESSING > 48h | WARNING |
| Alert: Seller dispatch > 72h after confirmation | WARNING |

## 14. Testing Requirements

| Test | Requirement |
|---|---|
| Unit: Status machine | Invalid transition (SHIPPED → PLACED) → 422 |
| Unit: Seller ownership | Seller B cannot update Seller A's order |
| Unit: Buyer reorder | Out-of-stock item handled gracefully |
| Integration: Full dispatch flow | Confirm → Ship → Dispatch proof uploaded |
| Integration: Payment retry | Failed → retry → success (sandbox) |
| Security: Cross-role access | Buyer hits seller endpoint → 403 |
| Performance: KPI dashboard | < 200ms on staging with 1K orders |

## 15. Performance Requirements

| Metric | Target |
|---|---|
| `GET /seller/orders` p95 | < 100ms |
| `GET /seller/dashboard/kpis` p95 | < 200ms |
| `GET /buyer/orders` p95 | < 100ms |
| Seller dashboard LCP | < 2.5s |

## 16. Optimization Validation

- KPI queries use indexed `sellerId + createdAt` (idx_order_seller_stat)
- Buyer order list uses indexed `buyerId + status` (idx_order_buyer_stat)
- Cursor pagination used (not OFFSET)
- No N+1 in order list with items (use `include` with limit)

## 17. Sprint Validation Gate

```
✅ GET /seller/orders → correct orders for authenticated seller only
✅ PATCH /seller/orders/:id/status (valid transition) → 200
✅ PATCH /seller/orders/:id/status (invalid transition) → 422
✅ Seller A cannot access Seller B's orders → 403
✅ GET /buyer/orders → correct orders for authenticated buyer only
✅ POST /buyer/orders/:id/reorder → new cart created
✅ Payment retry flow works (sandbox)
✅ OrderStatusHistory entry on every status transition
✅ KPI dashboard loads < 200ms on staging
✅ Dispatch proof upload → S3 link stored in order
✅ Seller scorecard shows meaningful data
✅ CI green, coverage ≥ 80% for new modules
✅ Zero TypeScript errors
✅ Seller dashboard PWA installable (manifest verified)
```

## 18. Definition of Done

All 13 validation gate items passing. Both buyer and seller can complete their end of the transaction lifecycle. Dispatch proof upload working.

## 19. Failure Conditions

- Seller can update orders they don't own
- Invalid order status transitions accepted
- KPI queries return data from other sellers
- Reorder silently skips out-of-stock items

## 20. Rollback Strategy

App: Redeploy previous image. Order status changes in DB remain. No financial impact. OrderStatusHistory preserves complete audit trail.

## 21. Production Readiness Gate

**Status: PRODUCTION-SAFE.** Deploy new seller dashboard and buyer order improvements to production after validation gate passes.

## 22. Known Risks

| Risk | Mitigation |
|---|---|
| Seller dashboard performance with large order volume | KPI query uses indexed columns + Redis cache |
| Dispatch proof upload on slow mobile | Chunked upload, progress indicator, retry on network error |

## 23. AI Execution Guidance

| Task | Guidance |
|---|---|
| Status state machine | Human defines valid transitions. AI can implement guard logic |
| KPI aggregation queries | Human writes SQL. Verify index usage with EXPLAIN ANALYZE |
| Seller scorecard calculation | Human defines formula. AI can implement batch job |

## 24. Estimated Complexity

| Dimension | Complexity |
|---|---|
| Engineering | Medium (data access patterns, ownership checks, state machine) |
| Operational | Low (no new infra) |
| Testing | Medium (ownership security, state transitions) |

---

---

# SPRINT 6 — NOTIFICATIONS

## 1. Sprint Identity

| Field | Value |
|---|---|
| Sprint Number | 6 |
| Sprint Name | Notifications |
| Duration | 2 weeks |
| Objective | Reliable multi-channel notification delivery (SMS + Email + In-App) for all critical order and payment events. Queue-based, idempotent, with preference management. |
| Philosophy | Notifications are the trust fabric of VyaparNet. A buyer must know when their order is confirmed, shipped, and delivered. A seller must know when a new order arrives. Missed notifications destroy trust. But spam destroys the relationship. Balance is everything. |

## 2. Why This Sprint Exists

**Business:** Without notifications, buyers don't know what's happening. Sellers miss new orders. Both relationships deteriorate.

**Technical:** The EventOutbox has been accumulating events since Sprint 2. This sprint activates the notification consumer that processes those events. All notification logic is async — no blocking the checkout path.

**Dependency:** Notification delivery depends on: Order events (Sprint 4), Status change events (Sprint 5). Admin moderation (Sprint 7) sends approval/rejection notifications.

## 3. Scope

### IN Scope
- `notifications` queue activation (BullMQ)
- `NotificationWorker` (processes EventOutbox notifications)
- SMS delivery (MSG91/Twilio — order status, OTP is already done)
- Email delivery (SMTP via Resend/SES — order confirmation)
- In-app notifications (DB-stored, real-time polling)
- Push notifications (PWA via Web Push API — basic)
- Notification templates (per language: Hindi + English, per event type)
- Notification preferences (buyer/seller settings)
- Notification deduplication (idempotency — no duplicate sends)
- Notification merge (same event → single SMS, not 10)
- `GET /notifications` (unread list, with pagination)
- `PATCH /notifications/:id/read`
- `GET /notifications/preferences`
- `PUT /notifications/preferences`
- Notification bell in buyer + seller UI (badge count, panel)
- Low-stock seller notifications (activated from Sprint 3)
- Order status notifications (buyer: confirmed, shipped, delivered)
- New order notifications (seller: new order received)
- Payment notifications (buyer: success, failure)

### OUT of Scope
- WhatsApp Business API (Phase 2)
- Complex notification segmentation (Phase 2)
- Push notification analytics (Phase 2)
- Email newsletters/marketing (Phase 2)
- In-app chat (Phase 3)

## 4. Deliverables

| Category | Deliverable |
|---|---|
| Module | `modules/notification` (NotificationModule, NotificationWorker) |
| APIs | `/notifications`, `/notifications/:id/read`, `/notifications/preferences` |
| DB | `Notification`, `NotificationTemplate` models activated |
| BullMQ | `notifications` queue activated, `NotificationWorker` |
| Channels | SMS (MSG91/Twilio), Email (Resend/SES), In-App (DB), Push (Web Push) |
| Templates | `OrderCreated_hi`, `OrderCreated_en`, `OrderShipped_hi`, `PaymentFailed_hi`, etc. |
| Events | Consumes from EventOutbox: `OrderCreated`, `OrderConfirmed`, `OrderStatusChanged`, `PaymentReceived`, `PaymentFailed`, `StockLow` |
| Frontend | Notification bell with badge, notification panel, preferences screen |

## 5. Dependency Mapping

| Dependency | Required Sprint |
|---|---|
| EventOutbox active with events | Sprint 2-5 ✅ |
| `notifications` queue registered | Sprint 0 ✅ |
| User preferences (language) in `User` model | Sprint 1 ✅ |
| MSG91/Twilio already integrated (OTP) | Sprint 1 ✅ |
| Email provider account (Resend/SES) | Must be provisioned |

## 6. Detailed Execution Sequence

```
1. Create NotificationTemplates (seed data)
   a. Per event type × per language (hi/en)
   b. Variables: {{buyerName}}, {{orderNumber}}, {{productName}}, {{amount}}
   c. Store in DB: NotificationTemplate table
   d. Hinglish templates reviewed for natural language

2. Implement NotificationService
   a. send(userId, eventType, payload) →
      i.   Get user preferences (channel preferences)
      ii.  Get template for eventType + language
      iii. Render template with payload variables
      iv.  For each enabled channel: enqueue job to 'notifications' queue
      v.   Create Notification record in DB (in-app)
   b. markRead(notificationId, userId)
   c. getUnread(userId) → paginated, unread-first

3. Implement NotificationWorker (BullMQ)
   a. Processes jobs from 'notifications' queue
   b. Per channel type:
      - SMS: call SmsService (shared from Sprint 1)
      - Email: call EmailService (new — Resend/SES)
      - Push: call WebPushService (new — web-push library)
      - InApp: already created in DB by NotificationService.send()
   c. Idempotency: check notification status before sending
      (prevent duplicate if worker retried)
   d. Max retries: 3, linear backoff (5s, 10s, 20s)
   e. On failure: DLQ, alert

4. Implement EventOutbox Consumer
   a. Polling worker: every 5s, fetch PENDING events
   b. Route to NotificationService based on eventType
   c. Mark event COMPLETED after notification enqueued
   d. Handle: OrderCreated, OrderConfirmed, OrderStatusChanged,
      PaymentReceived, PaymentFailed, StockLow

5. Implement Notification Deduplication
   a. Before sending: check if same userId + eventType + orderId
      already sent in last 5 minutes
   b. Use Redis key: notif:{userId}:{eventType}:{entityId} TTL=300s
   c. If exists: skip (deduplicate)

6. Implement Notification Preferences
   a. NotificationPreference table (or JSONB on User — use JSONB)
   b. GET /notifications/preferences → current settings
   c. PUT /notifications/preferences → update
   d. Defaults: SMS=true, Email=true, Push=true, InApp=true

7. Email Service (Resend/SES)
   a. EmailService interface (send, status)
   b. ResendEmailService implements EmailService
   c. Simple HTML templates (VyaparNet branded, Hinglish subject lines)
   d. Transaction emails only (no marketing in MVP)

8. Web Push Service
   a. Integrate `web-push` library
   b. VAPID keys (stored in env vars)
   c. PushSubscription storage (in User model or separate table)
   d. Send on order events (basic)

9. Frontend: Notification Bell (buyer + seller PWA)
   a. Bell icon in header with unread count badge
   b. Notification panel (slide-down): list of recent notifications
   c. Mark all as read button
   d. Tap notification → navigate to relevant order

10. Frontend: Notification Preferences Screen
    a. Toggle per channel (SMS, Email, Push, In-App)
    b. Toggle per event type (order updates, promotions — promotions OFF by default)

11. Write tests
    a. Unit: Template rendering with variables
    b. Unit: Deduplication logic
    c. Unit: Preference filtering
    d. Integration: EventOutbox event → notification delivered
    e. Integration: Duplicate event → single notification sent
    f. Integration: Preference disabled → notification not sent for that channel
    g. Failure: SMS provider down → notification marked FAILED, DLQ
    h. Failure: Email provider down → retry 3 times, then DLQ

12. Commit OpenAPI specs: /contracts/notifications.yaml
13. Update CURRENT_PHASE.md → Sprint 6 complete
```

## 7. Folder / Module Impact

```
apps/api/src/modules/
└── notification/
    ├── notification.module.ts
    ├── notification.controller.ts
    ├── notification.service.ts
    ├── notification.repository.ts
    ├── template.service.ts
    ├── dedup.service.ts
    ├── channels/
    │   ├── sms.service.ts         (reuse from Sprint 1)
    │   ├── email.service.ts       (new — Resend/SES)
    │   └── web-push.service.ts    (new)
    ├── workers/
    │   ├── notification.worker.ts
    │   └── outbox-consumer.worker.ts
    └── tests/
```

## 8. Database Impact

| Model | Action |
|---|---|
| `Notification` | Activate — with `notificationMonth` partition key |
| `NotificationTemplate` | Activate + seed (all event templates) |
| No structural schema changes | All models already in v4.3 |

**Required indexes:**
```
idx_notif_user_read_date — Tier 1 (unread count + list)
```

## 9. API Impact

| Route | Method | Auth | Role |
|---|---|---|---|
| `/api/v1/notifications` | GET | JWT | Any |
| `/api/v1/notifications/:id/read` | PATCH | JWT | Any (own) |
| `/api/v1/notifications/preferences` | GET | JWT | Any |
| `/api/v1/notifications/preferences` | PUT | JWT | Any |

## 10. Frontend / UX Impact

**Notification Bell:**
- Badge: unread count (red pill)
- Panel: last 20 notifications, infinite scroll
- "Koi notification nahi" empty state with bell illustration
- Mark all read (single tap)

**Preferences Screen:**
- Toggle buttons (not checkboxes — larger touch targets)
- Hinglish labels: "Order updates milenge?" "Promotional offers?"
- Default: all ON except promotions

**Fatigue Prevention:**
- Maximum 1 SMS per order status change (not per event)
- Promotional notifications disabled by default
- Merge duplicate events in 5-minute window (deduplication)

## 11. Runtime / Infra Impact

| Component | Impact |
|---|---|
| BullMQ | `notifications` queue high-traffic. Monitor queue depth |
| Redis | Deduplication keys (TTL 300s) |
| Email provider | Resend/SES account provisioned, domain verified |
| Web Push | VAPID keys generated, stored in env vars |
| EventOutbox | Polling worker now actively consuming events |

## 12. Security Requirements

| Requirement | Implementation |
|---|---|
| No PII in notification logs | Mask email, phone in logs |
| User owns notification | `notification.userId === req.user.id` on read/delete |
| Push subscription scoped to user | Cannot subscribe for another user |
| Template injection prevention | Variables are sanitized before rendering |
| Email from verified domain | SPF/DKIM configured for sending domain |
| No marketing without opt-in | Promotional channel OFF by default |

## 13. Observability Requirements

| Metric | Implementation |
|---|---|
| `notification_sent_total{channel}` | Counter by SMS/Email/Push/InApp |
| `notification_failed_total{channel,reason}` | Counter |
| `notification_delivery_latency_ms` | Histogram |
| `notification_dedup_total` | Counter (how many duplicates prevented) |
| `notification_queue_depth` | Gauge |
| Alert: notification queue depth > 5K | WARNING |
| Alert: SMS failure rate > 10% | WARNING |

## 14. Testing Requirements

| Test | Requirement |
|---|---|
| Unit: Template rendering | Variable substitution correct |
| Unit: Deduplication | Second identical event in 5min → no send |
| Unit: Preference filter | Channel disabled → not enqueued |
| Integration: OrderCreated event → SMS + Email sent | End-to-end via EventOutbox |
| Integration: Duplicate OrderCreated → single notification | Dedup working |
| Integration: Preference=smsDisabled → no SMS, email sent | Preference respected |
| Failure: SMS provider down | Retry 3x, then DLQ, InApp still delivered |
| Failure: Email provider down | Retry 3x, then DLQ, SMS still delivered |
| Failure: EventOutbox event corrupt | Skip + log + alert, do not crash worker |

## 15. Performance Requirements

| Metric | Target |
|---|---|
| EventOutbox → notification enqueued | < 5s |
| SMS delivery | < 10s (provider-dependent) |
| Email delivery | < 30s |
| In-app notification visible after event | < 10s |
| `GET /notifications` p95 | < 50ms |

## 16. Optimization Validation

- EventOutbox consumer processes in batches (100 events per poll)
- SMS deduplicated (Redis TTL check before each send)
- Notification query uses idx_notif_user_read_date (EXPLAIN ANALYZE)
- Email templates are pre-compiled (not re-parsed per send)
- VAPID keys cached in-process (not fetched from Redis per request)

## 17. Sprint Validation Gate

```
✅ Place test order → SMS received on buyer phone within 10s
✅ Order confirmed → seller receives new order notification
✅ Order shipped → buyer receives shipment notification
✅ Payment failed → buyer receives failure notification
✅ Low stock → seller receives alert
✅ Duplicate event in 5min → single notification only
✅ Notification preference: SMS OFF → no SMS for next order event
✅ GET /notifications → unread list correct for authenticated user
✅ PATCH /notifications/:id/read → notification marked read
✅ Notification bell badge count correct in UI
✅ EventOutbox events marked COMPLETED after processing
✅ DLQ receives failed notifications after 3 retries
✅ Notification queue depth monitored in Grafana
✅ CI green, coverage ≥ 80% for notification module
✅ No PII in notification logs (verified with log grep)
```

## 18. Definition of Done

All 15 validation gate items passing. SMS delivery verified manually. Deduplication confirmed. DLQ alerts active.

## 19. Failure Conditions

- Duplicate notifications sent for same event
- Notifications delivered after seller/buyer turns off preference
- EventOutbox events processed but notification not created
- SMS provider failure crashes the worker (must be caught, not propagate)

## 20. Rollback Strategy

App: Redeploy previous image. EventOutbox events with PENDING status will be re-processed. Deduplication prevents re-sending already-sent notifications. No financial impact.

## 21. Production Readiness Gate

**Status: PRODUCTION-SAFE.** Deploy notification system to production after gate passes.

## 22. Known Risks

| Risk | Mitigation |
|---|---|
| SMS provider throttling | Respect rate limits, queue with backoff |
| Email going to spam | Proper SPF/DKIM, avoid spam triggers in subject lines |
| Push subscription stale | Handle 410 Gone from push provider gracefully |
| EventOutbox growing unbounded | Retention policy: COMPLETED events archived after 30 days |

## 23. AI Execution Guidance

| Task | Guidance |
|---|---|
| Notification templates (Hinglish) | Human writes. Natural language, not literal translation |
| Deduplication logic | Human reviews: Redis key construction must be deterministic |
| EventOutbox consumer routing | Human maps eventType → notification handler |
| Email HTML templates | AI can generate. Human reviews mobile rendering |

## 24. Estimated Complexity

| Dimension | Complexity |
|---|---|
| Engineering | Medium (queue workers, multi-channel, deduplication) |
| Operational | Medium (email domain setup, push VAPID keys) |
| Testing | Medium (async delivery, channel failure scenarios) |

---

---

# SPRINT 7 — ADMIN SYSTEM & PLATFORM GOVERNANCE

## 1. Sprint Identity

| Field | Value |
|---|---|
| Sprint Number | 7 |
| Sprint Name | Admin System & Platform Governance |
| Duration | 2 weeks |
| Objective | Admin can moderate products, verify businesses, manage users, view all orders, generate invoices, and process seller payouts. Platform is governable and auditable. |
| Philosophy | A marketplace without governance becomes a fraud marketplace. Admin tools are not nice-to-have — they are the control layer that makes VyaparNet trustworthy. Every admin action is audited. No admin action is irreversible. |

## 2. Why This Sprint Exists

**Business:** Products need approval before going live. Sellers need verification. Disputes need resolution. Without admin tools, the platform cannot maintain quality.

**Technical:** Admin dashboard requires aggregated data across buyers, sellers, orders, and inventory. Invoicing requires tax calculation and PDF generation. Seller payout requires settlement logic.

**Dependency:** RFQ (Sprint 8) requires admin dispute visibility. Hardening (Sprint 9) requires admin observability tools.

## 3. Scope

### IN Scope
- Admin product approval queue (approve/reject with reason)
- Admin business verification (GST/PAN/docs review)
- Admin user management (view, suspend, activate)
- Admin order overview (all orders, all segments, advanced filters)
- Admin support ticket system (view, reply, resolve, escalate)
- Tax invoice generation (GST-compliant PDF)
- `TaxInvoice` model activation
- `PlatformCommission` calculation
- Seller payout calculation (basic — `SellerPayout` model)
- Admin segment management (enable/disable features per segment)
- Feature flag management (admin toggles via dashboard)
- Audit log viewer (timeline per entity)
- Exception center (stuck orders, failed payments, disputes)
- Admin notifications for: new business verification pending, new dispute, stuck order
- Admin dashboard (apps/admin full activation)
- KYC document verification workflow
- `KycDocument` model activation
- Product catalog admin bulk actions (approve/reject multiple)

### OUT of Scope
- Advanced financial reconciliation (Phase 2)
- Automated payout disbursement to bank (Phase 2 — manual trigger only in MVP)
- Complex dispute resolution workflow (Sprint 8)
- Return workflow (Sprint 8)
- Advanced fraud detection (Phase 2)
- Supplier self-service onboarding (Phase 2)

## 4. Deliverables

| Category | Deliverable |
|---|---|
| Module | `modules/audit` (activation), `modules/platform-security` (KYC), `modules/payment` (SellerPayout) |
| APIs | `/admin/products/*`, `/admin/businesses/*`, `/admin/users/*`, `/admin/orders/*`, `/admin/tickets/*`, `/admin/payouts/*`, `/admin/invoices/*`, `/admin/flags`, `/admin/audit-logs`, `/admin/exceptions` |
| DB | `TaxInvoice`, `PlatformCommission`, `SellerPayout`, `KycDocument` models activated |
| PDF | Tax invoice PDF generation (puppeteer or pdf-lib) |
| Events | `ProductApproved`, `ProductRejected`, `BusinessVerified` → EventOutbox |
| Frontend | Full admin dashboard (apps/admin) |
| Docs | `/contracts/admin.yaml` |

## 5. Dependency Mapping

| Dependency | Required Sprint |
|---|---|
| All domain models active | Sprints 1-6 ✅ |
| AuditLog infrastructure | Sprint 1 ✅ |
| EventOutbox active | Sprint 2 ✅ |
| Order + Payment data | Sprint 4 ✅ |
| S3 for KYC documents | Sprint 2 ✅ |

## 6. Detailed Execution Sequence

```
1. Implement Admin Product Approval
   a. GET /admin/products?status=PENDING_APPROVAL → paginated queue
   b. PATCH /admin/products/:id/approve → status=ACTIVE, emit ProductApproved
   c. PATCH /admin/products/:id/reject → status=REJECTED + reason, emit ProductRejected
   d. Bulk action: POST /admin/products/bulk-approve (array of IDs)
   e. Product notification sent to seller on decision

2. Implement Business Verification
   a. GET /admin/businesses?status=PENDING → verification queue
   b. GET /admin/businesses/:id → full detail with KYC docs + signed URLs
   c. PATCH /admin/businesses/:id/verify → kycStatus=VERIFIED + notify
   d. PATCH /admin/businesses/:id/reject → kycStatus=REJECTED + reason + notify

3. Implement User Management
   a. GET /admin/users → list with role, status, segment filter
   b. GET /admin/users/:id → full profile + order history + business
   c. PATCH /admin/users/:id/suspend → isActive=false, revoke all sessions
   d. PATCH /admin/users/:id/activate → isActive=true

4. Implement Admin Order Overview
   a. GET /admin/orders → all orders across all sellers, advanced filters
      (segment, status, dateRange, buyerId, sellerId)
   b. GET /admin/orders/:id → full detail
   c. PATCH /admin/orders/:id/status → admin override (any transition)
   d. Exception center: GET /admin/orders/exceptions →
      { stuckOrders, failedPayments, openDisputes }

5. Implement Invoice Generation
   a. TaxInvoiceService:
      - generateInvoice(orderId) → calculate taxes, generate PDF
      - GST breakdown: CGST + SGST (intra-state) or IGST (inter-state)
      - HSN codes from OrderItems
      - Upload PDF to S3
      - Create TaxInvoice record
   b. GET /admin/invoices/:id → metadata + signed PDF URL
   c. Buyer: GET /buyer/orders/:id/invoice → signed PDF URL
   d. PDF generation: use `pdf-lib` or `puppeteer` (define in DDR)

6. Implement Seller Payout Calculation
   a. SellerPayoutService:
      - calculatePayout(orderId) → gross - platformFee - gateway fee - TDS
      - Create SellerPayout record (status: PENDING)
   b. GET /admin/payouts → list PENDING payouts
   c. PATCH /admin/payouts/:id/initiate → status=INITIATED (manual in MVP)
   d. PlatformCommission record created per order

7. Implement Feature Flag Management
   a. GET /admin/flags → all feature flags with current status
   b. PATCH /admin/flags/:name → toggle enabled/disabled per environment
   c. Cache invalidation: Redis feature flag cache cleared on toggle

8. Implement Audit Log Viewer
   a. GET /admin/audit-logs → filter by entityType, entityId, actorId, dateRange
   b. GET /admin/audit-logs/timeline/:entityType/:id → chronological timeline
   c. Read-only (immutable — no edit/delete)

9. Implement Exception Center
   a. GET /admin/exceptions →
      { stuckOrders (>24h in PROCESSING),
        failedPayments (unreconciled),
        suspendedSellers,
        openDisputes }
   b. Manual resolution actions per exception type

10. Implement Support Ticket System
    a. GET /admin/tickets → all tickets (priority sort)
    b. GET /admin/tickets/:id → full thread
    c. POST /admin/tickets/:id/reply → agent reply
    d. PATCH /admin/tickets/:id/resolve
    e. PATCH /admin/tickets/:id/escalate

11. Frontend: Admin Dashboard (apps/admin full activation)
    a. Overview: KPI widgets, exception alerts
    b. Products: approval queue, search, bulk actions
    c. Businesses: verification queue, doc viewer (signed URLs)
    d. Users: list, profile, suspend/activate
    e. Orders: advanced filter table, exception center
    f. Finance: payout list, invoice viewer
    g. Flags: feature flag toggles
    h. Audit: entity timeline viewer
    i. Tickets: support queue

12. Write tests
    a. Unit: Commission calculation (various scenarios)
    b. Unit: Invoice GST calculation (CGST+SGST vs IGST)
    c. Integration: Product approve → seller notification sent
    d. Integration: User suspend → all sessions revoked
    e. Integration: Feature flag toggle → Redis cache cleared
    f. Security: Admin endpoints require ADMIN role → 403 for SELLER
    g: Integration: Audit log immutable (no UPDATE/DELETE possible via API)

13. Commit OpenAPI spec: /contracts/admin.yaml
14. Update CURRENT_PHASE.md → Sprint 7 complete
```

## 7. Folder / Module Impact

```
apps/api/src/modules/
├── audit/                    ← First real activation
│   ├── audit.module.ts
│   ├── audit.controller.ts
│   └── audit.repository.ts
├── payment/
│   └── payout/               ← New sub-module
│       ├── payout.service.ts
│       └── commission.service.ts
├── platform-security/        ← KYC verification logic
│   └── kyc.service.ts
apps/
└── admin/                    ← Full activation (was stub)
    ├── products/
    ├── businesses/
    ├── users/
    ├── orders/
    ├── finance/
    ├── flags/
    ├── audit/
    └── tickets/
```

## 8. Database Impact

| Model | Action |
|---|---|
| `TaxInvoice` | Activate |
| `PlatformCommission` | Activate |
| `SellerPayout` | Activate |
| `KycDocument` | Activate |
| `AuditLog` | Full activation (all admin actions log here) |
| No structural schema changes | All in v4.3 |

**AuditLog rule:** Every admin action MUST create an AuditLog entry. No exceptions. `actorId = adminUserId`, `entityType + entityId + oldValue + newValue`.

## 9. API Impact

All `/admin/*` routes require JWT + ADMIN role. Any other role → 403.
Admin status override endpoints require `Idempotency-Key` header.
Audit log endpoints are READ-ONLY (no mutation routes).

## 10. Frontend / UX Impact

**Admin Dashboard (desktop-optimized, also responsive):**
- Dense data tables (56px rows, sortable, filterable)
- Bulk action bar on selection
- Exception alerts: red badges on nav items
- Audit timeline: expandable rows per entity
- PDF invoice viewer: inline iframe + download

## 11. Runtime / Infra Impact

| Component | Impact |
|---|---|
| PDF generation | `pdf-lib` runs in API process. If heavy: queue to BullMQ worker |
| S3 | KYC documents stored (restricted bucket, signed URLs only) |
| Redis | Feature flag cache invalidation on admin toggle |
| EventOutbox | ProductApproved/Rejected events |

## 12. Security Requirements

| Requirement | Implementation |
|---|---|
| All admin endpoints: ADMIN role ONLY | RolesGuard enforced globally |
| KYC documents: private S3 bucket | Signed URLs (expire 5 min), never public URLs |
| Audit log immutability | No UPDATE/DELETE in AuditRepository |
| User suspension: session revocation | Revoke ALL Redis sessions for that user |
| Feature flag toggle: logged | AuditLog entry on every toggle |
| Invoice PDFs: private S3 | Buyer gets signed URL (5 min expiry), not permanent URL |
| Admin actions: always create AuditLog | Enforced by code pattern, reviewed in PR |

## 13. Observability Requirements

| Metric | Implementation |
|---|---|
| `admin_product_approved_total` | Counter |
| `admin_product_rejected_total` | Counter |
| `admin_user_suspended_total` | Counter |
| `admin_payout_initiated_total` | Counter + amount |
| `exception_center_stuck_orders` | Gauge (update every 5min) |
| `admin_dashboard_load_time_ms` | Histogram |
| Alert: exception_center_stuck_orders > 5 | WARNING |
| Alert: payout failure | WARNING |

## 14. Testing Requirements

| Test | Requirement |
|---|---|
| Unit: Commission calculation | Multiple product types, GST scenarios |
| Unit: Invoice tax calculation | Intra-state (CGST+SGST), inter-state (IGST) |
| Integration: Approve product | Status changes, notification sent, AuditLog created |
| Integration: Suspend user | Sessions revoked, login fails |
| Integration: Feature flag toggle | Redis cache cleared, new value returned |
| Security: SELLER hits /admin/* | 403 |
| Security: ADMIN accesses audit logs | 200, read-only |
| Integration: AuditLog | No UPDATE/DELETE endpoints exist at all |

## 15. Performance Requirements

| Metric | Target |
|---|---|
| Admin order list (all segments) p95 | < 500ms |
| Exception center query | < 200ms |
| Invoice PDF generation | < 3s |
| Admin dashboard initial load | < 3s |

## 16. Optimization Validation

- Admin order list uses composite index (segment + status + createdAt)
- Audit log viewer uses (entityType + entityId + createdAt) index
- Feature flag reads from Redis (not DB on every request)
- Invoice PDF generation: queue to BullMQ if > 2s

## 17. Sprint Validation Gate

```
✅ Admin: approve product → status=ACTIVE, seller notified
✅ Admin: reject product → status=REJECTED + reason, seller notified
✅ Admin: suspend user → all sessions revoked, login fails
✅ Admin: toggle feature flag → change reflected immediately in API
✅ Admin: view audit logs → immutable, all actions visible
✅ Exception center shows stuck orders (test with manual stuck order)
✅ Invoice PDF generated → accessible via signed URL
✅ SellerPayout record created after order completion
✅ SELLER role hits /admin/products → 403
✅ AuditLog: every admin action creates entry
✅ KYC document accessible via signed URL, not public URL
✅ CI green, coverage ≥ 80% for admin module
✅ No TypeScript errors
✅ Admin dashboard loads on staging < 3s
```

## 18. Definition of Done

All 14 validation gate items passing. AuditLog immutability verified. Admin role isolation confirmed. Invoice PDF generation working.

## 19. Failure Conditions

- Admin can access endpoints without ADMIN role
- AuditLog can be modified or deleted via any API
- KYC documents accessible without signed URL (public S3)
- Feature flag toggle not clearing Redis cache
- Invoice calculation wrong (tax error)

## 20. Rollback Strategy

App: Redeploy previous image. All admin actions in AuditLog remain. Payout records and invoice records persist. No financial reversals needed (payouts are manual initiation only in MVP).

## 21. Production Readiness Gate

**Status: PRODUCTION-SAFE.** Admin dashboard is not public-facing. Deploy to production with ADMIN role restriction verified.

## 22. Known Risks

| Risk | Mitigation |
|---|---|
| PDF generation memory spike | Queue to BullMQ worker with memory limit |
| KYC document bucket misconfigured as public | S3 bucket policy reviewed and locked |
| Admin session hijacking | Short JWT expiry (15min) + device binding |
| AuditLog growing very large | Partition by `auditMonth`, archive policy active |

## 23. AI Execution Guidance

| Task | Guidance |
|---|---|
| Invoice GST calculation | Human writes. Tax rules are legally significant |
| AuditLog repository | Human writes. Must have no mutation methods at all |
| Commission calculation | Human defines formula. AI can implement |
| PDF generation | AI can generate template. Human reviews legal fields |
| Feature flag cache invalidation | Human reviews Redis key patterns |

## 24. Estimated Complexity

| Dimension | Complexity |
|---|---|
| Engineering | High (invoice PDF, GST calculation, payout logic) |
| Operational | Medium (KYC document storage, PDF infrastructure) |
| Testing | High (tax accuracy, security isolation, immutability) |

---

---

# SPRINT 8 — RFQ, RETURNS & DISPUTE RESOLUTION

## 1. Sprint Identity

| Field | Value |
|---|---|
| Sprint Number | 8 |
| Sprint Name | RFQ, Returns & Dispute Resolution |
| Duration | 2 weeks |
| Objective | B2B differentiation features: buyer creates RFQs, sellers respond with quotes, buyer compares and converts to order. Return and dispute workflows for completed orders. |
| Philosophy | B2B commerce without RFQ is retail. Returns and disputes without workflow are chaos. This sprint makes VyaparNet a real B2B platform that can handle the messy reality of commerce. Every exception has an owner. Every dispute has an audit trail. |

## 2. Why This Sprint Exists

**Business:** RFQ is the primary B2B buying behavior — buyers don't always know the price upfront. Returns and disputes are inevitable in commerce; without workflow, they become relationship-destroying chaos.

**Technical:** `Quotation`, `ReturnRequest`, `Dispute` models have been in the schema since v4.3. This sprint activates them with proper state machines, ownership, and audit trails.

**Dependency:** Sprint 9 (hardening) needs all modules active to load-test the full system.

## 3. Scope

### IN Scope
- RFQ creation (buyer selects products + qty + delivery date)
- RFQ seller response (quote submission with price + terms + validity)
- Quote comparison (buyer side — side-by-side view)
- Quote acceptance → order conversion
- Quote expiry (auto-expire after validUntil)
- Price negotiation (back-and-forth counter-offers)
- Procurement templates (save recurring order lists)
- Saved procurement list management
- Return request workflow (buyer raises issue, evidence upload)
- Return QC verification (admin/operator) → approve/reject
- Refund initiation (approved return → credit note or refund)
- Dispute creation (buyer disputes order)
- Dispute resolution (admin resolves with documented outcome)
- `DisputeOpened`, `ReturnInitiated`, `ReturnApproved`, `ReturnRejected`, `QuoteCreated`, `QuoteAccepted` → EventOutbox
- Buyer: RFQ creation + quote comparison screen
- Buyer: Return request screen + issue reporting
- Seller: Quote response screen
- Admin: Dispute resolution view

### OUT of Scope
- Complex approval chains for RFQ (Phase 2)
- Budget management per buyer (Phase 2)
- Purchase order (PO) generation (Phase 2)
- Automated refund disbursement (Phase 2 — manual trigger)
- Reverse logistics coordination (Phase 2)
- Advanced dispute mediation (Phase 2)

## 4. Deliverables

| Category | Deliverable |
|---|---|
| Module | `modules/procurement` (RFQ/QuotationModule), `modules/trust-safety` (ReturnModule, DisputeModule) |
| APIs | `/rfq` CRUD, `/rfq/:id/quotes`, `/rfq/:id/accept`, `/quotations`, `/returns`, `/returns/:id`, `/disputes`, `/disputes/:id` |
| DB | `Quotation`, `QuotationItem`, `PriceNegotiation`, `ReturnRequest`, `Dispute` models activated |
| BullMQ | Quote expiry worker, return SLA alert worker |
| Events | All RFQ + return + dispute events → EventOutbox |
| Frontend | Buyer: RFQ, quote comparison, return request. Seller: quote response. Admin: dispute view. |
| Docs | `/contracts/rfq.yaml`, `/contracts/returns.yaml`, `/contracts/disputes.yaml` |

## 5. Dependency Mapping

| Dependency | Required Sprint |
|---|---|
| Orders in DB | Sprint 4 ✅ |
| Products + Inventory | Sprints 2-3 ✅ |
| Admin system | Sprint 7 ✅ |
| Auth + RBAC | Sprint 1 ✅ |
| Notification system | Sprint 6 ✅ |
| S3 (evidence uploads) | Sprint 2 ✅ |

## 6. Detailed Execution Sequence

```
1. Implement QuotationModule (RFQ)
   a. QuotationRepository: CRUD with buyer/seller ownership
   b. QuotationService:
      - createRFQ(dto, buyer) → Quotation (status: DRAFT)
      - submitRFQ(id, buyer) → status: SENT, notify matching sellers
      - submitQuote(rfqId, dto, seller) → QuotationItem records
      - negotiatePrice(rfqId, dto, actor) → PriceNegotiation record
      - acceptQuote(rfqId, seller, buyer) → status: ACCEPTED_BY_BUYER
      - convertToOrder(rfqId, buyer) → call OrderService.createOrder()
      - expireQuote(rfqId) → status: EXPIRED (via BullMQ cron)
   c. QuotationController: REST routes

2. Implement ProcurementTemplateService
   a. saveTemplate(name, cartId, userId) → save current cart items as template
   b. listTemplates(userId) → user's saved templates
   c. loadTemplate(templateId, userId) → add all items to new cart

3. Implement ReturnModule
   a. ReturnRepository: CRUD with buyer ownership
   b. ReturnService:
      - createReturn(orderId, dto, buyer) → ReturnRequest (status: PENDING)
        - Validates: within return window (configurable per segment)
        - Validates: order is COMPLETED
      - uploadEvidence(returnId, files) → S3 upload, link to return
      - approveReturn(returnId, adminId) → status: APPROVED_FOR_PICKUP
      - rejectReturn(returnId, adminId, reason) → status: QC_REJECTED
      - initiateRefund(returnId) → Refund stub (full impl Phase 2)
   c. Return SLA alert: if return unresponded > 48h → alert admin

4. Implement DisputeModule
   a. DisputeRepository: CRUD
   b. DisputeService:
      - createDispute(orderId, dto, buyer)
      - escalateDispute(disputeId, adminId)
      - resolveDispute(disputeId, adminId, resolution)
      - closeDispute(disputeId)
   c. SLA tracking: slaBreachedAt if unresolved > 72h

5. Implement Quote Expiry Worker (BullMQ)
   a. Cron: every 30 minutes
   b. Find quotations where validUntil < now() AND status ∉ [EXPIRED, CONVERTED_TO_ORDER]
   c. Update status → EXPIRED
   d. Notify buyer + seller

6. Frontend: Buyer RFQ Creation (Next.js)
   a. Select products + quantities
   b. Specify delivery date + special instructions
   c. Submit → "Aapka RFQ bhej diya gaya. Sellers respond karenge."
   d. RFQ list with status badges

7. Frontend: Quote Comparison (Next.js)
   a. Side-by-side table: seller name, price, delivery time, score
   b. Select winner → confirm → order conversion
   c. Counter-offer option

8. Frontend: Buyer Return Request (Next.js)
   a. Select order → select items → select reason
   b. Description + photo upload
   c. "Return request dakhil ho gaya. 48 ghante mein review hoga."

9. Frontend: Seller Quote Response (Next.js, seller-dashboard)
   a. RFQ notification → view requirements
   b. Submit quote form (price, delivery, terms, validity)
   c. Counter-offer on negotiation

10. Frontend: Admin Dispute Resolution (apps/admin)
    a. Dispute list with priority
    b. Full context: order, buyer, seller, evidence
    c. Resolution form: reject/replace/refund/credit-note
    d. SLA breach warning badges

11. Write tests
    a. Unit: Return window validation (outside window → reject)
    b. Unit: Quote expiry logic
    c. Unit: Dispute SLA breach calculation
    d. Integration: Full RFQ lifecycle (create → quote → accept → order)
    e. Integration: Return → approve → refund initiated
    f. Integration: Dispute → resolve → closed
    g. Security: Seller cannot see other seller's quotes on same RFQ
    h. Security: Buyer cannot resolve disputes (admin only)

12. Commit OpenAPI specs
13. Update CURRENT_PHASE.md → Sprint 8 complete
```

## 7. Folder / Module Impact

```
apps/api/src/modules/
├── procurement/
│   ├── rfq/
│   │   ├── rfq.module.ts
│   │   ├── rfq.controller.ts
│   │   ├── rfq.service.ts
│   │   └── rfq.repository.ts
│   └── templates/
│       └── template.service.ts
├── trust-safety/
│   ├── returns/
│   │   ├── returns.module.ts
│   │   ├── returns.service.ts
│   │   └── returns.repository.ts
│   └── disputes/
│       ├── disputes.module.ts
│       ├── disputes.service.ts
│       └── disputes.repository.ts
```

## 8. Database Impact

| Model | Action |
|---|---|
| `Quotation` | Activate + `quoteMonth` partition key |
| `QuotationItem` | Activate |
| `PriceNegotiation` | Activate |
| `ReturnRequest` | Activate + `slaBreachedAt` tracking |
| `Dispute` | Activate + `slaBreachedAt` tracking |
| No structural schema changes | All in v4.3 |

**Return window configuration:** Stored in `AppConfig` table (configurable per segment by admin):
```
TEXTILE_RETURN_WINDOW_HOURS = 72
SPARE_PARTS_RETURN_WINDOW_HOURS = 48
```

## 9. API Impact

| Route | Auth | Role |
|---|---|---|
| `/api/v1/rfq` (POST/GET) | JWT | BUYER |
| `/api/v1/rfq/:id/quotes` (POST) | JWT | SELLER |
| `/api/v1/rfq/:id/accept` (POST) | JWT | BUYER |
| `/api/v1/returns` (POST) | JWT | BUYER |
| `/api/v1/returns/:id` (PATCH) | JWT | ADMIN |
| `/api/v1/disputes` (POST) | JWT | BUYER |
| `/api/v1/disputes/:id/resolve` (PATCH) | JWT | ADMIN |

## 10. Frontend / UX Impact

**Buyer RFQ:**
- "Rate puchein" primary CTA from product detail page
- Quote comparison: clear visual table, trust scores visible
- Counter-offer: simple price input + message

**Return Request:**
- Issue reporting: camera-first for evidence
- "Return karna chahte ho?" confirmation before submit
- Status tracking: "Review mein hai" → "Approved" → "Refund process mein"

**Dispute:**
- Accessible from order detail: "Problem report karein"
- Simple flow: describe issue → upload evidence → submit

## 11. Runtime / Infra Impact

| Component | Impact |
|---|---|
| BullMQ | Quote expiry cron (every 30min), return SLA alert cron |
| EventOutbox | RFQ + return + dispute events consumed by notification worker |
| S3 | Return evidence uploads (restricted bucket) |

## 12. Security Requirements

| Requirement | Implementation |
|---|---|
| Seller isolation on RFQ | Seller sees only their own quotes, not other sellers' quotes for same RFQ |
| Return window enforcement | Server-side validation only (never trust client) |
| Evidence uploads | Same security as product images (MIME, size, virus scan) |
| Dispute resolution: ADMIN only | BUYER cannot resolve own disputes |
| Quotation validity | Server enforces validUntil (not client-side) |

## 13. Observability Requirements

| Metric | Implementation |
|---|---|
| `rfq_created_total` | Counter |
| `quote_submitted_total` | Counter |
| `rfq_converted_to_order_total` | Counter (business KPI) |
| `return_requested_total` | Counter |
| `return_approved_rate` | Gauge |
| `dispute_opened_total` | Counter |
| `dispute_sla_breached_total` | Counter |
| Alert: dispute SLA breach | WARNING (admin notified) |
| Alert: return unresponded > 48h | WARNING |

## 14. Testing Requirements

| Test | Requirement |
|---|---|
| Unit: Return window | Request outside window → 400 |
| Unit: Quote expiry | validUntil past → status EXPIRED |
| Integration: Full RFQ → order | Create → quote → accept → order created |
| Integration: Return approved → refund record | Initiated status |
| Integration: Dispute → resolve | Closed with outcome |
| Security: Seller A cannot see Seller B's quote | 403 |
| Security: Buyer cannot resolve dispute | 403 |

## 15. Performance Requirements

| Metric | Target |
|---|---|
| `GET /rfq/:id/quotes` (comparison) | < 100ms |
| Quote expiry worker per batch | < 30s |
| `POST /returns` | < 200ms |

## 16. Optimization Validation

- Quotation queries use index on `buyerId + status + createdAt`
- Expiry worker uses index on `validUntil + status`
- Return evidence URLs served via CloudFront (not direct S3)
- Dispute SLA calculation uses DB timestamp (not application time)

## 17. Sprint Validation Gate

```
✅ Full RFQ lifecycle: create → seller quotes → buyer accepts → order created
✅ Quote expiry: quote with validUntil=now+5min, wait → status=EXPIRED
✅ Seller A cannot see Seller B's quote on same RFQ → 403
✅ Return request: created within window → PENDING
✅ Return request: created outside window → 400
✅ Return approved by admin → status=APPROVED_FOR_PICKUP
✅ Dispute created → visible in admin exception center
✅ Dispute resolved → DisputeStatus=RESOLVED_BUYER/RESOLVED_SELLER
✅ Procurement template: save → load → new cart created
✅ All events emitted to EventOutbox → notifications triggered
✅ CI green, coverage ≥ 80% for RFQ + return + dispute modules
✅ Return SLA alert working (test with 1min SLA in staging config)
```

## 18. Definition of Done

All 12 validation gate items passing. Full RFQ lifecycle end-to-end verified. Return and dispute workflows observable.

## 19. Failure Conditions

- Seller can see competitor quotes on same RFQ
- Return accepted outside the return window
- Dispute resolved by non-admin user
- Quote expires without notification to buyer

## 20. Rollback Strategy

App: Redeploy previous image. RFQ data, return requests, and disputes persist in DB. No financial transactions affected (refunds are manual initiation only).

## 21. Production Readiness Gate

**Status: PRODUCTION-SAFE.** Deploy to production after validation gate passes.

## 22. Known Risks

| Risk | Mitigation |
|---|---|
| Return evidence photos too large on mobile | Size limit enforced, compression on client (if PWA camera API) |
| RFQ spam from unverified buyers | Business verification required before RFQ creation |
| Quote expiry cron misses quotes | Idempotent expiry logic + monitoring |

## 23. AI Execution Guidance

| Task | Guidance |
|---|---|
| Quotation state machine | Human defines valid transitions. AI implements guards |
| Return window calculation | Human writes. Config-driven, not hardcoded |
| Dispute resolution logic | Human writes. Legal implications require human review |
| RFQ seller isolation | Human audits EVERY query for seller isolation |

## 24. Estimated Complexity

| Dimension | Complexity |
|---|---|
| Engineering | Medium-High (complex state machines, multi-party workflows) |
| Operational | Medium (new S3 bucket for evidence) |
| Testing | High (isolation security, window validation, SLA tracking) |

---

---

# SPRINT 9 — HARDENING, OBSERVABILITY & PRODUCTION RELEASE

## 1. Sprint Identity

| Field | Value |
|---|---|
| Sprint Number | 9 |
| Sprint Name | Hardening, Observability & Production Release |
| Duration | 2 weeks |
| Objective | Production-grade stability. Full observability stack. Load tested. Security audited. Rollback procedures verified. Performance optimized. Official MVP release. |
| Philosophy | Every prior sprint built features. This sprint builds confidence. The checkout path must survive 10× expected load. Every critical alert must fire correctly. Every rollback must execute in < 5 minutes. Soft-launch only after this sprint passes its gate with no open critical or high issues. |

## 2. Why This Sprint Exists

**Business:** A production system that hasn't been load-tested or security-audited is a liability, not an asset. Soft-launch on an unoptimized system risks buyer and seller churn on first impression.

**Technical:** Performance bottlenecks that weren't visible at low load appear under realistic concurrency. Security vulnerabilities that escaped earlier review are caught in a dedicated audit. This sprint eliminates both classes of risk.

**Dependency:** All 16 modules active. Full system can be load-tested as a whole. This sprint has no upstream functional dependencies — it depends on all prior sprints being complete.

## 3. Scope

### IN Scope
- Full load test: 1K concurrent users, checkout path, 30-minute sustained (k6/Artillery)
- Performance profiling: slow query identification, index verification
- DB query optimization (based on load test findings)
- Redis memory audit and TTL optimization
- BullMQ queue depth stress test (10K notifications)
- Frontend performance audit (Lighthouse CI all 4 apps)
- Bundle size optimization (code splitting, tree shaking)
- Full Grafana dashboard setup (all key metrics from all sprints)
- AlertManager rules (all alerts from all sprints)
- Prometheus metrics validation (every metric from all sprints firing)
- Sentry error tracking setup (production DSN, alert rules)
- Full security audit (OWASP Top 10 checklist)
- Dependency vulnerability scan (pnpm audit — zero critical)
- Secret rotation verification (all secrets fresh, rotation plan documented)
- WAF rules review (Cloudflare — rate limits, bot protection)
- Rollback procedure drill (time it: must be < 5 minutes)
- Orphaned media cleanup job activation (S3)
- Data retention enforcement (OTP purge, session cleanup, temp media)
- Inventory snapshot daily cron (reconciliation)
- Graceful degradation testing (intentional Redis failure, intentional DB slowdown)
- InventorySnapshot daily cron activation
- PgBouncer connection pooling configuration (if not already active)
- Final API documentation review (all OpenAPI specs complete)
- Full regression test suite run (all integration + E2E tests)
- Staging → Production migration rehearsal (1 full rehearsal before release)
- Official soft-launch decision: go/no-go gate

### OUT of Scope
- New features (none — this is a hardening sprint)
- OpenSearch migration (Phase 2)
- Multi-region (Phase 3)
- Advanced BI dashboards (Phase 2)

## 4. Deliverables

| Category | Deliverable |
|---|---|
| Load Test | k6 script for checkout path, results report |
| Performance | Identified and fixed N queries, slow query report |
| Grafana | Complete dashboard: API health, DB health, queue health, business KPIs |
| AlertManager | All critical + warning rules active, tested |
| Sentry | Error tracking live, production DSN, alert thresholds |
| Security | OWASP checklist completed, vulnerabilities resolved |
| CI | Full regression suite green (all sprints' tests) |
| Docs | Operational runbook, deployment runbook, rollback runbook |
| Jobs | Orphan media cleanup, OTP cleanup, data retention enforcement |
| Infra | PgBouncer configured (if not active), autovacuum tuned for all hot tables |
| Release | Go/no-go decision. Soft-launch announcement. |

## 5. Dependency Mapping

| Dependency | Required Sprint |
|---|---|
| All modules functional | Sprints 1-8 ✅ |
| Full Prisma schema active | Sprints 1-8 ✅ |
| All BullMQ workers running | Sprints 3-8 ✅ |
| Production deployment active | Sprint 4 ✅ |
| All OpenAPI specs committed | Sprints 1-8 ✅ |

## 6. Detailed Execution Sequence

```
1. PERFORMANCE PHASE (Days 1-4)

   1.1 Load Test Setup
       a. Write k6 script: simulate buyer journey
          (login → search → product → add-to-cart → checkout → COD order)
       b. Target: 1K concurrent users, 30-minute sustained load
       c. Run on staging (not production)
       d. Record: p50, p95, p99 for every endpoint

   1.2 Slow Query Analysis
       a. Enable pg_stat_statements on staging DB
       b. Run load test → collect slow query log
       c. EXPLAIN ANALYZE on every query > 100ms
       d. Verify all Tier 1 indexes are being used
       e. Identify and fix: missing indexes, N+1 queries, over-fetching

   1.3 Frontend Audit
       a. Run Lighthouse CI on: buyer PWA, seller dashboard, admin
       b. LCP, FCP, TTI, CLS, bundle size — must meet budgets
       c. Fix: code split routes, lazy load non-critical components,
          compress images, remove unused Tailwind classes

   1.4 Redis Audit
       a. Audit all TTLs (are they correct?)
       b. Audit memory usage (any unexpectedly large keys?)
       c. Run queue stress test: 10K notifications enqueued
          → verify workers process without DLQ overflow

2. OBSERVABILITY PHASE (Days 4-7)

   2.1 Grafana Dashboard Setup
       a. API Health: RPS, p95 latency, error rate per endpoint
       b. DB Health: connections, slow queries, CPU, replication lag
       c. Queue Health: depth per queue, processing time, DLQ size
       d. Cache Health: hit rate, evictions, memory
       e. Business KPIs: orders/min, checkout success rate,
          payment success rate, active users
       f. Exception Center: stuck orders gauge, open disputes gauge

   2.2 AlertManager Rules (verify all firing correctly)
       a. API error rate > 5% → CRITICAL (test by injecting errors)
       b. DB CPU > 80% → WARNING (test by running expensive query)
       c. Queue depth > 10K → WARNING (test by pausing workers)
       d. Payment failure rate > 5% → CRITICAL (test with bad gateway)
       e. Checkout abandon > 50% → WARNING
       f. Stuck orders > 5 → WARNING
       g. Dispute SLA breach → WARNING

   2.3 Sentry Setup
       a. Production DSN configured
       b. Source maps uploaded (for readable stack traces)
       c. Alert: new error type → notify on Slack
       d. Alert: error spike → page on-call

   2.4 Structured Log Audit
       a. Verify: every critical flow has correct log fields
       b. Verify: no PII in logs (phone, email, card data)
       c. Verify: trace_id propagated across all services
       d. Verify: log levels correct (no DEBUG in production)

3. SECURITY PHASE (Days 7-10)

   3.1 OWASP Top 10 Audit
       a. Injection: verify all Prisma parameterized, no raw SQL without parameterization
       b. Broken auth: JWT validation, session management, OTP security
       c. XSS: CSP headers, DOMPurify on user content
       d. Insecure direct object references: ownership checks on all mutations
       e. Security misconfiguration: Helmet headers, CORS whitelist
       f. Vulnerable dependencies: pnpm audit → zero critical CVEs
       g. Insufficient logging: AuditLog completeness check

   3.2 Rate Limiting Verification
       a. OTP send: 4th attempt in 5min → 429 (verify on staging)
       b. API: 101st request in 1min from same IP → 429
       c. Search: no rate limit bypass (header injection test)

   3.3 Secret Audit
       a. gitleaks full history scan → zero secrets in git history
       b. All secrets in env vars → none hardcoded
       c. Rotation schedule documented

   3.4 File Upload Security
       a. Upload non-image disguised as JPG → must be rejected
       b. Upload oversized file → must be rejected
       c. Virus scan integration verified

4. OPERATIONAL PHASE (Days 10-12)

   4.1 Activate Maintenance Jobs
       a. Orphan media cleanup (S3): cron Sunday 3 AM
       b. OTP cleanup: cron daily
       c. Session cleanup (expired): cron daily
       d. Inventory snapshot: cron daily midnight
       e. EventOutbox archival: cron weekly (COMPLETED events → archived)
       f. Reservation expiry: already active (Sprint 3) — verify

   4.2 PgBouncer Configuration
       a. Transaction pooling mode
       b. max_client_conn = 1000
       c. default_pool_size = 20
       d. Verify: API connects via PgBouncer, not direct DB
       e. Verify: connection count stays within bounds under load

   4.3 Autovacuum Tuning (verify all hot tables)
       a. Inventory: 0.05
       b. Payment: 0.05
       c. EventOutbox: 0.02
       d. Order: 0.05

   4.4 Rollback Drill
       a. Deploy previous Docker image
       b. Time it: must be < 5 minutes
       c. Verify: /health/ready returns 200 after rollback
       d. Verify: sessions intact (Redis)
       e. Verify: DB data intact

5. REGRESSION + DOCUMENTATION (Days 12-14)

   5.1 Full Regression Suite
       a. Run all unit tests (all sprints): must be green
       b. Run all integration tests: must be green
       c. Run all E2E Playwright tests: must be green
       d. Run checkout E2E (COD + Razorpay sandbox): must pass

   5.2 Documentation
       a. Deployment runbook (/docs/runbooks/deploy.md)
       b. Rollback runbook (/docs/runbooks/rollback.md)
       c. Incident response runbook (/docs/runbooks/incident.md)
       d. Database backup + restore runbook
       e. API documentation (Swagger UI live at /api/docs)

   5.3 Production Rehearsal
       a. Full staging → production migration rehearsal
       b. Simulate load on production-like environment
       c. Verify monitoring fires correctly

   5.4 Go/No-Go Decision
       a. All validation gate items must pass
       b. Zero open CRITICAL or HIGH issues
       c. Load test results reviewed and acceptable
       d. Security audit findings all resolved
       e. Team signs off: engineering lead, product, CTO

6. SOFT LAUNCH
   a. Internal testing (employees) + 10 invited buyers/sellers
   b. Monitor for 48 hours
   c. No new features during soft-launch monitoring window
   d. Escalation path confirmed: on-call engineer active

7. Update CURRENT_PHASE.md → Sprint 9 complete, MVP released
```

## 7. Folder / Module Impact

```
docs/runbooks/
├── deploy.md
├── rollback.md
├── incident.md
└── db-backup-restore.md

scripts/
├── load-test/
│   └── checkout-flow.js         (k6 script)
└── maintenance/
    ├── orphan-media-cleanup.ts
    ├── otp-cleanup.ts
    └── session-cleanup.ts

infra/
├── grafana/
│   └── dashboards/
│       ├── api-health.json
│       ├── db-health.json
│       ├── queue-health.json
│       └── business-kpis.json
└── alertmanager/
    └── rules.yml
```

## 8. Database Impact

| Item | Action |
|---|---|
| pg_stat_statements | Enable on staging for load test |
| PgBouncer | Configure + verify connection routing |
| Autovacuum | Verify all hot table settings active |
| Index usage | Verify all Tier 1 indexes used (pg_stat_user_indexes) |
| No schema changes | All models already active from prior sprints |
| Data retention jobs | Active for OTP, sessions, EventOutbox |

## 9. API Impact

No new API routes in Sprint 9.
All existing APIs must pass the performance gate under load:

| Endpoint | p95 Target |
|---|---|
| POST /orders (COD) | < 300ms under 1K concurrent users |
| GET /search/products | < 150ms under 1K concurrent users |
| POST /auth/otp/verify | < 100ms under 500 concurrent |
| GET /seller/orders | < 100ms |
| GET /buyer/orders | < 100ms |

## 10. Frontend / UX Impact

**Performance fixes (if Lighthouse audit reveals issues):**
- Code split: admin dashboard, seller dashboard (not loaded on buyer PWA)
- Lazy load: product images (IntersectionObserver)
- Preload: LCP image on product detail page
- Remove: unused Tailwind classes (purge config)
- Fix: any CLS issues (image dimensions must be defined)
- Fix: any TTI issues (defer non-critical JS)

**Offline mode verification:**
- Service worker caches product pages
- Cart draft preserved on network loss
- "Aap offline hain" banner works correctly

## 11. Runtime / Infra Impact

| Component | Impact |
|---|---|
| PgBouncer | Configured in production connection string |
| Grafana | All dashboards live |
| AlertManager | All alert rules active |
| Sentry | Production error tracking live |
| Maintenance crons | All active in production |
| Load balancer | Health check intervals verified |

## 12. Security Requirements

| Requirement | Verification |
|---|---|
| OWASP Top 10 | Checklist completed and documented |
| Zero critical CVEs | `pnpm audit` + manual review |
| No secrets in git | `gitleaks` full history scan |
| All admin routes: ADMIN role | Automated test across all 20 admin modules |
| All audit logs present | Spot check: 100 random mutations have AuditLog entries |
| TLS 1.3 enforced | curl --tlsv1.2 must fail, --tlsv1.3 must succeed |
| Rate limiting active | Load test: 101st req/min from same IP → 429 |
| Webhook HMAC | Tampered webhook signature → 400 |
| File uploads | Non-image disguised as JPG → 400 |
| Session revocation | Logout → token invalid immediately |

## 13. Observability Requirements

Sprint 9 completes and verifies all observability from all prior sprints:

**All dashboards must display:**
- Real-time data (< 30s delay)
- Last 7 days of history
- All critical metrics

**All alerts must fire correctly:**
- Test each alert by triggering condition intentionally
- Verify: Slack notification received
- Verify: On-call escalation path works

## 14. Testing Requirements

| Test | Requirement |
|---|---|
| Load test: checkout path | 1K concurrent, 30min, p95 < 300ms |
| Load test: search | 1K concurrent, 30min, p95 < 150ms |
| Queue stress test | 10K jobs enqueued → all processed, zero DLQ |
| Full regression suite | 100% of tests from sprints 0-8 pass |
| E2E: COD checkout | Playwright test passes on production |
| E2E: Razorpay sandbox | Playwright test passes on staging |
| Graceful degradation | Redis off → core commerce still works |
| Graceful degradation | DB read replica off → fallback to primary works |
| Rollback drill | Previous image deployed in < 5 minutes |
| Security: OWASP | All 10 categories checked, documented |

## 15. Performance Requirements

All performance requirements from all prior sprints must hold under 1K concurrent user load.

**New requirements (system-wide):**
- System sustains 1K concurrent users for 30 minutes without p95 exceeding 2× normal targets
- No memory leaks (heap stable after 30-minute load test)
- DB connection count stays within PgBouncer pool limits
- Redis memory stays < 80% under load

## 16. Optimization Validation

This is the comprehensive optimization sprint:
- Identify and fix every slow query found in load test
- Remove every unused index (check pg_stat_user_indexes)
- Verify all N+1 queries are eliminated
- Verify bundle sizes meet all budgets
- Verify no unused npm packages (depcheck)
- Verify no memory leaks in long-running processes (BullMQ workers)

## 17. Sprint Validation Gate

```
✅ Load test: 1K concurrent users, 30 min → API p95 < 300ms sustained
✅ Load test: search p95 < 150ms under 1K users
✅ Lighthouse: buyer PWA LCP < 2.5s, FCP < 1.5s, TTI < 3s
✅ Lighthouse: admin dashboard LCP < 3s
✅ Grafana: all dashboards live with real data
✅ AlertManager: all critical alerts tested and firing
✅ Sentry: production DSN active, test error captured
✅ pnpm audit: zero critical CVEs
✅ gitleaks: zero secrets in git history
✅ OWASP Top 10 checklist: all items resolved
✅ Rollback drill: < 5 minutes, health check green after
✅ Full regression suite: 100% passing
✅ E2E: COD checkout passes on production
✅ Graceful degradation: Redis failure → core commerce works
✅ PgBouncer: connection count verified under load
✅ Maintenance jobs: orphan cleanup, OTP cleanup, session cleanup active
✅ Deployment runbook: complete and peer-reviewed
✅ Rollback runbook: complete and peer-reviewed
✅ Incident runbook: complete and peer-reviewed
✅ API docs (Swagger UI): live at /api/docs
✅ Go/No-Go: signed off by engineering lead + product + CTO
✅ Soft launch: 10 invited users onboarded, monitoring active
✅ Zero open CRITICAL issues
✅ Zero open HIGH issues
```

## 18. Definition of Done

All 24 validation gate items passing. Go/No-Go signed. Soft launch active. On-call roster confirmed. Monitoring dashboards live.

## 19. Failure Conditions

- Load test p95 exceeds 2× target for checkout path
- Any open CRITICAL security vulnerability
- Rollback drill takes > 5 minutes
- Grafana dashboards have missing metrics
- Any regression in E2E tests
- Go/No-Go not achieved (any blocker unresolved)

## 20. Rollback Strategy

Sprint 9 is a hardening sprint. No new schema changes. If any optimization causes regression, the previous Docker image is a clean rollback. Load test reveals issues → fix before go/no-go decision. No go-live pressure overrides the go/no-go gate.

## 21. Production Readiness Gate

**Status: PRODUCTION RELEASE — soft launch.**
This sprint IS the production readiness gate. Soft launch proceeds only after all 24 validation items pass with CTO sign-off.

## 22. Known Risks

| Risk | Mitigation |
|---|---|
| Load test reveals DB bottleneck | Read replica can be added in < 4 hours if needed |
| Security audit finds critical issue | Release deferred. No exceptions for critical security findings |
| PgBouncer misconfiguration breaks connection | Test on staging before production. Rollback procedure verified |
| Grafana dashboard data missing | Verify Prometheus scraping intervals before declaring ready |
| Soft launch users encounter bugs | On-call engineer active 24/7 during 48h soft launch window |

## 23. AI Execution Guidance

| Task | Guidance |
|---|---|
| k6 load test script | Human writes buyer journey. AI can assist with k6 API syntax |
| OWASP audit | Human audits. AI can assist generating checklist items |
| Grafana dashboard JSON | AI can generate. Human verifies metric names against Prometheus |
| Alert rules YAML | AI can generate template. Human verifies thresholds from SLO targets |
| Rollback runbook | Human writes. Critical procedure cannot be AI-generated without review |
| Go/no-go decision | Human only. CTO sign-off required |

## 24. Estimated Complexity

| Dimension | Complexity |
|---|---|
| Engineering | High (load testing, optimization, all systems active simultaneously) |
| Operational | Very High (production release, monitoring, on-call) |
| Testing | Very High (regression suite, E2E, security audit, load testing) |

---

---

# ROADMAP SUMMARY

## Sprint Calendar

| Sprint | Name | Duration | Key Gate | Production Status |
|---|---|---|---|---|
| **0** | Foundation | 2 weeks | docker-compose up + CI green | Local only |
| **1** | Auth & Identity | 2 weeks | Login works end-to-end on mobile | Staging |
| **2** | Product Catalog & Search | 2 weeks | Seller lists → buyer finds | Staging |
| **3** | Inventory Management | 2 weeks | Zero oversell under concurrent load | Staging |
| **4** | Cart, Orders & Payments | 2 weeks | Full checkout + COD order in production | **PRODUCTION** |
| **5** | Buyer & Seller Dashboards | 2 weeks | Both sides operational | Production |
| **6** | Notifications | 2 weeks | Order events → SMS/email delivered | Production |
| **7** | Admin System & Governance | 2 weeks | Platform governable and auditable | Production |
| **8** | RFQ, Returns & Disputes | 2 weeks | Full B2B workflow end-to-end | Production |
| **9** | Hardening, Observability & Release | 2 weeks | Load tested, security audited, released | **SOFT LAUNCH** |

**Total MVP duration: 20 weeks (~5 months)**

## Module Activation Sequence

```
Sprint 0: Core infra (Prisma, Redis, BullMQ, Logger, Health)
Sprint 1: Identity, Auth, RBAC, Sessions, AuditLog (partial)
Sprint 2: Catalog, Products, Categories, Search, Media, EventOutbox
Sprint 3: Inventory, Reservations, Movements, Queue workers
Sprint 4: Cart, Orders, Payments, Webhooks, Razorpay
Sprint 5: SellerOrders, BuyerOrders, Dispatching, Scorecard
Sprint 6: Notifications, Templates, Preferences, Multi-channel
Sprint 7: Admin, Governance, KYC, Invoices, Payouts, AuditLog (full)
Sprint 8: Procurement/RFQ, Returns, Disputes, Quotations
Sprint 9: Hardening, Observability, Security, Release
```

## Global Validation Rules (All Sprints)

1. No sprint proceeds without the prior sprint's validation gate fully passed
2. No production deploy without a tested rollback procedure
3. No merge without CI passing (lint, typecheck, tests, build, security scan)
4. No critical security vulnerability shipped to production
5. No schema change without migration + rollback plan
6. No mutation without AuditLog entry (from Sprint 1 onward)
7. No new architecture decisions without DDR + CTO approval
8. No checkout path regression permitted at any sprint (checkout is sacred)

---

**END OF MASTER IMPLEMENTATION ROADMAP**

*This roadmap is the official execution blueprint for VyaparNet MVP delivery.*
*All sprint implementation packs must be generated and audited before execution begins.*
*All decisions remain governed by the 14 frozen architecture documents and the Master Context Pack.*