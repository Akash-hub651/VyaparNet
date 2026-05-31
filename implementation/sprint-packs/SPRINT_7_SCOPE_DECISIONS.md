# SPRINT_7_SCOPE_DECISIONS.md

## VyaparNet — Admin System & Platform Governance

### Version: v1.0 — FINAL SCOPE DECISIONS
### Authority: Principal Platform Architect + Enterprise Governance Board + Marketplace Operations Board + Trust & Safety Review Committee + Platform Administration Design Committee + AI-Agent Architecture Safety Board
### Sprint 6 Handoff: DEPENDENCY STABLE — Build 0 errors, 206 files, 82/82 tests, all 30 invariants verified
### Status: APPROVED FOR SPRINT 7 ARCHITECTURE GENERATION

---

> **HOW TO USE THIS DOCUMENT**
> Read §E1 (Executive Summary) first for intent.
> Read §D (Scope Decisions) for what is IN and OUT.
> Read §ADM (Admin Domain) for administration architecture decisions.
> Read §KYC (KYC Domain) for verification workflow decisions.
> Read §MOD (Moderation Domain) for suspension/enforcement decisions.
> Read §OPS (Operations Domain) for operational tooling decisions.
> Read §GOV (Governance Domain) for audit and immutability decisions.
> Read §SEC (Security) for privilege, abuse, and escalation decisions.
> Read §MS (Multi-Seller) for marketplace compatibility decisions.
> Read §SEG (Multi-Segment) for segment extensibility decisions.
> Read §CF (Carried-Forward) for observation disposition decisions.
> Read §AI (AI-Agent Safety) for implementation trap decisions.
> Sprint 7 Architecture Generation uses this document as sole authority.

---

## TABLE OF CONTENTS

- §E1 — Executive Summary
- §D1 — Sprint Identity
- §D2 — Scope Inclusion Decisions
- §D3 — Scope Exclusion Decisions
- §D4 — Non-Goal Declarations
- §ADM — Admin Domain Decisions
- §KYC — KYC Domain Decisions
- §MOD — Moderation Domain Decisions
- §OPS — Operations Domain Decisions
- §GOV — Governance Domain Decisions
- §SEC — Security Decisions
- §MS — Multi-Seller Compatibility Decisions
- §SEG — Multi-Segment Compatibility Decisions
- §CF — Carried-Forward Observation Decisions
- §S8 — Sprint 8 Dependencies
- §S9 — Sprint 9 Dependencies
- §AI — AI-Agent Safety Decisions
- §ATK — Self-Attack Review & Scope Refinements
- §FV — Final Scope Verdict

---

## §E1 EXECUTIVE SUMMARY

Sprint 7 is the **trust and control layer** of VyaparNet. A marketplace without governance becomes a fraud market. Sellers need verification before they can transact. Products need approval before they reach buyers. Disputes need visibility before they become abandonment. Admin tools are not a convenience — they are the mechanism by which VyaparNet maintains quality, safety, and regulatory compliance.

**Core architectural insight:** Everything Sprint 7 needs has been pre-built:
- `AuditLog` model exists in schema with `auditMonth` partition key
- `KycDocument` model exists with `verifiedBy` relation to admin User
- `AuditSafeWriterService` exists in `security/audit/` — wraps all audit writes with DLQ fallback
- `AuditRepository` exists in `identity/users/repositories/`
- `SellerContextGuard` already enforces `SUSPENDED` business rejection
- `validateSellerTransition()` already throws `TRANSITION_RESERVED_FOR_ADMIN` for `DELIVERED`
- `Product` state machine: `PENDING_APPROVAL → ACTIVE | REJECTED` is already defined
- `ProductApprovalService` already exists in catalog module
- `UserRole.ADMIN` enum value already exists, already excluded from all BUYER/SELLER routes
- `TaxInvoice`, `PlatformCommission`, `SellerPayout`, `FeatureFlag`, `SupportTicket` models all exist in schema
- `NotificationService.sendDirect()` is Sprint 7's notification integration point — typed and exported
- `OUTBOX_EVENT_NOTIFICATION_MAP` extensible for `KycApproved`, `KycRejected`, `ProductApproved`, `ProductRejected`
- Session revocation mechanism: `tokenVersion` increment → JWT validation fails on next request

**Philosophy:**
- **Correctness over convenience:** Admin can see everything. Admin can act on everything. Admin cannot escape audit trail.
- **Reversibility:** No admin action is permanently irreversible. Suspension can be lifted. Rejection can be appealed.
- **Least privilege:** Admin cannot access buyer private data beyond operational necessity. Admin cannot modify audit logs.
- **Explicit over implicit:** Every admin action is audited with `actorId + entityType + entityId + oldValue + newValue`.

---

## §D1 SPRINT IDENTITY

| Property | Value |
|---|---|
| Sprint | 7 — Admin System & Platform Governance |
| Objective | Admin can verify businesses, moderate products, suspend users, manage orders, replay DLQ, and view audit logs. Platform is governable, auditable, and trustworthy. |
| Duration | 2 weeks |
| Inherits from | Sprint 1 (auth/session revocation), Sprint 2 (S3 for KYC docs), Sprint 3 (inventory visibility), Sprint 4 (orders/payments), Sprint 5 (seller dashboards), Sprint 6 (notifications) |
| New modules | `modules/admin/` (new NestJS module, owns all /admin/* routes). Sub-modules: kyc, products, users, orders, audit, operations, payouts, flags, tickets |
| Existing modules modified | `catalog/` (product approval endpoint activation), `order/` (admin transition function), `identity/` (session revocation API), `security/audit/` (expand audit writer), `notification/` (add KYC/product event templates + handlers) |
| New DB models | All in schema — activation only: `AuditLog` (operational activation), `KycDocument` (document flow), `TaxInvoice` (invoice generation), `PlatformCommission` (commission records), `SellerPayout` (payout records), `FeatureFlag` (flag management) |
| Schema migrations | ONE new migration: `Notification.status` field (OBS-DSR6-5) |
| EventOutbox Writes | `ProductApproved`, `ProductRejected`, `BusinessVerified`, `BusinessSuspended`, `UserSuspended` — all inside `$transaction` |
| EventOutbox Reads | `notifications-failed` DLQ replay (admin reads BullMQ queue, not EventOutbox) |

---

## §D2 SCOPE INCLUSION DECISIONS

### D2.1 — Admin Identity & Access Control (MANDATORY)

**INCLUDED:**

| Component | Decision | Rationale |
|---|---|---|
| `AdminContextGuard` | IN | New guard for all `/admin/*` routes. `UserRole.ADMIN` check. No `businessId` resolution — admin is platform-scoped, not business-scoped |
| `@Roles(UserRole.ADMIN)` on every admin route | IN | Every `/admin/*` route MUST have this decorator. Any other role → 403 |
| Admin login path | IN | Admin uses same OTP/JWT flow as buyers/sellers. `UserRole.ADMIN` in token claims |
| Admin session management | IN | Same `tokenVersion` + `LoginSession` pattern. Admin suspension = `tokenVersion` increment |
| `AdminModule` NestJS module | IN | New top-level module. Never imported by domain modules |

### D2.2 — Business Verification / KYC Workflow (MANDATORY)

**INCLUDED:**

| Feature | Decision | Rationale |
|---|---|---|
| `GET /admin/businesses` | IN | List with `kycStatus` filter, pagination, segment filter |
| `GET /admin/businesses/:id` | IN | Full detail: business + all `KycDocument` records + signed S3 URLs (5 min expiry, not public) |
| `PATCH /admin/businesses/:id/verify` | IN | Sets `Business.kycStatus = VERIFIED`. Emits `BusinessVerified` to EventOutbox. Sends `KycApproved` notification via `sendDirect()`. Creates AuditLog |
| `PATCH /admin/businesses/:id/reject` | IN | Sets `Business.kycStatus = REJECTED`. Requires `reason` string (mandatory). Emits `BusinessRejected` event. Sends `KycRejected` notification. Creates AuditLog |
| `PATCH /admin/businesses/:id/suspend` | IN | Sets `Business.kycStatus = SUSPENDED`. Suspends seller's ability to transact. Emits `BusinessSuspended`. Creates AuditLog |
| `PATCH /admin/businesses/:id/reactivate` | IN | Sets `Business.kycStatus = VERIFIED` from `SUSPENDED`. Creates AuditLog |
| KYC document signed URL generation | IN | S3 signed URL, 5-minute expiry. Never public URL. Uses Sprint 2 S3Module |
| `KycApproved` / `KycRejected` notification templates | IN | Seeded to `NotificationTemplate`. Added to `OUTBOX_EVENT_NOTIFICATION_MAP` |
| Seller notification on KYC decision | IN | Via `NotificationService.sendDirect()` — never direct BullMQ access |
| Preference added to `NotificationPreference` shape | IN | `kyc: { statusUpdates: true }` — default true for SELLER |

### D2.3 — Product Approval Workflow (MANDATORY)

**INCLUDED:**

| Feature | Decision | Rationale |
|---|---|---|
| `GET /admin/products` | IN | Filter by `status` (default: `PENDING_APPROVAL`), pagination, segment |
| `GET /admin/products/:id` | IN | Full product detail with seller business info |
| `PATCH /admin/products/:id/approve` | IN | Sets `Product.status = ACTIVE`, `approvedBy = adminUserId`, `approvedAt = now()`. Emits `ProductApproved` to EventOutbox. Sends `ProductApproved` notification to seller via `sendDirect()`. Creates AuditLog |
| `PATCH /admin/products/:id/reject` | IN | Sets `Product.status = REJECTED`. Requires `reason` string. Emits `ProductRejected`. Sends notification to seller. Creates AuditLog |
| `POST /admin/products/bulk-approve` | IN | Batch approve array of productIds (max 100 per batch). Each approval is atomic independently. Partial success allowed (returns array of results) |
| `ProductApproved` / `ProductRejected` EventOutbox events | IN | `schemaVersion: '7.0'`. Inside `$transaction` |
| Seller notified on product decision | IN | Via `sendDirect()`. Template: `ProductApproved_SELLER_hi` and `ProductRejected_SELLER_hi` |

**REUSE:** `ProductStateMachineService.validateTransition()` already enforces `PENDING_APPROVAL → ACTIVE | REJECTED`. Admin MUST call this — never bypass.

### D2.4 — User Management (MANDATORY)

**INCLUDED:**

| Feature | Decision | Rationale |
|---|---|---|
| `GET /admin/users` | IN | List users with `role`, `kycStatus`, `segment`, `isDeleted` filters. Cursor-paginated |
| `GET /admin/users/:id` | IN | Full profile: User + Business(es) + recent orders (last 10) + KYC status |
| `PATCH /admin/users/:id/suspend` | IN | Sets `User.isDeleted = true` + increments `User.tokenVersion` + revokes all `LoginSession` records. Creates AuditLog. Sends `AccountSuspended` notification |
| `PATCH /admin/users/:id/activate` | IN | Sets `User.isDeleted = false`. Does NOT reset tokenVersion (user must re-login). Creates AuditLog |
| `PATCH /admin/users/:id/change-role` | IN — RESTRICTED | Change `UserRole`. Target role: `BUYER` or `SELLER` only (ADMIN/SELLER_MANAGER FORBIDDEN via Zod). Creates AuditLog |
| Session revocation mechanism | IN | `tokenVersion` increment invalidates ALL existing JWTs immediately. Plus revoke all `LoginSession` rows. Both steps MANDATORY inside `$transaction` |

> **DECISION D-SUSPEND-1:** User suspension uses `User.isDeleted = true` + `User.tokenVersion` increment. This is the existing Sprint 1 pattern. Sprint 7 does NOT add a separate `isSuspended` boolean field. `isDeleted = true` already blocks all auth paths. `tokenVersion` increment kills existing JWTs. No schema change required.

> **DECISION D-SUSPEND-2:** Business suspension (`Business.kycStatus = SUSPENDED`) and User suspension (`User.isDeleted = true`) are SEPARATE actions. Admin can suspend a business (seller cannot transact) without suspending the user (user can still log in as buyer). Both must be independently actionable.

### D2.5 — Order Management (MANDATORY)

**INCLUDED:**

| Feature | Decision | Rationale |
|---|---|---|
| `GET /admin/orders` | IN | All orders across all sellers, all buyers, all segments. Filters: `segment`, `status`, `dateFrom`, `dateTo`, `buyerId`, `sellerId`. Cursor-paginated |
| `GET /admin/orders/:id` | IN | Full order: items + buyer profile (PII visible to Admin only) + seller info + `OrderStatusHistory` timeline + payment |
| `PATCH /admin/orders/:id/deliver` | IN | Admin marks `SHIPPED → DELIVERED`. Uses new `validateAdminTransition()`. Creates AuditLog. Emits `OrderStatusChanged{status:DELIVERED}` to EventOutbox |
| `PATCH /admin/orders/:id/complete` | IN | Admin marks `DELIVERED → COMPLETED`. Creates AuditLog. Triggers payout calculation |
| `PATCH /admin/orders/:id/force-cancel` | IN — RESTRICTED | Admin force-cancel from ANY non-terminal status. Requires `reason`. Creates AuditLog. Emits `OrderStatusChanged{status:CANCELLED}` |
| `GET /admin/orders/exceptions` | IN | Stuck orders (>24h in PROCESSING), failed payments (unreconciled), suspended seller with active orders |
| Admin order state machine | IN | New `validateAdminTransition()` function in `order-state-machine.ts`. NEVER modifies `SELLER_VALID_TRANSITIONS` |

> **DECISION D-ORDER-1:** Admin transitions: any non-terminal → CANCELLED (with reason), SHIPPED → DELIVERED, DELIVERED → COMPLETED. Admin CANNOT transition COMPLETED or re-open CANCELLED.

> **DECISION D-ORDER-2:** Admin order access bypasses all scope guards. Admin sees ALL orders. Buyer PII (phone, email) visible to Admin via this endpoint ONLY. Buyer PII remains hidden from seller routes — unchanged.

### D2.6 — Tax Invoice Generation (MANDATORY)

**INCLUDED:**

| Feature | Decision | Rationale |
|---|---|---|
| `TaxInvoiceService.generateInvoice(orderId)` | IN | GST-compliant invoice: CGST+SGST (intra-state) or IGST (inter-state). HSN codes from `OrderItem`. Invoice number generation |
| PDF generation via `pdf-lib` | IN | Pure Node.js PDF. If generation exceeds 2s: queue to BullMQ `invoice-generation` worker |
| Upload to private S3 | IN | `TaxInvoice.pdfUrl` = S3 key (not public URL) |
| `POST /admin/invoices/generate/:orderId` | IN | Manual trigger by admin |
| `GET /admin/invoices/:orderId` | IN | Return `TaxInvoice` metadata + signed S3 URL (5 min expiry) |
| `GET /buyer/orders/:id/invoice` | IN | Buyer-facing invoice access. Signed URL (5 min) |
| `PlatformCommission` record creation | IN | Created atomically with invoice generation inside `$transaction` |

> **DECISION D-INVOICE-1:** PDF generation uses `pdf-lib` — NOT `puppeteer`. Rationale: no Chromium dependency, pure Node.js, deterministic.

> **DECISION D-INVOICE-2:** Invoice generation is MANUAL — triggered by Admin. Automatic on COMPLETED is Sprint 9 scope.

### D2.7 — Seller Payout Management (MANDATORY)

**INCLUDED:**

| Feature | Decision | Rationale |
|---|---|---|
| `SellerPayoutService.calculatePayout(orderId)` | IN | `grossAmount - platformFee - paymentGatewayFee - tdsAmount = netPayout`. Creates `SellerPayout(status: PENDING)` |
| `GET /admin/payouts` | IN | List `PENDING` + `INITIATED` payouts with filters |
| `PATCH /admin/payouts/:id/initiate` | IN | Sets `status = INITIATED`. Manual only. Creates AuditLog |

> **DECISION D-PAYOUT-1:** Automated bank transfer is OUT of Sprint 7. Admin manually marks `INITIATED` after offline bank transfer. Sprint 9 automates.

> **DECISION D-PAYOUT-2:** Payout calculation triggered on `DELIVERED → COMPLETED` transition inside `$transaction`.

> **DECISION D-PAYOUT-3:** Platform commission rate: `platform_commission_percent` FeatureFlag (default 2%). TDS rate: `tds_rate_percent` FeatureFlag (default 1%). Payment gateway fee: `payment_gateway_fee_percent` FeatureFlag (default 2%). ALL from FeatureFlag — never hardcoded.

### D2.8 — Feature Flag Management (MANDATORY)

**INCLUDED:**

| Feature | Decision | Rationale |
|---|---|---|
| `GET /admin/flags` | IN | All flags with current status |
| `PATCH /admin/flags/:name` | IN | Toggle `enabled`. Creates AuditLog. Clears Redis flag cache |
| Redis flag cache | IN | Key: `flag:{name}:{env}:{segment}` TTL=300s |
| Segment-scoped flags | IN | `FeatureFlag.segment = null` → global; `TEXTILE` → textile only |
| `feature_kyc_enforcement_enabled` | IN | KYC gate flag. Default: `false` in dev, `true` in prod |

> **DECISION D-FLAG-1:** Sprint 7 uses 0%/100% rollout only. Percentage gradual rollout is Sprint 9.

> **DECISION D-FLAG-2:** Flag names: `snake_case` with domain prefix (`kyc_*`, `payment_*`, `inventory_*`, `admin_*`).

### D2.9 — Audit Log Viewer (MANDATORY)

**INCLUDED:**

| Feature | Decision | Rationale |
|---|---|---|
| `GET /admin/audit-logs` | IN | Filter by `entityType`, `entityId`, `actorId`, `dateFrom`, `dateTo`, `action`. Cursor-paginated |
| `GET /admin/audit-logs/timeline/:entityType/:entityId` | IN | Chronological entity timeline |
| `AuditLog.auditMonth` UTC partition key | IN | `new Date().toISOString().slice(0, 7)` |
| Read-only enforcement | IN | No POST/PATCH/DELETE routes for audit logs |

### D2.10 — Exception Center (MANDATORY)

**INCLUDED:**

| Feature | Decision | Rationale |
|---|---|---|
| `GET /admin/exceptions` | IN | 4 categories: stuck orders, failed payments, suspended sellers with active orders, DLQ depth |
| Stuck orders | IN | `status = PROCESSING AND updatedAt < now() - 24h` |
| Failed payments | IN | `Payment.status = FAILED` AND no successful follow-up |
| DLQ visibility | IN | `GET /admin/exceptions/dlq` — BullMQ `notifications-failed` job list |
| DLQ replay | IN | `POST /admin/exceptions/dlq/:jobId/retry` — single job retry |

### D2.11 — Support Ticket Workflow (MANDATORY)

**INCLUDED:**

| Feature | Decision | Rationale |
|---|---|---|
| `GET /admin/tickets` | IN | All tickets, priority sorted |
| `GET /admin/tickets/:id` | IN | Full ticket detail |
| `PATCH /admin/tickets/:id/assign` | IN | Assign to admin |
| `PATCH /admin/tickets/:id/resolve` | IN | Resolve with `resolvedAt` |
| `PATCH /admin/tickets/:id/escalate` | IN | Set `priority = CRITICAL, escalatedAt = now()` |
| SLA tracking | IN | `firstResponseAt`, `slaBreachedAt` managed |

### D2.12 — Notification Templates for Sprint 7 Events (MANDATORY)

New templates seeded via `TemplateSeedService.getTemplateDefinitions()`:

| Template Name | Event | Channels |
|---|---|---|
| `KycApproved_SELLER_hi` | BusinessVerified | SMS + IN_APP + EMAIL |
| `KycRejected_SELLER_hi` | BusinessRejected | SMS + IN_APP + EMAIL |
| `ProductApproved_SELLER_hi` | ProductApproved | IN_APP |
| `ProductRejected_SELLER_hi` | ProductRejected | IN_APP + SMS |
| `AccountSuspended_SELLER_hi` | UserSuspended | SMS |
| English equivalents | All events | SMS + EMAIL |

New `OUTBOX_EVENT_NOTIFICATION_MAP` entries:
```
KycApproved, KycRejected, ProductApproved, ProductRejected, UserSuspended
```

---

## §D3 SCOPE EXCLUSION DECISIONS

| Excluded Item | Sprint | Rationale |
|---|---|---|
| Automated bank transfer / payout disbursement | Phase 2 | RBI compliance, banking API, manual process sufficient for MVP |
| Complex dispute resolution workflow | Sprint 8 | Requires `Dispute` model not yet in schema |
| Return workflow | Sprint 8 | Separate sprint |
| Advanced fraud detection | Phase 2 | ML infrastructure required |
| Supplier self-service onboarding automation | Phase 2 | GSTN/PAN API integration |
| Threaded ticket replies (`SupportTicketMessage` model) | Sprint 8 | Requires new schema model + migration |
| Admin analytics dashboard / reporting | Sprint 9 | GMV, revenue reports out of MVP scope |
| WhatsApp admin notifications | Phase 2 | 2-week template approval required |
| Bulk user suspension/activation | Sprint 9 | Requires batching safety infrastructure |
| IRN / e-Invoice (GSTN IRP integration) | Phase 2 | Government API certification |
| `SELLER_MANAGER` role implementation | Phase 2 | Enterprise account management |
| 2FA for admin login | Sprint 9 | Post-MVP hardening |
| Admin action approval workflow (two-admin confirmation) | Sprint 9 | Post-MVP safety |
| Bulk DLQ replay with rate control | Sprint 9 | Single job replay sufficient for MVP |
| Automatic invoice on order COMPLETED | Sprint 9 | Requires load testing before automation |

---

## §D4 NON-GOAL DECLARATIONS

| Non-Goal | Why Explicitly Prohibited |
|---|---|
| `AdminModule` importing `NotificationWorker` | Only `NotificationService.sendDirect()` is the notification integration point |
| `AdminModule` importing `SellerContextGuard` | Admin has no `businessId` — guard must never be applied to admin routes |
| Any admin route without `AuditLog` entry | Every state-changing admin action MUST create an AuditLog |
| Modifying `validateSellerTransition()` | Sprint 7 creates `validateAdminTransition()` separately |
| Admin modifying EventOutbox records | EventOutbox is append-only. Admin never updates EventOutbox status |
| Admin reading buyer OTPs | OTPs are ephemeral/hashed — never readable by anyone |
| Admin creating orders, carts, or inventory | Admin is read + moderate + approve + suspend. Never creates commerce objects |
| Soft-delete of AuditLog records | AuditRepository has no `update()` or `delete()` methods — ever |
| Public S3 URLs for KYC documents | All KYC document URLs are signed, 5-minute expiry, never public |
| Admin state-change PATCH without `Idempotency-Key` | All PATCH endpoints MUST accept and honor `Idempotency-Key` header |

---

## §ADM ADMIN DOMAIN DECISIONS

### ADM.1 — AdminModule Architecture

**DECISION:** `AdminModule` is a new top-level NestJS module at `apps/api/src/modules/admin/`. It is imported by `AppModule`. It NEVER imports or is imported by domain modules (OrderModule, SellerModule, BuyerModule, NotificationModule, etc.).

**Module structure:**
```
apps/api/src/modules/admin/
├── admin.module.ts
├── guards/
│   └── admin-context.guard.ts
├── controllers/
│   ├── admin-businesses.controller.ts
│   ├── admin-products.controller.ts
│   ├── admin-users.controller.ts
│   ├── admin-orders.controller.ts
│   ├── admin-invoices.controller.ts
│   ├── admin-payouts.controller.ts
│   ├── admin-flags.controller.ts
│   ├── admin-audit.controller.ts
│   ├── admin-exceptions.controller.ts
│   └── admin-tickets.controller.ts
├── services/
│   ├── admin-kyc.service.ts
│   ├── admin-product.service.ts
│   ├── admin-user.service.ts
│   ├── admin-order.service.ts
│   ├── admin-invoice.service.ts
│   ├── admin-payout.service.ts
│   ├── admin-flag.service.ts
│   ├── admin-audit.service.ts
│   ├── admin-exception.service.ts
│   └── admin-ticket.service.ts
├── repositories/
│   ├── admin-business.repository.ts
│   ├── admin-product.repository.ts
│   ├── admin-user.repository.ts
│   ├── admin-order.repository.ts
│   ├── admin-payout.repository.ts
│   ├── admin-flag.repository.ts
│   ├── admin-audit.repository.ts    ← READ-ONLY
│   └── admin-ticket.repository.ts
└── constants/
    └── admin-permissions.constant.ts
```

**AdminModule allowed imports:** `PrismaModule`, `RedisModule`, `BullMQModule`, `S3Module`, `NotificationModule`, `ObservabilityModule`, `SecurityModule`

**AdminModule FORBIDDEN imports:** `OrderModule`, `InventoryModule`, `SellerModule`, `BuyerModule`, `PaymentModule`, `CatalogModule`, `CartModule`. Admin reads cross-domain via direct Prisma.

### ADM.2 — AdminContextGuard Contract

```typescript
@Injectable()
export class AdminContextGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user; // set by JwtAuthGuard
    if (!user || user.role !== UserRole.ADMIN) {
      throw new ForbiddenException({ code: 'ADMIN_ACCESS_REQUIRED' });
    }
    // Admin has no businessId — user.id IS the actor. No further resolution.
    return true;
  }
}
```

**Usage on all admin controllers:**
```typescript
@UseGuards(JwtAuthGuard, AdminContextGuard)
@Controller('admin')
export class AdminBusinessesController { ... }
```

**FORBIDDEN:** `SellerContextGuard` on any admin route — ever.

### ADM.3 — Admin API Idempotency Pattern

All state-changing admin endpoints MUST:
1. Accept `Idempotency-Key` header (UUID format) — missing → 422
2. Check Redis `admin-idem:{key}` before processing — hit → 200 with cached result
3. Redis key TTL: 86400s

### ADM.4 — Admin Visibility Boundaries

| Data | Admin Access |
|---|---|
| Buyer phone, email, name | READ-ONLY (logged in AuditLog) |
| Buyer order history | READ-ONLY |
| Seller bank account | NOT in scope (Phase 2) |
| OTPs | NEVER |
| User passwords | NEVER (bcrypt hash) |
| JWT tokens | NEVER |
| Audit logs | READ-ONLY |
| KYC documents | SIGNED URL ONLY (logged) |

---

## §KYC KYC DOMAIN DECISIONS

### KYC.1 — Document Storage Pattern

**DECISION:** KYC documents stored in SEPARATE S3 bucket (`vyaparnet-kyc-docs-{env}`). ZERO public-read policy. All access via signed URLs only (5 min expiry).

`KycDocument.url` = S3 key (NOT full URL). `KycDocument.publicUrl` = null (never populated for KYC docs — violation = P0 security incident).

### KYC.2 — Verification State Machine

```
UNVERIFIED → PENDING   (seller uploads documents)
PENDING → VERIFIED     (admin approves)
PENDING → REJECTED     (admin rejects with reason — MANDATORY)
VERIFIED → SUSPENDED   (admin suspends)
SUSPENDED → VERIFIED   (admin reactivates)
REJECTED → PENDING     (seller resubmits)
```

### KYC.3 — KYC-Gate Feature Flag

`feature_kyc_enforcement_enabled` flag:
- `false` (dev/test): sellers can transact regardless of kycStatus
- `true` (production): kycStatus must be VERIFIED before products go ACTIVE

### KYC.4 — Notification Outside Transaction

Sequence for `PATCH /admin/businesses/:id/verify`:
1. `$transaction`: update `Business.kycStatus = VERIFIED` + create `AuditLog` + create `EventOutbox(BusinessVerified)`
2. After commit: `NotificationService.sendDirect(sellerUserId, 'KycApproved_SELLER_hi', { businessName })`
3. If `sendDirect()` fails: log error, do NOT roll back. Business is verified regardless.

---

## §MOD MODERATION DOMAIN DECISIONS

### MOD.1 — Dual-Layer Seller Suspension

**Business suspension** (`PATCH /admin/businesses/:id/suspend`):
- `Business.kycStatus = SUSPENDED`
- Effect: `SellerContextGuard` rejects with `BUSINESS_SUSPENDED`
- Effect: `SellerScorecardService` skips in computation (INV-S5-40)
- AuditLog created + `BusinessSuspended` EventOutbox event

**User suspension** (`PATCH /admin/users/:id/suspend`):
- `User.isDeleted = true` + `User.tokenVersion += 1` + all `LoginSession.revoked = true`
- Effect: ALL existing JWTs immediately invalid
- AuditLog created + `AccountSuspended` SMS notification
- Redis `seller_biz:{userId}` cache deleted (immediate effect)

These are SEPARATE API endpoints. Admin may choose one or both independently.

### MOD.2 — Reactivation Model

**Business reactivation:** `kycStatus = VERIFIED`. AuditLog created.

**User reactivation:** `isDeleted = false`. `tokenVersion` NOT decremented. User must re-login. AuditLog created.

Reactivating user does NOT automatically reactivate business. Both must be done independently.

### MOD.3 — AuditLog on Every Moderation Action

Required fields:
```typescript
{
  actorId: req.user.id,           // JWT — NEVER from body
  action: AuditAction.STATUS_CHANGE,
  entityType: string,
  entityId: string,
  entityName: string,
  oldValue: { status: previousStatus },
  newValue: { status: newStatus, reason?: string },
  ipAddress: req.ip,
  userAgent: req.headers['user-agent'],
  sessionId: string,
  auditMonth: new Date().toISOString().slice(0, 7) // UTC
}
```

`AuditSafeWriterService.safeWrite()` is the ONLY method for writing AuditLog. Direct `AuditRepository.create()` from admin services is FORBIDDEN.

### MOD.4 — Platform Enforcement Boundaries

| Action | Admin Can | Admin Cannot |
|---|---|---|
| Suspend business | ✅ | Cannot suspend business with active SHIPPED orders (force-cancel first) |
| Suspend user | ✅ | Cannot suspend own admin account |
| Force-cancel order | ✅ non-terminal | Cannot cancel COMPLETED |
| Reject product | ✅ PENDING_APPROVAL | Cannot reject ACTIVE (must use archive → resubmit flow) |
| Modify audit logs | ❌ NEVER | |
| Change admin role | ❌ NEVER via API | DB migration only |

---

## §OPS OPERATIONS DOMAIN DECISIONS

### OPS.1 — DLQ Visibility and Replay

DLQ queue name: `notifications-failed` (LOCKED from Sprint 6 AUDIT-S6-3).

```typescript
// Admin reads BullMQ failed jobs
const failedJobs = await this.notificationsFailedQueue.getFailed(0, 100);
// { id, data, failedReason, finishedOn, attemptsMade }

// Admin retries single job
const job = await this.notificationsFailedQueue.getJob(jobId);
await job.retry(); // re-queues to 'notifications' queue
// AuditLog: { action: UPDATE, entityType: 'NotificationJob', entityId: jobId }
```

Bulk DLQ replay: DEFERRED to Sprint 9.

### OPS.2 — Exception Center Shape

```typescript
// GET /admin/exceptions response
{
  stuckOrders: { count, items: StuckOrderDto[] },
  failedPayments: { count, items: FailedPaymentDto[] },
  suspendedSellersWithActiveOrders: { count, items: SuspendedSellerOrderDto[] },
  dlqDepth: number,
  openDisputes: 0  // placeholder — Sprint 8 fills this
}
```

Exception center is READ-ONLY. Actions done via individual admin endpoints.

### OPS.3 — Feature Flag Cache Pattern

Redis key: `flag:{name}:{env}:{segment}` TTL=300s. On admin toggle: SCAN + DEL for all matching keys. On Redis failure: DB read (fallback safe). `rolloutPercent` evaluation: 0% or 100% only in Sprint 7.

---

## §GOV GOVERNANCE DOMAIN DECISIONS

### GOV.1 — AuditLog Invariants

| ID | Invariant |
|---|---|
| INV-S7-GOV-1 | Every state-changing admin action MUST create an AuditLog entry |
| INV-S7-GOV-2 | AuditLog is APPEND-ONLY — forever. No update, no delete |
| INV-S7-GOV-3 | `actorId` is ALWAYS `req.user.id` from JWT — never from request body |
| INV-S7-GOV-4 | `oldValue`/`newValue` MUST NOT contain passwords, OTPs, or JWT tokens |
| INV-S7-GOV-5 | `auditMonth` MUST be computed in UTC: `new Date().toISOString().slice(0, 7)` |
| INV-S7-GOV-6 | AuditLog write failure MUST NOT block the business operation |

### GOV.2 — EventOutbox Governance (Sprint 7 Writes)

| Event | schemaVersion | Within $transaction | Consuming module |
|---|---|---|---|
| `ProductApproved` | `7.0` | YES (with Product status update) | NotificationModule |
| `ProductRejected` | `7.0` | YES | NotificationModule |
| `BusinessVerified` | `7.0` | YES (with Business kycStatus update) | NotificationModule; Sprint 8 RFQ |
| `BusinessSuspended` | `7.0` | YES | NotificationModule; Sprint 8 RFQ |
| `BusinessRejected` | `7.0` | YES | NotificationModule |
| `UserSuspended` | `7.0` | YES (with tokenVersion increment) | NotificationModule |
| `OrderStatusChanged` (DELIVERED/COMPLETED) | `5.0` | YES | NotificationModule (existing handler) |

Sprint 7 `deduplicationKey` pattern: `{eventType}:{entityId}:{adminUserId}` — deterministic, idempotent.

### GOV.3 — Immutability Guarantees

| Entity | Guarantee |
|---|---|
| `AuditLog` | APPEND-ONLY |
| `OrderStatusHistory` | APPEND-ONLY (Sprint 4) |
| `InventoryMovement` | APPEND-ONLY (Sprint 3) |
| `Payment` | APPEND-ONLY (Sprint 4) |
| `TaxInvoice` | APPEND-ONLY (once created) |
| `PlatformCommission` | APPEND-ONLY |
| `KycDocument` | URL + type immutable; status/verifiedBy mutable |

---

## §SEC SECURITY DECISIONS

### SEC.1 — Role Escalation Prevention

- `change-role` endpoint target: `BUYER | SELLER` only. `ADMIN` and `SELLER_MANAGER` FORBIDDEN via Zod validation.
- Elevating to ADMIN via API: FORBIDDEN. Admin users are seeded via DB migration only.
- Admin cannot modify their own role or suspend themselves.

### SEC.2 — KYC Document Security

- Signed URLs: max 300s expiry (5 minutes). Never > 300 seconds.
- `KycDocument.url` = S3 key only. Signed URL generated at API response time, never stored.
- `KycDocument.publicUrl` = null for all KYC documents. Violation = P0.
- KYC bucket: `vyaparnet-kyc-docs-{env}`. Zero public-read policy.
- Every signed URL generation logged in AuditLog.

### SEC.3 — Audit Log Tampering Prevention

- No `DELETE /admin/audit-logs`. No `PATCH`. No `UPDATE` in `AuditRepository`.
- `AuditLog.createdAt` = `@default(now())` — server-set only.
- `AuditLog.actorId` = `req.user.id` — JWT claim only.

### SEC.4 — Admin API Abuse Prevention

- Rate limit: 60 requests/minute per admin IP.
- `Idempotency-Key` required on all PATCH endpoints. Missing → 422.
- `POST /admin/products/bulk-approve` batch capped at 100. Larger → 422.
- DLQ replay: `Idempotency-Key` required.

### SEC.5 — Session Revocation on User Suspension

Inside `$transaction` (synchronous, not deferred):
1. `User.isDeleted = true`
2. `User.tokenVersion += 1`
3. All `LoginSession` records: `revoked = true, revokeReason = 'ADMIN_SUSPENSION', revokedAt = now()`
4. After commit: delete Redis key `seller_biz:{userId}`

Result: ALL existing JWTs immediately invalid. New login fails.

### SEC.6 — PII Access Boundaries

| PII | Seller | Buyer | Admin |
|---|---|---|---|
| Buyer phone/email | NEVER | OWN ONLY | READ-ONLY (logged) |
| KYC documents | OWN ONLY | N/A | ALL (signed URL, logged) |
| OTPs | NEVER | NEVER | NEVER |
| Other admin actions | N/A | N/A | READ-ONLY via audit |

---

## §MS MULTI-SELLER COMPATIBILITY DECISIONS

### MS.1 — What Sprint 7 Must Preserve

- Admin order queries use `Business.id` for seller filter, not `User.id`.
- `SellerPayout` has `@@index([orderId])` — NOT `@@unique`. Multi-seller future: one order → N payouts. Sprint 7 MUST NOT add `@@unique` constraint on `SellerPayout.orderId`.
- `PlatformCommission` has `orderId @unique` — correct for single-seller. Note: multi-seller Phase 2 will change to composite key.
- `validateAdminTransition()` structured as pure function for Phase 2 compatibility.

### MS.2 — What Sprint 7 Must Avoid

- Never conflate `Order.sellerId` (Business.id) with `User.id` in admin APIs.
- Never assume single-seller when resolving seller userId for `sendDirect()` — use `Business.ownerId`.

### MS.3 — What Sprint 7 Must Prepare For

- KYC workflow is per `Business`. Multiple businesses per user: each needs independent KYC. `KycDocument.businessId` relation supports this.
- Admin order filtering by `segment` already works via `Order.segment`.

---

## §SEG MULTI-SEGMENT COMPATIBILITY DECISIONS

- All admin list endpoints include optional `segment` filter.
- `FeatureFlag.segment = null` → global; specific segment → segment-scoped.
- `admin_product_approved_total` metric includes `segment` label.
- Adding new segment requires only schema migration (enum value). Zero Sprint 7 admin code changes.
- Exception center returns segment attribution on stuck orders.

---

## §CF CARRIED-FORWARD OBSERVATION DECISIONS

| Observation | Classification | Sprint 7 Action |
|---|---|---|
| **OBS-DSR6-1** `buyerCode` in seller notifications | SPRINT 7 — REQUIRED | Add `buyerCode: z.string().optional()` to `OrderCreatedPayloadSchema`. Include in `orders.service.ts` payload. Update `OrderCreated_SELLER_hi` template. |
| **OBS-DSR6-2** Stale `deploy/api/schema.prisma` | SPRINT 7 — HOUSEKEEPING | Delete or sync. CI/CD must generate from source. |
| **OBS-DSR6-3** Notification date-range filter | SPRINT 7 — REQUIRED | Add `dateFrom`/`dateTo` to `NotificationListQuerySchema`. Admin notification audit: `GET /admin/users/:id/notifications?dateFrom=&dateTo=`. `userId` MUST still be explicit — no scope-free notification query. |
| **OBS-DSR6-4** `Notification.segment` DB field | SPRINT 9 — DEFERRED | No action in Sprint 7. Prometheus label sufficient. |
| **OBS-DSR6-5** `Notification.status` field | SPRINT 7 — REQUIRED | Add `NotificationDeliveryStatus` enum + `status` field to `Notification` model. Migration: `20260601_sprint7_notification_status`. Update `NotificationWorker` to set `SENT`/`FAILED`. |
| **OBS-DSR6-6** Seller/buyer module unit tests | SPRINT 7 — REQUIRED | Add `seller-order.service.spec.ts` and `buyer-order.service.spec.ts`. CI gate: total tests ≥ 100. |

---

## §S8 SPRINT 8 DEPENDENCIES

| Sprint 8 Needs | Sprint 7 Delivers | Status |
|---|---|---|
| `BusinessSuspended` event for RFQ eligibility | Emitted on business suspension | IN SCOPE |
| `BusinessVerified` event for RFQ activation | Emitted on verification | IN SCOPE |
| Open disputes count in exception center | Returns `openDisputes: 0` placeholder | PLACEHOLDER |
| `SupportTicketMessage` for threaded replies | Deferred — `POST /admin/tickets/:id/reply` | DEFERRED to Sprint 8 |
| Return workflow admin actions | Fully deferred | DEFERRED |
| `OUTBOX_EVENT_NOTIFICATION_MAP` extensible | Record<string, handler> — Sprint 8 adds `ReturnInitiated`, `DisputeOpened` | READY |

**Sprint 8 guardrail:** Sprint 8 must NOT import `AdminModule`. Sprint 8 domain modules emit events. Admin visibility is via EventOutbox consumption and direct Prisma reads.

---

## §S9 SPRINT 9 DEPENDENCIES

| Sprint 9 Needs | Sprint 7 Delivers | Status |
|---|---|---|
| AuditLog for compliance audit | Every admin action creates AuditLog | IN SCOPE |
| SellerPayout records for reconciliation | PENDING/INITIATED records | IN SCOPE |
| TaxInvoice for revenue reporting | Invoice records | IN SCOPE |
| FeatureFlag infrastructure for rollout | Flag management + Redis cache | IN SCOPE |
| `Notification.segment` field | Deferred | DEFERRED |
| Automated payout disbursement | PENDING records — Sprint 9 automates | DEFERRED |
| IRN/e-Invoice | PDF without IRN — Sprint 9 adds GSTN | DEFERRED |
| Bulk DLQ replay | Single job only — Sprint 9 adds bulk | DEFERRED |
| Automatic invoice on COMPLETED | Manual trigger — Sprint 9 automates | DEFERRED |

---

## §AI AI-AGENT SAFETY DECISIONS

### AI.1 — New Sprint 7 Traps (20 total)

| Trap ID | Description | Fix |
|---|---|---|
| AG-S7-1 | Agent uses `SellerContextGuard` on admin routes | `AdminContextGuard` ONLY |
| AG-S7-2 | Agent modifies `validateSellerTransition()` for DELIVERED | Create NEW `validateAdminTransition()` |
| AG-S7-3 | Agent calls `createAndEnqueue()` from AdminModule | ALWAYS use `NotificationService.sendDirect()` |
| AG-S7-4 | Wrong handler signature for `KycApproved` in event map | Must be `(payload: T, ctx: HandlerContext) => Promise<void>` |
| AG-S7-5 | Agent sends KYC notification INSIDE `$transaction` | Notification is OUTSIDE `$transaction`. State change commits first. |
| AG-S7-6 | Agent allows admin to elevate user to ADMIN role | Zod rejects `ADMIN`/`SELLER_MANAGER` as change-role targets |
| AG-S7-7 | Agent allows admin self-suspend or self-demote | Explicit check: `targetUserId !== adminUserId` |
| AG-S7-8 | Agent writes AuditLog via direct `AuditRepository.create()` | ALWAYS use `AuditSafeWriterService.safeWrite()` |
| AG-S7-9 | Agent stores KYC signed URL in `KycDocument.publicUrl` | `publicUrl = null` for KYC docs always. Never persist signed URL. |
| AG-S7-10 | Agent generates PDF inside `$transaction` | Invoice computation inside `$transaction`. PDF generation + S3 upload OUTSIDE. |
| AG-S7-11 | Agent adds `@@unique` on `SellerPayout.orderId` | `@@index` only — multi-seller needs N payouts per order |
| AG-S7-12 | Agent sets `actorId` in AuditLog from request body | `actorId = req.user.id` — JWT only |
| AG-S7-13 | Agent uses `Date.now()` in EventOutbox deduplicationKey | Key format: `{eventType}:{entityId}:{adminUserId}` — deterministic |
| AG-S7-14 | Agent imports `OrderModule` or `SellerModule` from AdminModule | AdminModule reads via direct Prisma. No domain module imports. |
| AG-S7-15 | Agent suspends user without incrementing `tokenVersion` | BOTH mandatory: `isDeleted = true` + `tokenVersion += 1` + LoginSession revocation |
| AG-S7-16 | Agent puts AuditLog write AFTER `$transaction` commit without safe writer | Use `AuditSafeWriterService` — handles failure gracefully |
| AG-S7-17 | Agent returns 500 on AuditLog write failure | `safeWrite()` absorbs errors. Business operation succeeds regardless. |
| AG-S7-18 | Agent blocks HTTP request cycle on slow PDF generation | PDF > 2s threshold: enqueue to BullMQ `invoice-generation`. Return 202 + invoiceId. |
| AG-S7-19 | Agent hardcodes notification template body in handler TypeScript | Templates MUST go to `TemplateSeedService.getTemplateDefinitions()`. DB is authority. |
| AG-S7-20 | Agent creates admin PATCH endpoint without `Idempotency-Key` validation | ALL admin PATCH endpoints: `Idempotency-Key` mandatory. Missing → 422. |

### AI.2 — Ownership Confusion Risks

| Confusion | Correct Resolution |
|---|---|
| Who owns Business table? | `SellerModule` creates. `AdminModule` reads via direct Prisma. No import. |
| Who delivers notifications? | `NotificationModule` owns delivery. Admin calls `sendDirect()` only. |
| Who writes AuditLog? | `AuditSafeWriterService` (SecurityModule) writes. `AdminModule.AuditRepository` reads. |
| Who reads orders cross-seller? | `AdminModule` reads `prisma.order` directly with no `sellerId` filter. No OrderModule import. |
| Who owns payout logic? | `AdminModule.SellerPayoutService` — separate from `PaymentModule` (Razorpay gateway). |
| Who writes EventOutbox for Sprint 7 events? | `AdminModule` admin services write EventOutbox inside `$transaction`. NotificationModule remains pure consumer. |

### AI.3 — Explicit Decisions for Ambiguous Requirements

| Ambiguity | Decision |
|---|---|
| Does approving product notify seller? | YES — `sendDirect()` AFTER `$transaction` commits. Non-blocking. |
| Does Admin GET /orders/:id show buyer PII? | YES — full buyer profile. Logged in AuditLog. |
| Does AuditLog failure block business operation? | NO — `AuditSafeWriterService` absorbs failure. State change committed. |
| Does Admin DELIVERED trigger buyer notification? | YES — `OrderStatusChanged{DELIVERED}` EventOutbox event → existing `handleOrderStatusChanged` → buyer notification. |
| What are payout rates? | All from FeatureFlag (never hardcoded). |
| Are audit logs scoped to admin's own actions? | NO — admin sees ALL audit logs platform-wide. |
| Is session revocation synchronous? | YES — inside `$transaction`. Not deferred. |

---

## §ATK SELF-ATTACK REVIEW & SCOPE REFINEMENTS

### ATK.1 — "Scope is too large"

**Attack:** 10 controllers, KYC, invoices, PDF, payouts, flags, audit logs, DLQ, tickets, frontend — is this 5 sprints of work?

**Analysis:** Most work is activation of pre-existing schema models. `AuditSafeWriterService` already exists. `ProductApprovalService` already exists. `ProductStateMachineService` already exists. `FeatureFlag` model in schema. `SupportTicket` model in schema. Schema migrations = 1 (Notification.status). Frontend activation = last phase after backend is tested.

**Refinement:** `SupportTicketMessage` (threaded replies) DEFERRED to Sprint 8. Removes need for new schema model. `POST /admin/tickets/:id/reply` removed.

**Verdict:** Scope is achievable in 2 weeks. No further scope reduction required.

### ATK.2 — "Scope is too small"

**Attack:** Should also include automated bank transfer, GSTN e-invoice, bulk user management, WhatsApp, 2FA.

**Analysis:** All require infrastructure not available in MVP (banking API, government API, WhatsApp template approval, second-factor delivery). Correctly deferred.

**Verdict:** Sprint 7 scope is correctly sized for MVP governance.

### ATK.3 — "Admin APIs are dangerous"

**Attack:** Compromised admin account is catastrophic.

**Mitigations in scope:** AuditLog on every action, rate limiting, Idempotency-Key, self-modification blocked, no money movement (payout is status change only), no OTP/password access, KYC docs via signed URL (logged), 300s expiry.

**Residual risk (accepted):** Sprint 9 adds 2FA + two-admin confirmation for high-risk actions.

**Verdict:** MVP-appropriate risk level.

### ATK.4 — "Sprint 7 is future-hostile"

**Attack:** AdminModule with direct Prisma creates tight coupling when Sprint 8/9 add new models.

**Analysis:** AdminModule reads via direct Prisma — zero domain module imports. Sprint 8 adds one `findOpenDisputes()` method to `admin-exception.repository.ts`. Sprint 9 adds analytics queries. Zero Sprint 7 code changes required.

**Verdict:** Architecture is future-compatible. Additive-only for Sprint 8/9.

### ATK.5 — "KYC security is insufficient"

**Attack:** Admin can generate unlimited signed URLs for any KYC document.

**Mitigations in scope:** Every signed URL generation logged in AuditLog. 300s expiry. S3 access logs.

**Residual:** Sprint 9 adds rate limiting on signed URL generation per admin.

**Verdict:** MVP-appropriate security.

---

## §FV FINAL SCOPE VERDICT

### Scope Inclusion Matrix

| Component | Decision |
|---|---|
| `AdminModule` (new NestJS module) | ✅ IN |
| `AdminContextGuard` | ✅ IN |
| Business verification / KYC workflow | ✅ IN |
| Product approval queue | ✅ IN |
| User management (suspend/activate/view) | ✅ IN |
| Admin order management + DELIVERED/COMPLETED | ✅ IN |
| Tax invoice generation (pdf-lib) | ✅ IN |
| Seller payout calculation (manual) | ✅ IN |
| Feature flag management | ✅ IN |
| Audit log viewer (read-only) | ✅ IN |
| Exception center + DLQ visibility | ✅ IN |
| DLQ per-job replay | ✅ IN |
| Support ticket workflow (assign/resolve/escalate) | ✅ IN |
| KYC/Product notifications via `sendDirect()` | ✅ IN |
| Sprint 7 EventOutbox events (`schemaVersion: '7.0'`) | ✅ IN |
| `validateAdminTransition()` new function | ✅ IN |
| AuditLog operational activation | ✅ IN |
| Admin frontend activation (sequenced last) | ✅ IN |
| OBS-DSR6-1 (buyerCode) | ✅ SPRINT 7 |
| OBS-DSR6-2 (stale deploy schema) | ✅ SPRINT 7 |
| OBS-DSR6-3 (notification date filter) | ✅ SPRINT 7 |
| OBS-DSR6-4 (Notification.segment) | ⏸️ SPRINT 9 |
| OBS-DSR6-5 (Notification.status) | ✅ SPRINT 7 |
| OBS-DSR6-6 (seller/buyer tests) | ✅ SPRINT 7 |
| Threaded ticket replies | ⏸️ SPRINT 8 |
| Automated bank transfer | ⏸️ PHASE 2 |
| Bulk user suspension | ⏸️ SPRINT 9 |
| Advanced fraud detection | ⏸️ PHASE 2 |
| IRN/e-Invoice | ⏸️ PHASE 2 |
| WhatsApp notifications | ⏸️ PHASE 2 |
| SELLER_MANAGER role | ⏸️ PHASE 2 |
| 2FA for admin | ⏸️ SPRINT 9 |

### Invariant Count

Sprint 7 introduces approximately **35+ new invariants** across governance, admin access control, KYC security, moderation atomicity, payout integrity, and AI-agent safety.

---

```
╔══════════════════════════════════════════════════════════════╗
║              SPRINT 7 SCOPE DECISIONS — VERDICT              ║
║                                                              ║
║   SCOPE APPROVED FOR SPRINT 7 ARCHITECTURE GENERATION        ║
╚══════════════════════════════════════════════════════════════╝

Scope decisions: FINAL
Architecture attacks: 5 attempted — scope refined in 2 cases
Observations resolved: 6/6 classified
Sprint 8 dependencies: 4 items documented
Sprint 9 dependencies: 7 items documented
AI-agent traps: 20 new traps documented

NO PREVIOUS SPRINT INVARIANTS ARE WEAKENED.
ALL GOVERNANCE PRINCIPLES ARE PRESERVED.
SPRINT 7 ARCHITECTURE GENERATION MAY PROCEED.
```

---

*Document version: v1.0 — FINAL*
*Authority: Principal Platform Architect + Enterprise Governance Board + Trust & Safety Review Committee + AI-Agent Architecture Safety Board*
*Inherits from: `SPRINT_6_DEPENDENCY_STABILITY_REVIEW.md` + `sprint_6_dependency_stablity_review.md` + `SPRINT_6_EXECUTION_LOCK_FINAL.md v1.2` + `MASTER_IMPLEMENTATION_ROADMAP.md Sprint 7`*
*This document is the sole authoritative scope authority for Sprint 7 Architecture Generation.*
*Sprint 7 Execution Lock MUST cross-reference every decision in this document.*
