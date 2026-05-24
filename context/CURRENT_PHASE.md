# VyaparNet — Current Phase
## Version: v1.0 | Status: LIVE (update each sprint)
## Updated: 2025-05-24

---

## CURRENT PHASE: IMPLEMENTATION — SPRINT 0

**Phase:** Implementation Phase 1 (MVP)
**Sprint:** Sprint 0 — Foundation
**Sprint Duration:** 2 weeks
**Sprint Goal:** Local development environment working.
              CI/CD green. Team onboarded. Infra skeleton ready.

---

## ARCHITECTURE PHASE STATUS

| Document | Status | Date Frozen |
|---|---|---|
| PRDv2 | FROZEN | 2025-05-22 |
| Information Architecture | FROZEN | 2025-05-22 |
| Module Breakdown | FROZEN | 2025-05-22 |
| DB & Infra Architecture | FROZEN | 2025-05-22 |
| Prisma Schema v4.3 | FROZEN | 2025-05-22 |
| Database Indexing Strategy | FROZEN | 2025-05-22 |
| Implementation Architecture | FROZEN | 2025-05-22 |
| API Contracts & Backend Scaffold | FROZEN | 2025-05-22 |
| Product UX System | FROZEN | 2025-05-22 |
| Future Ready Backlog | BACKLOG | 2025-05-22 |
| Workflow Sequence Diagrams | FROZEN | 2025-05-22 |
| Deployment Runtime Architecture | FROZEN | 2025-05-24 |
| Sprint Roadmap | FROZEN | 2025-05-24 |
| Project Context | FROZEN | 2025-05-24 |

**Architecture work: 100% complete. Implementation begins now.**

---

## SPRINT 0 TASKS (IN PROGRESS)

| Task | Points | Status |
|---|---|---|
| Monorepo setup (Turborepo + pnpm) | 3 | NOT STARTED |
| Docker Compose (PostgreSQL + Redis) | 3 | NOT STARTED |
| Next.js scaffold (apps/web) | 3 | NOT STARTED |
| NestJS scaffold (apps/api) | 5 | NOT STARTED |
| Prisma schema apply (packages/database) | 3 | NOT STARTED |
| Core infra modules (Prisma, Redis, BullMQ, Logger) | 3 | NOT STARTED |
| GitHub Actions CI/CD pipeline | 3 | NOT STARTED |
| Env management (.env.example, staging config) | 2 | NOT STARTED |
| Health check endpoints (/health, /ready) | 2 | NOT STARTED |
| Team onboarding (docs read, local setup) | 2 | NOT STARTED |

**Sprint 0 Done Criteria:** `docker-compose up` starts all services.
`/health` returns 200. CI pipeline green. `pnpm build` passes.

---

## SPRINT SEQUENCE (FULL MVP)

| Sprint | Focus | Key Gate |
|---|---|---|
| **0** | Foundation: Monorepo, Docker, CI/CD | `docker-compose up` + CI green |
| **1** | Auth: OTP, JWT, RBAC, Sessions | Login works end-to-end on mobile |
| **2** | Products: Catalog, Images, Search (GIN) | Seller lists → Buyer searches |
| **3** | Inventory: Reserve, Optimistic Lock | Zero oversell under concurrent load |
| **4** | Cart + Orders + Payments (COD + Razorpay) | Full checkout working |
| **5** | Buyer Orders + Seller Dashboard | Both sides functional |
| **6** | Notifications: SMS, Email, In-App | Order updates delivered reliably |
| **7** | Admin: Moderation, Product Approval | Platform governed |
| **8** | RFQ + B2B Features | RFQ lifecycle end-to-end |
| **9** | Hardening + Observability + Release | Production candidate |

**Total duration:** ~20 weeks (10 sprints × 2 weeks)
**Beta target:** End of Sprint 8 (if Sprint 6–7 stable)
**GA target:** End of Sprint 9 (if Sprint 8–9 stable)

---

## MVP CUTLINE SUMMARY

### IN (Must Ship)
Auth, User Onboarding, Product Catalog (CRUD), Basic Search (GIN),
Inventory Reservation, Cart, Order Placement, COD Payment,
Razorpay Online Payment, Seller Dashboard, Buyer Orders,
Basic Notifications (SMS/Email), Admin Moderation, Basic RFQ,
Mobile-Responsive PWA.

### OUT (Phase 2+)
OpenSearch, Kafka, Microservices, Kubernetes, Multi-tenancy,
Advanced fraud AI, WhatsApp integration, Credit/BNPL,
Bulk CSV upload, A/B testing, Real-time WebSocket,
Advanced analytics dashboard, Native mobile app, Multi-region.

---

## CURRENT BLOCKERS

None. Architecture phase complete. Implementation can begin immediately.

---

## IMMEDIATE NEXT ACTIONS (THIS WEEK)

1. Initialize Git repository (`vyaparnet`)
2. Set up Turborepo + pnpm workspace
3. Scaffold `apps/web` (Next.js 14)
4. Scaffold `apps/api` (NestJS 10)
5. Create `packages/database` (Prisma init)
6. Create `packages/types`, `packages/ui`, `packages/config`
7. Create `docker-compose.yml` (PostgreSQL 15 + Redis 7)
8. Apply Prisma schema (from Schema v4.3 frozen document)
9. Set up GitHub Actions CI (lint → typecheck → test → build)
10. Verify: `docker-compose up` → all healthy → `/health` returns 200

---

## HOW TO UPDATE THIS FILE

After every sprint:
1. Change Sprint number and Goal at the top
2. Mark completed tasks as DONE
3. Add new sprint tasks
4. Update any blockers
5. Update Immediate Next Actions
6. Commit with message: `docs: update CURRENT_PHASE.md Sprint N`

---

## KEY CONTACTS / OWNERSHIP

| Area | Owner |
|---|---|
| Overall architecture | CTO |
| Backend API + Workers | Backend Lead |
| Frontend (Web + Admin) | Frontend Lead |
| Infra + CI/CD + DevOps | DevOps |
| Product + UX | Product Manager |
| Security | CTO |
| Database + Schema | Backend Lead |
| On-call (primary) | DevOps |
| On-call (secondary) | Backend Lead |