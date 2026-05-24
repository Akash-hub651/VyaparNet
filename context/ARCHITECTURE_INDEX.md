# VyaparNet — Architecture Index
## Version: v1.0 | Status: REFERENCE
## Updated: 2025-05-24

---

## PURPOSE

This file is the master navigation layer for all VyaparNet architecture
documents. Use it to instantly locate authoritative knowledge for any
system area.

AI agents should consult this index first before answering any
architecture, implementation, or governance question.

---

## DOCUMENT REGISTRY

| # | Document | Version | Status | Governs |
|---|---|---|---|---|
| 1 | VyaparNet_Master_Workflow.html | — | FROZEN | Business model, order flow, supplier management, inventory strategy, buyer experience, AI roadmap, org structure, scaling roadmap |
| 2 | VyaparNet_PRDv2_Final_Freeze.docx | v2.0 | FROZEN | Product vision, architecture decisions, tech stack, naming conventions, error handling, idempotency, API contracts, soft delete, data retention, concurrency, MVP scope, workflow definitions, database foundations, constraints, non-goals, feature flags, search evolution, event strategy, segment isolation, security baseline, scalability, deployment, operational philosophy, change control |
| 3 | VyaparNet_IA_Final_Master_Freeze_v3.docx | v3.0 | FROZEN | Information architecture, navigation structure, buyer/seller/operator/admin flows, screen hierarchies, segment isolation in UX, notification architecture, offline-first design, exception management, ownership tracking, escalation systems, multilingual strategy, WhatsApp integration, draft states, dynamic taxonomy |
| 4 | VyaparNet_Module_Breakdown_Final_Enterprise_Freeze_v2.docx | Enterprise v2 | FROZEN | Module architecture, module boundaries, module APIs, module events, module dependencies, module folder structure, communication rules, enterprise module additions (Media, Config, Workflow, Cache, Observability, Operator, Security) |
| 5 | VyaparNet_DB_Infra_Architecture.md | Enterprise v2.0 | FROZEN | Data classification matrix, state machine definitions, multi-tenancy strategy, database partitioning, read/write split, concurrency and inventory consistency, event versioning, connection pooling (PgBouncer), full-text search implementation, infra environments, deployment architecture, secrets management, CDN/storage governance, monitoring/alerting, disaster recovery, schema migration governance, API deprecation policy, RBAC deep dive, fraud engine placeholder |
| 6 | VyaparNet_SCHEMA_v4_3_FINAL_FREEZE.md | v4.3 | FROZEN | Complete Prisma schema (30 domain models, all enums, all indexes, all relations) |
| 7 | VyaparNet_Database_Indexing_Strategy_Official_Freeze_v1.md | v1.0 | FROZEN | Index priority tiers, index ownership, access pattern matrix, hot path identification, composite index plan per domain, full-text search strategy, partial and covering indexes, pagination strategy, partition-aware indexing, slow query SLAs, write amplification mitigation, deadlock detection, index retirement policy, materialized views, query governance rules, cache governance, connection pool tuning (PgBouncer), failover query strategy, monitoring and maintenance |
| 8 | VyaparNet_Implementation_Architecture_Official_Freeze_v1.md | v1.1 | FROZEN | Monorepo strategy, module-first architecture, repository pattern, service layer, transaction boundary design, outbox pattern, queue architecture, retry/DLQ/idempotency, authentication/RBAC implementation, validation architecture (Zod), error handling strategy, logging/observability, caching/invalidation, search indexing flow, background job workers, API design philosophy, security hardening, file upload security, configuration/feature flags, concurrency/payment safety, testing/deployment strategy, production hardening (22+ sections), folder structure, execution transition |
| 9 | VyaparNet_API_Contracts_Backend_Scaffold_Blueprint.md | v1.0 | FROZEN | API standards, authentication contracts, user/business APIs, product/inventory APIs, order/payment APIs, search/discovery APIs, notification APIs, webhook contracts, idempotency/rate-limiting/error standards, monorepo architecture, core infrastructure setup, module scaffold, auth/RBAC implementation, queue workers, Docker/local dev, CI/CD pipeline, API naming/deprecation governance, security hardening, operational standards, advanced infrastructure, testing/QA strategy |
| 10 | VyaparNet_Product_UX_System_v1.md | v1.2 | FROZEN | UX philosophy, design language system, spacing/layout, component system (buttons, inputs, cards, tables, modals, drawers, toasts, tabs, badges, loaders), universal component states matrix, navigation system, search-first UX, category/filter UX, all role-based experiences (buyer, seller, admin, operational manager, delivery, finance, support, field executive), order/cart experience, payment/checkout flow, notifications/communication UX, analytics/reporting UX, security-aware UX, performance rules, accessibility, offline/low-network mode, multilingual/Bharat UX, design tokens, semantic tokens, token versioning, accessibility deep-dive, chart governance, file upload UX, component architecture, iconography, empty state strategy, design system file structure, design QA governance, support recovery UX, global layout rules, visual hierarchy governance, microcopy governance, skeleton system, image cropping rules, motion system, responsive behavior matrix, data density rules, form UX system, trust system UX, real-time UX strategy, conflict handling UX, procurement workflow UX, performance budgets, error recovery UX, mobile UX, PWA install UX, role permission UX, observability UX, design decision records |
| 10.1 | VyaparNet_FUTURE_READY_Backlog.md | — | BACKLOG | Post-MVP backlog: A/B testing governance, i18n edge cases, design analytics platform, Storybook documentation strategy, procurement workflow deep dive, design operations scale tools |
| 11 | VyaparNet_Workflow_Sequence_Diagrams_v1.md | v1.3 | FROZEN | All system workflows with Mermaid diagrams: auth (OTP, refresh), user onboarding, product creation, search, inventory reservation (critical), cart management, order placement (complete), payment (webhook + idempotency), procurement RFQ, notification delivery, operator QC sync, admin suspension, queue/event outbox, observability, disaster recovery, fraud detection, data migration, feature flag rollout, GDPR compliance, search rebuild, cache failure matrix, worker recovery, UTC time rule, file cleanup, API timeout governance, session concurrency, support audit immutability, feature flag dependency rules, manual operation playbooks, search degradation UX, payment pending UX, auth recovery lockout detail |
| 12 | VyaparNet_Deployment_Runtime_Architecture_v1.md | v1.2 | FROZEN | Runtime philosophy, environment strategy, runtime topology, monorepo deployment strategy, containerization strategy (Dockerfiles), networking architecture, CDN/asset delivery, database runtime strategy, Redis runtime strategy, queue runtime architecture, scaling strategy, observability stack, runtime failure handling, security runtime layer, CI/CD architecture, backup/disaster recovery, cost governance, future evolution strategy, feature flag governance, runtime dependency classification, infrastructure ownership matrix, SLO/SLA targets, maintenance mode strategy, data retention governance, incident severity classification |
| 13 | VyaparNet_Sprint_Roadmap_v1.md | v1.1 | FROZEN | Roadmap philosophy, MVP cutline (in/out), global dependency graph, sprint execution model, Sprint 0-9 detailed plans, parallel work strategy (frontend/backend decoupling), engineering governance (code standards, branch strategy, PR governance), release strategy, rollback governance, risk register, technical debt governance, testing strategy, observability execution, security execution checklist, performance governance, capacity planning, future evolution plan, sprint calendar template, definition of done, mock API governance, incident response ownership matrix, sprint exit criteria, release freeze rules |
| 14 | PROJECT_CONTEXT.md | v1.0 | FROZEN | Project identity, product philosophy, technical philosophy, architecture snapshot, current system state, locked decisions registry, excluded complexity registry, execution phase tracker, AI collaboration rules, monorepo context, runtime guarantees, operational philosophy, security philosophy, UX philosophy, performance philosophy, scaling philosophy, quality pathways, naming conventions, glossary, anti-patterns, constraints, risks, documentation registry |

---

## DOMAIN-TO-DOCUMENT QUICK REFERENCE

Use this to instantly find which document answers a specific question.

| Domain / Question | Primary Document | Secondary |
|---|---|---|
| **What is VyaparNet?** | Doc 2 (PRDv2) | Doc 1 (Master Workflow) |
| **Business model / order flow** | Doc 1 (Master Workflow) | Doc 2 (PRDv2) |
| **Technology stack choices** | Doc 2 (PRDv2) | Doc 8 (Implementation Arch) |
| **Module architecture + boundaries** | Doc 4 (Module Breakdown) | Doc 8 (Implementation Arch) |
| **Database schema (complete)** | Doc 6 (Prisma Schema) | Doc 5 (DB Infra) |
| **Database indexing strategy** | Doc 7 (Indexing Strategy) | Doc 6 (Prisma Schema) |
| **Inventory concurrency / no oversell** | Doc 8 (Implementation Arch) | Doc 11 (Workflow Diagrams) |
| **Payment flow + idempotency** | Doc 9 (API Contracts) | Doc 11 (Workflow Diagrams) |
| **Auth / OTP / JWT / RBAC** | Doc 8 (Implementation Arch) | Doc 9 (API Contracts) |
| **API contract standards** | Doc 9 (API Contracts) | Doc 2 (PRDv2) |
| **Event-driven architecture + Outbox** | Doc 8 (Implementation Arch) | Doc 11 (Workflow Diagrams) |
| **Queue architecture (BullMQ)** | Doc 8 (Implementation Arch) | Doc 12 (Deployment Runtime) |
| **All workflow sequence diagrams** | Doc 11 (Workflow Diagrams) | — |
| **Search architecture** | Doc 7 (Indexing) | Doc 8 (Implementation Arch) |
| **Buyer UX / screen flows** | Doc 3 (IA) | Doc 10 (Product UX) |
| **Design tokens + component system** | Doc 10 (Product UX) | — |
| **Performance budgets** | Doc 10 (Product UX) | Doc 12 (Deployment Runtime) |
| **Naming conventions** | Doc 2 (PRDv2) | Doc 14 (Project Context) |
| **Error handling standards** | Doc 2 (PRDv2) | Doc 8 (Implementation Arch) |
| **Soft delete policy** | Doc 2 (PRDv2) | Doc 6 (Prisma Schema) |
| **Data retention policy** | Doc 2 (PRDv2) | Doc 12 (Deployment Runtime) |
| **Security architecture** | Doc 8 (Implementation Arch) | Doc 12 (Deployment Runtime) |
| **File upload security** | Doc 8 (Implementation Arch) | Doc 9 (API Contracts) |
| **Deployment + containerization** | Doc 12 (Deployment Runtime) | Doc 8 (Implementation Arch) |
| **CI/CD pipeline** | Doc 12 (Deployment Runtime) | Doc 9 (API Contracts) |
| **Observability + monitoring** | Doc 12 (Deployment Runtime) | Doc 8 (Implementation Arch) |
| **Disaster recovery / backups** | Doc 12 (Deployment Runtime) | Doc 5 (DB Infra) |
| **SLO / SLA targets** | Doc 12 (Deployment Runtime) | — |
| **Sprint plan + execution** | Doc 13 (Sprint Roadmap) | Doc 14 (Project Context) |
| **Sprint exit criteria** | Doc 13 (Sprint Roadmap) | — |
| **Definition of Done** | Doc 13 (Sprint Roadmap) | — |
| **Risk register** | Doc 13 (Sprint Roadmap) | Doc 14 (Project Context) |
| **Change control policy** | Doc 2 (PRDv2) | Doc 14 (Project Context) |
| **Feature flags** | Doc 2 (PRDv2) | Doc 8 (Implementation Arch) |
| **Operator workflows** | Doc 3 (IA) | Doc 11 (Workflow Diagrams) |
| **Admin workflows** | Doc 3 (IA) | Doc 11 (Workflow Diagrams) |
| **Segment isolation** | Doc 2 (PRDv2) | Doc 5 (DB Infra) |
| **Supplier management** | Doc 1 (Master Workflow) | Doc 4 (Module Breakdown) |
| **Notification architecture** | Doc 4 (Module Breakdown) | Doc 11 (Workflow Diagrams) |
| **Caching strategy** | Doc 7 (Indexing) | Doc 8 (Implementation Arch) |
| **Future backlog (Phase 2+)** | Doc 10.1 (Future Backlog) | — |
| **Incident response** | Doc 13 (Sprint Roadmap) | Doc 12 (Deployment Runtime) |
| **Governance + DDR process** | Doc 14 (Project Context) | Doc 2 (PRDv2) |

---

## DOCUMENT DEPENDENCY RELATIONSHIPS

---

## HOW AI AGENTS SHOULD USE THIS INDEX

1. **Before answering any architecture question:** Check this index for
   the authoritative document first.
2. **Before writing any code:** Identify which modules own the domain
   (Doc 4), what the schema looks like (Doc 6), what the API contract is
   (Doc 9), and what workflow is expected (Doc 11).
3. **Before changing anything:** Check LOCKED_DECISIONS.md.
4. **Before adding a new feature:** Check the MVP cutline in Doc 13
   and the excluded complexity list in LOCKED_DECISIONS.md.
5. **For operational questions:** Check Doc 12 (Runtime Architecture)
   and Doc 13 (Sprint Roadmap Incident section) first.