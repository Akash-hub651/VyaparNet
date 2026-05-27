# VyaparNet — Current Phase
## Version: v1.0 | Status: LIVE (update each sprint)
## Updated: 2026-05-26

---

## CURRENT PHASE: IMPLEMENTATION — SPRINT 3

**Phase:** Implementation Phase 1 (MVP)
**Sprint:** Sprint 3 — Inventory & Optimistic Lock
**Sprint Duration:** 2 weeks
**Sprint Goal:** Robust inventory management with optimistic locking to ensure zero oversell under concurrent load.

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

## SPRINT 1 TASKS (COMPLETED)

| Task | Points | Status |
|---|---|---|
| OTP Service & Rate Limiting | 5 | DONE |
| Token & Session Management (JWT, Redis) | 5 | DONE |
| Authentication Workflow | 5 | DONE |
| Auth Controllers & OpenAPI Specs | 3 | DONE |
| User Onboarding Module | 3 | DONE |
| Unit & Integration Testing | 4 | DONE |
| Staging Deployment (Docker, DB, Redis) | 4 | DONE |

**Sprint 1 Done Criteria:** Login works end-to-end on Staging container with simulated limits, OTP logs, token rotations, and proper environment configuration. ✅ PASSED

---

## SPRINT 2 TASKS (COMPLETED)

| Task | Points | Status |
|---|---|---|
| Category & Tag Models | 3 | DONE |
| Product Catalog Management | 5 | DONE |
| SearchProductDocument Pipeline | 5 | DONE |
| GIN Search Query Optimizer | 5 | DONE |
| Media / Image upload stubs | 3 | DONE |
| Seller Product Dashboard API | 3 | DONE |
| Buyer Search API | 3 | DONE |

**Sprint 2 Done Criteria:** A seller can create a product. A buyer can successfully search and filter products using the fast GIN indexed search endpoints. ✅ PASSED

---

## SPRINT 3 TASKS (NOT STARTED)

| Task | Points | Status |
|---|---|---|
| Inventory Schema & Migrations | 3 | NOT STARTED |
| Inventory Core Service (Optimistic Locking) | 5 | NOT STARTED |
| Reserve & Release Inventory Workflows | 5 | NOT STARTED |
| Product & Inventory Data Sync | 3 | NOT STARTED |
| Concurrency Stress Tests | 5 | NOT STARTED |

**Sprint 3 Done Criteria:** Inventory can be reserved reliably and concurrent reservation requests never oversell.

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

None. Sprint 2 completed successfully. Sprint 3 ready for detailed planning pack generation.

---

## IMMEDIATE NEXT ACTIONS (THIS WEEK)

1. Generate Sprint 3 Detailed Implementation Pack (`sprint3.md`).
2. Review Inventory schema and optimistic concurrency control design.
3. Plan load tests for inventory reservation.

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