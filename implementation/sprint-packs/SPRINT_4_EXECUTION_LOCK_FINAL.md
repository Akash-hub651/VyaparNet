# VYAPARNET — SPRINT 4 EXECUTION LOCK FINAL
## Cart, Orders & Payments: Enterprise Checkout Orchestration
### Version: v3.0 FINAL AUDIT LOCK | Enterprise Architecture Audit Board Authority
### Authority: MASTER_IMPLEMENTATION_ROADMAP + SPRINT3_EXECUTION_LOCK_FINAL + Sprint 4 Scope Decisions (v1.0 APPROVED)
### Date: 2026-05-28 | Status: FINAL AUDIT LOCK — FREEZE-READY
### Hardening Pass 1 (v2.0): 23 vulnerabilities resolved, 8 new invariants (INV-19–INV-26) added
### Final Audit (v3.0): 18 additional vulnerabilities resolved, 7 new invariants (INV-27–INV-33) added, 4 new warnings (S4-W19–S4-W22)

> **DOCUMENT STATUS: v3.0 FINAL AUDIT LOCK**
> This document is the ONLY implementation authority for Sprint 4.
> All engineers and AI-agents implementing Sprint 4 MUST use this document exclusively.
> Scope Decisions (v1.0 APPROVED) are the upstream authority. This document is the HOW.
> Sprint 1–3 frozen guarantees are ABSOLUTE SYSTEM LAWS — they are NOT re-derived here. They are cited and inherited.
> v1.0 → v2.0: Enterprise Hardening Board — adversarial review, 23 vulnerabilities resolved.
> v2.0 → v3.0: Final Audit Board — 18 additional vulnerabilities resolved. Schema gaps, runtime null-reference bugs, non-determinism in COD provider, idempotency key inconsistencies, state machine gaps, and migration incompleteness all resolved.

---

## DOCUMENT INDEX

- [§0  GLOBAL NON-NEGOTIABLE SYSTEM INVARIANTS (INHERITED + SPRINT 4 ADDITIONS)](#0-global-non-negotiable-system-invariants)
- [§1  Sprint Identity](#1-sprint-identity)
- [§2  Required Context Files](#2-required-context-files)
- [§3  Transaction Boundary Governance](#3-transaction-boundary-governance)
- [§4  Cache Authority Governance](#4-cache-authority-governance)
- [§5  EventOutbox Governance](#5-eventoutbox-governance)
- [§6  Order State Machine Architecture](#6-order-state-machine-architecture)
- [§7  Checkout Saga Orchestration](#7-checkout-saga-orchestration)
- [§8  Inventory Integration Contract](#8-inventory-integration-contract)
- [§9  Payment Orchestration Architecture](#9-payment-orchestration-architecture)
- [§10 Cart Architecture](#10-cart-architecture)
- [§11 Module Structure & Package Boundaries](#11-module-structure--package-boundaries)
- [§12 Zod DTO Governance](#12-zod-dto-governance)
- [§13 Redis Key Registry](#13-redis-key-registry)
- [§14 BullMQ Queue Architecture](#14-bullmq-queue-architecture)
- [§15 Security Architecture](#15-security-architecture)
- [§16 Webhook Processing Architecture](#16-webhook-processing-architecture)
- [§17 Reconciliation Architecture](#17-reconciliation-architecture)
- [§18 Degraded-Mode Behavior](#18-degraded-mode-behavior)
- [§19 Observability Architecture](#19-observability-architecture)
- [§20 Detailed Implementation Reference](#20-detailed-implementation-reference)
- [§21 API Contract Reference](#21-api-contract-reference)
- [§22 Phased Execution Plan](#22-phased-execution-plan)
- [§23 Sprint Validation Gate](#23-sprint-validation-gate)
- [§24 Failure Conditions](#24-failure-conditions)
- [§25 Sprint 4 → Sprint 5 Handoff](#25-sprint-4--sprint-5-handoff)
- [§26 Universal Agent Implementation Prompt](#26-universal-agent-implementation-prompt)
- [§27 AI-Agent Implementation Warnings](#27-ai-agent-implementation-warnings)
- [§28 Rollback & Operational Readiness](#28-rollback--operational-readiness)
- [§29 Future Scalability & Microservice Extraction Notes](#29-future-scalability--microservice-extraction-notes)

---

## §0 GLOBAL NON-NEGOTIABLE SYSTEM INVARIANTS

> **AUTHORITY STATUS: SUPREME**
> These invariants govern Sprint 4 absolutely.
> They INHERIT all Sprint 1–3 invariants without modification.
> Sprint 4 adds new invariants for order, payment, and saga correctness.
> No phase, no sub-phase, no agent implementation, no optimization may violate any invariant here. EVER.

---

### INV-S3-ALL: All Sprint 3 Invariants Are Inherited — Unchanged

```
INV-1 through INV-10 from SPRINT3_EXECUTION_LOCK_FINAL.md §0 are ABSOLUTE.
Sprint 4 adds NO modifications to them. They are referenced verbatim.

Key Sprint 3 invariants that Sprint 4 code MUST respect:
- INV-1: DB $transaction is the ONLY correctness authority
- INV-2: Inventory quantity NEVER negative
- INV-3: Atomic mutation bundle (quantity + movement + reservation + EventOutbox)
- INV-4: Lock acquired BEFORE transaction, released AFTER commit
- INV-5: Optimistic locking version check mandatory
- INV-6: Idempotency key is the FIRST operation
- INV-7: InventoryMovement is APPEND-ONLY — forever
- INV-8: Redis is display optimization ONLY — never correctness authority
- INV-9: Server-computed timestamps — never client-provided
- INV-10: Zero-oversell — enforced at DB layer, not application layer

Sprint 4 code that violates ANY of INV-1 through INV-10 is INVALID.
```

---

### INV-11: consume() MUST receive tx from caller — NEVER opens its own $transaction

```
InventoryService.consume(reservationId, actorId, tx) receives the Prisma
transaction client from the CALLING transaction.

CORRECT — COD order creation:
  await prisma.$transaction(async (tx) => {
    await tx.order.create({...});
    await tx.orderItem.createMany({...});
    await inventoryService.consume(reservationId, userId, tx); // ← tx passed
    await tx.orderStatusHistory.create({...});
    await tx.eventOutbox.create({...});
  });

CORRECT — Online payment webhook:
  await prisma.$transaction(async (tx) => {
    await tx.payment.update({ status: 'CAPTURED', ... });
    await inventoryService.consume(reservationId, userId, tx); // ← tx passed
    await tx.order.update({ status: 'CONFIRMED', ... });
    await tx.orderStatusHistory.create({...});
    await tx.eventOutbox.create({...});
  });

FORBIDDEN:
  await inventoryService.consume(reservationId, userId); // ← no tx → opens own $transaction → WRONG
```

**Violation signal**: `consume()` called without `tx` parameter. consume() opens its own `prisma.$transaction()`.

---

### INV-12: No Razorpay/External HTTP Calls Inside $transaction

```
$transaction callbacks must NEVER contain:
  - razorpay.orders.create()
  - razorpay.payments.capture()
  - Any HTTP call
  - Any Redis call
  - Any BullMQ queue.add()

All Razorpay SDK calls happen BEFORE or AFTER the $transaction. NEVER inside.

WHY: Razorpay API calls can take 2–30 seconds. Holding a DB transaction for
this duration causes connection pool exhaustion, lock contention, and timeouts.
```

**Violation signal**: `razorpay.*` import inside a `prisma.$transaction()` callback.

---

### INV-13: OrderStatusHistory is APPEND-ONLY — Forever

```
OrderStatusHistoryRepository MUST have ZERO update() or delete() methods.

Every state transition creates a NEW record. Old records are NEVER modified.
This mirrors InventoryMovement (INV-7 from Sprint 3).

Comment at top of OrderStatusHistoryRepository:
// APPEND-ONLY: This repository has no update() or delete() methods by design.
// See Sprint 4 INV-13. Violating this destroys audit trail integrity.

REQUIRED fields on every record:
  orderId, statusFrom, statusTo, actorId, actorRole, reason (optional), timestamp
```

---

### INV-14: Order Total Computed Server-Side — Never Trusted from Client

```
grandTotal, subtotal, taxAmount are ALWAYS computed by OrderService.calculateOrderTotal()
at order creation time from:
  - Inventory.price (fetched live from DB)
  - Product.gstPercent (from DB)
  - CartItem.quantity (from DB, not from request body)

FORBIDDEN: Using any price/total from request body for order financial calculation.
FORBIDDEN: Using CartItem.unitPrice (stale cache) as the authoritative price.
REQUIRED: Price fetched from Inventory.price within the same pre-transaction validation pass.
```

---

### INV-15: Webhook Signature Validation — Mandatory, Non-Negotiable, First Operation

```
POST /payments/webhook MUST:
  1. Extract raw body (Buffer — not parsed JSON)
  2. Compute HMAC-SHA256 using crypto.timingSafeEqual()
  3. Reject with 400 if signature invalid — NO FURTHER PROCESSING

FORBIDDEN: Processing webhook body before HMAC verification.
FORBIDDEN: Using string comparison instead of crypto.timingSafeEqual() (timing attack).
FORBIDDEN: JSON.parse(req.body) before HMAC verification (body must be raw Buffer).

REQUIRED middleware: express.raw({ type: '*/*' }) on /payments/webhook route ONLY.
JSON middleware must NOT run on this route.
```

---

### INV-16: Payment Idempotency Key — First Operation Before Any Payment Processing

```
Payment processing order (mirrors INV-6 from Sprint 3):
  1. Redis GET webhook_idem:{razorpayEventId} ← FIRST
  2. If exists: return cached 200 response immediately (no processing)
  3. HMAC validation (done before reaching this point)
  4. Queue job to BullMQ worker
  5. Redis SET webhook_idem:{razorpayEventId} AFTER queueing (NX, TTL 24h)

For POST /payments/initiate:
  1. Redis GET payment_idem:{clientKey} ← FIRST
  2. If exists: return cached response (no double charge)
  3. Create Razorpay order
  4. Create Payment record in DB
  5. Redis SET payment_idem:{clientKey} AFTER DB write (NX, TTL 24h)
```

---

### INV-17: Deterministic EventOutbox Deduplication Keys — No Timestamps, No UUIDs

```
All Sprint 4 EventOutbox.deduplicationKey values MUST be deterministic.

REQUIRED patterns:
  OrderCreated:    'order-created-{orderId}'
  OrderConfirmed:  'order-confirmed-{orderId}'
  OrderCancelled:  'order-cancelled-{orderId}-{cancellationId}'
  PaymentReceived: 'payment-received-{paymentId}'
  PaymentFailed:   'payment-failed-{paymentId}'
  OrderPlaced:     'order-placed-{orderId}'

FORBIDDEN:
  `order-created-${Date.now()}`       ← timestamp — NOT deterministic
  `order-created-${randomUUID()}`     ← random — NOT deterministic
  `order-confirmed-${new Date()}`     ← date — NOT deterministic

WHY: Non-deterministic keys allow duplicate events if the same transaction commits
twice (retry scenario). Deterministic keys enforce exactly-once EventOutbox delivery.
```

---

### INV-18: Segment Isolation — All Cart/Order/Payment Queries

```
Every CartRepository, OrderRepository, and PaymentRepository query MUST include
segment or ownership filter. Cross-segment data leakage is architecturally invalid.

CartRepository: ALL queries filter by userId + segment
OrderRepository: ALL queries filter by buyerId OR sellerId (never cross-user)
PaymentRepository: ALL queries filter by orderId (which is already buyer-scoped)

FORBIDDEN: Any query that returns carts/orders from multiple users.
FORBIDDEN: Any query that returns TEXTILE orders to a SPARE_PARTS buyer.
```

---

### INV-19: Double-Consume Race — Order Must Be PLACED Before consume() Is Called

```
Race condition vector: Two concurrent payment.captured webhooks for the same razorpayOrderId.
Both pass idempotency check (Redis SET NX race window) and both attempt to consume().

Fix — PaymentWebhookProcessorWorker MUST verify order status atomically before consume():

INSIDE the webhook $transaction (before consume()):
  1. tx.order.findFirst({ where: { id: orderId }, select: { status: true } })
  2. If order.status !== 'PLACED': throw new ConflictException({ code: 'ORDER_NOT_IN_PLACED_STATE' })
     → This causes the duplicate job to rollback cleanly.
  3. Only then: proceed to consume()

This pattern ensures the first committing transaction wins.
The second transaction reads 'CONFIRMED' (or sees a lock conflict) and aborts safely.

FORBIDDEN: Calling consume() without first asserting order.status === 'PLACED' inside the same $transaction.
FORBIDDEN: Relying solely on Redis webhook_idem key for double-consume protection.
          Redis NX is NOT atomic with the DB transaction — a crash between NX-SET and queue.add() creates a window.

WHY Redis alone is insufficient:
  WebhookController sets webhook_idem NX → succeeds → adds to BullMQ → responds 200.
  If BullMQ retries the job (transient worker failure), the worker runs again.
  The Redis NX key was already set by WebhookController (not the worker).
  The worker uses webhook_idem_result for its own idempotency — but this key is set
  AFTER the $transaction. A crash between $transaction.commit() and
  redis.set(webhook_idem_result) causes the worker to retry without the result key.
  The DB-level status check inside the $transaction is the only reliable guard.
```

**Violation signal**: `consume()` called without `order.status === 'PLACED'` assertion in the same `$transaction`.

---

### INV-20: eventVersion MUST Be Present on All Sprint 4 EventOutbox Records

```
Every Sprint 4 EventOutbox.create() MUST include eventVersion and schemaVersion
(inherited from Sprint 3 §6.3 — INV-13 of that document).

FORBIDDEN: EventOutbox records without eventVersion.
FORBIDDEN: EventOutbox records without schemaVersion.

REQUIRED on every EventOutbox.create():
  eventType: 'OrderCreated',
  eventVersion: '1.0',          ← MANDATORY
  schemaVersion: '4.3',         ← MANDATORY
  payload: { ... },
  deduplicationKey: '...',
  eventMonth: '...',
  status: 'PENDING',

WHY: Sprint 6 (Notifications), Sprint 7 (Admin), Sprint 9 (ERP) consumers MUST
be able to route by version. Events without version fields are unroutable during
future consumer migrations (version 1.x → 2.0).
Missing eventVersion today = silent consumer breakage in Sprint 6+.
```

**Violation signal**: Any `eventOutbox.create()` call in Sprint 4 code missing `eventVersion` or `schemaVersion`.

---

### INV-21: Rate-Limit INCR/EXPIRE Must Be Atomic (Lua Script or SET with EX+NX)

```
The current pattern:
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 3600);

VULNERABILITY: Two-command non-atomic sequence.
  If the process crashes between INCR and EXPIRE:
    → Key exists with count=1 but NO TTL → key never expires → rate limit PERMANENTLY blocked for userId.

Fix — use atomic SET with NX+EX for first call, INCR for subsequent:

  // Atomic rate limiter implementation:
  const result = await redis.set(key, '1', 'EX', windowSeconds, 'NX');
  if (result === null) {
    // Key already exists — increment
    const count = await redis.incr(key);
    if (count > limit) throw new TooManyRequestsException(...);
  }
  // If result === 'OK': first request in window — always allowed

Alternatively, use a Lua script for full atomicity:
  local count = redis.call('INCR', KEYS[1])
  if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
  return count

BOTH implementations are acceptable. The plain INCR + separate EXPIRE is NOT acceptable.

AFFECTS: checkout_rate:{userId} and cart_rate:{userId} keys.
```

**Violation signal**: `redis.incr(key)` immediately followed by `if (count === 1) redis.expire(key, ttl)` as two separate awaits.

---

### INV-22: Webhook Controller MUST Respond Within 5 Seconds — Non-Negotiable

```
Razorpay marks a webhook as failed if no 200 response within 5 seconds.
The WebhookController path: HMAC verify → Redis NX → BullMQ queue.add() → return 200.

Each of these operations MUST have hard timeouts:
  HMAC verification:     synchronous (crypto) — no timeout needed
  Redis SET NX:          timeout: 500ms (see Runtime Architecture §1.5)
  BullMQ queue.add():    timeout: 1000ms
  Total budget:          < 5000ms (Razorpay limit)

FORBIDDEN: Any synchronous I/O or CPU-heavy work in WebhookController path.
FORBIDDEN: Any DB call in WebhookController (HMAC → Redis → BullMQ only).
FORBIDDEN: Calling PaymentService or OrderService inside WebhookController.

REQUIRED: WebhookController wraps Redis + BullMQ calls in Promise.race with timeout:
  await Promise.race([
    this.paymentsQueue.add(...),
    new Promise((_, reject) => setTimeout(() => reject(new Error('queue_timeout')), 2000))
  ]);
  // If queue.add times out: return 503 → Razorpay retries → idempotency key not set → safe retry.

WHY: If queue.add() hangs for 5+ seconds, Razorpay considers the webhook failed and retries.
     The idempotency key was set BEFORE queue.add(). On retry, the key exists → 200 returned immediately.
     But the original job was never queued. Result: Razorpay thinks webhook delivered, we never processed it.
     ReconciliationWorker is the safety net but adds 5-10min latency. Hard timeout prevents silent loss.
```

**Violation signal**: `WebhookController` without explicit timeout on `queue.add()` call.

---

### INV-23: PaymentRetryExpiryWorker Must NOT Rely Solely on Redis for Stuck Order Detection

```
Current design: PaymentRetryExpiryWorker checks Redis key payment_retry_window:{orderId}.
If Redis key is missing → assume window expired → cancel order.

VULNERABILITY: Redis key eviction (maxmemory policy) or Redis flush can delete the key
before the 30-minute TTL expires. This causes premature order cancellation while
the buyer is still in the retry window.

Fix — Dual authority: DB timestamp + Redis key:
  Order model MUST have paymentFailedAt: DateTime? field.
  PaymentRetryExpiryWorker logic:
    1. Query: orders WHERE status = 'PAYMENT_FAILED'
    2. For each: check BOTH conditions to cancel:
       a. Redis key payment_retry_window:{orderId} does NOT exist (Redis says expired), AND
       b. order.paymentFailedAt < now() - 30min (DB confirms window expired)
    3. Only cancel if BOTH conditions are true.
    4. If Redis key missing but DB timestamp says < 30min: skip + alert ops (Redis eviction detected)

SCHEMA ADDITION: If Order model does not have paymentFailedAt, add migration:
  ALTER TABLE "Order" ADD COLUMN "paymentFailedAt" TIMESTAMPTZ;
  Populated by: WebhookProcessorWorker when setting order to PAYMENT_FAILED status.

FORBIDDEN: Cancelling an order based solely on Redis key absence.
```

**Violation signal**: `PaymentRetryExpiryWorker` cancels orders based only on `redis.get(payment_retry_window:...)` returning null, without cross-checking `order.paymentFailedAt` timestamp in DB.

---

### INV-24: Idempotency Key Collision Attack Prevention

```
VULNERABILITY: Client-provided Idempotency-Key header (for POST /orders) can be
guessed or deliberately set to another buyer's cartId:userId pattern.

Attack vector: Buyer A sets Idempotency-Key to Buyer B's cartId:userId combination.
  → If Buyer B has already placed an order, Buyer A receives Buyer B's order response.
  → If timed right: Buyer A gets Buyer B's order details (orderId, address, items).

Fix — Server-side idempotency key namespace MUST incorporate authenticated userId:
  The Redis key for order idempotency is: order_idem:{cartId}:{userId}
  The {userId} is taken from the JWT token (trusted), NOT from the client header.

  For POST /orders: the Idempotency-Key header from client is used as a collision-detection
  hint only. The actual Redis key includes the server-verified userId.
  Redis key: order_idem:{userId}:{clientProvidedKey}   ← userId from JWT, always

  If client provides Idempotency-Key header without userId binding, the key pattern:
  order_idem:{cartId}:{userId} already provides namespace isolation (cartId belongs to userId).

FOR PAYMENT IDEMPOTENCY: payment_idem:{userId}:{clientProvidedKey}
  The userId MUST be prepended from JWT. The key pattern must be:
  `payment_idem:${userId}:${clientIdempotencyKey}` — not just `payment_idem:${clientIdempotencyKey}`.

FORBIDDEN: Using client-provided key as the sole Redis namespace component.
FORBIDDEN: payment_idem:{clientIdempotencyKey} without userId prefix.
```

**Violation signal**: Redis idempotency key for payment or order that does not incorporate `userId` from the verified JWT token.

---

### INV-25: Order Number Generation Must Use DB Sequence at Scale — Collision Guard Required

```
Current: generateOrderNumber() uses Math.random() for 5-digit suffix.
Collision probability: 1/90000 per order on same date.
At 100 orders/day: ~0.11% daily collision risk → DB unique constraint violation → order creation fails.

Fix — Two-tier approach:
  Tier 1 (Sprint 4, current scale): Add collision retry:
    try {
      await tx.order.create({ data: { orderNumber: generateOrderNumber(), ... } });
    } catch (err) {
      if (isPrismaUniqueConstraintError(err, 'orderNumber')) {
        // Retry with fresh random number — at most 3 retries
        await tx.order.create({ data: { orderNumber: generateOrderNumber(), ... } });
      }
      throw err;
    }

  Tier 2 (Sprint 6+, scale trigger: >500 orders/day):
    CREATE SEQUENCE order_seq START 10000;
    orderNumber = `VN-${datePart}-${await tx.$queryRaw`SELECT nextval('order_seq')`}`;

Note: The retry must be INSIDE the $transaction using the same `tx` client.
Retrying outside the transaction creates a partial-order state (other tx writes already happened).

FORBIDDEN: Allowing order creation to fail at DB layer due to orderNumber collision without retry.
FORBIDDEN: Retrying the ENTIRE $transaction for a number collision (all prior writes re-execute).
```

**Violation signal**: `order.create()` with `orderNumber` from `generateOrderNumber()` without a unique constraint violation retry handler inside the `$transaction`.

---

### INV-26: COD Synthetic Payment Record Is Mandatory — Created Inside Order $transaction

```
§9.5 notes: 'a synthetic Payment record with method=COD, status=CAPTURED is created inside order tx'
This is non-optional. It is MANDATORY.

REQUIRED: COD order $transaction MUST include:
  await tx.payment.create({
    data: {
      orderId: order.id,
      amount: grandTotal,
      method: 'COD',
      gateway: 'COD',
      status: 'CAPTURED',
      capturedAt: new Date(),
      idempotencyKey: `cod-${order.id}`,   ← deterministic
      gatewayRef: `cod-${order.id}`,       ← synthetic but unique
    }
  });

WHY: PaymentRepository.findByOrderId(orderId) is used by:
  - Sprint 7 Admin panel (payment detail view)
  - Sprint 9 ERP sync (financial record reconciliation)
  - GET /payments/:orderId/status (buyer payment status)
  If COD order has no Payment record, all these consumers fail silently with null/404.

FORBIDDEN: COD order creation $transaction without a synthetic Payment record.
FORBIDDEN: Creating the COD Payment record OUTSIDE the $transaction (atomicity required).
```

**Violation signal**: COD `$transaction` that does not include `tx.payment.create()` for the synthetic COD payment record.

---

### INV-27: PAYMENT_FAILED OrderStatus MUST Be Added via Migration — It Is NOT in Schema v4.3

```
CRITICAL SCHEMA GAP IDENTIFIED IN FINAL AUDIT:

The schema v4.3 OrderStatus enum does NOT contain 'PAYMENT_FAILED'.
The v4.3 enum contains: DRAFT, QUOTATION_REQUESTED, PLACED, CONFIRMED,
PROCESSING, READY_TO_SHIP, SHIPPED, OUT_FOR_DELIVERY, DELIVERED,
COMPLETED, CANCELLED, RETURN_INITIATED, REFUND_INITIATED,
DISPUTE_OPEN, DISPUTE_RESOLVED.

Sprint 4 requires: PAYMENT_FAILED

FIX — Required migration (Phase 1, before any business logic):
  ALTER TYPE "OrderStatus" ADD VALUE 'PAYMENT_FAILED';
  -- Note: PostgreSQL ALTER TYPE ADD VALUE cannot be run inside a transaction.
  -- Run as a standalone migration (Prisma: migrate dev --create-only, then edit SQL).

FORBIDDEN: Writing any Sprint 4 code that uses OrderStatus.PAYMENT_FAILED
           before this migration is confirmed applied.

VERIFICATION:
  SELECT enum_range(NULL::"OrderStatus");
  -- Must include 'PAYMENT_FAILED' in result before Sprint 4 Phase 3 begins.
```

**Violation signal**: Phase 1 migration checklist does not include `ALTER TYPE "OrderStatus" ADD VALUE 'PAYMENT_FAILED'`.

---

### INV-28: Order.paymentFailedAt Field MUST Be Added via Migration — Not in Schema v4.3

```
CRITICAL SCHEMA GAP IDENTIFIED IN FINAL AUDIT:

INV-23 mandates Order.paymentFailedAt: DateTime? for dual-authority
retry-window checking. This field is NOT in schema v4.3.

FIX — Required migration (Phase 1):
  ALTER TABLE "Order" ADD COLUMN "paymentFailedAt" TIMESTAMPTZ;
  -- Prisma schema addition: paymentFailedAt DateTime?

This field MUST be populated by WebhookProcessorWorker.handlePaymentFailed()
when setting order.status = 'PAYMENT_FAILED'.

FORBIDDEN: PaymentRetryExpiryWorker dual-authority logic (INV-23) running
           before paymentFailedAt migration is confirmed applied.

VERIFICATION:
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'Order' AND column_name = 'paymentFailedAt';
  -- Must return 1 row before Sprint 4 Phase 3.
```

**Violation signal**: Phase 1 migration checklist does not include the `paymentFailedAt` column addition.

---

### INV-29: OrderItem.sellerId MUST Be Added via Migration — Not in Schema v4.3

```
CRITICAL SCHEMA GAP IDENTIFIED IN FINAL AUDIT:

Scope Decisions D2.6, D8.1, D8.2, §25.3 all require OrderItem.sellerId
to be populated from Product.businessId at order creation time.
This field is NOT in the schema v4.3 OrderItem model.

FIX — Required migration (Phase 1):
  ALTER TABLE "OrderItem" ADD COLUMN "sellerId" TEXT;
  -- Add FK: REFERENCES "Business"("id") if referential integrity desired.
  -- Prisma: sellerId String? (nullable for backward compat, but REQUIRED on create)

FORBIDDEN: Creating OrderItem records without sellerId populated.
REQUIRED: OrderService.createOrder() populates sellerId from Product.businessId
          at order creation time. Never null on new orders.

VERIFICATION:
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'OrderItem' AND column_name = 'sellerId';
  -- Must return 1 row before Sprint 4 Phase 3.
```

**Violation signal**: Phase 1 migration checklist does not include the `OrderItem.sellerId` column addition.

---

### INV-30: Payment.gatewayPaymentId Uniqueness — Unique Constraint Required for Double-Capture Prevention

```
Scope Decision D11.5 states:
  'DB UNIQUE constraint on Payment.gatewayPaymentId prevents duplicate CAPTURED records'

The schema v4.3 Payment model does NOT have a gatewayPaymentId field or unique
constraint. The schema has gatewayRef (nullable, no unique constraint).

FIX — Clarification and alignment:
  gatewayPaymentId is the Razorpay payment ID (e.g., 'pay_xxxxx').
  This is a distinct concept from gatewayRef (which is the Razorpay ORDER ID 'order_xxxxx').
  Sprint 4 MUST store gatewayPaymentId separately from gatewayRef:

  ALTER TABLE "Payment" ADD COLUMN "gatewayPaymentId" TEXT;
  CREATE UNIQUE INDEX "idx_pay_gateway_payment_id" ON "Payment" ("gatewayPaymentId")
    WHERE "gatewayPaymentId" IS NOT NULL;
  -- Partial unique index allows multiple NULL values (pending payments without capture)

REQUIRED on payment.captured webhook:
  tx.payment.update({ data: { gatewayPaymentId: payload.razorpayPaymentId } })
  -- This enforces exactly-once capture at DB level.

FORBIDDEN: Storing razorpayPaymentId only in gatewayRef (mixed semantics — causes
           reconciliation confusion between gateway order and gateway payment).
```

**Violation signal**: `Payment` table update on `payment.captured` does not include `gatewayPaymentId` field with unique constraint enforcement.

---

### INV-31: handlePaymentFailed() payment Variable Must Be Fetched — ReferenceError in Production

```
CRITICAL RUNTIME BUG IDENTIFIED IN FINAL AUDIT:

In §14.5 PaymentWebhookProcessorWorker.handlePaymentFailed():
  const order = await this.orderRepository.findByGatewayOrderId(payload.razorpayOrderId);
  // ... releaseAllForOrder ...
  await this.prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },   ← 'payment' is NEVER DEFINED in this function!

The 'payment' variable is only fetched in handlePaymentCaptured(), not in handlePaymentFailed().
This is a guaranteed ReferenceError (payment is not defined) in production on any payment failure.

FIX — Add payment fetch to handlePaymentFailed():
  async handlePaymentFailed(payload: RazorpayPaymentPayload): Promise<void> {
    const order = await this.orderRepository.findByGatewayOrderId(payload.razorpayOrderId);
    if (!order) throw new Error(`Order not found for razorpayOrderId: ${payload.razorpayOrderId}`);

    // FIXED (INV-31): Fetch payment record — required for tx.payment.update()
    const payment = await this.paymentRepository.findByOrderId(order.id);
    if (!payment) throw new Error(`Payment record not found for orderId: ${order.id}`);

    // Release reservations OUTSIDE $transaction (sequential, idempotent — §7.3)
    ...

FORBIDDEN: handlePaymentFailed() that does not explicitly fetch the payment record
           before using it inside the $transaction.
```

**Violation signal**: `handlePaymentFailed()` references `payment.id` without first `const payment = await this.paymentRepository.findByOrderId(order.id)`.

---

### INV-32: CodPaymentProvider Must Use Deterministic providerOrderId — Not Date.now()

```
NON-DETERMINISM BUG IDENTIFIED IN FINAL AUDIT:

In §9.3 CodPaymentProvider.createOrder():
  providerOrderId: `cod-${Date.now()}`,   ← Date.now() is non-deterministic!
  providerPaymentId: `cod-${Date.now()}`, ← Same in capturePayment()

VULNERABILITY: If CodPaymentProvider.createOrder() is retried (process restart,
idempotency retry), each call generates a DIFFERENT providerOrderId.
The synthetic Payment record's gatewayRef changes on retry → idempotency key
(`cod-${order.id}`) still works for the Payment record, but
providerOrderId varies — causes reconciliation confusion.

FIX — Use orderId for determinism (callers must pass orderId):
  export interface PaymentOrderMetadata {
    orderId: string;   // ← Already in the interface
    buyerId: string;
    description: string;
  }

  // CodPaymentProvider.createOrder():
  createOrder(amount: number, currency: string, metadata: PaymentOrderMetadata): Promise<PaymentProviderOrder> {
    return Promise.resolve({
      providerOrderId: `cod-${metadata.orderId}`,   // ← orderId-based, deterministic
      amount: 0,
      currency: 'INR',
      metadata: {},
    });
  }

  // CodPaymentProvider.capturePayment() is never called for COD
  // (synthetic payment created directly in §3.3 COD transaction with gatewayRef: `cod-${order.id}`)
  // capturePayment() stub is fine since COD never calls it.

FORBIDDEN: Date.now() in any providerOrderId or gatewayRef that is stored
           in the Payment record. All gateway references must be deterministic.
```

**Violation signal**: `CodPaymentProvider.createOrder()` returns `providerOrderId: \`cod-${Date.now()}\`` instead of `providerOrderId: \`cod-${metadata.orderId}\``.

---

### INV-33: Idempotency Key Format MUST Be Consistent — order_idem:{userId}:{clientKey} Throughout

```
INCONSISTENCY IDENTIFIED IN FINAL AUDIT:

§7.1 Step 1 says:  'Redis GET order_idem:{cartId}:{userId}'
§7.4 says:         'order_idem:{cartId}:{userId}'
But §4.1 Table says: 'order_idem:{userId}:{clientProvidedKey}'
And §13 Registry says: 'order_idem:{userId}:{clientProvidedKey}'
And INV-24 mandates: userId from JWT MUST be first component.

The CORRECT format (per INV-24 and §13) is:
  order_idem:{userId}:{clientProvidedKey}

Where:
  - userId comes from the verified JWT token
  - clientProvidedKey is the Idempotency-Key header value
  - The combination provides: user-namespacing (INV-24) + client-controlled deduplication

For POST /orders, if client doesn't provide Idempotency-Key header:
  Return 400 IDEMPOTENCY_KEY_REQUIRED (not generate a key server-side)
  This is already documented in D11.3 — explicit enforcement.

FIX — Canonical key format (used everywhere, no exceptions):
  Order idempotency:    `order_idem:${userId}:${clientIdempotencyKey}`
  Payment idempotency:  `payment_idem:${userId}:${clientIdempotencyKey}`

All references in §7.1, §7.4, §8 that say 'order_idem:{cartId}:{userId}' are
CORRECTED to 'order_idem:{userId}:{clientIdempotencyKey}' per this invariant.

FORBIDDEN: Using cartId as the idempotency key base (INV-24 violation — cartId
           is not user-namespaced and can be guessed or collided).
```

**Violation signal**: Any `order_idem:{cartId}:*` key format in code. Correct is `order_idem:{userId}:{clientKey}` where userId is from JWT.

---

## §1 SPRINT IDENTITY

| Field | Value |
|---|---|
| Sprint Number | 4 |
| Sprint Name | Cart, Orders & Payments |
| Duration | 2 weeks |
| Objective | Complete end-to-end buyer checkout: add to cart → place order → COD or Razorpay payment → order confirmation. First revenue sprint. |
| Philosophy | This is the most complex sprint in the roadmap. Every step is atomic, idempotent, and rollback-safe. The checkout path never fails silently. Compensation is explicit. COD is always the zero-dependency fallback. |
| Saga Strategy | In-process orchestration (not distributed). OrderService is the explicit coordinator. |
| Payment Strategy | Synchronous initiation + async confirmation via webhook. COD confirms immediately. |
| Authority Documents | SPRINT3_EXECUTION_LOCK_FINAL.md + Sprint 4 Scope Decisions v1.0 + MASTER_IMPLEMENTATION_ROADMAP Sprint 4 |

---

## §2 REQUIRED CONTEXT FILES

Every agent implementing Sprint 4 MUST have read and internalized ALL of the following before writing code:

| Document | Purpose | Priority |
|---|---|---|
| `SPRINT3_EXECUTION_LOCK_FINAL.md` | Sprint 3 invariants (all inherited), InventoryService interface (§18), handoff contract (§30) | MANDATORY |
| `sprint_4_scope_decision.md` | All 12 scope decisions — the WHY behind every architectural choice | MANDATORY |
| `VyaparNet_SCHEMA_v4.3_FINAL_FREEZE.md` | Cart, CartItem, Order, OrderItem, Payment, EventOutbox, OrderStatus enum, PaymentStatus enum, CartStatus enum | MANDATORY |
| `MASTER_IMPLEMENTATION_ROADMAP.md` (Sprint 4 section) | Scope, dependencies, deliverables, execution sequence | MANDATORY |
| `VyaparNet_Database_Indexing_Strategy_Official_Freeze_v1.md` | Required indexes for Cart, Order, Payment, EventOutbox | MANDATORY |
| `VyaparNet_Deployment_Runtime_Architecture_v1.md` | Timeout values, circuit breaker patterns, queue topology | REQUIRED |
| `VyaparNet_API_Contracts_Backend_Scaffold_Blueprint.md` | API envelope format, error codes, versioning | REQUIRED |

---

## §3 TRANSACTION BOUNDARY GOVERNANCE

This section governs all `prisma.$transaction()` calls in Sprint 4.

### §3.1 What Is Permitted Inside $transaction

```
PERMITTED:
  ✅ tx.order.create({...})
  ✅ tx.orderItem.createMany({...})
  ✅ tx.orderStatusHistory.create({...})
  ✅ tx.eventOutbox.create({...})
  ✅ tx.payment.create({...})
  ✅ tx.payment.update({...})
  ✅ tx.order.update({ status: 'CONFIRMED' })
  ✅ inventoryService.consume(reservationId, actorId, tx)  ← passes tx through
  ✅ Synchronous in-process computation (total calculation, etc.)
  ✅ tx.cart.update({ status: 'CHECKED_OUT' })

FORBIDDEN:
  ❌ razorpay.orders.create()           ← HTTP call
  ❌ razorpay.payments.capture()        ← HTTP call
  ❌ redis.set() / redis.get()          ← Redis I/O
  ❌ queue.add()                        ← BullMQ I/O
  ❌ EventEmitter.emit()                ← event emission
  ❌ inventoryService.reserve()         ← opens own lock + $transaction
  ❌ inventoryService.release()         ← same reason
  ❌ smsService.send()                  ← HTTP call
  ❌ setTimeout() / setInterval()       ← async side effects
```

### §3.2 Transaction Timeout Policy

| Transaction | Timeout | Reason |
|---|---|---|
| Cart mutations | 5s | Simple write path, no inventory |
| COD order creation | 10s | Order + items + status history + events |
| Online order creation (PLACED) | 10s | Same scope — no payment inside |
| Payment webhook processing | 10s | Payment + order update + events |
| Order cancellation | 8s | Release does NOT happen inside tx |
| Payment retry | 10s | Same as webhook processing |

All timeouts use: `prisma.$transaction(async (tx) => {...}, { timeout: 10000, isolationLevel: 'ReadCommitted' })`

### §3.3 The COD Transaction (Reference Implementation)

```typescript
// COD: consume() happens INSIDE order creation $transaction
await prisma.$transaction(async (tx) => {
  // HARDENED (INV-25): orderNumber collision retry inside same tx
  let order: Order;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      order = await tx.order.create({
        data: {
          orderNumber: generateOrderNumber(),
          segment: cart.segment,
          buyerId: userId,
          sellerId: primarySellerId,
          cartId: cart.id,
          shippingAddressSnapshot: addressSnapshot,
          billingAddressSnapshot: addressSnapshot,
          subtotal,
          taxAmount,
          shippingCost: 0,
          discount: 0,
          grandTotal,
          placedAt: new Date(),
          confirmedAt: new Date(),   // COD: immediate confirmation
          status: 'CONFIRMED',
          orderMonth: formatYearMonth(new Date()),
        },
      });
      break; // success
    } catch (err) {
      if (isPrismaUniqueConstraintError(err, 'orderNumber') && attempt < 2) continue;
      throw err; // not a collision, or 3rd attempt — re-throw
    }
  }

  await tx.orderItem.createMany({ data: orderItemData });

  // HARDENED (INV-26): MANDATORY synthetic COD Payment record inside $transaction
  await tx.payment.create({
    data: {
      orderId: order.id,
      amount: grandTotal,
      method: 'COD',
      gateway: 'COD',
      status: 'CAPTURED',
      capturedAt: new Date(),
      idempotencyKey: `cod-${order.id}`,   // deterministic — safe for retry
      gatewayRef: `cod-${order.id}`,
    },
  });

  // consume() receives tx — does NOT open its own transaction
  for (const reservation of reservations) {
    await inventoryService.consume(reservation.id, userId, tx);
  }
  await tx.orderStatusHistory.create({
    data: { orderId: order.id, statusFrom: null, statusTo: 'PLACED', actorId: userId, actorRole: 'BUYER', timestamp: new Date() },
  });
  await tx.orderStatusHistory.create({
    data: { orderId: order.id, statusFrom: 'PLACED', statusTo: 'CONFIRMED', actorId: userId, actorRole: 'BUYER', reason: 'COD', timestamp: new Date() },
  });
  // HARDENED (INV-20): eventVersion + schemaVersion MANDATORY on all EventOutbox records
  await tx.eventOutbox.create({
    data: {
      eventType: 'OrderCreated',
      eventVersion: '1.0',         // ← MANDATORY (INV-20)
      schemaVersion: '4.3',        // ← MANDATORY (INV-20)
      payload: buildOrderCreatedPayload(order),
      deduplicationKey: `order-created-${order.id}`,
      eventMonth: formatYearMonth(new Date()),
      status: 'PENDING',
    },
  });
  await tx.eventOutbox.create({
    data: {
      eventType: 'OrderConfirmed',
      eventVersion: '1.0',         // ← MANDATORY (INV-20)
      schemaVersion: '4.3',        // ← MANDATORY (INV-20)
      payload: buildOrderConfirmedPayload(order),
      deduplicationKey: `order-confirmed-${order.id}`,
      eventMonth: formatYearMonth(new Date()),
      status: 'PENDING',
    },
  });
  await tx.cart.update({ where: { id: cart.id }, data: { status: 'CHECKED_OUT' } });
  return order;
}, { timeout: 10000, isolationLevel: 'ReadCommitted' });
// ← Redis idempotency key SET happens AFTER this block resolves
```

### §3.4 The Online Payment Order Transaction (Reference Implementation)

```typescript
// Online: order created in PLACED state. consume() deferred to webhook.
await prisma.$transaction(async (tx) => {
  // HARDENED (INV-25): orderNumber collision retry inside same tx
  let order: Order;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      order = await tx.order.create({
        data: {
          orderNumber: generateOrderNumber(),
          segment: cart.segment,
          buyerId: userId,
          sellerId: primarySellerId,
          cartId: cart.id,
          shippingAddressSnapshot: addressSnapshot,
          billingAddressSnapshot: addressSnapshot,
          subtotal,
          taxAmount,
          shippingCost: 0,
          discount: 0,
          grandTotal,
          placedAt: new Date(),
          status: 'PLACED',   // ← PLACED, not CONFIRMED
          orderMonth: formatYearMonth(new Date()),
        },
      });
      break;
    } catch (err) {
      if (isPrismaUniqueConstraintError(err, 'orderNumber') && attempt < 2) continue;
      throw err;
    }
  }

  await tx.orderItem.createMany({ data: orderItemData });
  // consume() NOT called here — deferred to payment confirmation
  await tx.orderStatusHistory.create({
    data: { orderId: order.id, statusFrom: null, statusTo: 'PLACED', actorId: userId, actorRole: 'BUYER', timestamp: new Date() },
  });
  // HARDENED (INV-20): eventVersion + schemaVersion MANDATORY
  await tx.eventOutbox.create({
    data: {
      eventType: 'OrderCreated',
      eventVersion: '1.0',         // ← MANDATORY (INV-20)
      schemaVersion: '4.3',        // ← MANDATORY (INV-20)
      payload: buildOrderCreatedPayload(order),
      deduplicationKey: `order-created-${order.id}`,
      eventMonth: formatYearMonth(new Date()),
      status: 'PENDING',
    },
  });
  await tx.cart.update({ where: { id: cart.id }, data: { status: 'CHECKED_OUT' } });
  return order;
}, { timeout: 10000, isolationLevel: 'ReadCommitted' });
// Then: initiate Razorpay payment OUTSIDE $transaction
```

---

## §4 CACHE AUTHORITY GOVERNANCE

### §4.1 Redis Role in Sprint 4

Redis is a **display optimization and idempotency layer ONLY**. Redis is NEVER the correctness authority for cart contents, order state, or payment status.

| Redis Key Pattern | Purpose | Correctness Authority |
|---|---|---|
| `cart:{userId}:{segment}` | Cart display cache | PostgreSQL Cart table |
| `order_idem:{userId}:{clientKey}` | Order creation idempotency (userId from JWT — INV-24) | Redis (TTL 1h) → DB confirms |
| `payment_idem:{userId}:{clientKey}` | Payment initiation idempotency (userId from JWT — INV-24) | Redis (TTL 24h) → DB confirms |
| `webhook_idem:{razorpayEventId}` | Webhook deduplication | Redis (TTL 24h) |
| `payment_retry_window:{orderId}` | 30-min retry window flag (secondary authority — primary is DB paymentFailedAt — INV-23) | Redis (TTL 30min) |
| `reauth:{token}` | High-value payment re-auth | Redis (TTL 5min) |
| `checkout_rate:{userId}` | Checkout rate limit | Redis (atomic Lua/NX+EX — INV-21) |
| `cart_rate:{userId}` | Cart add rate limit | Redis (atomic Lua/NX+EX — INV-21) |

### §4.2 Cart Cache Invalidation Rules

```
GET /cart → serve from Redis cart:{userId}:{segment} (TTL 60s)
           → on miss: fetch from DB, cache result

POST /cart/items → write to DB → DELETE cart:{userId}:{segment} immediately
PUT /cart/items/:id → write to DB → DELETE cart:{userId}:{segment} immediately
DELETE /cart/items/:id → write to DB → DELETE cart:{userId}:{segment} immediately

FORBIDDEN: Updating Redis cache on write (write-through). Always invalidate.
FORBIDDEN: Serving cart totals from Redis cache. Always compute on DB fetch.
```

### §4.3 Redis Degraded-Mode Policy

```
If Redis is unavailable (connection timeout, ECONNREFUSED):

Cart GET:             Fetch from DB directly. No cache. Serve DB result. (Performance degraded, correctness maintained)
Cart mutations:       Proceed without Redis invalidation (cache will expire naturally in 60s)
Order idempotency:    Return 503 with retryable:true. Buyer retries. (Cannot risk duplicate orders without idempotency)
Payment idempotency:  Return 503 with retryable:true. (Cannot risk duplicate payments)
Webhook idempotency:  Return 503 to Razorpay. Razorpay will retry. ReconciliationWorker catches. (Safe)
Checkout rate limit:  HARDENED: Skip rate limit enforcement BUT log metric checkout_redis_degraded_total.
                      Do NOT silently allow unlimited requests — monitor for abuse via DB-level audit.
Cart rate limit:      HARDENED: Skip enforcement but log cart_redis_degraded_total. Correctness maintained.
COD checkout:         COD has NO Redis dependency in happy path. COD ALWAYS works.

HARDENED ALERT: If Redis is unavailable, alert ops immediately:
  metrics.increment('redis_unavailable_total', { component: 'checkout' });
  If redis_unavailable_total > 0 for > 60s: PAGE on-call (Redis outage = payment idempotency blind).
```

---

## §5 EVENTOUTBOX GOVERNANCE

### §5.1 Sprint 4 Events Registry

| Event Type | Trigger | Deduplication Key | Payload Requirements |
|---|---|---|---|
| `OrderCreated` | Order `$transaction` commit (COD + Online) | `order-created-{orderId}` | orderId, buyerId, sellerId(s), items[], totalAmount, segment, paymentMethod, address, placedAt |
| `OrderConfirmed` | COD: same tx as OrderCreated. Online: webhook tx | `order-confirmed-{orderId}` | orderId, paymentMethod, paymentId, confirmedAt, grandTotal |
| `OrderCancelled` | Cancel saga completion | `order-cancelled-{orderId}-{version}` | orderId, cancellationReason, actorId, actorRole, cancelledAt |
| `OrderStatusChanged` | Every non-terminal status transition | `order-status-{orderId}-{statusTo}` | orderId, statusFrom, statusTo, actorId, actorRole, timestamp |
| `PaymentInitiated` | After Razorpay order created + DB payment record created | `payment-initiated-{paymentId}` | orderId, paymentId, amount, currency, method, gatewayOrderId |
| `PaymentReceived` | Webhook webhook tx commit (payment.captured) | `payment-received-{paymentId}` | orderId, paymentId, amount, gatewayPaymentId, method, capturedAt |
| `PaymentFailed` | Webhook tx commit (payment.failed) | `payment-failed-{paymentId}` | orderId, paymentId, reason, failedAt |
| `CartAbandoned` | Cart cleanup cron (future consumer — Sprint 5 reorder) | `cart-abandoned-{cartId}` | cartId, userId, segment, itemCount, totalValue |

### §5.2 EventOutbox Payload Requirements

All Sprint 4 EventOutbox payloads MUST include full data for downstream consumers (Sprint 6 Notifications, Sprint 7 Admin, Sprint 9 ERP). Never strip fields.

```typescript
// OrderCreated payload (reference):
{
  orderId: string,
  orderNumber: string,
  buyerId: string,
  buyerName: string,
  sellerIds: string[],      // array — multi-seller support
  segment: Segment,
  items: [{
    productId: string,
    productName: string,
    quantity: number,
    unitPrice: Decimal,
    totalPrice: Decimal,
    hsnCode: string | null,
    gstPercent: Decimal,
  }],
  subtotal: Decimal,
  taxAmount: Decimal,
  grandTotal: Decimal,
  paymentMethod: PaymentMethod,
  shippingAddress: AddressSnapshot,
  placedAt: string,           // ISO 8601
  orderMonth: string,         // 'YYYY-MM'
  schemaVersion: '1.0',
}
```

### §5.3 EventOutbox Processing Philosophy

```
Sprint 4 creates EventOutbox records inside $transactions (exactly like Sprint 3).
The existing EventOutbox worker (from Sprint 2/3) processes them.
Sprint 4 does NOT create new EventOutbox consumers.
Sprint 6 (Notifications) creates the notification consumer.
Sprint 7 (Admin/ERP) creates the admin consumer.
Sprint 9 creates the OpenSearch indexer consumer.

Sprint 4 responsibility: EMIT correct events with complete payloads.
Consumer responsibility: Handle events from the EventOutbox table.
```

### §5.4 EventOutbox eventMonth Population

```typescript
// REQUIRED: eventMonth is always server-computed
const eventMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
// Example: '2026-05'

FORBIDDEN: Using client-provided date for eventMonth.
FORBIDDEN: Leaving eventMonth null or empty string.
```

---

## §6 ORDER STATE MACHINE ARCHITECTURE

### §6.1 Complete State Enum (Sprint 4 Active States)

From schema v4.3 `OrderStatus` enum — Sprint 4 activates:

```
PLACED          → Inventory reserved, payment pending (online) or immediate (COD)
CONFIRMED       → Payment captured OR COD (inventory consumed, order is revenue)
CANCELLED       → Compensation complete, inventory released
PAYMENT_FAILED  → Payment failed, inventory released, retry window open (30 min)

Sprint 5 activates:
PROCESSING, SHIPPED, DELIVERED, COMPLETED

Sprint 8 activates:
RETURN_INITIATED, REFUND_INITIATED, DISPUTE_OPEN, DISPUTE_RESOLVED

Sprint 4 DOES define transitions to PROCESSING/SHIPPED/DELIVERED/COMPLETED in the state
machine but RETURNS 422 with TRANSITION_NOT_YET_ACTIVE if attempted in Sprint 4.
This keeps the state machine extensible without runtime errors.
```

### §6.2 State Transition Map (Immutable — Server-Side Enforced)

```typescript
// Locked transition map — implemented in OrderStateMachine
const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PLACED: ['CONFIRMED', 'PAYMENT_FAILED', 'CANCELLED'],
  CONFIRMED: ['PROCESSING', 'CANCELLED'],   // PROCESSING is Sprint 5 — 422 until then
  PAYMENT_FAILED: ['CONFIRMED', 'CANCELLED'],
  PROCESSING: ['SHIPPED'],                  // Sprint 5
  SHIPPED: ['DELIVERED'],                   // Sprint 5
  DELIVERED: ['COMPLETED'],                 // Sprint 5
  COMPLETED: [],                            // Terminal
  CANCELLED: [],                            // Terminal
  // Sprint 8:
  RETURN_INITIATED: [],
  REFUND_INITIATED: [],
  DISPUTE_OPEN: ['DISPUTE_RESOLVED'],
  DISPUTE_RESOLVED: [],
};

// State machine validation:
function validateTransition(current: OrderStatus, next: OrderStatus): void {
  if (!VALID_TRANSITIONS[current].includes(next)) {
    throw new UnprocessableEntityException({
      code: 'INVALID_STATUS_TRANSITION',
      message: `Cannot transition from ${current} to ${next}`,
      currentStatus: current,
      requestedStatus: next,
    });
  }
  // Sprint 4 forward-compatibility guard:
  const sprint5States: OrderStatus[] = ['PROCESSING', 'SHIPPED', 'DELIVERED', 'COMPLETED'];
  if (sprint5States.includes(next)) {
    throw new UnprocessableEntityException({
      code: 'TRANSITION_NOT_YET_ACTIVE',
      message: `Transition to ${next} will be activated in Sprint 5`,
    });
  }
}
```

### §6.3 Terminal State Guard

```typescript
const TERMINAL_STATES: OrderStatus[] = ['COMPLETED', 'CANCELLED'];

function assertNotTerminal(order: Order): void {
  if (TERMINAL_STATES.includes(order.status as OrderStatus)) {
    throw new UnprocessableEntityException({
      code: 'ORDER_ALREADY_TERMINAL',
      message: `Order ${order.id} is in terminal state ${order.status}. No further transitions.`,
    });
  }
}
```

### §6.4 OrderStatusHistory — Append-Only Implementation

```typescript
// OrderStatusHistoryRepository — ALL public methods listed here
// APPEND-ONLY: This repository has no update() or delete() methods by design.
// See Sprint 4 INV-13. Violating this destroys audit trail integrity.

class OrderStatusHistoryRepository {
  async create(data: {
    orderId: string;
    statusFrom: OrderStatus | null;
    statusTo: OrderStatus;
    actorId: string;
    actorRole: 'BUYER' | 'SELLER' | 'ADMIN' | 'SYSTEM';
    reason?: string;
    timestamp: Date;
  }, tx?: Prisma.TransactionClient): Promise<OrderStatusHistory> {
    const client = tx ?? this.prisma;
    return client.orderStatusHistory.create({ data });
  }

  async findByOrderId(orderId: string): Promise<OrderStatusHistory[]> {
    return this.prisma.orderStatusHistory.findMany({
      where: { orderId },
      orderBy: { timestamp: 'asc' },
    });
  }

  // NO update() method
  // NO delete() method
  // NO deleteMany() method
  // NO upsert() method
}
```

### §6.5 Order Expiry Rules

| Scenario | Timeout | Handler | Action |
|---|---|---|---|
| PLACED with no webhook (online) | 30 min | `PaymentReconciliationWorker` | Query Razorpay API → force `PAYMENT_FAILED` if no capture |
| PAYMENT_FAILED with no retry | 30 min | `PaymentRetryExpiryWorker` | Transition to `CANCELLED`, release all reservations |
| PLACED with orphaned reservation | 15 min | Sprint 3 `ReservationExpiryWorker` | Releases reservation (TTL layer safety net) |

---

## §7 CHECKOUT SAGA ORCHESTRATION

### §7.1 Saga Steps (OrderService.createOrder)

```
CHECKOUT SAGA — OrderService.createOrder(dto, buyer):

Step 1: IDEMPOTENCY CHECK (first operation, always)
  - Require Idempotency-Key header → 400 IDEMPOTENCY_KEY_REQUIRED if absent
  - Redis GET order_idem:{userId}:{clientIdempotencyKey}   ← INV-33: userId first, then client key
  - If exists: return cached order response (no further processing)

Step 2: LOAD CART
  - CartRepository.findActiveCartWithItems(userId, segment)
  - Validate cart is ACTIVE and not empty

Step 3: PRE-VALIDATION (read path — all parallel)
  - For each CartItem: verify product EXISTS + ACTIVE + segment matches
  - For each CartItem: verify InventoryService.getAvailability() shows stock > 0
  - Verify quantity >= product.moq for each item
  - If ANY item fails: throw CartItemUnavailableException listing ALL failing items

Step 4: PRICE SNAPSHOT (read path — after validation)
  - Fetch Inventory.price for each product (live from DB)
  - Compute subtotal, taxAmount, grandTotal server-side

Step 5: SHIPPING ADDRESS SNAPSHOT
  - Validate addressId belongs to buyer (ownership check)
  - Serialize address to JSON snapshot (immutable after this point)

Step 6: RESERVE (outside $transaction — Sprint 3 contract)
  - Sequential (not parallel) per item
  - InventoryService.reserve(productId, quantity, orderId, userId, orderType)
  - Track successful reservations
  - If reserve() fails for item N: releaseAllForOrder() for items 1..N-1 → throw

Step 7: ATOMIC $TRANSACTION
  - COD: create order (CONFIRMED) + items + status history (PLACED+CONFIRMED) + events (OrderCreated+OrderConfirmed) + consume() + cart checkout
  - Online: create order (PLACED) + items + status history (PLACED) + event (OrderCreated) + cart checkout
  - If $transaction fails: releaseAllForOrder() → throw

Step 8: POST-TRANSACTION REDIS
  - SET order_idem:{cartId}:{userId} (TTL 1h) AFTER $transaction success

Step 9: PAYMENT INITIATION (online only, outside $transaction)
  - Call PaymentService.initiatePayment(orderId, amount, method)
  - Returns { paymentUrl, razorpayOrderId }

Step 10: RETURN RESPONSE
  - COD: { orderId, orderNumber, status: 'CONFIRMED' }
  - Online: { orderId, orderNumber, status: 'PLACED', paymentUrl }
```

### §7.2 Compensation Trigger Matrix

| Failure Point | What Has Happened | Compensation Required |
|---|---|---|
| Pre-validation fails (Step 3) | Nothing mutated | None — return error |
| Price fetch fails (Step 4) | Nothing mutated | None — return error |
| reserve() fails for item 1 | Nothing reserved | None — return error |
| reserve() fails for item N (N>1) | Items 1..N-1 reserved | `releaseAllForOrder()` for items 1..N-1 |
| $transaction fails — DB timeout | All reserved, order not created | `releaseAllForOrder()` for ALL |
| $transaction fails — constraint violation | All reserved, order not created | `releaseAllForOrder()` for ALL |
| Payment initiation fails (Step 9) | Order in PLACED state | Leave in PLACED — buyer retries payment. ReconciliationWorker handles 30min expiry |
| Payment webhook: payment.failed | Order in PLACED, inventory reserved | `releaseAllForOrder()`, order → PAYMENT_FAILED |
| Payment retry window expires | Order in PAYMENT_FAILED | `releaseAllForOrder()`, order → CANCELLED |
| Buyer cancels PLACED order | Order in PLACED, inventory reserved | `releaseAllForOrder()`, order → CANCELLED |
| Buyer cancels CONFIRMED order | Inventory already consumed | No inventory action. Order → CANCELLED (inventory already sold — refund handled Sprint 8) |

### §7.3 releaseAllForOrder — Sequential Pattern

```typescript
// REQUIRED: Sequential, not parallel. Isolated try/catch per item.
async function releaseAllForOrder(
  orderId: string,
  reason: 'ORDER_FAILED' | 'PAYMENT_FAILED' | 'ORDER_CANCELLED',
  actorId: string,
): Promise<{ released: number; failed: number }> {
  const reservations = await inventoryReservationRepository.findActiveByOrderId(orderId);
  let released = 0;
  let failed = 0;

  // Sequential — NOT Promise.all (avoids DB contention storm)
  for (const reservation of reservations) {
    try {
      await inventoryService.release(reservation.id, reason, actorId);
      released++;
    } catch (err) {
      // CRITICAL: log failure but continue releasing remaining reservations
      logger.error({ reservationId: reservation.id, orderId, reason, err },
        'CRITICAL: Inventory release failed during compensation');
      failed++;
    }
  }

  if (failed > 0) {
    // Alert ops — inventory may be drifted
    metrics.increment('inventory_release_failed_total', { reason });
  }

  return { released, failed };
}
```

### §7.4 Idempotency Key Lifecycle

```
Order creation idempotency key: order_idem:{userId}:{clientIdempotencyKey}
  CORRECTED (INV-33): userId (from JWT) is FIRST. clientIdempotencyKey is from Idempotency-Key header.
  - Idempotency-Key header REQUIRED on POST /orders → 400 IDEMPOTENCY_KEY_REQUIRED if absent
  - SET: AFTER $transaction.commit() (NOT before, NOT inside)
  - TTL: 3600s (1 hour)
  - On hit: return cached order object (status preserved — CONFIRMED or PLACED)

Payment initiation idempotency key: payment_idem:{userId}:{clientIdempotencyKey}
  CORRECTED (INV-33): userId (from JWT) is FIRST — per INV-24.
  - Required header: Idempotency-Key (any unique string from client)
  - SET: AFTER Razorpay createOrder() + DB payment.create() succeeds
  - TTL: 86400s (24 hours)
  - On hit: return cached { paymentUrl, razorpayOrderId }

FORBIDDEN:
  - Setting idempotency key BEFORE $transaction (if tx fails, key is orphaned — blocks future retries)
  - Setting idempotency key INSIDE $transaction (Redis I/O forbidden inside tx)
  - Setting idempotency key without TTL (key never expires — memory leak)
  - order_idem:{cartId}:{userId} pattern (cartId-based key violates INV-24 — not userId-namespaced)
  - payment_idem:{clientKey} without userId prefix (violates INV-24)
```

---

## §8 INVENTORY INTEGRATION CONTRACT

This section defines the EXACT interface Sprint 4 uses from Sprint 3 InventoryService.

### §8.1 Methods Sprint 4 Uses

```typescript
// From Sprint 3 SPRINT3_EXECUTION_LOCK_FINAL.md §18.3 — IMMUTABLE CONTRACT

interface InventoryService {
  // Display path — non-authoritative. Used for cart add-to-cart check and pre-checkout validation.
  getAvailability(productId: string, segment: Segment): Promise<AvailabilityResult>;

  // Correctness authority. Called BEFORE order $transaction. Outside $transaction.
  reserve(
    productId: string,
    quantity: number,
    context: { orderId?: string; cartId?: string; orderType: 'ORDER' | 'RFQ' | 'CART'; userId: string },
  ): Promise<{ reservationId: string; expiresAt: Date }>;

  // Called INSIDE the calling $transaction. Receives tx from caller. NEVER opens own transaction.
  consume(
    reservationId: string,
    actorId: string,
    tx: Prisma.TransactionClient,
  ): Promise<{ consumed: true }>;

  // Idempotent. Never throws if already released. Called OUTSIDE any $transaction.
  release(
    reservationId: string,
    reason: 'PAYMENT_FAILED' | 'ORDER_CANCELLED' | 'ORDER_FAILED' | 'RESERVATION_EXPIRED',
    actorId: string,
  ): Promise<{ released: true } | { alreadyReleased: true }>;

  // Convenience wrapper: releases all active reservations for an orderId.
  releaseAllForOrder(
    orderId: string,
    reason: 'PAYMENT_FAILED' | 'ORDER_CANCELLED' | 'ORDER_FAILED',
    actorId: string,
  ): Promise<{ released: number; failed: number }>;
}
```

### §8.2 What OrderModule Is FORBIDDEN to Do

```
OrderModule MUST NOT:
  ❌ Write to Inventory table directly (via tx.inventory.update())
  ❌ Write to InventoryReservation table directly
  ❌ Write to InventoryMovement table directly
  ❌ Read InventoryReservation for business logic
  ❌ Import InventoryRepository
  ❌ Import anything from inventory module except InventoryService

OrderModule MAY:
  ✅ Call InventoryService.getAvailability() (display path)
  ✅ Call InventoryService.reserve() (outside $transaction)
  ✅ Call InventoryService.consume(reservationId, actorId, tx) (inside $transaction, passes tx)
  ✅ Call InventoryService.release() (outside $transaction)
  ✅ Call InventoryService.releaseAllForOrder() (outside $transaction)
```

### §8.3 NestJS Module Dependency Declaration

```typescript
// OrderModule imports InventoryModule (which exports InventoryService)
@Module({
  imports: [
    InventoryModule,   // ← provides InventoryService
    forwardRef(() => PaymentModule),
    PrismaModule,
    BullModule.registerQueue({ name: 'orders' }),
  ],
  controllers: [OrdersController, CartController],
  providers: [OrdersService, CartService, OrdersRepository, CartRepository, OrderStatusHistoryRepository],
  exports: [OrdersService, CartService],
})
export class OrderModule {}
```

---

## §9 PAYMENT ORCHESTRATION ARCHITECTURE

### §9.1 PaymentProvider Interface (Immutable)

```typescript
// packages/types/src/payment/payment-provider.interface.ts
export interface PaymentProviderOrder {
  providerOrderId: string;   // Razorpay order ID
  amount: number;            // in paise (smallest currency unit)
  currency: string;
  checkoutUrl?: string;
  metadata: Record<string, string>;
}

export interface PaymentCaptureResult {
  providerPaymentId: string;
  capturedAt: Date;
  amount: number;
  status: 'CAPTURED' | 'FAILED';
}

export interface RefundResult {
  refundId: string;
  amount: number;
  status: 'INITIATED' | 'PROCESSED' | 'FAILED';
}

export interface PaymentProvider {
  createOrder(
    amount: number,
    currency: string,
    metadata: { orderId: string; buyerId: string; description: string },
  ): Promise<PaymentProviderOrder>;

  verifyWebhookSignature(
    payload: Buffer,
    signature: string,
    secret: string,
  ): boolean;  // MUST use crypto.timingSafeEqual — never string comparison

  capturePayment(providerOrderId: string): Promise<PaymentCaptureResult>;

  refundPayment(
    providerPaymentId: string,
    amount: number,
    reason: string,
  ): Promise<RefundResult>;  // Sprint 4: throws NotImplementedException

  getPaymentStatus(providerOrderId: string): Promise<{
    status: 'PENDING' | 'CAPTURED' | 'FAILED' | 'EXPIRED';
    capturedAt?: Date;
    failedReason?: string;
  }>;
}
```

### §9.2 RazorpayPaymentProvider Implementation Rules

```typescript
// ALL Razorpay SDK calls MUST be inside this class. NOWHERE else.
// No Razorpay import is allowed outside this file.

@Injectable()
export class RazorpayPaymentProvider implements PaymentProvider {
  private readonly razorpay: Razorpay;

  constructor(private readonly config: ConfigService) {
    this.razorpay = new Razorpay({
      key_id: this.config.get('RAZORPAY_KEY_ID'),
      key_secret: this.config.get('RAZORPAY_KEY_SECRET'),
    });
  }

  verifyWebhookSignature(payload: Buffer, signature: string, secret: string): boolean {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
    // MANDATORY: timing-safe comparison
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex'),
    );
  }

  async refundPayment(): Promise<never> {
    throw new NotImplementedException('Refund will be activated in Sprint 8');
  }
}
```

### §9.3 CodPaymentProvider

```typescript
@Injectable()
export class CodPaymentProvider implements PaymentProvider {
  // HARDENED (INV-32): Uses metadata.orderId for deterministic providerOrderId.
  // Date.now() is FORBIDDEN — causes non-deterministic gatewayRef on retry.
  createOrder(
    amount: number,
    currency: string,
    metadata: { orderId: string; buyerId: string; description: string },
  ): Promise<PaymentProviderOrder> {
    // COD: no external call. Return a synthetic order object.
    return Promise.resolve({
      providerOrderId: `cod-${metadata.orderId}`,   // ← orderId-based (INV-32 — deterministic)
      amount: 0,
      currency: 'INR',
      metadata: {},
    });
  }

  verifyWebhookSignature(): boolean {
    return true;  // COD has no webhooks
  }

  capturePayment(): Promise<PaymentCaptureResult> {
    // COD capture is implicit. capturePayment() is never called for COD.
    // The synthetic Payment record is created inside the COD $transaction (INV-26).
    // This stub exists to satisfy the PaymentProvider interface.
    throw new NotImplementedException('COD capture is handled inside order $transaction (INV-26) — capturePayment() stub only');
  }

  getPaymentStatus(providerOrderId: string): Promise<{ status: 'CAPTURED'; capturedAt: Date }> {
    // COD is always captured (confirmed at order creation)
    return Promise.resolve({ status: 'CAPTURED', capturedAt: new Date() });
  }

  refundPayment(): Promise<never> {
    throw new NotImplementedException('COD refund in Sprint 8');
  }
}
```

### §9.4 PaymentService Orchestration

```typescript
// PaymentService is the gateway to all payment operations.
// It calls PaymentProvider interface — never Razorpay SDK directly.

class PaymentService {

  // Called from OrderService for online payments (OUTSIDE $transaction)
  async initiatePayment(
    orderId: string,
    amount: number,
    method: PaymentMethod,
    clientIdempotencyKey: string,
    userId: string,   // HARDENED (INV-24): required for namespace isolation
  ): Promise<InitiatePaymentResult> {
    // Step 1: Idempotency check (FIRST)
    // HARDENED (INV-24): userId MUST prefix the key — prevents cross-buyer key collision
    const idemKey = `payment_idem:${userId}:${clientIdempotencyKey}`;
    const cached = await redis.get(idemKey);
    if (cached) return JSON.parse(cached);

    // Step 2: High-value payment re-auth check
    if (amount > 5000000) { // 50,000 INR in paise
      const reauthToken = requestContext.headers['x-reauth-token'];
      if (!reauthToken || !await this.reauthService.verify(reauthToken, userId)) {
        throw new ForbiddenException({ code: 'REAUTH_REQUIRED', threshold: 50000 });
      }
    }

    // Step 3: Create Razorpay order (HTTP call — OUTSIDE $transaction)
    const providerOrder = await this.paymentProvider.createOrder(amount, 'INR', {
      orderId, buyerId: userId, description: `VyaparNet Order ${orderId}`,
    });

    // Step 4: Persist Payment record to DB
    const payment = await this.paymentRepository.create({
      orderId, amount, method, gateway: 'RAZORPAY',
      gatewayRef: providerOrder.providerOrderId,
      idempotencyKey: `${userId}:${clientIdempotencyKey}`,  // userId-scoped
      status: 'PENDING',
    });

    // Step 5: Emit PaymentInitiated to EventOutbox (separate transaction — not within order tx)
    // HARDENED (INV-20): eventVersion + schemaVersion MANDATORY
    await this.eventOutboxRepository.create({
      eventType: 'PaymentInitiated',
      eventVersion: '1.0',       // MANDATORY (INV-20)
      schemaVersion: '4.3',      // MANDATORY (INV-20)
      payload: { orderId, paymentId: payment.id, amount, method, gatewayOrderId: providerOrder.providerOrderId },
      deduplicationKey: `payment-initiated-${payment.id}`,
      eventMonth: formatYearMonth(new Date()),
      status: 'PENDING',
    });

    const result = { paymentUrl: providerOrder.checkoutUrl, razorpayOrderId: providerOrder.providerOrderId, paymentId: payment.id };

    // Step 6: Cache idempotency result AFTER all writes succeed
    // HARDENED (INV-24): key includes userId namespace
    await redis.set(idemKey, JSON.stringify(result), 'EX', 86400);

    return result;
  }
}
```

### §9.5 Payment Status Flow

```
COD:
  POST /orders (paymentMethod: COD)
    → OrderService creates order CONFIRMED (consume inside tx)
    → MANDATORY (INV-26): A synthetic Payment record with method=COD, status=CAPTURED
      is created INSIDE the order $transaction.
    → Reason: PaymentRepository.findByOrderId() must work for admin queries (Sprint 7),
      ERP sync (Sprint 9), and GET /payments/:orderId/status (buyer).
    → The phrase 'No Payment record created' that may appear in earlier drafts is INCORRECT
      and superseded by INV-26.

Online (Razorpay):
  POST /orders (paymentMethod: ONLINE_UPI|ONLINE_CARD|etc.)
    → OrderService creates order PLACED
    → POST /payments/initiate (buyer initiates payment)
    → Buyer completes payment on Razorpay checkout
    → POST /payments/webhook (Razorpay calls our server)
    → WebhookController validates signature + dedup
    → BullMQ WebhookProcessorWorker processes:
        → On payment.captured: consume() + CONFIRMED + emit events
        → On payment.failed: release() + PAYMENT_FAILED + emit events
```

---

## §10 CART ARCHITECTURE

### §10.1 Cart Model Rules

From schema v4.3:
- `Cart.status`: `CartStatus` enum: `ACTIVE | CHECKED_OUT | ABANDONED | EXPIRED`
- Unique constraint: `[userId, segment, status]` — enforced at DB level
- `CartItem.unitPrice`: POPULATED at add-to-cart from `Inventory.price` (display cache — not authoritative for order)
- `OrderItem.unitPrice`: POPULATED at `createOrder()` from live `Inventory.price` fetch (authoritative)

**Critical distinction**: `CartItem.unitPrice` is display only. `OrderItem.unitPrice` is the immutable financial record.

### §10.2 CartService Contract

```typescript
class CartService {

  async getCart(userId: string, segment: Segment): Promise<CartDto> {
    // 1. Check Redis cache
    const cached = await redis.get(`cart:${userId}:${segment}`);
    if (cached) return JSON.parse(cached);

    // 2. Fetch from DB (source of truth)
    const cart = await this.cartRepository.findActiveWithItems(userId, segment);
    if (!cart) return this.createEmptyCartResponse(userId, segment);

    // 3. Enrich with live inventory availability + warnings
    const enriched = await this.enrichCartWithWarnings(cart);

    // 4. Compute totals server-side (NEVER from CartItem.totalPrice)
    const totals = this.computeCartTotals(enriched.items);

    // 5. Cache and return
    const result = { ...enriched, ...totals };
    await redis.set(`cart:${userId}:${segment}`, JSON.stringify(result), 'EX', 60);
    return result;
  }

  async addItem(userId: string, dto: AddToCartDto): Promise<CartItemDto> {
    // 1. Rate limit check
    await this.rateLimiter.checkCartAddRate(userId);

    // 2. Load or create cart for this userId + segment
    const cart = await this.cartRepository.findOrCreate(userId, dto.segment);

    // 3. Load product
    const product = await this.productRepository.findById(dto.productId, dto.segment);
    if (!product || !product.isActive) throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND' });

    // 4. Segment isolation check
    if (product.segment !== cart.segment) {
      throw new BadRequestException({ code: 'SEGMENT_MISMATCH',
        message: 'Product segment does not match cart segment' });
    }

    // 5. MOQ check
    if (dto.quantity < product.moq) {
      throw new BadRequestException({ code: 'MOQ_VIOLATION',
        message: `Minimum order quantity is ${product.moq}` });
    }

    // 6. Soft availability check (display path — NOT a reservation)
    const availability = await this.inventoryService.getAvailability(dto.productId, dto.segment);
    if (availability.availableQuantity <= 0) {
      throw new BadRequestException({ code: 'OUT_OF_STOCK' });
    }

    // 7. Upsert CartItem
    const item = await this.cartRepository.upsertItem(cart.id, {
      productId: dto.productId,
      quantity: dto.quantity,
      unitPrice: availability.currentPrice,  // display price — not authoritative
    });

    // 8. Invalidate Redis cart cache immediately
    await redis.del(`cart:${userId}:${cart.segment}`);

    return item;
  }

  async clearCart(cartId: string, tx: Prisma.TransactionClient): Promise<void> {
    // Called from within order creation $transaction
    await tx.cart.update({ where: { id: cartId }, data: { status: 'CHECKED_OUT' } });
  }
}
```

### §10.3 Cart Warning System

```typescript
// GET /cart returns itemWarnings on every request
type CartItemWarning = {
  cartItemId: string;
  warningType: 'PRODUCT_INACTIVE' | 'OUT_OF_STOCK' | 'PRICE_CHANGED' | 'MOQ_CHANGED';
  details: {
    productId: string;
    productName: string;
    currentValue?: number | string;
    previousValue?: number | string;
  };
};

// Cart response shape:
type CartDto = {
  cartId: string;
  segment: Segment;
  status: CartStatus;
  items: CartItemDto[];
  subtotal: Decimal;
  taxAmount: Decimal;
  grandTotal: Decimal;
  itemWarnings: CartItemWarning[];  // Empty array if no warnings
  lastUpdatedAt: string;
};
```

### §10.4 Cart Cleanup Worker

```typescript
// CartCleanupWorker — BullMQ cron
// Runs: daily at 2AM IST
// Soft-deletes carts with updatedAt < 30 days ago AND status = ACTIVE
// Creates CartAbandoned EventOutbox event for each cleaned cart

@Processor('orders')
class CartCleanupWorker {
  @Process('cart-cleanup')
  async handle(): Promise<void> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const abandonedCarts = await this.prisma.cart.findMany({
      where: { status: 'ACTIVE', updatedAt: { lt: thirtyDaysAgo } },
      include: { items: true },
    });

    for (const cart of abandonedCarts) {
      await this.prisma.$transaction(async (tx) => {
        await tx.cart.update({ where: { id: cart.id }, data: { status: 'ABANDONED' } });
        await tx.eventOutbox.create({
          data: {
            eventType: 'CartAbandoned',
            payload: { cartId: cart.id, userId: cart.userId, segment: cart.segment, itemCount: cart.items.length },
            deduplicationKey: `cart-abandoned-${cart.id}`,
            eventMonth: formatYearMonth(new Date()),
          },
        });
      });
    }
  }
}
```

---

## §11 MODULE STRUCTURE & PACKAGE BOUNDARIES

### §11.1 Directory Structure (Final — Locked)

```
apps/api/src/modules/
├── order/
│   ├── order.module.ts                           ← OrderModule (imports InventoryModule, PaymentModule)
│   ├── cart/
│   │   ├── cart.module.ts
│   │   ├── cart.controller.ts                    ← GET/POST/PUT/DELETE /cart/items
│   │   ├── cart.service.ts
│   │   ├── cart.repository.ts
│   │   └── tests/
│   │       ├── cart.service.spec.ts
│   │       └── cart.integration.spec.ts
│   └── orders/
│       ├── orders.module.ts
│       ├── orders.controller.ts                  ← POST/GET /orders, POST /orders/:id/cancel
│       ├── orders.service.ts                     ← SAGA COORDINATOR
│       ├── orders.repository.ts
│       ├── order-status-history.repository.ts    ← APPEND-ONLY
│       ├── order-state-machine.ts                ← Transition validation
│       └── tests/
│           ├── orders.service.spec.ts
│           ├── orders.service.concurrency.spec.ts ← CRITICAL
│           └── orders.integration.spec.ts
├── payment/
│   ├── payment.module.ts                         ← PaymentModule (forwardRef OrderModule)
│   ├── payment.controller.ts                     ← POST /payments/initiate, GET /payments/:id/status, POST /payments/retry
│   ├── payment.service.ts
│   ├── payment.repository.ts
│   ├── webhook.controller.ts                     ← POST /payments/webhook — RAW BODY ONLY
│   ├── providers/
│   │   ├── payment-provider.interface.ts         ← PaymentProvider interface
│   │   ├── razorpay.provider.ts                  ← ONLY FILE with Razorpay import
│   │   └── cod.provider.ts
│   ├── workers/
│   │   ├── payment-webhook-processor.worker.ts
│   │   ├── payment-reconciliation.worker.ts
│   │   └── payment-retry-expiry.worker.ts
│   └── tests/
│       ├── payment.service.spec.ts
│       ├── webhook.controller.spec.ts
│       └── payment-webhook-processor.spec.ts

packages/types/src/
├── cart/
│   └── cart.schemas.ts           ← AddToCartSchema, UpdateCartItemSchema, CartItemWarningSchema
├── order/
│   └── order.schemas.ts          ← CreateOrderSchema, CancelOrderSchema, OrderResponseSchema
└── payment/
    └── payment.schemas.ts        ← InitiatePaymentSchema, PaymentRetrySchema, WebhookEventSchema
```

### §11.2 Module Dependency Rules

```
OrderModule:
  IMPORTS:  InventoryModule (InventoryService), forwardRef(PaymentModule), PrismaModule, BullMQ('orders')
  EXPORTS:  [OrdersService, CartService]
  OWNS:     Cart, CartItem, Order, OrderItem, OrderTracking, OrderStatusHistory tables
  FORBIDDEN: Direct Prisma writes to Inventory, InventoryReservation, InventoryMovement

PaymentModule:
  IMPORTS:  forwardRef(OrderModule) (to update order status), PrismaModule, BullMQ('payments')
  EXPORTS:  [PaymentService]
  OWNS:     Payment table
  PROVIDES: [RazorpayPaymentProvider, CodPaymentProvider] as PaymentProvider via DI token

InventoryModule (Sprint 3 — unchanged):
  EXPORTS:  [InventoryService]
  Sprint 4 ONLY reads this service — never modifies InventoryModule internals
```

---

## §12 ZOD DTO GOVERNANCE

### §12.1 AddToCartSchema

```typescript
// packages/types/src/cart/cart.schemas.ts
import { z } from 'zod';

export const AddToCartSchema = z.object({
  productId: z.string().cuid(),
  quantity: z.number().int().positive().max(10000),
  segment: z.enum(['TEXTILE', 'SPARE_PARTS']),
});
export type AddToCartDto = z.infer<typeof AddToCartSchema>;

export const UpdateCartItemSchema = z.object({
  quantity: z.number().int().positive().max(10000),
});
export type UpdateCartItemDto = z.infer<typeof UpdateCartItemSchema>;
```

### §12.2 CreateOrderSchema

```typescript
// packages/types/src/order/order.schemas.ts
import { z } from 'zod';

export const CreateOrderSchema = z.object({
  paymentMethod: z.enum(['COD', 'ONLINE_UPI', 'ONLINE_CARD', 'NET_BANKING', 'WALLET']),
  shippingAddressId: z.string().cuid(),
  billingAddressId: z.string().cuid().optional(),  // defaults to shippingAddressId
  // Sprint 8 preparation hooks — unused in Sprint 4
  source: z.enum(['CART', 'RFQ']).default('CART'),
  rfqId: z.string().cuid().optional(),
  // Notes field for buyer
  buyerNotes: z.string().max(500).optional(),
});
export type CreateOrderDto = z.infer<typeof CreateOrderSchema>;

export const CancelOrderSchema = z.object({
  reason: z.string().max(500).optional(),
});
```

### §12.3 InitiatePaymentSchema

```typescript
// packages/types/src/payment/payment.schemas.ts
export const InitiatePaymentSchema = z.object({
  orderId: z.string().cuid(),
  paymentMethod: z.enum(['ONLINE_UPI', 'ONLINE_CARD', 'NET_BANKING', 'WALLET']),
});
```

### §12.4 Zod Validation Pipe Governance

All DTOs use `ZodValidationPipe` (global pipe from Sprint 1). No `class-validator`. No ad-hoc validation in service layer. Zod is the single validation authority.

---

## §13 REDIS KEY REGISTRY

Complete registry of all Sprint 4 Redis keys. No Sprint 4 code may use any key not in this registry without a DDR.

```
cart:{userId}:{segment}
  Purpose:     Cart display cache
  TTL:         60s
  Set by:      CartService.getCart() on DB fetch
  Deleted by:  CartService.addItem(), updateItem(), removeItem() immediately after DB write
  Type:        String (JSON)

order_idem:{userId}:{clientProvidedKey}
  Purpose:     Order creation idempotency
  HARDENED:    Key MUST incorporate userId from JWT (INV-24) — NOT solely client-provided key
  TTL:         3600s (1h)
  Set by:      OrderService.createOrder() AFTER $transaction commits
  Deleted by:  Never (TTL-based expiry)
  Type:        String (JSON serialized order response)

payment_idem:{userId}:{clientIdempotencyKey}
  Purpose:     Payment initiation idempotency
  HARDENED:    Key MUST incorporate userId from JWT (INV-24) — NOT solely client-provided key
  TTL:         86400s (24h)
  Set by:      PaymentService.initiatePayment() AFTER Razorpay + DB writes succeed
  Deleted by:  Never (TTL-based expiry)
  Type:        String (JSON: { paymentUrl, razorpayOrderId, paymentId })

webhook_idem:{razorpayEventId}
  Purpose:     Razorpay webhook deduplication
  TTL:         86400s (24h)
  Set by:      WebhookController AFTER queueing to BullMQ (cleared on queue timeout — INV-22)
  Deleted by:  WebhookController timeout handler (if queue.add times out — INV-22)
  Type:        String ('QUEUED')
  NX:          Yes — set-if-not-exists atomic

payment_retry_window:{orderId}
  Purpose:     30-minute payment retry window flag (SECONDARY authority only — INV-23)
  PRIMARY:     order.paymentFailedAt DB timestamp is the authoritative expiry check
  TTL:         1800s (30min)
  Set by:      PaymentWebhookProcessorWorker.handlePaymentFailed() AFTER $transaction
  Deleted by:  TTL (or explicit DEL when order transitions to CANCELLED)
  Type:        String (timestamp of failure)
  WARNING:     Redis eviction may delete before TTL expires. Always cross-check DB (INV-23).

checkout_rate:{userId}
  Purpose:     Checkout throttle (5 attempts/hour)
  TTL:         3600s (1h) — atomically set via Lua script (INV-21)
  Set by:      Lua INCR+EXPIRE atomic on each POST /orders attempt
  Deleted by:  TTL
  Type:        Integer (INCR counter)

cart_rate:{userId}
  Purpose:     Cart add-to-cart rate limit (50 items/min)
  TTL:         60s — atomically set via Lua script (INV-21)
  Set by:      Lua INCR+EXPIRE atomic on each POST /cart/items
  Deleted by:  TTL
  Type:        Integer (INCR counter)

reauth:{token}
  Purpose:     High-value payment (>50K) re-authentication token
  TTL:         300s (5min)
  Set by:      ReauthService after OTP verification
  Deleted by:  PaymentService on consumption (single-use — DEL after verify)
  Type:        String (userId encoded)

webhook_idem_result:{razorpayEventId}
  Purpose:     Cached webhook processing result (for fast duplicate response)
  TTL:         86400s (24h)
  Set by:      WebhookProcessorWorker AFTER successful processing AND $transaction commit
  Type:        String (JSON: { status: 'PROCESSED', orderId })

redis_health_probe
  Purpose:     Redis availability sentinel — checked on degraded-mode detection
  TTL:         30s
  Set by:      HealthCheckService.checkRedis() on startup + periodic probe
  Type:        String ('OK')
```

---

## §14 BULLMQ QUEUE ARCHITECTURE

### §14.1 Queue Definitions

```typescript
// Sprint 4 registers 2 queues:
// 'payments' — all payment lifecycle workers
// 'orders'   — order lifecycle crons (cart cleanup, etc.)

// In PaymentModule:
BullModule.registerQueue({ name: 'payments', defaultJobOptions: {
  removeOnComplete: 100,
  removeOnFail: 500,
}})

// In OrderModule:
BullModule.registerQueue({ name: 'orders', defaultJobOptions: {
  removeOnComplete: 50,
  removeOnFail: 200,
}})
```

### §14.2 Worker Registry

| Worker | Queue | Type | Schedule/Trigger |
|---|---|---|---|
| `PaymentWebhookProcessorWorker` | `payments` | Event-driven | Triggered by WebhookController on each valid webhook |
| `PaymentReconciliationWorker` | `payments` | Cron | Every 5 minutes: `*/5 * * * *` |
| `PaymentRetryExpiryWorker` | `payments` | Cron | Every 2 minutes: `*/2 * * * *` |
| `CartCleanupWorker` | `orders` | Cron | Daily at 2AM IST: `30 20 * * *` (UTC) |

### §14.3 Stable JobId Rules (Inherited from Sprint 3 §22)

```typescript
// ALL cron workers MUST use stable jobId — prevents cron duplication on API restart

// PaymentReconciliationWorker:
await queue.add('payment-reconciliation', {}, {
  repeat: { cron: '*/5 * * * *' },
  jobId: 'payment-reconciliation-cron',   // ← STABLE, non-random
});

// PaymentRetryExpiryWorker:
await queue.add('payment-retry-expiry', {}, {
  repeat: { cron: '*/2 * * * *' },
  jobId: 'payment-retry-expiry-cron',     // ← STABLE
});

// CartCleanupWorker:
await queue.add('cart-cleanup', {}, {
  repeat: { cron: '30 20 * * *' },
  jobId: 'cart-cleanup-cron',             // ← STABLE
});

FORBIDDEN: No jobId → duplicate crons on every API restart (same bug as Sprint 3 §22 Warning 11)
```

### §14.4 Retry Policy by Worker

| Worker | Max Retries | Backoff Strategy | On Failure (DLQ) |
|---|---|---|---|
| `PaymentWebhookProcessorWorker` | 3 | Exponential: 2s, 4s, 8s | → DLQ. Alert ops immediately. Unprocessed webhook = unconfirmed order. |
| `PaymentReconciliationWorker` | 0 | N/A (cron — next run handles it) | Log error + metric. Next cron run retries. |
| `PaymentRetryExpiryWorker` | 1 | 30s linear | Log error. Manual ops intervention required if failed. |
| `CartCleanupWorker` | 1 | 1 hour | Log error. Cart cleanup is best-effort — not revenue-critical. |

### §14.5 PaymentWebhookProcessorWorker — Detailed Implementation

```typescript
@Processor('payments')
class PaymentWebhookProcessorWorker {
  @Process('process-webhook')
  async handle(job: Job<WebhookJobPayload>): Promise<void> {
    const { razorpayEventId, eventType, payload } = job.data;

    // Step 1: Idempotency check again (worker may retry)
    const alreadyProcessed = await redis.get(`webhook_idem_result:${razorpayEventId}`);
    if (alreadyProcessed) {
      logger.info({ razorpayEventId }, 'Webhook already processed — skipping (worker idempotency)');
      return;
    }

    if (eventType === 'payment.captured') {
      await this.handlePaymentCaptured(payload);
    } else if (eventType === 'payment.failed') {
      await this.handlePaymentFailed(payload);
    }

    // Cache result for worker retry idempotency
    await redis.set(`webhook_idem_result:${razorpayEventId}`, JSON.stringify({ status: 'PROCESSED' }), 'EX', 86400);
  }

  private async handlePaymentCaptured(payload: RazorpayPaymentPayload): Promise<void> {
    const order = await this.orderRepository.findByGatewayOrderId(payload.razorpayOrderId);
    if (!order) throw new Error(`Order not found for razorpayOrderId: ${payload.razorpayOrderId}`);

    const reservations = await this.inventoryReservationRepository.findActiveByOrderId(order.id);
    const payment = await this.paymentRepository.findByOrderId(order.id);
    if (!payment) throw new Error(`Payment record not found for orderId: ${order.id}`);

    // Single $transaction: consume + confirm + emit
    await this.prisma.$transaction(async (tx) => {
      // HARDENED (INV-19): Assert order is still PLACED inside $transaction.
      // Guards against double-consume race: two concurrent webhook jobs for same razorpayOrderId.
      // The first committing transaction wins. The second sees 'CONFIRMED' and aborts safely.
      const currentOrder = await tx.order.findFirst({
        where: { id: order.id },
        select: { status: true },
      });
      if (currentOrder?.status !== 'PLACED') {
        logger.warn({ orderId: order.id, currentStatus: currentOrder?.status, razorpayEventId: payload.razorpayPaymentId },
          'HARDENED: Order not in PLACED state — duplicate webhook job aborted (double-consume guard INV-19)');
        return; // Idempotent exit: order already confirmed by a concurrent job
      }

      // Update payment status
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: 'CAPTURED', capturedAt: new Date(), gatewayRef: payload.razorpayPaymentId },
      });

      // consume() all reservations — passes tx (INV-11)
      for (const reservation of reservations) {
        await this.inventoryService.consume(reservation.id, 'SYSTEM', tx);
      }

      // Update order status
      await tx.order.update({
        where: { id: order.id },
        data: { status: 'CONFIRMED', confirmedAt: new Date() },
      });

      // Append status history
      await tx.orderStatusHistory.create({
        data: { orderId: order.id, statusFrom: 'PLACED', statusTo: 'CONFIRMED',
          actorId: 'SYSTEM', actorRole: 'SYSTEM', reason: 'Payment captured', timestamp: new Date() },
      });

      // HARDENED (INV-20): eventVersion + schemaVersion MANDATORY
      await tx.eventOutbox.create({
        data: {
          eventType: 'PaymentReceived',
          eventVersion: '1.0',      // MANDATORY (INV-20)
          schemaVersion: '4.3',     // MANDATORY (INV-20)
          payload: { orderId: order.id, paymentId: payment.id, amount: payload.amount, gatewayPaymentId: payload.razorpayPaymentId, method: payment.method, capturedAt: new Date().toISOString() },
          deduplicationKey: `payment-received-${payment.id}`,
          eventMonth: formatYearMonth(new Date()),
          status: 'PENDING',
        },
      });
      await tx.eventOutbox.create({
        data: {
          eventType: 'OrderConfirmed',
          eventVersion: '1.0',      // MANDATORY (INV-20)
          schemaVersion: '4.3',     // MANDATORY (INV-20)
          payload: buildOrderConfirmedPayload(order, payment),
          deduplicationKey: `order-confirmed-${order.id}`,
          eventMonth: formatYearMonth(new Date()),
          status: 'PENDING',
        },
      });
    }, { timeout: 10000, isolationLevel: 'ReadCommitted' });
  }

  private async handlePaymentFailed(payload: RazorpayPaymentPayload): Promise<void> {
    const order = await this.orderRepository.findByGatewayOrderId(payload.razorpayOrderId);
    if (!order) throw new Error(`Order not found for razorpayOrderId: ${payload.razorpayOrderId}`);

    // FIXED (INV-31): Fetch payment record explicitly — was missing, caused ReferenceError in production.
    const payment = await this.paymentRepository.findByOrderId(order.id);
    if (!payment) throw new Error(`Payment record not found for orderId: ${order.id}`);

    // Release reservations OUTSIDE $transaction (sequential, idempotent — §7.3)
    const { released, failed } = await this.inventoryService.releaseAllForOrder(
      order.id, 'PAYMENT_FAILED', 'SYSTEM',
    );

    if (failed > 0) {
      logger.error({ orderId: order.id, failed }, 'CRITICAL: Some inventory releases failed during payment failure handling');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },  // ← payment now properly fetched (INV-31)
        data: { status: 'FAILED', failedAt: new Date(), failureReason: payload.errorDescription },
      });
      await tx.order.update({
        where: { id: order.id },
        // HARDENED (INV-23): paymentFailedAt populated in DB — dual authority with Redis TTL
        data: { status: 'PAYMENT_FAILED', paymentFailedAt: new Date() },
      });
      await tx.orderStatusHistory.create({
        data: { orderId: order.id, statusFrom: 'PLACED', statusTo: 'PAYMENT_FAILED',
          actorId: 'SYSTEM', actorRole: 'SYSTEM', reason: payload.errorDescription, timestamp: new Date() },
      });
      // HARDENED (INV-20): eventVersion + schemaVersion MANDATORY
      await tx.eventOutbox.create({
        data: {
          eventType: 'PaymentFailed',
          eventVersion: '1.0',     // MANDATORY (INV-20)
          schemaVersion: '4.3',    // MANDATORY (INV-20)
          payload: { orderId: order.id, paymentId: payment.id, reason: payload.errorDescription, failedAt: new Date().toISOString() },
          deduplicationKey: `payment-failed-${payment.id}`,
          eventMonth: formatYearMonth(new Date()),
          status: 'PENDING',
        },
      });
    }, { timeout: 10000, isolationLevel: 'ReadCommitted' });

    // Set 30-minute retry window (secondary authority — primary is DB paymentFailedAt per INV-23)
    await redis.set(`payment_retry_window:${order.id}`, new Date().toISOString(), 'EX', 1800);
  }
}
```

---

## §15 SECURITY ARCHITECTURE

### §15.1 Webhook HMAC Validation — Reference Implementation

```typescript
// WebhookController — the ONLY place webhook is received
@Controller('payments')
export class WebhookController {
  @Post('webhook')
  @UseInterceptors(RawBodyInterceptor)  // ← Raw body preservation
  async handleWebhook(
    @RawBody() rawBody: Buffer,
    @Headers('x-razorpay-signature') signature: string,
    @Headers('x-razorpay-event') eventType: string,
    @Headers('x-razorpay-event-id') eventId: string,
  ) {
    // Step 1: HMAC verification (MANDATORY — FIRST OPERATION after extracting headers)
    const isValid = this.paymentProvider.verifyWebhookSignature(
      rawBody,
      signature,
      this.config.get('RAZORPAY_WEBHOOK_SECRET'),
    );
    if (!isValid) {
      // Alert: invalid signature is a security event
      this.metrics.increment('payment_webhook_invalid_signature_total');
      logger.warn({ eventId, eventType }, 'SECURITY: Invalid webhook signature received');
      throw new BadRequestException({ code: 'INVALID_WEBHOOK_SIGNATURE' });
    }

    // Step 2: Parse JSON only AFTER signature verification
    const event = JSON.parse(rawBody.toString());

    // Step 3: Idempotency check (SECOND operation)
    const alreadyQueued = await this.redis.set(
      `webhook_idem:${eventId}`, 'QUEUED', 'EX', 86400, 'NX',
    );
    if (!alreadyQueued) {
      // Duplicate webhook — return 200 immediately
      this.metrics.increment('payment_webhook_duplicate_total');
      return { status: 'already_processed' };
    }

    // Step 4: Queue to BullMQ worker
    // HARDENED (INV-22): Hard timeout on queue.add() — Razorpay requires 200 within 5 seconds
    await Promise.race([
      this.paymentsQueue.add('process-webhook', {
        razorpayEventId: eventId,
        eventType,
        payload: event.payload,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('QUEUE_TIMEOUT: BullMQ queue.add timed out after 2000ms')), 2000)
      ),
    ]).catch(async (err) => {
      // If queue.add timed out: un-set the idempotency key so Razorpay retry can re-queue
      if (err.message?.includes('QUEUE_TIMEOUT')) {
        await this.redis.del(`webhook_idem:${eventId}`).catch(() => {});
        logger.error({ eventId, eventType }, 'CRITICAL: BullMQ queue.add timed out — idempotency key cleared for retry');
        this.metrics.increment('payment_webhook_queue_timeout_total');
        throw new ServiceUnavailableException({ code: 'WEBHOOK_QUEUE_UNAVAILABLE' }); // 503 → Razorpay retries
      }
      throw err;
    });

    this.metrics.increment('payment_webhook_received_total', { event_type: eventType });
    return { status: 'accepted' };
  }
}
```

### §15.2 Raw Body Middleware Configuration

```typescript
// In main.ts or AppModule bootstrap — CRITICAL:
// express.raw() MUST be configured BEFORE express.json() for the webhook route.

app.use('/api/v1/payments/webhook', express.raw({ type: '*/*' }));
app.use(express.json());  // Applies to all other routes

// Alternative: Use a NestJS RawBodyInterceptor
// The key invariant: webhook route MUST receive raw Buffer — NOT parsed JSON.
```

### §15.3 Rate Limiting Enforcement

```typescript
// HARDENED (INV-21): Atomic rate limiter using SET NX+EX — prevents non-TTL key on crash.
// The old pattern (INCR + separate EXPIRE) has a TOCTOU crash window.

// Checkout throttle: 5 orders/hour per user
async checkCheckoutRate(userId: string): Promise<void> {
  const key = `checkout_rate:${userId}`;
  // Atomic Lua script: INCR + conditional EXPIRE in one round-trip
  const count = await this.redis.eval(
    `local c = redis.call('INCR', KEYS[1])
     if c == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
     return c`,
    1, key, '3600'
  ) as number;
  if (count > 5) {
    this.metrics.increment('checkout_rate_limit_exceeded_total');
    throw new TooManyRequestsException({ code: 'CHECKOUT_RATE_LIMIT_EXCEEDED', retryAfter: 3600 });
  }
}

// Cart add rate limit: 50 items/minute per user
async checkCartAddRate(userId: string): Promise<void> {
  const key = `cart_rate:${userId}`;
  const count = await this.redis.eval(
    `local c = redis.call('INCR', KEYS[1])
     if c == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
     return c`,
    1, key, '60'
  ) as number;
  if (count > 50) {
    throw new TooManyRequestsException({ code: 'CART_RATE_LIMIT_EXCEEDED', retryAfter: 60 });
  }
}
```

### §15.4 Buyer Ownership Enforcement

```typescript
// EVERY order read MUST include buyer ownership check
// EVERY cart mutation MUST include user ownership check

// OrderRepository pattern:
async findByIdForBuyer(orderId: string, buyerId: string): Promise<Order | null> {
  return this.prisma.order.findFirst({
    where: { id: orderId, buyerId, isDeleted: false },
    include: { items: true, payments: true, tracking: true },
  });
}

// CartRepository pattern:
async findActiveWithItems(userId: string, segment: Segment): Promise<Cart | null> {
  return this.prisma.cart.findFirst({
    where: { userId, segment, status: 'ACTIVE' },
    include: { items: { include: { product: { include: { inventory: true } } } } },
  });
}

// FORBIDDEN: findById(orderId) without buyerId filter
// FORBIDDEN: findMany() without userId/buyerId/sellerId filter
```

### §15.5 High-Value Payment Re-Authentication

```typescript
// POST /payments/initiate for amounts > ₹50,000:
// 1. Check order.grandTotal > 5000000 (paise)
// 2. Require x-reauth-token header
// 3. ReauthService.verify(token) → userId must match request user
// 4. Token is single-use (DEL from Redis after verification)
// 5. If missing or invalid → 403 REAUTH_REQUIRED

// ReauthService.generateToken(userId): string
//   SET reauth:{uuid} = userId EX 300 NX
//   Return uuid

// ReauthService.verify(token, requestUserId): boolean
//   GET reauth:{token} → storedUserId
//   If null → false (expired or invalid)
//   If storedUserId !== requestUserId → false (replay attack)
//   DEL reauth:{token} (single-use)
//   Return true
```

---

## §16 WEBHOOK PROCESSING ARCHITECTURE

### §16.1 Webhook Flow Sequence

```
Razorpay → POST /api/v1/payments/webhook
           ↓
WebhookController:
  1. Extract raw body (Buffer)
  2. HMAC-SHA256 verify (crypto.timingSafeEqual) → 400 if invalid
  3. Parse JSON (only AFTER verification)
  4. Redis SET webhook_idem:{eventId} NX → if exists: return 200 (duplicate)
  5. Queue job to 'payments' BullMQ queue
  6. Return 200 OK within 200ms

           ↓ (async, BullMQ)
PaymentWebhookProcessorWorker:
  1. Worker-level idempotency check (webhook_idem_result:{eventId})
  2. Dispatch to handlePaymentCaptured() or handlePaymentFailed()
  3. $transaction: consume/release + order update + status history + EventOutbox events
  4. SET webhook_idem_result:{eventId} AFTER transaction
  5. On failure (3 retries): → DLQ → alert ops

           ↓ (async, EventOutbox worker)
EventOutbox Worker (Sprint 2/3 existing):
  Processes OrderConfirmed/PaymentReceived/PaymentFailed events
```

### §16.2 Missed Webhook Recovery

```
PaymentReconciliationWorker (every 5 minutes):
  1. Query: Payment WHERE status = 'PENDING' AND createdAt < now() - 10min
  2. For each pending payment:
     a. Call PaymentProvider.getPaymentStatus(providerOrderId)
     b. If 'CAPTURED':
        - Synthesize payment.captured event → handlePaymentCaptured()
        - Metric: payment_reconciliation_missed_total++
     c. If 'FAILED':
        - Synthesize payment.failed event → handlePaymentFailed()
     d. If 'PENDING' AND age > 30min:
        - Force PAYMENT_FAILED (Razorpay UPI max wait time)
        - handlePaymentFailed(synthetic)
     e. If 'PENDING' AND age < 30min:
        - Skip (wait for webhook or next reconciliation run)

Alert: If reconciliation_missed_total > 10 in single run → WARNING (webhook delivery issue)
```

---

## §17 RECONCILIATION ARCHITECTURE

### §17.1 Three-Layer Reconciliation

```
Layer 1 — Payment Reconciliation (every 5 min):
  - Catches missed Razorpay webhooks
  - Query: PENDING payments > 10 min old
  - Action: Poll Razorpay API, process result

Layer 2 — Inventory Reconciliation (Sprint 3 hourly InventorySnapshotWorker):
  - Catches inventory drift from failed compensations
  - Compares actual stock vs sum of movements
  - Alerts on drift > threshold

Layer 3 — Order State Reconciliation (daily, via admin exception center):
  - Finds stuck orders (PLACED > 24h, PAYMENT_FAILED > 30min uncancelled)
  - Seeds Sprint 7 admin exception center
  - Sprint 4: surfaces via GET /admin/orders?status=PLACED&stuckSince=30min (admin-only)
```

### §17.2 Stuck Order Detection

```typescript
// PaymentRetryExpiryWorker (every 2 min):
// Finds: Orders in PAYMENT_FAILED state where paymentRetryWindow has expired
// HARDENED (INV-23): Dual authority — BOTH Redis key absence AND DB timestamp must confirm expiry

async handle(): Promise<void> {
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

  // Query all PAYMENT_FAILED orders (let dual-authority decide which to cancel)
  const paymentFailedOrders = await this.prisma.order.findMany({
    where: { status: 'PAYMENT_FAILED' },
    select: { id: true, paymentFailedAt: true },
  });

  for (const order of paymentFailedOrders) {
    // HARDENED (INV-23): Authority 1 — DB timestamp check (primary authority)
    if (!order.paymentFailedAt) {
      logger.warn({ orderId: order.id }, 'HARDENED: PAYMENT_FAILED order has no paymentFailedAt timestamp — skipping until populated');
      continue;
    }
    const dbWindowExpired = order.paymentFailedAt < thirtyMinutesAgo;

    // HARDENED (INV-23): Authority 2 — Redis key check (secondary authority)
    const windowKey = await this.redis.get(`payment_retry_window:${order.id}`);
    const redisWindowExpired = !windowKey; // true if key missing/expired

    // HARDENED (INV-23): Only cancel if BOTH authorities confirm expiry
    if (!dbWindowExpired) {
      // DB says window not expired — Redis key may have been evicted prematurely
      if (redisWindowExpired) {
        logger.warn({ orderId: order.id, paymentFailedAt: order.paymentFailedAt },
          'HARDENED (INV-23): Redis key missing but DB confirms window still open — possible Redis eviction detected');
        metrics.increment('payment_retry_redis_premature_eviction_total');
      }
      continue; // Window not expired per DB — skip
    }

    if (!redisWindowExpired) {
      // Redis says window open but DB says expired — Redis has stale key (clock skew edge case)
      // Log and proceed with cancellation (DB is the authority)
      logger.warn({ orderId: order.id }, 'HARDENED (INV-23): DB says expired but Redis key still present — proceeding with DB authority');
    }

    // Both authorities (or DB alone) confirm window expired — cancel
    await this.inventoryService.releaseAllForOrder(order.id, 'ORDER_CANCELLED', 'SYSTEM');

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({ where: { id: order.id }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
      await tx.orderStatusHistory.create({
        data: { orderId: order.id, statusFrom: 'PAYMENT_FAILED', statusTo: 'CANCELLED',
          actorId: 'SYSTEM', actorRole: 'SYSTEM', reason: 'Payment retry window expired', timestamp: new Date() },
      });
      // HARDENED (INV-20): eventVersion MANDATORY
      await tx.eventOutbox.create({
        data: {
          eventType: 'OrderCancelled',
          eventVersion: '1.0',      // MANDATORY (INV-20)
          schemaVersion: '4.3',     // MANDATORY (INV-20)
          payload: { orderId: order.id, reason: 'Payment retry window expired', cancelledAt: new Date().toISOString() },
          deduplicationKey: `order-cancelled-${order.id}-expiry`,
          eventMonth: formatYearMonth(new Date()),
          status: 'PENDING',
        },
      });
    }, { timeout: 8000, isolationLevel: 'ReadCommitted' });
  }
}
```

---

## §18 DEGRADED-MODE BEHAVIOR

### §18.1 Redis Unavailable

| Operation | Degraded Behavior | Revenue Impact |
|---|---|---|
| Cart GET | Fetch from DB directly (slower) | None |
| Cart write | Proceed without cache invalidation (60s stale max) | None |
| Order idempotency check | Return 503, retryable:true | Delayed order — buyer retries |
| Payment idempotency check | Return 503, retryable:true | Delayed payment — buyer retries |
| Checkout rate limit | Skip rate limit (allow through) | Slight abuse risk — acceptable |
| Webhook idempotency | Return 503 to Razorpay | Razorpay retries — safe |
| COD checkout | No Redis dependency — always works | ZERO impact |

### §18.2 Razorpay Unavailable

```
POST /payments/initiate:
  → Razorpay SDK call fails with timeout (30s circuit breaker)
  → Return 503 with: { code: 'PAYMENT_GATEWAY_UNAVAILABLE', codAvailable: true }
  → Order is NOT created (validation happens first, payment initiation is pre-order in this path)
  → Frontend shows: "Online payment unavailable. COD available now."

Reconciliation worker:
  → PaymentReconciliationWorker.getPaymentStatus() fails
  → Skip that payment, try next
  → Log error, increment metric
  → Alert if consecutive failures > 10

COD:
  → No Razorpay dependency — always works as fallback
```

### §18.3 BullMQ Unavailable

```
Webhook arrives → queue.add() fails:
  → WebhookController catches the error
  → Returns 503 to Razorpay (Razorpay retries webhook up to 5 times)
  → idempotency key NOT set (since queue failed)
  → Razorpay retry will succeed when BullMQ recovers
  → ReconciliationWorker catches it within 5-10 minutes if Razorpay stops retrying
```

### §18.4 DB Unavailable

```
All writes fail → 503 API-wide
App health check: GET /health/ready → 503 (DB ping fails)
Load balancer: Routes to healthy instance
COD: Not exempt — DB required for order creation
```

---

## §19 OBSERVABILITY ARCHITECTURE

### §19.1 Required Metrics

```
# Cart metrics
cart_item_count_total{segment, action}          ← action: add, update, remove
cart_checkout_initiated_total{segment}
cart_abandoned_total{segment}
cart_warning_surfaced_total{warning_type}

# Checkout funnel
checkout_funnel_step_total{step}
  steps: add_to_cart, checkout_start, address_select, payment_select, order_placed, confirmed

# Order metrics
order_created_total{payment_method, segment}
order_confirmed_total{payment_method}
order_cancelled_total{reason, actor}
order_payment_failed_total{reason}
order_stuck_in_placed_total                     ← orders in PLACED > 30min
order_number_collision_total                    ← HARDENED: orderNumber collision retries (INV-25)

# Payment metrics
payment_initiated_total{provider}
payment_success_total{provider}
payment_failed_total{provider, reason}
payment_webhook_received_total{event_type}
payment_webhook_duplicate_total
payment_webhook_invalid_signature_total         ← ALERT if > 0
payment_webhook_queue_timeout_total             ← HARDENED: queue.add() timeout (INV-22) ALERT if > 0
payment_reconciliation_run_total
payment_reconciliation_missed_total             ← ALERT if > 10 in single run
payment_reconciliation_latency_ms{quantile}
payment_retry_redis_premature_eviction_total    ← HARDENED: Redis eviction of retry window (INV-23)

# Queue metrics
bullmq_payment_queue_depth
bullmq_payment_webhook_worker_latency_ms{quantile}
bullmq_payment_dlq_size                         ← ALERT if > 5

# Infrastructure metrics (HARDENED)
redis_unavailable_total{component}              ← HARDENED: Redis outage detection (INV-21 degraded mode)
rate_limit_atomic_failure_total{endpoint}       ← HARDENED: Lua eval failure (fallback to INCR)
webhook_double_consume_prevented_total          ← HARDENED: INV-19 guard triggered
```

### §19.2 Required Alerts

```
CRITICAL (page immediately):
  payment_webhook_invalid_signature_total > 0           — possible attack or misconfiguration
  payment_webhook_queue_timeout_total > 0               — HARDENED: BullMQ queue.add timed out (INV-22)
  payment_failed_total > 5% of payment_initiated_total (5-min window) — payment system issue
  bullmq_payment_dlq_size > 5                           — unprocessed webhooks = unconfirmed orders
  order_stuck_in_placed_total > 10 (30-min window)     — webhook delivery failure
  redis_unavailable_total > 0 sustained for > 60s       — HARDENED: Redis outage = idempotency blind (INV degraded mode)
  webhook_double_consume_prevented_total > 0            — HARDENED: double-consume race detected (INV-19)

WARNING (notify on-call):
  payment_reconciliation_missed_total > 10 (single run)
  checkout_funnel_step_total{step=order_placed} < 50% of {step=payment_select} (1h window)
  payment_reconciliation_latency_ms p95 > 30000         — reconciliation timing out
  cart_warning_surfaced_total{warning_type=OUT_OF_STOCK} > 100/hr — catalog availability issue
  payment_retry_redis_premature_eviction_total > 5/hr   — HARDENED: Redis maxmemory eviction detected (INV-23)
  order_number_collision_total > 0                      — HARDENED: orderNumber collision retries (INV-25)
```

### §19.3 Structured Logging Standards

```typescript
// Order created:
logger.info({ orderId, buyerId, sellerId, grandTotal, paymentMethod, segment, orderNumber },
  'Order created successfully');

// Payment webhook received:
logger.info({ razorpayEventId, eventType, orderId }, 'Payment webhook received and queued');

// Payment failed:
logger.warn({ orderId, paymentId, reason, buyerId }, 'Payment failed — inventory released');

// Inventory release failure during compensation:
logger.error({ orderId, reservationId, reason, err },
  'CRITICAL: Inventory release failed during compensation — manual intervention required');

// Invalid webhook signature:
logger.warn({ razorpayEventId, ipAddress }, 'SECURITY: Invalid Razorpay webhook signature');

// FORBIDDEN: Logging payment amounts, card numbers, UPI IDs, Razorpay secrets.
```

---

## §20 DETAILED IMPLEMENTATION REFERENCE

### §20.1 Order Number Generation

```typescript
// Generates: VN-20260528-XXXXX (sortable, human-readable)
function generateOrderNumber(): string {
  const date = new Date();
  const datePart = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const sequence = Math.floor(10000 + Math.random() * 90000);  // 5-digit random
  return `VN-${datePart}-${sequence}`;
}

// HARDENED (INV-25): Collision probability at 100 orders/day is ~0.11% daily.
// DB @unique constraint enforced. Caller MUST retry up to 3 times inside $transaction on P2002 error.
// See §3.3 and §3.4 for the collision retry pattern (inside the $transaction, same tx client).
// Phase 2 (>500 orders/day): Use DB sequence for guaranteed uniqueness.
// isPrismaUniqueConstraintError helper:
function isPrismaUniqueConstraintError(err: unknown, field: string): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === 'P2002' &&
    Array.isArray((err.meta as any)?.target) &&
    ((err.meta as any).target as string[]).includes(field)
  );
}
```

### §20.2 Address Snapshot Logic

```typescript
// Shipping address is snapshotted at order creation — immutable thereafter.
// Never link to Address by FK in OrderItem — Address can change.

async function buildAddressSnapshot(addressId: string, userId: string): Promise<AddressSnapshot> {
  const address = await addressRepository.findByIdForUser(addressId, userId);
  if (!address) throw new NotFoundException({ code: 'ADDRESS_NOT_FOUND' });

  return {
    name: address.name,
    line1: address.line1,
    line2: address.line2 ?? '',
    city: address.city,
    state: address.state,
    pincode: address.pincode,
    landmark: address.landmark ?? '',
    country: address.country,
    snapshotAt: new Date().toISOString(),
    addressId: address.id,     // for audit reference only
  };
}
```

### §20.3 GST Calculation

```typescript
function computeOrderTotals(items: Array<{ unitPrice: Decimal; quantity: number; gstPercent: Decimal }>): OrderTotals {
  let subtotal = new Decimal(0);
  let taxAmount = new Decimal(0);

  for (const item of items) {
    const itemTotal = item.unitPrice.mul(item.quantity);
    const itemGst = itemTotal.mul(item.gstPercent).div(100);
    subtotal = subtotal.add(itemTotal);
    taxAmount = taxAmount.add(itemGst);
  }

  const grandTotal = subtotal.add(taxAmount);  // shippingCost = 0 in Sprint 4
  return { subtotal, taxAmount, shippingCost: new Decimal(0), discount: new Decimal(0), grandTotal };
}
```

### §20.4 Payment Retry Flow

```typescript
// POST /payments/retry
async retryPayment(orderId: string, userId: string, dto: PaymentRetryDto): Promise<InitiatePaymentResult> {
  // 1. Load order
  const order = await this.orderRepository.findByIdForBuyer(orderId, userId);
  if (!order) throw new NotFoundException({ code: 'ORDER_NOT_FOUND' });

  // 2. Validate retry eligibility
  if (order.status !== 'PAYMENT_FAILED') {
    throw new UnprocessableEntityException({ code: 'ORDER_NOT_IN_PAYMENT_FAILED_STATE' });
  }

  // FIXED (INV-23 dual-authority applied to retry path too):
  // Redis alone is insufficient — eviction can remove the key prematurely.
  // BOTH conditions must be true for the retry window to be considered expired.
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
  const redisKeyExists = await this.redis.exists(`payment_retry_window:${orderId}`);
  const dbWindowOpen = order.paymentFailedAt && order.paymentFailedAt > thirtyMinutesAgo;

  if (!redisKeyExists && !dbWindowOpen) {
    // Both confirm expired — window is closed
    throw new UnprocessableEntityException({ code: 'PAYMENT_RETRY_WINDOW_EXPIRED',
      message: 'Retry window expired — order has been or will be cancelled' });
  }
  if (!redisKeyExists && dbWindowOpen) {
    // Redis eviction detected — window still open per DB (buyer can still retry)
    logger.warn({ orderId, paymentFailedAt: order.paymentFailedAt },
      'HARDENED (INV-23): Redis retry window key missing but DB confirms window open — possible Redis eviction');
    this.metrics.increment('payment_retry_redis_premature_eviction_total');
    // Allow retry — DB is the authority
  }
  // If redisKeyExists: window definitely open (fast path — no DB timestamp check needed)

  // 3. Get previous failed payment to determine attempt number
  const failedPayments = await this.paymentRepository.findFailedByOrderId(orderId);
  const attemptNumber = failedPayments.length + 1;

  // 4. Generate deterministic idempotency key for retry
  const retryIdempotencyKey = `payment-retry-${orderId}-${attemptNumber}`;

  // 5. Initiate new payment (creates new Payment record, same orderId)
  // FIXED: userId MUST be passed to initiatePayment() for INV-24 idempotency key namespacing
  return this.initiatePayment(orderId, order.grandTotal.toNumber(), dto.paymentMethod, retryIdempotencyKey, userId);
}
```

---

## §21 API CONTRACT REFERENCE

### §21.1 Cart APIs

| Route | Method | Auth | Role | Idempotent | Body |
|---|---|---|---|---|---|
| `/api/v1/cart` | GET | JWT | BUYER | No | — |
| `/api/v1/cart/items` | POST | JWT | BUYER | No | `AddToCartDto` |
| `/api/v1/cart/items/:id` | PUT | JWT | BUYER | No | `UpdateCartItemDto` |
| `/api/v1/cart/items/:id` | DELETE | JWT | BUYER | No | — |

### §21.2 Order APIs

| Route | Method | Auth | Role | Idempotent | Header |
|---|---|---|---|---|---|
| `/api/v1/orders` | POST | JWT | BUYER | YES | `Idempotency-Key` (required) |
| `/api/v1/orders` | GET | JWT | BUYER | No | — |
| `/api/v1/orders/:id` | GET | JWT | BUYER | No | — |
| `/api/v1/orders/:id/cancel` | POST | JWT | BUYER | YES | `Idempotency-Key` (recommended) |

### §21.3 Payment APIs

| Route | Method | Auth | Role | Idempotent | Special |
|---|---|---|---|---|---|
| `/api/v1/payments/initiate` | POST | JWT | BUYER | YES | `Idempotency-Key` header required |
| `/api/v1/payments/webhook` | POST | None | SYSTEM | YES | `express.raw()` middleware. No JSON parsing. |
| `/api/v1/payments/:id/status` | GET | JWT | BUYER | No | — |
| `/api/v1/payments/retry` | POST | JWT | BUYER | YES | `Idempotency-Key` recommended |

### §21.4 Standard Response Envelope

```typescript
// Success:
{ success: true, data: T, timestamp: string, requestId: string }

// Error:
{ success: false, error: { code: string, message: string, details?: any }, timestamp: string, requestId: string }

// Sprint 4 error codes:
SEGMENT_MISMATCH, PRODUCT_NOT_FOUND, PRODUCT_INACTIVE, OUT_OF_STOCK, MOQ_VIOLATION,
CART_ITEM_UNAVAILABLE, INSUFFICIENT_STOCK, CONCURRENT_RESERVATION,
INVALID_STATUS_TRANSITION, ORDER_ALREADY_TERMINAL, TRANSITION_NOT_YET_ACTIVE,
PAYMENT_GATEWAY_UNAVAILABLE, INVALID_WEBHOOK_SIGNATURE, PAYMENT_RETRY_WINDOW_EXPIRED,
ORDER_NOT_IN_PAYMENT_FAILED_STATE, REAUTH_REQUIRED, IDEMPOTENCY_KEY_REQUIRED,
CHECKOUT_RATE_LIMIT_EXCEEDED, CART_RATE_LIMIT_EXCEEDED, ADDRESS_NOT_FOUND,
ORDER_NOT_FOUND, PAYMENT_NOT_FOUND
```

---

## §22 PHASED EXECUTION PLAN

### PHASE 1 — FOUNDATION (Days 1–2)

**Objective:** Schema activation, DTO types, module skeleton. Zero business logic.

**Model Recommended:** Gemini 2.5 Pro

**DB Changes — COMPLETE MIGRATION CHECKLIST (FINAL AUDIT v3.0):**

> **CRITICAL**: The following migrations MUST ALL be applied before any business logic phase (Phase 2+). Schema v4.3 is missing several Sprint 4–required fields and enum values. Applying them out of order causes runtime failures.

```sql
-- MIGRATION 1: Add PAYMENT_FAILED to OrderStatus enum (INV-27)
-- MUST run OUTSIDE a transaction (PostgreSQL requirement for ALTER TYPE ADD VALUE)
ALTER TYPE "OrderStatus" ADD VALUE 'PAYMENT_FAILED';
-- Verify: SELECT enum_range(NULL::"OrderStatus"); → must include 'PAYMENT_FAILED'

-- MIGRATION 2: Add paymentFailedAt to Order table (INV-28)
ALTER TABLE "Order" ADD COLUMN "paymentFailedAt" TIMESTAMPTZ;
-- Verify: SELECT column_name FROM information_schema.columns
--         WHERE table_name = 'Order' AND column_name = 'paymentFailedAt';

-- MIGRATION 3: Add sellerId to OrderItem table (INV-29)
ALTER TABLE "OrderItem" ADD COLUMN "sellerId" TEXT;
-- Note: nullable for backward compat. REQUIRED to be populated on all new Sprint 4 creates.
-- Verify: SELECT column_name FROM information_schema.columns
--         WHERE table_name = 'OrderItem' AND column_name = 'sellerId';

-- MIGRATION 4: Add gatewayPaymentId to Payment table (INV-30)
ALTER TABLE "Payment" ADD COLUMN "gatewayPaymentId" TEXT;
CREATE UNIQUE INDEX "idx_pay_gateway_payment_id" ON "Payment" ("gatewayPaymentId")
  WHERE "gatewayPaymentId" IS NOT NULL;
-- Partial unique index: allows NULL (pending payments), rejects duplicate captured IDs
-- Verify: \d+ "Payment" → shows gatewayPaymentId column with partial unique index

-- MIGRATION 5: Add OrderStatusHistory table (not in schema v4.3)
CREATE TABLE "OrderStatusHistory" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "statusFrom" TEXT,
  "statusTo" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "actorRole" TEXT NOT NULL,
  "reason" TEXT,
  "timestamp" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "OrderStatusHistory_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "idx_osh_order_date" ON "OrderStatusHistory" ("orderId", "timestamp");
```

- Update `prisma/schema.prisma` to add all 5 migration changes before running `prisma generate`.
- Run `prisma migrate dev --name sprint4_schema_additions` — or apply raw SQL above manually.
- Verify all indexes active:
  ```sql
  SELECT indexname FROM pg_indexes
  WHERE tablename IN ('Cart', 'Order', 'OrderItem', 'Payment', 'OrderStatusHistory');
  -- Must include: idx_cart_user_seg_stat, idx_order_buyer_stat, idx_pay_idem_key,
  --               idx_osh_order_date, idx_pay_gateway_payment_id
  ```

**DTO Creation (packages/types/src/):**
- `cart/cart.schemas.ts`: `AddToCartSchema`, `UpdateCartItemSchema`, `CartDto`, `CartItemDto`, `CartItemWarningSchema`
- `order/order.schemas.ts`: `CreateOrderSchema`, `CancelOrderSchema`, `OrderDto`, `OrderItemDto`, `OrderStatusHistoryDto`
- `payment/payment.schemas.ts`: `InitiatePaymentSchema`, `PaymentRetrySchema`, `PaymentDto`, `PaymentStatusDto`
- `payment/payment-provider.interface.ts`: `PaymentProvider` interface (§9.1)

**Module Skeletons:**
- `OrderModule`, `CartModule`, `OrdersModule`, `PaymentModule` — empty, compilable
- Register `orders` and `payments` BullMQ queues

**Acceptance Criteria:**
```
✅ pnpm build → zero TypeScript errors
✅ All Zod schemas export without errors
✅ Module skeleton imports resolve correctly
✅ MIGRATION 1: OrderStatus enum includes 'PAYMENT_FAILED' (verify with SQL above)
✅ MIGRATION 2: Order.paymentFailedAt column exists
✅ MIGRATION 3: OrderItem.sellerId column exists
✅ MIGRATION 4: Payment.gatewayPaymentId column exists with partial unique index
✅ MIGRATION 5: OrderStatusHistory table exists with idx_osh_order_date
✅ All required indexes confirmed active (EXPLAIN ANALYZE)
✅ prisma generate → client types include all Sprint 4 additions (PAYMENT_FAILED enum, paymentFailedAt, sellerId, gatewayPaymentId)
```

**Implementation Warnings for Phase 1:**
- Do NOT create CartItem.price column. CartItem in schema has unitPrice — use it for display only.
- Do NOT start business logic before ALL 5 migrations are confirmed applied.
- Do NOT run Phase 3 (order creation) if PAYMENT_FAILED is not in the enum — every order state machine will be broken.
- ALTER TYPE ADD VALUE must run outside a transaction — plan your migration accordingly.

---

### PHASE 2 — CART MODULE (Days 2–3)

**Objective:** Full cart CRUD with segment isolation, MOQ enforcement, soft availability check, Redis cache, rate limiting.

**Model Recommended:** Gemini 2.5 Pro

**Files Created:**
- `cart.repository.ts`: `findOrCreate()`, `findActiveWithItems()`, `upsertItem()`, `removeItem()`, `updateItemQuantity()`
- `cart.service.ts`: `getCart()`, `addItem()`, `updateItem()`, `removeItem()` (see §10.2)
- `cart.controller.ts`: Cart CRUD routes
- `cart.service.spec.ts` + `cart.integration.spec.ts`

**Redis:**
- Implement cart cache get/set/delete logic (see §4.2)
- Implement cart rate limit (see §15.3)

**Key Implementation Details:**
- `CartRepository.findOrCreate()` must use `upsert` with `idx_cart_user_seg_stat` unique constraint
- `CartService.addItem()` calls `InventoryService.getAvailability()` (soft check — NOT reserve)
- `CartService.addItem()` validates `product.segment === cart.segment` (SEGMENT_MISMATCH error)
- Cart totals computed in `computeCartTotals()` server-side — never from CartItem.totalPrice DB field
- `GET /cart` enriches with warnings: PRODUCT_INACTIVE, OUT_OF_STOCK, PRICE_CHANGED (>20%)

**Acceptance Criteria:**
```
✅ POST /cart/items (valid) → 200, CartItem created in DB
✅ POST /cart/items (MOQ violation) → 400 MOQ_VIOLATION
✅ POST /cart/items (different segment) → 400 SEGMENT_MISMATCH
✅ POST /cart/items (out of stock) → 400 OUT_OF_STOCK
✅ GET /cart → served from Redis on second request (verify with Redis monitor)
✅ Cart write → Redis cache key deleted (verify with Redis monitor)
✅ Cart totals computed server-side (verify: modify CartItem price in DB, GET /cart shows live price)
✅ Unit: cartService.addItem — segment mismatch, MOQ, out-of-stock paths tested
✅ Integration: full CRUD flow in isolation
✅ pnpm build → zero errors
```

---

### PHASE 3 — ORDER CREATION (COD PATH) (Days 3–5)

**Objective:** Complete COD checkout: validate → reserve → atomic $transaction (create order, consume inventory, emit events).

**Model Recommended:** Claude Sonnet (concurrency-critical, transaction-critical, saga orchestration)

**Files Created:**
- `orders.repository.ts`
- `order-status-history.repository.ts` (APPEND-ONLY — see §6.4)
- `order-state-machine.ts` (transition validation — see §6.2)
- `orders.service.ts` (saga coordinator — the most critical file in Sprint 4)
- `orders.controller.ts`

**Critical Implementation Path:**

```
OrderService.createOrder(dto, buyer):
  1. Idempotency check (see §7.1 Step 1)
  2. Load cart (CartRepository.findActiveWithItems)
  3. Pre-validation: all items parallel (Promise.all reads only)
  4. Price snapshot: live Inventory.price fetch
  5. Address snapshot
  6. Rate limit check (checkout_rate:{userId})
  7. reserve() per item — SEQUENTIAL (not parallel)
  8. COD $transaction (see §3.3 reference implementation)
  9. Redis idempotency SET
  10. Return order response
```

**Transaction Correctness Checklist (for code reviewer):**
- [ ] `reserve()` calls happen OUTSIDE `$transaction` block
- [ ] `consume()` receives `tx` parameter inside `$transaction`
- [ ] No Razorpay calls inside `$transaction`
- [ ] No Redis calls inside `$transaction`
- [ ] No BullMQ calls inside `$transaction`
- [ ] `orderStatusHistory.create()` uses `tx`
- [ ] `eventOutbox.create()` uses `tx` with deterministic dedup key
- [ ] `eventOutbox.create()` includes `eventVersion: '1.0'` and `schemaVersion: '4.3'` (INV-20)
- [ ] `cart.update(CHECKED_OUT)` uses `tx`
- [ ] `OrderItem.sellerId` populated from `Product.businessId` on every OrderItem (INV-29)
- [ ] Compensation: `releaseAllForOrder()` called in catch block on any $transaction failure
- [ ] Redis idempotency SET is AFTER $transaction.commit() (not inside, not before)
- [ ] Idempotency key format: `order_idem:{userId}:{clientKey}` — NOT `order_idem:{cartId}:{userId}` (INV-33)
- [ ] COD $transaction includes `tx.payment.create()` synthetic record (INV-26)
- [ ] COD Payment record: `gatewayPaymentId` is null (COD has no gateway payment ID)

**Acceptance Criteria:**
```
✅ POST /orders (COD, valid cart) → 201, order CONFIRMED, inventory consumed
✅ POST /orders (COD, same Idempotency-Key twice) → 200 same order (no double creation)
✅ POST /orders (insufficient stock) → 409 after failed reserve (inventory unchanged)
✅ POST /orders (invalid address) → 400 ADDRESS_NOT_FOUND
✅ OrderStatusHistory has entries: null→PLACED, PLACED→CONFIRMED
✅ EventOutbox has: OrderCreated + OrderConfirmed events
✅ Cart status: CHECKED_OUT after order
✅ InventoryReservation status: CONSUMED after COD
✅ InventoryMovement: ORDER_FULFILLED entry
✅ Concurrency test: 10 concurrent COD orders for stock=5 → exactly 5 succeed, 5 fail gracefully
✅ pnpm build → zero errors
```

---

### PHASE 4 — PAYMENT MODULE (RAZORPAY + COD PROVIDER) (Days 5–7)

**Objective:** PaymentProvider abstraction, Razorpay integration, COD provider, payment initiation, webhook controller with HMAC, idempotency.

**Model Recommended:** Claude Sonnet (security-critical, payment architecture, webhook HMAC)

**Files Created:**
- `payment-provider.interface.ts` (§9.1)
- `razorpay.provider.ts` (§9.2)
- `cod.provider.ts` (§9.3)
- `payment.service.ts` (§9.4)
- `payment.repository.ts`
- `payment.controller.ts`
- `webhook.controller.ts` (§16.1, §15.1)

**Critical Implementation Rules:**
- Razorpay SDK imported ONLY in `razorpay.provider.ts`
- `webhook.controller.ts` uses `express.raw()` — verify in `main.ts` (INV-15)
- HMAC uses `crypto.timingSafeEqual()` — never string comparison (§9.2)
- Webhook idempotency key SET after queue.add(), not before (INV-16)

**Acceptance Criteria:**
```
✅ POST /payments/initiate → returns { paymentUrl, razorpayOrderId, paymentId }
✅ POST /payments/initiate (same Idempotency-Key twice) → same response, no second Razorpay call
✅ POST /payments/webhook (valid HMAC, payment.captured) → 200, order CONFIRMED
✅ POST /payments/webhook (invalid HMAC) → 400 INVALID_WEBHOOK_SIGNATURE
✅ POST /payments/webhook (duplicate eventId) → 200, NOT reprocessed (check DB — single CONFIRMED)
✅ POST /payments/webhook (payment.failed) → 200, order PAYMENT_FAILED, inventory released
✅ Unit: verifyWebhookSignature → valid signature passes, invalid fails, tampered body fails
✅ Unit: payment idempotency → second call returns cached response
✅ Razorpay SDK NOT imported anywhere except razorpay.provider.ts (grep verification)
✅ pnpm build → zero errors
```

---

### PHASE 5 — ONLINE PAYMENT ORDER FLOW (Days 7–8)

**Objective:** Connect online payment path: order in PLACED state → payment initiation → webhook confirmation via BullMQ worker.

**Model Recommended:** Claude Sonnet (saga orchestration — consume() timing is most critical)

**Files Created:**
- `payment-webhook-processor.worker.ts` (§14.5)

**Critical Implementation Path (Online):**

```
POST /orders (paymentMethod: ONLINE_*):
  Steps 1–7: Same as COD (validate, pre-validate, price, address, rate limit, reserve)
  Step 8: Online $transaction (see §3.4 — PLACED state, NO consume())
  Step 9: Redis idempotency SET
  Step 10: POST /payments/initiate (OUTSIDE $transaction)
  Step 11: Return { orderId, orderNumber, status: 'PLACED', paymentUrl }

POST /payments/webhook (payment.captured):
  → WebhookController validates + queues
  → PaymentWebhookProcessorWorker:
      → $transaction: consume() + CONFIRMED + status history + EventOutbox events
```

**consume() Timing Verification Checklist:**
- [ ] COD: consume() inside order creation $transaction ✓
- [ ] Online: consume() inside webhook processor $transaction ✓
- [ ] Nowhere is consume() called without a tx parameter ✓
- [ ] Nowhere is consume() called before $transaction starts ✓

**Acceptance Criteria:**
```
✅ POST /orders (ONLINE_UPI) → 201, status: PLACED, paymentUrl returned
✅ Payment.captured webhook → order CONFIRMED, inventory consumed
✅ Payment.failed webhook → order PAYMENT_FAILED, inventory released
✅ InventoryReservation: ACTIVE after PLACED, CONSUMED after CONFIRMED, RELEASED after PAYMENT_FAILED
✅ Concurrency: 5 simultaneous payment.captured webhooks for same orderId → order confirmed exactly once
✅ Payment retry: POST /payments/retry → new payment initiated for PAYMENT_FAILED order
✅ Payment retry after window expired → 422 PAYMENT_RETRY_WINDOW_EXPIRED
✅ pnpm build → zero errors
```

---

### PHASE 6 — WORKERS & RECONCILIATION (Days 8–9)

**Objective:** PaymentReconciliationWorker, PaymentRetryExpiryWorker, CartCleanupWorker, all with stable jobIds.

**Model Recommended:** Gemini 2.5 Pro

**Files Created:**
- `payment-reconciliation.worker.ts` (§17.2)
- `payment-retry-expiry.worker.ts` (§17.2)
- `cart-cleanup.worker.ts` (§10.4)

**Stable JobId Verification:**
```typescript
// Grep test after implementation:
grep -r 'jobId' workers/ | grep -E 'reconciliation|retry-expiry|cart-cleanup'
// Must show stable string jobId for each worker
```

**Acceptance Criteria:**
```
✅ PaymentReconciliationWorker: finds PENDING payments > 10min, polls Razorpay, processes
✅ PaymentRetryExpiryWorker: finds expired PAYMENT_FAILED orders, cancels them
✅ CartCleanupWorker: soft-deletes ACTIVE carts with updatedAt > 30 days
✅ All workers use stable jobId (grep verified)
✅ No duplicate cron runs on API restart (verify: restart API 3 times, check BullMQ job count)
✅ DLQ on PaymentWebhookProcessor after 3 failures → alert metric fires
✅ pnpm build → zero errors
```

---

### PHASE 7 — ORDER CANCELLATION & CANCELLATION SAGA (Day 9)

**Objective:** Buyer cancel flow with compensation, admin cancel, inventory release.

**Model Recommended:** Gemini 2.5 Pro

**Implementation:**
```typescript
// OrderService.cancelOrder(orderId, actorId, actorRole, reason):
  1. Load order (verify ownership)
  2. assertNotTerminal(order)
  3. validateTransition(order.status, 'CANCELLED')
  4. releaseAllForOrder(orderId, 'ORDER_CANCELLED', actorId) — OUTSIDE $transaction
  5. $transaction:
     - order.update { status: CANCELLED, cancelledAt: now(), cancellationReason: reason }
     - orderStatusHistory.create { statusFrom, statusTo: CANCELLED }
     - eventOutbox.create { OrderCancelled, dedup key: order-cancelled-{orderId}-{version} }
```

**Acceptance Criteria:**
```
✅ POST /orders/:id/cancel (PLACED) → 200, inventory released
✅ POST /orders/:id/cancel (CONFIRMED) → 200, no inventory action (already consumed)
✅ POST /orders/:id/cancel (CANCELLED) → 422 ORDER_ALREADY_TERMINAL
✅ POST /orders/:id/cancel (COMPLETED) → 422 ORDER_ALREADY_TERMINAL
✅ Buyer cannot cancel another buyer's order → 404
✅ OrderStatusHistory entry on every cancellation
✅ EventOutbox: OrderCancelled event emitted
✅ InventoryReservation: RELEASED after cancellation of PLACED order
```

---

### PHASE 8 — FRONTEND (Days 9–11)

**Objective:** Cart page, 3-step checkout, order confirmation page.

**Model Recommended:** Gemini 2.5 Flash (frontend, lower concurrency risk)

**Cart Page:**
- Item list with quantity steppers (max = availableQuantity from live stock)
- MOQ validation: red border + "Minimum X pieces required"
- Item warnings: banner for PRODUCT_INACTIVE, OUT_OF_STOCK, PRICE_CHANGED
- Sticky "Checkout" CTA
- Empty cart state: "Cart mein kuch nahi hai — Browse karein"
- SWR polling: 30s refresh for live stock updates

**Checkout Flow (3 steps):**
- Step 1: Address selection (saved addresses + "Add new address" flow)
- Step 2: Payment method selection (COD default, Online payment option)
- Step 3: Order review (items, totals, address, no hidden charges)
- Disable submit button on click (prevent double submit)
- Progress stepper at top
- Error state: "Payment fail ho gaya. Retry karein."

**Order Confirmation:**
- Checkmark animation (< 300ms, respects prefers-reduced-motion)
- Order number (VN-XXXXXXXX) displayed prominently
- Estimated delivery (placeholder: "2–5 business days")
- "Track Order" button (stub — Sprint 5)
- "Continue Shopping" button

**Acceptance Criteria:**
```
✅ Cart page loads < 1s on staging
✅ MOQ violation: red border visible with error message
✅ Out-of-stock warning visible on cart
✅ Checkout: all 3 steps functional
✅ COD checkout completes: confirmation page shown with VN-XXXXX order number
✅ Razorpay checkout: Razorpay sandbox modal opens
✅ Submit button disabled immediately on click
✅ Order confirmation animation plays
✅ Checkout works on mobile (375px viewport)
✅ E2E Playwright: full COD checkout passes on staging
```

---

### PHASE 9 — OBSERVABILITY, SECURITY HARDENING & LOAD TESTING (Days 11–12)

**Objective:** All metrics implemented, all alerts configured, load test passing, security audit clean.

**Model Recommended:** Gemini 2.5 Pro

**Observability:**
- All metrics from §19.1 implemented via `@opentelemetry/api` or Prometheus client
- All alerts from §19.2 configured in Grafana
- Structured logs from §19.3 verified by log grep

**Security Audit:**
```bash
# Verify Razorpay only imported in one file:
grep -r 'razorpay' apps/api/src --include="*.ts" | grep -v razorpay.provider.ts
# Must return zero lines

# Verify no Redis inside transactions:
grep -r 'redis\.' apps/api/src --include="*.ts" | grep -v '\.spec\.' | grep '$transaction'
# Must return zero lines

# Verify timing-safe comparison in webhook:
grep -r 'timingSafeEqual' apps/api/src --include="*.ts"
# Must return at least one line in webhook/payment provider

# Verify OrderStatusHistory has no update/delete:
grep -r 'update\|delete\|deleteMany\|upsert' apps/api/src/modules/order/orders/order-status-history.repository.ts
# Must return zero lines

# Verify no client price trusted:
grep -r 'body\.price\|body\.total\|body\.grandTotal\|body\.subtotal' apps/api/src/modules/order --include="*.ts"
# Must return zero lines
```

**Load Test (k6 or Artillery):**
```javascript
// Scenario: 50 concurrent COD orders for 30 products (stock=30)
// Expected: exactly 30 orders succeed, 20 fail with INSUFFICIENT_STOCK
// Zero oversell (verify with: SELECT quantity FROM Inventory WHERE quantity < 0)
```

**Acceptance Criteria:**
```
✅ All §19.1 metrics firing correctly (verify with Prometheus scrape)
✅ All §19.2 alerts configured in Grafana
✅ Security grep checks: all zero violations
✅ Load test: 50 concurrent orders → zero oversell
✅ Webhook duplicate test: 5 identical webhooks → order confirmed exactly once
✅ Razorpay sandbox: full payment flow (initiate → checkout → webhook → confirmed)
✅ pnpm build → zero errors
✅ Test coverage ≥ 80% for orders + payment modules
```

---

### PHASE 10 — PRODUCTION DEPLOYMENT (Day 12–14)

**Objective:** First production deployment with COD flow verified manually.

**Model Recommended:** N/A — Human-executed

**Pre-deploy Checklist:**
```
ENVIRONMENT VARIABLES (verify all set in production):
[ ] DATABASE_URL (production PostgreSQL)
[ ] REDIS_URL (production Redis)
[ ] RAZORPAY_KEY_ID
[ ] RAZORPAY_KEY_SECRET
[ ] RAZORPAY_WEBHOOK_SECRET
[ ] JWT_SECRET (from Sprint 1)
[ ] NODE_ENV=production

DATABASE:
[ ] prisma migrate status → all applied on production
[ ] All required indexes active (EXPLAIN ANALYZE on production)
[ ] OrderStatusHistory table exists and indexed

INFRASTRUCTURE:
[ ] Razorpay webhook URL configured to: https://api.vyaparnet.com/api/v1/payments/webhook
[ ] BullMQ worker process running (separate from API process)
[ ] Redis AOF persistence enabled (not in-memory only)
[ ] Load balancer health check → /health/ready

DEPLOYMENT:
[ ] Deploy apps/api container
[ ] Verify GET /health/ready → 200
[ ] Place 1 test COD order manually in production
[ ] Verify order in DB: status=CONFIRMED, OrderStatusHistory exists, EventOutbox has events
[ ] Monitor for 30 minutes (check Grafana for anomalies)

ROLLBACK PLAN:
[ ] Previous Docker image tagged and ready for instant rollback
[ ] Rollback command documented and verified: docker pull + docker run (< 5 min)
[ ] Inventory orphan reservations handled by Sprint 3 ReservationExpiryWorker on rollback
```

---

## §23 SPRINT VALIDATION GATE

All items must pass before Sprint 4 is declared complete.

### §23.1 Cart Validation

```
✅ POST /cart/items (valid product, valid MOQ) → 200 with CartItem
✅ POST /cart/items (MOQ violation) → 400 code: MOQ_VIOLATION
✅ POST /cart/items (product from different segment) → 400 code: SEGMENT_MISMATCH
✅ POST /cart/items (out of stock) → 400 code: OUT_OF_STOCK
✅ GET /cart → served from Redis (60s TTL — verify with MONITOR)
✅ Cart write → Redis key invalidated immediately (verify with MONITOR)
✅ GET /cart → itemWarnings populated when product goes out of stock
✅ Cart totals correct server-side (modify Inventory.price in DB → GET /cart shows new price)
✅ Cart rate limit: 51st cart add in 60s → 429
✅ Checkout rate limit: 6th POST /orders in 1h → 429
✅ Buyer A cannot GET/mutate Buyer B's cart → 404
```

### §23.2 COD Order Validation

```
✅ POST /orders (COD, valid cart, valid address) → 201, status: CONFIRMED
✅ Post-order: InventoryReservation.status = CONSUMED
✅ Post-order: InventoryMovement type = ORDER_FULFILLED exists
✅ Post-order: OrderStatusHistory entries: null→PLACED, PLACED→CONFIRMED
✅ Post-order: EventOutbox has OrderCreated + OrderConfirmed events
✅ Post-order: Cart.status = CHECKED_OUT
✅ Order total = server-computed (not from client body)
✅ Shipping address snapshot = immutable JSON on Order
✅ POST /orders (same Idempotency-Key twice) → same order returned, no duplicate
✅ POST /orders (insufficient stock) → 409 INSUFFICIENT_STOCK, no order created
✅ POST /orders (invalid address) → 400 ADDRESS_NOT_FOUND, no order created
✅ Concurrency: 10 COD orders for stock=1 → exactly 1 succeeds, 9 fail gracefully
✅ Concurrency: stock never goes negative (verify SQL: SELECT * FROM "Inventory" WHERE quantity < 0)
```

### §23.3 Online Payment Validation

```
✅ POST /orders (ONLINE_UPI) → 201, status: PLACED, paymentUrl returned
✅ POST /payments/initiate (same key twice) → same response, 1 Razorpay call only
✅ Razorpay sandbox: checkout opens correctly from paymentUrl
✅ POST /payments/webhook (valid signature, payment.captured) → 200, order CONFIRMED
✅ POST /payments/webhook (invalid signature) → 400 INVALID_WEBHOOK_SIGNATURE
✅ POST /payments/webhook (duplicate eventId) → 200, order confirmed exactly once in DB
✅ POST /payments/webhook (payment.failed) → 200, order PAYMENT_FAILED, inventory released
✅ Payment retry: POST /payments/retry (within 30min) → new payment initiated
✅ Payment retry after window expired → 422 PAYMENT_RETRY_WINDOW_EXPIRED
✅ PaymentRetryExpiryWorker: PAYMENT_FAILED order after 30min → CANCELLED automatically
✅ PaymentReconciliationWorker: simulated missed webhook → reconciled within 10 min
```

### §23.4 Order Cancellation Validation

```
✅ POST /orders/:id/cancel (PLACED) → 200, inventory released, order CANCELLED
✅ POST /orders/:id/cancel (CONFIRMED) → 200, no inventory action, order CANCELLED
✅ POST /orders/:id/cancel (CANCELLED) → 422 ORDER_ALREADY_TERMINAL
✅ Buyer A cannot cancel Buyer B's order → 404
✅ OrderStatusHistory: every cancellation has history entry
✅ EventOutbox: OrderCancelled event emitted
```

### §23.5 Security Validation

```
✅ Webhook HMAC: tampered payload → 400 (not 200)
✅ Webhook signature: missing header → 400
✅ Order total: client body price ignored (verified: send different price in body → DB has server price)
✅ Razorpay import: grep confirms only in razorpay.provider.ts
✅ Redis inside $transaction: grep confirms zero violations
✅ OrderStatusHistory no update/delete: grep confirms zero violations
✅ High-value payment (> ₹50K): without reauth token → 403 REAUTH_REQUIRED
✅ Cart segment isolation: Buyer A's TEXTILE cart returns nothing when queried with SPARE_PARTS segment
```

### §23.6 Production Validation

```
✅ GET /health/ready → 200 on production
✅ 1 manual COD order placed in production → visible in DB
✅ All Grafana metrics firing on production
✅ Razorpay webhook URL configured and test webhook delivers successfully
✅ BullMQ dashboard: all workers ACTIVE, zero DLQ items
✅ No secrets in production logs (grep logs for RAZORPAY_KEY_SECRET → zero matches)
✅ Rollback test: previous image deployed in < 5 minutes
✅ CI pipeline green
✅ Test coverage ≥ 80% for order + payment modules
✅ Zero TypeScript errors
✅ OpenAPI specs committed: /contracts/orders.yaml, /contracts/payments.yaml
```

---

## §24 FAILURE CONDITIONS

Sprint 4 is NOT complete if ANY of the following are true:

```
CATASTROPHIC (block sprint close):
  - Any oversell event in concurrency test (stock goes negative)
  - Duplicate charge possible (same payment confirmed twice)
  - Webhook accepted without HMAC verification
  - consume() called outside a $transaction (orphaned consume)
  - Razorpay SDK imported anywhere except razorpay.provider.ts
  - Redis call inside prisma.$transaction() callback
  - HARDENED: consume() called without order.status === 'PLACED' check in webhook $transaction (INV-19)
  - HARDENED: Idempotency key without userId namespace — cross-buyer key collision possible (INV-24)
  - FINAL AUDIT: PAYMENT_FAILED not in OrderStatus enum → all payment failure flows crash (INV-27)
  - FINAL AUDIT: handlePaymentFailed() missing payment fetch → ReferenceError in production (INV-31)
  - FINAL AUDIT: order_idem:{cartId}:{userId} key pattern used → cross-buyer idempotency collision (INV-33)

CRITICAL (must be resolved before sprint close):
  - Inventory not released when payment fails
  - Order total different from server-computed value (client price trusted)
  - OrderStatusHistory modified after creation (update/delete)
  - Webhook processed twice for same eventId (idempotency failure)
  - Payment retry available after window expired
  - HARDENED: COD order created without synthetic Payment record (INV-26)
  - HARDENED: PaymentRetryExpiryWorker cancels orders based only on Redis key absence (INV-23)
  - HARDENED: Any EventOutbox record missing eventVersion or schemaVersion (INV-20)
  - FINAL AUDIT: Order.paymentFailedAt migration not applied → INV-23 dual-authority broken (INV-28)
  - FINAL AUDIT: OrderItem.sellerId not populated → Sprint 5 seller views broken, ERP sync broken (INV-29)
  - FINAL AUDIT: retryPayment() missing userId param to initiatePayment() → INV-24 violated on retry
  - FINAL AUDIT: CartCleanupWorker EventOutbox.create() missing eventVersion/schemaVersion (INV-20)

IMPORTANT (resolve before production deploy):
  - Cart segment isolation failure (cross-segment data visible)
  - Cart race condition: concurrent addItem corrupts CartItem quantity
  - Production health check fails
  - Cron workers have no stable jobId (duplicate crons on restart)
  - DLQ alerts not configured
  - HARDENED: Rate limiter using non-atomic INCR+EXPIRE (INV-21 — risk of permanent key with no TTL)
  - HARDENED: WebhookController without queue.add() timeout (INV-22 — risk of silent webhook loss)
  - FINAL AUDIT: CodPaymentProvider using Date.now() for providerOrderId → non-deterministic on retry (INV-32)
  - FINAL AUDIT: READY_TO_SHIP / OUT_FOR_DELIVERY states not guarded in Sprint 4 state machine
  - FINAL AUDIT: Payment.gatewayPaymentId unique constraint not applied → double-capture not blocked at DB layer (INV-30)
```

---

## §25 SPRINT 4 → SPRINT 5 HANDOFF

### §25.1 What Sprint 5 Inherits

| Element | Sprint 4 Delivers | Sprint 5 Consumes |
|---|---|---|
| `Order` model with full state machine | PLACED, CONFIRMED, CANCELLED, PAYMENT_FAILED active | Activates PROCESSING, SHIPPED, DELIVERED, COMPLETED |
| `OrderItem.sellerId` populated | Yes — from Product.businessId | Seller-specific order views |
| `OrderTracking` model | Active in schema, empty | Seller fills tracking number on SHIPPED |
| `OrderStatusHistory` | Append-only, all Sprint 4 transitions | Timeline view in buyer order detail |
| EventOutbox events | OrderCreated, OrderConfirmed, OrderCancelled, PaymentReceived, PaymentFailed | Notification worker (Sprint 6) consumes |
| `PaymentProvider` interface | Defined and abstracted | Sprint 5 adds payment retry UI using existing `/payments/retry` |
| `releaseAllForOrder()` | Idempotent, tested | Sprint 5 seller-initiated cancellation uses same API |

### §25.2 Sprint 5 API Dependencies

Sprint 5 requires the following Sprint 4 APIs to be stable (no breaking changes):

```
GET  /api/v1/orders/:id        → buyer order detail (Sprint 5 adds seller view on top)
GET  /api/v1/orders            → buyer order list
POST /api/v1/orders/:id/cancel → seller will get a similar cancel endpoint in Sprint 5

Sprint 5 ADDS (does not modify):
POST /seller/orders/:id/status → PROCESSING, SHIPPED transitions
GET  /seller/orders            → seller order list
GET  /buyer/orders/:id/reorder → reorder from past order
```

### §25.3 Sprint 5 Data Readiness

All orders created in Sprint 4 must have:
- `orderMonth` populated (for partition-readiness)
- `OrderStatusHistory` with at minimum the PLACED transition entry
- `EventOutbox` events with complete payloads (Sprint 6 notification consumer expects full payload)
- `sellerId` on every `OrderItem` (Sprint 5 seller view depends on this)

---

## §26 UNIVERSAL AGENT IMPLEMENTATION PROMPT

```
You are implementing Sprint 4 of VyaparNet: Cart, Orders & Payments.

MANDATORY READING BEFORE ANY CODE:
  Read §0 (System Invariants) — these are absolute laws.
  Read §3 (Transaction Boundary Governance) — the most common source of bugs.
  Read §7.1 (Checkout Saga Steps) — the exact sequence for createOrder().
  Read §27 (AI-Agent Warnings) — the specific pitfalls to avoid.

YOU ARE IMPLEMENTING PHASE: [INSERT PHASE NUMBER AND NAME]

REQUIRED FOR THIS PHASE:
  [INSERT PHASE-SPECIFIC FILES, ACCEPTANCE CRITERIA, AND WARNINGS FROM §22]

INVARIANTS YOU MUST NEVER VIOLATE:
  1. consume() ALWAYS receives tx from caller. NEVER opens its own $transaction. (INV-11)
  2. No Razorpay/HTTP calls inside $transaction. (INV-12)
  3. OrderStatusHistory: zero update() or delete() methods. (INV-13)
  4. Order totals computed server-side from live DB prices. (INV-14)
  5. Webhook HMAC validated before any processing. (INV-15)
  6. Payment idempotency check is FIRST operation. (INV-16)
  7. EventOutbox dedup keys are deterministic (no Date.now(), no randomUUID()). (INV-17)
  8. All cart/order/payment queries filter by userId/segment. (INV-18)
  9. reserve() called BEFORE $transaction. (§7.1 Step 6)
  10. Redis idempotency key SET AFTER $transaction commits. (§7.4)
  11. HARDENED: Check order.status === 'PLACED' INSIDE webhook $transaction before consume(). (INV-19)
  12. HARDENED: eventVersion + schemaVersion on EVERY EventOutbox.create(). (INV-20)
  13. HARDENED: Rate limit INCR+EXPIRE via atomic Lua script — NOT two separate commands. (INV-21)
  14. HARDENED: WebhookController.queue.add() has 2000ms timeout with idempotency key rollback. (INV-22)
  15. HARDENED: PaymentRetryExpiryWorker cancels only when BOTH Redis key absent AND DB timestamp expired. (INV-23)
  16. HARDENED: Idempotency keys for order/payment MUST include userId from JWT — not client key alone. (INV-24)
  17. HARDENED: COD $transaction MUST include tx.payment.create() synthetic record. (INV-26)

TRANSACTION PATTERN FOR COD (reference §3.3):
  reserve() → outside tx → then $transaction { order + items + consume(tx) + statusHistory + eventOutbox + cart.checkout }

TRANSACTION PATTERN FOR ONLINE (reference §3.4):
  reserve() → outside tx → then $transaction { order + items + statusHistory + eventOutbox + cart.checkout }
  [Later: webhook $transaction { payment.update + consume(tx) + order.update + statusHistory + eventOutbox }]

AFTER GENERATING CODE:
  Run: grep -r 'redis' apps/api/src/modules --include="*.ts" | grep '\$transaction'  → must return zero
  Run: grep -r 'razorpay' apps/api/src/modules --include="*.ts" | grep -v 'razorpay.provider'  → must return zero
  Run: grep -r 'update\|delete' apps/api/src/modules/order/orders/order-status-history.repository.ts  → must return zero
```

---

## §27 AI-AGENT IMPLEMENTATION WARNINGS

### S4-W1: consume() timing (COD vs Online)

```
WRONG (COD): Creating order in PLACED state, calling consume() outside the order $transaction.
WRONG (Online): Calling consume() inside the order $transaction (instead of webhook tx).
WRONG (both): Calling consume() without passing tx parameter.

CORRECT (COD):   consume() is inside the order creation $transaction. receives tx.
CORRECT (Online): consume() is inside the WebhookProcessorWorker $transaction. receives tx.
```

### S4-W2: Razorpay SDK leakage

```
WRONG: import Razorpay from 'razorpay' in any file except razorpay.provider.ts.
WRONG: razorpay.orders.create() called from PaymentService directly.
WRONG: razorpay.payments.capture() called from OrderService.

CORRECT: All Razorpay SDK calls are behind PaymentProvider interface.
CORRECT: PaymentService calls this.paymentProvider.createOrder() (interface method).
CORRECT: Only razorpay.provider.ts has Razorpay SDK import.

VERIFICATION: grep -r 'razorpay' src --include="*.ts" | grep -v razorpay.provider.ts → zero
```

### S4-W3: Webhook raw body

```
WRONG: express.json() runs on /payments/webhook before express.raw().
WRONG: JSON.parse(req.body) used inside webhook controller before HMAC verification.
WRONG: @Body() decorator used in WebhookController (parsed JSON — destroys raw body).

CORRECT: app.use('/api/v1/payments/webhook', express.raw({ type: '*/*' })) in main.ts.
CORRECT: app.use(express.json()) runs for all OTHER routes only.
CORRECT: @RawBody() rawBody: Buffer in WebhookController.
CORRECT: JSON.parse(rawBody.toString()) AFTER verifyWebhookSignature().
```

### S4-W4: reserve() inside $transaction

```
WRONG: InventoryService.reserve() called inside prisma.$transaction() callback.

WHY IT FAILS: reserve() acquires a Redis lock internally. Calling it inside a Prisma
$transaction holds the DB transaction while waiting for Redis lock + doing DB reads inside
reserve(). This creates deadlock risk and transaction timeout.

CORRECT: reserve() called BEFORE $transaction.
CORRECT: $transaction only receives the reservationIds (not the reserve() calls).
```

### S4-W5: Promise.all() for reservations

```
WRONG: Promise.all(cartItems.map(item => inventoryService.reserve(item)))
WHY: Concurrent reservations on same inventory create lock contention storm.
     All requests compete for the same Redis lock simultaneously.

CORRECT: Sequential for...of loop:
  for (const item of cartItems) {
    const reservation = await inventoryService.reserve(item);
    reservations.push(reservation);
  }
```

### S4-W6: Promise.all() for release (compensation)

```
WRONG: Promise.all(reservations.map(r => inventoryService.release(r.id)))
WHY: DB contention. If one release fails, others may succeed — partial compensation.

CORRECT: Sequential for...of loop with isolated try/catch per item (see §7.3).
```

### S4-W7: Idempotency key SET timing

```
WRONG: redis.set('order_idem:...') BEFORE $transaction
  → If $transaction fails, idempotency key is orphaned — blocks future retries.

WRONG: redis.set('order_idem:...') INSIDE $transaction
  → Redis I/O is FORBIDDEN inside $transaction.

CORRECT: redis.set('order_idem:...') AFTER $transaction.commit() succeeds.
```

### S4-W8: Non-deterministic EventOutbox dedup keys

```
WRONG: deduplicationKey: `order-created-${Date.now()}`
WRONG: deduplicationKey: `order-created-${randomUUID()}`
WRONG: No deduplicationKey (leaves field null — violates unique constraint on retried events)

CORRECT: deduplicationKey: `order-created-${order.id}`  ← deterministic, based on orderId
```

### S4-W9: OrderStatusHistory with update/delete methods

```
WRONG: Adding update(), updateMany(), delete(), deleteMany(), or upsert() to OrderStatusHistoryRepository.
WRONG: Using tx.orderStatusHistory.update() anywhere in OrderService.

CORRECT: OrderStatusHistoryRepository has ONLY create() and findByOrderId().
CORRECT: Every status transition creates a NEW history record via create().

VERIFICATION: grep -r 'update\|delete' order-status-history.repository.ts → zero matches
```

### S4-W10: Cart pricing — client totals trusted

```
WRONG: Using req.body.total, req.body.grandTotal, req.body.unitPrice for order financial calculation.
WRONG: Using CartItem.unitPrice from DB as the authoritative price for OrderItem.
WRONG: Not computing grandTotal server-side.

CORRECT: Price fetched from Inventory.price (live DB read) at createOrder() time.
CORRECT: GST computed from Product.gstPercent at createOrder() time.
CORRECT: grandTotal = computeOrderTotals(liveItems).grandTotal.
CORRECT: OrderItem.unitPrice populated from live Inventory.price at creation time.
```

### S4-W11: Missing stable jobId on cron workers

```
WRONG: queue.add('payment-reconciliation', {}, { repeat: { cron: '*/5 * * * *' } })
  → No jobId → every API restart creates a new cron job → thousands of duplicate crons.

CORRECT: queue.add('payment-reconciliation', {}, {
  repeat: { cron: '*/5 * * * *' },
  jobId: 'payment-reconciliation-cron',  ← stable string
})

VERIFICATION: Restart API 3 times → check BullMQ dashboard → exactly 1 repeat job per cron.
```

### S4-W12: Cancellation after consume()

```
WRONG: POST /orders/:id/cancel for CONFIRMED order → calling releaseAllForOrder().
WHY: Once inventory is consumed (CONFIRMED), the stock has been permanently decremented.
     Releasing after consume would DOUBLE the stock (incorrect).

CORRECT: Cancellation after CONFIRMED → inventory state is NOT touched.
         The payment refund (Sprint 8) handles the financial compensation.
         Only the order status changes to CANCELLED.
         Only PLACED state has active reservations that need release.
```

### S4-W13: Missing order.status PLACED check inside webhook $transaction

```
WRONG (Online webhook):
  await this.prisma.$transaction(async (tx) => {
    // No order status check — DIRECTLY calls consume()
    for (const reservation of reservations) {
      await inventoryService.consume(reservation.id, 'SYSTEM', tx);
    }
    await tx.order.update({ data: { status: 'CONFIRMED' } });
  });

WHY IT FAILS: Two concurrent payment.captured webhooks for same razorpayOrderId.
  Both pass Redis webhook_idem NX (race window between NX check and BullMQ add).
  Both arrive at the $transaction simultaneously.
  Both call consume() — inventory decremented TWICE for the same stock.
  Result: oversell or negative quantity.

CORRECT:
  await this.prisma.$transaction(async (tx) => {
    const current = await tx.order.findFirst({ where: { id: orderId }, select: { status: true } });
    if (current?.status !== 'PLACED') {
      logger.warn({ orderId }, 'Double-consume guard triggered — skipping (INV-19)');
      return; // Idempotent exit
    }
    // ... consume + confirm ...
  });

VERIFICATION: grep -r 'handlePaymentCaptured\|process-webhook' src --include="*.ts" | head -5
  → must show order.status check BEFORE consume() in each match
```

### S4-W14: Missing eventVersion on EventOutbox records

```
WRONG: tx.eventOutbox.create({ data: { eventType: 'OrderCreated', payload: {...}, deduplicationKey: '...' } })
  → No eventVersion, no schemaVersion.

WHY IT BREAKS: Sprint 6 (Notifications) consumer routes by eventVersion.
  Sprint 9 (ERP) sync uses schemaVersion to validate payload shape.
  Events without version fields cause:
    - Silent consumer failures in Sprint 6 (null.major is not a function)
    - ERP sync mismatches in Sprint 9 (field validation fails on null schemaVersion)

CORRECT: EVERY eventOutbox.create() must include:
  eventVersion: '1.0',
  schemaVersion: '4.3',
  status: 'PENDING',

VERIFICATION: grep -r 'eventOutbox.create' src --include="*.ts" | grep -v 'eventVersion'
  → must return zero lines
```

### S4-W15: Rate limiter INCR/EXPIRE non-atomic pattern

```
WRONG:
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 3600);  ← NOT atomic with INCR

WHY IT FAILS: Process crash between INCR and EXPIRE creates a key with NO TTL.
  → Rate limit key persists FOREVER
  → That userId is rate-limited FOREVER (never gets 429, but also never resets)
  → Actually correct behavior reversed: key with count=1 never expires means
     every future request increments BUT the window never resets → stuck rate limit
  → In practice: userId permanently rate-limited with no escape except manual Redis DEL

CORRECT: Use Lua script for atomic INCR+EXPIRE:
  const count = await redis.eval(
    `local c = redis.call('INCR', KEYS[1])
     if c == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
     return c`,
    1, key, windowSeconds.toString()
  ) as number;

VERIFICATION: grep -rn 'redis.incr' src --include="*.ts" | grep -v spec
  → must return zero lines (all INCR replaced with Lua eval)
```

### S4-W16: WebhookController without queue.add() timeout

```
WRONG:
  await this.paymentsQueue.add('process-webhook', { ... });  ← No timeout
  return { status: 'accepted' };  ← May never be reached if queue hangs

WHY IT FAILS: If Redis/BullMQ is slow (not down, just slow), queue.add() takes > 5s.
  Razorpay marks webhook as failed (5s timeout). But:
    - The idempotency key WAS set before queue.add()
    - The job is eventually added (just late)
    - BUT Razorpay retried → idempotency key returns 200 → Razorpay stops retrying
    - The ORIGINAL job eventually runs → webhook processed (lucky path)
  However, if queue.add() is STUCK (e.g., Redis OOM):
    - No response within 5s → Razorpay marks failed
    - Idempotency key set → Razorpay won't retry successfully
    - Job never added → webhook permanently lost
    - ReconciliationWorker catches this only after 10min

CORRECT: Hard timeout with idempotency key rollback on timeout:
  await Promise.race([
    queue.add('process-webhook', payload),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('QUEUE_TIMEOUT')), 2000)
    ),
  ]).catch(async (err) => {
    if (err.message?.includes('QUEUE_TIMEOUT')) {
      await redis.del(`webhook_idem:${eventId}`).catch(() => {});  // Allow Razorpay retry
      throw new ServiceUnavailableException({ code: 'WEBHOOK_QUEUE_UNAVAILABLE' });
    }
    throw err;
  });

VERIFICATION: grep -rn 'paymentsQueue.add\|queue.add' src/webhook --include="*.ts"
  → must show Promise.race wrapper in each match
```

### S4-W17: PaymentRetryExpiryWorker cancelling orders on Redis key absence alone

```
WRONG:
  const windowKey = await redis.get(`payment_retry_window:${order.id}`);
  if (!windowKey) {
    await cancelOrder(order.id);  ← Based ONLY on Redis key absence
  }

WHY IT FAILS: Redis maxmemory-policy eviction (allkeys-lru or volatile-lru) can
  evict the payment_retry_window key BEFORE its 30-minute TTL expires.
  Result: Order cancelled while buyer is actively retrying payment (within window).
  This is revenue loss + terrible UX (buyer sees order cancelled mid-retry).

CORRECT: BOTH conditions must be true to cancel:
  1. Redis key missing (Redis says expired)
  AND
  2. order.paymentFailedAt < now() - 30min (DB confirms expired)

  If Redis key missing but DB says < 30min: SKIP + alert ops (Redis eviction detected).

REQUIRED SCHEMA: Order.paymentFailedAt: DateTime? field populated by WebhookProcessorWorker.

VERIFICATION: grep -rn 'payment_retry_window' src --include="*.ts"
  → must show BOTH redis.get() AND order.paymentFailedAt check in each match
```

### S4-W18: Idempotency key without userId namespace

```
WRONG:
  const key = `payment_idem:${clientIdempotencyKey}`;   // client-provided only
  const key = `order_idem:${cartId}`;                   // no userId

WHY IT FAILS: Buyer A provides Idempotency-Key: 'my-order-1'
  Buyer B also provides Idempotency-Key: 'my-order-1' (natural collision at scale)
  → Buyer B receives Buyer A's order response (PII leak, wrong order)

Malicious attack vector:
  Buyer A learns Buyer B's cartId (e.g., from leaked network traffic)
  Sets Idempotency-Key: {buyerB_cartId} → Gets Buyer B's order details

CORRECT:
  const idemKey = `order_idem:${userId}:${clientProvidedKey}`;     // userId from JWT
  const idemKey = `payment_idem:${userId}:${clientProvidedKey}`;   // userId from JWT

The userId MUST come from the verified JWT token — NEVER from the request body.

VERIFICATION:
  grep -rn 'order_idem:\|payment_idem:' src --include="*.ts" | grep -v 'userId'
  → must return zero lines
```

---

### S4-W19: handlePaymentFailed() Missing payment Variable — Guaranteed ReferenceError

```
WRONG:
  private async handlePaymentFailed(payload: RazorpayPaymentPayload): Promise<void> {
    const order = await this.orderRepository.findByGatewayOrderId(payload.razorpayOrderId);
    // ... releaseAllForOrder ...
    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({ where: { id: payment.id }, ... });  // ← 'payment' not defined!
    });
  }

WHY IT FAILS: The 'payment' variable is never fetched in handlePaymentFailed().
  Only handlePaymentCaptured() fetches the payment record.
  Every payment.failed webhook → ReferenceError: payment is not defined → worker crashes
  → job retried 3 times, all fail → DLQ → ops page → manual intervention required.
  PAYMENT_FAILED orders never created → inventory never released → reservation stuck.

CORRECT:
  private async handlePaymentFailed(payload: RazorpayPaymentPayload): Promise<void> {
    const order = await this.orderRepository.findByGatewayOrderId(payload.razorpayOrderId);
    if (!order) throw new Error(`Order not found: ${payload.razorpayOrderId}`);

    // REQUIRED: Fetch payment record before using it inside $transaction
    const payment = await this.paymentRepository.findByOrderId(order.id);
    if (!payment) throw new Error(`Payment not found for orderId: ${order.id}`);
    // ... rest of function ...

VERIFICATION:
  grep -n 'handlePaymentFailed' src --include="*.ts" -A 10 | grep 'payment ='
  → must show payment record fetch BEFORE the $transaction block
```

### S4-W20: CodPaymentProvider Using Date.now() — Non-Deterministic Gateway Reference

```
WRONG:
  createOrder(): Promise<PaymentProviderOrder> {
    return Promise.resolve({
      providerOrderId: `cod-${Date.now()}`,  // ← different value on every call!
    });
  }

WHY IT FAILS: If CodPaymentProvider.createOrder() is called more than once for the
  same order (e.g., payment initiation retry, idempotency miss), each call generates
  a different providerOrderId. The synthetic Payment.gatewayRef becomes inconsistent
  on each call. This breaks reconciliation (which looks up by gatewayRef) and
  violates deterministic behavior expected by the audit trail.

  Note: For COD, the synthetic payment is created directly in §3.3 with
  gatewayRef: `cod-${order.id}` (correct). But if CodPaymentProvider.createOrder()
  is ever invoked (e.g., in a test or alternate path), the Date.now() creates
  an inconsistency.

CORRECT:
  createOrder(amount, currency, metadata: { orderId, buyerId, description }): Promise<PaymentProviderOrder> {
    return Promise.resolve({
      providerOrderId: `cod-${metadata.orderId}`,  // ← orderId-based, deterministic
    });
  }

VERIFICATION:
  grep -rn 'Date.now' src/modules/payment/providers/cod.provider.ts
  → must return zero lines
```

### S4-W21: CartCleanupWorker Missing eventVersion, schemaVersion, and status on EventOutbox

```
WRONG (§10.4 CartCleanupWorker):
  await tx.eventOutbox.create({
    data: {
      eventType: 'CartAbandoned',
      payload: { cartId, userId, segment, itemCount },
      deduplicationKey: `cart-abandoned-${cart.id}`,
      eventMonth: formatYearMonth(new Date()),
      // ← Missing: eventVersion, schemaVersion, status!
    },
  });

WHY IT FAILS:
  1. eventVersion missing → violates INV-20. Sprint 6 notification consumer
     tries to route by eventVersion → null.major → TypeError.
  2. schemaVersion missing → violates INV-20. Sprint 9 ERP sync
     fails payload validation.
  3. status missing → depends on Prisma default 'PENDING', but explicit is required
     for clarity and grep verification.

CORRECT:
  await tx.eventOutbox.create({
    data: {
      eventType: 'CartAbandoned',
      eventVersion: '1.0',     // MANDATORY (INV-20)
      schemaVersion: '4.3',    // MANDATORY (INV-20)
      payload: { cartId: cart.id, userId: cart.userId, segment: cart.segment, itemCount: cart.items.length },
      deduplicationKey: `cart-abandoned-${cart.id}`,
      eventMonth: formatYearMonth(new Date()),
      status: 'PENDING',       // EXPLICIT (readability + grep verification)
    },
  });

VERIFICATION:
  grep -rn 'CartAbandoned' src --include="*.ts" -A 5 | grep 'eventVersion'
  → must return at least one line
```

### S4-W22: OrderItem.sellerId Must Be Populated on Every Order Creation

```
WRONG:
  await tx.orderItem.createMany({
    data: cartItems.map(item => ({
      orderId: order.id,
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.livePrice,
      // ... other fields ...
      // ← sellerId is MISSING!
    }))
  });

WHY IT FAILS:
  1. Sprint 5 seller order views query: SELECT * FROM OrderItem WHERE sellerId = $sellerId
     → Returns ZERO rows for all orders created in Sprint 4.
     Sellers see empty order list in Sprint 5. Revenue attribution broken.
  2. Sprint 9 ERP sync expects sellerId for financial reconciliation per seller.
  3. Admin commission calculation (Sprint 7) requires sellerId per line item.

CORRECT:
  // Before creating OrderItems, fetch the product (already done in pre-validation)
  // Each product has businessId = sellerId for that item.
  await tx.orderItem.createMany({
    data: cartItems.map(item => ({
      orderId: order.id,
      productId: item.productId,
      sellerId: item.product.businessId,   // ← REQUIRED (INV-29)
      quantity: item.quantity,
      unitPrice: item.livePrice,
      // ...
    }))
  });

VERIFICATION:
  grep -rn 'orderItem.createMany' src --include="*.ts" | grep -v 'sellerId'
  → must return zero lines
```

---

## §28 ROLLBACK & OPERATIONAL READINESS

### §28.1 Rollback Procedures

```
Application Rollback (< 5 min):
  docker pull vyaparnet-api:previous-tag
  docker stop vyaparnet-api-current
  docker run --env-file .env vyaparnet-api:previous-tag
  Verify: GET /health/ready → 200

Data Implications on Rollback:
  - Orders in DB: remain (new orders survive rollback)
  - Payments: reconcile via Razorpay dashboard for any payment initiated post-rollback-point
  - Inventory reservations: Sprint 3 ReservationExpiryWorker handles orphaned reservations within 15 min
  - Cart data: remains in DB, unaffected
  - EventOutbox events: existing worker processes any outstanding events
  - Redis idempotency keys: remain (TTL-based cleanup — acceptable)

Schema Rollback:
  If OrderStatusHistory was added as a new migration in Phase 1:
    DROP TABLE "OrderStatusHistory";  → RISK: destroys audit trail
  Recommendation: Do NOT rollback schema. Only rollback application code.
  OrderStatusHistory records from Sprint 4 are historical — no business impact on rollback.
```

### §28.2 Operational Readiness Checklist

```
INFRASTRUCTURE:
[ ] Redis 7 running with AOF persistence enabled
[ ] PostgreSQL 15 running with autovacuum enabled
[ ] BullMQ worker process running SEPARATELY from API process
[ ] Razorpay webhook URL configured and verified

DATABASE:
[ ] prisma migrate status → all migrations applied on staging + production
[ ] All Tier 1 indexes active:
    idx_cart_user_seg_stat (UNIQUE)
    idx_order_buyer_stat
    idx_pay_order_stat
    idx_pay_idem_key (UNIQUE)
    idx_osh_order_date
[ ] EXPLAIN ANALYZE on hot paths: no Seq Scan on indexed columns

RAZORPAY:
[ ] Key ID and Secret in environment (test: POST /payments/initiate → Razorpay order created)
[ ] Webhook secret in environment (test: POST /payments/webhook with test signature → 200)
[ ] Webhook URL registered in Razorpay dashboard: https://api.vyaparnet.com/api/v1/payments/webhook
[ ] Razorpay test mode → sandbox test → Razorpay live mode → production

OBSERVABILITY:
[ ] All §19.1 metrics firing (verify via Prometheus targets)
[ ] All §19.2 alerts configured in Grafana
[ ] Payment DLQ size alert active and tested
[ ] Webhook invalid signature alert active

WORKERS:
[ ] PaymentWebhookProcessorWorker: processing jobs (check BullMQ dashboard)
[ ] PaymentReconciliationWorker: cron running every 5 min (verify in BullMQ schedule)
[ ] PaymentRetryExpiryWorker: cron running every 2 min
[ ] CartCleanupWorker: cron scheduled (daily)
[ ] All workers: stable jobId (no duplicates on restart — verify)

SECURITY:
[ ] No RAZORPAY_KEY_SECRET in logs (grep production logs)
[ ] No card numbers / UPI IDs in logs
[ ] Webhook only on HTTPS endpoint (not HTTP)
[ ] Rate limiting active on checkout + cart endpoints
```

---

## §29 FUTURE SCALABILITY & MICROSERVICE EXTRACTION NOTES

### §29.1 OrderService Extraction Readiness

```
When OrderService becomes a microservice (Phase 3):

Step 1: InventoryService.reserve() becomes HTTP call to InventoryService microservice
  → No code change in OrderService (just change the transport layer in InventoryService client)

Step 2: PaymentService.initiatePayment() becomes HTTP call to PaymentService microservice
  → No code change (PaymentProvider interface is the abstraction)

Step 3: EventOutbox events become Kafka topics
  → Replace EventOutbox.create() with KafkaProducer.send()
  → Deduplication key logic unchanged
  → Consumer implementations unchanged

Sprint 4 OrderService is designed to support this evolution with ZERO rewrite.
```

### §29.2 Cart Scaling Strategy

```
Current (MVP): Single Cart table, userId+segment+ACTIVE unique index.
Scale trigger: > 1M active carts.

Phase 2 evolution:
  PARTITION BY RANGE (createdAt) on Cart table (monthly partitions).
  Cart queries already scoped to userId — partition key on userId would be better
  but requires application-level routing. Use createdAt partitioning first (simpler).
  
Phase 3 evolution:
  Extract CartService to separate microservice.
  Cart becomes its own PostgreSQL instance.
  OrderService calls CartService via HTTP to get cart items at checkout.
```

### §29.3 Payment Scaling Strategy

```
Current (MVP): Razorpay webhook → BullMQ → PaymentWebhookProcessorWorker.
Scale trigger: > 1000 webhooks/minute.

Phase 2 evolution:
  Separate 'payments-webhooks' and 'payments-reconciliation' queues.
  Multiple PaymentWebhookProcessorWorker instances (BullMQ concurrency).
  
Phase 3 evolution:
  Payment microservice with its own DB.
  Webhook endpoint is the payment service entry point.
  OrderService subscribes to PaymentCaptured events via Kafka.
```

### §29.4 ERP Integration Points

```
Sprint 4 seeds these EventOutbox events for future ERP consumers (Sprint 9+):
  - OrderCreated (full payload with line items, GST, amounts)
  - OrderConfirmed (payment method, gateway transaction ID)
  - PaymentReceived (amount, currency, gateway reference)
  - OrderCancelled (reason, actor)

ERP consumer (Sprint 9) subscribes to these events from EventOutbox table.
Zero Sprint 4 code changes required for ERP integration.

GST data quality:
  OrderItem.hsnCode, OrderItem.gstPercent, OrderItem.gstAmount
  These are populated at order creation from Product.hsnCode + Product.gstPercent.
  ERP integration (Sprint 9) depends on these being accurate.
  Sprint 4 MUST populate all three fields on every OrderItem.
```

---

## FINAL IMPLEMENTATION AUTHORITY STATEMENT

```
This document — SPRINT_4_EXECUTION_LOCK_FINAL.md — is the single implementation
authority for Sprint 4 of VyaparNet.

It supersedes all previous Sprint 4 discussions, scope documents (which remain
as the upstream WHY), and implementation drafts.

Sprint 1–3 frozen guarantees are ABSOLUTE SYSTEM LAWS.
Sprint 4 Scope Decisions v1.0 are the approved philosophy.
This document is the HOW.

No implementation decision, performance optimization, or simplification
may violate any §0 invariant. EVER.

Hardening Pass v2.0 (2026-05-28):
  23 vulnerabilities identified and resolved.
  8 new invariants (INV-19–INV-26) added.
  All reference implementations updated. All worker implementations updated.
  All Redis key patterns corrected. All observability extended.

Final Enterprise Audit v3.0 (2026-05-28):
  18 additional vulnerabilities identified and resolved:
  — CATASTROPHIC (3): PAYMENT_FAILED missing from schema enum (INV-27),
    handlePaymentFailed() payment null-reference bug (INV-31),
    idempotency key format inconsistency across sections (INV-33)
  — CRITICAL (7): paymentFailedAt field missing from schema (INV-28),
    OrderItem.sellerId missing from schema (INV-29),
    gatewayPaymentId unique constraint missing (INV-30),
    COD providerOrderId non-determinism (INV-32),
    CartCleanupWorker missing INV-20 fields (S4-W21),
    retryPayment() missing userId + Redis-only window check,
    §9.5 internal document contradiction resolved
  — IMPORTANT (8): Phase 1 migration checklist completed with all 5 migrations,
    state machine READY_TO_SHIP/OUT_FOR_DELIVERY guards documented,
    OrderItem.sellerId population requirement formalized (S4-W22),
    all idempotency key references aligned to INV-33 canonical format,
    4 new AI-agent warnings (S4-W19 through S4-W22) added
  7 new invariants (INV-27–INV-33) added.
  4 new AI-agent warnings (S4-W19–S4-W22) added.

Status: v3.0 FINAL AUDIT LOCK — FREEZE-READY
Authority: Enterprise Architecture Board + Hardening Review Board + Final Audit Board
Date: 2026-05-28

Post-Audit Required Actions Before Freeze:
  [ ] Confirm all 5 Phase 1 migrations applied on dev DB
  [ ] Confirm PAYMENT_FAILED in OrderStatus enum (INV-27 verification SQL)
  [ ] Confirm Order.paymentFailedAt column exists (INV-28 verification SQL)
  [ ] Confirm OrderItem.sellerId column exists (INV-29 verification SQL)
  [ ] Confirm Payment.gatewayPaymentId partial unique index active (INV-30)
  [ ] Confirm handlePaymentFailed() has payment fetch before $transaction (S4-W19 grep)
  [ ] Confirm CodPaymentProvider uses metadata.orderId not Date.now() (S4-W20 grep)
  [ ] Confirm CartCleanupWorker EventOutbox.create() has eventVersion (S4-W21 grep)
  [ ] Confirm OrderItem.sellerId populated in orderItem.createMany() (S4-W22 grep)
```

---

*END OF SPRINT_4_EXECUTION_LOCK_FINAL.md v3.0 FINAL AUDIT LOCK*
