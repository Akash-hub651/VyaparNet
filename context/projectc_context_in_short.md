# VyaparNet — Locked Decisions Registry
## Version: v1.0 | Status: HARD LOCK
## Updated: 2025-05-24

---

## OVERVIEW

This file is the single source of truth for all locked architectural
decisions in VyaparNet Phase 1.

Changing any decision in this file requires:
- A written DDR (Design Decision Record)
- CTO approval
- Backward-compatible migration plan
- Announcement to all contributors

AI agents and engineers MUST treat this file as authoritative.

---

## SECTION 1: LOCKED STACK DECISIONS

| Area | Decision | Rationale |
|---|---|---|
| Backend framework | NestJS (modular monolith) | Type-safe, modular, enterprise-grade, AI-dev-friendly |
| Frontend framework | Next.js 14 (App Router) | SSR, PWA, fast iteration |
| Styling | Tailwind CSS + Shadcn/UI | Utility-first, low bundle, component library |
| Database | PostgreSQL 15 | ACID, JSONB, GIN search, enterprise-proven |
| ORM | Prisma | Type-safe, migration-safe, AI-coding friendly |
| Cache | Redis 7 | Sessions, OTP, rate-limiting, queues |
| Queue system | BullMQ (Redis-backed) | Async jobs, lightweight, sufficient for MVP |
| Auth method | OTP + JWT | Bharat-first, phone-based, low friction |
| Password hashing | Argon2id | Modern, safer than bcrypt |
| Search (MVP) | PostgreSQL FTS with GIN indexes | Sufficient for MVP scale |
| Search (future) | OpenSearch placeholder | Schema supports migration, not in Phase 1 |
| Mobile strategy | PWA first, native app later | Fast iteration, Bharat-friendly |
| Storage | S3-compatible (Cloudflare R2 / AWS S3) | Images, invoices, proofs |
| CDN | Cloudflare | Edge cache, SSL, DDoS, India PoPs |
| Infra (Phase 1) | Docker Compose on EC2/VM | Simple, cheap, sufficient for <1K users |
| Infra (Phase 2) | AWS ECS / DigitalOcean | Managed, auto-scalable |
| CI/CD | GitHub Actions | Simple, AI-friendly, scalable |
| Monitoring | Sentry + Prometheus + Grafana + Loki | Error + infra + viz |
| Logging | Pino (structured JSON) | Fast, structured, production-ready |
| Testing | Vitest + Supertest + Playwright | Integration-first |
| API style | REST only | Debuggable, predictable, versioned |
| Monorepo tooling | Turborepo + pnpm | Build caching, workspace management |
| Payments | Razorpay (COD default) | India market, UPI, COD |

---

## SECTION 2: LOCKED INFRA DECISIONS

| Decision | Rule |
|---|---|
| Architecture pattern | Modular monolith — NOT microservices |
| DB access | Prisma ORM only — NO raw SQL in application code |
| Secret management | Environment variables only — NEVER in code |
| Container base | Node.js 20 Alpine — multi-stage builds |
| TLS | TLS 1.3 minimum, terminate at Cloudflare/ALB |
| Private network | DB and Redis NEVER exposed to public internet |
| Image format | WebP (JPEG fallback) — NEVER uncompressed uploads served |
| Session storage | Redis only — NEVER in-memory or DB-only |
| Migrations | Prisma migrations only — NEVER raw ALTER TABLE in application |
| Event persistence | Outbox pattern — NEVER fire-and-forget for critical events |

---

## SECTION 3: LOCKED RUNTIME DECISIONS

| Decision | Rule |
|---|---|
| Concurrency control | Optimistic locking via `version` column — NO distributed locks in DB |
| Inventory safety | Redis lock (TTL 30s) + optimistic locking — MANDATORY for all stock mutations |
| Payment safety | Idempotency key (Redis TTL 24h) — MANDATORY for all payment writes |
| Webhook security | HMAC signature verification — MANDATORY for all incoming webhooks |
| Audit logging | Append-only, immutable — NEVER UPDATE or DELETE audit records |
| Timestamps | UTC everywhere — client converts to local timezone |
| Error format | Standard envelope: `{ success, error: { code, message, details } }` |
| Health checks | `/health` (liveness) + `/ready` (readiness) — MANDATORY on all services |
| Graceful shutdown | SIGTERM → drain (30s max) → close DB/Redis → exit — MANDATORY |
| Soft delete | `isDeleted + deletedAt` — NEVER hard delete users, orders, payments |
| Segment isolation | `segment` column on every segment-scoped table — filter enforced at DB layer |

---

## SECTION 4: LOCKED SCALING DECISIONS

| Decision | Rule |
|---|---|
| Scaling strategy | Horizontal (more containers) before vertical (bigger machine) |
| DB scaling order | Optimize queries first → add indexes → vertical scale → read replicas |
| Cache-first reads | Always check Redis before hitting DB for hot data |
| Queue isolation | Separate queues per concern — payments never block notifications |
| Backpressure | Queue depth alerts at 10K, throttle at 50K, emergency at 100K |
| Read/write split | Phase 2 only — not in MVP unless DB CPU >80% consistently |

---

## SECTION 5: LOCKED API DECISIONS

| Decision | Rule |
|---|---|
| Versioning | URL path versioning: `/api/v1/` |
| Pagination | Cursor-based for lists. NEVER unbounded queries. Max limit: 100 |
| Sorting | `?sortBy=createdAt&sortOrder=desc` |
| Filtering | URL query params: `?status=ACTIVE&segment=TEXTILE` |
| Response format | Always wrapped in standard envelope |
| Idempotency keys | Required on all POST/PUT that mutate critical data |
| Rate limit headers | `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After` |
| Deprecation | 9-month sunset window, `Sunset` + `Deprecation` headers |
| Breaking changes | NEVER break v1 without v2 + dual-publish + migration guide |

---

## SECTION 6: LOCKED NAMING CONVENTIONS

| Layer | Convention | Example |
|---|---|---|
| DB tables | snake_case, plural | `users`, `order_items` |
| DB columns | snake_case | `created_at`, `is_active` |
| Prisma models | PascalCase, singular | `User`, `OrderItem` |
| TypeScript types | PascalCase | `CreateOrderDto` |
| TypeScript variables | camelCase | `orderItem`, `supplierId` |
| API routes | kebab-case | `/api/v1/supplier-offers` |
| Functions | camelCase | `createOrder`, `updateInventory` |
| Constants | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT` |
| Enums | PascalCase | `OrderStatus`, `SegmentType` |
| DTOs | PascalCase + `Dto` suffix | `CreateOrderDto` |
| Events | PascalCase + past tense | `OrderCreated`, `PaymentFailed` |
| Queue jobs | camelCase | `sendNotification` |
| Feature branches | `feature/{module}-{desc}` | `feature/auth-otp` |
| Env vars | UPPER_SNAKE_CASE | `DATABASE_URL` |

**Strict rules:** Singular for entity names, plural for tables.
No abbreviations (`user` not `usr`). No mixed naming styles within same entity.

---

## SECTION 7: LOCKED MODULE BOUNDARIES

| Rule |
|---|
| A module NEVER imports from another module's internal files |
| Only public service APIs and shared packages cross module boundaries |
| No direct DB queries across module boundaries |
| Cross-module communication: domain events via EventBus OR direct public service call |
| Cross-module transactions: Outbox Pattern (eventual consistency) |
| No distributed DB transactions across modules |

---

## SECTION 8: FORBIDDEN COMPLEXITY (PHASE 1)

The following MUST NOT be introduced in Phase 1 under any circumstances:

| Forbidden | Reason | When Allowed |
|---|---|---|
| GraphQL | Not approved | Never in Phase 1 |
| gRPC | Not approved | Never in Phase 1 |
| Microservices | Premature | Phase 3 (team >8, justified by metrics) |
| Kubernetes | Premature | Phase 2+ (when Docker Compose insufficient) |
| Kafka / RabbitMQ | Premature | Phase 2+ (events >100K/day) |
| OpenSearch | Premature | Phase 2 (search >100 req/sec) |
| Native mobile app | Premature | Phase 2+ (after PWA validated) |
| AI/ML models | Premature | Phase 3 (after sufficient data) |
| Fintech/lending | Premature | Phase 3 |
| Self-serve marketplace | Premature | Phase 2 (after trust layer solid) |
| Graph databases | Premature | Never in Phase 1 |
| Data warehouse | Premature | Phase 2 |
| Distributed saga orchestration | Premature | Phase 3 (microservices era) |
| Real-time WebSocket | Premature | Phase 2 (polling sufficient in MVP) |
| Multi-region infra | Premature | Phase 3 |
| Autoscaling clusters | Premature | Phase 2 |
| Service mesh | Premature | Phase 3 |
| Complex A/B testing | Premature | Phase 2 |
| WhatsApp Business API | Premature | Phase 2 |

---

## SECTION 9: MANDATORY COLUMNS (ALL OPERATIONAL TABLES)

Every Prisma model that is operational MUST have: