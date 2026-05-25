Doing full pre-generation analysis now.

---

**INTERNAL PRE-GENERATION ANALYSIS**

**Re-reading Sprint 0 from MASTER_IMPLEMENTATION_ROADMAP.md:**
Sprint 0 scope: Turborepo + pnpm, Docker Compose (PostgreSQL 15 + Redis 7), NestJS scaffold (apps/api), Next.js 14 scaffold (apps/web), Prisma schema v4.3 application (packages/database), core NestJS modules (PrismaModule, RedisModule, BullMQModule, LoggerModule), health checks (/health, /ready), GitHub Actions CI, env management, basic Pino logging, SIGTERM handler, team onboarding. No business logic. No auth. No domain APIs.

**Cross-referencing against architecture documents:**

From `VyaparNet_Implementation_Architecture_Official_Freeze_v1.md` (Doc 8): Monorepo strategy uses Turborepo + pnpm. Build order: config → types → database → ui → worker → api → web. Module-first architecture. Repository pattern. BaseRepository pattern defined. GlobalExceptionFilter required. ZodValidationPipe stub required. AsyncLocalStorage for request context. Graceful shutdown SIGTERM mandatory.

From `VyaparNet_Deployment_Runtime_Architecture_v1.md` (Doc 12): Node.js 20 Alpine base. Multi-stage Docker builds. Non-root user (node, uid=1000). Healthcheck defined. Container immutability. `/health` (liveness) + `/ready` (readiness). Graceful shutdown: SIGTERM → drain 30s → close DB/Redis → exit. PgBouncer awareness in connection string. Stateless API containers. API timeout governance.

From `VyaparNet_SCHEMA_v4_3_FINAL_FREEZE.md` (Doc 6): Full Prisma schema with 30 domain models. GIN indexes require raw SQL. `pg_trgm` and `unaccent` extensions. `prisma-client-js` generator. PostgreSQL datasource. All model naming: PascalCase singular. Field naming: camelCase.

From `VyaparNet_Database_Indexing_Strategy_Official_Freeze_v1.md` (Doc 7): GIN indexes cannot be added natively by Prisma — must be raw SQL in migration. `CREATE INDEX CONCURRENTLY` mandatory. Autovacuum settings for hot tables. pg_stat_user_indexes monitoring.

From `VyaparNet_PRDv2_Final_Freeze.docx` (Doc 2): Naming conventions frozen. No abbreviations. snake_case tables, PascalCase models, camelCase fields. Soft delete on every operational table. version column for optimistic locking. created_at, updated_at, created_by, updated_by mandatory.

From `LOCKED_DECISIONS.md`: NestJS modular monolith. REST only. No GraphQL. No gRPC. Prisma ORM only — no raw SQL in application code (only in migration files). Secrets in env vars only. TypeScript strict mode. No `any`. pnpm + Turborepo. Node.js 20. Argon2id (Sprint 1, not Sprint 0). JWT (Sprint 1, not Sprint 0).

From `PROJECT_CONTEXT.md`: AI collaboration rules — AI must not modify locked decisions. Module golden rules. Anti-patterns. No business logic in Sprint 0.

From `VyaparNet_Sprint_Roadmap_v1.md` (Doc 13): Sprint 0 exit criteria: `docker-compose up` all services healthy. `/health` returns 200. CI green. `pnpm build` passes. Staging configured. CODEOWNERS created.

From `VyaparNet_API_Contracts_Backend_Scaffold_Blueprint.md` (Doc 9): API response envelope standard. Error format. Global validation pipe. Global exception filter. Standard error codes. Request ID propagation. Pino logger configuration.

**Critical findings for Sprint 0:**
1. GIN indexes require manual raw SQL addition to migration file — this is easy to miss and must be called out explicitly.
2. `prisma migrate dev` generates base migration, but the search trigger and extensions must be added manually to that migration SQL file before it runs.
3. The `packages/database` package must use `prisma-client-js` generator with the correct output path so all apps can import the same client.
4. BullMQ module registered in Sprint 0 but no workers — the module setup must include queue registration without throwing errors when no workers are defined.
5. The monorepo build order in turbo.json is critical: if `packages/database` hasn't run `prisma generate`, `apps/api` will fail to typecheck.
6. `.nvmrc` + `engines` field in package.json to enforce Node 20.
7. Docker Compose health checks must include `pg_isready` for PostgreSQL and `redis-cli ping` for Redis — not just port availability.
8. The graceful shutdown handler must close Prisma client before process.exit — missing this causes connection pool leaks.
9. `apps/worker` must be a stub in Sprint 0 — it exists structurally but has no workers yet.
10. CODEOWNERS file is a hard requirement per Sprint Roadmap.

**Sequence validation:**
The correct execution sequence is: workspace init → tooling (eslint/prettier/tsconfig) → packages (config → types → database) → apps scaffolds → Docker → Prisma apply → CI → validation. This is the only safe order because each step depends on the previous.

**No conflicts found between documents. Analysis complete. Ready to generate.**

---

# VYAPARNET — SPRINT 0 DETAILED IMPLEMENTATION PACK
## Foundation, Infrastructure & Monorepo
### Version: v1.0 | Authority: Master Implementation Roadmap + All Architecture Documents
### Date: 2025-05-25

---

## SECTION 1: SPRINT IDENTITY

| Field | Value |
|---|---|
| Sprint Number | 0 |
| Sprint Name | Foundation |
| Duration | 2 weeks (10 working days) |
| Status | READY TO EXECUTE |
| Preceded By | Architecture Phase (COMPLETE — all 14 documents frozen) |
| Followed By | Sprint 1: Authentication & Identity |
| Implementation Mode | AI-assisted with mandatory human review gates |

---

## SECTION 2: REQUIRED ARCHITECTURE CONTEXT FILES

**Every AI agent and engineer executing Sprint 0 MUST read these files before writing a single line.**

| Context Type | Authoritative File | Why Required |
|---|---|---|
| Monorepo Strategy | `architecture/implementation/VyaparNet_Implementation_Architecture_Official_Freeze_v1.md` — Section 1 | Defines Turborepo, pnpm, build pipeline, folder structure |
| Runtime Philosophy | `architecture/runtime/VyaparNet_Deployment_Runtime_Architecture_v1.md` — Sections 1–5 | Defines Docker, container standards, graceful shutdown, health checks |
| Database Authority | `architecture/database/VyaparNet_SCHEMA_v4_3_FINAL_FREEZE.md` | Complete Prisma schema v4.3 — must be applied exactly |
| Indexing Authority | `architecture/database/VyaparNet_Database_Indexing_Strategy_Official_Freeze_v1.md` | GIN indexes, raw SQL migration requirements |
| DB Infra | `architecture/database/VyaparNet_DB_Infra_Architecture.md` | PgBouncer, connection pooling, partitioning philosophy |
| Governance | `context/PROJECT_CONTEXT.md` | AI rules, anti-patterns, naming conventions |
| Locked Decisions | `context/LOCKED_DECISIONS.md` | Stack decisions, forbidden complexity, naming rules |
| API Contracts | `architecture/api/VyaparNet_API_Contracts_Backend_Scaffold_Blueprint.md` — Sections 10–11 | Monorepo architecture, NestJS scaffold, module structure |
| Sprint Authority | `implementation/master-roadmap/MASTER_IMPLEMENTATION_ROADMAP.md` — Sprint 0 section | Deliverables, validation gate, failure conditions |
| Current Phase | `context/CURRENT_PHASE.md` | Live coordination state |
| PRD Decisions | `architecture/prd/VyaparNet_PRDv2_Final_Freeze.docx` — Section 3 (Tech Stack), Section 4 (Naming) | Stack lock, naming conventions |

**AI AGENT RULE:** Do not proceed to any implementation step without having read all files in the table above. If a file is unavailable, halt and report — do not invent or assume.

---

## SECTION 3: SPRINT OBJECTIVE

Establish the complete, production-grade monorepo foundation for VyaparNet. At the end of Sprint 0, every subsequent sprint must be able to begin without any infrastructure setup work. The foundation must be correct the first time — mistakes here compound across all 9 subsequent sprints.

**Sprint 0 does NOT implement:**
- Authentication
- Business logic
- Domain APIs
- Frontend pages (beyond health placeholder)
- Background workers with real jobs
- Any VyaparNet-specific features

**Sprint 0 DOES establish:**
- Monorepo workspace (Turborepo + pnpm)
- Package boundaries and ownership
- Shared tooling (TypeScript, ESLint, Prettier, Husky)
- Docker Compose runtime (PostgreSQL 15 + Redis 7)
- NestJS API application scaffold
- Next.js PWA application scaffold (buyer, admin, seller stubs)
- NestJS Worker application scaffold (stub)
- Prisma schema application (v4.3 full freeze)
- Core infrastructure NestJS modules
- Health check endpoints
- Structured logging baseline
- Graceful shutdown
- GitHub Actions CI pipeline
- Environment management
- Testing infrastructure
- Git governance (CODEOWNERS, branch protection, commit conventions)

---

## SECTION 4: SPRINT PHILOSOPHY

> *"Sprint 0 is not setup. Sprint 0 is the architectural contract made physical. Every naming decision, every package boundary, every Docker health check, every TypeScript strict rule — they are all enforcing the frozen architecture documents into reality. Get this wrong and every subsequent sprint fights the foundation. Get this right and every subsequent sprint accelerates."*

**Three absolute constraints:**
1. The Prisma schema applied in Sprint 0 is exactly schema v4.3. Not a subset. Not a simplified version. The complete frozen schema.
2. The folder structure established in Sprint 0 is the permanent folder structure. It reflects the Module Breakdown document exactly.
3. TypeScript strict mode is enforced from the first file. There is no "we'll fix types later."

---

## SECTION 5: BUSINESS, TECHNICAL & DEPENDENCY REASONING

### Business Reasoning
No seller can list a product. No buyer can place an order. No admin can govern the platform. Nothing works without the foundation Sprint 0 establishes. Rushing past this sprint with a loose foundation costs weeks of refactoring in Sprint 4–7 when the system is under time pressure.

### Technical Reasoning
The Turborepo build cache is only effective when the pipeline is configured correctly from the start. The Prisma client, generated once, is shared across `apps/api`, `apps/worker`, and eventually `apps/admin`. If `packages/database` is structured incorrectly, all consuming packages must be refactored. PostgreSQL extensions (`pg_trgm`, `unaccent`) must be enabled in the first migration — not a later one — because the GIN indexes for search depend on them.

### Dependency Reasoning
Every Sprint 1–9 task has an implicit dependency on Sprint 0:
- Auth (Sprint 1) needs: PrismaModule, RedisModule, LoggerModule, ZodValidationPipe, GlobalExceptionFilter
- Products (Sprint 2) needs: packages/database with full schema, S3 config in env, BullMQ registered
- Inventory (Sprint 3) needs: BullMQ queue registration, Redis connection verified
- Orders (Sprint 4) needs: all of the above + payment provider env vars seeded in `.env.example`

---

## SECTION 6: DETAILED SCOPE

### IN SCOPE — Sprint 0

**Monorepo:**
- `pnpm-workspace.yaml` with all workspace definitions
- `turbo.json` with correct pipeline (build, dev, test, lint, typecheck)
- Root `package.json` (scripts, engines, devDependencies)
- `.nvmrc` enforcing Node 20

**Packages:**
- `packages/config` — ESLint config, Prettier config, shared tsconfig bases
- `packages/types` — empty typed package, correct exports, no business types yet
- `packages/database` — Prisma schema v4.3, Prisma client generation, migrations, seed stub
- `packages/ui` — empty Shadcn/Tailwind component package stub (no components yet)
- `packages/utils` — empty shared utilities package stub

**Applications:**
- `apps/api` — NestJS 10 scaffold with core modules
- `apps/web` — Next.js 14 App Router scaffold (buyer PWA) with Tailwind + Shadcn stub
- `apps/admin` — Next.js 14 scaffold stub (no pages)
- `apps/seller-dashboard` — Next.js 14 scaffold stub (no pages)
- `apps/worker` — NestJS standalone worker scaffold stub (no workers)

**Core NestJS Modules (apps/api):**
- `PrismaModule` (global, singleton)
PrismaService lifecycle requirements:

- MUST implement `OnModuleInit`
- MUST call `this.$connect()` during initialization
- MUST implement `OnModuleDestroy`
- MUST call `this.$disconnect()` during shutdown
- MUST participate in graceful shutdown orchestration

Reason:
Improper Prisma lifecycle handling causes:
- connection leaks
- hanging shutdowns
- stale pool exhaustion
- CI instability
- `RedisModule` (global, ioredis)
Redis connection configuration MUST include:

- retryStrategy
- reconnectOnError
- lazyConnect
- maxRetriesPerRequest
- enableReadyCheck

Reason:
BullMQ and Redis connection stability are critical for future queue processing reliability.
- `BullMQModule` (registered, no workers yet)
- `LoggerModule` (nestjs-pino, structured JSON)
- `HealthModule` (GET /health, GET /health/ready)
- `GlobalExceptionFilter` (standard error envelope)
- ResponseTransformInterceptor (mandatory standardized success envelope)
- TimeoutInterceptor (global request timeout enforcement — default 30 seconds)
IMPORTANT API RESPONSE GOVERNANCE

All APIs MUST follow the standardized response envelope defined in:
`architecture/api/VyaparNet_API_Contracts_Backend_Scaffold_Blueprint.md`

Success responses MUST use:
{
  success: true,
  data: ...,
  meta?: ...
}

Error responses MUST use:
{
  success: false,
  error: {
    code,
    message,
    details?,
    requestId
  }
}

No controller may return raw Prisma entities directly.
No controller may return unstructured JSON.

Controllers MUST expose DTOs only.

Prisma entities MUST remain internal to the service/repository layer.

DTO mapping is mandatory at API boundaries.

Reason:
This prevents:
- accidental schema leakage
- unstable API contracts
- internal DB coupling
- serialization inconsistency


IMPORTANT TIMEOUT GOVERNANCE

All API requests MUST enforce a global timeout policy.

Default timeout:
30 seconds.

Reason:
Unbounded request duration causes:
- hung Node.js event loop pressure
- connection starvation
- cascading latency spikes
- container instability under load

Timeouts MUST be centrally enforced via:
`TimeoutInterceptor`

Controllers must NEVER implement ad-hoc timeout logic.
- `ZodValidationPipe` (stub — ready for Sprint 1 
usage)
- `AsyncLocalStorage` context (request-scoped trace ID)
- `ConfigModule` (NestJS config with validation)
- `ThrottlerModule` scaffold (rules implemented starting Sprint 1)
- SIGTERM graceful shutdown handler

**Docker:**
- `docker-compose.yml` (PostgreSQL 15 + Redis 7 + Adminer)
- Both services with proper health checks
- Named volumes
- Internal network isolation

**Database:**
- Prisma schema v4.3 applied exactly
- First migration (`0001_init`) generated and verified
- PostgreSQL extensions enabled in migration
- GIN indexes added via raw SQL in migration
- Search trigger function defined in migration
- Autovacuum settings applied to hot tables
- Seed script stub

**CI/CD:**
- `.github/workflows/ci.yml` (lint → typecheck → test → build → secret scan → dependency audit)
- `.github/CODEOWNERS`
- Branch protection rules documented
- `.gitleaks.toml` configuration

**Environment:**
- `.env.example` complete with all Sprint 0–9 variables documented
- `.env.local` gitignored
- `NODE_ENV` handling
- Config validation via Zod in ConfigModule

**Git Governance:**
- `.gitignore` comprehensive
- `.nvmrc` (Node 20)
- Conventional commit configuration (commitlint)
- Husky pre-commit hooks (lint-staged)
- Husky commit-msg hook (commitlint)

**Testing Infrastructure:**
- Vitest configured in `apps/api`
- Supertest installed
- Test folder structure established
- DB test utilities stub (test DB connection)
- First test: `/health` returns 200

**Observability Baseline:**
- Pino logger configured (JSON in production, pretty in development)
- Request ID middleware (`X-Request-Id` header propagation)
- AsyncLocalStorage for trace context propagation
- `/health` (liveness) — process running
- `/health/ready` (readiness) — verifies:
  - PostgreSQL query execution succeeds
  - Prisma client responsive
  - Redis ping succeeds
  - BullMQ Redis connection healthy

Future OpenTelemetry integration hooks MUST remain compatible with:
- AsyncLocalStorage request context
- structured request IDs
- distributed tracing propagation

Sprint 0 does NOT implement full OpenTelemetry,
but must avoid architecture decisions that block future tracing integration.

### OUT OF SCOPE — Sprint 0

The following MUST NOT be implemented in Sprint 0 under any circumstances:

| Item | Reason | When |
|---|---|---|
| Authentication / OTP / JWT | Sprint 1 | Not yet |
| Any domain API (products, orders, etc.) | Sprints 2–8 | Not yet |
| RBAC guards or decorators | Sprint 1 | Not yet |
| SMS provider integration | Sprint 1 | Not yet |
| S3/R2 storage integration | Sprint 2 | Not yet |
| BullMQ workers with real jobs | Sprint 3+ | Not yet |
| Razorpay integration | Sprint 4 | Not yet |
| Frontend pages (beyond placeholder) | Sprint 2+ | Not yet |
| Grafana dashboards | Sprint 9 | Not yet |
| OpenSearch | Phase 2 | Locked out |
| Kafka | Phase 2+ | Locked out |
| Kubernetes | Phase 2+ | Locked out |
| Microservices | Phase 3 | Locked out |

---

## SECTION 7: EXACT FOLDER STRUCTURE

This is the complete, authoritative folder structure for Sprint 0. Every folder and file listed here MUST exist at the end of Sprint 0. No additions. No subtractions.

```
vyaparnet/                                    ← git root
│
├── .github/
│   ├── workflows/
│   │   └── ci.yml                            ← CI pipeline
│   ├── CODEOWNERS                             ← Code ownership
│   └── pull_request_template.md              ← PR template
│
├── apps/
│   ├── api/                                  ← NestJS API server
│   │   ├── src/
│   │   │   ├── main.ts                       ← Bootstrap + SIGTERM
│   │   │   ├── app.module.ts                 ← Root module
│   │   │   ├── core/
│   │   │   │   ├── prisma/
│   │   │   │   │   ├── prisma.module.ts
│   │   │   │   │   └── prisma.service.ts
│   │   │   │   ├── redis/
│   │   │   │   │   ├── redis.module.ts
│   │   │   │   │   └── redis.service.ts
│   │   │   │   ├── bullmq/
│   │   │   │   │   └── bullmq.module.ts
│   │   │   │   ├── logger/
│   │   │   │   │   └── logger.module.ts
│   │   │   │   ├── config/
│   │   │   │   │   ├── config.module.ts
│   │   │   │   │   └── config.schema.ts      ← Zod env validation
│   │   │   │   └── health/
│   │   │   │       ├── health.module.ts
│   │   │   │       └── health.controller.ts
│   │   │   └── shared/
│   │   │       ├── filters/
│   │   │       │   └── global-exception.filter.ts
│   │   │       ├── pipes/
│   │   │       │   └── zod-validation.pipe.ts  ← Stub
│   │   │       ├── interceptors/
│   │   │       │   ├── request-id.interceptor.ts
│   │   │       │   └── response-transform.interceptor.ts
│   │   │       ├── middleware/
│   │   │       │   └── request-context.middleware.ts
│   │   │       ├── database/
│   │   │       │   └── base.repository.ts
│   │   │       └── context/
│   │   │           └── async-local-storage.ts
│   │   ├── test/
│   │   │   ├── setup.ts                      ← Vitest global setup
│   │   │   └── health.spec.ts                ← First integration test
│   │   ├── .env.example                      ← API-specific env example (inherits root)
│   │   ├── Dockerfile                        ← Multi-stage production Dockerfile
│   │   ├── nest-cli.json
│   │   ├── tsconfig.json                     ← Extends packages/config/tsconfig.api.json
│   │   ├── tsconfig.build.json
│   │   ├── vitest.config.ts
│   │   └── package.json
│   │
│   ├── web/                                  ← Next.js 14 Buyer PWA
│   │   ├── app/
│   │   │   ├── layout.tsx                    ← Root layout (Tailwind, fonts)
│   │   │   └── page.tsx                      ← Placeholder home page only
│   │   ├── public/
│   │   │   └── manifest.json                 ← PWA manifest
│   │   ├── Dockerfile
│   │   ├── next.config.js
│   │   ├── tailwind.config.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   ├── admin/                                ← Next.js 14 Admin Dashboard (stub)
│   │   ├── app/
│   │   │   ├── layout.tsx
│   │   │   └── page.tsx                      ← Stub only: "Admin dashboard - coming soon"
│   │   ├── Dockerfile
│   │   ├── next.config.js
│   │   ├── tailwind.config.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   ├── seller-dashboard/                     ← Next.js 14 Seller Dashboard (stub)
│   │   ├── app/
│   │   │   ├── layout.tsx
│   │   │   └── page.tsx                      ← Stub only
│   │   ├── Dockerfile
│   │   ├── next.config.js
│   │   ├── tailwind.config.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   └── worker/                               ← NestJS Worker (stub — no workers yet)
│       ├── src/
│       │   ├── worker.ts                     ← Worker bootstrap (standalone NestJS)
│       │   └── worker.module.ts              ← Root worker module (empty)
│       ├── Dockerfile
│       ├── tsconfig.json
│       └── package.json
│
├── packages/
│   ├── config/                               ← Shared tooling configs
│   │   ├── eslint/
│   │   │   ├── index.js                      ← Base ESLint config
│   │   │   ├── react.js                      ← React/Next.js ESLint config
│   │   │   └── nestjs.js                     ← NestJS ESLint config
│   │   ├── prettier/
│   │   │   └── index.js                      ← Prettier config
│   │   ├── tsconfig/
│   │   │   ├── base.json                     ← Strict base tsconfig
│   │   │   ├── nextjs.json                   ← Next.js tsconfig extension
│   │   │   ├── api.json                      ← NestJS/Node tsconfig extension
│   │   │   └── worker.json                   ← Worker tsconfig extension
│   │   └── package.json
│   │
│   ├── database/                             ← Prisma schema + client
│   │   ├── prisma/
│   │   │   ├── schema.prisma                 ← Schema v4.3 FULL (not partial)
│   │   │   ├── migrations/
│   │   │   │   └── 0001_init/
│   │   │   │       └── migration.sql         ← Generated + manually extended
│   │   │   └── seed.ts                       ← Stub seed script
│   │   ├── src/
│   │   │   └── index.ts                      ← Exports PrismaClient instance
│   │   └── package.json
│   │
│   ├── types/                                ← Shared TypeScript types
│   │   ├── src/
│   │   │   └── index.ts                      ← Empty, ready for Sprint 1 types
│   │   └── package.json
│   │
│   ├── ui/                                   ← Shared React component library (stub)
│   │   ├── src/
│   │   │   └── index.ts                      ← Empty, ready for Sprint 2 components
│   │   └── package.json
│   │
│   └── utils/                                ← Shared utility functions (stub)
│       ├── src/
│       │   └── index.ts                      ← Empty, ready for Sprint 1 utilities
│       └── package.json
│
├── infra/
│   ├── docker/
│   │   └── postgres/
│   │       └── init.sql                      ← PostgreSQL init (extensions only)
│   └── nginx/
│       └── nginx.conf.example               ← Nginx config example (not used locally)
│
├── docs/
│   ├── runbooks/                             ← Empty, populated Sprint 9
│   └── ddr/                                 ← Empty, for future design decisions
│
├── scripts/
│   └── verify-setup.sh                      ← Sprint 0 validation script
│
├── docker-compose.yml                        ← Local dev orchestration
├── docker-compose.override.yml.example      ← Override example (Adminer port, etc.)
├── .env.example                              ← Complete env template ALL sprints
├── .env.local                                ← gitignored, developer fills this
├── .gitignore
├── .nvmrc                                    ← "20"
├── .gitleaks.toml                            ← Secret scanning config
├── .commitlintrc.js                          ← Conventional commits config
├── .lintstagedrc.js                          ← lint-staged config
├── .husky/
│   ├── pre-commit                            ← lint-staged
│   └── commit-msg                            ← commitlint
├── pnpm-workspace.yaml
├── package.json                              ← Root (devDeps only, no src)
├── turbo.json
└── README.md
```

---

## SECTION 8: PACKAGE BOUNDARY RULES

These rules are PERMANENT and must never be violated.

### What Each Package Owns

| Package | Owns | Must NOT Contain |
|---|---|---|
| `packages/config` | ESLint, Prettier, tsconfig bases | Any business logic, any runtime code |
| `packages/database` | Prisma schema, PrismaClient export, migrations, seed | Business logic, HTTP handlers, queues |
| `packages/types` | Shared TypeScript types, enums, Zod schemas | Runtime code, DB access, HTTP requests |
| `packages/ui` | React components, Tailwind tokens | Business logic, API calls, state management |
| `packages/utils` | Pure utility functions (formatting, dates, currency) | DB access, HTTP, side effects |
| `apps/api` | NestJS modules, controllers, services, repositories | Shared components (those go in packages/) |
| `apps/web` | Next.js pages, buyer-facing components | Business logic beyond display |
| `apps/admin` | Next.js admin pages | Shared components (those go in packages/ui) |
| `apps/seller-dashboard` | Next.js seller pages | Shared components |
| `apps/worker` | BullMQ worker processors | HTTP controllers, domain logic beyond processing |

### Import Direction Rules (NEVER violate)

```
apps/* → packages/*       ✅ ALLOWED
packages/types → nothing  ✅ ALLOWED (leaf node)
packages/database → packages/types  ✅ ALLOWED
packages/ui → packages/types  ✅ ALLOWED
packages/utils → packages/types  ✅ ALLOWED

apps/* → other apps/*     ❌ FORBIDDEN (apps never import from each other)
packages/* → apps/*       ❌ FORBIDDEN (packages never import from apps)
packages/config → packages/database  ❌ FORBIDDEN (config is leaf)
```
### Repository Layer Governance

FILE:
apps/api/src/shared/database/base.repository.ts

All database access MUST occur through repository classes.

Direct Prisma queries inside:
- controllers
- guards
- interceptors
- frontend
- worker processors

are FORBIDDEN.

A shared:
`BaseRepository`
must exist to standardize:
- pagination
- soft delete handling
- optimistic locking
- audit metadata injection
- transaction propagation

Reason:
This prevents ORM sprawl and inconsistent DB behavior across modules.
### Transaction Ownership Rules (PERMANENT)

These rules are mandatory across all future sprints.

1. Transactions are owned ONLY by the Service Layer.
2. Repository classes MUST NEVER open transactions independently.
3. Nested transactions are forbidden unless explicitly approved via DDR.
4. Cross-module write operations MUST coordinate through service orchestration.
5. Prisma transaction boundaries MUST remain centralized.

Correct:
Service → transaction → multiple repositories

Incorrect:
Repository → opens its own transaction

Reason:
This prevents transaction nesting chaos,
deadlocks,
and inconsistent rollback behavior
as the modular monolith grows.

### Error Code Governance

All API error codes MUST originate from centralized constants/enums.

Ad-hoc string error codes are FORBIDDEN.

Example:
- AUTH_INVALID_OTP
- PRODUCT_NOT_FOUND
- PAYMENT_SIGNATURE_INVALID

Reason:
Centralized error codes are required for:
- frontend consistency
- observability
- analytics
- support tooling
- API stability

### Boundary Enforcement Tooling

Architectural boundaries MUST eventually be enforced automatically in CI.

Future enforcement tooling:
- eslint-plugin-boundaries
- dependency-cruiser

Purpose:
prevent:
- cross-app imports
- package ownership violations
- circular dependencies
- architecture drift

Sprint 0 establishes governance.
Future sprints enforce it automatically.

### Turborepo Build Order (must match this exactly in `turbo.json`)

```
1. packages/config       (no dependencies — runs first)
2. packages/types        (depends on config)
3. packages/database     (depends on types)
4. packages/utils        (depends on types)
5. packages/ui           (depends on types)
6. apps/worker           (depends on database, types)
7. apps/api              (depends on database, types, utils)
8. apps/web              (depends on ui, types, utils)
9. apps/admin            (depends on ui, types, utils)
10. apps/seller-dashboard (depends on ui, types, utils)
```

---

## SECTION 9: STEP-BY-STEP IMPLEMENTATION SEQUENCE

Every step must be completed and verified before moving to the next. No exceptions.

---

### PHASE 1: WORKSPACE INITIALIZATION
**Estimated time: Day 1**

---

#### Step 1.1 — Initialize Git Repository

```
AUTHORITY: context/LOCKED_DECISIONS.md (Git governance section)

Actions:
1. Create directory: vyaparnet/
2. cd vyaparnet
3. git init
4. git checkout -b main
5. Create initial .gitignore (see Section 10.1)
6. Create README.md with project name only (no content yet)
7. git add .gitignore README.md
8. git commit -m "chore: initialize repository"

Commit checkpoint: CHECKPOINT-0.1
Rollback: Delete directory and start over (no data loss possible)
```

#### Step 1.2 — Enforce Node Version

```
AUTHORITY: context/LOCKED_DECISIONS.md (Node.js 20 locked)
           architecture/runtime/VyaparNet_Deployment_Runtime_Architecture_v1.md (Section 5)

Actions:
1. Create .nvmrc with content: 20
2. If using nvm: nvm install 20 && nvm use 20
3. Verify: node --version → must print v20.x.x

File: .nvmrc
Content:
  20

Validation:
  node --version | grep "^v20\."
  → If this fails: STOP. Install Node 20 via nvm before continuing.

AI AGENT RULE: Never assume Node version. Always verify explicitly.
```

#### Step 1.3 — Install pnpm

```
AUTHORITY: context/LOCKED_DECISIONS.md (pnpm locked)

Actions:
1. corepack enable
2. corepack prepare pnpm@latest --activate
3. Verify: pnpm --version → must print 8.x.x or 9.x.x

AI AGENT RULE: Never use npm install or yarn in this project. Always pnpm.
```

#### Step 1.4 — Initialize pnpm Workspace

```
AUTHORITY: architecture/implementation/VyaparNet_Implementation_Architecture_Official_Freeze_v1.md
           Section 1 (Monorepo Strategy)

Create file: pnpm-workspace.yaml

Content:
  packages:
    - 'apps/*'
    - 'packages/*'

Create file: package.json (ROOT — not any app or package)

Content:
  {
    "name": "vyaparnet",
    "version": "0.0.0",
    "private": true,
    "engines": {
      "node": ">=20.0.0",
      "pnpm": ">=8.0.0"
    },
    "scripts": {
      "build": "turbo run build",
      "dev": "turbo run dev",
      "test": "turbo run test",
      "lint": "turbo run lint",
      "typecheck": "turbo run typecheck",
      "clean": "turbo run clean && rimraf node_modules",
      "format": "prettier --write \"**/*.{ts,tsx,js,jsx,json,md}\"",
      "format:check": "prettier --check \"**/*.{ts,tsx,js,jsx,json,md}\""
    },
    "devDependencies": {
      "turbo": "^2.0.0",
      "rimraf": "^5.0.0",
      "prettier": "^3.0.0",
      "@commitlint/cli": "^19.0.0",
      "@commitlint/config-conventional": "^19.0.0",
      "husky": "^9.0.0",
      "lint-staged": "^15.0.0",
      "gitleaks": "^8.18.0"
    }
  }

Actions:
  pnpm install

Commit checkpoint: CHECKPOINT-0.2
```

#### Step 1.5 — Initialize Turborepo

```
AUTHORITY: architecture/implementation/VyaparNet_Implementation_Architecture_Official_Freeze_v1.md
           Section 1 (Monorepo Strategy)

Create file: turbo.json

Content:
  {
    "$schema": "https://turbo.build/schema.json",
    "globalDependencies": [
      "**/.env.*local",
      ".env"
    ],
    "globalEnv": [
      "NODE_ENV",
      "DATABASE_URL",
      "REDIS_URL"
    ],
    "pipeline": {
      "build": {
        "dependsOn": ["^build"],
        "outputs": [
          ".next/**",
          "!.next/cache/**",
          "dist/**",
          "generated/**"
        ]
      },
      "dev": {
        "cache": false,
        "persistent": true
      },
      "test": {
        "dependsOn": ["^build"],
        "outputs": ["coverage/**"],
        "cache": false
      },
      "test:integration": {
        "cache": false
      },
      "lint": {
        "outputs": []
      },
      "typecheck": {
  "dependsOn": [
    "^build",
    "packages/database#generate"
  ],
  "outputs": []
  }

IMPORTANT:
`packages/database#generate`
is explicitly included to guarantee Prisma client generation
before any consuming application performs type checking.

Without this dependency,
CI race conditions may occur where NestJS/Next.js apps attempt to import Prisma types before the client exists.

      "clean": {
        "cache": false
      },
      "generate": {
        "cache": false,
        "outputs": ["generated/**"]
      }
    }
  }

Validation:
  pnpm turbo --version
  → Must print a version number without error.

Commit checkpoint: CHECKPOINT-0.3
```

---

### PHASE 2: SHARED PACKAGES
**Estimated time: Days 1–2**

---

#### Step 2.1 — Create `packages/config`

```
AUTHORITY: context/LOCKED_DECISIONS.md (TypeScript strict, ESLint, Prettier locked)
           architecture/prd/VyaparNet_PRDv2_Final_Freeze.docx Section 4 (Naming)

Create directory structure:
  packages/config/
    eslint/
      index.js        ← Base ESLint (all packages)
      react.js        ← React/Next.js ESLint
      nestjs.js       ← NestJS ESLint
    prettier/
      index.js        ← Prettier config
    tsconfig/
      base.json       ← Strict base
      nextjs.json     ← Next.js extension
      api.json        ← NestJS/Node extension
      worker.json     ← Worker extension
    package.json

FILE: packages/config/package.json
  {
    "name": "@vyaparnet/config",
    "version": "0.0.0",
    "private": true,
    "exports": {
      "./eslint": "./eslint/index.js",
      "./eslint/react": "./eslint/react.js",
      "./eslint/nestjs": "./eslint/nestjs.js",
      "./prettier": "./prettier/index.js",
      "./tsconfig/base": "./tsconfig/base.json",
      "./tsconfig/nextjs": "./tsconfig/nextjs.json",
      "./tsconfig/api": "./tsconfig/api.json",
      "./tsconfig/worker": "./tsconfig/worker.json"
    },
    "devDependencies": {
      "@typescript-eslint/eslint-plugin": "^7.0.0",
      "@typescript-eslint/parser": "^7.0.0",
      "eslint": "^8.57.0",
      "eslint-config-prettier": "^9.0.0",
      "eslint-plugin-import": "^2.29.0"
    }
  }

FILE: packages/config/tsconfig/base.json
  {
    "$schema": "https://json.schemastore.org/tsconfig",
    "compilerOptions": {
      "target": "ES2022",
      "lib": ["ES2022"],
      "module": "commonjs",
      "moduleResolution": "node",
      "declaration": true,
      "declarationMap": true,
      "sourceMap": true,
      "strict": true,
      "strictNullChecks": true,
      "noImplicitAny": true,
      "noUnusedLocals": true,
      "noUnusedParameters": true,
      "noImplicitReturns": true,
      "noFallthroughCasesInSwitch": true,
      "esModuleInterop": true,
      "skipLibCheck": true,
      "forceConsistentCasingInFileNames": true,
      "resolveJsonModule": true
    },
    "exclude": ["node_modules", "dist", "build", ".next", "coverage"]
  }

FILE: packages/config/tsconfig/api.json
  {
    "$schema": "https://json.schemastore.org/tsconfig",
    "extends": "./base.json",
    "compilerOptions": {
      "module": "commonjs",
      "target": "ES2022",
      "experimentalDecorators": true,
      "emitDecoratorMetadata": true,
      "outDir": "./dist",
      "baseUrl": "./src"
    }
  }

FILE: packages/config/tsconfig/nextjs.json
  {
    "$schema": "https://json.schemastore.org/tsconfig",
    "extends": "./base.json",
    "compilerOptions": {
      "target": "ES2017",
      "lib": ["dom", "dom.iterable", "ES2022"],
      "module": "esnext",
      "moduleResolution": "bundler",
      "allowJs": true,
      "jsx": "preserve",
      "incremental": true,
      "plugins": [{ "name": "next" }],
      "paths": {
        "@/*": ["./src/*"]
      }
    }
  }

FILE: packages/config/tsconfig/worker.json
  {
    "$schema": "https://json.schemastore.org/tsconfig",
    "extends": "./api.json",
    "compilerOptions": {
      "outDir": "./dist"
    }
  }

FILE: packages/config/prettier/index.js
  /** @type {import("prettier").Config} */
  module.exports = {
    semi: true,
    singleQuote: true,
    trailingComma: 'all',
    printWidth: 100,
    tabWidth: 2,
    useTabs: false,
    bracketSpacing: true,
    arrowParens: 'always',
    endOfLine: 'lf',
  };

FILE: packages/config/eslint/index.js
  /** @type {import("eslint").Linter.Config} */
  module.exports = {
    parser: '@typescript-eslint/parser',
    plugins: ['@typescript-eslint', 'import'],
    extends: [
      'eslint:recommended',
      'plugin:@typescript-eslint/recommended',
      'plugin:@typescript-eslint/recommended-requiring-type-checking',
      'prettier',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'warn',
      '@typescript-eslint/no-floating-promises': 'error',
      'no-console': 'error',
      'import/order': ['error', { 'newlines-between': 'always' }],
    },
  };

FILE: packages/config/eslint/nestjs.js
  /** @type {import("eslint").Linter.Config} */
  module.exports = {
    ...require('./index.js'),
    rules: {
      ...require('./index.js').rules,
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  };

FILE: packages/config/eslint/react.js
  /** @type {import("eslint").Linter.Config} */
  module.exports = {
    ...require('./index.js'),
    extends: [
      ...require('./index.js').extends,
      'plugin:react/recommended',
      'plugin:react-hooks/recommended',
    ],
    plugins: [...require('./index.js').plugins, 'react', 'react-hooks'],
    rules: {
      ...require('./index.js').rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
    },
    settings: {
      react: { version: 'detect' },
    },
  };

AI AGENT RULE: Do not modify these configs. They are frozen per LOCKED_DECISIONS.md.
TypeScript strict mode is non-negotiable. The `no-explicit-any: error` rule is absolute.

Commit checkpoint: CHECKPOINT-0.4
```

#### Step 2.2 — Create `packages/types`

```
AUTHORITY: context/LOCKED_DECISIONS.md (TypeScript strict)
           context/PROJECT_CONTEXT.md (naming conventions)

Create:
  packages/types/
    src/
      index.ts    ← Empty with comment
    package.json
    tsconfig.json

FILE: packages/types/package.json
  {
    "name": "@vyaparnet/types",
    "version": "0.0.0",
    "private": true,
    "main": "./dist/index.js",
    "types": "./dist/index.d.ts",
    "exports": {
      ".": {
        "import": "./dist/index.js",
        "types": "./dist/index.d.ts"
      }
    },
    "scripts": {
      "build": "tsc -p tsconfig.json",
      "typecheck": "tsc --noEmit",
      "clean": "rimraf dist"
    },
    "devDependencies": {
      "typescript": "^5.4.0",
      "@vyaparnet/config": "workspace:*",
      "rimraf": "^5.0.0"
    }
  }

FILE: packages/types/tsconfig.json
  {
    "extends": "@vyaparnet/config/tsconfig/base",
    "compilerOptions": {
      "outDir": "./dist",
      "rootDir": "./src"
    },
    "include": ["src/**/*.ts"],
    "exclude": ["node_modules", "dist"]
  }

FILE: packages/types/src/index.ts
  /**
   * @vyaparnet/types
   * Shared TypeScript types, enums, and interfaces for VyaparNet.
   * Business types are added here from Sprint 1 onward.
   * Do NOT add runtime code to this package.
   */

  export {};

AI AGENT RULE: Do not add any business types to packages/types in Sprint 0.
Types are added here starting Sprint 1 (UserRole, Segment enums, etc.)
```

#### Step 2.3 — Create `packages/utils`

```
Create:
  packages/utils/
    src/
      index.ts
    package.json
    tsconfig.json

FILE: packages/utils/package.json
  {
    "name": "@vyaparnet/utils",
    "version": "0.0.0",
    "private": true,
    "main": "./dist/index.js",
    "types": "./dist/index.d.ts",
    "exports": {
      ".": {
        "import": "./dist/index.js",
        "types": "./dist/index.d.ts"
      }
    },
    "scripts": {
      "build": "tsc -p tsconfig.json",
      "typecheck": "tsc --noEmit",
      "clean": "rimraf dist"
    },
    "dependencies": {
      "@vyaparnet/types": "workspace:*"
    },
    "devDependencies": {
      "typescript": "^5.4.0",
      "@vyaparnet/config": "workspace:*",
      "rimraf": "^5.0.0"
    }
  }

FILE: packages/utils/src/index.ts
  /**
   * @vyaparnet/utils
   * Shared utility functions for VyaparNet.
   * Only pure functions with no side effects belong here.
   * Business utilities are added from Sprint 1 onward.
   */

  export {};
```

#### Step 2.4 — Create `packages/ui`

```
Create:
  packages/ui/
    src/
      index.ts
    package.json
    tsconfig.json

FILE: packages/ui/package.json
  {
    "name": "@vyaparnet/ui",
    "version": "0.0.0",
    "private": true,
    "main": "./dist/index.js",
    "types": "./dist/index.d.ts",
    "exports": {
      ".": {
        "import": "./dist/index.js",
        "types": "./dist/index.d.ts"
      }
    },
    "scripts": {
      "build": "tsc -p tsconfig.json",
      "typecheck": "tsc --noEmit",
      "clean": "rimraf dist"
    },
    "dependencies": {
      "@vyaparnet/types": "workspace:*"
    },
    "devDependencies": {
      "typescript": "^5.4.0",
      "react": "^18.0.0",
      "@types/react": "^18.0.0",
      "@vyaparnet/config": "workspace:*",
      "rimraf": "^5.0.0"
    },
    "peerDependencies": {
      "react": ">=18.0.0"
    }
  }

FILE: packages/ui/src/index.ts
  /**
   * @vyaparnet/ui
   * Shared React component library for VyaparNet.
   * Components are added from Sprint 2 onward.
   * Uses Shadcn/UI + Tailwind CSS.
   */

  export {};
```

Commit checkpoint: CHECKPOINT-0.5

---

#### Step 2.5 — Create `packages/database` (CRITICAL — Read all DB docs first)

```
AUTHORITY: architecture/database/VyaparNet_SCHEMA_v4_3_FINAL_FREEZE.md
           architecture/database/VyaparNet_Database_Indexing_Strategy_Official_Freeze_v1.md
           architecture/database/VyaparNet_DB_Infra_Architecture.md
           context/LOCKED_DECISIONS.md Section 9 (mandatory columns)
           context/LOCKED_DECISIONS.md Section 5 (naming conventions)

PRE-CONDITION:
Docker Compose must be running with PostgreSQL before Prisma commands can execute.
If Docker is not yet started, proceed to Section Phase 3 (Docker) first,
then return here for Step 2.5c onward.

IMPORTANT: This step is split into:
  2.5a: Package structure creation (can do without Docker)
  2.5b: Schema file creation (can do without Docker)
  2.5c: Migration generation (requires running PostgreSQL)
  2.5d: Extension and index SQL addition (requires 2.5c)
  2.5e: Migration execution (requires Docker)
```

##### Step 2.5a — Package Structure

```
Create:
  packages/database/
    prisma/
      schema.prisma    ← See below
      migrations/      ← Empty, generated by prisma migrate dev
      seed.ts          ← Stub
    src/
      index.ts         ← PrismaClient export
    package.json
    tsconfig.json

FILE: packages/database/package.json
  {
    "name": "@vyaparnet/database",
    "version": "0.0.0",
    "private": true,
    "main": "./src/index.ts",
    "types": "./src/index.ts",
    "exports": {
      ".": {
        "import": "./src/index.ts",
        "types": "./src/index.ts"
      }
    },
    "scripts": {
      "generate": "prisma generate",
      "migrate:dev": "prisma migrate dev",
      "migrate:deploy": "prisma migrate deploy",
      "migrate:reset": "prisma migrate reset",
      "migrate:status": "prisma migrate status",
      "studio": "prisma studio",
      "seed": "ts-node prisma/seed.ts",
      "typecheck": "tsc --noEmit",
      "clean": "rimraf generated"
    },
    "dependencies": {
      "@prisma/client": "^5.14.0"
    },
    "devDependencies": {
      "prisma": "^5.14.0",
      "typescript": "^5.4.0",
      "ts-node": "^10.9.0",
      "@types/node": "^20.0.0",
      "@vyaparnet/config": "workspace:*",
      "rimraf": "^5.0.0"
    }
  }

FILE: packages/database/tsconfig.json
  {
    "extends": "@vyaparnet/config/tsconfig/base",
    "compilerOptions": {
      "rootDir": "./src",
      "outDir": "./dist",
      "module": "commonjs"
    },
    "include": ["src/**/*.ts", "prisma/seed.ts"],
    "exclude": ["node_modules", "dist", "generated"]
  }
```

##### Step 2.5b — Prisma Schema (CRITICAL — Copy from v4.3 exactly)

```
AUTHORITY: architecture/database/VyaparNet_SCHEMA_v4_3_FINAL_FREEZE.md
           THIS IS THE SINGLE MOST CRITICAL FILE IN SPRINT 0

AI AGENT RULE (ABSOLUTE):
Do NOT paraphrase, simplify, or "improve" the Prisma schema.
Copy it EXACTLY from the frozen document VyaparNet_SCHEMA_v4_3_FINAL_FREEZE.md.
Every model, every field, every relation, every enum, every @@index must be preserved.

Create file: packages/database/prisma/schema.prisma

The schema must contain:
  generator client {
  provider = "prisma-client-js"
}
IMPORTANT:
Prisma client output path is intentionally left as default.

Reason:
pnpm workspace symlinks and Turborepo caching behave more reliably with the default Prisma client generation strategy.

Shared monorepo access is handled through:
`@vyaparnet/database`
exports,
NOT through custom Prisma output paths.

  

  datasource db {
    provider = "postgresql"
    url      = env("DATABASE_URL")
  }

  [ALL ENUMS FROM VyaparNet_SCHEMA_v4_3_FINAL_FREEZE.md — copy exactly]
  [ALL MODELS FROM VyaparNet_SCHEMA_v4_3_FINAL_FREEZE.md — copy exactly]

VERIFICATION CHECKLIST for schema.prisma:
  □ All 30+ domain models present
  □ All enums present (Segment, UserRole, OrderStatus, PaymentStatus, etc.)
  □ All @@index directives present
  □ All @relation directives correct
  □ search_vector column uses Unsupported("tsvector")
  □ Decimal fields use @db.Decimal(18, 2) or @db.Decimal(5, 2)
  □ All partition-ready models have {entity}Month String field
  □ version Int @default(0) on all operational models
  □ isDeleted Boolean @default(false) on all operational models
  □ createdAt DateTime @default(now()) on all models
  □ updatedAt DateTime @updatedAt on all models

AI AGENT RULE:
After creating schema.prisma, run:
  pnpm --filter @vyaparnet/database exec prisma validate
→ Must succeed with 0 errors before proceeding.
→ If validation fails: read the error, correct the schema, revalidate.
→ Never proceed to migration with an invalid schema.
```

##### Step 2.5c — Generate Prisma Client

```
PREREQUISITE: Docker Compose running (Phase 3 must be complete)

From root:
  pnpm install   ← Ensure all packages installed
  pnpm --filter @vyaparnet/database exec prisma generate

Verification:
  node -e "const { PrismaClient } = require('.prisma/client'); console.log('Prisma client OK');"
  → Must not throw errors

If it fails:
  1. Check schema.prisma for errors: pnpm --filter @vyaparnet/database exec prisma validate
  2. Check DATABASE_URL in .env is correct
  3. Check PostgreSQL container is running: docker ps
  4. Never proceed without successful prisma generate
```

##### Step 2.5d — Generate Initial Migration

```
PREREQUISITE: PostgreSQL container running and healthy

From packages/database/:
  DATABASE_URL="postgresql://vyaparnet:localdev@localhost:5432/vyaparnet?schema=public" \
  pnpm exec prisma migrate dev --name init

This generates:
  packages/database/prisma/migrations/
    20250525000000_init/
      migration.sql

CRITICAL MANUAL STEP:
After prisma migrate dev generates migration.sql,
BEFORE running the migration,
manually ADD the following SQL to the END of migration.sql:

--- BEGIN MANUAL ADDITION ---
-- Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Full Text Search: Auto-update trigger for Product.search_vector
CREATE OR REPLACE FUNCTION product_search_update()
RETURNS trigger AS $$
BEGIN
  NEW."search_vector" :=
    setweight(to_tsvector('simple', coalesce(NEW."name", '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW."description", '')), 'B');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER product_search_trigger
  BEFORE INSERT OR UPDATE ON "Product"
  FOR EACH ROW
  EXECUTE FUNCTION product_search_update();

-- Full Text Search: Auto-update trigger for SearchProductDocument.search_vector
CREATE OR REPLACE FUNCTION search_doc_update()
RETURNS trigger AS $$
BEGIN
  NEW."search_vector" :=
    to_tsvector('simple', coalesce(NEW."name", ''));
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER search_doc_trigger
  BEFORE INSERT OR UPDATE ON "SearchProductDocument"
  FOR EACH ROW
  EXECUTE FUNCTION search_doc_update();

-- GIN Index: Product full-text search (Tier 1 - CRITICAL)
CREATE INDEX IF NOT EXISTS idx_prod_search_vector
  ON "Product" USING GIN ("search_vector")
  WHERE "isDeleted" = false;


-- GIN Index: Product name fuzzy search (pg_trgm) (Tier 1)
CREATE INDEX IF NOT EXISTS idx_prod_name_trgm
  ON "Product" USING GIN ("name" gin_trgm_ops)
  WHERE "isDeleted" = false;

  IMPORTANT:
`CREATE INDEX CONCURRENTLY` is intentionally NOT used here because Prisma migrations run inside transactions, and PostgreSQL forbids concurrent index creation inside transaction blocks.

For MVP/local/staging initialization:
standard `CREATE INDEX` is acceptable.

In future production-scale migrations involving large live tables,
manual out-of-band concurrent index migrations may be used separately.

-- Autovacuum tuning for high-write tables (per Indexing Strategy)
ALTER TABLE "Inventory"
  SET (autovacuum_vacuum_scale_factor = 0.05,
       autovacuum_analyze_scale_factor = 0.02);

ALTER TABLE "Payment"
  SET (autovacuum_vacuum_scale_factor = 0.05,
       autovacuum_analyze_scale_factor = 0.02);

ALTER TABLE "EventOutbox"
  SET (autovacuum_vacuum_scale_factor = 0.02,
       autovacuum_analyze_scale_factor = 0.01);

ALTER TABLE "Order"
  SET (autovacuum_vacuum_scale_factor = 0.05,
       autovacuum_analyze_scale_factor = 0.02);
--- END MANUAL ADDITION ---

AUTHORITY for raw SQL:
  architecture/database/VyaparNet_Database_Indexing_Strategy_Official_Freeze_v1.md
  Sections 7 (Full-Text Search), 10 (Partition), 22 (Monitoring & Maintenance)

WHY MANUAL ADDITION:
  Prisma cannot generate GIN indexes, trigger functions, or autovacuum settings.
  These MUST be in the migration SQL to be applied during prisma migrate deploy.
  Missing these in Sprint 0 means search is broken until a later migration — unacceptable.

AI AGENT RULE:
This SQL addition is MANDATORY.
Do not skip it.
Do not defer it.
If in doubt about any SQL statement, refer to the indexing strategy document.
```

##### Step 2.5e — Apply Migration

```
After adding the manual SQL to migration.sql:

  pnpm --filter @vyaparnet/database exec prisma migrate deploy

Verification commands:
  # Check migration status
  pnpm --filter @vyaparnet/database exec prisma migrate status
  → Must show "Database schema is up to date"

  # Verify extensions active
  docker exec vyaparnet-postgres-1 psql -U vyaparnet -d vyaparnet \
    -c "SELECT extname FROM pg_extension WHERE extname IN ('pg_trgm', 'unaccent');"
  → Must show both extensions

  # Verify GIN index exists
  docker exec vyaparnet-postgres-1 psql -U vyaparnet -d vyaparnet \
    -c "SELECT indexname FROM pg_indexes WHERE indexname = 'idx_prod_search_vector';"
  → Must return the index name

  # Verify trigger exists
  docker exec vyaparnet-postgres-1 psql -U vyaparnet -d vyaparnet \
    -c "SELECT trigger_name FROM information_schema.triggers WHERE trigger_name = 'product_search_trigger';"
  → Must return the trigger name

  # Verify tables exist (spot check)
  docker exec vyaparnet-postgres-1 psql -U vyaparnet -d vyaparnet \
    -c "\dt" | grep -E "(User|Product|Order|Payment|Inventory)"
  → Must show all these tables

If any verification fails:
  1. Check the migration SQL file — is the manual addition present?
  2. Check Docker logs: docker logs vyaparnet-postgres-1
  3. Do NOT mark Sprint 0 complete until all verifications pass.
```

##### Step 2.5f — Seed Stub

```
FILE: packages/database/prisma/seed.ts

  import { PrismaClient } from '@prisma/client';

  const prisma = new PrismaClient();

  async function main(): Promise<void> {
    console.log('🌱 Seed script starting...');
    // Sprint 0: No seed data yet.
    // Sprint 1: Roles and permissions seeded here.
    // Sprint 2: Category tree seeded here (Textile + Spare Parts).
    console.log('✅ Seed script complete. No data seeded in Sprint 0.');
  }

  main()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
```

##### Step 2.5g — Database Package Export

```
FILE: packages/database/src/index.ts

  /**
   * @vyaparnet/database
   * Single Prisma client export for all VyaparNet applications.
   * Never import PrismaClient directly from @prisma/client in apps.
   * Always import from @vyaparnet/database.
   */

  import { PrismaClient } from '@prisma/client';

  declare global {
    // eslint-disable-next-line no-var
    var __prisma: PrismaClient | undefined;
  }

  /**
   * Singleton PrismaClient.
   * In development, prevents hot-reload from creating multiple instances.
   * In production, always creates a single instance.
   */
  export const prisma =
    globalThis.__prisma ??
    new PrismaClient({
      log: process.env['NODE_ENV'] === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
    });

  if (process.env['NODE_ENV'] !== 'production') {
    globalThis.__prisma = prisma;
  }

  export * from '@prisma/client';

AI AGENT RULE:
In apps/api and apps/worker, the PrismaService wraps this singleton.
Never create new PrismaClient() in any app — always use this export or the PrismaService.
```

Commit checkpoint: CHECKPOINT-0.6

---

### PHASE 3: DOCKER FOUNDATION
**Estimated time: Day 2**

---

#### Step 3.1 — Create Docker Compose

```
AUTHORITY: architecture/runtime/VyaparNet_Deployment_Runtime_Architecture_v1.md
           Sections 3 (Runtime Topology), 8 (Database Runtime), 9 (Redis Runtime)
           context/LOCKED_DECISIONS.md (PostgreSQL 15, Redis 7, Docker)

FILE: docker-compose.yml

  version: '3.8'

  services:
    postgres:
      image: postgres:15-alpine
      container_name: vyaparnet-postgres
      environment:
        POSTGRES_USER: vyaparnet
        POSTGRES_PASSWORD: localdev
        POSTGRES_DB: vyaparnet
        POSTGRES_INITDB_ARGS: "--encoding=UTF8 --lc-collate=C --lc-ctype=C"
      ports:
        - '5432:5432'
      volumes:
        - postgres_data:/var/lib/postgresql/data
        - ./infra/docker/postgres/init.sql:/docker-entrypoint-initdb.d/01-init.sql:ro
      networks:
        - vyaparnet-internal
      healthcheck:
        test: ['CMD-SHELL', 'pg_isready -U vyaparnet -d vyaparnet']
        interval: 5s
        timeout: 5s
        retries: 10
        start_period: 10s
      restart: unless-stopped

    redis:
      image: redis:7-alpine
      container_name: vyaparnet-redis
      command: >
        redis-server
        --appendonly yes
        --maxmemory 512mb
        --maxmemory-policy allkeys-lru
        --requirepass localdev
      ports:
        - '6379:6379'
      volumes:
        - redis_data:/data
      networks:
        - vyaparnet-internal
      healthcheck:
        test: ['CMD', 'redis-cli', '-a', 'localdev', 'ping']
        interval: 5s
        timeout: 3s
        retries: 10
        start_period: 5s
      restart: unless-stopped

    adminer:
      image: adminer:latest
      container_name: vyaparnet-adminer
      ports:
        - '8080:8080'
      networks:
        - vyaparnet-internal
      environment:
        ADMINER_DEFAULT_SERVER: postgres
        ADMINER_DESIGN: flat
      depends_on:
        postgres:
          condition: service_healthy
      restart: unless-stopped

  volumes:
    postgres_data:
      name: vyaparnet_postgres_data
    redis_data:
      name: vyaparnet_redis_data

  networks:
    vyaparnet-internal:
      name: vyaparnet-internal
      driver: bridge

IMPORTANT NOTES:
- PostgreSQL user: vyaparnet / password: localdev / db: vyaparnet
- Redis password: localdev (required even locally for parity with staging)
- Adminer available at localhost:8080 for DB UI
- Both services have PROPER health checks (not just port checks)
- Named volumes for data persistence across container restarts
- Internal network isolates services from external access
```

#### Step 3.2 — Create PostgreSQL Init Script

```
FILE: infra/docker/postgres/init.sql

  -- VyaparNet PostgreSQL initialization
  -- This runs BEFORE Prisma migrations
  -- Only configure database-level settings here

  -- Set timezone to UTC (matches runtime guarantee)
  SET timezone = 'UTC';

  -- Note: pg_trgm and unaccent extensions are enabled
  -- in the Prisma migration file (0001_init/migration.sql)
  -- NOT here, to keep extension management in version control.

IMPORTANT: This file runs once when the PostgreSQL container is first created.
Extensions are NOT added here — they are in the migration SQL to ensure
they are version-controlled and reproducible.
```

#### Step 3.3 — Start and Verify Docker Compose

```
Actions:
  docker-compose up -d

Verification:
  # Check all containers running
  docker-compose ps
  → postgres: healthy
  → redis: healthy
  → adminer: running (no health check defined)

  # Check PostgreSQL health
  docker exec vyaparnet-postgres psql -U vyaparnet -d vyaparnet -c "SELECT version();"
  → Must return PostgreSQL 15.x version string

  # Check Redis health
  docker exec vyaparnet-redis redis-cli -a localdev ping
  → Must return: PONG

  # Check Adminer accessible
  curl -s -o /dev/null -w "%{http_code}" http://localhost:8080
  → Must return: 200

If any container is not healthy:
  docker-compose logs postgres     ← Check PostgreSQL logs
  docker-compose logs redis        ← Check Redis logs
  DO NOT PROCEED until all services are healthy.

Commit checkpoint: CHECKPOINT-0.7
```

---

### PHASE 4: ENVIRONMENT MANAGEMENT
**Estimated time: Day 2 (parallel with Phase 3)**

---

#### Step 4.1 — Create `.env.example`

```
AUTHORITY: context/LOCKED_DECISIONS.md (secrets in env vars only)
           architecture/runtime/VyaparNet_Deployment_Runtime_Architecture_v1.md Section 2

This file documents EVERY environment variable used across ALL sprints.
Developers fill in `.env.local` (gitignored) from this template.

FILE: .env.example

  # ============================================================
  # VYAPARNET — Environment Variables Template
  # Copy this file to .env.local and fill in values.
  # NEVER commit .env.local to git.
  # ============================================================

  # ---- NODE ----
  NODE_ENV=development
  # Values: development | staging | production

  # ---- DATABASE (PostgreSQL 15) ----
  DATABASE_URL="postgresql://vyaparnet:localdev@localhost:5432/vyaparnet?schema=public"
  # Production: postgresql://user:pass@host:6432/vyaparnet?pgbouncer=true&schema=public
  # Note: pgbouncer=true enables PgBouncer compatibility mode in Prisma
  # Note: Port 6432 = PgBouncer, Port 5432 = Direct PostgreSQL

  # ---- REDIS ----
  REDIS_HOST=localhost
  REDIS_PORT=6379
  REDIS_PASSWORD=localdev
  # Production: use managed Redis connection string
  # Format: redis://:password@host:port

  # ---- APPLICATION ----
  API_PORT=3000
  API_HOST=0.0.0.0

  # ---- JWT (Sprint 1) ----
  JWT_SECRET=change-me-to-a-very-long-random-string-in-production
  JWT_ACCESS_EXPIRES_IN=15m
  JWT_REFRESH_EXPIRES_IN=7d

  # ---- OTP / SMS (Sprint 1) ----
  SMS_PROVIDER=msg91
  # Values: msg91 | twilio
  MSG91_AUTH_KEY=
  MSG91_TEMPLATE_ID=
  TWILIO_ACCOUNT_SID=
  TWILIO_AUTH_TOKEN=
  TWILIO_FROM_NUMBER=

  # ---- STORAGE / S3 (Sprint 2) ----
  S3_PROVIDER=r2
  # Values: r2 | s3
  S3_REGION=auto
  S3_BUCKET=vyaparnet-dev-media
  S3_ENDPOINT=
  S3_ACCESS_KEY_ID=
  S3_SECRET_ACCESS_KEY=
  CDN_BASE_URL=

  # ---- PAYMENT / RAZORPAY (Sprint 4) ----
  RAZORPAY_KEY_ID=
  RAZORPAY_KEY_SECRET=
  RAZORPAY_WEBHOOK_SECRET=

  # ---- EMAIL (Sprint 6) ----
  EMAIL_PROVIDER=resend
  # Values: resend | ses
  RESEND_API_KEY=
  EMAIL_FROM_ADDRESS=noreply@vyaparnet.com
  EMAIL_FROM_NAME=VyaparNet

  # ---- WEB PUSH (Sprint 6) ----
  VAPID_PUBLIC_KEY=
  VAPID_PRIVATE_KEY=
  VAPID_SUBJECT=mailto:tech@vyaparnet.com

  # ---- SENTRY (Sprint 9) ----
  SENTRY_DSN=
  SENTRY_ENVIRONMENT=development

  # ---- FEATURE FLAGS (Sprint 7+) ----
  # Feature flags stored in DB, no env vars needed for MVP

  # ---- CORS ----
  CORS_ORIGINS=http://localhost:3000,http://localhost:3001,http://localhost:3002

  # ---- RATE LIMITING ----
  RATE_LIMIT_TTL_MS=60000
  RATE_LIMIT_MAX=100

  # ---- BULLMQ ----
  BULLMQ_CONCURRENCY=5

IMPORTANT: This file is committed to git.
NEVER put real values here. NEVER.
Developers create .env.local with real values.
.env.local is gitignored.
```

#### Step 4.2 — Update `.gitignore`

```
FILE: .gitignore

  # Environment variables — NEVER commit
  .env
  .env.local
  .env.*.local
  !.env.example

  # Node
  node_modules/
  .pnpm-store/

  # Build outputs
  dist/
  build/
  .next/
  out/

  # Prisma generated client
  node_modules/.prisma/
  # Note: Do NOT ignore prisma/migrations — those are committed

  # Coverage
  coverage/
  lcov.info

  # Turborepo
  .turbo/
  .cache/

  # IDE
  .idea/
  .vscode/
  *.sw?
  .DS_Store

  # Logs
  *.log
  npm-debug.log*
  pnpm-debug.log*

  # TypeScript build info
  *.tsbuildinfo

  # Docker override
  docker-compose.override.yml
  # Note: .override.yml.example IS committed — it's a template
```

---

### PHASE 5: GIT GOVERNANCE
**Estimated time: Day 3 morning**

---

#### Step 5.1 — Commit Convention Setup

```
AUTHORITY: architecture/implementation/VyaparNet_Implementation_Architecture_Official_Freeze_v1.md
           architecture/runtime/VyaparNet_Sprint_Roadmap_v1.md (PR Governance section)

FILE: .commitlintrc.js

  /** @type {import('@commitlint/types').UserConfig} */
  module.exports = {
    extends: ['@commitlint/config-conventional'],
    rules: {
      'type-enum': [
        2,
        'always',
        [
          'feat',      // New feature
          'fix',       // Bug fix
          'chore',     // Maintenance (deps, config, scripts)
          'docs',      // Documentation only
          'style',     // Formatting, no logic change
          'refactor',  // Code restructure, no feature/fix
          'perf',      // Performance improvement
          'test',      // Adding/fixing tests
          'build',     // Build system changes
          'ci',        // CI/CD changes
          'revert',    // Revert a commit
          'wip',       // Work in progress (never merge to main)
        ],
      ],
      'scope-enum': [
        1,
        'always',
        [
          'monorepo', 'api', 'web', 'admin', 'seller',
          'worker', 'database', 'types', 'ui', 'utils',
          'config', 'docker', 'ci', 'auth', 'catalog',
          'inventory', 'orders', 'payments', 'notifications',
          'admin-module', 'rfq', 'returns',
        ],
      ],
      'subject-case': [2, 'always', 'lower-case'],
      'subject-max-length': [2, 'always', 100],
      'body-max-line-length': [2, 'always', 200],
    },
  };

Examples of valid commits:
  chore(monorepo): initialize turborepo workspace
  feat(api): add health check endpoint
  chore(docker): add postgres and redis services
  chore(database): apply prisma schema v4.3

Examples of INVALID commits (will be rejected):
  "added stuff"
  "fix bug"
  "WIP"
```

#### Step 5.2 — Husky + lint-staged Setup

```
AUTHORITY: context/LOCKED_DECISIONS.md (no giant PRs, tests before merge)

Actions:
  pnpm exec husky init

FILE: .husky/pre-commit
  #!/usr/bin/env sh
  . "$(dirname -- "$0")/_/husky.sh"
  pnpm exec lint-staged

FILE: .husky/commit-msg
  #!/usr/bin/env sh
  . "$(dirname -- "$0")/_/husky.sh"
  pnpm exec commitlint --edit "$1"

FILE: .lintstagedrc.js
  /** @type {import('lint-staged').Config} */
  module.exports = {
    '**/*.{ts,tsx}': [
      'eslint --fix --max-warnings 0',
      'prettier --write',
    ],
    '**/*.{js,jsx}': [
      'prettier --write',
    ],
    '**/*.{json,md,yaml,yml}': [
      'prettier --write',
    ],
    '**/*.prisma': [
      'prisma format',
    ],
  };

Make hooks executable:
  chmod +x .husky/pre-commit
  chmod +x .husky/commit-msg

Verification:
  Create a test commit with a bad message → should be rejected
  Create a test commit with good message → should pass
  Undo test commit after verification
```

#### Step 5.3 — CODEOWNERS

```
AUTHORITY: architecture/implementation/VyaparNet_Implementation_Architecture_Official_Freeze_v1.md
           Section 22.12 (Code Ownership)

FILE: .github/CODEOWNERS

  # Global ownership
  * @vyaparnet/architect

  # Module Owners (assigned as team grows)
  /apps/api/src/modules/identity/         @vyaparnet/backend-team
  /apps/api/src/modules/catalog/          @vyaparnet/backend-team
  /apps/api/src/modules/inventory/        @vyaparnet/backend-team
  /apps/api/src/modules/order/            @vyaparnet/backend-team
  /apps/api/src/modules/payment/          @vyaparnet/finance-team
  /apps/api/src/modules/notification/     @vyaparnet/backend-team
  /apps/api/src/modules/audit/            @vyaparnet/backend-team
  /apps/api/src/modules/trust-safety/     @vyaparnet/backend-team
  /apps/api/src/modules/procurement/      @vyaparnet/backend-team

  # Infrastructure
  /packages/database/                     @vyaparnet/architect
  /infra/                                 @vyaparnet/devops-team
  /.github/                               @vyaparnet/devops-team

  # Security-critical files — double review required
  /apps/api/src/shared/guards/            @vyaparnet/architect @vyaparnet/backend-team
  /apps/api/src/core/config/              @vyaparnet/architect
  /packages/database/prisma/migrations/   @vyaparnet/architect

FILE: .github/pull_request_template.md

  ## Summary
  Brief description of what this PR does and why.

  ## Type of Change
  - [ ] feat: New feature
  - [ ] fix: Bug fix
  - [ ] chore: Maintenance
  - [ ] refactor: Code restructure
  - [ ] test: Test additions/fixes
  - [ ] docs: Documentation

  ## Sprint / Ticket
  Sprint: [0-9]
  Ticket: [link or N/A]

  ## Testing
  - [ ] Unit tests added/updated
  - [ ] Integration tests added/updated
  - [ ] Manual testing completed (describe below)

  ## Architecture Context
  - [ ] No locked decisions violated
  - [ ] No new dependencies without DDR
  - [ ] No business logic in frontend
  - [ ] No API without Zod validation (Sprint 1+)
  - [ ] No mutation without audit log (Sprint 1+)

  ## Checklist
  - [ ] PR size < 400 lines
  - [ ] CI passing
  - [ ] No TypeScript errors
  - [ ] No console.log in production code
  - [ ] No secrets hardcoded

  ## Screenshots (if UI change)

  ## Rollback Plan
```

Commit checkpoint: CHECKPOINT-0.8

---

### PHASE 6: NESTJS API SCAFFOLD
**Estimated time: Days 3–5**

---

#### Step 6.1 — Initialize NestJS Application

```
AUTHORITY: architecture/implementation/VyaparNet_Implementation_Architecture_Official_Freeze_v1.md
           Sections 1, 2, 16, 22 (Monorepo, Module Architecture, API Design, Production Hardening)
           architecture/api/VyaparNet_API_Contracts_Backend_Scaffold_Blueprint.md
           Sections 10-12 (Monorepo, Infrastructure, Module Scaffold)
           architecture/runtime/VyaparNet_Deployment_Runtime_Architecture_v1.md
           Sections 4-5 (Deployment Strategy, Containerization)

From root:
  mkdir apps/api && cd apps/api
  pnpm exec nest new . --package-manager pnpm --skip-git --strict

  ← When prompted:
    Package manager: pnpm (already set via flag)
    Strict mode: yes (set via flag)

Then install required dependencies:

  pnpm --filter @vyaparnet/api add \
    @nestjs/core \
    @nestjs/common \
    @nestjs/platform-express \
    @nestjs/config \
    @nestjs/bull \
    @nestjs/terminus \
    @nestjs/throttler \
    nestjs-pino \
    pino \
    pino-http \
    ioredis \
    bullmq \
    zod \
    helmet \
    express \
    @vyaparnet/database \
    @vyaparnet/types \
    @vyaparnet/utils

  pnpm --filter @vyaparnet/api add -D \
    @types/node \
    @types/express \
    typescript \
    ts-node \
    @swc/core \
    @swc/cli \
    vitest \
    @vitest/coverage-v8 \
    supertest \
    @types/supertest \
    pino-pretty \
    @nestjs/testing \
    @vyaparnet/config

FILE: apps/api/package.json
  {
    "name": "@vyaparnet/api",
    "version": "0.0.0",
    "private": true,
    "scripts": {
      "build": "nest build",
      "dev": "nest start --watch",
      "start": "node dist/main",
      "lint": "eslint \"{src,apps,libs,test}/**/*.ts\" --fix --max-warnings 0",
      "typecheck": "tsc --noEmit",
      "test": "vitest run",
      "test:watch": "vitest",
      "test:coverage": "vitest run --coverage",
      "test:integration": "vitest run --config vitest.integration.config.ts",
      "clean": "rimraf dist"
    }
  }
```

#### Step 6.2 — NestJS tsconfig

```
FILE: apps/api/tsconfig.json
  {
    "extends": "@vyaparnet/config/tsconfig/api",
    "compilerOptions": {
      "outDir": "./dist",
      "baseUrl": "./src",
      "paths": {
        "@core/*": ["core/*"],
        "@shared/*": ["shared/*"],
        "@modules/*": ["modules/*"]
      }
    },
    "include": ["src/**/*.ts", "test/**/*.ts"],
    "exclude": ["node_modules", "dist"]
  }

FILE: apps/api/tsconfig.build.json
  {
    "extends": "./tsconfig.json",
    "exclude": ["node_modules", "dist", "test", "**/*spec.ts"]
  }

FILE: apps/api/nest-cli.json
  {
    "$schema": "https://json.schemastore.org/nest-cli",
    "collection": "@nestjs/schematics",
    "sourceRoot": "src",
    "compilerOptions": {
      "deleteOutDir": true,
      "builder": "swc",
      "typeCheck": true
    }
  }
```

#### Step 6.3 — ConfigModule with Zod Validation

```
AUTHORITY: architecture/implementation/VyaparNet_Implementation_Architecture_Official_Freeze_v1.md
           Section 19 (Configuration & Feature Flags)
           architecture/runtime/VyaparNet_Deployment_Runtime_Architecture_v1.md Section 2

FILE: apps/api/src/core/config/config.schema.ts

  import { z } from 'zod';

  /**
   * Environment variable validation schema.
   * Every variable used by the API must be declared here.
   * This prevents "undefined env var" bugs at startup.
   *
   * Authority: LOCKED_DECISIONS.md — secrets in env vars only
   */
  export const configSchema = z.object({
    // Node
    NODE_ENV: z.enum(['development', 'test', 'staging', 'production'])
      .default('development'),

    // Application
    API_PORT: z.string().regex(/^\d+$/).transform(Number).default('3000'),
    API_HOST: z.string().default('0.0.0.0'),

    // Database
    DATABASE_URL: z.string().url('DATABASE_URL must be a valid PostgreSQL URL'),

    // Redis
    REDIS_HOST: z.string().default('localhost'),
    REDIS_PORT: z.string().regex(/^\d+$/).transform(Number).default('6379'),
    REDIS_PASSWORD: z.string().optional(),

    // CORS
    CORS_ORIGINS: z.string().default('http://localhost:3000'),

    // Rate limiting
    RATE_LIMIT_TTL_MS: z.string().transform(Number).default('60000'),
    RATE_LIMIT_MAX: z.string().transform(Number).default('100'),

    // BullMQ
    BULLMQ_CONCURRENCY: z.string().transform(Number).default('5'),
  });

  export type AppConfig = z.infer<typeof configSchema>;

  /**
   * Validates environment variables at startup.
   * Throws if any required variable is missing or invalid.
   * The application WILL NOT START with invalid configuration.
   */
  export function validateConfig(config: Record<string, unknown>): AppConfig {
    const result = configSchema.safeParse(config);
    if (!result.success) {
      const errors = result.error.errors
        .map((e) => `  ${e.path.join('.')}: ${e.message}`)
        .join('\n');
      throw new Error(`❌ Invalid environment configuration:\n${errors}`);
    }
    return result.data;
  }

FILE: apps/api/src/core/config/config.module.ts

  import { Global, Module } from '@nestjs/common';
  import { ConfigModule as NestConfigModule } from '@nestjs/config';
  import { validateConfig } from './config.schema';

  @Global()
  @Module({
    imports: [
      NestConfigModule.forRoot({
        isGlobal: true,
        envFilePath: ['.env.local', '.env'],
        validate: validateConfig,
        cache: true,
      }),
    ],
    exports: [NestConfigModule],
  })
  export class ConfigModule {}
```

#### Step 6.4 — PrismaModule

```
AUTHORITY: architecture/implementation/VyaparNet_Implementation_Architecture_Official_Freeze_v1.md
           Section 3 (Repository Pattern & DB Access)
           architecture/database/VyaparNet_DB_Infra_Architecture.md Section 3.4

FILE: apps/api/src/core/prisma/prisma.service.ts

  import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
  import { PrismaClient } from '@vyaparnet/database';

  /**
   * PrismaService — singleton database client for the API.
   *
   * Lifecycle:
   * - onModuleInit: connects to database, verifies connection
   * - onModuleDestroy: disconnects cleanly (SIGTERM handling)
   *
   * Authority: VyaparNet_Implementation_Architecture_Official_Freeze_v1.md Section 3
   * Authority: VyaparNet_Deployment_Runtime_Architecture_v1.md Section 8
   */
  @Injectable()
  export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(PrismaService.name);

    constructor() {
      super({
        log: process.env['NODE_ENV'] === 'development'
          ? [
              { emit: 'event', level: 'query' },
              { emit: 'stdout', level: 'error' },
              { emit: 'stdout', level: 'warn' },
            ]
          : [{ emit: 'stdout', level: 'error' }],
      });
    }

    async onModuleInit(): Promise<void> {
      this.logger.log('Connecting to database...');
      await this.$connect();
      this.logger.log('Database connected successfully.');

      if (process.env['NODE_ENV'] === 'development') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (this as any).$on('query', (event: { query: string; duration: number }) => {
          if (event.duration > 100) {
            this.logger.warn(`Slow query (${event.duration}ms): ${event.query}`);
          }
        });
      }
    }

    async onModuleDestroy(): Promise<void> {
      this.logger.log('Disconnecting from database...');
      await this.$disconnect();
      this.logger.log('Database disconnected.');
    }
  }

FILE: apps/api/src/core/prisma/prisma.module.ts

  import { Global, Module } from '@nestjs/common';
  import { PrismaService } from './prisma.service';

  @Global()
  @Module({
    providers: [PrismaService],
    exports: [PrismaService],
  })
  export class PrismaModule {}
```

#### Step 6.5 — RedisModule

```
AUTHORITY: architecture/runtime/VyaparNet_Deployment_Runtime_Architecture_v1.md Section 9
           architecture/implementation/VyaparNet_Implementation_Architecture_Official_Freeze_v1.md
           Section 13 (Caching & Invalidation)
           context/LOCKED_DECISIONS.md (Redis 7, ioredis)

FILE: apps/api/src/core/redis/redis.service.ts

  import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
  import { ConfigService } from '@nestjs/config';
  import Redis from 'ioredis';
  import type { AppConfig } from '../config/config.schema';

  /**
   * RedisService — singleton ioredis client for the API.
   *
   * Used for:
   * - OTP storage (Sprint 1)
   * - Session storage (Sprint 1)
   * - Rate limiting (Sprint 1)
   * - Cache (Sprint 2+)
   * - BullMQ queue backend (registered separately in BullMQModule)
   * - Distributed locks (Sprint 3)
   * - Feature flag cache (Sprint 7)
   *
   * Authority: LOCKED_DECISIONS.md (Redis, ioredis)
   */
  @Injectable()
  export class RedisService extends Redis implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(RedisService.name);

    constructor(private readonly config: ConfigService<AppConfig, true>) {
      super({
        host: config.get('REDIS_HOST'),
        port: config.get('REDIS_PORT'),
        password: config.get('REDIS_PASSWORD') || undefined,
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        lazyConnect: true,
      });

      this.on('error', (err: Error) => {
        this.logger.error('Redis connection error', err.message);
      });

      this.on('ready', () => {
        this.logger.log('Redis connected and ready.');
      });

      this.on('reconnecting', () => {
        this.logger.warn('Redis reconnecting...');
      });
    }

    async onModuleInit(): Promise<void> {
      this.logger.log('Connecting to Redis...');
      await this.connect();
    }

    async onModuleDestroy(): Promise<void> {
      this.logger.log('Disconnecting from Redis...');
      await this.quit();
      this.logger.log('Redis disconnected.');
    }

    /**
     * Convenience method: Set a key with TTL in seconds.
     * Standard pattern for all cache operations.
     */
    async setWithTtl(key: string, value: string, ttlSeconds: number): Promise<void> {
      await this.setex(key, ttlSeconds, value);
    }

    /**
     * Convenience method: Get a JSON-serialized value.
     */
    async getJson<T>(key: string): Promise<T | null> {
      const value = await this.get(key);
      if (!value) return null;
      return JSON.parse(value) as T;
    }

    /**
     * Convenience method: Set a JSON-serializable value with TTL.
     */
    async setJson<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
      await this.setex(key, ttlSeconds, JSON.stringify(value));
    }
  }

FILE: apps/api/src/core/redis/redis.module.ts

  import { Global, Module } from '@nestjs/common';
  import { RedisService } from './redis.service';

  @Global()
  @Module({
    providers: [RedisService],
    exports: [RedisService],
  })
  export class RedisModule {}
```

#### Step 6.6 — BullMQModule

```
AUTHORITY: architecture/implementation/VyaparNet_Implementation_Architecture_Official_Freeze_v1.md
           Section 7 (Queue Architecture)
           architecture/runtime/VyaparNet_Deployment_Runtime_Architecture_v1.md Section 10

FILE: apps/api/src/core/bullmq/bullmq.module.ts

  import { Module } from '@nestjs/common';
  import { BullModule } from '@nestjs/bull';
  import { ConfigService } from '@nestjs/config';
  import type { AppConfig } from '../config/config.schema';

  /**
   * BullMQ Module — registers all queues for the VyaparNet API.
   *
   * Queue priority order (per runtime architecture):
   * 1. payments (Critical)
   * 2. inventory (Critical)
   * 3. orders (High)
   * 5. notifications (Medium)
   * 7. search-reindex (Low)
   * 8. analytics (Low)
   *
   * Workers are NOT registered here in Sprint 0.
   * Workers are added in their respective domain modules (Sprint 3+).
   *
   * Authority: VyaparNet_Implementation_Architecture_Official_Freeze_v1.md Section 7
   * Authority: VyaparNet_Deployment_Runtime_Architecture_v1.md Section 10
   */
  @Module({
    imports: [
      BullModule.forRootAsync({
        useFactory: (config: ConfigService<AppConfig, true>) => ({
          connection: {
            host: config.get('REDIS_HOST'),
            port: config.get('REDIS_PORT'),
            password: config.get('REDIS_PASSWORD') || undefined,
          },
          defaultJobOptions: {
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 2000,
            },
            removeOnComplete: { count: 1000, age: 24 * 3600 },
            removeOnFail: { count: 5000, age: 7 * 24 * 3600 },
          },
        }),
        inject: [ConfigService],
      }),

      // Queue registrations — no workers yet (Sprint 0)
      // Workers are added in domain modules starting Sprint 3
      BullModule.registerQueue(
        { name: 'payments' },      // Critical priority — Sprint 4
        { name: 'inventory' },     // Critical priority — Sprint 3
        { name: 'orders' },        // High priority — Sprint 4
        { name: 'notifications' }, // Medium priority — Sprint 6
        { name: 'search-reindex' },// Low priority — Sprint 2
        { name: 'analytics' },     // Low priority — Sprint 4
        { name: 'dead-letter' },   // DLQ — Sprint 3
      ),
    ],
    exports: [BullModule],
  })
  export class BullMQModule {}
```

#### Step 6.7 — LoggerModule (Pino)

```
AUTHORITY: architecture/implementation/VyaparNet_Implementation_Architecture_Official_Freeze_v1.md
           Section 12 (Logging & Observability)
           architecture/runtime/VyaparNet_Deployment_Runtime_Architecture_v1.md Section 12

FILE: apps/api/src/core/logger/logger.module.ts

  import { Module } from '@nestjs/common';
  import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';

  /**
   * Logger Module — configures Pino structured logging.
   *
   * Log format:
   * - Development: pino-pretty (human-readable)
   * - Production: JSON (machine-readable, for Loki/CloudWatch)
   *
   * Every log entry includes:
   * - timestamp (ISO 8601, UTC)
   * - level
   * - message
   * - trace_id (from X-Request-Id header)
   * - context (NestJS component name)
   *
   * Authority: VyaparNet_Implementation_Architecture_Official_Freeze_v1.md Section 12
   */
  @Module({
    imports: [
      PinoLoggerModule.forRoot({
        pinoHttp: {
          level: process.env['NODE_ENV'] === 'production' ? 'warn' : 'info',
          transport:
            process.env['NODE_ENV'] !== 'production'
              ? {
                  target: 'pino-pretty',
                  options: {
                    colorize: true,
                    singleLine: false,
                    translateTime: "yyyy-mm-dd'T'HH:MM:ss.l'Z'",
                    ignore: 'pid,hostname',
                  },
                }
              : undefined,
          customProps: (_req, _res) => ({
            context: 'HTTP',
          }),
          serializers: {
            req: (req: { id: string; method: string; url: string }) => ({
              id: req.id,
              method: req.method,
              url: req.url,
              // DO NOT log: headers (contains Authorization), body (may contain PII)
            }),
            res: (res: { statusCode: number }) => ({
              statusCode: res.statusCode,
            }),
          },
          // Redact sensitive fields — never log these
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.body.password',
              'req.body.otp',
              'req.body.token',
              '*.password',
              '*.otp',
              '*.token',
              '*.secret',
            ],
            censor: '[REDACTED]',
          },
          genReqId: (req: { headers: Record<string, string | undefined> }) => {
            return (
              req.headers['x-request-id'] ??
              `req_${Math.random().toString(36).substring(2, 11)}`
            );
          },
        },
      }),
    ],
  })
  export class LoggerModule {}
```

#### Step 6.8 — AsyncLocalStorage (Request Context)

```
AUTHORITY: architecture/implementation/VyaparNet_Implementation_Architecture_Official_Freeze_v1.md
           Section 22.6 (Request Scoped Context)

FILE: apps/api/src/shared/context/async-local-storage.ts

  import { AsyncLocalStorage } from 'async_hooks';

  /**
   * Request-scoped context storage.
   *
   * Allows any service or repository to access request-level context
   * (traceId, userId) without passing it through function parameters.
   *
   * Usage:
   *   const ctx = asyncLocalStorage.getStore();
   *   const traceId = ctx?.get('traceId');
   *
   * Initialized in RequestIdInterceptor (see shared/interceptors/).
   *
   * Authority: VyaparNet_Implementation_Architecture_Official_Freeze_v1.md Section 22.6
   */
  export const asyncLocalStorage = new AsyncLocalStorage<Map<string, unknown>>();

  /**
   * Get a value from the current request context.
   * Returns undefined if called outside of a request scope.
   */
  export function getContext<T = unknown>(key: string): T | undefined {
    return asyncLocalStorage.getStore()?.get(key) as T | undefined;
  }

  /**
   * Set a value in the current request context.
   * No-op if called outside of a request scope.
   */
  export function setContext(key: string, value: unknown): void {
    asyncLocalStorage.getStore()?.set(key, value);
  }
```

#### Step 6.9 — Request ID Interceptor

```
FILE: apps/api/src/shared/interceptors/request-id.interceptor.ts

  import {
    Injectable,
    NestInterceptor,
    ExecutionContext,
    CallHandler,
  } from '@nestjs/common';
  import { Observable } from 'rxjs';
  import { Request, Response } from 'express';
  import { asyncLocalStorage } from '../context/async-local-storage';

  /**
   * RequestId Interceptor
   *
   * For every incoming request:
   * 1. Reads or generates X-Request-Id
   * 2. Sets it in the response headers
   * 3. Stores it in AsyncLocalStorage for downstream access
   *
   * This enables trace correlation across all log entries for a request.
   *
   * Authority: VyaparNet_Implementation_Architecture_Official_Freeze_v1.md Section 22.6
   */
  @Injectable()
  export class RequestIdInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
      const http = context.switchToHttp();
      const request = http.getRequest<Request>();
      const response = http.getResponse<Response>();

      const requestId =
        (request.headers['x-request-id'] as string) ??
        `req_${Math.random().toString(36).substring(2, 11)}`;

      response.setHeader('X-Request-Id', requestId);

      const store = new Map<string, unknown>();
      store.set('requestId', requestId);
      store.set('traceId', requestId);

      return new Observable((subscriber) => {
        asyncLocalStorage.run(store, () => {
          next.handle().subscribe({
            next: (value) => subscriber.next(value),
            error: (err: unknown) => subscriber.error(err),
            complete: () => subscriber.complete(),
          });
        });
      });
    }
  }
```

#### Step 6.10 — Global Exception Filter

```
AUTHORITY: architecture/api/VyaparNet_API_Contracts_Backend_Scaffold_Blueprint.md
           Section 1 (API Standards - Error Response Envelope)
           architecture/prd/VyaparNet_PRDv2_Final_Freeze.docx Section 5 (Error Handling)

FILE: apps/api/src/shared/filters/global-exception.filter.ts

  import {
    ExceptionFilter,
    Catch,
    ArgumentsHost,
    HttpException,
    HttpStatus,
    Logger,
  } from '@nestjs/common';
  import { Request, Response } from 'express';
  import { getContext } from '../context/async-local-storage';

  /**
   * Global Exception Filter
   *
   * Converts all exceptions into the VyaparNet standard error envelope:
   * {
   *   success: false,
   *   error: {
   *     code: string,         ← Machine-readable
   *     message: string,      ← Human-readable
   *     details?: object,     ← Optional additional context
   *   },
   *   requestId: string,
   * }
   *
   * Authority: VyaparNet_PRDv2_Final_Freeze.docx Section 5
   * Authority: VyaparNet_API_Contracts_Backend_Scaffold_Blueprint.md Section 1
   */
  @Catch()
  export class  implements ExceptionFilter {
    private readonly logger = new Logger(GlobalExceptionFilter.name);

    catch(exception: unknown, host: ArgumentsHost): void {
      const ctx = host.switchToHttp();
      const response = ctx.getResponse<Response>();
      const request = ctx.getRequest<Request>();

      const requestId =
        (getContext<string>('requestId')) ??
        (request.headers['x-request-id'] as string | undefined) ??
        'unknown';

      let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      let code = 'INTERNAL_ERROR';
      let message = 'An unexpected error occurred.';
      let details: Record<string, unknown> | undefined;

      if (exception instanceof HttpException) {
        statusCode = exception.getStatus();
        const exceptionResponse = exception.getResponse();

        if (typeof exceptionResponse === 'string') {
          message = exceptionResponse;
          code = this.statusToCode(statusCode);
        } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
          const errObj = exceptionResponse as Record<string, unknown>;
          code = (errObj['code'] as string | undefined) ?? this.statusToCode(statusCode);
          message = (errObj['message'] as string | undefined) ?? message;
          details = (errObj['details'] as Record<string, unknown> | undefined);
        }
      } else if (exception instanceof Error) {
        // Unexpected errors — do not expose stack trace to client
        this.logger.error(
          { requestId, error: exception.message, stack: exception.stack },
          'Unhandled exception',
        );
      } else {
        this.logger.error({ requestId, exception }, 'Unknown exception type');
      }

      // Log all errors (INFO for client errors, ERROR for server errors)
      if (statusCode >= 500) {
        this.logger.error(
          { requestId, statusCode, code, path: request.url },
          message,
        );
      } else if (statusCode >= 400) {
        this.logger.warn(
          { requestId, statusCode, code, path: request.url },
          message,
        );
      }

      response.status(statusCode).json({
        success: false,
        error: {
          code,
          message,
          ...(details ? { details } : {}),
        },
        requestId,
      });
    }

    private statusToCode(status: number): string {
      const statusCodeMap: Record<number, string> = {
        400: 'BAD_REQUEST',
        401: 'UNAUTHORIZED',
        403: 'FORBIDDEN',
        404: 'NOT_FOUND',
        409: 'CONFLICT',
        422: 'UNPROCESSABLE',
        429: 'RATE_LIMITED',
        500: 'INTERNAL_ERROR',
        503: 'SERVICE_UNAVAILABLE',
        504: 'GATEWAY_TIMEOUT',
      };
      return statusCodeMap[status] ?? 'UNKNOWN_ERROR';
    }
  }
```

#### Step 6.11 — ZodValidationPipe (Stub)

```
AUTHORITY: architecture/implementation/VyaparNet_Implementation_Architecture_Official_Freeze_v1.md
           Section 10 (Validation Architecture)
           architecture/api/VyaparNet_API_Contracts_Backend_Scaffold_Blueprint.md Section 1

FILE: apps/api/src/shared/pipes/zod-validation.pipe.ts

  import { PipeTransform, Injectable, ArgumentMetadata, BadRequestException } from '@nestjs/common';
  import { ZodSchema } from 'zod';

  /**
   * Zod Validation Pipe
   *
   * Validates incoming DTOs against Zod schemas.
   * Returns standardized error response on validation failure.
   *
   * Usage (Sprint 1+):
   *   @UsePipes(new ZodValidationPipe(SendOtpSchema))
   *   async sendOtp(@Body() dto: SendOtpDto) {}
   *
   * Authority: VyaparNet_Implementation_Architecture_Official_Freeze_v1.md Section 10
   */
  @Injectable()
  export class ZodValidationPipe implements PipeTransform {
    constructor(private readonly schema: ZodSchema) {}

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    transform(value: unknown, _metadata: ArgumentMetadata): unknown {
      const result = this.schema.safeParse(value);

      if (!result.success) {
        const fields: Record<string, string> = {};
        for (const issue of result.error.issues) {
          const path = issue.path.join('.');
          fields[path] = issue.message;
        }

        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'Invalid input data',
          details: { fields },
        });
      }

      return result.data;
    }
  }
```

#### Step 6.12 — HealthModule

```
AUTHORITY: architecture/runtime/VyaparNet_Deployment_Runtime_Architecture_v1.md Section 12.2
           architecture/implementation/VyaparNet_Implementation_Architecture_Official_Freeze_v1.md
           Section 22.9 (Health Checks)

FILE: apps/api/src/core/health/health.controller.ts

  import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
  import { PrismaService } from '../prisma/prisma.service';
  import { RedisService } from '../redis/redis.service';

  /**
   * Health Check Controller
   *
   * GET /health  — Liveness check (is the process alive?)
   * GET /health/ready — Readiness check (can it serve traffic?)
   *   Checks: PostgreSQL connection, Redis connection
   *
   * Used by:
   * - Docker health checks
   * - Load balancer health checks (ALB/Nginx)
   * - Kubernetes liveness/readiness probes (Phase 2)
   *
   * Authority: VyaparNet_Deployment_Runtime_Architecture_v1.md Section 12.2
   */
  @Controller('health')
  export class HealthController {
    constructor(
      private readonly prisma: PrismaService,
      private readonly redis: RedisService,
    ) {}

    /**
     * Liveness check.
     * Returns 200 if the process is running.
     * Never fails unless the process itself is dead.
     */
    @Get()
    @HttpCode(HttpStatus.OK)
    health(): { status: string; timestamp: string; uptime: number } {
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
      };
    }

    /**
     * Readiness check.
     * Returns 200 only if all dependencies are healthy.
     * Returns 503 if any dependency is unhealthy.
     * Used by load balancer to route traffic.
     */
    @Get('ready')
    async ready(): Promise<{
      status: string;
      timestamp: string;
      checks: { database: string; redis: string };
    }> {
      const checks = {
        database: 'ok',
        redis: 'ok',
      };

      // Check PostgreSQL
      try {
        await this.prisma.$queryRaw`SELECT 1`;
      } catch {
        checks.database = 'error';
      }

      // Check Redis
      try {
        const pong = await this.redis.ping();
        if (pong !== 'PONG') {
          checks.redis = 'error';
        }
      } catch {
        checks.redis = 'error';
      }

      const allHealthy = Object.values(checks).every((v) => v === 'ok');

      if (!allHealthy) {
        // Return 503 — load balancer will route away from this instance
        throw Object.assign(new Error('Service not ready'), {
          statusCode: HttpStatus.SERVICE_UNAVAILABLE,
          response: {
            code: 'SERVICE_UNAVAILABLE',
            message: 'One or more dependencies are unhealthy',
            details: { checks },
          },
        });
      }

      return {
        status: 'ready',
        timestamp: new Date().toISOString(),
        checks,
      };
    }
  }

FILE: apps/api/src/core/health/health.module.ts

  import { Module } from '@nestjs/common';
  import { HealthController } from './health.controller';

  @Module({
    controllers: [HealthController],
  })
  export class HealthModule {}
```

#### Step 6.13 — AppModule (Root)

```
FILE: apps/api/src/app.module.ts

  import { Module } from '@nestjs/common';
  import { ConfigModule } from './core/config/config.module';
  import { PrismaModule } from './core/prisma/prisma.module';
  import { RedisModule } from './core/redis/redis.module';
  import { BullMQModule } from './core/bullmq/bullmq.module';
  import { LoggerModule } from './core/logger/logger.module';
  import { HealthModule } from './core/health/health.module';

  /**
   * AppModule — Root NestJS module for VyaparNet API.
   *
   * Module import order matters:
   * 1. ConfigModule (first — validates env vars at startup)
   * 2. LoggerModule (second — enables logging for all subsequent modules)
   * 3. PrismaModule (database — needed by domain modules)
   * 4. RedisModule (cache/queue backend — needed by BullMQ + domain modules)
   * 5. BullMQModule (queues — needed by domain workers)
   * 6. HealthModule (always last infrastructure module — needs all above)
   *
   * Domain modules (modules/) are added from Sprint 1 onward.
   * DO NOT add domain modules here in Sprint 0.
   *
   * Authority: VyaparNet_Implementation_Architecture_Official_Freeze_v1.md Section 2
   */
  @Module({
    imports: [
      ConfigModule,     // Must be first
      LoggerModule,     // Must be second
      PrismaModule,     // Global — provides PrismaService to all modules
      RedisModule,      // Global — provides RedisService to all modules
      BullMQModule,     // Registers all queues
      HealthModule,     // Health check endpoints
      // ─── Domain modules added Sprint 1+ ───
      // IdentityModule,    // Sprint 1
      // CatalogModule,     // Sprint 2
      // InventoryModule,   // Sprint 3
      // OrderModule,       // Sprint 4
      // PaymentModule,     // Sprint 4
      // NotificationModule,// Sprint 6
      // AuditModule,       // Sprint 7
      // AdminModule,       // Sprint 7
      // ProcurementModule, // Sprint 8
      // TrustSafetyModule, // Sprint 8
    ],
  })
  export class AppModule {}
```

#### Step 6.14 — main.ts (Bootstrap + Graceful Shutdown)

```
AUTHORITY: architecture/runtime/VyaparNet_Deployment_Runtime_Architecture_v1.md
           Sections 5.3 (Healthcheck), 22.8 (Graceful Shutdown)
           architecture/implementation/VyaparNet_Implementation_Architecture_Official_Freeze_v1.md
           Section 22.8 (Graceful Shutdown)

FILE: apps/api/src/main.ts

  import { NestFactory } from '@nestjs/core';
  import { Logger } from 'nestjs-pino';
  import helmet from 'helmet';
  import { AppModule } from './app.module';
  import { GlobalExceptionFilter } from './shared/filters/global-exception.filter';
  import { RequestIdInterceptor } from './shared/interceptors/request-id.interceptor';

  async function bootstrap(): Promise<void> {
    const app = await NestFactory.create(AppModule, {
      // Disable default NestJS logger — we use Pino
      bufferLogs: true,
    });

    // ─── Use Pino logger globally ───
    app.useLogger(app.get(Logger));
    app.flushLogs();

    // ─── Security headers ───
    // Authority: VyaparNet_Implementation_Architecture_Official_Freeze_v1.md Section 17
    app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
          },
        },
        hsts: {
          maxAge: 31536000,
          includeSubDomains: true,
        },
        referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      }),
    );

    // ─── CORS ───
    const corsOrigins = process.env['CORS_ORIGINS']?.split(',') ?? [
      'http://localhost:3000',
    ];
    app.enableCors({
      origin: corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Request-Id',
        'Idempotency-Key',
        'Accept-Language',
      ],
    });

    // ─── Global prefix ───
    app.setGlobalPrefix('api/v1', {
      exclude: ['health', 'health/ready'],
    });

    // ─── Global exception filter ───
    // Authority: VyaparNet_PRDv2_Final_Freeze.docx Section 5
    app.useGlobalFilters(new GlobalExceptionFilter());

    // ─── Global interceptors ───
    app.useGlobalInterceptors(new RequestIdInterceptor());

    // ─── Start server ───
    const port = parseInt(process.env['API_PORT'] ?? '3000', 10);
    const host = process.env['API_HOST'] ?? '0.0.0.0';
    await app.listen(port, host);

    const logger = app.get(Logger);
    logger.log(
      `🚀 VyaparNet API running on http://${host}:${port}`,
      'Bootstrap',
    );
    logger.log(
      `📡 Health: http://${host}:${port}/health`,
      'Bootstrap',
    );

    // ─── Graceful Shutdown ───
    // Authority: VyaparNet_Deployment_Runtime_Architecture_v1.md Section 5.3
    // Authority: VyaparNet_Implementation_Architecture_Official_Freeze_v1.md Section 22.8
    const gracefulShutdown = async (signal: string): Promise<void> => {
      logger.log(`${signal} received. Starting graceful shutdown...`, 'Bootstrap');

      // Stop accepting new requests
      await app.close();

      // Note: PrismaService.onModuleDestroy() disconnects DB
      // Note: RedisService.onModuleDestroy() disconnects Redis
      // These are called automatically by app.close()

      logger.log('Graceful shutdown complete. Exiting.', 'Bootstrap');
      process.exit(0);
    };

    process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => void gracefulShutdown('SIGINT'));

    // ─── Unhandled rejections ───
    process.on('unhandledRejection', (reason: unknown) => {
      logger.error({ reason }, 'Unhandled promise rejection', 'Bootstrap');
      // Do NOT exit — let the process continue (NestJS handles recovery)
    });

    process.on('uncaughtException', (error: Error) => {
      logger.error({ error: error.message, stack: error.stack }, 'Uncaught exception', 'Bootstrap');
      // Exit on uncaught exception — process is in unknown state
      process.exit(1);
    });
  }

  void bootstrap();

  MANDATORY API VERSIONING RULE

The NestJS application MUST initialize with:

`app.setGlobalPrefix('api/v1');`

Reason:
API versioning is frozen from Sprint 0 onward.

All future APIs MUST live under:
`/api/v1/*`

This prevents future breaking changes from requiring routing refactors.
```

Commit checkpoint: CHECKPOINT-0.9

---

### PHASE 7: NESTJS API — DOCKERFILE
**Estimated time: Day 5**

---

#### Step 7.1 — Create API Dockerfile

```
AUTHORITY: architecture/runtime/VyaparNet_Deployment_Runtime_Architecture_v1.md Section 5

FILE: apps/api/Dockerfile

  # ─── Stage 1: Dependencies ───────────────────────────────────
  FROM node:20-alpine AS deps

  WORKDIR /app

  # Install pnpm
  RUN corepack enable && corepack prepare pnpm@latest --activate

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

  RUN corepack enable && corepack prepare pnpm@latest --activate

  COPY --from=deps /app/node_modules ./node_modules
  COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules

  # Copy source
  COPY . .

  # Generate Prisma client
  RUN pnpm --filter @vyaparnet/database exec prisma generate

  # Build API
  RUN pnpm --filter @vyaparnet/api run build

  # Prune dev dependencies
  RUN pnpm --filter @vyaparnet/api deploy --prod ./deploy/api

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
```

---

### PHASE 8: NEXT.JS APPLICATIONS SCAFFOLD
**Estimated time: Days 5–6**

---

#### Step 8.1 — apps/web (Buyer PWA)

```
AUTHORITY: architecture/ux/VyaparNet_Product_UX_System_v1.md Section 1-3 (UX Philosophy, Design Language)
           context/LOCKED_DECISIONS.md (Next.js 14, Tailwind CSS, Shadcn/UI)

From root:
  cd apps/web
  pnpm exec create-next-app . \
    --typescript \
    --tailwind \
    --eslint \
    --app \
    --no-src-dir \
    --import-alias "@/*" \
    --skip-install

Then install workspace dependencies:
  pnpm --filter @vyaparnet/web add \
    @vyaparnet/types \
    @vyaparnet/ui \
    @vyaparnet/utils

  pnpm --filter @vyaparnet/web add -D \
    @vyaparnet/config

FILE: apps/web/tsconfig.json
  {
    "extends": "@vyaparnet/config/tsconfig/nextjs",
    "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
    "exclude": ["node_modules"]
  }

FILE: apps/web/app/layout.tsx

  import type { Metadata } from 'next';
  import { Inter, Manrope } from 'next/font/google';
  import './globals.css';

  const inter = Inter({
    subsets: ['latin'],
    variable: '--font-inter',
    display: 'swap',
  });

  const manrope = Manrope({
    subsets: ['latin'],
    variable: '--font-manrope',
    display: 'swap',
  });

  export const metadata: Metadata = {
    title: 'VyaparNet — Bharat ka B2B Marketplace',
    description: 'Verified wholesale procurement network for Bharat retailers.',
    manifest: '/manifest.json',
    themeColor: '#2563EB',
    viewport: {
      width: 'device-width',
      initialScale: 1,
      maximumScale: 1,
    },
  };

  export default function RootLayout({
    children,
  }: {
    children: React.ReactNode;
  }): JSX.Element {
    return (
      <html lang="hi" className={`${inter.variable} ${manrope.variable}`}>
        <body className="bg-[#F8FAFC] text-[#1E293B] font-sans antialiased">
          {children}
        </body>
      </html>
    );
  }

FILE: apps/web/app/page.tsx

  /**
   * VyaparNet Buyer PWA — Placeholder Homepage
   * Sprint 0: Placeholder only.
   * Sprint 2+: Real product discovery, search, categories.
   */
  export default function HomePage(): JSX.Element {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8">
        <h1 className="text-3xl font-bold text-[#2563EB] mb-4">
          VyaparNet
        </h1>
        <p className="text-[#64748B] text-center max-w-md">
          Bharat ka B2B Marketplace — Coming Soon
        </p>
        <p className="mt-2 text-sm text-[#94A3B8]">
          Sprint 0: Foundation complete.
        </p>
      </main>
    );
  }

FILE: apps/web/public/manifest.json
  {
    "name": "VyaparNet",
    "short_name": "VyaparNet",
    "description": "Bharat ka B2B Marketplace",
    "start_url": "/",
    "display": "standalone",
    "background_color": "#F8FAFC",
    "theme_color": "#2563EB",
    "icons": [
      {
        "src": "/icon-192.png",
        "sizes": "192x192",
        "type": "image/png"
      },
      {
        "src": "/icon-512.png",
        "sizes": "512x512",
        "type": "image/png"
      }
    ]
  }

Note: Icon files (icon-192.png, icon-512.png) are placeholder transparent PNGs.
Real icons are added in Sprint 2 with the design system.
```

#### Step 8.2 — Tailwind Configuration

```
FILE: apps/web/tailwind.config.ts

  import type { Config } from 'tailwindcss';

  /**
   * VyaparNet Design Tokens — Tailwind Configuration
   *
   * Authority: VyaparNet_Product_UX_System_v1.md Section 29 (Design Tokens)
   */
  const config: Config = {
    content: [
      './app/**/*.{js,ts,jsx,tsx,mdx}',
      './components/**/*.{js,ts,jsx,tsx,mdx}',
      '../../packages/ui/src/**/*.{js,ts,jsx,tsx}',
    ],
    theme: {
      extend: {
        colors: {
          // VyaparNet Design Token Colors
          // Authority: VyaparNet_Product_UX_System_v1.md Section 2.1
          primary: {
            DEFAULT: '#2563EB',
            dark: '#1D4ED8',
          },
          secondary: {
            DEFAULT: '#0D9488',
          },
          accent: {
            DEFAULT: '#F59E0B',
          },
          success: {
            DEFAULT: '#10B981',
          },
          warning: {
            DEFAULT: '#F59E0B',
          },
          error: {
            DEFAULT: '#EF4444',
          },
          surface: {
            DEFAULT: '#FFFFFF',
            page: '#F8FAFC',
          },
          border: {
            DEFAULT: '#E2E8F0',
          },
          'text-primary': '#1E293B',
          'text-secondary': '#64748B',
          'text-disabled': '#94A3B8',
        },
        fontFamily: {
          sans: ['var(--font-inter)', 'Arial', 'Helvetica', 'sans-serif'],
          heading: ['var(--font-manrope)', 'var(--font-inter)', 'sans-serif'],
        },
        fontSize: {
          // VyaparNet Typography Scale
          // Authority: VyaparNet_Product_UX_System_v1.md Section 2.2
          display: ['32px', { lineHeight: '1.22', fontWeight: '700' }],
          h1: ['24px', { lineHeight: '1.22', fontWeight: '700' }],
          h2: ['20px', { lineHeight: '1.22', fontWeight: '600' }],
          h3: ['16px', { lineHeight: '1.22', fontWeight: '600' }],
          body: ['14px', { lineHeight: '1.5', fontWeight: '400' }],
          caption: ['12px', { lineHeight: '1.5', fontWeight: '400' }],
          micro: ['10px', { lineHeight: '1.5', fontWeight: '500' }],
        },
        spacing: {
          // VyaparNet Spacing Scale (base unit: 4px)
          // Authority: VyaparNet_Product_UX_System_v1.md Section 3.1
          xs: '4px',
          sm: '8px',
          md: '16px',
          lg: '24px',
          xl: '32px',
          '2xl': '48px',
          '3xl': '64px',
        },
        borderRadius: {
          sm: '4px',
          DEFAULT: '8px',
          lg: '12px',
          full: '9999px',
        },
        boxShadow: {
          sm: '0 1px 3px rgba(0,0,0,0.05)',
          DEFAULT: '0 4px 6px rgba(0,0,0,0.1)',
        },
      },
    },
    plugins: [],
  };

  export default config;
```

#### Step 8.3 — Stub Applications (admin, seller-dashboard, worker)

```
For apps/admin and apps/seller-dashboard:
  Follow the same scaffold pattern as apps/web.
  Replace page content with segment-appropriate placeholder.
  Same Tailwind config.
  Same tsconfig.

FILE: apps/admin/app/page.tsx
  export default function AdminPage(): JSX.Element {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-[#2563EB]">VyaparNet Admin</h1>
          <p className="text-[#64748B] mt-2">Sprint 0: Stub. Full admin dashboard in Sprint 7.</p>
        </div>
      </main>
    );
  }

FILE: apps/seller-dashboard/app/page.tsx
  export default function SellerPage(): JSX.Element {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-[#2563EB]">VyaparNet Seller Portal</h1>
          <p className="text-[#64748B] mt-2">Sprint 0: Stub. Full seller dashboard in Sprint 5.</p>
        </div>
      </main>
    );
  }

For apps/worker:
  FILE: apps/worker/src/worker.ts
    import { NestFactory } from '@nestjs/core';
    import { WorkerModule } from './worker.module';
    import { Logger } from 'nestjs-pino';

    async function bootstrap(): Promise<void> {
      const app = await NestFactory.createApplicationContext(WorkerModule, {
        bufferLogs: true,
      });
      app.useLogger(app.get(Logger));
      app.flushLogs();

      const logger = app.get(Logger);
      logger.log('VyaparNet Worker started. No workers registered in Sprint 0.', 'Bootstrap');

      // Workers are registered in Sprint 3+ domain modules
      // This bootstrap keeps the worker process alive
    }

    void bootstrap();

  FILE: apps/worker/src/worker.module.ts
    import { Module } from '@nestjs/common';
    // Workers added Sprint 3+
    // Currently: bare module to verify worker scaffold works

    @Module({
      imports: [
        // ConfigModule (Sprint 1)
        // PrismaModule (Sprint 1)
        // RedisModule (Sprint 1)
        // BullMQModule (Sprint 3+)
      ],
    })
    export class WorkerModule {}
```

Commit checkpoint: CHECKPOINT-0.10

---

### PHASE 9: CI/CD PIPELINE
**Estimated time: Day 7**

---

#### Step 9.1 — GitHub Actions CI Pipeline

```
AUTHORITY: architecture/runtime/VyaparNet_Deployment_Runtime_Architecture_v1.md Section 15
           architecture/implementation/VyaparNet_Implementation_Architecture_Official_Freeze_v1.md
           Section 21 (Testing & Deployment Strategy)
           architecture/api/VyaparNet_API_Contracts_Backend_Scaffold_Blueprint.md Section 16

FILE: .github/workflows/ci.yml

  name: VyaparNet CI

  on:
    push:
      branches: [main, develop]
    pull_request:
      branches: [main, develop]

  env:
    NODE_VERSION: '20'
    PNPM_VERSION: '9'

  jobs:
    # ─── Lint ──────────────────────────────────────────────────
    lint:
      name: Lint & Format Check
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4

        - uses: pnpm/action-setup@v3
          with:
            version: ${{ env.PNPM_VERSION }}

        - uses: actions/setup-node@v4
          with:
            node-version: ${{ env.NODE_VERSION }}
            cache: 'pnpm'

        - name: Install dependencies
          run: pnpm install --frozen-lockfile

        - name: Run ESLint
          run: pnpm lint

        - name: Check Prettier formatting
          run: pnpm format:check

    # ─── TypeCheck ─────────────────────────────────────────────
    typecheck:
      name: TypeScript Type Check
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4

        - uses: pnpm/action-setup@v3
          with:
            version: ${{ env.PNPM_VERSION }}

        - uses: actions/setup-node@v4
          with:
            node-version: ${{ env.NODE_VERSION }}
            cache: 'pnpm'

        - name: Install dependencies
          run: pnpm install --frozen-lockfile

        - name: Generate Prisma client
          run: pnpm --filter @vyaparnet/database exec prisma generate
          env:
            DATABASE_URL: 'postgresql://fake:fake@localhost:5432/fake'

        - name: TypeScript type check (all packages)
          run: pnpm typecheck

    # ─── Test ──────────────────────────────────────────────────
    test:
      name: Unit & Integration Tests
      runs-on: ubuntu-latest
      services:
        postgres:
          image: postgres:15-alpine
          env:
            POSTGRES_USER: vyaparnet_test
            POSTGRES_PASSWORD: testpassword
            POSTGRES_DB: vyaparnet_test
          ports:
            - 5432:5432
          options: >-
            --health-cmd pg_isready
            --health-interval 5s
            --health-timeout 5s
            --health-retries 10

        redis:
          image: redis:7-alpine
          ports:
            - 6379:6379
          options: >-
            --health-cmd "redis-cli ping"
            --health-interval 5s
            --health-timeout 3s
            --health-retries 10

      steps:
        - uses: actions/checkout@v4

        - uses: pnpm/action-setup@v3
          with:
            version: ${{ env.PNPM_VERSION }}

        - uses: actions/setup-node@v4
          with:
            node-version: ${{ env.NODE_VERSION }}
            cache: 'pnpm'

        - name: Install dependencies
          run: pnpm install --frozen-lockfile

        - name: Generate Prisma client
          run: pnpm --filter @vyaparnet/database exec prisma generate
          env:
            DATABASE_URL: 'postgresql://vyaparnet_test:testpassword@localhost:5432/vyaparnet_test'

        - name: Run database migrations
          run: pnpm --filter @vyaparnet/database exec prisma migrate deploy
          env:
            DATABASE_URL: 'postgresql://vyaparnet_test:testpassword@localhost:5432/vyaparnet_test'

        - name: Run tests
          run: pnpm test
          env:
            NODE_ENV: test
            DATABASE_URL: 'postgresql://vyaparnet_test:testpassword@localhost:5432/vyaparnet_test'
            REDIS_HOST: localhost
            REDIS_PORT: 6379

        - name: Upload coverage reports
          uses: codecov/codecov-action@v4
          if: always()
          with:
            flags: unittests

    # ─── Build ─────────────────────────────────────────────────
    build:
      name: Build All Applications
      runs-on: ubuntu-latest
      needs: [lint, typecheck]
      steps:
        - uses: actions/checkout@v4

        - uses: pnpm/action-setup@v3
          with:
            version: ${{ env.PNPM_VERSION }}

        - uses: actions/setup-node@v4
          with:
            node-version: ${{ env.NODE_VERSION }}
            cache: 'pnpm'

        - name: Install dependencies
          run: pnpm install --frozen-lockfile

        - name: Generate Prisma client
          run: pnpm --filter @vyaparnet/database exec prisma generate
          env:
            DATABASE_URL: 'postgresql://fake:fake@localhost:5432/fake'

        - name: Build all packages and apps (Turborepo)
          run: pnpm build

        - name: Verify API Docker build
          run: docker build -f apps/api/Dockerfile -t vyaparnet-api:ci .

    # ─── Security ──────────────────────────────────────────────
    security:
      name: Security Audit
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4

        - uses: pnpm/action-setup@v3
          with:
            version: ${{ env.PNPM_VERSION }}

        - uses: actions/setup-node@v4
          with:
            node-version: ${{ env.NODE_VERSION }}
            cache: 'pnpm'

        - name: Install dependencies
          run: pnpm install --frozen-lockfile

        - name: Dependency vulnerability audit
          run: pnpm audit --audit-level=high
          # Fails on HIGH or CRITICAL vulnerabilities

        - name: Secret scanning (gitleaks)
          uses: gitleaks/gitleaks-action@v2
          env:
            GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

#### Step 9.2 — Gitleaks Configuration

```
FILE: .gitleaks.toml

  [allowlist]
  description = "VyaparNet gitleaks allowlist"
  paths = [
    ".env.example",      # Template file — allowed to have placeholder values
    "*.md",              # Documentation — no real secrets expected
  ]

  [[rules]]
  description = "Generic API Key"
  regex = '''(?i)(api[_-]?key|apikey|access[_-]?key)['":\s=]+['"a-zA-Z0-9/+]{16,}'''
  tags = ["key", "api"]

  [[rules]]
  description = "Generic Secret"
  regex = '''(?i)(secret|password|passwd|pwd)['":\s=]+['"a-zA-Z0-9/+!@#$%^&*]{8,}'''
  tags = ["secret"]

  [[rules]]
  description = "JWT Token"
  regex = '''eyJ[a-zA-Z0-9\-_]+\.[a-zA-Z0-9\-_]+\.[a-zA-Z0-9\-_]+'''
  tags = ["jwt"]
```

---

### PHASE 10: TESTING FOUNDATION
**Estimated time: Day 8**

---

#### Step 10.1 — Vitest Configuration

```
AUTHORITY: architecture/implementation/VyaparNet_Implementation_Architecture_Official_Freeze_v1.md
           Section 21 (Testing & Deployment)

FILE: apps/api/vitest.config.ts

  import { defineConfig } from 'vitest/config';
  import { resolve } from 'path';

  export default defineConfig({
    test: {
      globals: true,
      environment: 'node',
      setupFiles: ['./test/setup.ts'],
      include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
      exclude: ['node_modules', 'dist'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'html'],
        include: ['src/**/*.ts'],
        exclude: [
          'src/**/*.module.ts',
          'src/**/*.spec.ts',
          'src/main.ts',
        ],
        thresholds: {
          // Sprint 0: No business logic, lower threshold acceptable
          // Sprint 1+: Must meet 70% threshold for domain code
          lines: 50,
          functions: 50,
          branches: 50,
          statements: 50,
        },
      },
    },
    resolve: {
      alias: {
        '@core': resolve(__dirname, './src/core'),
        '@shared': resolve(__dirname, './src/shared'),
        '@modules': resolve(__dirname, './src/modules'),
      },
    },
  });

FILE: apps/api/test/setup.ts

  import { beforeAll, afterAll } from 'vitest';

  /**
   * Global test setup for VyaparNet API tests.
   *
   * Sprint 0: Minimal setup.
   * Sprint 1+: Add DB seeding, auth token generation utilities.
   */

  beforeAll(async () => {
    // Verify test environment
    if (process.env['NODE_ENV'] !== 'test') {
      throw new Error('Tests must run with NODE_ENV=test');
    }
  });

  afterAll(async () => {
    // Cleanup placeholder for Sprint 1+
    // Sprint 1: Close Prisma connections
    // Sprint 1: Flush Redis test keys
  });
```

#### Step 10.2 — First Integration Test (Health Endpoint)

```
AUTHORITY: architecture/implementation/VyaparNet_Implementation_Architecture_Official_Freeze_v1.md
           Section 21 (Testing)

FILE: apps/api/test/health.spec.ts

  import { describe, it, expect, beforeAll, afterAll } from 'vitest';
  import { Test, TestingModule } from '@nestjs/testing';
  import { INestApplication } from '@nestjs/common';
  import request from 'supertest';
  import { AppModule } from '../src/app.module';
  import { GlobalExceptionFilter } from '../src/shared/filters/global-exception.filter';
  import { RequestIdInterceptor } from '../src/shared/interceptors/request-id.interceptor';

  /**
   * Health endpoint integration tests.
   *
   * Sprint 0 first test:
   * - /health → 200 with correct shape
   * - /health/ready → 200 when DB + Redis healthy
   * - /health/ready → 503 when DB is unavailable (manual test)
   *
   * Authority: VyaparNet_Deployment_Runtime_Architecture_v1.md Section 12.2
   */
  describe('Health Endpoints', () => {
    let app: INestApplication;

    beforeAll(async () => {
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();

      app = moduleFixture.createNestApplication();
      app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/ready'] });
      app.useGlobalFilters(new GlobalExceptionFilter());
      app.useGlobalInterceptors(new RequestIdInterceptor());
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    describe('GET /health', () => {
      it('returns 200 with status ok', async () => {
        const response = await request(app.getHttpServer())
          .get('/health')
          .expect(200);

        expect(response.body).toMatchObject({
          status: 'ok',
          timestamp: expect.any(String),
          uptime: expect.any(Number),
        });
      });

      it('includes X-Request-Id in response headers', async () => {
        const response = await request(app.getHttpServer())
          .get('/health')
          .expect(200);

        expect(response.headers['x-request-id']).toBeDefined();
        expect(typeof response.headers['x-request-id']).toBe('string');
      });

      it('reflects provided X-Request-Id header', async () => {
        const testRequestId = 'test-request-id-12345';
        const response = await request(app.getHttpServer())
          .get('/health')
          .set('X-Request-Id', testRequestId)
          .expect(200);

        expect(response.headers['x-request-id']).toBe(testRequestId);
      });
    });

    describe('GET /health/ready', () => {
      it('returns 200 when database and redis are connected', async () => {
        const response = await request(app.getHttpServer())
          .get('/health/ready')
          .expect(200);

        expect(response.body).toMatchObject({
          status: 'ready',
          timestamp: expect.any(String),
          checks: {
            database: 'ok',
            redis: 'ok',
          },
        });
      });
    });

    describe('Error response format', () => {
      it('returns standard error envelope for 404', async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/nonexistent-route')
          .expect(404);

        expect(response.body).toMatchObject({
          success: false,
          error: {
            code: expect.any(String),
            message: expect.any(String),
          },
          requestId: expect.any(String),
        });
      });
    });
  });
```

---

### PHASE 11: VALIDATION SCRIPT
**Estimated time: Day 9**

---

#### Step 11.1 — Sprint 0 Validation Script

```
FILE: scripts/verify-setup.sh

  #!/usr/bin/env bash
  # ============================================================
  # VyaparNet Sprint 0 — Automated Validation Script
  # Run this before marking Sprint 0 complete.
  # All checks must PASS before proceeding to Sprint 1.
  # ============================================================

  set -e
  PASS=0
  FAIL=0
  WARNINGS=0

  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[1;33m'
  NC='\033[0m'

  check_pass() { echo -e "${GREEN}✅ PASS${NC}: $1"; ((PASS++)); }
  check_fail() { echo -e "${RED}❌ FAIL${NC}: $1"; ((FAIL++)); }
  check_warn() { echo -e "${YELLOW}⚠️  WARN${NC}: $1"; ((WARNINGS++)); }

  echo "============================================================"
  echo "VyaparNet Sprint 0 Validation"
  echo "============================================================"
  echo ""

  # ─── Node Version ────────────────────────────────────────────
  echo "--- Node & Package Manager ---"
  NODE_VERSION=$(node --version 2>/dev/null | grep -oP 'v\K[0-9]+' | head -1)
  if [[ "$NODE_VERSION" -ge 20 ]]; then
    check_pass "Node.js version: v$(node --version)"
  else
    check_fail "Node.js must be v20+. Found: $(node --version)"
  fi

  if pnpm --version &>/dev/null; then
    check_pass "pnpm installed: $(pnpm --version)"
  else
    check_fail "pnpm not installed"
  fi

  if pnpm turbo --version &>/dev/null; then
    check_pass "turbo available: $(pnpm turbo --version)"
  else
    check_fail "turbo not available in workspace"
  fi

  # ─── Docker Services ─────────────────────────────────────────
  echo ""
  echo "--- Docker Services ---"
  if docker ps --format '{{.Names}}' | grep -q 'vyaparnet-postgres'; then
    PG_HEALTH=$(docker inspect vyaparnet-postgres --format '{{.State.Health.Status}}' 2>/dev/null)
    if [[ "$PG_HEALTH" == "healthy" ]]; then
      check_pass "PostgreSQL container: healthy"
    else
      check_fail "PostgreSQL container status: $PG_HEALTH"
    fi
  else
    check_fail "PostgreSQL container not running (run: docker-compose up -d)"
  fi

  if docker ps --format '{{.Names}}' | grep -q 'vyaparnet-redis'; then
    REDIS_HEALTH=$(docker inspect vyaparnet-redis --format '{{.State.Health.Status}}' 2>/dev/null)
    if [[ "$REDIS_HEALTH" == "healthy" ]]; then
      check_pass "Redis container: healthy"
    else
      check_fail "Redis container status: $REDIS_HEALTH"
    fi
  else
    check_fail "Redis container not running (run: docker-compose up -d)"
  fi

  # ─── PostgreSQL Connectivity ──────────────────────────────────
  echo ""
  echo "--- PostgreSQL Checks ---"
  if docker exec vyaparnet-postgres psql -U vyaparnet -d vyaparnet -c "SELECT 1" &>/dev/null; then
    check_pass "PostgreSQL: connection successful"
  else
    check_fail "PostgreSQL: connection failed"
  fi

  # Check extensions
  PG_TRGM=$(docker exec vyaparnet-postgres psql -U vyaparnet -d vyaparnet -tAc \
    "SELECT COUNT(*) FROM pg_extension WHERE extname='pg_trgm';" 2>/dev/null)
  if [[ "$PG_TRGM" == "1" ]]; then
    check_pass "PostgreSQL extension: pg_trgm installed"
  else
    check_fail "PostgreSQL extension: pg_trgm NOT installed"
  fi

  UNACCENT=$(docker exec vyaparnet-postgres psql -U vyaparnet -d vyaparnet -tAc \
    "SELECT COUNT(*) FROM pg_extension WHERE extname='unaccent';" 2>/dev/null)
  if [[ "$UNACCENT" == "1" ]]; then
    check_pass "PostgreSQL extension: unaccent installed"
  else
    check_fail "PostgreSQL extension: unaccent NOT installed"
  fi

  # Check GIN index
  GIN_INDEX=$(docker exec vyaparnet-postgres psql -U vyaparnet -d vyaparnet -tAc \
    "SELECT COUNT(*) FROM pg_indexes WHERE indexname='idx_prod_search_vector';" 2>/dev/null)
  if [[ "$GIN_INDEX" == "1" ]]; then
    check_pass "GIN index: idx_prod_search_vector exists"
  else
    check_fail "GIN index: idx_prod_search_vector NOT found"
  fi

  # Check trigger
  TRIGGER=$(docker exec vyaparnet-postgres psql -U vyaparnet -d vyaparnet -tAc \
    "SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_name='product_search_trigger';" 2>/dev/null)
  if [[ "$TRIGGER" == "1" ]]; then
    check_pass "Search trigger: product_search_trigger exists"
  else
    check_fail "Search trigger: product_search_trigger NOT found"
  fi

  # Check table count
  TABLE_COUNT=$(docker exec vyaparnet-postgres psql -U vyaparnet -d vyaparnet -tAc \
    "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';" 2>/dev/null)
  if [[ "$TABLE_COUNT" -ge 25 ]]; then
    check_pass "Database tables: $TABLE_COUNT tables created (expect 25+)"
  else
    check_fail "Database tables: only $TABLE_COUNT tables found (expect 25+)"
  fi

  # ─── Redis Connectivity ───────────────────────────────────────
  echo ""
  echo "--- Redis Checks ---"
  REDIS_PONG=$(docker exec vyaparnet-redis redis-cli -a localdev ping 2>/dev/null)
  if [[ "$REDIS_PONG" == "PONG" ]]; then
    check_pass "Redis: connection successful (PONG)"
  else
    check_fail "Redis: connection failed"
  fi

  # ─── API Health ───────────────────────────────────────────────
  echo ""
  echo "--- API Health Checks ---"
  if curl -sf http://localhost:3000/health &>/dev/null; then
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health)
    if [[ "$HTTP_STATUS" == "200" ]]; then
      check_pass "GET /health → 200"
    else
      check_fail "GET /health → $HTTP_STATUS (expected 200)"
    fi
  else
    check_warn "API not running locally. Start with: pnpm --filter @vyaparnet/api run dev"
  fi

  if curl -sf http://localhost:3000/health/ready &>/dev/null; then
    READY_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health/ready)
    if [[ "$READY_STATUS" == "200" ]]; then
      check_pass "GET /health/ready → 200 (DB + Redis healthy)"
    else
      check_fail "GET /health/ready → $READY_STATUS (expected 200)"
    fi
  else
    check_warn "API not running — skipping /health/ready check"
  fi

  # ─── Prisma ───────────────────────────────────────────────────
  echo ""
  echo "--- Prisma Checks ---"
  if DATABASE_URL="postgresql://vyaparnet:localdev@localhost:5432/vyaparnet" \
     pnpm --filter @vyaparnet/database exec prisma migrate status 2>&1 | \
     grep -q "Database schema is up to date"; then
    check_pass "Prisma migrations: up to date"
  else
    check_fail "Prisma migrations: not up to date or failed"
  fi

  if pnpm --filter @vyaparnet/database exec prisma validate 2>&1 | grep -q "validated"; then
    check_pass "Prisma schema: valid"
  else
    check_warn "Could not validate Prisma schema automatically"
  fi

  # ─── TypeScript ───────────────────────────────────────────────
  echo ""
  echo "--- TypeScript Checks ---"
  if pnpm typecheck 2>&1 | grep -q "error TS"; then
    check_fail "TypeScript: type errors found (run: pnpm typecheck for details)"
  else
    check_pass "TypeScript: no type errors"
  fi

  # ─── Lint ─────────────────────────────────────────────────────
  echo ""
  echo "--- Lint Checks ---"
  if pnpm lint 2>&1 | grep -qiE "(error|warning)"; then
    check_fail "ESLint: errors or warnings found"
  else
    check_pass "ESLint: no errors"
  fi

  # ─── Tests ────────────────────────────────────────────────────
  echo ""
  echo "--- Test Checks ---"
  if pnpm test 2>&1 | grep -q "PASS"; then
    check_pass "Tests: all passing"
  else
    check_fail "Tests: failures found (run: pnpm test for details)"
  fi

  # ─── Build ────────────────────────────────────────────────────
  echo ""
  echo "--- Build Checks ---"
  if pnpm build 2>&1 | grep -q "error"; then
    check_fail "Build: errors found"
  else
    check_pass "Build: all packages and apps build successfully"
  fi

  # ─── Security ─────────────────────────────────────────────────
  echo ""
  echo "--- Security Checks ---"
  if pnpm audit --audit-level=high 2>&1 | grep -q "found 0 vulnerabilities"; then
    check_pass "Dependency audit: no high/critical vulnerabilities"
  else
    check_warn "Dependency audit: vulnerabilities found (run: pnpm audit for details)"
  fi

  if [ -f ".env" ] || [ -f ".env.local" ]; then
    if git ls-files --error-unmatch .env 2>/dev/null; then
      check_fail ".env file is tracked by git (SECURITY RISK — add to .gitignore)"
    else
      check_pass ".env / .env.local: not tracked by git"
    fi
  fi

  # ─── Summary ─────────────────────────────────────────────────
  echo ""
  echo "============================================================"
  echo "SPRINT 0 VALIDATION SUMMARY"
  echo "============================================================"
  echo -e "${GREEN}PASS: $PASS${NC}"
  echo -e "${YELLOW}WARNINGS: $WARNINGS${NC}"
  echo -e "${RED}FAIL: $FAIL${NC}"
  echo ""

  if [[ $FAIL -gt 0 ]]; then
    echo -e "${RED}❌ Sprint 0 NOT complete. Fix failures before proceeding to Sprint 1.${NC}"
    exit 1
  elif [[ $WARNINGS -gt 0 ]]; then
    echo -e "${YELLOW}⚠️  Sprint 0 mostly complete. Review warnings.${NC}"
    exit 0
  else
    echo -e "${GREEN}✅ Sprint 0 COMPLETE. All checks passed. Ready for Sprint 1.${NC}"
    exit 0
  fi

Make executable:
  chmod +x scripts/verify-setup.sh
```

---

### PHASE 12: FINAL COMMIT AND CLEANUP
**Estimated time: Day 10**

---

#### Step 12.1 — Final Verification Run

```
Run in this exact order:

1. docker-compose up -d
   → Wait for all services: healthy

2. pnpm install
   → Zero errors

3. pnpm --filter @vyaparnet/database exec prisma generate
   → "Generated Prisma Client"

4. DATABASE_URL="postgresql://vyaparnet:localdev@localhost:5432/vyaparnet" \
   pnpm --filter @vyaparnet/database exec prisma migrate deploy
   → "All migrations have been successfully applied"

5. pnpm build
   → "Tasks: X successful"

6. pnpm typecheck
   → Zero type errors

7. pnpm lint
   → Zero errors, zero warnings

8. pnpm --filter @vyaparnet/api run dev
   → "VyaparNet API running on http://0.0.0.0:3000"

9. curl http://localhost:3000/health
   → { "status": "ok", ... }

10. curl http://localhost:3000/health/ready
    → { "status": "ready", "checks": { "database": "ok", "redis": "ok" } }

11. pnpm test
    → All tests passing

12. bash scripts/verify-setup.sh
    → All PASS, zero FAIL

13. Adminer: http://localhost:8080
    → Login with vyaparnet/localdev/vyaparnet
    → Verify all tables visible
```

#### Step 12.2 — Final Commit

```
Commit all Sprint 0 work:

git add -A
git commit -m "chore(monorepo): complete sprint 0 foundation

- Initialize Turborepo + pnpm monorepo workspace
- Create packages: config, types, database, ui, utils
- Scaffold apps: api, web, admin, seller-dashboard, worker
- Apply Prisma schema v4.3 (all 30+ domain models)
- Enable pg_trgm + unaccent extensions
- Add GIN indexes for full-text search
- Add product search trigger
- Configure Docker Compose (PostgreSQL 15 + Redis 7)
- Scaffold NestJS core modules: Prisma, Redis, BullMQ, Logger, Health
- Add graceful shutdown (SIGTERM handler)
- Configure GitHub Actions CI pipeline
- Add Husky + commitlint + lint-staged
- Add CODEOWNERS + PR template
- Create comprehensive .env.example

Sprint 0 validation: all checks passing
Next: Sprint 1 — Authentication & Identity"

git push origin develop
```

---
 ## Common Sprint 0 Failure Modes

| Failure | Cause | Resolution |
|---|---|---|
| Prisma generate failure | Invalid schema | Run `prisma validate` |
| PostgreSQL unhealthy | Volume corruption | Remove Docker volume and recreate |
| Redis auth mismatch | Wrong password | Verify REDIS_PASSWORD |
| pnpm workspace resolution issues | Corrupted node_modules | Remove node_modules and reinstall |
| Prisma client import failure | generate step skipped | Run `pnpm --filter @vyaparnet/database generate` |
| Docker networking issues | stale bridge network | recreate docker network |
| TypeScript build cascade failures | package boundary violation | inspect imports |
| Turbo cache inconsistencies | stale cache | run `turbo clean` |

## SECTION 10: COMPLETE SPRINT VALIDATION GATE

Run `bash scripts/verify-setup.sh` to execute automatically.

Manual verification items (not automated):

```
INFRASTRUCTURE
✅ docker-compose up → postgres: healthy, redis: healthy, adminer: running
✅ GET /health → 200, { status: "ok", timestamp, uptime }
✅ GET /health/ready → 200, { status: "ready", checks: { database: "ok", redis: "ok" } }
✅ X-Request-Id header returned on every response
✅ Adminer accessible at localhost:8080

DATABASE
✅ prisma migrate status → "Database schema is up to date"
✅ pg_trgm extension active in PostgreSQL
✅ unaccent extension active in PostgreSQL
✅ idx_prod_search_vector GIN index exists
✅ idx_prod_name_trgm GIN index exists
✅ product_search_trigger exists
✅ search_doc_trigger exists
✅ Autovacuum settings applied to Inventory, Payment, EventOutbox, Order
✅ All 30+ Prisma models have corresponding tables
✅ All @@index directives from schema v4.3 applied

CODE QUALITY
✅ pnpm typecheck → zero TypeScript errors across ALL packages
✅ pnpm lint → zero ESLint errors, zero warnings
✅ pnpm format:check → zero Prettier violations
✅ No `any` types in any file (strict TypeScript)
✅ No `console.log` in any source file (Logger used instead)
✅ No secrets hardcoded anywhere (gitleaks clean)

BUILD
✅ pnpm build → all packages and apps build successfully
✅ Turborepo cache working (second build faster than first)
✅ Docker build for apps/api succeeds

TESTS
✅ pnpm test → all tests passing (zero failures)
✅ Health endpoint tests: GET /health → 200, GET /health/ready → 200
✅ Error envelope test: nonexistent route → standard error format

GIT GOVERNANCE
✅ .gitignore: .env, .env.local excluded from tracking
✅ CODEOWNERS file committed
✅ PR template committed
✅ .husky/pre-commit → lint-staged runs on commit
✅ .husky/commit-msg → commitlint validates commit message
✅ Bad commit message test: rejected by commitlint
✅ Good commit message test: accepted

SECURITY
✅ pnpm audit → zero HIGH or CRITICAL vulnerabilities
✅ gitleaks scan → zero secrets found in git history
✅ .env.example committed → .env.local gitignored
✅ PostgreSQL not exposed beyond localhost:5432
✅ Redis not exposed beyond localhost:6379

MONOREPO
✅ Build order correct: packages/* before apps/*
✅ Package isolation: apps/* do not import from other apps/*
✅ packages/database imports: only apps/* import from it, not other packages
✅ packages/config: zero runtime code (tooling only)
✅ Node 20 enforced via .nvmrc and engines field

ENVIRONMENT
✅ .env.example complete (all Sprint 0–9 variables documented)
✅ ConfigModule validates env vars at startup
✅ API fails to start with invalid DATABASE_URL (test: set invalid URL)

GRACEFUL SHUTDOWN
✅ SIGTERM → app.close() → Prisma disconnect → Redis quit → process.exit(0)
  (test: kill -TERM <pid> while API running → clean shutdown within 30s)
```

---

## SECTION 11: FAILURE CONDITIONS

Sprint 0 is considered FAILED and must not proceed to Sprint 1 if ANY of the following occur:

| Failure | Severity |
|---|---|
| Any TypeScript type errors | BLOCKING |
| Prisma schema validation fails | BLOCKING |
| PostgreSQL container unhealthy after 10 retries | BLOCKING |
| Redis container unhealthy after 10 retries | BLOCKING |
| pg_trgm or unaccent extension not installed | BLOCKING |
| GIN index idx_prod_search_vector not created | BLOCKING |
| product_search_trigger not created | BLOCKING |
| `pnpm build` fails for any package/app | BLOCKING |
| `pnpm test` has any failing test | BLOCKING |
| GET /health does not return 200 | BLOCKING |
| GET /health/ready does not return 200 with both checks OK | BLOCKING |
| Any HIGH or CRITICAL security vulnerability | BLOCKING |
| Secret found in git history by gitleaks | BLOCKING |
| .env or .env.local tracked by git | BLOCKING |
| App imports from another app (cross-app dependency) | BLOCKING |
| Package imports from app (reverse dependency) | BLOCKING |
| `any` type used in any source file | BLOCKING |
| `console.log` in any source file | BLOCKING |
| Commitlint not enforcing commit message format | BLOCKING |
| Graceful shutdown takes > 30 seconds | BLOCKING |
| Prisma migration has missing extensions or indexes | BLOCKING |

---

## SECTION 12: ROLLBACK STRATEGY

Sprint 0 operates entirely locally and on staging (no production yet). Rollbacks are simple.

### Checkpoint Rollback Guide

| Checkpoint | What to Rollback | Command |
|---|---|---|
| CHECKPOINT-0.1 | Git init | `rm -rf vyaparnet/` and restart |
| CHECKPOINT-0.2 | pnpm workspace | `rm -rf node_modules pnpm-lock.yaml` then `pnpm install` |
| CHECKPOINT-0.3 | Turborepo | Fix `turbo.json` and re-run `pnpm install` |
| CHECKPOINT-0.4 | packages/config | Delete and recreate the package |
| CHECKPOINT-0.5 | packages/* stubs | Delete affected package and recreate |
| CHECKPOINT-0.6 | Prisma schema | Edit `schema.prisma`, run `prisma validate`, re-migrate |
| CHECKPOINT-0.7 | Docker | `docker-compose down -v` then `docker-compose up -d` |
| CHECKPOINT-0.8 | Git governance | Fix hook files, re-run `pnpm exec husky init` |
| CHECKPOINT-0.9 | NestJS scaffold | Delete `apps/api/src/` and rebuild |
| CHECKPOINT-0.10 | Next.js scaffold | Delete `apps/web/` and re-scaffold |

### Database Rollback

If migrations are broken:
```bash
# Reset local DB only (NEVER on staging/production)
DATABASE_URL="postgresql://vyaparnet:localdev@localhost:5432/vyaparnet" \
pnpm --filter @vyaparnet/database exec prisma migrate reset

# This drops all data, re-runs all migrations, re-seeds
# Acceptable in Sprint 0 — no real data exists
```

### Docker Rollback

If Docker Compose is broken:
```bash
docker-compose down -v    # Removes containers AND volumes (all local data)
docker-compose up -d      # Fresh start
```

---

## SECTION 13: AI EXECUTION SAFETY RULES

### What AI Agents MAY Do in Sprint 0

| Task | Permission |
|---|---|
| Generate boilerplate NestJS module files | ✅ ALLOWED — with human review |
| Generate TypeScript interfaces and types | ✅ ALLOWED — with human review |
| Generate Docker Compose service definitions | ✅ ALLOWED — human verifies health checks |
| Generate GitHub Actions CI workflow | ✅ ALLOWED — human verifies security steps |
| Generate Tailwind config from design token values | ✅ ALLOWED — values come from UX System doc |
| Generate Vitest test files | ✅ ALLOWED — human reviews test coverage |
| Generate Prettier/ESLint config | ✅ ALLOWED — human verifies rules |

### What AI Agents MUST NOT Do

| Task | Prohibition | Reason |
|---|---|---|
| Modify Prisma schema v4.3 | ❌ NEVER | Schema is frozen — any change requires DDR |
| Simplify the Prisma schema | ❌ NEVER | Every model is needed for Sprint 1–9 |
| Add `any` types | ❌ NEVER | TypeScript strict is an absolute constraint |
| Use `console.log` | ❌ NEVER | Use NestJS Logger or Pino only |
| Import from `@prisma/client` directly | ❌ NEVER | Always import from `@vyaparnet/database` |
| Create a new PrismaClient() in app code | ❌ NEVER | Use PrismaService singleton only |
| Skip the GIN index raw SQL | ❌ NEVER | Search breaks without it |
| Skip the search trigger | ❌ NEVER | search_vector never populates |
| Add business logic in Sprint 0 | ❌ NEVER | Sprint 0 = infrastructure only |
| Add auth endpoints | ❌ NEVER | Sprint 1 |
| Add domain APIs | ❌ NEVER | Sprint 2+ |
| Introduce new npm packages beyond this pack | ❌ REQUIRES DDR | Locked decisions |
| Cross-app imports | ❌ NEVER | Package boundary violation |

### Human Review Requirements

The following tasks require human review BEFORE committing:

| Task | Review Type |
|---|---|
| Prisma schema.prisma content | Architecture audit against v4.3 document |
| Migration SQL (manual additions) | Line-by-line SQL review |
| Docker Compose health checks | Verify they use actual health commands, not just port checks |
| CI pipeline security steps | Verify gitleaks + pnpm audit included |
| CODEOWNERS assignments | Verify all critical paths covered |
| GlobalExceptionFilter | Security review — ensure no stack traces exposed |
| main.ts graceful shutdown | Verify all connections closed before exit |
| RedisService password handling | Security review — verify not logged |

### Anti-Hallucination Constraints

AI agents MUST:
- Reference the exact file names from the architecture document list at the top of this pack
- Not invent configuration values not present in `.env.example`
- Not assume Prisma model names — always check against schema v4.3
- Not assume queue names — always use the exact names from BullMQModule
- Not create files not in the folder structure defined in Section 7
- Not add npm packages not explicitly listed in this implementation pack

---

## SECTION 14: ESTIMATED COMPLEXITY AND TIME

| Phase | Name | Estimated Days | Complexity |
|---|---|---|---|
| Phase 1 | Workspace Initialization | Day 1 | Low |
| Phase 2 | Shared Packages (config, types, utils, ui) | Day 1 | Low |
| Phase 2.5 | packages/database (Prisma v4.3) | Days 2–3 | High |
| Phase 3 | Docker Foundation | Day 2 | Low-Medium |
| Phase 4 | Environment Management | Day 2 | Low |
| Phase 5 | Git Governance | Day 3 | Low |
| Phase 6 | NestJS API Scaffold | Days 3–5 | Medium-High |
| Phase 7 | API Dockerfile | Day 5 | Medium |
| Phase 8 | Next.js Applications | Days 5–6 | Medium |
| Phase 9 | CI/CD Pipeline | Day 7 | Medium |
| Phase 10 | Testing Foundation | Day 8 | Medium |
| Phase 11 | Validation Script | Day 9 | Low |
| Phase 12 | Final Verification + Commit | Day 10 | Low |

**Total: 10 working days (2 weeks)**

**Highest complexity task:** Phase 2.5 (packages/database) — Prisma schema v4.3 application with manual SQL additions. This must be done correctly the first time. If the GIN indexes and search trigger are missing, Sprint 2 (product search) cannot function.

**Most time-sensitive task:** Phase 6 (NestJS scaffold) — The core module structure established here defines the pattern for all 16 business modules added in Sprints 1–8.

---

## SECTION 15: SPRINT 0 → SPRINT 1 HANDOFF

When Sprint 0 validation gate is fully passed (`bash scripts/verify-setup.sh` → zero FAIL):

1. Update `context/CURRENT_PHASE.md`:
   - Sprint: Sprint 1 — Authentication & Identity
   - Sprint 0 tasks: all DONE
   - Sprint 1 tasks: all NOT STARTED

2. Commit:
   ```
   git add context/CURRENT_PHASE.md
   git commit -m "docs(monorepo): complete sprint 0, begin sprint 1"
   git push origin develop
   ```

3. Sprint 1 team reads:
   - `implementation/master-roadmap/MASTER_IMPLEMENTATION_ROADMAP.md` — Sprint 1 section
   - `context/CURRENT_PHASE.md`
   - `context/LOCKED_DECISIONS.md`
   - `architecture/implementation/VyaparNet_Implementation_Architecture_Official_Freeze_v1.md` — Sections 8, 9 (Auth/RBAC)
   - `architecture/api/VyaparNet_API_Contracts_Backend_Scaffold_Blueprint.md` — Section 2 (Auth contracts)

4. Sprint 1 generates its own Detailed Sprint Implementation Pack before any code is written.

---

**END OF SPRINT 0 DETAILED IMPLEMENTATION PACK**

*This document is the complete, execution-grade implementation authority for VyaparNet Sprint 0.*
*All subsequent Sprint Implementation Packs must follow this same format and level of detail.*
*No Sprint 1 implementation begins until Sprint 0 validation gate passes with zero failures.*