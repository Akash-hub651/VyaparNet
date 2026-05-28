# VYAPARNET — SPRINT 3 IMPLEMENTATION LOCKED
## Inventory Management: Zero-Oversell Guarantee
### Version: v2.0 ENTERPRISE LOCK | Concurrency-Hardened | Audit-Certified
### Authority: All Architecture Documents + Master Context Pack + 10-Patch Hardening Audit
### Date: 2026-05-28 | Preceded by: Sprint 2 (Marketplace Core — COMPLETE ✅)
### Status: FINAL AUTHORITY — This document supersedes sprint3.md entirely

> **CRITICAL:** This is the v2.0 post-hardening-audit specification. The prior sprint3.md draft is SUPERSEDED.
> All implementation agents MUST use THIS document exclusively.
> The audit identified ten architectural gaps that, if unpatched, create operational fragility, oversell risk, and future rewrite traps.
> All ten are resolved and integrated here as a unified architecture — not appended as patches.

---

## DOCUMENT INDEX

- [Section 1: Sprint Identity](#section-1-sprint-identity)
- [Section 2: Required Architecture Context Files](#section-2-required-architecture-context-files)
- [Section 3: Architectural Philosophy](#section-3-architectural-philosophy)
- [Section 4: Schema Additions](#section-4-schema-additions-sprint-3-migration)
- [Section 5: Redis Architecture](#section-5-redis-architecture-for-inventory)
- [Section 6: Module Structure](#section-6-module-structure)
- [Section 7: Concurrency & Locking Architecture](#section-7-concurrency--locking-architecture)
- [Section 8: Reservation TTL Governance](#section-8-reservation-ttl-governance)
- [Section 9: Reservation Ownership Model](#section-9-reservation-ownership-model)
- [Section 10: Degraded Mode Governance](#section-10-degraded-mode-governance)
- [Section 11: Abuse Protection Architecture](#section-11-abuse-protection-architecture)
- [Section 12: Reconciliation & Snapshot Architecture](#section-12-reconciliation--snapshot-architecture)
- [Section 13: Event Versioning Governance](#section-13-event-versioning-governance)
- [Section 14: Inventory Saga Governance](#section-14-inventory-saga-governance)
- [Section 15: Hot Product Contention Strategy](#section-15-hot-product-contention-strategy)
- [Section 16: Detailed Implementation](#section-16-detailed-implementation)
- [Section 17: Zod DTOs](#section-17-zod-dtos)
- [Section 18: Seed Data](#section-18-seed-data)
- [Section 19: Queue Configuration](#section-19-queue-configuration)
- [Section 20: Caching Strategy](#section-20-caching-strategy)
- [Section 21: Frontend](#section-21-frontend)
- [Section 22: Observability](#section-22-observability)
- [Section 23: Failure Handling & Security](#section-23-failure-handling--security)
- [Section 24: Phased Implementation Plan](#section-24-phased-implementation-plan)
- [Section 25: Sprint Validation Gate](#section-25-sprint-validation-gate)
- [Section 26: Failure Conditions](#section-26-failure-conditions)
- [Section 27: Sprint 3 → Sprint 4 Handoff](#section-27-sprint-3--sprint-4-handoff)

---

## SECTION 1: SPRINT IDENTITY

| Field | Value |
|---|---|
| Sprint Number | 3 |
| Sprint Name | Inventory Management: Zero-Oversell Guarantee |
| Spec Version | v2.0 Enterprise Lock (Post-Hardening Audit) |
| Duration | 2 weeks (10 working days) |
| Status | READY TO EXECUTE — Sprint 2 gate must be fully passed |
| Preceded By | Sprint 2 — Marketplace Core Foundation (ALL validation gates must pass) |
| Followed By | Sprint 4 — Cart, Orders & Payments |
| Critical Path | YES — Orders (Sprint 4) call `InventoryService.reserve()`. If Sprint 3 is wrong, Sprint 4 is wrong. |
| Lock Authority | This document. No other document overrides it for Sprint 3. |

---

## SECTION 2: REQUIRED ARCHITECTURE CONTEXT FILES

Every agent and engineer executing Sprint 3 MUST read these files BEFORE writing a single line.

| Context Type | File | Why Required |
|---|---|---|
| Schema — Inventory | `architecture/database/6. VyaparNet_SCHEMA_v4.3_FINAL_FREEZE.md` | Inventory, InventoryMovement, InventoryReservation, InventorySnapshot models |
| Indexing Strategy | `architecture/database/7. VyaparNet_Database_Indexing_Strategy_Official_Freeze_v1.md` — Sections 6.3, 12, 13 | idx_inv_prod, idx_invres_inv_stat_exp, deadlock strategy, hot-table write |
| DB Infra | `architecture/database/5. VyaparNet_DB_Infra_Architecture.md` — Sections 3.5, 6.3, 8 | Inventory concurrency, BullMQ governance, failure philosophy |
| Implementation Patterns | `architecture/implementation/8. VyaparNet_Implementation_Architecture_Official_Freeze_v1.md` — Sections 5, 7, 8, 20, 22 | Transaction boundary, queue, retry/DLQ/idempotency, concurrency/payment safety |
| Workflow Sequences | `architecture/workflows/11. VyaparNet_Workflow_Sequence_Diagrams_v1.md` — Section 5.1 | Inventory Reservation CRITICAL workflow |
| API Contracts | `architecture/api/9. VyaparNet_API_Contracts_Backend_Scaffold_Blueprint.md` — Section 4 | Inventory management APIs |
| Runtime | `architecture/runtime/12. VyaparNet_Deployment_Runtime_Architecture_v1.md` — Sections 9, 10, 14 | Redis, queue, security runtime |
| Master Roadmap | `implementation/master-roadmap/.../MASTER_IMPLEMENTATION_ROADMAP.md` — Sprint 3 section | Deliverables, validation gate |
| Sprint 1 Lock | `implementation/sprint-packs/sprint1.md` | Auth infrastructure, guard patterns, AuditRepository |
| Sprint 2 Lock | `implementation/sprint-packs/SPRINT2_IMPLEMENTATION_LOCKED_final_v2.0.md` | ProductsModule, BusinessQueryService, SegmentApprovalPolicy patterns |
| Governance | `context/LOCKED_DECISIONS.md` | Runtime rules, concurrency rules, module boundary rules |
| Project Context | `context/PROJECT_CONTEXT..md` | Anti-patterns, AI governance rules |

---

## SECTION 3: ARCHITECTURAL PHILOSOPHY

### 3.1 The Fundamental Contract

Sprint 3 makes one guarantee that is non-negotiable and absolute:

> **For any product with quantity Q, at most Q simultaneous order placements will succeed. Zero exceptions. Zero edge cases. Under any failure mode.**

This guarantee holds under:
- Redis failures (formally governed degraded mode)
- DB contention (optimistic locking retry with exponential backoff)
- Worker crashes (idempotent compensation on next run)
- Network retries (idempotency keys)
- Duplicate queue jobs (deduplication keys)
- Partial transaction failures (atomic rollback)
- Reservation expiry races (deterministic release)
- Hot product spikes (adaptive contention strategy)
- Abuse attempts (velocity limiting and anti-hoarding)

### 3.2 Layered Defense Architecture (Seven Layers)

```
Layer 1: Idempotency key (Redis, SET NX)
  → Prevents duplicate reservation from any network retry
  → Stored BEFORE lock acquisition
  → Returns cached result immediately — zero lock, zero DB

Layer 2: Abuse & Velocity Guard
  → Per-user, per-IP, per-business, per-product velocity check
  → Blocks reservation storms before any lock is attempted
  → Anti-hoarding: maxReservationsPerUser enforced here

Layer 3: Redis distributed lock (inventory-level granularity)
  → Key: inv_lock:{inventoryId} (NOT productId — finer granularity)
  → Lock token: crypto.randomUUID() — only owner can release
  → TTL: 30s — auto-expires on process crash
  → Lua CAS release: atomic compare-and-delete

Layer 4: DB transaction with SELECT FOR UPDATE
  → Row-level lock on specific Inventory record
  → Held only during transaction (ReadCommitted isolation)
  → Prevents lost-update within the transaction window

Layer 5: Optimistic locking (version column)
  → UPDATE ... WHERE version = N — detects concurrent write
  → 0 rows updated → ConcurrencyException → retry (max 3)
  → Exponential backoff: 100ms, 200ms, 400ms

Layer 6: InventoryReservation record with TTL
  → Tracks every reservation with expiresAt
  → Ownership chain: reservedByUserId + reservedByBusinessId
  → Enables release on cancel / payment-fail / expiry

Layer 7: InventorySnapshot + incremental reconciliation
  → Periodic snapshot with drift detection
  → Alerts on: actual quantity ≠ expected from movements
  → Reconciliation is incremental — scales to millions of products

Any single layer may fail. The system remains correct.
```

### 3.3 Twelve Absolute Constraints

```
1. Inventory writes are ALWAYS in $transaction.
   quantity decrement + reservation creation + movement log + event outbox = atomic unit.

2. Redis lock is acquired BEFORE $transaction begins.
   Lock released AFTER $transaction commits (not before, not within).

3. Lock key is inventory-level: inv_lock:{inventoryId}, NOT inv_lock:{productId}.
   Reduces hot-product contention. Multiple products map to one inventory record (1:1),
   but future variant/location-level locks use same key structure.

4. Optimistic locking version check is INSIDE $transaction.
   UPDATE inventory SET quantity=quantity-qty, version=version+1 WHERE id=? AND version=?
   If 0 rows updated → ConcurrencyException → retry (max 3) → fail 409.

5. No quantity decrement without InventoryMovement.
   Every stock change creates an immutable InventoryMovement record. No exceptions.

6. Idempotency key stored BEFORE Redis lock acquired.
   If key exists → return cached result immediately (no lock, no DB, no retry).

7. Reservation expiry is idempotent.
   Running expiry job twice on same reservation = same outcome.

8. Release is idempotent.
   Releasing an already-released reservation is a no-op (returns alreadyReleased=true, not an error).

9. Seller ownership is two-hop verified (same as Sprint 2 pattern).
   userId → Business.ownerId → Business.id → Inventory.businessId.

10. Segment isolation on inventory queries.
    Buyer-facing: Inventory WHERE product.segment = :segment.
    Seller: own inventory only (businessId filter).

11. InventorySnapshot is NEVER written by application code.
    Written ONLY by cron worker. Never in-line with business transactions.

12. computeReservationTtl(context) governs ALL TTL decisions.
    No hardcoded TTL values in business logic. Policy-driven. Segment-extensible.
```

### 3.4 Segment Extensibility Contract

```
InventoryEngine is segment-agnostic.
NO TEXTILE/SPARE_PARTS conditional logic anywhere in inventory code.

Segment-specific inventory rules live in SegmentInventoryPolicy:
  segment, maxReservationTtlSeconds, maxReservationsPerUser,
  allowBackorder, allowVirtualStock, lowStockThresholdPercent,
  maxReservationQuantityPerRequest, reservationVelocityLimitPerHour, isActive

Sprint 3 seeds:
  TEXTILE:     { maxReservationTtl: 900s, maxReservationsPerUser: 5,  maxQtyPerRequest: 500  }
  SPARE_PARTS: { maxReservationTtl: 900s, maxReservationsPerUser: 10, maxQtyPerRequest: 1000 }

Future PHARMA (zero code changes):
  PHARMA: { maxReservationTtl: 1800s, requiresLotTracking: true, maxQtyPerRequest: 100 }

Future RFQ segment (zero code changes):
  RFQ:    { maxReservationTtl: 86400s, paymentMethod: 'CREDIT', requiresApproval: true }

The computeReservationTtl(context) function reads from this policy.
No TTL is ever hardcoded outside SegmentInventoryPolicy.
```

---

## SECTION 4: SCHEMA ADDITIONS (Sprint 3 Migration)

All additions are backward-compatible. No existing columns modified.

### 4.1 Prisma Schema Additions

```prisma
// ============================================================
// NEW MODEL: SegmentInventoryPolicy
// ============================================================
model SegmentInventoryPolicy {
  id                           String  @id @default(cuid())
  segment                      Segment @unique
  maxReservationTtlSeconds     Int     @default(900)
  maxReservationsPerUser       Int     @default(10)
  maxReservationQtyPerRequest  Int     @default(1000)
  reservationVelocityLimitPerHour Int  @default(50)  // per user per hour
  allowBackorder               Boolean @default(false)
  allowVirtualStock            Boolean @default(false)
  lowStockThresholdPercent     Int     @default(20)
  isActive                     Boolean @default(true)
  createdAt                    DateTime @default(now())
  updatedAt                    DateTime @updatedAt

  @@map("segment_inventory_policies")
}

// ============================================================
// ADDITIONS TO EXISTING: Inventory model
// Verify v4.3 schema has these; add migration if missing:
// ============================================================
// version          Int      @default(0)         ← optimistic locking (MANDATORY)
// damagedQty       Int      @default(0)          ← damaged stock tracking
// incomingQty      Int      @default(0)          ← PO in-transit tracking
// lowStockThreshold Int     @default(10)         ← absolute threshold
// isLowStock       Boolean  @default(false)      ← computed flag

// ============================================================
// ADDITIONS TO EXISTING: InventoryReservation model
// Ownership chain fields — add if missing in v4.3:
// ============================================================
// reservedByUserId   String?    ← direct reserver (nullable for system)
// reservedByBusinessId String?  ← business context (nullable for guest)
// orderContext       String?    ← 'CART' | 'ORDER' | 'RFQ' | 'SYSTEM'
// reservationSource  String?    ← 'WEB' | 'API' | 'BULK' | 'WORKER'

// ============================================================
// VERIFY: ReservationStatus enum in v4.3 includes ALL of:
// ACTIVE, CONSUMED, EXPIRED, CANCELLED, RELEASED
// ============================================================

// ============================================================
// VERIFY: InventoryMovementType enum in v4.3 includes ALL of:
// STOCK_ADDED, STOCK_REMOVED, RESERVATION_HELD,
// RESERVATION_RELEASED, ORDER_FULFILLED, RETURN_RECEIVED,
// ADJUSTMENT, DAMAGED, TRANSFER_IN, TRANSFER_OUT
// ============================================================
```

### 4.2 Sprint 3 Migration SQL

```sql
-- 1. SegmentInventoryPolicy table
CREATE TABLE segment_inventory_policies (
  id                              TEXT PRIMARY KEY,
  segment                         "Segment" UNIQUE NOT NULL,
  max_reservation_ttl_seconds     INT NOT NULL DEFAULT 900,
  max_reservations_per_user       INT NOT NULL DEFAULT 10,
  max_reservation_qty_per_request INT NOT NULL DEFAULT 1000,
  reservation_velocity_limit_per_hour INT NOT NULL DEFAULT 50,
  allow_backorder                 BOOLEAN NOT NULL DEFAULT false,
  allow_virtual_stock             BOOLEAN NOT NULL DEFAULT false,
  low_stock_threshold_percent     INT NOT NULL DEFAULT 20,
  is_active                       BOOLEAN NOT NULL DEFAULT true,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Add ownership fields to InventoryReservation if missing
ALTER TABLE "InventoryReservation"
  ADD COLUMN IF NOT EXISTS reserved_by_user_id TEXT,
  ADD COLUMN IF NOT EXISTS reserved_by_business_id TEXT,
  ADD COLUMN IF NOT EXISTS order_context TEXT,
  ADD COLUMN IF NOT EXISTS reservation_source TEXT DEFAULT 'WEB';

-- 3. Autovacuum tuning for high-write inventory tables
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

-- 4. Partial index for active reservation expiry worker (hot path)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invres_active_expiry
  ON "InventoryReservation" (expires_at ASC)
  WHERE status = 'ACTIVE';

-- 5. Composite covering index for reservation lookup by order
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invres_order_status
  ON "InventoryReservation" (order_id, status)
  WHERE status = 'ACTIVE';

-- 6. Composite index for reservation lookup by cart
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invres_cart_status
  ON "InventoryReservation" (cart_id, status)
  WHERE status = 'ACTIVE';

-- 7. Bucketed expiry index — for expiration wheel cleanup strategy
-- Buckets by 5-minute intervals for partitioned expiry processing
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invres_expiry_bucket
  ON "InventoryReservation" (
    date_trunc('hour', expires_at),
    (EXTRACT(MINUTE FROM expires_at)::INT / 5)
  )
  WHERE status = 'ACTIVE';

-- 8. Inventory snapshot date index
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invsnap_inv_date
  ON "InventorySnapshot" (inventory_id, snapshot_date DESC);

-- 9. Changed-inventory index for incremental reconciliation
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_inv_updated_at
  ON "Inventory" (updated_at DESC);

-- 10. Ownership index on reservations
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invres_user_segment
  ON "InventoryReservation" (reserved_by_user_id, status)
  WHERE status = 'ACTIVE';

-- 11. pg_stat_statements for slow query monitoring (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
```

---

## SECTION 5: REDIS ARCHITECTURE FOR INVENTORY

### 5.1 Complete Redis Key Registry

```
KEY: inv_idem:{idempotencyKey}
  Value:  JSON serialized ReserveStockResult
  TTL:    Matches reservation TTL from SegmentInventoryPolicy (dynamic)
  Type:   STRING
  Owner:  InventoryReserveService
  Notes:  SET NX (atomic). Checked BEFORE lock. Never updated after set.

KEY: inv_lock:{inventoryId}           ← INVENTORY-LEVEL granularity (not productId)
  Value:  lockToken (crypto.randomUUID())
  TTL:    30s (safety TTL — guarantees release even on crash)
  Type:   STRING
  Owner:  InventoryLockService
  Notes:  SET NX EX 30. ONLY deleted by Lua CAS (compare-and-delete).

KEY: inv_stock:{productId}
  Value:  available quantity (integer as string)
  TTL:    30s (short — display only, NOT for reservation decisions)
  Type:   STRING
  Owner:  InventoryQueryService (read cache)
  Notes:  NOT authoritative. For UI display only. Always read fresh from DB on reserve.

KEY: inv_low_stock:{inventoryId}
  Value:  1 (flag)
  TTL:    3600s (1 hour dedup window)
  Owner:  LowStockAlertWorker
  Notes:  Prevents duplicate low-stock alerts per hour per inventory.

KEY: inv_policy:{segment}
  Value:  JSON serialized SegmentInventoryPolicy
  TTL:    300s
  Owner:  InventoryPolicyService
  Notes:  Cache for policy lookups. Invalidated on policy admin update.

KEY: inv_velocity:{userId}:{segment}
  Value:  counter (INCR)
  TTL:    3600s (1 hour rolling window)
  Owner:  InventoryAbuseGuard
  Notes:  Reservation velocity per user per segment per hour.

KEY: inv_velocity_ip:{ipHash}
  Value:  counter (INCR)
  TTL:    3600s
  Owner:  InventoryAbuseGuard
  Notes:  Reservation velocity per IP per hour.

KEY: inv_velocity_biz:{businessId}
  Value:  counter (INCR)
  TTL:    3600s
  Owner:  InventoryAbuseGuard
  Notes:  Reservation velocity per business per hour.

KEY: inv_protect_mode
  Value:  'NORMAL' | 'DEGRADED' | 'READ_ONLY'
  TTL:    None (persistent until reset by ops)
  Owner:  InventoryProtectionModeService
  Notes:  Global inventory operation mode. Read on every reserve.

KEY: inv_hot_product:{inventoryId}
  Value:  lock contention counter (INCR per failed lock attempt)
  TTL:    300s (5-minute rolling)
  Owner:  InventoryLockService
  Notes:  Used to detect and adapt to hot-product contention spikes.
```

### 5.2 Lock Protocol — Inventory-Level Granularity

```
WHY INVENTORY-LEVEL (not product-level):
  Old approach: inv_lock:{productId}
  Problem: All concurrent requests on a hot product serialize — extreme bottleneck.

  New approach: inv_lock:{inventoryId}
  Benefit: 1:1 with Inventory record. In current schema productId=unique→inventoryId=unique.
  Future: When variant/location-level inventory splits, locks automatically fine-grain
  without any code changes (just different inventoryId values).
  Hot product behavior: All requests still serialize at inventory-level —
  which is CORRECT because we're protecting a single quantity counter.
  The Redis lock + optimistic locking combo handles correctness.
  Adaptive retry handles the UX.

ACQUIRE:
  lockToken = crypto.randomUUID()
  key = inv_lock:{inventoryId}
  result = SETNX key lockToken EX 30
  if result === null:
    → increment inv_hot_product:{inventoryId} (detect contention spike)
    → throw LockUnavailableException(retryAfterMs: 200)

RELEASE (safe — Lua atomic compare-and-delete):
  local script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `
  result = EVAL script 1 key lockToken
  if result === 0:
    LOG.warn 'Lock already expired or taken — TTL handled cleanup. Safe.'

HOT PRODUCT DETECTION:
  If inv_hot_product:{inventoryId} > CONTENTION_THRESHOLD (default: 20 per 5 min):
    → Alert: CRITICAL hot-product contention spike detected
    → Adaptive: increase retry delay for subsequent lock attempts on this inventoryId
    → Log structured event with inventoryId, contention count, timestamp
```

### 5.3 Redis Down Fallback Protocol

```
REDIS DOWN SCENARIO:
  Lock acquisition fails → InventoryProtectionMode check:

  NORMAL MODE (Redis down unexpectedly):
    → Skip Redis lock
    → Rely solely on optimistic locking (DB-only path)
    → Increase max retries to 5 (vs 3 on normal path)
    → Log CRITICAL: 'Redis unavailable — inventory writes in degraded mode'
    → Emit alert to ops

  DEGRADED MODE (operator-declared):
    → Same as NORMAL down behavior but with explicit mode flag
    → Throttle reservation requests (max 10/sec per API node)
    → Reservation TTL reduced to segment minimum (safety margin)

  READ_ONLY MODE (operator-declared):
    → Block ALL reservation writes (503 with code INVENTORY_READ_ONLY)
    → Allow reads (stock check, movement history)
    → Used during emergency maintenance or schema migrations

  CRITICAL: Any time Redis is down and inventory writes occur, ops MUST be notified.
  Log level: CRITICAL. Metric: inventory_protection_mode_active{mode}.
```

---

## SECTION 6: MODULE STRUCTURE

```
apps/api/src/modules/
└── inventory/
    ├── inventory.module.ts
    │
    ├── inventory.service.ts                ← Public facade (thin orchestration)
    ├── inventory-reserve.service.ts        ← Reserve logic (CRITICAL PATH)
    ├── inventory-release.service.ts        ← Release logic (compensation path)
    ├── inventory-update.service.ts         ← Seller stock management
    ├── inventory-query.service.ts          ← Read path (buyer + seller)
    ├── inventory-policy.service.ts         ← SegmentInventoryPolicy + TTL computation
    ├── inventory-lock.service.ts           ← Redis distributed lock abstraction
    ├── inventory-reconcile.service.ts      ← Incremental drift detection + snapshot
    ├── inventory-protection-mode.service.ts ← NORMAL/DEGRADED/READ_ONLY state
    ├── inventory-abuse-guard.service.ts    ← Velocity limiting + anti-hoarding
    │
    ├── repositories/
    │   ├── inventory.repository.ts
    │   ├── reservation.repository.ts
    │   ├── movement.repository.ts          ← APPEND-ONLY (no update/delete methods)
    │   ├── snapshot.repository.ts          ← APPEND-ONLY
    │   └── segment-inventory-policy.repository.ts
    │
    ├── workers/
    │   ├── reservation-expiry.worker.ts    ← Bucketed expiry processing
    │   ├── low-stock-alert.worker.ts       ← Low stock notification trigger
    │   └── inventory-snapshot.worker.ts   ← Incremental reconciliation + snapshot
    │
    ├── inventory.controller.ts
    │
    ├── dto/
    │   └── index.ts                        ← Re-exports from packages/types
    │
    └── tests/
        ├── inventory-reserve.service.spec.ts   ← CONCURRENCY TESTS
        ├── inventory-release.service.spec.ts
        ├── inventory-lock.service.spec.ts
        ├── inventory-abuse-guard.service.spec.ts
        ├── reservation-expiry.worker.spec.ts
        └── inventory.controller.spec.ts

packages/types/src/inventory/
  ├── inventory.schemas.ts                  ← Zod DTOs
  └── index.ts
```

### 6.1 Module Boundary Rules

```
InventoryModule OWNS:
  Inventory, InventoryReservation, InventoryMovement, InventorySnapshot,
  SegmentInventoryPolicy

InventoryModule imports:
  ProductsService (product existence validation)
  BusinessQueryService (seller ownership verification — Sprint 2 pattern)
  RedisService (from core/redis)
  PrismaService (from core/prisma)

InventoryModule DOES NOT import:
  OrderRepository, PaymentRepository, CartRepository

OrderModule (Sprint 4) imports:
  InventoryService (via InventoryModule.exports ONLY)

OrderModule NEVER:
  Writes directly to Inventory, InventoryMovement, or InventoryReservation

Reservation release triggered by (all idempotent):
  OrderService (cancel)   → InventoryService.release(reservationId, 'ORDER_CANCELLED', actorId)
  PaymentService (fail)   → InventoryService.release(reservationId, 'PAYMENT_FAILED', actorId)
  ExpiryWorker (cron)     → InventoryService.expireReservations()
  ManualOps (admin)       → InventoryService.release(reservationId, 'MANUAL_RELEASE', actorId)
```

---

## SECTION 7: CONCURRENCY & LOCKING ARCHITECTURE

### 7.1 InventoryLockService

```typescript
// apps/api/src/modules/inventory/inventory-lock.service.ts

@Injectable()
export class InventoryLockService {
  private readonly logger = new Logger(InventoryLockService.name);

  // LOCK AT INVENTORY LEVEL (not product level) — finer granularity, less contention
  static readonly LOCK_TTL_SECONDS = 30;
  static readonly LOCK_KEY_PREFIX = 'inv_lock:';
  static readonly HOT_KEY_PREFIX = 'inv_hot_product:';
  static readonly CONTENTION_THRESHOLD = 20; // per 5-minute window
  static readonly HOT_KEY_TTL = 300; // 5 minutes

  constructor(
    private readonly redis: RedisService,
    private readonly metrics: InventoryMetrics,
  ) {}

  /**
   * Acquire distributed lock at INVENTORY LEVEL (inventoryId, not productId).
   *
   * WHY inventory-level:
   *   - Correct granularity: each Inventory record has its own quantity counter
   *   - Future-proof: variant/location-level inventory uses same key pattern
   *   - Reduces cross-product interference while maintaining correctness
   *
   * Returns lockToken on success. Throws LockUnavailableException on failure.
   */
  async acquire(inventoryId: string): Promise<string> {
    const lockToken = crypto.randomUUID();
    const key = `${InventoryLockService.LOCK_KEY_PREFIX}${inventoryId}`;

    const result = await this.redis.set(
      key,
      lockToken,
      'EX',
      InventoryLockService.LOCK_TTL_SECONDS,
      'NX',
    );

    if (result === null) {
      // Track contention for hot-product detection
      const hotKey = `${InventoryLockService.HOT_KEY_PREFIX}${inventoryId}`;
      const count = await this.redis.incr(hotKey);
      if (count === 1) {
        await this.redis.expire(hotKey, InventoryLockService.HOT_KEY_TTL);
      }
      if (count >= InventoryLockService.CONTENTION_THRESHOLD) {
        this.metrics.hotProductDetected(inventoryId, count);
        this.logger.warn({ inventoryId, contentionCount: count }, 'HOT PRODUCT — contention spike detected');
      }

      throw new ConflictException({
        code: 'INVENTORY_LOCK_UNAVAILABLE',
        message: 'Product is being updated. Please retry in a moment.',
        details: { retryAfterMs: 200 },
      });
    }

    return lockToken;
  }

  /**
   * Release lock — Lua atomic compare-and-delete.
   * Only the original lock holder can release.
   * Safe to call even if lock has already expired (TTL auto-cleared it).
   */
  async release(inventoryId: string, lockToken: string): Promise<void> {
    const key = `${InventoryLockService.LOCK_KEY_PREFIX}${inventoryId}`;

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
        { inventoryId, tokenPrefix: lockToken.slice(0, 8) },
        'Lock already expired or taken by another request — TTL handled it. Safe.',
      );
    }
  }

  /**
   * Execute fn within distributed lock.
   * Guarantees release in finally block even on exception.
   */
  async withLock<T>(inventoryId: string, fn: (lockToken: string) => Promise<T>): Promise<T> {
    const lockToken = await this.acquire(inventoryId);
    try {
      return await fn(lockToken);
    } finally {
      await this.release(inventoryId, lockToken).catch((err: Error) => {
        this.logger.error(
          { inventoryId, error: err.message },
          'Lock release failed — TTL will auto-expire it',
        );
      });
    }
  }
}
```

### 7.2 InventoryRepository (Concurrency-Safe)

```typescript
// apps/api/src/modules/inventory/repositories/inventory.repository.ts

@Injectable()
export class InventoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find inventory with SELECT FOR UPDATE — row-level lock within transaction.
   * CRITICAL: tx parameter is REQUIRED for all stock mutations.
   * Uses $queryRaw because Prisma does not natively support FOR UPDATE.
   */
  async findByProductIdWithLock(productId: string, tx: PrismaTransactionClient): Promise<Inventory | null> {
    const result = await tx.$queryRaw<Inventory[]>`
      SELECT * FROM "Inventory"
      WHERE product_id = ${productId}
        AND is_deleted = false
      LIMIT 1
      FOR UPDATE
    `;
    return result[0] ?? null;
  }

  async findByProductId(productId: string): Promise<Inventory | null> {
    return this.prisma.inventory.findFirst({
      where: { productId, isDeleted: false },
    });
  }

  async findByBusinessId(
    businessId: string,
    segment: Segment,
    pagination: CursorPagination,
  ): Promise<Inventory[]> {
    return this.prisma.inventory.findMany({
      where: {
        businessId,
        product: { segment, isDeleted: false },
      },
      include: {
        product: { select: { name: true, slug: true, segment: true, basePrice: true } },
      },
      orderBy: [{ isLowStock: 'desc' }, { updatedAt: 'desc' }],
      take: pagination.limit,
      cursor: pagination.cursor ? { id: pagination.cursor } : undefined,
      skip: pagination.cursor ? 1 : 0,
    });
  }

  /**
   * Atomic quantity decrement with optimistic locking.
   * Returns affected row count. 0 = version mismatch (concurrent write detected).
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
        quantity: { gte: qty }, // safety — should not fail if lock is held correctly
      },
      data: {
        quantity: { decrement: qty },
        reservedQty: { increment: qty },
        version: { increment: 1 },
        updatedAt: new Date(),
      },
    });
    return result.count; // 0 = version conflict → retry
  }

  /**
   * Atomic quantity increment (release path).
   * Decrements reservedQty and increments available quantity.
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

  /**
   * Find inventories updated since a given timestamp — for incremental reconciliation.
   */
  async findUpdatedSince(since: Date, limit: number): Promise<Inventory[]> {
    return this.prisma.inventory.findMany({
      where: { updatedAt: { gte: since } },
      orderBy: { updatedAt: 'asc' },
      take: limit,
    });
  }
}
```

---

## SECTION 8: RESERVATION TTL GOVERNANCE

### 8.1 computeReservationTtl — Policy-Driven Dynamic TTL

```typescript
// apps/api/src/modules/inventory/inventory-policy.service.ts

export interface ReservationTtlContext {
  segment: Segment;
  paymentMethod?: PaymentMethod;
  orderType?: 'CART' | 'ORDER' | 'RFQ' | 'BULK';
  isBusinessVerified?: boolean;
  isTrustedSeller?: boolean;
}

@Injectable()
export class InventoryPolicyService {
  private readonly logger = new Logger(InventoryPolicyService.name);
  private readonly POLICY_CACHE_TTL = 300; // 5 minutes

  constructor(
    private readonly redis: RedisService,
    private readonly policyRepo: SegmentInventoryPolicyRepository,
  ) {}

  /**
   * Compute reservation TTL dynamically based on full context.
   *
   * WHY dynamic TTL:
   *   - TEXTILE cart reservation: 15 minutes (buyer browsing)
   *   - TEXTILE order reservation: 30 minutes (checkout in progress)
   *   - RFQ workflow: up to 24 hours (B2B negotiation cycle)
   *   - COD order: shorter TTL (no payment guarantee)
   *   - Credit-verified business: longer TTL (trusted partner)
   *
   * This function is the SINGLE source of truth for TTL.
   * No TTL values hardcoded anywhere else in inventory code.
   */
  computeReservationTtl(policy: SegmentInventoryPolicy, context: ReservationTtlContext): number {
    let ttl = policy.maxReservationTtlSeconds; // base from segment policy

    // Order type modifiers
    if (context.orderType === 'CART') {
      ttl = Math.min(ttl, 900);    // Cart: max 15 min regardless of segment
    } else if (context.orderType === 'ORDER') {
      ttl = Math.min(ttl, 1800);   // Checkout flow: max 30 min
    } else if (context.orderType === 'RFQ') {
      ttl = Math.min(ttl, 86400);  // RFQ: up to 24 hours (policy-governed)
    }

    // Payment method modifiers
    if (context.paymentMethod === 'COD') {
      ttl = Math.min(ttl, 900);    // COD: tighter TTL (higher abandonment risk)
    } else if (context.paymentMethod === 'CREDIT') {
      ttl = Math.min(ttl, policy.maxReservationTtlSeconds); // Credit: full segment TTL
    }

    // Trust modifiers
    if (context.isBusinessVerified && context.orderType === 'RFQ') {
      ttl = Math.min(ttl * 2, 172800); // Verified B2B RFQ: up to 48 hours
    }

    return Math.max(ttl, 300); // Floor: 5 minutes minimum
  }

  async getPolicy(segment: Segment): Promise<SegmentInventoryPolicy> {
    const cacheKey = `inv_policy:${segment}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as SegmentInventoryPolicy;

    const policy = await this.policyRepo.findBySegment(segment);
    if (!policy) {
      throw new InternalServerErrorException({
        code: 'INVENTORY_POLICY_MISSING',
        message: `No inventory policy found for segment ${segment}. Seed data may be missing.`,
      });
    }

    await this.redis.setex(cacheKey, this.POLICY_CACHE_TTL, JSON.stringify(policy));
    return policy;
  }

  async getPolicyRaw(segment: Segment): Promise<SegmentInventoryPolicy | null> {
    return this.policyRepo.findBySegment(segment);
  }
}
```

---

## SECTION 9: RESERVATION OWNERSHIP MODEL

### 9.1 Ownership Chain Design

```
OWNERSHIP FIELDS ON InventoryReservation:
  reservedByUserId      String?   ← Direct actor (null for SYSTEM operations)
  reservedByBusinessId  String?   ← Business context (null for guest/anonymous carts)
  cartId                String?   ← Cart context
  orderId               String?   ← Order context (set on checkout)
  orderContext          String    ← 'CART' | 'ORDER' | 'RFQ' | 'SYSTEM'
  reservationSource     String    ← 'WEB' | 'API' | 'BULK' | 'WORKER'

WHY OWNERSHIP CHAIN:
  Supports current flows:
    - Cart reservation: reservedByUserId=userId, orderContext='CART'
    - Order reservation: reservedByUserId=userId, orderId=orderId, orderContext='ORDER'

  Supports future B2B flows:
    - Team purchasing: reservedByUserId=teamMemberId, reservedByBusinessId=businessId
    - Delegated purchasing: reservedByUserId=delegateId, reservedByBusinessId=principalBusinessId
    - Guest checkout: reservedByUserId=null, reservedByBusinessId=null, cartId=guestCartId
    - RFQ reservation: reservedByUserId=userId, reservedByBusinessId=businessId, orderContext='RFQ'
    - Draft orders: orderId=draftOrderId, orderContext='ORDER'
    - System-generated: reservedByUserId=null, reservationSource='WORKER'

OWNERSHIP VALIDATION RULES:
  On release: caller must own the reservation.
    - If reservedByUserId is set: caller.userId must match OR caller.role is ADMIN
    - If reservedByBusinessId is set: caller.businessId must match OR caller.role is ADMIN
    - System releases (expiry worker): no ownership check (SYSTEM actor)

  On consume: called internally by OrderService within $transaction.
    No separate auth check — OrderService owns the orderId context.
```

---

## SECTION 10: DEGRADED MODE GOVERNANCE

### 10.1 InventoryProtectionMode State Machine

```
STATE MACHINE:
  NORMAL → DEGRADED  (triggered: Redis down, ops alert, auto-detection)
  NORMAL → READ_ONLY (triggered: operator decision, emergency maintenance)
  DEGRADED → NORMAL  (triggered: Redis recovered, ops cleared)
  DEGRADED → READ_ONLY (triggered: operator escalation)
  READ_ONLY → NORMAL (triggered: operator clearance only)

TRANSITIONS:
  Auto-transitions:
    → DEGRADED: if Redis lock acquisition fails > 50 times in 60 seconds
    → Back to NORMAL: if Redis recovered and lock acquisition succeeds

  Manual transitions:
    → READ_ONLY: operator sets inv_protect_mode = 'READ_ONLY' in Redis (or env flag)
    → NORMAL: operator clears inv_protect_mode
```

```typescript
// apps/api/src/modules/inventory/inventory-protection-mode.service.ts

export enum InventoryProtectionMode {
  NORMAL = 'NORMAL',
  DEGRADED = 'DEGRADED',
  READ_ONLY = 'READ_ONLY',
}

@Injectable()
export class InventoryProtectionModeService {
  private readonly REDIS_KEY = 'inv_protect_mode';
  private readonly AUTO_DEGRADED_THRESHOLD = 50;  // failures per 60s
  private readonly AUTO_DEGRADED_WINDOW = 60;     // seconds
  private readonly FAILURE_COUNTER_KEY = 'inv_redis_fail_count';

  constructor(
    private readonly redis: RedisService,
    private readonly logger: Logger,
    private readonly metrics: InventoryMetrics,
  ) {}

  async getCurrentMode(): Promise<InventoryProtectionMode> {
    try {
      const mode = await this.redis.get(this.REDIS_KEY);
      return (mode as InventoryProtectionMode) ?? InventoryProtectionMode.NORMAL;
    } catch {
      // If Redis itself is down, assume DEGRADED
      return InventoryProtectionMode.DEGRADED;
    }
  }

  async reportRedisFailure(): Promise<void> {
    try {
      const count = await this.redis.incr(this.FAILURE_COUNTER_KEY);
      if (count === 1) {
        await this.redis.expire(this.FAILURE_COUNTER_KEY, this.AUTO_DEGRADED_WINDOW);
      }
      if (count >= this.AUTO_DEGRADED_THRESHOLD) {
        await this.setMode(InventoryProtectionMode.DEGRADED);
        this.logger.error({ failureCount: count }, 'AUTO-DEGRADED: Redis failure threshold exceeded');
        this.metrics.protectionModeChanged(InventoryProtectionMode.DEGRADED);
      }
    } catch {
      // Redis is truly down — log to stdout only
      this.logger.error('Redis completely unavailable — inventory system in degraded mode');
    }
  }

  async setMode(mode: InventoryProtectionMode): Promise<void> {
    await this.redis.set(this.REDIS_KEY, mode);
    this.logger.warn({ mode }, `Inventory protection mode changed to ${mode}`);
  }

  /**
   * Get operational behavior for current mode.
   * Called at the start of every reserve() operation.
   */
  getOperationalParams(mode: InventoryProtectionMode): OperationalParams {
    switch (mode) {
      case InventoryProtectionMode.NORMAL:
        return {
          skipRedisLock: false,
          maxRetries: 3,
          retryDelays: [100, 200, 400],
          maxReservationsPerMinute: Infinity,
          allowWrites: true,
        };
      case InventoryProtectionMode.DEGRADED:
        return {
          skipRedisLock: true,           // DB-only path
          maxRetries: 5,                 // more retries for optimistic locking
          retryDelays: [200, 400, 800, 1600, 3200],
          maxReservationsPerMinute: 600, // throttle: 10/sec per API node
          allowWrites: true,
        };
      case InventoryProtectionMode.READ_ONLY:
        return {
          skipRedisLock: true,
          maxRetries: 0,
          retryDelays: [],
          maxReservationsPerMinute: 0,   // block all writes
          allowWrites: false,
        };
    }
  }
}
```

---

## SECTION 11: ABUSE PROTECTION ARCHITECTURE

### 11.1 InventoryAbuseGuard — Multi-Dimensional Velocity Limiting

```typescript
// apps/api/src/modules/inventory/inventory-abuse-guard.service.ts

export interface AbuseCheckContext {
  userId: string;
  businessId?: string;
  ipHash: string;        // SHA-256 of IP (never log raw IP)
  inventoryId: string;
  segment: Segment;
  quantity: number;
  policy: SegmentInventoryPolicy;
}

@Injectable()
export class InventoryAbuseGuard {
  private readonly logger = new Logger(InventoryAbuseGuard.name);

  constructor(
    private readonly redis: RedisService,
    private readonly reservationRepo: ReservationRepository,
    private readonly metrics: InventoryMetrics,
  ) {}

  /**
   * Multi-dimensional abuse check. Called BEFORE lock acquisition.
   * Protects against:
   *   1. Per-user reservation count (anti-hoarding)
   *   2. Per-user velocity (reservation spam)
   *   3. Per-IP velocity (bot/scraper protection)
   *   4. Per-business velocity (B2B flood)
   *   5. Per-product excessive quantity (suspicious bulk reserve)
   *
   * Throws AbuseViolationException if any check fails.
   */
  async check(ctx: AbuseCheckContext): Promise<void> {
    await Promise.all([
      this.checkUserReservationCount(ctx),
      this.checkUserVelocity(ctx),
      this.checkIpVelocity(ctx),
      ctx.businessId ? this.checkBusinessVelocity(ctx) : Promise.resolve(),
      this.checkQuantityLimit(ctx),
    ]);
  }

  private async checkUserReservationCount(ctx: AbuseCheckContext): Promise<void> {
    const activeCount = await this.reservationRepo.countActiveByUserAndSegment(
      ctx.userId,
      ctx.segment,
    );
    if (activeCount >= ctx.policy.maxReservationsPerUser) {
      this.metrics.abuseViolation('user_reservation_limit', ctx.segment);
      this.logger.warn(
        { userId: ctx.userId, activeCount, limit: ctx.policy.maxReservationsPerUser },
        'Reservation limit exceeded — possible hoarding',
      );
      throw new TooManyRequestsException({
        code: 'RESERVATION_LIMIT_EXCEEDED',
        message: `You have ${activeCount} active reservations. Please complete or cancel them before reserving more.`,
        details: { activeCount, limit: ctx.policy.maxReservationsPerUser },
      });
    }
  }

  private async checkUserVelocity(ctx: AbuseCheckContext): Promise<void> {
    const key = `inv_velocity:${ctx.userId}:${ctx.segment}`;
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, 3600); // 1-hour rolling window
    }
    if (count > ctx.policy.reservationVelocityLimitPerHour) {
      this.metrics.abuseViolation('user_velocity', ctx.segment);
      throw new TooManyRequestsException({
        code: 'RESERVATION_VELOCITY_EXCEEDED',
        message: 'Too many reservations in a short period. Please wait before trying again.',
        details: { retryAfterSeconds: 300 },
      });
    }
  }

  private async checkIpVelocity(ctx: AbuseCheckContext): Promise<void> {
    const key = `inv_velocity_ip:${ctx.ipHash}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, 3600);
    if (count > 200) { // 200 reservations per IP per hour — broad anti-bot threshold
      this.metrics.abuseViolation('ip_velocity', ctx.segment);
      this.logger.warn({ ipHash: ctx.ipHash, count }, 'IP velocity limit exceeded — possible bot');
      throw new TooManyRequestsException({
        code: 'IP_RATE_LIMIT_EXCEEDED',
        message: 'Too many requests from this network. Please try again later.',
      });
    }
  }

  private async checkBusinessVelocity(ctx: AbuseCheckContext): Promise<void> {
    if (!ctx.businessId) return;
    const key = `inv_velocity_biz:${ctx.businessId}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, 3600);
    if (count > ctx.policy.reservationVelocityLimitPerHour * 3) { // 3x single-user limit for business
      this.metrics.abuseViolation('business_velocity', ctx.segment);
      throw new TooManyRequestsException({
        code: 'BUSINESS_VELOCITY_EXCEEDED',
        message: 'Your business has exceeded the reservation velocity limit. Contact support if this is unexpected.',
      });
    }
  }

  private checkQuantityLimit(ctx: AbuseCheckContext): void {
    if (ctx.quantity > ctx.policy.maxReservationQtyPerRequest) {
      this.metrics.abuseViolation('quantity_limit', ctx.segment);
      throw new BadRequestException({
        code: 'QUANTITY_LIMIT_EXCEEDED',
        message: `Maximum reservation quantity is ${ctx.policy.maxReservationQtyPerRequest} units per request.`,
        details: { max: ctx.policy.maxReservationQtyPerRequest, requested: ctx.quantity },
      });
    }
  }
}
```

---

## SECTION 12: RECONCILIATION & SNAPSHOT ARCHITECTURE

### 12.1 Incremental Reconciliation Design

```
WHY INCREMENTAL (not full scan):
  Full scan: O(N) where N = total inventory records.
  At 1M products this becomes a multi-hour job that locks ops visibility.

  Incremental: O(Changed) where Changed = records updated since last check.
  Uses idx_inv_updated_at (new index) to find only recently-changed records.
  At 1M products with 1% daily change rate → 10K records per daily run.
  Dramatically more scalable.

RECONCILIATION MODES:
  1. INCREMENTAL (default — runs every hour):
     - Query: Inventory WHERE updatedAt > lastCheckpoint
     - Compare actual quantity vs sum(InventoryMovements) since last snapshot
     - Flag discrepancies above DRIFT_TOLERANCE threshold
     - Checkpoint advanced per batch

  2. CHANGED_PRIORITY (runs on drift alert — operator triggered):
     - Same as incremental but for specific inventoryIds flagged by drift detection
     - Higher priority queue, runs immediately

  3. PARTITIONED_FULL (weekly — maintenance window):
     - Full scan, partitioned into 500-record batches
     - Runs at off-peak hours (Sunday 3 AM)
     - Each partition isolated — failure of one does not block others

DRIFT PRIORITY:
  Drift score = |expected_quantity - actual_quantity| / max(expected_quantity, 1)
  Score > 0.05 (5% drift) → HIGH priority alert → CHANGED_PRIORITY reconciliation triggered
  Score > 0.20 (20% drift) → CRITICAL alert → ops paged immediately
```

```typescript
// apps/api/src/modules/inventory/inventory-reconcile.service.ts

@Injectable()
export class InventoryReconcileService {
  private readonly DRIFT_TOLERANCE = 0.05;  // 5% drift triggers alert
  private readonly DRIFT_CRITICAL = 0.20;   // 20% drift pages ops
  private readonly CHECKPOINT_KEY = 'inv_reconcile_checkpoint';

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly inventoryRepo: InventoryRepository,
    private readonly metrics: InventoryMetrics,
    private readonly logger: Logger,
  ) {}

  /**
   * Incremental reconciliation — only processes records changed since last checkpoint.
   * Scalable to millions of products.
   */
  async runIncrementalReconciliation(batchSize = 500): Promise<ReconciliationResult> {
    const checkpoint = await this.getCheckpoint();
    const since = checkpoint ?? new Date(Date.now() - 24 * 60 * 60 * 1000); // default: last 24h

    let processed = 0;
    let drifted = 0;
    let lastUpdatedAt = since;

    const batch = await this.inventoryRepo.findUpdatedSince(since, batchSize);

    for (const inventory of batch) {
      const drift = await this.checkDrift(inventory);
      if (drift.isDrifted) {
        drifted++;
        await this.handleDrift(inventory, drift);
      }
      if (inventory.updatedAt > lastUpdatedAt) {
        lastUpdatedAt = inventory.updatedAt;
      }
      processed++;
    }

    // Advance checkpoint
    await this.setCheckpoint(lastUpdatedAt);

    this.metrics.reconciliationCompleted(processed, drifted, 'INCREMENTAL');
    return { processed, drifted, mode: 'INCREMENTAL', checkpoint: lastUpdatedAt };
  }

  private async checkDrift(inventory: Inventory): Promise<DriftResult> {
    // Sum movements since last snapshot
    const lastSnapshot = await this.prisma.inventorySnapshot.findFirst({
      where: { inventoryId: inventory.id },
      orderBy: { snapshotDate: 'desc' },
    });

    if (!lastSnapshot) return { isDrifted: false };

    const movementSum = await this.prisma.$queryRaw<[{ net_delta: number }]>`
      SELECT
        COALESCE(SUM(
          CASE
            WHEN type IN ('STOCK_ADDED', 'RETURN_RECEIVED', 'TRANSFER_IN') THEN quantity
            WHEN type IN ('STOCK_REMOVED', 'ORDER_FULFILLED', 'DAMAGED', 'TRANSFER_OUT') THEN -quantity
            ELSE 0  -- RESERVATION_HELD/RELEASED: don't affect available qty calculation
          END
        ), 0) AS net_delta
      FROM "InventoryMovement"
      WHERE inventory_id = ${inventory.id}
        AND created_at > ${lastSnapshot.snapshotDate}
    `;

    const expectedQty = lastSnapshot.quantity + (movementSum[0]?.net_delta ?? 0);
    const actualQty = inventory.quantity;
    const absoluteDrift = Math.abs(expectedQty - actualQty);
    const driftScore = absoluteDrift / Math.max(Math.abs(expectedQty), 1);

    return {
      isDrifted: driftScore > this.DRIFT_TOLERANCE,
      expectedQty,
      actualQty,
      driftScore,
      isCritical: driftScore > this.DRIFT_CRITICAL,
    };
  }

  private async handleDrift(inventory: Inventory, drift: DriftResult): Promise<void> {
    const logLevel = drift.isCritical ? 'error' : 'warn';
    this.logger[logLevel](
      {
        inventoryId: inventory.id,
        productId: inventory.productId,
        expectedQty: drift.expectedQty,
        actualQty: drift.actualQty,
        driftScore: drift.driftScore,
        isCritical: drift.isCritical,
      },
      drift.isCritical
        ? 'CRITICAL INVENTORY DRIFT — immediate ops review required'
        : 'Inventory drift detected — flagged for review',
    );

    this.metrics.driftDetected(inventory.id, drift.driftScore, drift.isCritical ?? false);
  }

  private async getCheckpoint(): Promise<Date | null> {
    const val = await this.redis.get(this.CHECKPOINT_KEY);
    return val ? new Date(val) : null;
  }

  private async setCheckpoint(date: Date): Promise<void> {
    await this.redis.set(this.CHECKPOINT_KEY, date.toISOString());
  }
}
```

---

## SECTION 13: EVENT VERSIONING GOVERNANCE

### 13.1 Event Evolution Policy

```
ALL inventory events MUST conform to this envelope:
{
  eventVersion: string,     // "1.0", "1.1", "2.0"
  schemaVersion: string,    // Prisma schema version: "4.3"
  eventType: string,        // "InventoryReserved", "InventoryReleased", etc.
  eventMonth: string,       // "YYYY-MM" — for partition-aware queries
  deduplicationKey: string, // deterministic — NO timestamps
  payload: { ... }
}

DEDUPLICATION KEY RULES (sprint 3 events):
  InventoryReserved:   inv-reserved-{reservationId}
  InventoryReleased:   inv-released-{reservationId}
  InventoryConsumed:   inv-consumed-{reservationId}
  InventoryChanged:    inv-changed-{inventoryId}-v{newVersion}
  InventoryLowStock:   inv-low-stock-{inventoryId}-{YYYY-MM}   ← monthly dedup
  InventoryDrift:      inv-drift-{inventoryId}-{YYYY-MM-DD}    ← daily dedup

EVENT VERSION EVOLUTION RULES:
  RULE 1 — MINOR VERSIONS (1.0 → 1.1): backward compatible only.
    - Add new optional fields to payload
    - Never remove existing fields
    - Never rename existing fields
    - Consumer fallback: if field missing, use default value

  RULE 2 — MAJOR VERSIONS (1.x → 2.0): breaking change.
    - Dual-publish: emit BOTH v1.x and v2.0 simultaneously during migration window
    - Migration window: minimum 30 days
    - Consumer must declare which version they consume
    - v1.x retirement only after all consumers migrated

  RULE 3 — REPLAY COMPATIBILITY:
    - All event consumers MUST be replay-safe (idempotent processing)
    - deduplicationKey prevents duplicate processing on replay
    - Consumer must handle out-of-order delivery

  RULE 4 — SCHEMA EVOLUTION:
    - eventVersion field: string (e.g., "1.0") — NOT number — allows "1.0", "1.1", "2.0"
    - schemaVersion pinned to Prisma schema version at time of emission
    - Future: schema registry validates payload against schemaVersion

SPRINT 3 CURRENT VERSIONS:
  All events: eventVersion: "1.0", schemaVersion: "4.3"
```

---

## SECTION 14: INVENTORY SAGA GOVERNANCE

### 14.1 Inventory as Saga Participant

```
PRINCIPLE:
  Distributed saga orchestration is FORBIDDEN in Phase 1 (per LOCKED_DECISIONS.md Section 8).
  However, Inventory MUST be designed as a saga participant from day 1 so that future
  integration with orders, payments, refunds, and warehouse ERP requires ZERO rewrites.

CURRENT IMPLEMENTATION (Phase 1 — modular monolith):
  Saga coordination happens via direct service calls within the same process.
  OrderService (Sprint 4) calls InventoryService methods within $transaction context.
  No distributed coordination needed — same DB, same transaction boundary.

SAGA PARTICIPATION CONTRACT (forward-compatible):
  Forward action:    InventoryService.reserve(input)     → InventoryReserved event
  Compensation:      InventoryService.release(id, reason) → InventoryReleased event
  Confirmation:      InventoryService.consume(id, tx)     → InventoryConsumed event

  These three operations form a complete saga step regardless of orchestration model.
  When Phase 3 microservices arrive, InventoryService becomes a microservice
  with the SAME three operations — only the transport changes (HTTP/Kafka).

COMPENSATION PHILOSOPHY:
  1. Compensation is always idempotent.
     Compensating twice = same state as compensating once.

  2. Compensation is always eventually possible.
     Even if the compensation step fails transiently, it will be retried.
     Reservation expiry worker provides the ultimate safety net.

  3. Compensation does NOT assume success of forward action.
     release() checks reservation state before acting.
     If not ACTIVE → returns alreadyReleased=true (no error, no confusion).

  4. Partial compensation is logged, not thrown.
     If inventory increment fails during release (edge case),
     the reservation IS released, drift is logged, ops investigate.

EVENTUAL CONSISTENCY GUARANTEES:
  After successful reserve():   inventory.reservedQty incremented, InventoryReserved emitted
  After successful release():   inventory.quantity restored, InventoryReleased emitted
  After successful consume():   reservation.status=CONSUMED, InventoryConsumed emitted
  On any failure:               EventOutbox preserves event for retry
  On expiry:                    ExpiryWorker guarantees release even without consumer action

FUTURE ERP/WAREHOUSE INTEGRATION (Phase 3):
  InventoryService.reserve() will emit InventoryReserved to Kafka topic
  Warehouse system subscribes, allocates physical stock
  Warehouse confirms → InventoryWarehouseAllocated event consumed by InventoryService
  Compensation: InventoryService.release() → InventoryReleased → Warehouse deallocates
  Zero InventoryService code changes — only new event consumers added
```

---

## SECTION 15: HOT PRODUCT CONTENTION STRATEGY

### 15.1 Adaptive Retry Strategy

```
DETECTION:
  inv_hot_product:{inventoryId} counter (INCR on every failed lock acquisition)
  TTL: 300s (5-minute rolling window)
  Threshold: 20 failed acquisitions in 5 minutes → HOT PRODUCT

MITIGATION TIERS:

  Tier 0 (Normal): < 20 contention events / 5min
    → Standard retry: 3 attempts, delays [100ms, 200ms, 400ms]
    → No additional measures

  Tier 1 (Warm): 20–100 contention events / 5min
    → Alert: WARNING — hot product detected
    → Adaptive retry: delays increase to [200ms, 500ms, 1000ms]
    → Log structured event for ops awareness

  Tier 2 (Hot): 100–500 contention events / 5min
    → Alert: CRITICAL — hot product spike
    → Adaptive retry: delays [500ms, 1000ms, 2000ms]
    → Consider: temporary soft queue concept (see below)
    → Ops decision gate: apply soft block if necessary

  Tier 3 (Viral): > 500 contention events / 5min
    → Alert: CRITICAL — viral product storm
    → Ops decision required: soft block + rate limit product-level reservations
    → NOT automated — requires explicit ops action

SOFT WAIT-ROOM PHILOSOPHY (future Phase 2):
  For viral product launches (Tier 3):
  → Queue reservations in BullMQ with product-level concurrency: 1
  → Single worker processes one reservation at a time per product
  → Other requests wait in queue with estimated wait time response
  → This converts thundering herd into orderly queue
  → Sprint 3 plants the hook: inventoryQueue.concurrency concept noted
  → Full implementation: Phase 2 when needed (premature in Phase 1)

CURRENT SPRINT 3 ACTION:
  Detection + alerting is implemented.
  Adaptive retry delays are implemented.
  Hard soft-block via AppConfig flag is documented (ops-triggered only).
  Queue-based wait room: NOT implemented (Phase 2 — premature complexity).
```

---

## SECTION 16: DETAILED IMPLEMENTATION

### 16.1 InventoryReserveService (Critical Path)

```typescript
// apps/api/src/modules/inventory/inventory-reserve.service.ts

export interface ReserveStockInput {
  productId: string;
  quantity: number;
  requestedBy: string;           // userId (REQUIRED)
  businessId?: string;           // business context (optional — for B2B flows)
  idempotencyKey: string;        // from Idempotency-Key header — REQUIRED
  cartId?: string;
  orderId?: string;
  segment: Segment;              // from JWT token
  ipHash: string;                // SHA-256(request IP) — for abuse detection
  orderType?: 'CART' | 'ORDER' | 'RFQ';
  paymentMethod?: PaymentMethod;
}

export interface ReserveStockResult {
  reservationId: string;
  inventoryId: string;
  productId: string;
  quantity: number;
  expiresAt: string;             // ISO 8601
  status: 'RESERVED';
  ttlSeconds: number;            // actual TTL applied (for client display)
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
    private readonly abuseGuard: InventoryAbuseGuard,
    private readonly protectionMode: InventoryProtectionModeService,
    private readonly metrics: InventoryMetrics,
  ) {}

  /**
   * Reserve stock atomically.
   *
   * CONCURRENCY SAFETY CHAIN:
   * 1. Idempotency key   → return cached result on duplicate
   * 2. Protection mode   → check NORMAL/DEGRADED/READ_ONLY
   * 3. Abuse guard       → velocity check, hoarding check, quantity limit
   * 4. Redis lock        → serialize concurrent requests per inventoryId
   * 5. $transaction      → optimistic locking + atomic decrement
   * 6. EventOutbox       → async downstream consumers
   */
  async reserve(input: ReserveStockInput): Promise<ReserveStockResult> {
    const startTime = Date.now();

    // STEP 1: Idempotency check (BEFORE everything — no lock, no DB if hit)
    const idempotencyKey = `inv_idem:${input.idempotencyKey}`;
    const cached = await this.redis.get(idempotencyKey).catch(() => null);
    if (cached) {
      this.metrics.idempotencyHit();
      return JSON.parse(cached) as ReserveStockResult;
    }

    // STEP 2: Check protection mode
    const mode = await this.protectionMode.getCurrentMode();
    const params = this.protectionMode.getOperationalParams(mode);

    if (!params.allowWrites) {
      throw new ServiceUnavailableException({
        code: 'INVENTORY_READ_ONLY',
        message: 'Inventory reservations are temporarily disabled for maintenance.',
      });
    }

    // STEP 3: Load policy and compute TTL
    const policy = await this.policyService.getPolicy(input.segment);
    const ttlContext = {
      segment: input.segment,
      paymentMethod: input.paymentMethod,
      orderType: input.orderType ?? 'CART',
      isBusinessVerified: !!input.businessId,
    };
    const reservationTtl = this.policyService.computeReservationTtl(policy, ttlContext);

    // STEP 4: Abuse guard (before acquiring any lock)
    const inventory = await this.inventoryRepo.findByProductId(input.productId);
    if (!inventory) {
      throw new NotFoundException({ code: 'INVENTORY_NOT_FOUND' });
    }

    await this.abuseGuard.check({
      userId: input.requestedBy,
      businessId: input.businessId,
      ipHash: input.ipHash,
      inventoryId: inventory.id,
      segment: input.segment,
      quantity: input.quantity,
      policy,
    });

    // STEP 5: Acquire distributed lock (inventory-level)
    let result: ReserveStockResult;
    const lockFn = async () => {
      result = await this.executeReservationWithRetry(
        input,
        inventory.id,
        reservationTtl,
        params,
      );
    };

    if (params.skipRedisLock) {
      // DEGRADED mode: DB-only path (optimistic locking only, more retries)
      await lockFn();
    } else {
      try {
        await this.lockService.withLock(inventory.id, lockFn);
      } catch (err) {
        if (err instanceof ConflictException) {
          await this.protectionMode.reportRedisFailure();
        }
        throw err;
      }
    }

    // STEP 6: Cache idempotency result
    await this.redis.setex(idempotencyKey, reservationTtl, JSON.stringify(result!)).catch(() => {
      // If Redis is down, idempotency cache fails — acceptable, correctness maintained by DB
    });

    this.metrics.reservationSuccess(input.segment, Date.now() - startTime);
    this.logger.log(
      { productId: input.productId, qty: input.quantity, reservationId: result!.reservationId, mode },
      'Stock reserved successfully',
    );

    return result!;
  }

  private async executeReservationWithRetry(
    input: ReserveStockInput,
    inventoryId: string,
    reservationTtl: number,
    params: OperationalParams,
    attempt = 1,
  ): Promise<ReserveStockResult> {
    try {
      return await this.executeReservationTransaction(input, inventoryId, reservationTtl);
    } catch (error) {
      if (error instanceof ConcurrencyException && attempt <= params.maxRetries) {
        this.metrics.optimisticLockRetry(attempt);
        this.logger.warn({ productId: input.productId, attempt }, 'Optimistic lock conflict — retrying');
        await sleep(params.retryDelays[attempt - 1] ?? 400);
        return this.executeReservationWithRetry(input, inventoryId, reservationTtl, params, attempt + 1);
      }
      throw error;
    }
  }

  private async executeReservationTransaction(
    input: ReserveStockInput,
    inventoryId: string,
    reservationTtl: number,
  ): Promise<ReserveStockResult> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Load inventory with FOR UPDATE (row-level lock)
      const inventory = await this.inventoryRepo.findByProductIdWithLock(input.productId, tx);
      if (!inventory) {
        throw new NotFoundException({ code: 'INVENTORY_NOT_FOUND' });
      }

      // 2. Check available quantity
      const available = inventory.quantity;
      if (available < input.quantity) {
        this.metrics.oversellPrevented();
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
        throw new ConcurrencyException('Concurrent inventory modification detected');
      }

      // 4. Create InventoryReservation with ownership chain
      const expiresAt = new Date(Date.now() + reservationTtl * 1000);
      const reservation = await this.reservationRepo.create({
        inventoryId: inventory.id,
        cartId: input.cartId,
        orderId: input.orderId,
        quantity: input.quantity,
        expiresAt,
        reservedByUserId: input.requestedBy,
        reservedByBusinessId: input.businessId,
        orderContext: input.orderType ?? 'CART',
        reservationSource: 'WEB',
      }, tx);

      // 5. InventoryMovement (APPEND-ONLY audit — no exceptions)
      const auditMonth = currentAuditMonth();
      await this.movementRepo.create({
        inventoryId: inventory.id,
        type: 'RESERVATION_HELD',
        quantity: input.quantity,
        orderId: input.orderId,
        reason: `Reserved — idempotency: ${input.idempotencyKey.slice(0, 8)}`,
        createdBy: input.requestedBy,
      }, tx);

      // 6. Low-stock flag update
      const newQuantity = inventory.quantity - input.quantity;
      const isNowLowStock = newQuantity <= inventory.lowStockThreshold;
      if (isNowLowStock !== inventory.isLowStock) {
        await tx.inventory.update({
          where: { id: inventory.id },
          data: { isLowStock: isNowLowStock },
        });
      }

      // 7. EventOutbox — InventoryReserved (deterministic dedup key — NO timestamps)
      await tx.eventOutbox.create({
        data: {
          eventType: 'InventoryReserved',
          eventVersion: '1.0',
          schemaVersion: '4.3',
          payload: {
            productId: input.productId,
            inventoryId: inventory.id,
            reservationId: reservation.id,
            quantity: input.quantity,
            remainingStock: newQuantity,
            isLowStock: isNowLowStock,
            reservedByUserId: input.requestedBy,
            expiresAt: expiresAt.toISOString(),
          },
          deduplicationKey: `inv-reserved-${reservation.id}`,  // deterministic
          eventMonth: auditMonth,
          status: 'PENDING',
        },
      });

      // 8. Low-stock alert event (if newly entered low-stock)
      if (isNowLowStock && !inventory.isLowStock) {
        await tx.eventOutbox.create({
          data: {
            eventType: 'InventoryLowStock',
            eventVersion: '1.0',
            schemaVersion: '4.3',
            payload: { productId: input.productId, inventoryId: inventory.id, quantity: newQuantity },
            deduplicationKey: `inv-low-stock-${inventory.id}-${auditMonth}`, // monthly dedup
            eventMonth: auditMonth,
            status: 'PENDING',
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
        ttlSeconds: reservationTtl,
      };
    }, {
      isolationLevel: 'ReadCommitted', // sufficient with FOR UPDATE on targeted row
      timeout: 5000,
    });
  }
}
```

### 16.2 InventoryReleaseService (Compensation Path)

```typescript
// apps/api/src/modules/inventory/inventory-release.service.ts

export type ReleaseReason =
  | 'ORDER_CANCELLED'
  | 'PAYMENT_FAILED'
  | 'CART_EXPIRED'
  | 'RESERVATION_EXPIRED'
  | 'MANUAL_RELEASE';

export interface ReleaseResult {
  released: boolean;
  reservationId: string;
  reason: string;
  alreadyReleased?: boolean; // idempotent flag
}

const RELEASE_STATUS_MAP: Record<ReleaseReason, ReservationStatus> = {
  ORDER_CANCELLED: 'CANCELLED',
  PAYMENT_FAILED: 'RELEASED',
  CART_EXPIRED: 'EXPIRED',
  RESERVATION_EXPIRED: 'EXPIRED',
  MANUAL_RELEASE: 'RELEASED',
};

@Injectable()
export class InventoryReleaseService {
  private readonly logger = new Logger(InventoryReleaseService.name);
  private readonly MAX_INCREMENT_ATTEMPTS = 3;

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryRepo: InventoryRepository,
    private readonly reservationRepo: ReservationRepository,
    private readonly movementRepo: MovementRepository,
    private readonly metrics: InventoryMetrics,
  ) {}

  /**
   * Release a specific reservation.
   * IDEMPOTENT: Multiple calls on same reservation = same safe outcome.
   * SAFE: Terminal state returns alreadyReleased=true without error.
   * OWNERSHIP: Caller must own the reservation (checked by controller layer).
   */
  async release(
    reservationId: string,
    reason: ReleaseReason,
    actorId: string,
    tx?: PrismaTransactionClient,
  ): Promise<ReleaseResult> {
    const client = tx ?? this.prisma;
    const reservation = await client.inventoryReservation.findUnique({
      where: { id: reservationId },
      include: { inventory: true },
    });

    if (!reservation) {
      throw new NotFoundException({ code: 'RESERVATION_NOT_FOUND' });
    }

    // Terminal states — idempotent return
    const TERMINAL: ReservationStatus[] = ['RELEASED', 'EXPIRED', 'CANCELLED', 'CONSUMED'];
    if (TERMINAL.includes(reservation.status as ReservationStatus)) {
      this.logger.log({ reservationId, status: reservation.status }, 'Release idempotent — terminal state');
      return { released: false, reservationId, reason, alreadyReleased: true };
    }

    const executeRelease = async (txClient: PrismaTransactionClient): Promise<void> => {
      const newStatus = RELEASE_STATUS_MAP[reason];

      // 1. Mark reservation released (updateMany with status=ACTIVE filter — idempotent)
      const released = await this.reservationRepo.release(reservationId, newStatus, txClient);
      if (!released) return; // Concurrent release won — safe

      // 2. Restore inventory quantity (with retry on version conflict)
      let incrementSuccess = false;
      for (let attempt = 0; attempt < this.MAX_INCREMENT_ATTEMPTS; attempt++) {
        const current = await this.inventoryRepo.findByProductIdWithLock(
          reservation.inventory.productId,
          txClient,
        );
        if (!current) break;

        const count = await this.inventoryRepo.incrementQuantityWithVersion(
          current.id,
          reservation.quantity,
          current.version,
          txClient,
        );

        if (count > 0) {
          incrementSuccess = true;
          break;
        }
        await sleep(50 * (attempt + 1));
      }

      if (!incrementSuccess) {
        // CRITICAL: Reservation released but inventory not restored.
        // Drift detection will catch this. Ops must manually reconcile.
        this.logger.error(
          { reservationId, productId: reservation.inventory.productId },
          'CRITICAL: Failed to restore inventory quantity — drift expected, ops action required',
        );
        // DO NOT throw — reservation IS released. Inventory will reconcile.
      }

      // 3. InventoryMovement (append-only audit)
      await this.movementRepo.create({
        inventoryId: reservation.inventoryId,
        type: 'RESERVATION_RELEASED',
        quantity: reservation.quantity,
        orderId: reservation.orderId ?? undefined,
        reason: `${reason} — reservation ${reservationId.slice(0, 8)}`,
        createdBy: actorId,
      }, txClient);

      // 4. EventOutbox — InventoryReleased
      await txClient.eventOutbox.create({
        data: {
          eventType: 'InventoryReleased',
          eventVersion: '1.0',
          schemaVersion: '4.3',
          payload: { reservationId, reason, quantity: reservation.quantity, actorId },
          deduplicationKey: `inv-released-${reservationId}`, // deterministic
          eventMonth: currentAuditMonth(),
          status: 'PENDING',
        },
      });

      // 5. Re-evaluate low-stock flag
      const updated = await txClient.inventory.findUnique({
        where: { id: reservation.inventoryId },
      });
      if (updated?.isLowStock) {
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
      await executeRelease(tx);
    } else {
      await this.prisma.$transaction(executeRelease, { timeout: 5000 });
    }

    this.metrics.reservationReleased(reason);
    this.logger.log({ reservationId, reason, actorId }, 'Reservation released');
    return { released: true, reservationId, reason };
  }

  async releaseAllForOrder(
    orderId: string,
    reason: ReleaseReason,
    actorId: string,
  ): Promise<ReleaseResult[]> {
    const reservations = await this.reservationRepo.findActiveByOrderId(orderId);
    // Sequential release (not parallel) to avoid DB contention on same inventory
    const results: ReleaseResult[] = [];
    for (const r of reservations) {
      results.push(await this.release(r.id, reason, actorId));
    }
    return results;
  }

  /**
   * Consume reservation — called by OrderService on payment capture.
   * Called within OrderService.$transaction — not standalone.
   */
  async consume(
    reservationId: string,
    actorId: string,
    tx: PrismaTransactionClient,
  ): Promise<void> {
    await tx.inventoryReservation.update({
      where: { id: reservationId, status: 'ACTIVE' },
      data: { status: 'CONSUMED', updatedAt: new Date() },
    });

    const reservation = await tx.inventoryReservation.findUnique({
      where: { id: reservationId },
    });
    if (!reservation) return;

    await this.movementRepo.create({
      inventoryId: reservation.inventoryId,
      type: 'ORDER_FULFILLED',
      quantity: reservation.quantity,
      orderId: reservation.orderId ?? undefined,
      reason: 'Order payment captured — reservation consumed',
      createdBy: actorId,
    }, tx);

    await tx.eventOutbox.create({
      data: {
        eventType: 'InventoryConsumed',
        eventVersion: '1.0',
        schemaVersion: '4.3',
        payload: { reservationId, orderId: reservation.orderId, quantity: reservation.quantity },
        deduplicationKey: `inv-consumed-${reservationId}`,
        eventMonth: currentAuditMonth(),
        status: 'PENDING',
      },
    });
  }
}
```

### 16.3 Reservation Expiry Worker — Bucketed Cleanup

```typescript
// apps/api/src/modules/inventory/workers/reservation-expiry.worker.ts

@Processor(INVENTORY_QUEUE)
export class ReservationExpiryWorker extends WorkerHost {
  private readonly logger = new Logger(ReservationExpiryWorker.name);
  private readonly BATCH_SIZE = 100;

  constructor(
    private readonly reservationRepo: ReservationRepository,
    private readonly releaseService: InventoryReleaseService,
    private readonly metrics: InventoryMetrics,
  ) { super(); }

  /**
   * Bucketed expiry processing — runs every 5 minutes.
   *
   * WHY BUCKETED:
   *   Simple approach: findAll WHERE status=ACTIVE AND expiresAt < now()
   *   Problem at scale: millions of active reservations → full-table scan
   *
   *   Bucketed approach: idx_invres_expiry_bucket index partitions by 5-min intervals
   *   Worker processes the CURRENT expired bucket (past time bucket)
   *   This keeps each run bounded to O(reservations_in_bucket)
   *   which is naturally rate-limited by the bucket window size.
   *
   * SAFETY:
   *   - Each reservation released in isolation (one failure doesn't block others)
   *   - Idempotent (re-running finds nothing if already processed)
   *   - Batch full → schedules immediate re-run (no reservations left behind)
   *   - Structured logging for full ops visibility
   */
  @Process('expire-reservations')
  async handleExpiryJob(job: Job): Promise<{ processed: number; failed: number }> {
    this.logger.log('Starting reservation expiry scan');
    let processed = 0;
    let failed = 0;

    const expired = await this.reservationRepo.findExpiredActive(this.BATCH_SIZE);

    for (const reservation of expired) {
      try {
        await this.releaseService.release(
          reservation.id,
          'RESERVATION_EXPIRED',
          'SYSTEM',
        );
        processed++;
      } catch (error) {
        failed++;
        this.logger.error(
          { reservationId: reservation.id, error: (error as Error).message },
          'Failed to expire reservation — will retry on next run',
        );
        // Continue — one failure must not block all others
      }
    }

    this.metrics.expiredReservationsProcessed(processed, failed);
    this.logger.log({ processed, failed, batchSize: expired.length }, 'Expiry scan complete');

    // Batch full → there may be more — schedule immediate re-run (1s delay)
    if (expired.length === this.BATCH_SIZE) {
      await job.queue.add('expire-reservations', {}, { delay: 1000 });
    }

    return { processed, failed };
  }

  @Process('low-stock-alert')
  async handleLowStockAlert(
    job: Job<{ productId: string; inventoryId: string; quantity: number }>,
  ): Promise<void> {
    const { inventoryId } = job.data;
    const dedupKey = `inv_low_stock:${inventoryId}`;

    const exists = await this.redis.exists(dedupKey);
    if (exists) {
      this.logger.log({ inventoryId }, 'Low stock alert already sent recently — skipping');
      return;
    }

    await this.redis.setex(dedupKey, 3600, '1'); // 1-hour dedup window
    await job.queue.add('notify-low-stock', job.data, {});
    this.logger.log(job.data, 'Low stock alert enqueued for notification');
  }
}
```

### 16.4 InventorySnapshotWorker — Incremental Reconciliation

```typescript
// apps/api/src/modules/inventory/workers/inventory-snapshot.worker.ts

@Processor(INVENTORY_QUEUE)
export class InventorySnapshotWorker extends WorkerHost {
  private readonly logger = new Logger(InventorySnapshotWorker.name);
  private readonly SNAPSHOT_BATCH_SIZE = 500;

  constructor(
    private readonly prisma: PrismaService,
    private readonly reconcileService: InventoryReconcileService,
    private readonly metrics: InventoryMetrics,
  ) { super(); }

  /**
   * Daily snapshot at 2 AM — append-only, never modifies Inventory.
   * Paginated to avoid memory exhaustion on large datasets.
   */
  @Process('daily-snapshot')
  async handleDailySnapshot(job: Job): Promise<{ snapshotCount: number }> {
    this.logger.log('Starting daily inventory snapshot');
    const snapshotDate = new Date();
    let snapshotCount = 0;
    let lastId: string | undefined;

    while (true) {
      const batch = await this.prisma.inventory.findMany({
        take: this.SNAPSHOT_BATCH_SIZE,
        cursor: lastId ? { id: lastId } : undefined,
        skip: lastId ? 1 : 0,
        orderBy: { id: 'asc' },
      });

      if (batch.length === 0) break;

      await this.prisma.inventorySnapshot.createMany({
        data: batch.map(inv => ({
          inventoryId: inv.id,
          quantity: inv.quantity,
          reservedQty: inv.reservedQty,
          damagedQty: inv.damagedQty ?? 0,
          snapshotDate,
        })),
        skipDuplicates: true,
      });

      snapshotCount += batch.length;
      lastId = batch[batch.length - 1].id;
      if (batch.length < this.SNAPSHOT_BATCH_SIZE) break;
    }

    this.metrics.snapshotCompleted(snapshotCount);
    this.logger.log({ snapshotCount }, 'Daily snapshot complete');
    return { snapshotCount };
  }

  /**
   * Hourly incremental reconciliation.
   * Only processes inventory records changed since last checkpoint.
   * Scalable to millions of products.
   */
  @Process('incremental-reconciliation')
  async handleIncrementalReconciliation(job: Job): Promise<ReconciliationResult> {
    this.logger.log('Starting incremental reconciliation');
    return this.reconcileService.runIncrementalReconciliation();
  }
}
```

### 16.5 InventoryController

```typescript
// apps/api/src/modules/inventory/inventory.controller.ts

@Controller('inventory')
@ApiTags('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  /**
   * GET /api/v1/inventory/:productId
   * @Public() — available stock for buyers (no auth required for stock check)
   * Returns available quantity ONLY (not reserved, damaged — buyer-facing safety)
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

  /** GET /api/v1/inventory/seller — Seller's full inventory view */
  @Get('seller')
  @Roles(UserRole.SELLER, UserRole.SELLER_MANAGER)
  async getSellerInventory(
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(InventoryListQuerySchema)) query: InventoryListQueryDto,
  ): Promise<{ success: true; data: PaginatedInventoryResponse }> {
    return { success: true, data: await this.inventoryService.getSellerInventory(user.sub, user.segment, query) };
  }

  /** PATCH /api/v1/inventory/:productId — Seller updates stock */
  @Patch(':productId')
  @Roles(UserRole.SELLER, UserRole.SELLER_MANAGER)
  @HttpCode(HttpStatus.OK)
  async updateStock(
    @Param('productId') productId: string,
    @Body(new ZodValidationPipe(UpdateInventorySchema)) dto: UpdateInventoryDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ success: true; data: InventoryDetailResponse }> {
    return { success: true, data: await this.inventoryService.updateStock(productId, dto, user.sub) };
  }

  /**
   * POST /api/v1/inventory/reserve
   * Internal — called by OrderService (Sprint 4).
   * Requires Idempotency-Key header.
   */
  @Post('reserve')
  @Roles(UserRole.BUYER, UserRole.SELLER_MANAGER, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async reserve(
    @Body(new ZodValidationPipe(ReserveInventorySchema)) dto: ReserveInventoryDto,
    @CurrentUser() user: JwtPayload,
    @Headers('idempotency-key') idempotencyKey: string,
    @Req() req: Request,
  ): Promise<{ success: true; data: ReserveStockResult }> {
    if (!idempotencyKey) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Idempotency-Key header is required.',
      });
    }

    const ipHash = createHash('sha256').update(req.ip ?? 'unknown').digest('hex');

    const result = await this.inventoryService.reserve({
      ...dto,
      requestedBy: user.sub,
      businessId: user.businessId,
      idempotencyKey,
      segment: user.segment,
      ipHash,
      orderType: dto.orderType ?? 'CART',
    });

    return { success: true, data: result };
  }

  /**
   * POST /api/v1/inventory/release
   * Internal — called by OrderService/PaymentService (Sprint 4). Idempotent.
   */
  @Post('release')
  @Roles(UserRole.SELLER_MANAGER, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async release(
    @Body(new ZodValidationPipe(ReleaseInventorySchema)) dto: ReleaseInventoryDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ success: true; data: ReleaseResult }> {
    return {
      success: true,
      data: await this.inventoryService.release(dto.reservationId, dto.reason, user.sub),
    };
  }

  /** GET /api/v1/inventory/:productId/movements — Movement history for seller */
  @Get(':productId/movements')
  @Roles(UserRole.SELLER, UserRole.SELLER_MANAGER)
  async getMovements(
    @Param('productId') productId: string,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(CursorPaginationSchema)) query: CursorPaginationDto,
  ): Promise<{ success: true; data: PaginatedMovementResponse }> {
    return { success: true, data: await this.inventoryService.getMovements(productId, user.sub, query) };
  }
}
```

---

## SECTION 17: ZOD DTOs

```typescript
// packages/types/src/inventory/inventory.schemas.ts

export const ReserveInventorySchema = z.object({
  productId: z.string().cuid(),
  quantity: z.number().int().min(1).max(100000),
  cartId: z.string().cuid().optional(),
  orderId: z.string().cuid().optional(),
  orderType: z.enum(['CART', 'ORDER', 'RFQ']).optional().default('CART'),
  paymentMethod: z.enum(['ONLINE_UPI', 'ONLINE_CARD', 'COD', 'CREDIT', 'BANK_TRANSFER']).optional(),
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
  segment: z.nativeEnum(Segment).optional(),
});

// ────────────────────────────────────────
// Response Types
// ────────────────────────────────────────

export interface InventoryAvailabilityResponse {
  productId: string;
  availableQuantity: number;    // quantity (NOT including reservedQty)
  isLowStock: boolean;
  lastUpdated: string;          // ISO 8601
}

export interface InventoryDetailResponse {
  productId: string;
  inventoryId: string;
  quantity: number;             // available (not reserved, not damaged)
  reservedQty: number;
  damagedQty: number;
  availableQuantity: number;    // quantity — reservedQty — damagedQty
  lowStockThreshold: number;
  isLowStock: boolean;
  version: number;
  lastUpdated: string;
}

export interface ReservationOwnershipResponse {
  reservationId: string;
  inventoryId: string;
  productId: string;
  quantity: number;
  status: ReservationStatus;
  expiresAt: string;
  reservedByUserId?: string;
  reservedByBusinessId?: string;
  orderContext: string;
}
```

---

## SECTION 18: SEED DATA

```typescript
// packages/database/prisma/seed.ts — Sprint 3 additions

// SegmentInventoryPolicy seeds — UPSERT safe (idempotent)
await prisma.segmentInventoryPolicy.upsert({
  where: { segment: 'TEXTILE' },
  create: {
    segment: 'TEXTILE',
    maxReservationTtlSeconds: 900,          // 15 min max
    maxReservationsPerUser: 5,
    maxReservationQtyPerRequest: 500,       // 500 meters max per reserve
    reservationVelocityLimitPerHour: 30,
    allowBackorder: false,
    allowVirtualStock: false,
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
    maxReservationQtyPerRequest: 1000,
    reservationVelocityLimitPerHour: 50,
    allowBackorder: false,
    allowVirtualStock: false,
    lowStockThresholdPercent: 15,
    isActive: true,
  },
  update: {},
});
```

### 18.1 Inventory Creation on Product Publish

```
When ProductCreated EventOutbox event is consumed by InventoryModule:
  → Check if Inventory already exists for product (findByProductId)
  → If not: create Inventory {
      productId, businessId, segment,
      quantity: 0, reservedQty: 0, damagedQty: 0,
      version: 0, isLowStock: false
    }
  → quantity=0 means product published but stock not set yet

Seller must set stock via PATCH /api/v1/inventory/:productId after publishing.
Products with quantity=0 show as Out of Stock in buyer UI.
No pre-filled quantity at product creation — intentional design.
```

---

## SECTION 19: QUEUE CONFIGURATION

```typescript
// apps/api/src/core/bullmq/bullmq.module.ts — Sprint 3 registrations

const inventoryQueue = queues.get(INVENTORY_QUEUE);

// Reservation expiry: every 5 minutes
await inventoryQueue.add('expire-reservations', {}, {
  repeat: { pattern: '*/5 * * * *' },
  removeOnComplete: { count: 10 },
  removeOnFail: { count: 100 },
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
  jobId: 'expire-reservations-cron', // stable jobId prevents duplicates
});

// Daily snapshot: 2 AM every day
await inventoryQueue.add('daily-snapshot', {}, {
  repeat: { pattern: '0 2 * * *' },
  removeOnComplete: { count: 5 },
  attempts: 1,   // snapshot failure logged; next day is a fresh run
  jobId: 'daily-snapshot-cron',
});

// Hourly incremental reconciliation: top of every hour
await inventoryQueue.add('incremental-reconciliation', {}, {
  repeat: { pattern: '0 * * * *' },
  removeOnComplete: { count: 24 },
  removeOnFail: { count: 48 },
  attempts: 2,
  backoff: { type: 'fixed', delay: 30000 }, // 30s retry
  jobId: 'incremental-reconciliation-cron',
});
```

---

## SECTION 20: CACHING STRATEGY

```
WHAT IS CACHED:
  inv_stock:{productId}           TTL=30s   → Fast UI "In Stock?" check
    Used for: product listing, search results stock badge
    NOT used: reservation decisions (always reads fresh from DB)
    Stale: at most 30s (acceptable for display)

  inv_policy:{segment}            TTL=300s  → Policy lookups per segment
    Invalidated: admin policy update → DEL inv_policy:{segment}

  inv_idem:{idempotencyKey}       TTL=reservationTtl → Reservation results
    Critical: set AFTER successful reservation, returned on duplicate

  inv_protect_mode                No TTL    → Persistent mode flag
    Cleared by: ops team after incident resolution

WHAT IS NEVER CACHED:
  Inventory.quantity during reservation
    → Always read fresh from DB WITH FOR UPDATE

  InventoryReservation records
    → Always DB-authoritative

CACHE INVALIDATION:
  On PATCH /inventory/:productId:
    → DEL inv_stock:{productId} (immediate)

  After reservation transaction commits:
    → DEL inv_stock:{productId} (async, best-effort — TTL is the fallback)

  After release transaction commits:
    → DEL inv_stock:{productId} (async, best-effort)

WHY 30s TTL ON STOCK:
  30s stale is acceptable for "show out of stock badge" in product listing.
  Actual purchase flow ALWAYS reads fresh from DB.
  Prevents thundering herd on popular product pages.
  If cache is down: reads from DB directly (cache-aside pattern degrades gracefully).
```

---

## SECTION 21: FRONTEND

### 21.1 Stock Display on Product Detail

```typescript
// apps/web/app/(main)/products/[slug]/page.tsx

function StockStatus({ productId, segment }: { productId: string; segment: string }) {
  // Poll every 30s while page is open — short enough to show real-time changes
  const { data } = useSWR(
    `/api/v1/inventory/${productId}?segment=${segment}`,
    fetcher,
    {
      refreshInterval: 30_000,
      fallbackData: { availableQuantity: 0, isLowStock: false },
    },
  );

  if (data.availableQuantity === 0) {
    return <span className="text-error text-caption font-semibold">Stock khatam — Out of Stock</span>;
  }
  if (data.isLowStock) {
    return <span className="text-warning text-caption font-semibold">Sirf {data.availableQuantity} bache — Jaldi karein!</span>;
  }
  return <span className="text-success text-caption font-semibold">Available</span>;
}
```

### 21.2 Seller Inventory Management Screen

```
File: apps/seller-dashboard/app/(main)/inventory/page.tsx

FEATURES:
  - Product list sorted: isLowStock DESC → updatedAt DESC (low stock first)
  - Red badge: isLowStock=true rows
  - Amber badge: quantity < 10 but not flagged low
  - Inline edit modal: quantity + threshold + reason
  - Movement history per product (paginated timeline)
  - Low stock filter toggle (show only low-stock products)
  - Refresh button (invalidates inv_stock cache + rerenders)

STOCK STATUS BADGES:
  quantity=0          → red "Out of Stock"
  isLowStock=true     → amber "Low Stock (N units)"
  normal              → green dot

EDIT MODAL:
  Inputs: new quantity (required), new threshold (optional), reason (optional)
  Warning: if new quantity < reservedQty → "Warning: active reservations may exceed new stock"
  Submit → PATCH /api/v1/inventory/:productId
  Optimistic update: show new qty immediately → revert on error

MOVEMENT HISTORY TAB:
  GET /api/v1/inventory/:productId/movements
  Displays: type, quantity, reason, createdAt, createdBy
  Cursor-paginated (20 per page)
  Append-only — no edit/delete UI (mirrors repository constraint)
```

---

## SECTION 22: OBSERVABILITY

### 22.1 InventoryMetrics

```typescript
// apps/api/src/modules/inventory/inventory.metrics.ts

@Injectable()
export class InventoryMetrics {
  // Reservation counters
  reservationSuccess(segment: string, latencyMs: number): void { /* counter + histogram */ }
  reservationFailure(segment: string, reason: string): void { /* counter{segment, reason} */ }
  idempotencyHit(): void { /* counter */ }
  lockUnavailable(inventoryId: string): void { /* counter */ }
  optimisticLockRetry(attempt: number): void { /* counter{attempt} */ }
  reservationReleased(reason: string): void { /* counter{reason} */ }
  expiredReservationsProcessed(count: number, failed: number): void { /* gauge */ }
  stockUpdated(direction: 'increase' | 'decrease'): void { /* counter */ }
  oversellPrevented(): void { /* counter — MUST always be 0 in production */ }

  // Snapshot + reconciliation
  snapshotCompleted(count: number): void { /* gauge */ }
  reconciliationCompleted(processed: number, drifted: number, mode: string): void { /* gauge */ }
  driftDetected(inventoryId: string, score: number, isCritical: boolean): void { /* gauge — CRITICAL if > 0 */ }

  // Abuse protection
  abuseViolation(type: string, segment: string): void { /* counter{type, segment} */ }

  // Protection mode
  protectionModeChanged(mode: InventoryProtectionMode): void { /* gauge{mode} */ }
  hotProductDetected(inventoryId: string, count: number): void { /* counter */ }

  // Histograms
  reservationLatencyMs: Histogram  // p50/p95/p99 targets: <30ms/<100ms/<200ms

  // Gauges
  activeReservationsTotal: Gauge
  lowStockProductsTotal: Gauge
}
```

### 22.2 Alert Rules (Grafana / Prometheus)

```yaml
# CRITICAL — page ops immediately
- inventory_drift_detected{isCritical="true"} > 0
- inventory_oversell_prevented_total > 0
- inventory_protection_mode_active{mode="READ_ONLY"} == 1

# WARNING — investigate within 1 hour
- inventory_reservation_failure_rate > 5% (5-min window)
- inventory_optimistic_lock_retry{attempt="3"} > 10/min
- inventory_expiry_worker_failed > 0
- inventory_drift_detected{isCritical="false"} > 0
- inventory_active_reservations > 50000
- inventory_reservation_p95_latency_ms > 100
- inv_hot_product:* > 100 (5-min window — hot product spike)
- inventory_abuse_violations{type="user_velocity"} > 50/min

# OPERATIONAL
- inventory_protection_mode_active{mode="DEGRADED"} == 1  → INFO (not page-worthy alone)
- inventory_low_stock_products > 100                       → business alert (not ops)
```

### 22.3 Structured Log Events (Pino)

```typescript
// All inventory operations MUST log with these structured fields:

// Reserve success:
logger.info({ productId, inventoryId, qty, reservationId, mode, latencyMs }, 'Stock reserved')

// Reserve failure (oversell prevented):
logger.warn({ productId, available, requested, userId }, 'INSUFFICIENT_STOCK — oversell prevented')

// Optimistic lock retry:
logger.warn({ productId, attempt }, 'Optimistic lock conflict — retrying')

// Expiry worker:
logger.info({ processed, failed, batchSize }, 'Expiry scan complete')

// Drift detected:
logger.error({ inventoryId, expectedQty, actualQty, driftScore }, 'INVENTORY DRIFT DETECTED')

// Redis failure:
logger.error({ error }, 'Redis unavailable — inventory writes in degraded mode')

// Hot product:
logger.warn({ inventoryId, contentionCount }, 'HOT PRODUCT — contention spike detected')

// Abuse violation:
logger.warn({ userId, violationType, segment }, 'Inventory abuse violation detected')
```

---

## SECTION 23: FAILURE HANDLING & SECURITY

### 23.1 Failure Mode Matrix

| Failure | Detection | Mitigation | Recovery |
|---|---|---|---|
| Redis DOWN during reserve | Lock acquisition fails, reportRedisFailure() | DEGRADED mode: DB-only path, max retries 5 | Alert ops. Redis restart. Auto-revert to NORMAL. |
| DB contention (hot product) | Version mismatch, 3 retries exhausted | Return 409 LOCK_UNAVAILABLE. Client retries with backoff. | Normal. Adaptive delays kick in. |
| Worker crash mid-expiry | Reservation stays ACTIVE past expiry | Next expiry run (≤5 min) picks it up. Idempotent. | Automatic. |
| Transaction timeout (>5s) | Prisma P2024 | Auto-rollback. Return 503. Client retries. | Automatic. |
| Duplicate reservation (same key) | Redis idempotency hit | Return cached result. No DB write. | By design. |
| Lock TTL expired mid-processing | DB transaction continues with optimistic locking | Version check in $transaction catches any conflict. | Automatic. |
| Partial release (increment failed) | CRITICAL log. Reservation IS released. | Reconciliation detects drift. Ops investigates. | Manual ops. |
| Queue DLQ overflow | BullMQ dead-letter queue accumulates | Alert ops. Review job payload for poison jobs. | Manual ops. |
| Inventory drift detected | Incremental reconciliation | CRITICAL log. Alert ops. Manual reconciliation. | Manual. |
| Abuse/velocity limit exceeded | AbuseGuard check | 429 TooManyRequests. Velocity counter expires in 1h. | Auto TTL expiry. |
| Hot product viral spike | inv_hot_product counter | CRITICAL alert. Adaptive retry delays. Ops gate required for soft-block. | Ops decision. |
| InventoryProtectionMode=READ_ONLY | protect_mode key set | 503 INVENTORY_READ_ONLY on all reserve attempts. | Ops clears key. |

### 23.2 Security Attack Vector Analysis

| Attack | Mitigation |
|---|---|
| Replay attack (same request retried) | Idempotency key (Redis NX) with TTL=reservationTtl |
| Inventory hoarding (same user reserves all stock) | maxReservationsPerUser in SegmentInventoryPolicy |
| Reservation spam (velocity attack) | Per-user/IP/business velocity limiting (Redis INCR) |
| Suspicious bulk reserve (huge qty) | maxReservationQtyPerRequest validation |
| Forged reservationId release | Ownership check: reservedByUserId must match actor |
| Seller stock inflation | Max 1,000,000 per Zod schema validation |
| Concurrent reservation storm | Redis lock + optimistic locking — serializes writes |
| Direct DB manipulation | No raw DB access. All writes via repositories. AuditLog. |
| Queue poisoning | Zod validation at worker entry point. Malformed → DLQ. |
| Idempotency key reuse across products | Key includes product context in cached result |
| Seller accessing other seller's inventory | Two-hop ownership: userId→businessId→inventoryId |
| Buyer directly calling /release | Route requires SELLER_MANAGER or ADMIN role |
| Stale cache wrong stock count | TTL=30s display-only. Never used for reservation decisions. |
| Bot scraping reservation capacity | IP velocity limiting + SHA-256 IP hashing |

---

## SECTION 24: PHASED IMPLEMENTATION PLAN

> **EXECUTION RULE:** Implement EXACTLY one phase at a time. Gate before advancing.
> Each phase is independently deployable and testable. No giant merges.

---

### PHASE 1 — SCHEMA & INFRASTRUCTURE FOUNDATION
**Duration:** Day 1–2 | **Dependency:** Sprint 2 validation gate PASSED

**Objective:** Database ready, module scaffolded, nothing executable yet.

**Files to create/modify:**

```
packages/database/prisma/schema.prisma
  → Add SegmentInventoryPolicy model
  → Add reservation ownership fields to InventoryReservation
  → Verify Inventory model has: version, damagedQty, incomingQty, lowStockThreshold, isLowStock
  → Verify ReservationStatus enum has all 5 states

packages/database/prisma/migrations/
  → Sprint 3 migration: all SQL from Section 4.2
  → CONCURRENTLY indexes (do NOT block on migration)

apps/api/src/modules/inventory/
  → inventory.module.ts (skeleton, nothing registered yet)
  → repositories/ (all 5 — stubs with TODO internals)
  → dto/ (re-export from packages/types)

packages/types/src/inventory/inventory.schemas.ts
  → All Zod schemas from Section 17
```

**Reference docs:**
- `architecture/database/6. VyaparNet_SCHEMA_v4.3_FINAL_FREEZE.md`
- `context/LOCKED_DECISIONS.md` Section 9 (mandatory columns)

**Gate criteria:**
```
✅ prisma migrate status → all migrations applied
✅ pnpm typecheck → zero errors
✅ All Zod schemas export without type errors
✅ inventory.module.ts registers cleanly (no runtime errors)
```

**Rollback:** `prisma migrate reset` (dev) or restore from pre-migration backup (staging).

---

### PHASE 2 — CORE SERVICES (Lock, Policy, Abuse Guard)
**Duration:** Day 2–3 | **Dependency:** Phase 1 gate PASSED

**Objective:** Locking, policy, protection mode, and abuse guard fully implemented and tested in isolation.

**Files to create:**

```
apps/api/src/modules/inventory/
  ├── inventory-lock.service.ts          ← Section 7.1 implementation
  ├── inventory-policy.service.ts        ← Section 8.1 implementation (computeReservationTtl)
  ├── inventory-protection-mode.service.ts ← Section 10.1 implementation
  ├── inventory-abuse-guard.service.ts   ← Section 11.1 implementation
  └── repositories/
      ├── inventory.repository.ts        ← Section 7.2 (all methods)
      ├── reservation.repository.ts      ← Section 16.x
      ├── movement.repository.ts         ← APPEND-ONLY (no update/delete)
      ├── snapshot.repository.ts         ← APPEND-ONLY
      └── segment-inventory-policy.repository.ts
```

**Tests to write:**
```
inventory-lock.service.spec.ts:
  ✅ Acquire lock → lockToken returned
  ✅ Double acquire same key → LockUnavailableException
  ✅ Release with correct token → success
  ✅ Release with wrong token → warn log (no throw)
  ✅ withLock() → releases even on fn() exception
  ✅ Hot product detection: > THRESHOLD failures → metrics.hotProductDetected()

inventory-policy.service.spec.ts:
  ✅ computeReservationTtl(CART) ≤ 900s
  ✅ computeReservationTtl(RFQ) ≤ 86400s
  ✅ computeReservationTtl(COD) ≤ 900s
  ✅ getPolicy() → caches result in Redis for 300s
  ✅ Missing policy → InternalServerErrorException

inventory-abuse-guard.service.spec.ts:
  ✅ User with maxReservations active → 429
  ✅ Velocity limit exceeded → 429
  ✅ IP velocity exceeded → 429
  ✅ Quantity > max → 400
  ✅ Under all limits → passes
```

**Reference docs:**
- `context/LOCKED_DECISIONS.md` Section 3 (inventory safety rule)
- `architecture/implementation/8. VyaparNet_Implementation_Architecture_Official_Freeze_v1.md` Section 13 (caching)

**Gate criteria:**
```
✅ pnpm test → all Phase 2 tests passing
✅ pnpm typecheck → zero errors
✅ Lock/unlock verified against real Redis (docker-compose up)
✅ Policy cache verified (Redis key set after first getPolicy() call)
```

**Rollback:** Remove Phase 2 files. Phase 1 schema unchanged — no DB rollback needed.

---

### PHASE 3 — RESERVE & RELEASE SERVICES
**Duration:** Day 3–5 | **Dependency:** Phase 2 gate PASSED

**Objective:** The critical path implemented — reserve and release both working with full safety chain.

**Files to create:**

```
apps/api/src/modules/inventory/
  ├── inventory-reserve.service.ts       ← Section 16.1 (full implementation)
  ├── inventory-release.service.ts       ← Section 16.2 (full implementation)
  ├── inventory-reconcile.service.ts     ← Section 12.1 (incremental reconciliation)
  └── inventory-update.service.ts        ← Seller stock management
```

**Tests to write (CONCURRENCY TESTS — mandatory):**
```
inventory-reserve.service.spec.ts:
  ✅ Test C1: 10 concurrent reserves, stock=1 → exactly 1 succeeds (422 for 9)
  ✅ Test C2: 50 concurrent reserves, stock=30 → exactly 30 succeed
  ✅ Test C3: Same idempotency key × 5 → 1 reservation, 1 movement, 5 same result
  ✅ Test C4: Reserve → release → reserve → second reserve succeeds
  ✅ Test C5: Redis down → DB-only path → no oversell
  ✅ Test C6: Protection mode READ_ONLY → 503 returned
  ✅ Test C7: Abuse violation (velocity) → 429 returned before any lock
  ✅ Test C8: Quantity > maxReservationQtyPerRequest → 400
  ✅ No Idempotency-Key header → 400

inventory-release.service.spec.ts:
  ✅ Release ACTIVE → released=true, status=RELEASED
  ✅ Release already-RELEASED → alreadyReleased=true, no error
  ✅ Release already-CONSUMED → alreadyReleased=true, no error
  ✅ Release EXPIRED → alreadyReleased=true, no error
  ✅ Release → InventoryMovement RESERVATION_RELEASED created
  ✅ Release → EventOutbox InventoryReleased created (deterministic dedup key)
  ✅ Release → inventory.quantity restored
  ✅ consume() → status=CONSUMED, InventoryMovement ORDER_FULFILLED created
```

**Ownership check tests:**
```
  ✅ Release own reservation → success
  ✅ Release another user's reservation → Forbidden (403)
  ✅ ADMIN releases any reservation → success
```

**Reference docs:**
- `architecture/workflows/11. VyaparNet_Workflow_Sequence_Diagrams_v1.md` — Section 5.1
- `architecture/database/7. VyaparNet_Database_Indexing_Strategy_Official_Freeze_v1.md` — Section 13 (deadlock)

**Gate criteria:**
```
✅ All concurrency tests passing (C1–C8)
✅ inventory.quantity + reservedQty = original quantity after all tests
✅ Zero InventoryMovement update/delete methods exist in repository
✅ EventOutbox deduplication keys are deterministic (no timestamps)
✅ pnpm typecheck → zero errors
```

**Rollback:** Remove Phase 3 files. Phase 1–2 unaffected.

---

### PHASE 4 — CONTROLLER & API LAYER
**Duration:** Day 5–6 | **Dependency:** Phase 3 gate PASSED

**Objective:** API endpoints working, security guards in place, standard envelope responses.

**Files to create:**

```
apps/api/src/modules/inventory/
  ├── inventory.controller.ts            ← Section 16.5 (full implementation)
  ├── inventory.service.ts               ← Public facade (orchestrates sub-services)
  └── inventory.module.ts                ← Wire all providers, register module
```

**Tests to write:**
```
inventory.controller.spec.ts:
  ✅ GET /inventory/:productId (public) → 200 InventoryAvailabilityResponse
  ✅ GET /inventory/seller (SELLER role) → 200 paginated list
  ✅ GET /inventory/seller (BUYER role) → 403
  ✅ PATCH /inventory/:productId (own product) → 200 updated
  ✅ PATCH /inventory/:productId (other seller's) → 403
  ✅ POST /inventory/reserve (no Idempotency-Key) → 400
  ✅ POST /inventory/reserve (valid) → 200 ReserveStockResult
  ✅ POST /inventory/release (valid) → 200 ReleaseResult
  ✅ POST /inventory/release (already released) → 200 alreadyReleased=true
  ✅ GET /inventory/:productId/movements → 200 paginated movements
```

**API contract verification:**
```
  ✅ All responses wrapped in { success: true, data: ... }
  ✅ All errors use { success: false, error: { code, message, details } }
  ✅ Idempotency-Key header required on POST /reserve → documented in OpenAPI
  ✅ Commit /contracts/inventory.yaml OpenAPI spec
```

**Reference docs:**
- `architecture/api/9. VyaparNet_API_Contracts_Backend_Scaffold_Blueprint.md` — Section 4
- `context/LOCKED_DECISIONS.md` Section 5 (API decisions)

**Gate criteria:**
```
✅ All controller tests passing
✅ GET /api/v1/inventory/:productId → 200 without auth token
✅ POST /api/v1/inventory/reserve without Idempotency-Key → 400
✅ OpenAPI spec committed to /contracts/inventory.yaml
✅ pnpm typecheck → zero errors
```

---

### PHASE 5 — WORKERS & CRON JOBS
**Duration:** Day 6–7 | **Dependency:** Phase 4 gate PASSED

**Objective:** Background workers operational — expiry, snapshot, reconciliation.

**Files to create:**

```
apps/api/src/modules/inventory/workers/
  ├── reservation-expiry.worker.ts       ← Section 16.3 (bucketed cleanup)
  ├── inventory-snapshot.worker.ts       ← Section 16.4 (daily + incremental)
  └── low-stock-alert.worker.ts          ← Section 16.3 handleLowStockAlert

apps/api/src/core/bullmq/bullmq.module.ts
  → Add Sprint 3 cron registrations from Section 19
```

**Tests to write:**
```
reservation-expiry.worker.spec.ts:
  ✅ 1000 ACTIVE expired reservations → all 1000 released
  ✅ No duplicate movements on double-run (idempotency)
  ✅ One failure doesn't block rest of batch
  ✅ Batch full → immediate re-run scheduled
  ✅ Low stock alert dedup → only fires once per hour per inventory

inventory-snapshot.worker.spec.ts:
  ✅ daily-snapshot → snapshots all inventory records
  ✅ Paginated correctly (multiple batches work)
  ✅ incremental-reconciliation → only processes records changed since checkpoint
  ✅ Drift detected → logger.error called, metrics.driftDetected called
```

**Reference docs:**
- `architecture/database/5. VyaparNet_DB_Infra_Architecture.md` — Section 6.3 (BullMQ governance)
- `architecture/implementation/8. VyaparNet_Implementation_Architecture_Official_Freeze_v1.md` — Section 7 (queue)

**Gate criteria:**
```
✅ expire-reservations cron registered in BullMQ (*/5 * * * *)
✅ daily-snapshot cron registered (0 2 * * *)
✅ incremental-reconciliation cron registered (0 * * * *)
✅ Expiry worker runs end-to-end: expired reservation → EXPIRED status
✅ Snapshot worker runs: creates InventorySnapshot records
✅ EXPLAIN ANALYZE: idx_invres_active_expiry used for expiry query
✅ EXPLAIN ANALYZE: idx_inv_updated_at used for incremental reconciliation
```

---

### PHASE 6 — SEED DATA & SEGMENT POLICY
**Duration:** Day 7 | **Dependency:** Phase 5 gate PASSED

**Objective:** Segment policies seeded, Inventory created on product publish.

**Files to modify:**

```
packages/database/prisma/seed.ts
  → Add SegmentInventoryPolicy seeds from Section 18

apps/api/src/modules/inventory/inventory.module.ts
  → Register EventOutbox consumer for ProductCreated event
  → Auto-create Inventory record on product publish (quantity=0)
```

**Gate criteria:**
```
✅ pnpm db:seed → SegmentInventoryPolicy rows exist for TEXTILE and SPARE_PARTS
✅ Product published via Sprint 2 flow → Inventory record created (quantity=0)
✅ GET /api/v1/inventory/:productId → 200 (availableQuantity=0, isLowStock=false)
```

---

### PHASE 7 — FRONTEND INTEGRATION
**Duration:** Day 7–8 | **Dependency:** Phase 6 gate PASSED

**Objective:** Buyer stock display and seller inventory management UI functional.

**Files to create/modify:**

```
apps/web/app/(main)/products/[slug]/page.tsx
  → StockStatus component (Section 21.1)
  → 30s polling with SWR

apps/seller-dashboard/app/(main)/inventory/page.tsx
  → Inventory list with low stock badges
  → Edit modal (quantity + threshold + reason)
  → Movement history tab
  → Low stock filter toggle
```

**Gate criteria:**
```
✅ Product detail page shows stock status (polling 30s)
✅ Out of stock products show "Stock khatam" badge
✅ Low stock products show "Sirf N bache" badge
✅ Seller inventory list shows red badge for isLowStock=true
✅ Stock edit modal saves and shows updated quantity
✅ Movement history timeline loads with pagination
```

---

### PHASE 8 — OBSERVABILITY, SECURITY AUDIT & LOAD TESTS
**Duration:** Day 8–9 | **Dependency:** Phase 7 gate PASSED

**Objective:** Full observability, security hardening verified, concurrency load tests passed.

**Files to create/modify:**

```
apps/api/src/modules/inventory/inventory.metrics.ts
  → Full implementation from Section 22.1

grafana/dashboards/inventory.json
  → Inventory reservation success rate
  → Optimistic lock retry rate
  → Active reservations gauge
  → Drift detection gauge
  → Protection mode indicator

tests/concurrency/
  → inventory-load.test.ts (k6 or Artillery scenarios from Section 16)
```

**Load test scenarios:**
```
Test L1: 10 simultaneous reserves, stock=1
  Assert: Exactly 1 succeeds. 9 fail with 422 INSUFFICIENT_STOCK.
  Assert: inventory.quantity===0, reservedQty===1, 1 InventoryMovement.

Test L2: 50 simultaneous reserves, stock=30, qty=1 each
  Assert: Exactly 30 succeed. 20 fail.
  Assert: inventory.quantity===0, reservedQty===30.

Test L3: Idempotency under concurrent retry
  Setup: 5 identical requests (same key), stock=10
  Assert: 1 reservation created, 1 movement, all 5 return same reservationId.

Test L4: Reserve → release → reserve
  Assert: Second reserve succeeds (stock restored by release).

Test L5: Redis lock failure (pause Redis mid-test)
  Assert: DEGRADED mode activates. No oversell. CRITICAL log emitted.

Test L6: 1000 expired reservations → expiry worker
  Assert: All 1000 EXPIRED. Inventory restored. No duplicate movements.

Test L7: Velocity abuse (100 reserves/5min from same user)
  Assert: 429 returned after velocity threshold. No lock acquired.
```

**Gate criteria:**
```
✅ All L1–L7 load tests passing
✅ inventory_drift_detected gauge = 0 on fresh system
✅ inventory_oversell_prevented_total = 0 throughout tests
✅ inventory_reservation_p95_latency_ms < 100ms
✅ All alert rules verified in Grafana
✅ pnpm audit → zero critical vulnerabilities in inventory module
```

---

## SECTION 25: SPRINT VALIDATION GATE

All items must pass before Sprint 4 begins. Zero failures allowed.

```
CONCURRENCY SAFETY (MANDATORY — zero tolerance)
✅ Test L1: 10 concurrent reserves, stock=1 → exactly 1 succeeds
✅ Test L2: 50 concurrent reserves, stock=30 → exactly 30 succeed
✅ Test L3: Idempotent reserve (same key) → 1 reservation, 1 movement
✅ Test L4: Reserve → release → reserve succeeds
✅ Test L5: Redis down → DB-only path → no oversell → DEGRADED mode
✅ inventory.quantity + reservedQty === original quantity (invariant — ALWAYS)
✅ inventory.quantity NEVER goes below 0

IDEMPOTENCY
✅ POST /reserve without Idempotency-Key header → 400
✅ POST /reserve with same key twice → same reservationId, 1 movement
✅ POST /release on already-released → 200 alreadyReleased=true
✅ Expiry worker: run twice → same result (no double-release)

OWNERSHIP & SECURITY
✅ Seller A PATCH /inventory/:productB → 403
✅ Buyer directly POST /release → 403
✅ User release another user's reservation → 403
✅ ADMIN can release any reservation → 200
✅ PATCH /inventory qty > 1,000,000 → 400
✅ Reserve negative quantity → 400

ABUSE PROTECTION
✅ Velocity limit exceeded → 429 RESERVATION_VELOCITY_EXCEEDED
✅ User reservation count > max → 429 RESERVATION_LIMIT_EXCEEDED
✅ Quantity > maxReservationQtyPerRequest → 400 QUANTITY_LIMIT_EXCEEDED
✅ IP velocity limit → 429 IP_RATE_LIMIT_EXCEEDED

RESERVATION LIFECYCLE
✅ Reserve → ACTIVE status in DB
✅ Release (ORDER_CANCELLED) → CANCELLED status
✅ Release (PAYMENT_FAILED) → RELEASED status
✅ Expiry worker → EXPIRED status
✅ Consume (mock Sprint 4) → CONSUMED status
✅ Every status transition creates InventoryMovement (APPEND-ONLY)
✅ MovementRepository has no update() or delete() methods

STOCK INTEGRITY
✅ Inventory.quantity NEVER goes below 0
✅ Inventory.reservedQty NEVER exceeds original quantity
✅ sum(active_reservation.qty) === inventory.reservedQty
✅ EXPLAIN ANALYZE: idx_inv_prod used for product-based lookups
✅ EXPLAIN ANALYZE: idx_invres_active_expiry used for expiry worker query
✅ EXPLAIN ANALYZE: idx_inv_updated_at used for incremental reconciliation

EVENTS & OUTBOX
✅ Reserve → EventOutbox InventoryReserved (dedup key: inv-reserved-{id})
✅ Release → EventOutbox InventoryReleased (dedup key: inv-released-{id})
✅ LowStock → EventOutbox InventoryLowStock (monthly dedup key)
✅ StockUpdate → EventOutbox InventoryChanged (version-based dedup key)
✅ All dedup keys deterministic — NO timestamps in keys
✅ Retry of reserve → NO duplicate EventOutbox entry (idempotency hit)

SELLER FLOW
✅ PATCH /inventory/:productId → stock updated, InventoryMovement created
✅ GET /inventory/seller → paginated list with isLowStock sorting
✅ GET /inventory/:productId/movements → movement history (cursor-paginated)
✅ Seller inventory screen shows red badge for low stock
✅ SegmentInventoryPolicy seeded for TEXTILE + SPARE_PARTS

WORKERS
✅ Expiry worker registered: cron */5 * * * *
✅ Snapshot worker registered: cron 0 2 * * *
✅ Reconciliation worker registered: cron 0 * * * *
✅ Low-stock alert worker: deduplicated (1h Redis TTL)
✅ Expiry batch full → immediate re-run scheduled (1s delay)

PROTECTION MODES
✅ READ_ONLY mode → 503 on all reserve attempts
✅ DEGRADED mode → reserve uses DB-only path, max retries 5
✅ NORMAL mode → full path with Redis lock
✅ Redis failure count > threshold → auto-transition to DEGRADED

OBSERVABILITY
✅ inventory_reservation_success_total increments on success
✅ inventory_reservation_failure_total{reason} increments on failure
✅ inventory_optimistic_lock_retry_total increments on version conflict
✅ inventory_drift_detected gauge = 0 on fresh system
✅ inventory_oversell_prevented_total = 0 throughout all tests
✅ Pino structured logs: all reserve/release/expiry/drift events logged

FRONTEND
✅ Product detail: stock status polling (30s interval)
✅ Seller inventory: isLowStock badge in red
✅ Stock edit modal: saves and shows updated quantity
✅ Movement history: loads with cursor pagination

QUALITY
✅ pnpm typecheck → zero errors (entire monorepo)
✅ pnpm test → all tests passing (unit + integration + concurrency)
✅ pnpm lint → zero errors
✅ Coverage ≥ 80% for inventory module
✅ No console.log in inventory module (structured logger only)
✅ No raw SQL outside $queryRaw<typed> with Prisma.sql tag
```

---

## SECTION 26: FAILURE CONDITIONS

Sprint 3 is FAILED if ANY of the following occur:

| Failure | Severity |
|---|---|
| Oversell in any concurrency test | BLOCKING — CRITICAL |
| inventory.quantity < 0 at any point | BLOCKING — CRITICAL |
| Lock key uses productId instead of inventoryId | BLOCKING — ARCHITECTURAL DRIFT |
| release() throws on double-call | BLOCKING — IDEMPOTENCY VIOLATION |
| reserve() creates duplicate movements on retry | BLOCKING |
| EventOutbox deduplication key uses timestamp | BLOCKING |
| MovementRepository has update() or delete() methods | BLOCKING |
| Seller can modify another seller's inventory | BLOCKING — CRITICAL |
| InventoryReservation not in same $transaction as quantity decrement | BLOCKING |
| Expiry worker is not idempotent | BLOCKING |
| No Idempotency-Key enforcement on /reserve | BLOCKING |
| TypeScript errors in any inventory module file | BLOCKING |
| Any failing test | BLOCKING |
| Lock released BEFORE $transaction commits | BLOCKING — CRITICAL |
| computeReservationTtl() not used (hardcoded TTL values) | HIGH |
| AbuseGuard bypassed (not called before lock acquisition) | HIGH |
| Redis lock NOT using Lua compare-and-delete | HIGH |
| SegmentInventoryPolicy not seeded | HIGH |
| All three cron workers not registered | HIGH |
| EXPLAIN ANALYZE shows Seq Scan on hot queries | HIGH |
| Protection mode not checked before reserve | HIGH |
| Incremental reconciliation not implemented (full scan only) | MEDIUM |
| Event version not included in EventOutbox payload | MEDIUM |
| Reservation ownership fields missing | MEDIUM |

---

## SECTION 27: SPRINT 3 → SPRINT 4 HANDOFF

When Sprint 3 validation gate fully passes:

### 27.1 Update Current Phase

```bash
# Update CURRENT_PHASE.md:
# - Sprint 3: ALL tasks → DONE
# - Sprint 4: tasks → NOT STARTED
# - Current Sprint: 4
# Commit: docs: Sprint 3 complete — Sprint 4 begins
```

### 27.2 InventoryModule Public Contract for Sprint 4

```typescript
// What InventoryModule EXPORTS for Sprint 4 OrderModule:

// Main facade — Sprint 4 uses ONLY these methods:
interface InventoryServicePublicInterface {
  reserve(input: ReserveStockInput): Promise<ReserveStockResult>;
  release(reservationId: string, reason: ReleaseReason, actorId: string): Promise<ReleaseResult>;
  releaseAllForOrder(orderId: string, reason: ReleaseReason, actorId: string): Promise<ReleaseResult[]>;
  consume(reservationId: string, actorId: string, tx: PrismaTransactionClient): Promise<void>;
  getAvailability(productId: string, segment: Segment): Promise<InventoryAvailabilityResponse>;
}

// Sprint 4 OrderService.createOrder() will call:
const reservation = await inventoryService.reserve({
  productId,
  quantity,
  requestedBy: userId,
  idempotencyKey: `order-${orderId}-product-${productId}`,  // deterministic
  orderId,
  segment,
  ipHash,
  orderType: 'ORDER',
  paymentMethod: order.paymentMethod,
});

// On payment success:
await inventoryService.consume(reservation.reservationId, userId, tx);

// On payment fail:
await inventoryService.release(reservation.reservationId, 'PAYMENT_FAILED', userId);

// On order cancel:
await inventoryService.releaseAllForOrder(orderId, 'ORDER_CANCELLED', userId);
```

### 27.3 Sprint 4 Required Reading

```
Before Sprint 4 code:
  1. This document (Section 27 — public interface)
  2. architecture/workflows/11. VyaparNet_Workflow_Sequence_Diagrams_v1.md — Section 7.1 (Order Placement)
  3. architecture/database/6. VyaparNet_SCHEMA_v4.3_FINAL_FREEZE.md — Order, OrderItem, Cart, Payment
  4. implementation/sprint-packs/SPRINT2_IMPLEMENTATION_LOCKED_final_v2.0.md — patterns to follow
  5. context/LOCKED_DECISIONS.md — Section 3 (payment safety rules)
```

### 27.4 Known Sprint 4 Coupling Points

```
Sprint 4 MUST ensure:
  - inventoryService.reserve() is called BEFORE order.status transitions to PLACED
  - inventoryService.consume() is called WITHIN the payment capture $transaction
  - inventoryService.release() is called on ALL payment failure scenarios
  - InventoryModule is imported by OrderModule — NOT the reverse

Sprint 4 MUST NOT:
  - Import InventoryRepository, ReservationRepository directly
  - Write to Inventory, InventoryReservation, InventoryMovement directly
  - Bypass InventoryService facade for any inventory operation
```

---

**END OF SPRINT 3 IMPLEMENTATION LOCKED v2.0**

---

*Zero-oversell guarantee is a product promise. This architecture treats it as such.*

*Every decision in this document — inventory-level locking granularity, Lua CAS release, dynamic TTL computation, bucketed expiry, incremental reconciliation, multi-dimensional abuse protection, degraded mode governance, event version evolution rules, saga compensation philosophy — exists to keep that promise under every failure mode, at every scale, for every future segment.*

*No Sprint 4 implementation begins until Sprint 3 validation gate passes with ZERO failures.*

*This document is the ONLY implementation authority for Sprint 3.*
