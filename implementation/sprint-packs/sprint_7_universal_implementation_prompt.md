╔══════════════════════════════════════════════════════════════════════════════╗
║           VYAPARNET — SPRINT 7 UNIVERSAL IMPLEMENTATION PROMPT              ║
║              Admin System & Platform Governance — v1.0                      ║
╚══════════════════════════════════════════════════════════════════════════════╝

═══════════════════════════════════════════════════════
PHASE EXECUTION TARGET
═══════════════════════════════════════════════════════

Phase [PHASE_NO]: [PHASE_NAME]

═══════════════════════════════════════════════════════
YOUR IDENTITY & OPERATING MANDATE
═══════════════════════════════════════════════════════

You are now acting simultaneously as:

  ▸ Principal Staff Engineer (10+ years distributed systems)
  ▸ Enterprise Security Architect
  ▸ TypeScript/NestJS/Prisma Expert
  ▸ Platform Governance Specialist
  ▸ Lead Code Reviewer (zero-defect standard)

Your non-negotiable operating principles:
  "Correct before clever"
  "Explicit before implicit"
  "Observable before opaque"
  "Resilient before optimal"
  "Secure before convenient"

You write code that is production-hardened on Day 1. You do not write
"we can improve this later" code. You treat every security invariant as
load-bearing. If you are uncertain about a requirement, you re-read the
source document. You never guess. You never assume. You verify.

═══════════════════════════════════════════════════════
STEP 0 — MANDATORY PRE-FLIGHT DOCUMENT ANALYSIS
═══════════════════════════════════════════════════════

Before writing a SINGLE line of code, you MUST read and deeply internalize
the following files. Use file-reading tools. Do not rely on memory.

PRIMARY AUTHORITY DOCUMENTS (read ALL of these first):
  1. implementation/sprint-packs/SPRINT_7_EXECUTION_LOCK_FINAL.md
     → Read §0 (ALL 38 invariants — mandatory before anything else)
     → Read §1 (Sprint identity, scope, dependencies)
     → Read §2 (Sprint 1–6 inheritance contract — patterns you must follow)
     → Read §4 (Transaction boundary governance — CRITICAL)
     → Read §5 (Redis key registry — CRITICAL, no namespace collisions)
     → Read §7 (Module structure and package boundaries)
     → Read §9 (Event architecture — all EventOutbox schemas)
     → Read §10 (Security architecture)
     → Read §11 (Observability architecture)
     → Read §13 (Governance architecture — AuditLog table)
     → Read §31 (AI-Agent Safety Rules — read every word)
     → Read §32 (Validation gates — what you MUST pass before stopping)
     → Read the SPECIFIC PHASE section for Phase [PHASE_NO] (§[15+PHASE_NO])

  2. implementation/sprint-packs/SPRINT_7_SCOPE_DECISIONS.md
     → Read completely — this is the ultimate authority for scope decisions

  3. packages/database/prisma/schema.prisma
     → Read all models relevant to the phase being implemented
     → Verify field nullability, defaults, indexes, enums BEFORE writing code

  4. Existing source files you will modify or reference:
     → apps/api/src/modules/order/order-state-machine.ts
     → apps/api/src/modules/security/audit/audit-safe-writer.service.ts
     → apps/api/src/modules/identity/users/repositories/audit.repository.ts
     → apps/api/src/modules/notification/constants/outbox-event-map.constant.ts
     → apps/api/src/modules/notification/services/template-seed.service.ts
     → apps/api/src/modules/catalog/products/product-state-machine.service.ts

VERIFY YOUR UNDERSTANDING by completing this mental checklist:
  □ I know what models this phase reads from and writes to
  □ I know which invariants (INV-S7-N) govern this phase
  □ I know which AI footguns (FOOTGUN-N-*) this phase is at risk of
  □ I know the exact validation gate for this phase
  □ I know which files I must modify vs. which I must not touch
  □ I know the $transaction boundary for every state-changing operation

═══════════════════════════════════════════════════════
ABSOLUTE SYSTEM INVARIANTS — NEVER VIOLATE
═══════════════════════════════════════════════════════

The following 38 invariants govern ALL Sprint 7 code. Any implementation
that violates any invariant is INCORRECT regardless of test passage.

── IDENTITY & AUTH (inherited) ──────────────────────────────────────────
INV-S1-AUTH    req.user.id from JWT is the ONLY source of actor identity.
               NEVER trust userId from request body/path/query.
INV-S1-SESSION Session revocation = tokenVersion++ AND LoginSession.revoked=true.
               Either alone is insufficient.
INV-S1-AUDIT   AuditLog is APPEND-ONLY. No update() or delete() in AuditRepository.

── INVENTORY & SELLER (inherited) ───────────────────────────────────────
INV-S3-INVENTORY InventoryService is the SOLE authority for Inventory writes.
                 Admin NEVER writes to Inventory directly.
INV-S5-SELLER    businessId ≠ userId. Admin uses AdminContextGuard — no
                 businessId resolution. SellerContextGuard NEVER appears on admin routes.

── NOTIFICATION (inherited) ─────────────────────────────────────────────
INV-S6-CONSUMER  NotificationModule is a PURE CONSUMER. Sprint 7 writes to EventOutbox.
                 Sprint 7 does NOT call createAndEnqueue() from admin services directly.
INV-S6-SENDIRECT Admin module calls NotificationService.sendDirect() ONLY (OUTSIDE $tx).
INV-S6-TEMPLATES All notification template bodies are in TemplateSeedService. Never
                 hardcode template body in TypeScript.
INV-S6-MAP       OUTBOX_EVENT_NOTIFICATION_MAP is the ONLY way to register new event
                 handlers. Sprint 7 adds entries. Never modifies worker routing logic.

── SPRINT 7 NEW INVARIANTS ───────────────────────────────────────────────
INV-S7-1   AdminContextGuard is the ONLY guard on /admin/* routes.
           SellerContextGuard MUST NEVER appear on any admin route.
           Pattern: @UseGuards(JwtAuthGuard, AdminContextGuard)
           DO NOT add RolesGuard — AdminContextGuard checks role internally.

INV-S7-2   Every state-changing admin action MUST create an AuditLog entry
           via AuditSafeWriterService.safeWrite(). Direct AuditRepository.create()
           from admin services is FORBIDDEN.
           safeWrite() is called OUTSIDE $transaction — it has NO tx parameter.

INV-S7-3   AuditLog.actorId MUST always be req.user.id from JWT.
           NEVER from request body, path param, or query param.

INV-S7-4   AuditLog.auditMonth MUST be computed in UTC:
           new Date().toISOString().slice(0, 7)
           (This is set automatically inside AuditRepository.create())

INV-S7-5   AuditLog write failure MUST NOT block the business operation.
           AuditSafeWriterService absorbs errors silently via DLQ fallback.
           The state change is committed regardless of audit log success.

INV-S7-6   All Sprint 7 EventOutbox events MUST use:
             schemaVersion: '7.0'
             eventVersion: '1.0'
           EXCEPTION: OrderStatusChanged emitted by admin MUST use
           schemaVersion: '5.0' (existing handler, unchanged schema).

INV-S7-7   All admin PATCH endpoints that change state MUST enforce
           Idempotency-Key header (UUID format).
           Missing header → 422. Duplicate key → 200 with original result.
           TTL: 86400s. Redis key: admin-idem:{key}

INV-S7-8   KycDocument.url stores the S3 KEY ONLY (e.g. kyc-docs/userId/docId.pdf).
           NEVER the full presigned URL. KycDocument.publicUrl MUST remain null.
           Signed URL is generated at API response time, never persisted.

INV-S7-9   KYC document signed URLs MUST expire in ≤ 300 seconds (5 minutes).
           NEVER > 300 seconds. Every generation is logged in AuditLog.

INV-S7-10  User suspension MUST perform ALL THREE atomically inside $transaction:
             1. User.isDeleted = true
             2. User.tokenVersion += 1
             3. LoginSession.revoked = true (ALL sessions for that user)
           Any one step alone is insufficient.

INV-S7-11  Admin CANNOT suspend their own account.
           Admin CANNOT change their own role.
           Guard: if (targetUserId === req.user.id) throw ForbiddenException
           This check MUST happen BEFORE the transaction.

INV-S7-12  AdminChangeRoleDto Zod schema MUST reject ADMIN and SELLER_MANAGER
           as target roles. Only 'BUYER' and 'SELLER' are valid targets.
           Use z.enum(['BUYER', 'SELLER']) — NOT z.string().

INV-S7-13  validateAdminTransition() is a NEW PURE FUNCTION in order-state-machine.ts.
           MUST NOT modify validateSellerTransition() or SELLER_VALID_TRANSITIONS.
           Admin transitions: non-terminal → CANCELLED (with reason),
           SHIPPED → DELIVERED, DELIVERED → COMPLETED.

INV-S7-14  Seller payout rates MUST come from FeatureFlag values — NEVER hardcoded.
           Keys: platform_commission_percent (default 2),
                 tds_rate_percent (default 1),
                 payment_gateway_fee_percent (default 2)

INV-S7-15  SellerPayout MUST have @@index([orderId]) ONLY.
           NEVER @@unique on orderId. Multi-seller future requires N payouts per order.

INV-S7-16  Invoice PDF generation using pdf-lib.
           If generation > 2000ms: enqueue to BullMQ 'invoice-generation'.
           Return 202 { invoiceId, status: 'GENERATING' }.
           Block HTTP cycle only if < 2000ms.

INV-S7-17  POST /admin/invoices/generate/:orderId is the ONLY way to trigger
           invoice generation. Automatic invoice on order COMPLETED = Sprint 9 scope.

INV-S7-18  Feature flag cache key: flag:{name}:{env}:{segment} TTL=300s.
           Cache invalidation on toggle: SCAN + DEL matching keys (not pattern delete).
           All flag reads: Redis first, DB fallback.

INV-S7-19  Admin KYC notification MUST be sent OUTSIDE the $transaction via sendDirect().
           If sendDirect() fails: log error, DO NOT roll back. Business is verified regardless.

INV-S7-20  POST /admin/products/bulk-approve batch MUST be capped at 100 productIds.
           Larger batches → 422 { code: 'BATCH_SIZE_EXCEEDED', max: 100 }.
           Each individual approval is atomic independently.

INV-S7-21  ProductStateMachineService.validateTransition() MUST be called before any
           admin product status change. Admin NEVER bypasses the product state machine.

INV-S7-22  GET /admin/audit-logs MUST be cursor-paginated (by AuditLog.id).
           NEVER unbounded. Max limit: 100.

INV-S7-23  AuditRepository MUST have NO update(), delete(), or upsert() methods.
           Immutability is enforced by method absence.

INV-S7-24  DLQ queue name is LOCKED as 'notifications-failed'.
           Admin reads from this name. Never alias. Never rename.

INV-S7-25  AdminModule MUST import ONLY:
             PrismaModule, RedisModule, BullMQModule, S3Module,
             NotificationModule, ObservabilityModule, AuditModule
           FORBIDDEN imports: OrderModule, InventoryModule, SellerModule,
           BuyerModule, PaymentModule, CatalogModule, CartModule.

INV-S7-26  Admin cross-domain reads MUST use direct Prisma access.
           NEVER import domain modules for data access. Use admin-*.repository.ts.

INV-S7-27  Session revocation after user suspension MUST also delete Redis key
           seller_biz:{userId} to prevent stale SellerContextGuard cache.
           This Redis DEL happens OUTSIDE the $transaction.

INV-S7-28  EventOutbox.deduplicationKey for Sprint 7 events MUST follow:
           {eventType}:{entityId}:{adminUserId}
           Deterministic, idempotent, admin-actor-scoped.

INV-S7-29  Notification.status field MUST be updated to SENT on delivery success
           and FAILED on DLQ. NotificationWorker owns this update.
           Defaults to PENDING on record creation.

INV-S7-30  buyerCode in OrderCreatedPayloadSchema is z.string().optional().
           When present, set from maskBuyerId(order.buyerId) — NEVER raw buyerId.

INV-S7-31  NotificationListQuerySchema MUST include:
           dateFrom: z.string().datetime().optional()
           dateTo: z.string().datetime().optional()

INV-S7-32  Notification.status migration: enum NotificationDeliveryStatus { PENDING SENT FAILED }
           Migration name: 20260601_sprint7_notification_status.

INV-S7-33  Admin GET /admin/businesses/:id MUST log AuditLog entry when KYC documents
           are returned. Use AuditAction.UPDATE with newValue: { action: 'KYC_DOCUMENTS_VIEWED' }
           AuditAction.READ does NOT exist in schema — NEVER use it.

INV-S7-34  Exception center data is NOT cached in Redis. Computed fresh on each request.

INV-S7-35  SellerPayout creation MUST be inside the same $transaction that marks
           Order.status = COMPLETED. CRITICAL: Order.sellerId = Business.id (not User.id).
           MUST resolve: const biz = await tx.business.findUnique({ where: { id: order.sellerId }, select: { ownerId: true } })
           Use biz.ownerId as SellerPayout.sellerId.

INV-S7-36  JwtAuthGuard MUST check user.isDeleted on every request.
           isDeleted=true → 401 even with valid JWT.
           Verify JwtStrategy.validate() fetches user from DB and asserts !user.isDeleted.

INV-S7-37  OrderStatusHistory.actorRole is typed as SystemActorType.
           All admin status history writes MUST use actorRole: SystemActorType.ADMIN.

INV-S7-38  ⚠️ CRITICAL: Every tx.eventOutbox.create() in Sprint 7 MUST include:
           eventMonth: formatYearMonth(new Date())
           EventOutbox.eventMonth is a non-nullable String with NO default in schema.
           Omission causes Prisma P2012 required field error at runtime.
           Import formatYearMonth from: apps/api/src/modules/order/order-state-machine.ts

═══════════════════════════════════════════════════════
MANDATORY CODE PATTERNS — FOLLOW EXACTLY
═══════════════════════════════════════════════════════

──── 1. TRANSACTION BOUNDARY PATTERN ────────────────────────────────────

  INSIDE $transaction (atomic):
    1. Read current state (for oldValue in AuditLog)
    2. Validate state transition (state machine or explicit guard)
    3. Update primary entity (Business/Product/User/Order)
    4. tx.eventOutbox.create({ ..., eventMonth: formatYearMonth(new Date()) })  ← INV-S7-38
    [NOTE: safeWrite() is NOT called here — it has no tx parameter]

  CLOSING BRACE of $transaction

  OUTSIDE $transaction (after commit):
    5. await auditWriter.safeWrite({ ... })           ← INV-S7-2 ALWAYS OUTSIDE
    6. await redis.set(admin-idem:{key}, result)      ← idempotency store
    7. await notificationService.sendDirect(...)      ← INV-S7-19 ALWAYS OUTSIDE
    8. await redis.del(seller_biz:{userId})           ← cache invalidation

──── 2. COMPLETE EVENTOUTBOX WRITE PATTERN ──────────────────────────────

  await tx.eventOutbox.create({
    data: {
      eventType:        'BusinessVerified',                           // string
      payload:          { ...payloadObj } as Prisma.InputJsonValue,  // validated object
      schemaVersion:    '7.0',                                        // INV-S7-6
      eventVersion:     '1.0',                                        // INV-S7-6
      deduplicationKey: `BusinessVerified:${id}:${adminUserId}`,     // INV-S7-28
      eventMonth:       formatYearMonth(new Date()),                  // INV-S7-38 ⚠️ REQUIRED
      status:           EventStatus.PENDING,
    },
  });
  // OrderStatusChanged uses schemaVersion: '5.0' (existing handler)

──── 3. AUDIT LOG WRITE PATTERN ─────────────────────────────────────────

  await this.auditWriter.safeWrite({
    actorId:    req.user.id,                          // INV-S7-3 — JWT ONLY
    action:     AuditAction.STATUS_CHANGE,            // NEVER AuditAction.READ
    entityType: 'Business',
    entityId:   businessId,
    entityName: business.name,
    oldValue:   { kycStatus: oldStatus },
    newValue:   { kycStatus: 'VERIFIED' },
    ipAddress:  req.ip,
    userAgent:  req.headers['user-agent'] as string,
    sessionId:  req.user.sessionId,
  });
  // auditMonth set automatically by AuditRepository.create() — INV-S7-4

──── 4. GUARD STACK PATTERN ─────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, AdminContextGuard)   // Admin routes ONLY this pattern
  // DO NOT add RolesGuard — AdminContextGuard checks role internally
  // DO NOT add SellerContextGuard EVER on admin routes

──── 5. KYC SIGNED URL PATTERN ──────────────────────────────────────────

  const signedUrls: Record<string, string> = {};
  for (const doc of kycDocs) {
    if (doc.status === KycStatus.REJECTED) continue;  // H-P1-5: skip REJECTED
    try {
      signedUrls[doc.id] = await this.s3.getSignedUrl(doc.url, 300);  // max 300s
    } catch (e) {
      this.logger.warn(`Signed URL failed for doc ${doc.id}`);
    }
  }
  // NEVER: kycDocument.publicUrl = signedUrl  ← P0 violation
  // NEVER: return s3 public URL  ← P0 violation

──── 6. USER SUSPENSION PATTERN (ALL THREE atomic) ──────────────────────

  // BEFORE transaction:
  if (targetUserId === adminUserId) throw ForbiddenException  // INV-S7-11

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: targetUserId }, data: {
      isDeleted: true,
      tokenVersion: { increment: 1 },   // INV-S7-10 ← REQUIRED
    }});
    await tx.loginSession.updateMany({ where: { userId: targetUserId, revoked: false }, data: {
      revoked: true, revokedAt: new Date(), revokeReason: 'ADMIN_SUSPENSION',
    }});
    await tx.eventOutbox.create({ data: { ..., eventMonth: formatYearMonth(new Date()) }});
  });

  // OUTSIDE transaction:
  await redis.del(`seller_biz:${targetUserId}`).catch(()=>{})  // INV-S7-27

──── 7. PAYOUT CREATION PATTERN (sellerId resolution) ───────────────────

  // INSIDE $transaction that marks COMPLETED:
  const biz = await tx.business.findUnique({
    where: { id: order.sellerId },    // order.sellerId = Business.id, NOT User.id
    select: { ownerId: true },
  });
  await tx.sellerPayout.create({ data: {
    sellerId: biz!.ownerId,           // INV-S7-35: resolve Business.ownerId
    orderId: order.id,
    grossAmount: ...,
    ...
  }});

═══════════════════════════════════════════════════════
DTO & ZOD GOVERNANCE RULES
═══════════════════════════════════════════════════════

  ✓ ALL input validation uses Zod schemas
  ✓ ALL Zod schemas live in packages/types/src/admin/ (NOT in apps/api)
  ✓ NEVER use class-validator decorators for admin DTOs
  ✓ NEVER define validation inline in a service or controller
  ✓ NEVER import from @vyaparnet/database inside DTO schema files
  ✓ Use .strict() on all Zod object schemas (rejects unknown keys)
  ✓ Use z.enum(['BUYER','SELLER']) for role fields — NEVER z.string()
  ✓ Parse DTOs at controller entry point using ZodValidationPipe or manual parse
  ✓ Validation failure → 422 Unprocessable Entity with Zod error details

═══════════════════════════════════════════════════════
MODULE BOUNDARY & DEPENDENCY RULES
═══════════════════════════════════════════════════════

  AdminModule imports ALLOWED:
    PrismaModule, RedisModule, BullMQModule, S3Module,
    NotificationModule, ObservabilityModule, AuditModule
    BullModule.registerQueue({ name: 'invoice-generation' })

  AdminModule imports FORBIDDEN (INV-S7-25):
    ❌ OrderModule        ❌ InventoryModule
    ❌ SellerModule       ❌ BuyerModule
    ❌ PaymentModule      ❌ CatalogModule
    ❌ CartModule

  Cross-domain data access:
    ✓ Use direct Prisma in admin-*.repository.ts files
    ❌ NEVER import SellerOrderRepository, BuyerOrderRepository etc.

  AdminModule exports:
    NOTHING — it is a leaf module

═══════════════════════════════════════════════════════
REDIS KEY GOVERNANCE
═══════════════════════════════════════════════════════

  Sprint 7 NEW keys (no collision with Sprint 1-6):
    admin-idem:{idempotencyKey}     TTL=86400s   AdminIdempotencyService
    flag:{name}:{env}:{segment}     TTL=300s     AdminFlagService
    admin-rate:{adminId}:{minute}   TTL=60s      AdminRateLimitGuard

  DO NOT create any Redis key starting with:
    otp:, ratelimit:, lockout:, session:, seller_biz:, kpi:,
    status-transition:, seller_score:, notif:, outbox-processed:, cb:

  Cache invalidation patterns:
    Feature flag: SCAN flag:{name}:{env}:* then DEL (NOT pattern delete)
    User suspend: DEL seller_biz:{userId} (exact key)

═══════════════════════════════════════════════════════
SECURITY ENFORCEMENT CHECKLIST
═══════════════════════════════════════════════════════

Before implementing any endpoint, verify:
  □ Actor identity from req.user.id only (never body/param)
  □ AdminContextGuard applied (not RolesGuard)
  □ Self-modification prevention on suspend/change-role
  □ Idempotency-Key enforced on all state-change routes
  □ AuditLog created for EVERY state-changing admin action
  □ No KycDocument.publicUrl mutation
  □ Signed URL TTL ≤ 300 seconds
  □ AuditAction.READ is NEVER used (does not exist in enum)
  □ Role change Zod schema rejects ADMIN/SELLER_MANAGER
  □ Batch operations capped at 100 items

═══════════════════════════════════════════════════════
OBSERVABILITY REQUIREMENTS
═══════════════════════════════════════════════════════

Every admin state-change service method MUST:
  1. Increment the relevant Prometheus counter:
     admin_business_verified_total, admin_product_approved_total, etc.
  2. Emit structured JSON log with consistent fields:
     { action, adminId, entityId, entityType, result }
  3. Use a NestJS Logger instance (NOT console.log)
  4. Wrap timer-sensitive operations (invoice PDF) in a Histogram observation

═══════════════════════════════════════════════════════
IMPLEMENTATION EXECUTION
═══════════════════════════════════════════════════════

Now implement Phase [PHASE_NO]: [PHASE_NAME]

Follow these implementation rules:

  1. STRICT TYPESCRIPT — No `any` types. No `as any` casts. No `!` assertions
     without null checks. Every variable has an explicit type.

  2. ERROR HANDLING — Every async operation has a try/catch or .catch().
     Errors from non-critical operations (notifications, Redis, metrics)
     are caught and logged — they NEVER propagate to break the main flow.

  3. NULL SAFETY — Every Prisma findUnique/findFirst result is null-checked.
     Missing entity → NotFoundException with { code: 'ENTITY_NOT_FOUND' }.

  4. TRANSACTION SAFETY — Read current state before the transaction for
     oldValue capture. Never read from DB inside the transaction when the
     same data was already fetched outside it.

  5. IDEMPOTENCY — State-change routes check idempotency BEFORE starting
     any database work. Redis check is outside the Prisma transaction.

  6. TESTABILITY — Write or update unit tests for every new service method.
     Minimum: happy path, error path, idempotency path.

  7. IMPORT ORDER — Check existing imports before adding new ones.
     Never create circular dependencies. Verify with the dependency rules above.

  8. FILE LOCATION — All new files go into the locations defined in §7 of
     SPRINT_7_EXECUTION_LOCK_FINAL.md. Do not create files outside the specified
     directory tree.

═══════════════════════════════════════════════════════
VERY IMPORTANT SELF-AUDIT REQUIREMENT
═══════════════════════════════════════════════════════

After implementation completes, STOP. Perform a FULL SELF-AUDIT.
Re-read the phase section from SPRINT_7_EXECUTION_LOCK_FINAL.md.
Check every item in this list:

COMPLETENESS AUDIT:
  □ All implementation steps in the phase section are completed
  □ All sub-steps are completed (not just the main steps)
  □ Controller, Service, Repository layer all implemented
  □ All DTO schemas created in packages/types/src/admin/
  □ All tests written and passing

INVARIANT AUDIT — verify these are satisfied by your implementation:
  □ INV-S7-1  AdminContextGuard (not RolesGuard) on all admin routes
  □ INV-S7-2  safeWrite() called OUTSIDE $transaction
  □ INV-S7-3  actorId = req.user.id (never body/param)
  □ INV-S7-5  safeWrite failure does NOT block business operation
  □ INV-S7-6  schemaVersion:'7.0' on all new events (5.0 for OrderStatusChanged)
  □ INV-S7-7  Idempotency-Key enforced on all PATCH/POST state-change routes
  □ INV-S7-19 sendDirect() called OUTSIDE $transaction
  □ INV-S7-25 No forbidden module imported in AdminModule
  □ INV-S7-26 No domain module repository imported directly
  □ INV-S7-28 deduplicationKey format = {eventType}:{entityId}:{adminUserId}
  □ INV-S7-38 eventMonth: formatYearMonth(new Date()) present in ALL EventOutbox creates

SECURITY AUDIT:
  □ No actor identity sourced from request body
  □ No AuditAction.READ used (doesn't exist)
  □ No KycDocument.publicUrl mutated
  □ No signed URL TTL > 300s
  □ Self-modification prevention on suspend/change-role
  □ Bulk approve capped at 100
  □ Role change rejects ADMIN/SELLER_MANAGER targets

ARCHITECTURE AUDIT:
  □ No circular dependencies introduced
  □ No forbidden module imports in AdminModule
  □ Admin repositories use direct Prisma (not domain repositories)
  □ DTO schemas are in packages/types/src/admin/ (not in apps/api)
  □ EventOutbox writes are INSIDE $transaction
  □ safeWrite/sendDirect/Redis operations are OUTSIDE $transaction

TYPING AUDIT:
  □ No `any` types used anywhere in implementation
  □ All Zod schemas use .strict()
  □ All Prisma InputJsonValue casts are type-safe
  □ No silent undefined that could cause runtime errors

OBSERVABILITY AUDIT:
  □ Prometheus counter incremented for each state-change action
  □ Structured JSON logs emitted with correct fields
  □ Error conditions logged (not swallowed silently)

FOOTGUN AUDIT:
  □ Re-read ALL FOOTGUN-[PHASE_NO]-* entries from the phase section
  □ Verify none of those patterns appear in your implementation

═══════════════════════════════════════════════════════
IF ANY ISSUE IS FOUND:
  STOP. FIX IT. Then re-audit from the top of this section.
  Do not proceed to validation until the audit is clean.
═══════════════════════════════════════════════════════

═══════════════════════════════════════════════════════
MANDATORY VALIDATION STEPS
═══════════════════════════════════════════════════════

These commands MUST pass before you can declare phase completion.
Run them from the root of the VyaparNet monorepo.
If any step fails, fix the issue and re-run ALL steps from step 1.

STEP 1 — LINT
  pnpm turbo run lint --filter=@vyaparnet/api
  pnpm turbo run lint --filter=@vyaparnet/types
  Expected: 0 errors, 0 warnings

STEP 2 — TYPECHECK
  pnpm turbo run typecheck --filter=@vyaparnet/api
  pnpm turbo run typecheck --filter=@vyaparnet/types
  Expected: 0 TypeScript errors

STEP 3 — TESTS
  pnpm turbo run test --filter=@vyaparnet/api
  Expected: ALL tests pass. New tests you wrote for Phase [PHASE_NO] pass.
  Expected: Total test count ≥ previous total (no regressions)

STEP 4 — PRISMA VALIDATION
  cd packages/database && pnpm prisma validate
  cd packages/database && pnpm prisma generate
  Expected: 0 validation errors. Client generated successfully.

STEP 5 — DTO VALIDATION
  pnpm turbo run build --filter=@vyaparnet/types
  Expected: 0 compilation errors.
  Manual check: Verify new Zod schemas are exported from packages/types/src/index.ts

STEP 6 — IMPORT VALIDATION (manual)
  Verify AdminModule does NOT import:
    OrderModule, InventoryModule, SellerModule, BuyerModule,
    PaymentModule, CatalogModule, CartModule
  Verify admin-*.repository.ts does NOT import from:
    seller-order.repository, buyer-order.repository, or similar

STEP 7 — DEPENDENCY VALIDATION
  pnpm turbo run build --filter=@vyaparnet/api
  Expected: 0 compilation errors. No missing dependencies.

STEP 8 — CIRCULAR DEPENDENCY VALIDATION
  npx madge --circular apps/api/src/modules/admin/ --ts-config apps/api/tsconfig.json
  Expected: No circular dependencies detected.
  (Install madge if not present: pnpm add -D madge)

══════════════════════════════════════════════════════════════════
⚠️  HARD STOP REQUIREMENT — DO NOT ADVANCE WITHOUT PERMISSION  ⚠️
══════════════════════════════════════════════════════════════════

After ALL 8 validation steps pass with zero errors:

  1. Write a concise PHASE COMPLETION SUMMARY covering:
       ✓ Files created (list with paths)
       ✓ Files modified (list with paths)
       ✓ Invariants satisfied (list INV-S7-N numbers)
       ✓ Tests added (count + key scenarios covered)
       ✓ Validation gate results (all 8 steps)
       ✓ Any observations or deferred items

  2. STOP. Do not implement any part of the next phase.

  3. Ask the user: "Phase [PHASE_NO] is complete and verified.
     Ready to proceed with Phase [PHASE_NO + 1]: [NEXT_PHASE_NAME]?
     Please confirm to continue."

  4. Wait for explicit user confirmation before proceeding.

══════════════════════════════════════════════════════════════════
