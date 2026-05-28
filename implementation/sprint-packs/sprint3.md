# VYAPARNET — SPRINT 3 FINAL IMPLEMENTATION PACK
## Inventory Management: Zero-Oversell Guarantee
### Version: v1.0 ENTERPRISE LOCK | Concurrency-Hardened
### Authority: All Architecture Documents + Master Context Pack + Distributed Systems Review
### Date: 2026-05-27 | Preceded by: Sprint 2 (Marketplace Core — COMPLETE)

---

## SECTION 1: SPRINT IDENTITY

| Field | Value |
|---|---|
| Sprint Number | 3 |
| Sprint Name | Inventory Management: Zero-Oversell Guarantee |
| Spec Version | v1.0 Enterprise Lock |
| Duration | 2 weeks (10 working days) |
| Status | READY TO EXECUTE (Sprint 2 gate must be fully passed) |
| Preceded By | Sprint 2 — Marketplace Core Foundation (ALL validation gates must pass) |
| Followed By | Sprint 4 — Cart, Orders & Payments |
| Critical Path | Yes — Orders (Sprint 4) call InventoryService.reserve(). If Sprint 3 is wrong, Sprint 4 is wrong. |

---

## SECTION 2: REQUIRED ARCHITECTURE CONTEXT FILES

Every agent and engineer executing Sprint 3 MUST read these files before writing a single line.

| Context Type | File | Why Required |
|---|---|---|
| Schema — Inventory | `VyaparNet_SCHEMA_v4_3_FINAL_FREEZE.md` | Inventory, InventoryMovement, InventoryReservation, InventorySnapshot models |
| Indexing Strategy | `VyaparNet_Database_Indexing_Strategy_Official_Freeze_v1.md` — Sections 6.3, 12, 13 | idx_inv_prod, idx_invres_inv_stat_exp, deadlock strategy, hot-table write |
| DB Infra | `VyaparNet_DB_Infra_Architecture.md` — Section 3.5 | Inventory concurrency, pessimistic+optimistic locking, InventoryReservation design |
| Implementation | `VyaparNet_Implementation_Architecture_Official_Freeze_v1.md` — Sections 5, 7, 8, 20 | Transaction boundary, queue, retry/DLQ/idempotency, concurrency/payment safety |
| Workflow Sequences | `VyaparNet_Workflow_Sequence_Diagrams_v1.md` — Section 5.1 | Inventory Reservation CRITICAL workflow |
| Module Breakdown | `VyaparNet_Module_Breakdown_Final_Enterprise_Freeze_v2.docx` — Module 6 | Inventory Engine boundaries, events, APIs |
| API Contracts | `VyaparNet_API_Contracts_Backend_Scaffold_Blueprint.md` — Section 4 | Inventory management APIs |
| PRD | `VyaparNet_PRDv2_Final_Freeze.docx` — Sections 10, 13 | Concurrency strategy, inventory foundations |
| Runtime | `VyaparNet_Deployment_Runtime_Architecture_v1.md` — Sections 9, 10, 14 | Redis, queue, security runtime |
| Sprint 1 | Auth infrastructure, guard patterns, AuditRepository |
| Sprint 2 | ProductsModule, BusinessQueryService, SegmentApprovalPolicy patterns |
| Context | `LOCKED_DECISIONS.md`, `PROJECT_CONTEXT.md` | Governance, anti-patterns |

---

## SECTION 3: ARCHITECTURAL PHILOSOPHY

### 3.1 The Fundamental Contract

Sprint 3 makes one guarantee that is non-negotiable:

**For any product with quantity Q, at most Q simultaneous order placements will succeed. Zero exceptions. Zero edge cases. Under any failure mode.**

This guarantee holds under:
- Redis failures (fallback path defined)
- DB contention (optimistic locking retry)
- Worker crashes (idempotent compensation)
- Network retries (idempotency keys)
- Duplicate queue jobs (deduplication keys)
- Partial transaction failures (atomic rollback)
- Reservation expiry races (deterministic release)

### 3.2 Layered Defense Architecture

```
Layer 1: Idempotency key (Redis)
  → Prevents duplicate reservation from network retry

Layer 2: Redis distributed lock (SETNX, TTL=30s)
  → Prevents two concurrent reservation attempts on same product
  → TTL guarantees release even if process crashes

Layer 3: Optimistic locking (version column + WHERE version=N)
  → Prevents lost-update between concurrent writers
  → Detects concurrent modification and retries

Layer 4: Inventory.quantity check (SELECT FOR UPDATE within $transaction)
  → Final atomic stock check before decrement
  → Row-level lock held only during transaction

Layer 5: InventoryReservation record with expiry
  → Tracks every reservation with TTL
  → Enables release on cancel/payment-fail/expiry

Layer 6: Reservation expiry worker
  → Async cleanup of orphaned reservations
  → Idempotent (safe to run multiple times)

Layer 7: InventorySnapshot + reconciliation
  → Daily snapshot for drift detection
  → Alerts on: actual quantity ≠ expected from movements

Any single layer may fail. The system remains correct.
```

### 3.3 Ten Absolute Constraints

```
1. Inventory writes are ALWAYS in $transaction.
   quantity decrement + reservation creation + movement log + event outbox = atomic unit.

2. Redis lock is acquired BEFORE $transaction begins.
   Lock released AFTER $transaction commits (not before, not within).

3. optimistic locking version check is INSIDE $transaction.
   UPDATE inventory SET quantity=quantity-qty, version=version+1 WHERE id=? AND version=?
   If 0 rows updated → ConcurrencyException → retry (max 3) → fail 409.

4. No quantity decrement without InventoryMovement.
   Every stock change creates an immutable InventoryMovement record. No exceptions.

5. Idempotency key stored BEFORE Redis lock acquired.
   If key exists → return cached result immediately (no lock, no DB).

6. Reservation expiry is idempotent.
   Running expiry job twice on same reservation = same outcome.

7. Release is idempotent.
   Releasing an already-released reservation is a no-op (not an error).

8. Seller ownership is two-hop verified (same as Sprint 2 pattern).
   userId → Business.ownerId → Business.id → Inventory.businessId.

9. Segment isolation on inventory queries.
   Buyer-facing: Inventory WHERE product.segment = :segment.
   Seller: own inventory only (businessId filter).

10. InventorySnapshot daily.
    Written by cron, never by application code.
    Used for drift detection and reconciliation only.
```

### 3.4 Segment Extensibility

```
InventoryEngine is segment-agnostic.
No TEXTILE/SPARE_PARTS conditional logic anywhere.

Segment-specific inventory rules live in SegmentInventoryPolicy model:
  segment, maxReservationTtlSeconds, maxReservationsPerUser,
  allowBackorder, allowVirtualStock, isActive

Sprint 3 seeds:
  TEXTILE:     { maxReservationTtl: 900s, maxReservationsPerUser: 5, allowBackorder: false }
  SPARE_PARTS: { maxReservationTtl: 900s, maxReservationsPerUser: 10, allowBackorder: false }

Future PHARMA (no code changes):
  PHARMA: { maxReservationTtl: 1800s, requiresLotTracking: true }
```

---

## SECTION 4: SCHEMA ADDITIONS (Sprint 3 Migration)

All additions are backward-compatible.

```prisma
// NEW MODEL: SegmentInventoryPolicy
model SegmentInventoryPolicy {
  id                      String  @id @default(cuid())
  segment                 Segment @unique
  maxReservationTtlSeconds Int    @default(900)
  maxReservationsPerUser  Int     @default(10)
  allowBackorder          Boolean @default(false)
  lowStockThresholdPercent Int    @default(20)  // triggers alert when qty < X% of total
  isActive                Boolean @default(true)
  createdAt               DateTime @default(now())
  updatedAt               DateTime @updatedAt

  @@map("segment_inventory_policies")
}

// ADDITIONS TO EXISTING Inventory MODEL (verify v4.3 has these, add if missing):
// version          Int      @default(0)          — optimistic locking
// damagedQty       Int      @default(0)
// incomingQty      Int      @default(0)
// lowStockThreshold Int     @default(10)
// isLowStock       Boolean  @default(false)

// InventorySnapshot (already in v4.3 — verify):
// id, inventoryId, quantity, reservedQty, damagedQty, snapshotDate

// ReservationStatus enum additions (verify in v4.3):
// ACTIVE, CONSUMED, EXPIRED, CANCELLED, RELEASED
```

### 4.1 Sprint 3 Migration SQL Additions

```sql
-- 1. SegmentInventoryPolicy table
CREATE TABLE segment_inventory_policies (
  id TEXT PRIMARY KEY,
  segment "Segment" UNIQUE NOT NULL,
  max_reservation_ttl_seconds INT NOT NULL DEFAULT 900,
  max_reservations_per_user INT NOT NULL DEFAULT 10,
  allow_backorder BOOLEAN NOT NULL DEFAULT false,
  low_stock_threshold_percent INT NOT NULL DEFAULT 20,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Autovacuum tuning for hot inventory tables
-- (Supplements Sprint 0 autovacuum settings with verify)
ALTER TABLE "Inventory" SET (
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_analyze_scale_factor = 0.01,
  autovacuum_vacuum_cost_delay = 2
);

ALTER TABLE "InventoryReservation" SET (
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_analyze_scale_factor = 0.01
);

ALTER TABLE "InventoryMovement" SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02
);

-- 3. Partial index for active reservations (expiry worker hot path)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invres_active_expiry
  ON "InventoryReservation" (expires_at ASC)
  WHERE status = 'ACTIVE';

-- 4. Composite covering index for reservation lookup by order
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invres_order_status
  ON "InventoryReservation" (order_id, status)
  WHERE status = 'ACTIVE';

-- 5. Inventory snapshot date index
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invsnap_inv_date
  ON "InventorySnapshot" (inventory_id, snapshot_date DESC);

-- 6. Low-stock alert index (supplements Sprint 0)
-- idx_inv_biz_low already exists from Sprint 0 — verify presence

-- 7. pg_stat_statements extension (for slow query monitoring)
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
```

---

## SECTION 5: REDIS ARCHITECTURE FOR INVENTORY

### 5.1 Complete Redis Key Registry

```
KEY: inv_idem:{idempotencyKey}
  Value: JSON serialized InventoryReservationResult
  TTL:   900s (matches max reservation TTL)
  Type:  STRING
  Owner: InventoryService.reserve()
  Notes: SET NX (atomic). Checked BEFORE acquiring lock.

KEY: inv_lock:{productId}
  Value: lockToken (crypto.randomUUID())
  TTL:   30s (safety TTL — guarantees release even on crash)
  Type:  STRING
  Owner: InventoryLockService
  Notes: SET NX EX 30. ONLY deleted by owner (compare lockToken before DEL).

KEY: inv_stock:{productId}
  Value: available quantity (integer as string)
  TTL:   30s (short — always refreshed from DB on lock acquisition)
  Type:  STRING
  Owner: InventoryService (read cache only)
  Notes: NOT used for authoritative stock decisions. For quick UI checks only.

KEY: inv_low_stock:{productId}
  Value: 1 (flag)
  TTL:   3600s (1 hour)
  Owner: LowStockAlertWorker
  Notes: Prevents duplicate low-stock alerts per hour.

KEY: inv_policy:{segment}
  Value: JSON serialized SegmentInventoryPolicy
  TTL:   300s
  Owner: InventoryPolicyService
  Notes: Cache for policy lookups per segment.
```

### 5.2 Lock Protocol (Critical — Read Carefully)

```
ACQUIRE:
  lockToken = crypto.randomUUID()
  result = SETNX inv_lock:{productId} lockToken EX 30
  if result === 0: throw LockUnavailableException

RELEASE (safe — only owner can release):
  currentValue = GET inv_lock:{productId}
  if currentValue === lockToken:
    DEL inv_lock:{productId}
  else:
    LOG.warn 'Lock already expired or taken by another request — safe to continue'

WHY lockToken:
  Without it, a slow process could DEL a lock acquired by a different fast process.
  With it, only the original lock holder can release.
  If lock has expired (TTL=30s), it releases automatically regardless.

REDIS DOWN SCENARIO:
  If Redis is unavailable, lock acquisition fails.
  InventoryService.reserve() falls back to DB-only path:
    - Skip Redis lock
    - Rely solely on optimistic locking (version column)
    - Increase retry count (max 5 on Redis-down path, vs 3 on normal path)
  This is acceptable degradation — slightly higher contention, same correctness guarantee.
  Log CRITICAL alert when Redis is down and inventory writes are happening.
```

---

## SECTION 6: MODULE STRUCTURE

```
apps/api/src/modules/
└── inventory/
    ├── inventory.module.ts
    │
    ├── inventory.service.ts           ← Orchestration layer (thin)
    ├── inventory-reserve.service.ts   ← Reserve logic (critical path)
    ├── inventory-release.service.ts   ← Release logic (compensation path)
    ├── inventory-update.service.ts    ← Seller stock update
    ├── inventory-query.service.ts     ← Read path (buyer + seller)
    ├── inventory-policy.service.ts    ← SegmentInventoryPolicy lookup
    ├── inventory-lock.service.ts      ← Redis distributed lock abstraction
    ├── inventory-reconcile.service.ts ← Drift detection + snapshot
    │
    ├── repositories/
    │   ├── inventory.repository.ts
    │   ├── reservation.repository.ts
    │   ├── movement.repository.ts         ← APPEND-ONLY (no update/delete)
    │   ├── snapshot.repository.ts         ← APPEND-ONLY
    │   └── segment-inventory-policy.repository.ts
    │
    ├── workers/
    │   ├── reservation-expiry.worker.ts   ← Cleans expired ACTIVE reservations
    │   ├── low-stock-alert.worker.ts      ← Fires when isLowStock=true
    │   └── inventory-snapshot.worker.ts  ← Daily snapshot cron
    │
    ├── inventory.controller.ts
    │
    ├── dto/                               ← (also in packages/types)
    │   └── index.ts
    │
    └── tests/
        ├── inventory-reserve.service.spec.ts   ← CONCURRENCY TESTS HERE
        ├── inventory-release.service.spec.ts
        ├── inventory-lock.service.spec.ts
        ├── reservation-expiry.worker.spec.ts
        └── inventory.controller.spec.ts

packages/types/src/inventory/
  ├── inventory.schemas.ts             ← Zod DTOs
  └── index.ts
```

### 6.1 Module Boundary Rules

```
InventoryModule OWNS: Inventory, InventoryReservation, InventoryMovement, InventorySnapshot
InventoryModule imports: ProductsService (for product validation), BusinessQueryService (ownership)
InventoryModule DOES NOT import: OrderRepository, PaymentRepository

OrderModule (Sprint 4) imports: InventoryService (via InventoryModule exports)
OrderModule NEVER: writes to Inventory directly
OrderModule NEVER: writes to InventoryMovement directly

Reservation release triggered by:
  - OrderService (cancel) → calls InventoryService.release(reservationId, reason: 'ORDER_CANCELLED')
  - PaymentService (fail) → calls InventoryService.release(reservationId, reason: 'PAYMENT_FAILED')
  - ReservationExpiryWorker → calls InventoryService.expireReservations()

All release calls are idempotent — releasing an already-released reservation is a no-op.
```

---

## SECTION 7: DETAILED IMPLEMENTATION

### 7.1 InventoryLockService

```typescript
// apps/api/src/modules/inventory/inventory-lock.service.ts

@Injectable()
export class InventoryLockService {
  private readonly logger = new Logger(InventoryLockService.name);
  static readonly LOCK_TTL_SECONDS = 30;
  static readonly LOCK_KEY_PREFIX = 'inv_lock:';

  constructor(private readonly redis: RedisService) {}

  /**
   * Acquire distributed lock for an inventory record.
   * Returns lockToken (UUID) on success.
   * Throws LockUnavailableException on failure.
   *
   * CRITICAL: Uses SETNX with TTL — atomic, no race condition.
   * lockToken ensures only the holder can release.
   */
  async acquire(productId: string): Promise<string> {
    const lockToken = crypto.randomUUID();
    const key = `${InventoryLockService.LOCK_KEY_PREFIX}${productId}`;

    // SET NX EX — atomic set-if-not-exists with expiry
    const result = await this.redis.set(key, lockToken, 'EX', InventoryLockService.LOCK_TTL_SECONDS, 'NX');

    if (result === null) {
      // Lock already held by another request
      throw new ConflictException({
        code: 'INVENTORY_LOCK_UNAVAILABLE',
        message: 'Product is being updated. Please retry in a moment.',
        details: { retryAfterMs: 200 },
      });
    }

    return lockToken;
  }

  /**
   * Release lock — only if still owned by this token.
   * Lua script ensures atomic compare-and-delete.
   * Safe to call even if lock has expired.
   */
  async release(productId: string, lockToken: string): Promise<void> {
    const key = `${InventoryLockService.LOCK_KEY_PREFIX}${productId}`;

    // Lua ensures atomicity: GET + conditional DEL
    const luaScript = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;

    const result = await this.redis.eval(luaScript, 1, key, lockToken) as number;

    if (result === 0) {
      this.logger.warn(
        { productId, lockToken: lockToken.slice(0, 8) },
        'Lock already expired or taken — safe to continue',
      );
    }
  }

  /**
   * Execute a function within a distributed lock.
   * Guarantees release in finally block.
   */
  async withLock<T>(productId: string, fn: (lockToken: string) => Promise<T>): Promise<T> {
    const lockToken = await this.acquire(productId);
    try {
      return await fn(lockToken);
    } finally {
      await this.release(productId, lockToken).catch((err: Error) => {
        this.logger.error({ productId, error: err.message }, 'Lock release failed — TTL will handle cleanup');
      });
    }
  }
}
```

### 7.2 InventoryRepository

```typescript
// apps/api/src/modules/inventory/repositories/inventory.repository.ts

@Injectable()
export class InventoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find inventory for a product — with SELECT FOR UPDATE in transaction context.
   * CRITICAL: tx parameter is REQUIRED for all stock mutations.
   */
  async findByProductIdWithLock(productId: string, tx: PrismaTransactionClient): Promise<Inventory | null> {
    // Raw query for FOR UPDATE (Prisma doesn't support it natively)
    const result = await tx.$queryRaw<Inventory[]>`
      SELECT * FROM "Inventory"
      WHERE product_id = ${productId}
      LIMIT 1
      FOR UPDATE
    `;
    return result[0] ?? null;
  }

  async findByProductId(productId: string): Promise<Inventory | null> {
    return this.prisma.inventory.findFirst({ where: { productId } });
  }

  async findByBusinessId(businessId: string, segment: Segment, pagination: CursorPagination): Promise<Inventory[]> {
    return this.prisma.inventory.findMany({
      where: {
        businessId,
        product: { segment, isDeleted: false },
      },
      include: { product: { select: { name: true, slug: true, segment: true, basePrice: true } } },
      orderBy: [{ isLowStock: 'desc' }, { updatedAt: 'desc' }],
      take: pagination.limit,
      cursor: pagination.cursor ? { id: pagination.cursor } : undefined,
      skip: pagination.cursor ? 1 : 0,
    });
  }

  /**
   * Atomic quantity decrement with optimistic locking.
   * Returns number of affected rows. 0 = version mismatch (concurrent modification).
   * MUST be called within $transaction.
   */
  async decrementQuantityWithVersion(
    inventoryId: string,
    qty: number,
    currentVersion: number,
    tx: PrismaTransactionClient,
  ): Promise<number> {
    const result = await tx.inventory.updateMany({
      where: {
        id: inventoryId,
        version: currentVersion,
        quantity: { gte: qty }, // safety check — should never fail if lock is held
      },
      data: {
        quantity: { decrement: qty },
        reservedQty: { increment: qty },
        version: { increment: 1 },
        updatedAt: new Date(),
      },
    });
    return result.count; // 0 = version conflict
  }

  /**
   * Atomic quantity increment (on release).
   * Also decrement reservedQty.
   */
  async incrementQuantityWithVersion(
    inventoryId: string,
    qty: number,
    currentVersion: number,
    tx: PrismaTransactionClient,
  ): Promise<number> {
    const result = await tx.inventory.updateMany({
      where: { id: inventoryId, version: currentVersion },
      data: {
        quantity: { increment: qty },
        reservedQty: { decrement: qty },
        version: { increment: 1 },
        updatedAt: new Date(),
      },
    });
    return result.count;
  }

  async updateLowStockFlag(inventoryId: string, isLowStock: boolean): Promise<void> {
    await this.prisma.inventory.update({
      where: { id: inventoryId },
      data: { isLowStock, updatedAt: new Date() },
    });
  }

  async upsertForProduct(data: CreateInventoryInput): Promise<Inventory> {
    return this.prisma.inventory.upsert({
      where: { productId: data.productId },
      create: data,
      update: {
        quantity: data.quantity,
        lowStockThreshold: data.lowStockThreshold,
        updatedAt: new Date(),
        version: { increment: 1 },
      },
    });
  }
}
```

### 7.3 MovementRepository (Append-Only)

```typescript
// apps/api/src/modules/inventory/repositories/movement.repository.ts

@Injectable()
export class MovementRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * APPEND ONLY. No update/delete methods exist on this repository.
   * Every stock mutation creates an immutable movement record.
   */
  async create(data: CreateMovementInput, tx?: PrismaTransactionClient): Promise<void> {
    const client = tx ?? this.prisma;
    await client.inventoryMovement.create({
      data: {
        inventoryId: data.inventoryId,
        type: data.type,
        quantity: data.quantity,
        orderId: data.orderId ?? undefined,
        returnId: data.returnId ?? undefined,
        reason: data.reason ?? undefined,
        createdBy: data.createdBy,
      },
    });
  }

  // READ ONLY methods below — no mutation methods
  async findByInventoryId(inventoryId: string, pagination: CursorPagination): Promise<InventoryMovement[]> {
    return this.prisma.inventoryMovement.findMany({
      where: { inventoryId },
      orderBy: { createdAt: 'desc' },
      take: pagination.limit,
      cursor: pagination.cursor ? { id: pagination.cursor } : undefined,
      skip: pagination.cursor ? 1 : 0,
    });
  }
}
```

### 7.4 ReservationRepository

```typescript
// apps/api/src/modules/inventory/repositories/reservation.repository.ts

@Injectable()
export class ReservationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateReservationInput, tx: PrismaTransactionClient): Promise<InventoryReservation> {
    return tx.inventoryReservation.create({
      data: {
        inventoryId: data.inventoryId,
        cartId: data.cartId ?? undefined,
        orderId: data.orderId ?? undefined,
        quantity: data.quantity,
        status: 'ACTIVE',
        expiresAt: data.expiresAt,
      },
    });
  }

  async findActiveByOrderId(orderId: string): Promise<InventoryReservation[]> {
    return this.prisma.inventoryReservation.findMany({
      where: { orderId, status: 'ACTIVE' },
      include: { inventory: true },
    });
  }

  async findActiveByCartId(cartId: string): Promise<InventoryReservation[]> {
    return this.prisma.inventoryReservation.findMany({
      where: { cartId, status: 'ACTIVE' },
      include: { inventory: true },
    });
  }

  /**
   * Mark reservation as consumed (order confirmed, payment captured).
   * Called within $transaction alongside order confirmation.
   */
  async consume(reservationId: string, tx: PrismaTransactionClient): Promise<InventoryReservation> {
    return tx.inventoryReservation.update({
      where: { id: reservationId, status: 'ACTIVE' },
      data: { status: 'CONSUMED', updatedAt: new Date() },
    });
  }

  /**
   * Release a reservation — idempotent.
   * If already released/expired/consumed → no-op, no error.
   */
  async release(reservationId: string, status: 'RELEASED' | 'EXPIRED' | 'CANCELLED', tx?: PrismaTransactionClient): Promise<boolean> {
    const client = tx ?? this.prisma;
    const result = await client.inventoryReservation.updateMany({
      where: { id: reservationId, status: 'ACTIVE' }, // only ACTIVE can be released
      data: { status, updatedAt: new Date() },
    });
    return result.count > 0; // false = already released (idempotent)
  }

  /**
   * Find all ACTIVE reservations past their expiry.
   * Used by ReservationExpiryWorker.
   * CRITICAL: ordered by expiresAt ASC for batch processing efficiency.
   */
  async findExpiredActive(batchSize = 100): Promise<InventoryReservation[]> {
    return this.prisma.inventoryReservation.findMany({
      where: {
        status: 'ACTIVE',
        expiresAt: { lt: new Date() },
      },
      orderBy: { expiresAt: 'asc' },
      take: batchSize,
      include: { inventory: true },
    });
  }

  /**
   * Count active reservations per user per segment.
   * Enforces SegmentInventoryPolicy.maxReservationsPerUser.
   */
  async countActiveByUserAndSegment(userId: string, segment: Segment): Promise<number> {
    return this.prisma.inventoryReservation.count({
      where: {
        status: 'ACTIVE',
        expiresAt: { gt: new Date() },
        inventory: {
          product: { segment },
        },
        // Note: userId on reservation requires orderId/cartId → User chain
        // Sprint 3: count via cartId or orderId lookup
      },
    });
  }
}
```

### 7.5 InventoryReserveService (The Critical Path)

```typescript
// apps/api/src/modules/inventory/inventory-reserve.service.ts

export interface ReserveStockInput {
  productId: string;
  quantity: number;
  requestedBy: string;             // userId
  idempotencyKey: string;          // from header — REQUIRED
  cartId?: string;
  orderId?: string;
  segment: Segment;                // from user token
}

export interface ReserveStockResult {
  reservationId: string;
  inventoryId: string;
  productId: string;
  quantity: number;
  expiresAt: string;               // ISO 8601
  status: 'RESERVED';
}

@Injectable()
export class InventoryReserveService {
  private readonly logger = new Logger(InventoryReserveService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly lockService: InventoryLockService,
    private readonly inventoryRepo: InventoryRepository,
    private readonly reservationRepo: ReservationRepository,
    private readonly movementRepo: MovementRepository,
    private readonly policyService: InventoryPolicyService,
    private readonly metrics: InventoryMetrics,
  ) {}

  /**
   * Reserve stock atomically.
   *
   * CONCURRENCY SAFETY CHAIN:
   * 1. Idempotency key → return cached result if duplicate request
   * 2. Redis distributed lock → serialize concurrent requests for same product
   * 3. $transaction with optimistic locking → guarantee atomic decrement
   * 4. InventoryMovement → immutable audit trail
   * 5. EventOutbox → async downstream consumers
   *
   * All retries are idempotent due to step 1.
   */
  async reserve(input: ReserveStockInput): Promise<ReserveStockResult> {
    const startTime = Date.now();

    // STEP 1: Idempotency check (BEFORE any lock or DB operation)
    const idempotencyKey = `inv_idem:${input.idempotencyKey}`;
    const cached = await this.redis.get(idempotencyKey);
    if (cached) {
      this.metrics.idempotencyHit();
      this.logger.log({ key: input.idempotencyKey }, 'Idempotency hit — returning cached reservation');
      return JSON.parse(cached) as ReserveStockResult;
    }

    // STEP 2: Load policy for segment
    const policy = await this.policyService.getPolicy(input.segment);
    const reservationTtl = policy.maxReservationTtlSeconds;

    // STEP 3: Acquire distributed lock
    let lockToken: string;
    try {
      lockToken = await this.lockService.acquire(input.productId);
    } catch {
      this.metrics.lockUnavailable(input.productId);
      throw new ConflictException({
        code: 'INVENTORY_LOCK_UNAVAILABLE',
        message: 'This product is being updated. Please retry in a moment.',
        details: { retryAfterMs: 200 },
      });
    }

    try {
      // STEP 4: Execute reservation within $transaction
      const result = await this.executeReservation(input, reservationTtl);

      // STEP 5: Store idempotency result AFTER success
      await this.redis.setex(idempotencyKey, reservationTtl, JSON.stringify(result));

      this.metrics.reservationSuccess(input.segment, Date.now() - startTime);
      this.logger.log(
        { productId: input.productId, qty: input.quantity, reservationId: result.reservationId },
        'Stock reserved successfully',
      );
      return result;

    } catch (error) {
      const err = error as Error;
      this.metrics.reservationFailure(input.segment, err.constructor.name);
      throw error;
    } finally {
      await this.lockService.release(input.productId, lockToken);
    }
  }

  /**
   * Inner reservation logic — called within distributed lock.
   * Retries on ConcurrencyException (optimistic locking conflict) up to MAX_RETRIES.
   */
  private async executeReservation(
    input: ReserveStockInput,
    reservationTtl: number,
    attempt = 1,
  ): Promise<ReserveStockResult> {
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = [100, 200, 400]; // exponential backoff

    try {
      return await this.executeReservationTransaction(input, reservationTtl);
    } catch (error) {
      if (error instanceof ConcurrencyException && attempt <= MAX_RETRIES) {
        this.metrics.optimisticLockRetry(attempt);
        this.logger.warn(
          { productId: input.productId, attempt },
          'Optimistic lock conflict — retrying',
        );
        await sleep(RETRY_DELAY_MS[attempt - 1]);
        return this.executeReservation(input, reservationTtl, attempt + 1);
      }
      throw error;
    }
  }

  private async executeReservationTransaction(
    input: ReserveStockInput,
    reservationTtl: number,
  ): Promise<ReserveStockResult> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Load inventory with FOR UPDATE (row-level lock within transaction)
      const inventory = await this.inventoryRepo.findByProductIdWithLock(input.productId, tx);

      if (!inventory) {
        throw new NotFoundException({ code: 'INVENTORY_NOT_FOUND', message: 'Inventory record not found.' });
      }

      // 2. Check available quantity
      const available = inventory.quantity;
      if (available < input.quantity) {
        throw new UnprocessableEntityException({
          code: 'INSUFFICIENT_STOCK',
          message: `Only ${available} unit(s) available. Requested ${input.quantity}.`,
          details: { available, requested: input.quantity },
        });
      }

      // 3. Optimistic locking decrement
      const updated = await this.inventoryRepo.decrementQuantityWithVersion(
        inventory.id,
        input.quantity,
        inventory.version,
        tx,
      );

      if (updated === 0) {
        // Version mismatch — concurrent modification detected
        throw new ConcurrencyException('Concurrent inventory modification detected');
      }

      // 4. Create InventoryReservation
      const expiresAt = new Date(Date.now() + reservationTtl * 1000);
      const reservation = await this.reservationRepo.create({
        inventoryId: inventory.id,
        cartId: input.cartId,
        orderId: input.orderId,
        quantity: input.quantity,
        expiresAt,
      }, tx);

      // 5. Create InventoryMovement (APPEND-ONLY audit)
      await this.movementRepo.create({
        inventoryId: inventory.id,
        type: 'RESERVATION_HELD',
        quantity: input.quantity,
        orderId: input.orderId,
        reason: `Reserved for ${input.cartId ? 'cart' : 'order'} — idempotency: ${input.idempotencyKey.slice(0, 8)}`,
        createdBy: input.requestedBy,
      }, tx);

      // 6. Check and update low-stock flag (within transaction)
      const newQuantity = inventory.quantity - input.quantity;
      const policy = await this.policyService.getPolicyRaw(input.segment);
      const isNowLowStock = newQuantity <= inventory.lowStockThreshold;
      if (isNowLowStock !== inventory.isLowStock) {
        await tx.inventory.update({
          where: { id: inventory.id },
          data: { isLowStock: isNowLowStock },
        });
      }

      // 7. EventOutbox — async notification, search reindex, analytics
      const auditMonth = currentAuditMonth();
      await tx.eventOutbox.create({
        data: {
          eventType: 'InventoryReserved',
          payload: {
            productId: input.productId,
            inventoryId: inventory.id,
            reservationId: reservation.id,
            quantity: input.quantity,
            remainingStock: newQuantity,
            isLowStock: isNowLowStock,
          },
          deduplicationKey: `inv-reserved-${reservation.id}`, // deterministic
          eventMonth: auditMonth,
          status: 'PENDING',
          eventVersion: '1.0',
          schemaVersion: '4.3',
        },
      });

      // 8. Trigger low-stock alert if newly low
      if (isNowLowStock && !inventory.isLowStock) {
        await tx.eventOutbox.create({
          data: {
            eventType: 'InventoryLowStock',
            payload: { productId: input.productId, inventoryId: inventory.id, quantity: newQuantity },
            deduplicationKey: `inv-low-stock-${inventory.id}-${auditMonth}`, // monthly dedup
            eventMonth: auditMonth,
            status: 'PENDING',
            eventVersion: '1.0',
            schemaVersion: '4.3',
          },
        });
      }

      return {
        reservationId: reservation.id,
        inventoryId: inventory.id,
        productId: input.productId,
        quantity: input.quantity,
        expiresAt: expiresAt.toISOString(),
        status: 'RESERVED' as const,
      };
    }, {
      isolationLevel: 'ReadCommitted', // Sufficient with FOR UPDATE on targeted row
      timeout: 5000, // 5s transaction timeout
    });
  }
}
```

### 7.6 InventoryReleaseService (The Compensation Path)

```typescript
// apps/api/src/modules/inventory/inventory-release.service.ts

export type ReleaseReason = 'ORDER_CANCELLED' | 'PAYMENT_FAILED' | 'CART_EXPIRED' | 'RESERVATION_EXPIRED' | 'MANUAL_RELEASE';

export interface ReleaseResult {
  released: boolean;
  reservationId: string;
  reason: string;
  alreadyReleased?: boolean; // idempotent — was already in terminal state
}

@Injectable()
export class InventoryReleaseService {
  private readonly logger = new Logger(InventoryReleaseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryRepo: InventoryRepository,
    private readonly reservationRepo: ReservationRepository,
    private readonly movementRepo: MovementRepository,
    private readonly metrics: InventoryMetrics,
  ) {}

  /**
   * Release a specific reservation.
   * IDEMPOTENT: Calling multiple times on same reservation = same result.
   * SAFE: If reservation already in terminal state, returns alreadyReleased=true.
   */
  async release(
    reservationId: string,
    reason: ReleaseReason,
    actorId: string,
    tx?: PrismaTransactionClient,
  ): Promise<ReleaseResult> {
    // Idempotency via DB state check
    const reservation = await (tx ?? this.prisma).inventoryReservation.findUnique({
      where: { id: reservationId },
      include: { inventory: true },
    });

    if (!reservation) {
      throw new NotFoundException({ code: 'RESERVATION_NOT_FOUND', message: 'Reservation not found.' });
    }

    // Terminal states — already released, idempotent return
    const terminalStates: ReservationStatus[] = ['RELEASED', 'EXPIRED', 'CANCELLED', 'CONSUMED'];
    if (terminalStates.includes(reservation.status as ReservationStatus)) {
      this.logger.log({ reservationId, currentStatus: reservation.status }, 'Release idempotent — already in terminal state');
      return { released: false, reservationId, reason, alreadyReleased: true };
    }

    // Execute release in transaction
    const executeRelease = async (txClient: PrismaTransactionClient): Promise<void> => {
      // 1. Mark reservation as released (idempotent via updateMany with status=ACTIVE filter)
      const statusMap: Record<ReleaseReason, ReservationStatus> = {
        ORDER_CANCELLED: 'CANCELLED',
        PAYMENT_FAILED: 'RELEASED',
        CART_EXPIRED: 'EXPIRED',
        RESERVATION_EXPIRED: 'EXPIRED',
        MANUAL_RELEASE: 'RELEASED',
      };
      const newStatus = statusMap[reason];

      const released = await this.reservationRepo.release(reservationId, newStatus as any, txClient);
      if (!released) {
        // Concurrent release won — idempotent
        return;
      }

      // 2. Increment inventory quantity (with retry on version conflict)
      let released_count = 0;
      let attempt = 0;
      const maxAttempts = 3;

      while (attempt < maxAttempts) {
        const current = await this.inventoryRepo.findByProductIdWithLock(reservation.inventory.productId, txClient);
        if (!current) break;

        const count = await this.inventoryRepo.incrementQuantityWithVersion(
          current.id,
          reservation.quantity,
          current.version,
          txClient,
        );

        if (count > 0) {
          released_count = count;
          break;
        }
        attempt++;
        // Brief wait before retry within transaction (acceptable for release path)
        await sleep(50 * attempt);
      }

      if (released_count === 0) {
        this.logger.error({ reservationId, productId: reservation.inventory.productId }, 'Failed to increment inventory — manual reconciliation required');
        // Don't throw — reservation IS released. Inventory will reconcile via snapshot.
        // This is an edge case logged for ops team.
      }

      // 3. InventoryMovement (append-only)
      await this.movementRepo.create({
        inventoryId: reservation.inventoryId,
        type: 'RESERVATION_RELEASED',
        quantity: reservation.quantity,
        orderId: reservation.orderId ?? undefined,
        reason: `${reason} — reservation ${reservationId.slice(0, 8)}`,
        createdBy: actorId,
      }, txClient);

      // 4. EventOutbox
      await txClient.eventOutbox.create({
        data: {
          eventType: 'InventoryReleased',
          payload: { reservationId, reason, quantity: reservation.quantity },
          deduplicationKey: `inv-released-${reservationId}`, // deterministic
          eventMonth: currentAuditMonth(),
          status: 'PENDING',
          eventVersion: '1.0',
          schemaVersion: '4.3',
        },
      });

      // 5. Re-evaluate low-stock flag
      const updated = await txClient.inventory.findUnique({ where: { id: reservation.inventoryId } });
      if (updated && updated.isLowStock) {
        const isStillLow = updated.quantity <= updated.lowStockThreshold;
        if (!isStillLow) {
          await txClient.inventory.update({
            where: { id: reservation.inventoryId },
            data: { isLowStock: false },
          });
        }
      }
    };

    if (tx) {
      // Called within existing transaction (order cancel, payment fail)
      await executeRelease(tx);
    } else {
      // Standalone release (expiry worker, standalone cancel)
      await this.prisma.$transaction(executeRelease, { timeout: 5000 });
    }

    this.metrics.reservationReleased(reason);
    this.logger.log({ reservationId, reason }, 'Reservation released');
    return { released: true, reservationId, reason };
  }

  /**
   * Release all active reservations for an order.
   * Called on order cancellation.
   * Each reservation released individually — idempotent.
   */
  async releaseAllForOrder(orderId: string, reason: ReleaseReason, actorId: string): Promise<ReleaseResult[]> {
    const reservations = await this.reservationRepo.findActiveByOrderId(orderId);
    return Promise.all(reservations.map(r => this.release(r.id, reason, actorId)));
  }
}
```

### 7.7 InventoryUpdateService (Seller Stock Management)

```typescript
// apps/api/src/modules/inventory/inventory-update.service.ts

@Injectable()
export class InventoryUpdateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryRepo: InventoryRepository,
    private readonly movementRepo: MovementRepository,
    private readonly businessQueryService: BusinessQueryService,
    private readonly metrics: InventoryMetrics,
    private readonly logger: Logger,
  ) {}

  /**
   * Seller updates stock quantity.
   * ATOMIC: quantity update + movement log + event outbox.
   * OWNERSHIP: verified two-hop (userId → businessId → inventoryId).
   */
  async updateStock(
    productId: string,
    dto: UpdateInventoryDto,
    userId: string,
  ): Promise<InventoryResponse> {
    // Two-hop ownership verification
    const business = await this.businessQueryService.findByOwnerId(userId);
    if (!business) throw new PreconditionFailedException({ code: 'NO_BUSINESS', message: 'Complete onboarding first.' });

    const inventory = await this.inventoryRepo.findByProductId(productId);
    if (!inventory) throw new NotFoundException({ code: 'INVENTORY_NOT_FOUND' });
    if (inventory.businessId !== business.id) throw new ForbiddenException({ code: 'FORBIDDEN' });

    const oldQuantity = inventory.quantity;
    const newQuantity = dto.quantity;
    const delta = newQuantity - oldQuantity;

    await this.prisma.$transaction(async (tx) => {
      // Update with optimistic locking
      const result = await tx.inventory.updateMany({
        where: { id: inventory.id, version: inventory.version },
        data: {
          quantity: newQuantity,
          lowStockThreshold: dto.lowStockThreshold ?? inventory.lowStockThreshold,
          isLowStock: newQuantity <= (dto.lowStockThreshold ?? inventory.lowStockThreshold),
          version: { increment: 1 },
          updatedAt: new Date(),
        },
      });

      if (result.count === 0) {
        throw new ConflictException({ code: 'CONCURRENT_UPDATE', message: 'Inventory updated concurrently. Please retry.' });
      }

      // InventoryMovement (append-only)
      const movementType: InventoryMovementType = delta > 0 ? 'STOCK_ADDED' : delta < 0 ? 'STOCK_REMOVED' : 'ADJUSTMENT';
      await this.movementRepo.create({
        inventoryId: inventory.id,
        type: movementType,
        quantity: Math.abs(delta),
        reason: dto.reason ?? 'Seller manual update',
        createdBy: userId,
      }, tx);

      // EventOutbox
      await tx.eventOutbox.create({
        data: {
          eventType: 'InventoryChanged',
          payload: { productId, inventoryId: inventory.id, oldQuantity, newQuantity, delta },
          deduplicationKey: `inv-changed-${inventory.id}-v${inventory.version + 1}`,
          eventMonth: currentAuditMonth(),
          status: 'PENDING',
          eventVersion: '1.0',
          schemaVersion: '4.3',
        },
      });

      // Cache invalidation
      await tx.cacheInvalidationEvent.create({
        data: {
          eventType: 'InventoryChanged',
          entityType: 'Inventory',
          entityId: inventory.id,
        },
      });
    }, { timeout: 5000 });

    this.metrics.stockUpdated(delta > 0 ? 'increase' : 'decrease');
    return this.toResponse(await this.inventoryRepo.findByProductId(productId));
  }
}
```

### 7.8 ReservationExpiryWorker

```typescript
// apps/api/src/modules/inventory/workers/reservation-expiry.worker.ts

@Processor(INVENTORY_QUEUE)
export class ReservationExpiryWorker extends WorkerHost {
  private readonly logger = new Logger(ReservationExpiryWorker.name);

  constructor(
    private readonly reservationRepo: ReservationRepository,
    private readonly releaseService: InventoryReleaseService,
    private readonly metrics: InventoryMetrics,
  ) { super(); }

  /**
   * Cron: every 5 minutes.
   * Finds all ACTIVE reservations past expiresAt.
   * Releases each one idempotently.
   *
   * SAFETY:
   * - Each reservation released in isolation (failure of one doesn't block others)
   * - Idempotent (re-running finds nothing if already processed)
   * - Never touches non-ACTIVE reservations
   * - Logs every release for ops visibility
   */
  @Process('expire-reservations')
  async handleExpiryJob(job: Job): Promise<{ processed: number; failed: number }> {
    this.logger.log('Starting reservation expiry scan');
    const BATCH_SIZE = 100;
    let processed = 0;
    let failed = 0;

    const expired = await this.reservationRepo.findExpiredActive(BATCH_SIZE);

    for (const reservation of expired) {
      try {
        await this.releaseService.release(
          reservation.id,
          'RESERVATION_EXPIRED',
          'SYSTEM',
        );
        processed++;
      } catch (error) {
        const err = error as Error;
        failed++;
        this.logger.error(
          { reservationId: reservation.id, error: err.message },
          'Failed to expire reservation — will retry on next run',
        );
        // Continue processing others — don't let one failure block all
      }
    }

    this.metrics.expiredReservationsProcessed(processed, failed);
    this.logger.log({ processed, failed, batchSize: expired.length }, 'Expiry scan complete');

    // If batch was full, there may be more — schedule immediate re-run
    if (expired.length === BATCH_SIZE) {
      await job.queue.add('expire-reservations', {}, { delay: 1000 }); // 1s re-run
    }

    return { processed, failed };
  }

  /**
   * Low-stock alert handler.
   * Triggered by InventoryLowStock EventOutbox event.
   */
  @Process('low-stock-alert')
  async handleLowStockAlert(job: Job<{ productId: string; inventoryId: string; quantity: number }>): Promise<void> {
    const { productId, inventoryId } = job.data;

    // Deduplicate: don't spam alerts (check Redis TTL key)
    const dedupKey = `inv_low_stock:${inventoryId}`;
    const exists = await this.redis.exists(dedupKey);
    if (exists) {
      this.logger.log({ inventoryId }, 'Low stock alert already sent recently — skipping');
      return;
    }

    // Mark dedup (1h window)
    await this.redis.setex(dedupKey, 3600, '1');

    // Enqueue notification (Sprint 6 notification queue picks this up)
    await job.queue.add('notify-low-stock', { productId, inventoryId }, {});
    this.logger.log({ productId, inventoryId, quantity: job.data.quantity }, 'Low stock alert enqueued');
  }
}
```

### 7.9 InventorySnapshotWorker (Daily Reconciliation)

```typescript
// apps/api/src/modules/inventory/workers/inventory-snapshot.worker.ts

@Processor(INVENTORY_QUEUE)
export class InventorySnapshotWorker extends WorkerHost {
  private readonly logger = new Logger(InventorySnapshotWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: InventoryMetrics,
  ) { super(); }

  /**
   * Cron: daily at 2 AM.
   * Creates InventorySnapshot for ALL inventory records.
   * Used for drift detection and manual reconciliation.
   *
   * NEVER modifies Inventory. Read-only snapshot.
   * Each snapshot is append-only — no updates.
   */
  @Process('daily-snapshot')
  async handleDailySnapshot(job: Job): Promise<{ snapshotCount: number }> {
    this.logger.log('Starting daily inventory snapshot');
    const snapshotDate = new Date();
    let snapshotCount = 0;
    const BATCH_SIZE = 500;
    let lastId: string | undefined;

    // Paginated snapshot (avoids loading all inventory into memory)
    while (true) {
      const batch = await this.prisma.inventory.findMany({
        take: BATCH_SIZE,
        cursor: lastId ? { id: lastId } : undefined,
        skip: lastId ? 1 : 0,
        orderBy: { id: 'asc' },
      });

      if (batch.length === 0) break;

      // Batch insert snapshots
      await this.prisma.inventorySnapshot.createMany({
        data: batch.map(inv => ({
          inventoryId: inv.id,
          quantity: inv.quantity,
          reservedQty: inv.reservedQty,
          damagedQty: inv.damagedQty,
          snapshotDate,
        })),
        skipDuplicates: true,
      });

      snapshotCount += batch.length;
      lastId = batch[batch.length - 1].id;

      if (batch.length < BATCH_SIZE) break;
    }

    // Drift detection: compare with previous snapshot
    await this.detectDrift(snapshotDate);

    this.metrics.snapshotCompleted(snapshotCount);
    this.logger.log({ snapshotCount }, 'Daily snapshot complete');
    return { snapshotCount };
  }

  /**
   * Drift detection: compare today's snapshot with yesterday's.
   * Alert if quantity changed without corresponding InventoryMovements.
   * This catches any bugs or direct DB manipulation.
   */
  private async detectDrift(snapshotDate: Date): Promise<void> {
    const yesterday = new Date(snapshotDate);
    yesterday.setDate(yesterday.getDate() - 1);

    // Find inventory items where quantity delta doesn't match movement sum
    const drifted = await this.prisma.$queryRaw<DriftRecord[]>`
      SELECT
        t.inventory_id,
        t.today_qty,
        y.yesterday_qty,
        (t.today_qty - y.yesterday_qty) AS actual_delta,
        COALESCE(m.movement_sum, 0) AS movement_sum
      FROM (
        SELECT inventory_id, quantity AS today_qty FROM "InventorySnapshot"
        WHERE DATE(snapshot_date) = DATE(${snapshotDate})
      ) t
      JOIN (
        SELECT inventory_id, quantity AS yesterday_qty FROM "InventorySnapshot"
        WHERE DATE(snapshot_date) = DATE(${yesterday})
      ) y ON t.inventory_id = y.inventory_id
      LEFT JOIN (
        SELECT inventory_id,
          SUM(CASE WHEN type IN ('STOCK_ADDED','RETURN_RECEIVED','ADJUSTMENT','TRANSFER_IN') THEN quantity
                   WHEN type IN ('STOCK_REMOVED','ORDER_FULFILLED','DAMAGED','TRANSFER_OUT') THEN -quantity
                   WHEN type IN ('RESERVATION_HELD') THEN 0 -- reserved doesn't change available
                   ELSE 0 END) AS movement_sum
        FROM "InventoryMovement"
        WHERE created_at >= ${yesterday} AND created_at < ${snapshotDate}
        GROUP BY inventory_id
      ) m ON t.inventory_id = m.inventory_id
      WHERE ABS((t.today_qty - y.yesterday_qty) - COALESCE(m.movement_sum, 0)) > 0
    `;

    if (drifted.length > 0) {
      this.logger.error({ driftedCount: drifted.length, samples: drifted.slice(0, 5) }, 'INVENTORY DRIFT DETECTED — manual review required');
      this.metrics.driftDetected(drifted.length);
    }
  }
}
```

### 7.10 InventoryController

```typescript
// apps/api/src/modules/inventory/inventory.controller.ts

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  /**
   * GET /api/v1/inventory/:productId
   * @Public() — returns available quantity to buyers (no authentication needed for stock check)
   * Returns: availableQty only (not reserved, not damaged — buyer-facing)
   */
  @Get(':productId')
  @Public()
  async getAvailability(
    @Param('productId') productId: string,
    @Query('segment') segment: string,
  ): Promise<{ success: true; data: InventoryAvailabilityResponse }> {
    if (!segment) throw new BadRequestException({ code: 'SEGMENT_REQUIRED' });
    const result = await this.inventoryService.getAvailability(productId, segment as Segment);
    return { success: true, data: result };
  }

  /**
   * GET /api/v1/inventory/seller
   * Seller's inventory management view (all products + stock levels)
   */
  @Get('seller')
  @Roles(UserRole.SELLER, UserRole.SELLER_MANAGER)
  async getSellerInventory(
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(InventoryListQuerySchema)) query: InventoryListQueryDto,
  ): Promise<{ success: true; data: PaginatedInventoryResponse }> {
    const result = await this.inventoryService.getSellerInventory(user.sub, user.segment, query);
    return { success: true, data: result };
  }

  /**
   * PATCH /api/v1/inventory/:productId
   * Seller updates stock quantity and/or threshold.
   */
  @Patch(':productId')
  @Roles(UserRole.SELLER, UserRole.SELLER_MANAGER)
  @HttpCode(HttpStatus.OK)
  async updateStock(
    @Param('productId') productId: string,
    @Body(new ZodValidationPipe(UpdateInventorySchema)) dto: UpdateInventoryDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ success: true; data: InventoryDetailResponse }> {
    const result = await this.inventoryService.updateStock(productId, dto, user.sub);
    return { success: true, data: result };
  }

  /**
   * POST /api/v1/inventory/reserve
   * Internal — called by OrderService in Sprint 4.
   * Requires Idempotency-Key header.
   * NOT exposed to buyers directly.
   */
  @Post('reserve')
  @Roles(UserRole.BUYER, UserRole.SELLER_MANAGER, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async reserve(
    @Body(new ZodValidationPipe(ReserveInventorySchema)) dto: ReserveInventoryDto,
    @CurrentUser() user: JwtPayload,
    @Headers('idempotency-key') idempotencyKey: string,
  ): Promise<{ success: true; data: ReserveStockResult }> {
    if (!idempotencyKey) {
      throw new BadRequestException({ code: 'IDEMPOTENCY_KEY_REQUIRED', message: 'Idempotency-Key header is required.' });
    }
    const result = await this.inventoryService.reserve({
      ...dto,
      requestedBy: user.sub,
      idempotencyKey,
      segment: user.segment,
    });
    return { success: true, data: result };
  }

  /**
   * POST /api/v1/inventory/release
   * Internal — called by OrderService/PaymentService in Sprint 4.
   * Idempotent.
   */
  @Post('release')
  @Roles(UserRole.SELLER_MANAGER, UserRole.ADMIN) // Direct access restricted; OrderService calls internally
  @HttpCode(HttpStatus.OK)
  async release(
    @Body(new ZodValidationPipe(ReleaseInventorySchema)) dto: ReleaseInventoryDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ success: true; data: ReleaseResult }> {
    const result = await this.inventoryService.release(dto.reservationId, dto.reason, user.sub);
    return { success: true, data: result };
  }

  /**
   * GET /api/v1/inventory/:productId/movements
   * Seller views movement history for a product.
   */
  @Get(':productId/movements')
  @Roles(UserRole.SELLER, UserRole.SELLER_MANAGER)
  async getMovements(
    @Param('productId') productId: string,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(CursorPaginationSchema)) query: CursorPaginationDto,
  ): Promise<{ success: true; data: PaginatedMovementResponse }> {
    const result = await this.inventoryService.getMovements(productId, user.sub, query);
    return { success: true, data: result };
  }
}
```

---

## SECTION 8: ZOD DTOs

```typescript
// packages/types/src/inventory/inventory.schemas.ts

export const ReserveInventorySchema = z.object({
  productId: z.string().cuid(),
  quantity: z.number().int().min(1).max(10000),
  cartId: z.string().cuid().optional(),
  orderId: z.string().cuid().optional(),
}).refine(data => data.cartId || data.orderId, {
  message: 'Either cartId or orderId is required',
});

export const ReleaseInventorySchema = z.object({
  reservationId: z.string().cuid(),
  reason: z.enum(['ORDER_CANCELLED', 'PAYMENT_FAILED', 'CART_EXPIRED', 'MANUAL_RELEASE']),
});

export const UpdateInventorySchema = z.object({
  quantity: z.number().int().min(0).max(1000000),
  lowStockThreshold: z.number().int().min(0).max(100000).optional(),
  reason: z.string().max(500).optional(),
});

export const InventoryListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
  lowStockOnly: z.coerce.boolean().optional(),
});

// Response types
export interface InventoryAvailabilityResponse {
  productId: string;
  availableQuantity: number;
  isLowStock: boolean;
  lastUpdated: string;
}

export interface InventoryDetailResponse {
  productId: string;
  inventoryId: string;
  quantity: number;
  reservedQty: number;
  damagedQty: number;
  availableQuantity: number;  // quantity - reservedQty (NOT damagedQty — damaged never available)
  lowStockThreshold: number;
  isLowStock: boolean;
  version: number;
  lastUpdated: string;
}
```

---

## SECTION 9: SEED DATA

```typescript
// packages/database/prisma/seed.ts additions

// SegmentInventoryPolicy seed
await prisma.segmentInventoryPolicy.upsert({
  where: { segment: 'TEXTILE' },
  create: {
    segment: 'TEXTILE',
    maxReservationTtlSeconds: 900,      // 15 min
    maxReservationsPerUser: 5,
    allowBackorder: false,
    lowStockThresholdPercent: 20,
    isActive: true,
  },
  update: {},
});

await prisma.segmentInventoryPolicy.upsert({
  where: { segment: 'SPARE_PARTS' },
  create: {
    segment: 'SPARE_PARTS',
    maxReservationTtlSeconds: 900,
    maxReservationsPerUser: 10,
    allowBackorder: false,
    lowStockThresholdPercent: 15,
    isActive: true,
  },
  update: {},
});

// Seed initial Inventory records for test products (development only)
// Production: Inventory created via POST /products → creates Inventory with quantity=0
```

### 9.1 Inventory Creation on Product Publish

```
When ProductCreated EventOutbox event is consumed by InventoryModule:
  → Check if Inventory already exists for product
  → If not: create Inventory { productId, businessId, segment, quantity: 0, version: 0 }
  → quantity=0 means product is published but stock not yet set

This means:
  - Sellers must update stock via PATCH /inventory/:productId after publishing
  - Products with quantity=0 show as out-of-stock in buyer UI
  - No pre-filled quantity at product creation (intentional)
```

---

## SECTION 10: QUEUE CONFIGURATION

```typescript
// Additions to apps/api/src/core/bullmq/bullmq.module.ts

// Sprint 3 cron jobs registration
// In a startup bootstrap hook or AppModule onModuleInit:

const inventoryQueue = queues.get(INVENTORY_QUEUE);

// Reservation expiry: every 5 minutes
await inventoryQueue.add('expire-reservations', {}, {
  repeat: { pattern: '*/5 * * * *' },
  removeOnComplete: { count: 10 },
  removeOnFail: { count: 100 },
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
});

// Daily snapshot: 2 AM daily
await inventoryQueue.add('daily-snapshot', {}, {
  repeat: { pattern: '0 2 * * *' },
  removeOnComplete: { count: 5 },
  attempts: 1, // snapshot failure logged, not retried (next day will run fresh)
});
```

---

## SECTION 11: CACHING STRATEGY

```
WHAT IS CACHED:
  InventoryAvailabilityResponse: inv_stock:{productId} TTL=30s
    → Fast UI check ("Is this in stock?")
    → NOT used for authoritative reservation decisions
    → TTL=30s: stale for at most 30s (acceptable for display)

  SegmentInventoryPolicy: inv_policy:{segment} TTL=300s
    → Policy lookups cached per segment

WHAT IS NEVER CACHED:
  Current Inventory.quantity during reservation
    → Always read fresh from DB WITH FOR UPDATE
  InventoryReservation records
    → Always DB-authoritative

CACHE INVALIDATION:
  On PATCH /inventory/:productId: DEL inv_stock:{productId}
  On reservation: DEL inv_stock:{productId} (after transaction commits)
  On release: DEL inv_stock:{productId} (after transaction commits)

WHY SHORT TTL ON STOCK:
  30s stale is acceptable for "show out of stock" badge.
  Actual purchase flow always reads fresh.
  Prevents thundering herd on popular products.
```

---

## SECTION 12: FRONTEND

### 12.1 Stock Display on Product Detail

```typescript
// apps/web/app/(main)/products/[slug]/page.tsx additions

// Stock status component
function StockStatus({ productId, segment }: { productId: string; segment: string }) {
  // Polling: refresh stock every 30s while page is open
  const { data } = useSWR(`/api/v1/inventory/${productId}?segment=${segment}`, fetcher, {
    refreshInterval: 30_000,
    fallbackData: { availableQuantity: 0, isLowStock: false },
  });

  if (data.availableQuantity === 0) {
    return <span className="text-error text-caption font-semibold">Stock khatam — Out of Stock</span>;
  }
  if (data.isLowStock) {
    return <span className="text-warning text-caption font-semibold">Sirf {data.availableQuantity} bache — Low Stock</span>;
  }
  return <span className="text-success text-caption font-semibold">Available</span>;
}
```

### 12.2 Seller Inventory Management Screen

```
File: apps/seller-dashboard/app/(main)/inventory/page.tsx

Features:
  - Product list sorted by: isLowStock DESC, updatedAt DESC (low stock first)
  - Red badge on isLowStock=true rows
  - Inline edit modal (quantity + threshold)
  - Movement history per product (paginated timeline)
  - "Update Stock" action per row
  - Low stock filter toggle
  - Bulk stock update (Phase 2 — stub CTA)

STOCK STATUS BADGES:
  availableQty = 0 → red "Out of Stock"
  isLowStock → amber "Low Stock (N remaining)"
  normal → green dot

EDIT MODAL:
  Input: new quantity (required), new threshold (optional), reason (optional)
  Warning shown if new quantity < current reserved (would create negative available)
  Submit → PATCH /inventory/:productId
  Optimistic update: show new qty immediately, revert on error
```

---

## SECTION 13: OBSERVABILITY

```typescript
// apps/api/src/modules/inventory/inventory.metrics.ts

@Injectable()
export class InventoryMetrics {
  // Counters
  reservationSuccess(segment: string, latencyMs: number): void { /* counter + histogram */ }
  reservationFailure(segment: string, reason: string): void { /* counter{segment, reason} */ }
  idempotencyHit(): void { /* counter */ }
  lockUnavailable(productId: string): void { /* counter */ }
  optimisticLockRetry(attempt: number): void { /* counter{attempt} */ }
  reservationReleased(reason: string): void { /* counter{reason} */ }
  expiredReservationsProcessed(count: number, failed: number): void { /* gauge */ }
  stockUpdated(direction: 'increase' | 'decrease'): void { /* counter{direction} */ }
  snapshotCompleted(count: number): void { /* gauge */ }
  driftDetected(count: number): void { /* gauge — CRITICAL if > 0 */ }
  oversellPrevented(): void { /* counter — CRITICAL metric — should always be 0 */ }

  // Histograms
  reservationLatencyMs: Histogram  // p50/p95/p99

  // Gauges
  activeReservationsTotal: Gauge
  lowStockProductsTotal: Gauge
}

// ALERT RULES:
// inventory_drift_detected > 0           → CRITICAL — page on-call immediately
// inventory_oversell_prevented_total > 0 → WARNING — review stock logic
// reservation_failure_rate > 5%          → WARNING
// optimistic_lock_retry{attempt=3} > 10/min → WARNING — contention spike
// expiry_worker_failed > 0               → WARNING
// active_reservations > 50K             → WARNING — unusual, investigate
// reservation_p95_latency > 100ms        → WARNING
// lock_unavailable > 50/min per product → CRITICAL — possible abuse or hot product
```

---

## SECTION 14: COMPREHENSIVE FAILURE HANDLING

### 14.1 Failure Mode Matrix

| Failure | Detection | Mitigation | Recovery |
|---|---|---|---|
| Redis DOWN during reserve | Lock acquisition fails | Fall back to DB-only (optimistic locking only, max retries 5) | Alert ops. Redis restart. |
| DB contention (hot product) | version mismatch, 3 retries exhausted | Return 409. Client retries with exponential backoff. | Normal. |
| Worker crash mid-expiry | Reservation stays ACTIVE past expiry | Next expiry run (5 min) picks it up. Idempotent. | Auto. |
| Transaction timeout (5s exceeded) | Prisma throws PrismaClientKnownRequestError P2024 | Rollback auto. Return 503. Client retries. | Auto. |
| Duplicate reservation (same idempotency key) | Redis idempotency check | Return cached result immediately. No DB write. | Auto (by design). |
| Lock TTL expired while processing | DB transaction continues with optimistic locking only | Version check in $transaction catches any conflict. | Auto. |
| Partial release failure (increment failed) | Logged as CRITICAL. Reservation IS released. | Inventory snapshot detects drift. Manual reconciliation. | Manual ops. |
| Queue DLQ overflow | dead-letter queue accumulates | Alert ops. Review job payload for poison jobs. | Manual ops. |
| Inventory drift detected | Daily snapshot comparison | Log CRITICAL. Alert ops. Manual reconciliation via movements. | Manual. |
| Negative available quantity | quantity < reservedQty | detectd by snapshot. Ops investigate. | Manual reconciliation. |

### 14.2 Circuit Breaker for Inventory Writes

```
If optimistic lock retry count per product > 100/min:
  → Suspect hot-product attack or abnormal traffic
  → Alert: CRITICAL
  → Consider: temporary soft block on that productId (AppConfig flag)
  → NOT automatic block — ops decision required
```

---

## SECTION 15: SECURITY REVIEW

### 15.1 Attack Vector Analysis

| Attack | Mitigation |
|---|---|
| Replay attack: same request retried | Idempotency key (Redis) with TTL=reservation TTL |
| Forged reservationId for release | Ownership check: release only own reservations |
| Seller stock inflation (PATCH with huge qty) | Reasonable upper bound: max 1,000,000 per Zod schema |
| Concurrent reservation spam on single product | Redis lock: serializes all requests per product |
| Direct DB inventory manipulation | No direct DB access. All writes via InventoryRepository. AuditLog. |
| Queue poisoning (malformed job payloads) | Zod validation at worker entry point. DLQ for malformed. |
| Idempotency key reuse across different products | Key includes product context: inv_idem:{idempotencyKey} must match productId in cached result |
| Seller accessing other seller's inventory | Two-hop ownership verification (userId → businessId → inventoryId) |
| Buyer directly calling /inventory/release | Route requires SELLER_MANAGER or ADMIN role |
| Stale cache serving wrong stock count | Short TTL (30s). Cache is for display only, never for reservation decisions. |

---

## SECTION 16: CONCURRENCY LOAD TEST PLAN

```
MANDATORY CONCURRENCY TESTS (sprint blocked if any fail):

Test 1: 10 simultaneous reservations, stock=1
  Setup: Product with quantity=1
  Action: 10 concurrent POST /inventory/reserve (different idempotency keys)
  Assert: Exactly 1 succeeds (200). 9 fail with INSUFFICIENT_STOCK (422).
  Assert: Final inventory.quantity === 0, reservedQty === 1
  Assert: Exactly 1 InventoryMovement of type RESERVATION_HELD

Test 2: 50 simultaneous reservations, stock=30, qty=1 each
  Assert: Exactly 30 succeed. 20 fail.
  Assert: Final inventory.quantity === 0, reservedQty === 30
  Assert: Exactly 30 InventoryMovements

Test 3: Idempotency under retry
  Setup: 5 identical requests (same idempotency key) for same product, stock=10
  Assert: Exactly 1 reservation created. 1 InventoryMovement.
  Assert: All 5 return same reservationId.

Test 4: Reserve + immediate release + reserve
  Assert: Second reserve succeeds (stock restored by first release).

Test 5: Redis lock failure simulation (pause Redis during reserve)
  Assert: Falls back to optimistic locking only.
  Assert: No oversell occurs.
  Assert: CRITICAL log emitted.

Test 6: Reservation expiry under load
  Setup: 1000 ACTIVE reservations, all expired.
  Run: expiry worker.
  Assert: All 1000 released. Inventory.quantity restored.
  Assert: No duplicate movements.

k6 LOAD TEST (Sprint 9 hardening):
  Concurrent users: 500
  Test scenario: search → product → check stock → reserve → release (simulating abandoned cart)
  p95 reserve: < 100ms
  p99 reserve: < 200ms
  Zero oversell events
```

---

## SECTION 17: SCALABILITY ANALYSIS

### 17.1 Current Scale (MVP)
```
Redis lock + optimistic locking handles:
  ~500 reservations/second on a single product (hot product scenario)
  ~10,000 reservations/second distributed across products
```

### 17.2 Scale Path

```
Phase 2 (10x):
  Read replicas for inventory queries (not reservations)
  PgBouncer connection pooling for write path
  Redis Cluster if single-node memory exceeds 80%
  BullMQ workers scaled horizontally (more worker containers)
  No architecture change needed

Phase 3 (100x):
  Partition Inventory table by segment or businessId
  Separate Redis namespaces per segment
  Queue sharding: separate BullMQ queue per segment
  Consider: dedicated inventory microservice extraction (clean boundary already in place)

Phase 4 (multi-location / warehouse):
  InventoryLocation model (already schema-ready via warehouse_locations placeholder)
  Reserve at location level (productId + locationId composite key)
  Lock key: inv_lock:{productId}:{locationId}
  No application logic changes — only repository methods extended

Phase 5 (multi-supplier aggregation):
  Supplier offers (Sprint 7) already model supplier-product relationship
  Virtual inventory: sum of supplier stock
  Reserve at supplier level
  InventoryModule exports clean interface — no ordering/payment module changes needed

Phase 6 (Kafka):
  EventOutbox already in place — swap consumer from BullMQ to Kafka
  InventoryReserved, InventoryReleased events are schema-versioned
  Zero module changes required
```

---

## SECTION 18: SPRINT VALIDATION GATE

All items must pass before Sprint 4 begins. Zero failures allowed.

```
CONCURRENCY SAFETY (MANDATORY)
✅ Test 1: 10 concurrent reserves, stock=1 → exactly 1 succeeds
✅ Test 2: 50 concurrent reserves, stock=30 → exactly 30 succeed
✅ Test 3: Idempotent reserve (same key) → 1 reservation, 1 movement
✅ Test 4: Reserve → release → reserve succeeds
✅ Test 5: Redis down → optimistic locking prevents oversell
✅ Final inventory state: quantity + reservedQty === original quantity (always)

IDEMPOTENCY
✅ POST /inventory/reserve without Idempotency-Key header → 400
✅ POST /inventory/reserve with same key twice → same reservationId, 1 movement
✅ POST /inventory/release on already-released reservation → 200 alreadyReleased=true
✅ Reservation expiry worker: running twice → same result (idempotent)

OWNERSHIP & SECURITY
✅ Seller A PATCH /inventory/:productB → 403
✅ Buyer directly POST /inventory/release → 403
✅ PATCH /inventory with qty > 1,000,000 → 400 validation error
✅ Reserve with negative quantity → 400

RESERVATION LIFECYCLE
✅ Reserve → ACTIVE status in DB
✅ Release (ORDER_CANCELLED) → CANCELLED status in DB
✅ Release (PAYMENT_FAILED) → RELEASED status in DB
✅ Expiry worker → EXPIRED status in DB
✅ Consume (Sprint 4 mock) → CONSUMED status in DB
✅ Every status transition creates InventoryMovement (APPEND-ONLY)
✅ InventoryMovement has no update/delete methods in repository

STOCK INTEGRITY
✅ Inventory.quantity never goes below 0
✅ Inventory.reservedQty never exceeds original quantity
✅ After all tests: sum(active_reservation.qty) === inventory.reservedQty
✅ EXPLAIN ANALYZE: idx_inv_prod used for product-based lookups
✅ EXPLAIN ANALYZE: idx_invres_active_expiry used for expiry worker query

EVENTS
✅ Reserve → EventOutbox InventoryReserved (deduplication key: inv-reserved-{id})
✅ Release → EventOutbox InventoryReleased (deduplication key: inv-released-{id})
✅ Low stock → EventOutbox InventoryLowStock (monthly dedup key)
✅ Stock update → EventOutbox InventoryChanged (version-based dedup key)
✅ Retry of reserve → NO duplicate EventOutbox entry (idempotency)

SELLER FLOW
✅ PATCH /inventory/:productId → stock updated, InventoryMovement created
✅ GET /inventory/seller → paginated list with isLowStock sorting
✅ GET /inventory/:productId/movements → movement history
✅ Seller inventory management screen shows red badge for low stock
✅ SegmentInventoryPolicy seeded for TEXTILE + SPARE_PARTS

WORKERS
✅ Expiry worker registered in BullMQ with cron */5 * * * *
✅ Snapshot worker registered with cron 0 2 * * *
✅ Low-stock alert worker deduplicated (1h Redis TTL)
✅ Expiry worker batch full → schedules immediate re-run

OBSERVABILITY
✅ inventory_reservation_success_total counter increments on success
✅ inventory_reservation_failure_total{reason} increments on failure
✅ inventory_optimistic_lock_retry_total increments on version conflict
✅ inventory_drift_detected gauge is 0 on fresh system
✅ Pino logs: reserve success, release, expiry, drift — all with structured fields

FRONTEND
✅ Product detail shows live stock status (polling 30s)
✅ Seller inventory page shows isLowStock badge in red
✅ Stock edit modal saves and shows updated quantity
✅ Movement history timeline loads correctly

QUALITY
✅ pnpm typecheck → zero errors
✅ pnpm test → all tests passing (including concurrency tests)
✅ pnpm lint → zero errors
✅ Coverage ≥ 80% for inventory module
```

---

## SECTION 19: FAILURE CONDITIONS

Sprint 3 FAILED if ANY of the following occur:

| Failure | Severity |
|---|---|
| Oversell in concurrency test | BLOCKING — CRITICAL |
| Inventory.quantity < 0 at any point | BLOCKING — CRITICAL |
| release() is NOT idempotent (throws on double-call) | BLOCKING |
| reserve() creates duplicate movements on retry | BLOCKING |
| EventOutbox deduplication key uses timestamp | BLOCKING |
| MovementRepository has update() or delete() methods | BLOCKING |
| Seller can modify another seller's inventory | BLOCKING — CRITICAL |
| InventoryReservation not created in same $transaction as quantity decrement | BLOCKING |
| Expiry worker is NOT idempotent | BLOCKING |
| No Idempotency-Key enforcement on /reserve | BLOCKING |
| TypeScript errors in any inventory module file | BLOCKING |
| Any failing test | BLOCKING |
| Lock released BEFORE $transaction commits | BLOCKING — CRITICAL |
| Redis lock NOT using Lua compare-and-delete | HIGH |
| SegmentInventoryPolicy not seeded | HIGH |
| Daily snapshot worker not registered | HIGH |
| EXPLAIN ANALYZE shows Seq Scan on hot queries | HIGH |

---

## SECTION 20: SPRINT 3 → SPRINT 4 HANDOFF

When Sprint 3 validation gate fully passes:

1. Update `CURRENT_PHASE.md` → Sprint 4
2. Sprint 4 reads before any code:
   - This Sprint 3 spec (InventoryService public interface)
   - `VyaparNet_Workflow_Sequence_Diagrams_v1.md` — Section 7.1 (Order Placement)
   - `VyaparNet_SCHEMA_v4_3_FINAL_FREEZE.md` — Order, OrderItem, Cart, Payment models
   - Sprint 4 critical dependency: `InventoryService.reserve(input)` and `InventoryService.release(reservationId, reason, actorId)` must be exported from `InventoryModule`

3. Sprint 4 `OrderService.createOrder()` will call:
   ```typescript
   // Inside $transaction:
   const reservation = await inventoryService.reserve({
     productId, quantity, requestedBy: userId,
     idempotencyKey: `order-${orderId}-product-${productId}`,
     orderId, segment
   });
   // On payment fail:
   await inventoryService.release(reservation.reservationId, 'PAYMENT_FAILED', userId);
   // On order cancel:
   await inventoryService.releaseAllForOrder(orderId, 'ORDER_CANCELLED', userId);
   ```

4. `InventoryModule` exports: `InventoryService`, `InventoryReserveService`, `InventoryReleaseService`

---

**END OF SPRINT 3 FINAL IMPLEMENTATION PACK v1.0**

*Zero-oversell guarantee is a product promise. This implementation treats it as such.*
*Every architectural decision — the layered defense, the Lua lock release, the deterministic dedup keys, the idempotent release, the append-only movements — exists to keep that promise under every failure mode.*
*No Sprint 4 implementation begins until Sprint 3 validation gate passes with zero failures.*