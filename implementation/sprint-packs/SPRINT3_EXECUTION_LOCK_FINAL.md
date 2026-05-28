# VYAPARNET — SPRINT 3 EXECUTION LOCK FINAL
## Inventory Management: Zero-Oversell Guarantee
### Version: v3.0 EXECUTION LOCK | Post-Consolidation Hardening | AI-Agent-Safe
### Authority: SPRINT_3_IMPLEMENTATION_LOCKED.md v2.0 + SPRINT_3_ORCHESTRATION.md v1.0 + All Architecture Freezes
### Date: 2026-05-28 | Status: FINAL — ALL PREVIOUS SPRINT 3 DOCUMENTS SUPERSEDED

> **SUPERSESSION NOTICE**: This document fully replaces:
> - `sprint3.md` (original — ARCHIVE)
> - `SPRINT_3_IMPLEMENTATION_LOCKED.md` (hardened architecture — REFERENCE ONLY)
> - `SPRINT_EXECUTION_LOCK_FINAL.MD` v1.0 (execution plan — REPLACED BY THIS DOCUMENT)
>
> This is the **ONLY** implementation authority for Sprint 3.
> All agents, engineers, and reviewers MUST use THIS document exclusively.

---

## DOCUMENT INDEX

- [§0  GLOBAL NON-NEGOTIABLE SYSTEM INVARIANTS](#0-global-non-negotiable-system-invariants)
- [§1  Sprint Identity](#1-sprint-identity)
- [§2  Required Context Files](#2-required-context-files)
- [§3  Transaction Boundary Governance](#3-transaction-boundary-governance)
- [§4  Cache Authority Governance](#4-cache-authority-governance)
- [§5  Server Time Authority Governance](#5-server-time-authority-governance)
- [§6  EventOutbox Deduplication Governance](#6-eventoutbox-deduplication-governance)
- [§7  Architectural Philosophy & Seven-Layer Defense](#7-architectural-philosophy--seven-layer-defense)
- [§8  Redis Key Registry & Lock Protocol](#8-redis-key-registry--lock-protocol)
- [§9  Schema Foundation](#9-schema-foundation)
- [§10 Module Structure & Boundaries](#10-module-structure--boundaries)
- [§11 Concurrency Architecture](#11-concurrency-architecture)
- [§12 Reservation TTL & Policy Governance](#12-reservation-ttl--policy-governance)
- [§13 Reservation Ownership Model](#13-reservation-ownership-model)
- [§14 Degraded Mode & Protection State Machine](#14-degraded-mode--protection-state-machine)
- [§15 Abuse Protection Architecture](#15-abuse-protection-architecture)
- [§16 Reconciliation & Snapshot Architecture](#16-reconciliation--snapshot-architecture)
- [§17 Event Versioning Governance](#17-event-versioning-governance)
- [§18 Saga Governance & Sprint 4 Contract](#18-saga-governance--sprint-4-contract)
- [§19 Hot Product Contention Strategy](#19-hot-product-contention-strategy)
- [§20 Detailed Implementation Reference](#20-detailed-implementation-reference)
- [§21 Zod DTOs](#21-zod-dtos)
- [§22 Queue Configuration](#22-queue-configuration)
- [§23 Caching Strategy](#23-caching-strategy)
- [§24 Frontend](#24-frontend)
- [§25 Observability](#25-observability)
- [§26 Failure Handling & Security](#26-failure-handling--security)
- [§27 Phased Execution Plan](#27-phased-execution-plan)
- [§28 Sprint Validation Gate](#28-sprint-validation-gate)
- [§29 Failure Conditions](#29-failure-conditions)
- [§30 Sprint 3 → Sprint 4 Handoff](#30-sprint-3--sprint-4-handoff)
- [§31 Universal Agent Implementation Prompt](#31-universal-agent-implementation-prompt)
- [§32 Sprint 3 Final Audit Prompt](#32-sprint-3-final-audit-prompt)
- [§33 Governance Rules](#33-governance-rules)
- [§34 AI-Agent Implementation Warnings](#34-ai-agent-implementation-warnings)
- [§35 Rollback & Operational Readiness](#35-rollback--operational-readiness)
- [§36 Future Scalability & Migration Notes](#36-future-scalability--migration-notes)

---

## §0 GLOBAL NON-NEGOTIABLE SYSTEM INVARIANTS

> **AUTHORITY STATUS: SUPREME**
> These invariants are the ultimate governance authority for Sprint 3.
> No phase, no sub-phase, no agent implementation, no performance optimization
> may violate any invariant listed here. EVER.
> If any code path violates any invariant, it is ARCHITECTURALLY INVALID regardless
> of whether it passes tests or deploys successfully.

---

### INV-1: DB Transaction is the ONLY Correctness Authority

```
The PostgreSQL $transaction is the single source of truth for inventory state.

At all times:
  inventory.quantity  = actual available units
  inventory.reservedQty = sum of all ACTIVE reservation quantities
  InventoryMovement   = append-only audit log of every stock change

NO OTHER SYSTEM may declare inventory state authoritative.
Redis cache is display optimization ONLY.
API response is derived from DB truth ONLY.
Frontend state is ephemeral ONLY.
```

**Violation signals**: Reading from Redis cache to make a reservation decision. Using cached quantity to determine if a reservation is valid. Trusting client-sent inventory data.

---

### INV-2: Inventory Quantity is Non-Negative — Forever

```
inventory.quantity   MUST ALWAYS be >= 0
inventory.reservedQty MUST ALWAYS be >= 0
inventory.quantity + inventory.reservedQty <= original_total_stock

At no point in time — during a transaction, after a transaction, after a crash,
after a Redis failure, after a worker crash — may quantity become negative.
```

**Verification SQL** (run after every test suite):
```sql
SELECT id, product_id, quantity, reserved_qty
FROM "Inventory"
WHERE quantity < 0 OR reserved_qty < 0;
-- MUST return ZERO rows
```

**Violation signals**: Any path that decrements without the `quantity: { gte: qty }` guard. Any release path that fails silently after marking reservation released without a CRITICAL log.

---

### INV-3: Atomic Mutation Bundle — No Partial Writes

```
Every inventory write MUST atomically bundle ALL of the following inside ONE $transaction:
  a. inventory.quantity decrement (or increment on release)
  b. InventoryReservation create (or status update on release)
  c. InventoryMovement create (APPEND-ONLY — see INV-7)
  d. EventOutbox create (with deterministic dedup key — see §6)

If ANY of these four fail, the $transaction rolls back and NONE persist.
There is no acceptable partial-write state.
```

**Violation signals**: Creating InventoryMovement outside a $transaction. Calling EventOutbox.create() outside a $transaction. Updating inventory quantity without creating a movement.

---

### INV-4: Lock Acquired BEFORE Transaction — Released AFTER Commit

```
Redis distributed lock MUST be:
  - Acquired:  BEFORE any $transaction begins
  - Released:  AFTER $transaction.commit() completes (inside withLock() finally block)

FORBIDDEN:
  - Releasing lock inside $transaction callback
  - Releasing lock before $transaction resolves
  - Acquiring lock inside $transaction callback

WHY: If lock is released before commit, another process can enter the
critical section and observe inconsistent pre-commit DB state,
defeating the serialization guarantee.
```

**Violation signals**: Any `lockService.release()` call inside `prisma.$transaction(async (tx) => { ... })`. Lock token not passed through `withLock()` finally.

---

### INV-5: Optimistic Locking Version Check — Mandatory on All Stock Mutations

```
ALL inventory quantity mutations MUST include a version check:

  UPDATE "Inventory"
  SET quantity = quantity - qty,
      version  = version + 1
  WHERE id = ? AND version = ?   ← MANDATORY

If updated rows = 0 → ConcurrencyException → retry (up to maxRetries from OperationalParams)
If maxRetries exhausted → 409 CONCURRENT_UPDATE

This check is MANDATORY even when Redis lock is held.
Redis lock serializes at the application layer.
Optimistic locking is the DB-level safety net.
Both layers MUST be active in NORMAL mode.
```

**Violation signals**: updateMany without version in WHERE clause. decrement that does not check result.count === 0.

---

### INV-6: Idempotency Key is the First Operation

```
The idempotency key check MUST be the VERY FIRST await in reserve().
Order is non-negotiable:

  1. Redis GET inv_idem:{key}  ← FIRST (no lock, no DB, no policy, nothing before this)
  2. Protection mode check
  3. Policy load + TTL computation
  4. Abuse guard check
  5. Lock acquisition
  6. $transaction (with FOR UPDATE + version check)
  7. Redis SETEX idempotency cache AFTER $transaction commits

Idempotency cache SET must happen OUTSIDE and AFTER $transaction.
If the cache SET fails (Redis down), correctness is maintained by DB —
the reservation exists, the client may retry and get a fresh result.
```

**Violation signals**: Any Redis, DB, or lock operation before the idempotency GET. Idempotency SETEX inside $transaction callback.

---

### INV-7: InventoryMovement and InventorySnapshot are Append-Only — Forever

```
InventoryMovement and InventorySnapshot are IMMUTABLE AUDIT RECORDS.

movement.repository.ts:   ZERO update() or delete() methods — EVER
snapshot.repository.ts:   ZERO update() or delete() methods — EVER

Comment MUST appear at top of each file:
  // APPEND-ONLY: This repository has no update or delete methods by design.
  // Inventory movement history is an immutable audit log.

No business requirement, no performance optimization, no sprint deliverable
may add mutation methods to these repositories.
```

**Violation signals**: Any method other than create() and read methods in movement.repository.ts or snapshot.repository.ts.

---

### INV-8: Reservation Expiry MUST Use DB Server Time

```
expiresAt is computed using DB server time ONLY:

  CORRECT:   new Date(Date.now() + reservationTtl * 1000)   ← API server time (acceptable)
  CORRECT:   SELECT now() + interval '900 seconds'          ← DB server time (preferred)

  FORBIDDEN: Client-sent expiry timestamp
  FORBIDDEN: Browser-generated expiry values
  FORBIDDEN: Frontend datetime input used as expiresAt

WHY: Clock skew between client and server can be seconds to minutes.
A client with a fast clock could generate an expiresAt far in the future,
creating reservations that never expire. A client with a slow clock could
create reservations that expire before the buyer can complete checkout.

In distributed systems with multiple API nodes, each node's system clock
can drift relative to the DB. All expiry computations MUST be anchored
to a single, trusted time source. The API server's Date.now() is acceptable
because the gap between server and DB time is small (<1s) compared to the
300–86400 second TTL range.
```

**Violation signals**: Any `req.body.expiresAt` or `dto.expiresAt` used directly. Any frontend datetime picker value passed as reservation expiry.

---

### INV-9: Degraded Mode Maintains Correctness — Never Reduces It

```
When Redis is unavailable (DEGRADED mode):
  - Redis lock is SKIPPED (skipRedisLock = true)
  - DB-only path with optimistic locking (maxRetries = 5, extended delays)
  - Reservation TTL reduced to segment minimum (safety margin)
  - Throughput MAY be reduced (serialization is slower without lock)
  - Correctness is NEVER reduced

What DEGRADED mode MUST NOT do:
  - Skip the $transaction
  - Skip the version check
  - Skip the InventoryMovement creation
  - Skip the EventOutbox entry
  - Trust any cached quantity value for reservation decisions
  - Allow oversell

The zero-oversell guarantee holds equally in NORMAL mode and DEGRADED mode.
```

**Violation signals**: Any code path that skips $transaction or version check when skipRedisLock=true.

---

### INV-10: Any Path Capable of Oversell is Invalid Architecture

```
A code path that CAN oversell — even rarely, even only under extreme concurrency,
even only when Redis and DB both have failures simultaneously — is INVALID.

Acceptable: 409 LOCK_UNAVAILABLE (client retries)
Acceptable: 422 INSUFFICIENT_STOCK (honest rejection)
Acceptable: 503 INVENTORY_READ_ONLY (maintenance mode)
NOT ACCEPTABLE: reservation.quantity > inventory.quantity

The system must fail loudly (error + metric + alert) rather than oversell quietly.

inventory_oversell_prevented_total metric MUST remain at 0 in production.
Any nonzero value requires immediate ops investigation.
```

**Violation signals**: Available quantity check outside of $transaction with FOR UPDATE. Any path that issues a reservation without verifying available >= quantity in the same atomic block.

---

### INV-11: Segment Isolation is Mandatory

```
ALL inventory queries scoped to buyer's segment.
A buyer in TEXTILE segment MUST NOT see or interact with SPARE_PARTS inventory.

All seller mutations scoped to their businessId.
Seller A MUST NOT modify Seller B's inventory.

Two-hop ownership verification on all seller mutations:
  userId → Business.ownerId → Inventory.businessId
  If chain breaks at any link → 403 FORBIDDEN
```

---

### INV-12: InventoryModule is the Sole Authority Over Inventory Data

```
No other module may:
  - Write to Inventory, InventoryReservation, InventoryMovement, InventorySnapshot
  - Import InventoryRepository, ReservationRepository, MovementRepository directly
  - Modify inventory state outside InventoryService public interface

OrderModule (Sprint 4) MUST:
  - Call InventoryService.reserve() — not write to DB directly
  - Call InventoryService.consume(tx) — inside its own $transaction
  - Call InventoryService.release() — not write to InventoryReservation directly
```

---

### INV-13: EventOutbox is the ONLY Cross-Module Communication Mechanism

```
InventoryModule communicates outcomes to the outside world EXCLUSIVELY through EventOutbox.

InventoryModule MUST NOT:
  - Call OrderService directly
  - Call NotificationService directly
  - Call PaymentService directly
  - Emit Node.js EventEmitter events for business-critical state changes
  - Make HTTP calls from within inventory service logic

All cross-module side effects flow through:
  EventOutbox (PENDING) → EventOutbox processor → downstream consumers

This ensures: replay safety, ordering guarantees, and decoupled evolution.
```

---

## §1 SPRINT IDENTITY

| Field | Value |
|---|---|
| Sprint Number | 3 |
| Sprint Name | Inventory Management: Zero-Oversell Guarantee |
| Document Version | v3.0 Execution Lock (Post-Consolidation Hardening) |
| Duration | 2 weeks (10 working days) |
| Status | READY TO EXECUTE — Sprint 2 gate must be fully passed |
| Preceded By | Sprint 2 — Marketplace Core Foundation |
| Followed By | Sprint 4 — Cart, Orders & Payments |
| Critical Path | YES — Sprint 4 calls `InventoryService.reserve()`. Sprint 3 wrong = Sprint 4 wrong. |
| Lock Authority | THIS DOCUMENT. No other document overrides it for Sprint 3. |

---

## §2 REQUIRED CONTEXT FILES

Every agent and engineer MUST read ALL of the following BEFORE writing a single line of code.

| Context Type | File | Why Required |
|---|---|---|
| Schema | `architecture/database/6. VyaparNet_SCHEMA_v4.3_FINAL_FREEZE.md` | Inventory, InventoryMovement, InventoryReservation, InventorySnapshot models |
| Indexing | `architecture/database/7. VyaparNet_Database_Indexing_Strategy_Official_Freeze_v1.md` — §§6.3, 12, 13 | idx_inv_prod, idx_invres_active_expiry, deadlock strategy |
| DB Infra | `architecture/database/5. VyaparNet_DB_Infra_Architecture.md` — §§3.5, 6.3, 8 | Concurrency, BullMQ governance, failure philosophy |
| Implementation | `architecture/implementation/8. VyaparNet_Implementation_Architecture_Official_Freeze_v1.md` — §§5, 7, 8, 20, 22 | Transaction boundary, queue, retry/DLQ/idempotency |
| Workflows | `architecture/workflows/11. VyaparNet_Workflow_Sequence_Diagrams_v1.md` — §5.1 | Inventory Reservation CRITICAL workflow |
| API Contracts | `architecture/api/9. VyaparNet_API_Contracts_Backend_Scaffold_Blueprint.md` — §4 | Inventory management APIs |
| Runtime | `architecture/runtime/12. VyaparNet_Deployment_Runtime_Architecture_v1.md` — §§9, 10, 14 | Redis, queue, security runtime |
| Governance | `context/LOCKED_DECISIONS.md` | Runtime rules, concurrency rules, module boundary rules |
| Sprint 2 Lock | `implementation/sprint-packs/SPRINT2_IMPLEMENTATION_LOCKED_final_v2.0.md` | ProductsModule patterns to follow |

---

## §3 TRANSACTION BOUNDARY GOVERNANCE

> **GOVERNANCE CLASS: CRITICAL — Zero Tolerance**
> Violations here cause deadlocks, data corruption, and lock-duration amplification.

### §3.1 The Transaction Boundary Rule

```
Inside prisma.$transaction(async (tx) => { ... }):

PERMITTED:
  ✅ DB reads:  tx.inventory.findFirst(...)
  ✅ DB writes: tx.inventory.updateMany(...)
  ✅ DB raw:    tx.$queryRaw<T>Prisma.sql`...`
  ✅ Synchronous computation (pure functions, Math, Date.now())
  ✅ Conditional logic, loops over already-fetched data

FORBIDDEN — ZERO EXCEPTIONS:
  ❌ Redis operations:      await this.redis.get(...) / set(...) / eval(...)
  ❌ HTTP calls:            await fetch(...) / axios.get(...)
  ❌ BullMQ operations:     await queue.add(...) / job.queue.add(...)
  ❌ EventEmitter emits:    this.eventEmitter.emit(...)
  ❌ File system:           fs.readFile(...) / fs.writeFile(...)
  ❌ Third-party SDKs:      await stripe.charges.create(...) / await fcm.send(...)
  ❌ Network awaits:        await dns.resolve(...) / await fetch(...)
  ❌ Other service calls:   await notificationService.send(...)
  ❌ setTimeout/setInterval
  ❌ Long-running async computation (ML inference, image processing, etc.)
```

### §3.2 Why These Are Forbidden — The Failure Modes

**Deadlock Risk (Redis inside $transaction)**

PostgreSQL holds row-level locks for the duration of the transaction. If the transaction awaits a Redis operation and Redis is slow or unavailable, the DB row locks are held for the entire duration. With 10 concurrent requests:
- Request A holds `FOR UPDATE` on Inventory row, awaits Redis
- Request B tries to acquire the same row, blocks
- Redis slow response = Requests B through J all blocked = thundering herd + lock queue buildup
- Worst case: Prisma P2024 transaction timeout (5000ms) = all 10 requests fail

**Contention Amplification (HTTP/external calls inside $transaction)**

Each external call adds its latency to the transaction lock duration. A payment provider call (200ms average, 2000ms on retry) inside a $transaction holding a stock quantity row lock means every concurrent user trying to reserve that product waits 200-2000ms per attempt. At high concurrency this collapses into serialized sequential processing with exponential queue growth.

**Lock Duration Explosion (BullMQ.add inside $transaction)**

BullMQ `queue.add()` may block on Redis connectivity. If Redis is slow, the BullMQ write blocks, the $transaction holds its DB locks, other transactions pile up. Additionally, if the BullMQ write succeeds but the $transaction later rolls back, a job has been queued for an action that never occurred — a phantom job that triggers incorrect downstream behavior.

**EventEmitter Race (EventEmitter.emit inside $transaction)**

If `this.eventEmitter.emit('InventoryReserved', payload)` fires inside a $transaction that subsequently rolls back, any synchronous listeners have already processed an event that should never have happened. This is a classic TOCTOU (time-of-check/time-of-use) violation.

### §3.3 Correct Pattern: Post-Transaction Side Effects

```typescript
// CORRECT: All side effects are deferred until AFTER $transaction commits

async reserve(input: ReserveStockInput): Promise<ReserveStockResult> {
  // 1. Idempotency check (outside transaction — Redis operation)
  const cached = await this.redis.get(idempKey).catch(() => null);
  if (cached) return JSON.parse(cached);

  // 2. Policy, abuse guard (outside transaction — Redis operations, DB reads)
  const policy = await this.policyService.getPolicy(input.segment);
  await this.abuseGuard.check(ctx);

  // 3. Lock (outside transaction)
  await this.lockService.withLock(inventory.id, async () => {

    // 4. ONLY DB operations inside $transaction
    const result = await this.prisma.$transaction(async (tx) => {
      const inv = await this.inventoryRepo.findByProductIdWithLock(productId, tx);
      await this.inventoryRepo.decrementQuantityWithVersion(inv.id, qty, inv.version, tx);
      await this.reservationRepo.create({ ... }, tx);
      await this.movementRepo.create({ ... }, tx);
      await tx.eventOutbox.create({ ... });   // ← deferred to EventOutbox processor
      return buildResult(inv, reservation);
    }, { isolationLevel: 'ReadCommitted', timeout: 5000 });

    // 5. Redis idempotency cache (outside transaction — after commit)
    await this.redis.setex(idempKey, ttl, JSON.stringify(result)).catch(() => {});
    // ↑ Failure acceptable: correctness maintained by DB. Client retry gets fresh result.
  });
}
```

### §3.4 Transaction Timeout Rule

```
ALL inventory $transactions MUST specify:
  timeout: 5000   // 5 seconds

WHY:
  Without timeout, a slow $transaction holds row locks indefinitely.
  5s is generous for DB operations only (no network calls allowed inside).
  P2024 timeout = auto-rollback = 503 returned to client.
  Client retries with backoff — correctness maintained.

If a $transaction legitimately needs > 5s:
  → It is doing something wrong (network call inside, no-index query, missing FOR UPDATE scope)
  → Fix the root cause; do not increase the timeout
```

### §3.5 Isolation Level Rule

```
ALL inventory $transactions MUST use:
  isolationLevel: 'ReadCommitted'

WITH SELECT FOR UPDATE on the specific Inventory row.

FOR UPDATE queries MUST target the smallest possible row scope.

FORBIDDEN:
- table-wide FOR UPDATE scans
- unbounded FOR UPDATE queries
- broad range-locking patterns

CORRECT:
Lock ONLY the specific Inventory row being mutated.

WHY:
Overscoped row locking causes:
- contention amplification
- throughput collapse
- deadlock probability increase
under hot-product conditions.

WHY NOT Serializable:
  Serializable isolation detects any phantom reads — requires full predicate locks.
  At high concurrency this causes excessive lock conflicts, retry storms,
  and serialization failures that Prisma surfaces as P2034 errors.
  The FOR UPDATE on a specific row gives stronger row-level protection
  than Serializable would provide for our use case.

WHY NOT RepeatableRead:
  Unnecessary overhead. Our transaction reads the inventory row once with FOR UPDATE.
  RepeatableRead's additional phantom protection is not needed here.

ReadCommitted + FOR UPDATE on specific row = correct isolation for inventory mutation.

### §3.6 Nested Transaction Governance

Inventory flows MUST NOT create nested Prisma transactions.

FORBIDDEN:
- calling prisma.$transaction() inside another active transaction
- service methods silently opening internal transactions when tx already exists
- transaction recursion across modules

WHY:
Nested transaction assumptions create:
- partial rollback confusion
- hidden lock amplification
- transaction lifecycle ambiguity
- inconsistent retry behavior

RULE:
If a parent transaction already exists,
child operations MUST reuse the provided tx client.

Sprint 4 consume() already follows this pattern correctly.
```

---

## §4 CACHE AUTHORITY GOVERNANCE

> **GOVERNANCE CLASS: HIGH — Misuse causes silent correctness violations**

### §4.1 The Cache Authority Rule

```
Redis cache is DISPLAY OPTIMIZATION ONLY.

Redis cache is NEVER:
  - Source of truth for inventory quantity
  - Authority for reservation decisions
  - Input to optimistic locking version checks
  - Basis for stock availability calculation in the reservation path
  - Substitute for a DB read in any write operation

Redis cache IS:
  - Fast path for "is this product in stock?" badge on product listing page
  - TTL-bounded display hint (30s stale is acceptable for UI badges)
  - Policy lookup acceleration (SegmentInventoryPolicy, 300s TTL)
  - Idempotency result cache (after successful reservation, before duplicate retry)
```

### §4.2 Why Cache Cannot Be Authoritative — The Eventual Consistency Problem

```
inv_stock:{productId} holds the quantity value at the time it was last written.
Between the cache write and the cache read:
  - Another process may have reserved units (decrement not reflected)
  - A seller may have updated stock (new value not yet propagated)
  - A reservation may have expired and been released (increment not reflected)
  - The cache may have been invalidated and not yet refreshed

If a reservation decision is based on cached quantity:
  - 10 concurrent requests see cached qty=5
  - All 10 pass the "qty >= requested" check
  - All 10 proceed to DB
  - Only 5 units exist — 5 will oversell

The $transaction with FOR UPDATE is the ONLY mechanism that correctly
serializes concurrent stock checks with the corresponding decrement.
```

### §4.3 Forbidden Cache Uses

```
EXPLICITLY FORBIDDEN — any agent writing this code has violated INV-1:

// ❌ FORBIDDEN: Using cached quantity for reservation decision
const cached = await this.redis.get(`inv_stock:${productId}`);
if (parseInt(cached) < quantity) throw new Error('Insufficient stock');
// ^ This is display-only data. It cannot be used for correctness decisions.

// ❌ FORBIDDEN: Skipping DB read because cache "looks fresh"
if (cache && cacheAge < 5000) {
  return cache.quantity; // Never. Always read from DB for mutations.
}

// ❌ FORBIDDEN: Optimistic lock using cached version
const cachedInventory = JSON.parse(await redis.get('inv:' + id));
decrementWithVersion(id, qty, cachedInventory.version, tx); // Stale version → version conflict guaranteed
```

### §4.4 Correct Cache Usage Patterns

```typescript
// ✅ CORRECT: Cache for display only
async getAvailability(productId: string, segment: Segment): Promise<InventoryAvailabilityResponse> {
  const cacheKey = `inv_stock:${productId}`;
  const cached = await this.redis.get(cacheKey).catch(() => null);
  if (cached) return JSON.parse(cached); // 30s stale is acceptable for badge display

  const inventory = await this.inventoryRepo.findByProductId(productId);
  const result = buildAvailabilityResponse(inventory);
  await this.redis.setex(cacheKey, 30, JSON.stringify(result)).catch(() => {});
  return result;
}

// ✅ CORRECT: Always read from DB for reservation path (never from cache)
async reserve(input: ReserveStockInput): Promise<ReserveStockResult> {
  // NO cache read here — straight to DB inside $transaction with FOR UPDATE
  return this.prisma.$transaction(async (tx) => {
    const inventory = await this.inventoryRepo.findByProductIdWithLock(input.productId, tx);
    // ^ This is the authoritative read. FOR UPDATE ensures no concurrent modification.
    ...
  });
}
```

### §4.5 Cache Invalidation Rules

```
After seller PATCH /inventory/:productId:
  → DEL inv_stock:{productId}  (immediate, inside $transaction via EventOutbox)
  → DEL inv_policy:{segment}   (if policy was changed — admin endpoint only)

After successful reserve():
  → DEL inv_stock:{productId}  (async, best-effort, outside $transaction)

After successful release():
  → DEL inv_stock:{productId}  (async, best-effort, outside $transaction)

Fallback: if DEL fails, the 30s TTL expires naturally.
The 30s stale window is acceptable — it only affects display badges, not correctness.
```

---

## §5 SERVER TIME AUTHORITY GOVERNANCE

> **GOVERNANCE CLASS: HIGH — Violations cause un-expirable reservations or premature expiry**

### §5.1 The Server Time Rule

```
ALL reservation expiry timestamps MUST be computed using:
  - API server time: new Date(Date.now() + ttlSeconds * 1000)   [CORRECT]
  - DB server time:  SELECT now() + interval '{N} seconds'      [PREFERRED]

FORBIDDEN as expiry input:
  ❌ Frontend/browser-generated timestamps (req.body.expiresAt)
  ❌ Client-sent datetime values from any API input
  ❌ Mobile app-generated timestamps
  ❌ Any Zod schema that accepts expiresAt as an input field

expiresAt MUST NEVER appear in:
  - ReserveInventorySchema input fields
  - ReleaseInventorySchema input fields
  - Any DTO that flows from client to server for inventory operations
```

### §5.2 Why Client Time is Unsafe — The Clock Skew Problem

**Scenario A: Client clock is fast (+10 minutes ahead)**

A malicious or misconfigured client sends `expiresAt: now + 24h` instead of the server-computed `now + 15min`. The reservation holds stock for 24 hours instead of 15 minutes. The product appears out of stock to all other buyers for 23h45m. This is an effective hoarding attack with no abuse guard catching it.

**Scenario B: Client clock is slow (−5 minutes behind)**

Client computes `expiresAt: clientNow + 15min`. Server receives it. DB's `now()` is already 5 minutes past the client's "now". The expiry worker immediately picks this up as expired and releases it — potentially while the buyer is still in checkout. False expiry = lost sale.

**Scenario C: Distributed API nodes with clock drift**

In a multi-node deployment, API node A computes `Date.now()` as T=0. API node B has drifted 3 seconds forward. Reservation created on node A is checked by expiry worker running on node B. The 3-second drift is insignificant for TTLs >= 300s (5 minutes). This is the only acceptable drift — internal server-to-server drift within a controlled infrastructure.

**The Rule**: Server time (DB or API) is the only trusted clock. No exception.

### §5.3 Correct Implementation

```typescript
// ✅ CORRECT: Server-side time computation inside $transaction
private async executeReservationTransaction(input, inventoryId, reservationTtl) {
  return this.prisma.$transaction(async (tx) => {
    // ...
    // expiresAt computed server-side with server's Date.now()
    const expiresAt = new Date(Date.now() + reservationTtl * 1000);
    const reservation = await this.reservationRepo.create({
      ...
      expiresAt,  // server-computed — never from client
    }, tx);
    // ...
  });
}

// ✅ CORRECT: Expiry worker uses DB server time for comparison
async findExpiredActive(batchSize: number): Promise<InventoryReservation[]> {
  return this.prisma.inventoryReservation.findMany({
    where: {
      status: 'ACTIVE',
      expiresAt: { lt: new Date() }, // new Date() = API server time — acceptable
    },
    ...
  });
}
```

---

## §6 EVENTOUTBOX DEDUPLICATION GOVERNANCE

> **GOVERNANCE CLASS: HIGH — Violations cause duplicate events, incorrect downstream state, data loss on retry**

### §6.1 The Deduplication Key Rule

```
ALL EventOutbox entries for inventory events MUST use DETERMINISTIC deduplication keys.

Sprint 3 canonical deduplication keys (these are LOCKED — do not invent new patterns):

  InventoryReserved:   inv-reserved-{reservationId}
  InventoryReleased:   inv-released-{reservationId}
  InventoryConsumed:   inv-consumed-{reservationId}
  InventoryChanged:    inv-changed-{inventoryId}-v{newVersion}
  InventoryLowStock:   inv-low-stock-{inventoryId}-{YYYY-MM}   (monthly dedup)
  InventoryDrift:      inv-drift-{inventoryId}-{YYYY-MM-DD}    (daily dedup)

FORBIDDEN in deduplication keys — ZERO EXCEPTIONS:
  ❌ Date.now()
  ❌ new Date().toISOString()
  ❌ Math.random()
  ❌ crypto.randomUUID()    (for dedup keys — fine for lock tokens)
  ❌ Any timestamp, epoch, or non-deterministic value
```

### §6.2 Why Deterministic Keys Are Mandatory

**Replay Safety**: EventOutbox processors will replay events on failure. If the dedup key is `inv-reserved-{reservationId}-${Date.now()}`, every retry creates a unique key and every replay inserts a new event. Downstream consumers receive the same InventoryReserved event multiple times and may double-count stock, send duplicate notifications, or create duplicate orders.

**Idempotent Retry**: When a $transaction commits but the response is lost (network failure between DB commit and HTTP response to client), the client retries. The retry's idempotency key returns the cached result (no new DB write). But if the EventOutbox processor also retried, two InventoryReserved events with different dedup keys would be emitted — one legitimate, one phantom.

**Eventual Consistency Safety**: EventOutbox consumers may process events out of order or multiple times (at-least-once delivery). A deterministic dedup key allows the consumer to detect and skip a previously processed event. A non-deterministic key makes this impossible.

**Worker Retry Implications**: BullMQ retries failed EventOutbox processing jobs. With deterministic keys, the DB's UNIQUE constraint on deduplicationKey prevents duplicate rows. With non-deterministic keys, each retry attempt inserts a new row — the dedup mechanism is completely bypassed.

### §6.3 Event Envelope Schema (All Events MUST Include)

```typescript
// Every EventOutbox.create() in the inventory module MUST have:
{
  eventType: string,            // e.g. 'InventoryReserved' — PascalCase past tense
  eventVersion: '1.0',         // string (e.g. "1.0", "1.1", "2.0") — NOT a number
  schemaVersion: '4.3',        // Prisma schema version at emission time
  payload: { ... },            // event-specific payload
  deduplicationKey: string,    // DETERMINISTIC (see §6.1 table)
  eventMonth: 'YYYY-MM',       // for partition-aware queries
  status: 'PENDING',           // EventOutbox initial state
}
```

### §6.4 Event Version Evolution Policy

```
MINOR VERSION (1.0 → 1.1): backward compatible only.
  - Add new OPTIONAL fields to payload
  - NEVER remove existing fields
  - NEVER rename existing fields
  - Consumer: if field missing, use default (null or sensible fallback)

MAJOR VERSION (1.x → 2.0): breaking change.
  - Dual-publish: emit BOTH v1.x and v2.0 simultaneously during migration window
  - Migration window: minimum 30 days
  - Consumer must declare which version it consumes
  - v1.x retirement: only after ALL consumers have migrated and verified

SPRINT 3 CURRENT VERSION: eventVersion: "1.0", schemaVersion: "4.3"
No version change is needed within Sprint 3.
```

---

## §7 ARCHITECTURAL PHILOSOPHY & SEVEN-LAYER DEFENSE

### §7.1 The Fundamental Contract

Sprint 3 makes one guarantee that is non-negotiable and absolute:

> **For any product with quantity Q, at most Q simultaneous order placements will succeed. Zero exceptions. Zero edge cases. Under any failure mode.**

This guarantee holds under:
- Redis failures (formally governed degraded mode — §14)
- DB contention (optimistic locking retry with exponential backoff — §11)
- Worker crashes (idempotent compensation on next run — §16)
- Network retries (idempotency keys — INV-6)
- Duplicate queue jobs (deduplication keys — §6)
- Partial transaction failures (atomic rollback — §3)
- Reservation expiry races (deterministic release — §20)
- Hot product spikes (adaptive contention strategy — §19)
- Abuse attempts (velocity limiting and anti-hoarding — §15)

### §7.2 Seven-Layer Defense Architecture

```
Layer 1: Idempotency key (Redis, SET NX)
  → Prevents duplicate reservation from any network retry
  → Stored AFTER $transaction commits
  → Returns cached result immediately on hit — zero lock, zero DB

Layer 2: Abuse & Velocity Guard (§15)
  → Per-user, per-IP, per-business, per-product velocity check
  → Blocks reservation storms BEFORE any lock is attempted
  → Anti-hoarding: maxReservationsPerUser enforced here
  → Quantity limit: maxReservationQtyPerRequest enforced here

Layer 3: Redis distributed lock (inventory-level granularity)
  → Key: inv_lock:{inventoryId}  (NOT productId — finer granularity)
  → Lock token: crypto.randomUUID() — only owner can release
  → TTL: 30s — auto-expires on process crash
  → Release: Lua CAS (atomic compare-and-delete) — never plain DEL

Layer 4: DB transaction with SELECT FOR UPDATE
  → Row-level lock on specific Inventory record
  → Held only during transaction (ReadCommitted isolation)
  → Prevents lost-update within the transaction window

Layer 5: Optimistic locking (version column)
  → UPDATE ... WHERE version = N — detects concurrent write
  → 0 rows updated → ConcurrencyException → retry (max from OperationalParams)
  → Exponential backoff per OperationalParams (not hardcoded)

Layer 6: InventoryReservation record with TTL
  → Tracks every reservation with expiresAt (server-computed — §5)
  → Ownership chain: reservedByUserId + reservedByBusinessId
  → Enables release on cancel / payment-fail / expiry

Layer 7: InventorySnapshot + incremental reconciliation (§16)
  → Periodic snapshot with drift detection
  → Alerts on: actual quantity ≠ expected from movements
  → Incremental — scales to millions of products

Any single layer may fail. The system remains correct.
```

### §7.3 Twelve Absolute Constraints

```
 1. Inventory writes are ALWAYS in $transaction.
    quantity decrement + reservation creation + movement log + event outbox = atomic unit.

 2. Redis lock acquired BEFORE $transaction begins.
    Lock released AFTER $transaction commits (withLock() finally block — never inside tx).

 3. Lock key is inventory-level: inv_lock:{inventoryId}, NOT inv_lock:{productId}.

 4. Optimistic locking version check INSIDE $transaction.
    UPDATE ... WHERE version = N → 0 rows → ConcurrencyException → retry.

 5. No quantity decrement without InventoryMovement.
    Every stock change creates an immutable InventoryMovement. No exceptions.

 6. Idempotency key check is the VERY FIRST operation in reserve().
    If hit → return cached result. Zero lock. Zero DB. Zero retry.

 7. Reservation expiry is idempotent.
    Running expiry job twice on same reservation = same outcome.

 8. Release is idempotent.
    Terminal state reservation → return { alreadyReleased: true } NOT an error.

 9. Seller ownership is two-hop verified.
    userId → Business.ownerId → Business.id → Inventory.businessId.

10. Segment isolation on all inventory queries.

11. InventorySnapshot NEVER written by application code.
    Written ONLY by cron worker. Never in-line with business transactions.

12. computeReservationTtl(context) governs ALL TTL decisions.
    No hardcoded TTL values in business logic. Policy-driven. Segment-extensible.
```

### §7.4 Segment Extensibility Contract

```
InventoryEngine is segment-agnostic.
NO TEXTILE/SPARE_PARTS conditional logic anywhere in inventory code.

Segment-specific inventory rules live ONLY in SegmentInventoryPolicy (DB-driven):
  segment, maxReservationTtlSeconds, maxReservationsPerUser,
  allowBackorder, allowVirtualStock, lowStockThresholdPercent,
  maxReservationQtyPerRequest, reservationVelocityLimitPerHour, isActive

Sprint 3 seeds:
  TEXTILE:     { maxReservationTtl: 900s, maxReservationsPerUser: 5,  maxQtyPerRequest: 500  }
  SPARE_PARTS: { maxReservationTtl: 900s, maxReservationsPerUser: 10, maxQtyPerRequest: 1000 }

Future PHARMA (zero code changes — only a new DB seed row):
  PHARMA:      { maxReservationTtl: 1800s, requiresLotTracking: true, maxQtyPerRequest: 100 }

Future RFQ segment (zero code changes):
  RFQ:         { maxReservationTtl: 86400s, paymentMethod: 'CREDIT', requiresApproval: true }

The computeReservationTtl(context) function reads from SegmentInventoryPolicy.
No TTL is ever hardcoded outside SegmentInventoryPolicy defaults.
```

---

## §8 REDIS KEY REGISTRY & LOCK PROTOCOL

### §8.1 Complete Redis Key Registry

```
KEY: inv_idem:{idempotencyKey}
  Value:  JSON serialized ReserveStockResult
  TTL:    Matches reservation TTL (dynamic, from computeReservationTtl)
  Owner:  InventoryReserveService
  Set:    AFTER $transaction commits — never inside $transaction (§3 rule)
  Notes:  SET NX (atomic). Checked BEFORE lock. Never updated after set.

KEY: inv_lock:{inventoryId}           ← INVENTORY-LEVEL (not productId — §7.2 Layer 3)
  Value:  lockToken (crypto.randomUUID())
  TTL:    30s (safety TTL — guarantees release even on crash)
  Owner:  InventoryLockService
  Notes:  SET NX EX 30. ONLY deleted by Lua CAS (compare-and-delete). NEVER redis.del().

KEY: inv_stock:{productId}
  Value:  available quantity (integer as string)
  TTL:    30s (display-only — §4.1 Cache Authority Rule)
  Owner:  InventoryQueryService
  Notes:  NEVER authoritative. For UI badge display only. Never used in reservation decisions.

KEY: inv_low_stock:{inventoryId}
  Value:  '1' (flag)
  TTL:    3600s (1-hour dedup window)
  Owner:  ReservationExpiryWorker / LowStockAlertWorker
  Notes:  Prevents duplicate low-stock alerts per hour per inventory.

KEY: inv_policy:{segment}
  Value:  JSON serialized SegmentInventoryPolicy
  TTL:    300s
  Owner:  InventoryPolicyService
  Notes:  Policy lookup cache. Invalidated on admin policy update.

KEY: inv_velocity:{userId}:{segment}
  Value:  counter (INCR — atomic, no GET+SET)
  TTL:    3600s (1-hour rolling window)
  Owner:  InventoryAbuseGuard

KEY: inv_velocity_ip:{ipHash}
  Value:  counter (INCR)
  TTL:    3600s
  Owner:  InventoryAbuseGuard
  Notes:  ipHash is SHA-256 of IP. Raw IP never stored or logged.

KEY: inv_velocity_biz:{businessId}
  Value:  counter (INCR)
  TTL:    3600s
  Owner:  InventoryAbuseGuard

KEY: inv_protect_mode
  Value:  'NORMAL' | 'DEGRADED' | 'READ_ONLY'
  TTL:    None (persistent until ops clears)
  Owner:  InventoryProtectionModeService
  Notes:  Read on every reserve(). Auto-set to DEGRADED on Redis failure threshold.

KEY: inv_hot_product:{inventoryId}
  Value:  lock contention counter (INCR per failed lock attempt)
  TTL:    300s (5-minute rolling window)
  Owner:  InventoryLockService
  Notes:  Used for hot-product detection and alerting (§19).

KEY: inv_reconcile_checkpoint
  Value:  ISO 8601 timestamp of last reconciliation checkpoint
  TTL:    None (persistent)
  Owner:  InventoryReconcileService
  Notes:  Enables incremental reconciliation — only processes records changed since this point.
```

### §8.2 Lock Protocol — Inventory-Level Granularity

```
WHY INVENTORY-LEVEL (not product-level):
  inv_lock:{productId}   → All concurrent requests on a hot product serialize — extreme bottleneck
  inv_lock:{inventoryId} → Same correctness, better future granularity
  Future: variant/location-level inventory = different inventoryId = automatic fine-grained locks

ACQUIRE:
  lockToken = crypto.randomUUID()
  key = inv_lock:{inventoryId}
  result = redis.set(key, lockToken, 'EX', 30, 'NX')  // atomic set-if-not-exists
  if result === null:
    → incr inv_hot_product:{inventoryId} (contention tracking)
    → throw LockUnavailableException(retryAfterMs: 200)

RELEASE (Lua atomic compare-and-delete — the ONLY acceptable release mechanism):
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  else
    return 0   -- Lock already expired or taken by another request — safe
  end
  // result === 0: LOG.warn (do NOT throw)

withLock() — guaranteed release even on exception:
  async withLock<T>(inventoryId: string, fn: () => Promise<T>): Promise<T> {
    const lockToken = await this.acquire(inventoryId);
    try {
      return await fn();  // $transaction lives inside fn()
    } finally {
      await this.release(inventoryId, lockToken).catch(err => this.logger.error(...));
      // finally block: lock released AFTER fn() resolves — AFTER $transaction commits
    }
  }
```

### §8.3 Redis Down Fallback Protocol

```
DEGRADED MODE (Redis unavailable):
  → Skip Redis lock (skipRedisLock = true from OperationalParams)
  → DB-only path: rely solely on optimistic locking (version column)
  → Increase max retries to 5 (vs 3 on normal path)
  → Extended backoff: [200ms, 400ms, 800ms, 1600ms, 3200ms]
  → Log CRITICAL: 'Redis unavailable — inventory writes in degraded mode'
  → reportRedisFailure() → auto-transition to DEGRADED if > 50 failures in 60s

READ_ONLY MODE:
  → Block ALL reservation writes (503 INVENTORY_READ_ONLY)
  → Allow reads (stock check, movement history)
  → Triggered by: operator sets inv_protect_mode = 'READ_ONLY' (emergency maintenance)

CORRECTNESS GUARANTEE IN DEGRADED MODE:
  $transaction + FOR UPDATE + optimistic locking = sufficient for correctness.
  Redis lock is a performance optimization (reduces DB contention at high concurrency).
  Without it, more optimistic lock conflicts occur → more retries → same final correctness.
```

---

## §9 SCHEMA FOUNDATION

### §9.1 New Model: SegmentInventoryPolicy

```prisma
model SegmentInventoryPolicy {
  id                           String  @id @default(cuid())
  segment                      Segment @unique
  maxReservationTtlSeconds     Int     @default(900)
  maxReservationsPerUser       Int     @default(10)
  maxReservationQtyPerRequest  Int     @default(1000)
  reservationVelocityLimitPerHour Int  @default(50)
  allowBackorder               Boolean @default(false)
  allowVirtualStock            Boolean @default(false)
  lowStockThresholdPercent     Int     @default(20)
  isActive                     Boolean @default(true)
  createdAt                    DateTime @default(now())
  updatedAt                    DateTime @updatedAt
  @@map("segment_inventory_policies")
}
```

### §9.2 Inventory Model Additions (verify v4.3 — add if missing)

```
version          Int      @default(0)         ← optimistic locking (MANDATORY — INV-5)
damagedQty       Int      @default(0)         ← damaged stock tracking
incomingQty      Int      @default(0)         ← PO in-transit tracking
lowStockThreshold Int     @default(10)        ← absolute threshold
isLowStock       Boolean  @default(false)     ← computed flag
```

### §9.3 InventoryReservation Additions (verify v4.3 — add if missing)

```
reservedByUserId   String?   ← direct actor (null for SYSTEM operations)
reservedByBusinessId String? ← business context (null for guest/anonymous)
orderContext       String?   ← 'CART' | 'ORDER' | 'RFQ' | 'SYSTEM'
reservationSource  String?   ← 'WEB' | 'API' | 'BULK' | 'WORKER' (default 'WEB')
```

### §9.4 Enum Verification

```
ReservationStatus: ACTIVE, CONSUMED, EXPIRED, CANCELLED, RELEASED  (all five required)

InventoryMovementType:
  STOCK_ADDED, STOCK_REMOVED, RESERVATION_HELD,
  RESERVATION_RELEASED, ORDER_FULFILLED, RETURN_RECEIVED,
  ADJUSTMENT, DAMAGED, TRANSFER_IN, TRANSFER_OUT              (all ten required)
```

### §9.5 Sprint 3 Migration SQL

```sql
-- Run: prisma migrate dev --name sprint3-inventory-hardening

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

-- 2. Reservation ownership fields
ALTER TABLE "InventoryReservation"
  ADD COLUMN IF NOT EXISTS reserved_by_user_id TEXT,
  ADD COLUMN IF NOT EXISTS reserved_by_business_id TEXT,
  ADD COLUMN IF NOT EXISTS order_context TEXT,
  ADD COLUMN IF NOT EXISTS reservation_source TEXT DEFAULT 'WEB';

-- 3. Autovacuum tuning (high-write tables)
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

-- IMPORTANT: Run these SEPARATELY — not inside migration transaction
-- CREATE INDEX CONCURRENTLY cannot run inside a transaction block

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invres_active_expiry
  ON "InventoryReservation" (expires_at ASC)
  WHERE status = 'ACTIVE';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invres_order_status
  ON "InventoryReservation" (order_id, status)
  WHERE status = 'ACTIVE';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invres_cart_status
  ON "InventoryReservation" (cart_id, status)
  WHERE status = 'ACTIVE';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invres_expiry_bucket
  ON "InventoryReservation" (
    date_trunc('hour', expires_at),
    (EXTRACT(MINUTE FROM expires_at)::INT / 5)
  )
  WHERE status = 'ACTIVE';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invsnap_inv_date
  ON "InventorySnapshot" (inventory_id, snapshot_date DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_inv_updated_at
  ON "Inventory" (updated_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invres_user_segment
  ON "InventoryReservation" (reserved_by_user_id, status)
  WHERE status = 'ACTIVE';

CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
```

---

## §10 MODULE STRUCTURE & BOUNDARIES

### §10.1 File Structure

```
apps/api/src/modules/inventory/
  inventory.module.ts                      ← Public facade + module wiring
  inventory.service.ts                     ← Thin orchestration (delegates to sub-services)
  inventory-reserve.service.ts             ← Reserve logic (CRITICAL PATH)
  inventory-release.service.ts             ← Release logic (compensation path)
  inventory-update.service.ts              ← Seller stock management
  inventory-query.service.ts               ← Read path (buyer + seller)
  inventory-policy.service.ts              ← SegmentInventoryPolicy + TTL computation
  inventory-lock.service.ts               ← Redis distributed lock abstraction
  inventory-reconcile.service.ts           ← Incremental drift detection + snapshot
  inventory-protection-mode.service.ts    ← NORMAL/DEGRADED/READ_ONLY state machine
  inventory-abuse-guard.service.ts        ← Velocity limiting + anti-hoarding

  repositories/
    inventory.repository.ts
    reservation.repository.ts
    movement.repository.ts                 ← APPEND-ONLY (no update/delete — INV-7)
    snapshot.repository.ts                 ← APPEND-ONLY (no update/delete — INV-7)
    segment-inventory-policy.repository.ts

  workers/
    reservation-expiry.worker.ts           ← Bucketed expiry processing
    inventory-snapshot.worker.ts           ← Daily snapshot + incremental reconciliation

  inventory.controller.ts
  inventory.metrics.ts

  dto/
    index.ts                               ← Re-exports from packages/types

  tests/
    inventory-reserve.service.spec.ts      ← CONCURRENCY TESTS (C1-C8)
    inventory-release.service.spec.ts
    inventory-lock.service.spec.ts
    inventory-abuse-guard.service.spec.ts
    reservation-expiry.worker.spec.ts
    inventory.controller.spec.ts

packages/types/src/inventory/
  inventory.schemas.ts                     ← All Zod schemas (§21)
  index.ts
```

### §10.2 Module Boundary Rules (Locked)

```
InventoryModule OWNS:
  Inventory, InventoryReservation, InventoryMovement, InventorySnapshot, SegmentInventoryPolicy

InventoryModule EXPORTS:
  [InventoryService]   ← ONLY the public facade. Nothing else. Ever.

InventoryModule IMPORTS:
  ProductsService (product existence validation)
  BusinessQueryService (seller ownership verification — Sprint 2 pattern)
  RedisService (from core/redis)
  PrismaService (from core/prisma)
  forwardRef(() => CatalogModule) if circular reference

InventoryModule DOES NOT IMPORT:
  OrderRepository, PaymentRepository, CartRepository, NotificationService

OrderModule (Sprint 4) IMPORTS:
  InventoryService via InventoryModule.exports ONLY

OrderModule (Sprint 4) NEVER:
  Writes to Inventory, InventoryMovement, InventoryReservation directly
  Imports any InventoryModule repository
  Calls any InventoryModule internal service

Reservation release triggers (all idempotent):
  OrderService      → InventoryService.release(id, 'ORDER_CANCELLED', actorId)
  PaymentService    → InventoryService.release(id, 'PAYMENT_FAILED', actorId)
  ExpiryWorker      → InventoryReleaseService.release(id, 'RESERVATION_EXPIRED', 'SYSTEM')
  ManualOps (admin) → InventoryService.release(id, 'MANUAL_RELEASE', actorId)
```

---

## §11 CONCURRENCY ARCHITECTURE

### §11.1 InventoryLockService Implementation Reference

```typescript
// apps/api/src/modules/inventory/inventory-lock.service.ts

@Injectable()
export class InventoryLockService {
  private readonly logger = new Logger(InventoryLockService.name);
  static readonly LOCK_TTL_SECONDS = 30;
  static readonly LOCK_KEY_PREFIX = 'inv_lock:';           // inventoryId — not productId
  static readonly HOT_KEY_PREFIX = 'inv_hot_product:';
  static readonly CONTENTION_THRESHOLD = 20;               // per 5-minute window
  static readonly HOT_KEY_TTL = 300;                       // 5 minutes

  constructor(
    private readonly redis: RedisService,
    private readonly metrics: InventoryMetrics,
  ) {}

  async acquire(inventoryId: string): Promise<string> {
    const lockToken = crypto.randomUUID();
    const key = `${InventoryLockService.LOCK_KEY_PREFIX}${inventoryId}`;

    // Atomic: set-if-not-exists with TTL — single Redis command
    const result = await this.redis.set(key, lockToken, 'EX', InventoryLockService.LOCK_TTL_SECONDS, 'NX');

    if (result === null) {
      // Track contention for hot-product detection (§19)
      const hotKey = `${InventoryLockService.HOT_KEY_PREFIX}${inventoryId}`;
      const count = await this.redis.incr(hotKey);
      if (count === 1) await this.redis.expire(hotKey, InventoryLockService.HOT_KEY_TTL);
      if (count >= InventoryLockService.CONTENTION_THRESHOLD) {
        this.metrics.hotProductDetected(inventoryId, count);
        this.logger.warn({ inventoryId, contentionCount: count }, 'HOT PRODUCT — contention spike');
      }
      throw new ConflictException({ code: 'INVENTORY_LOCK_UNAVAILABLE', details: { retryAfterMs: 200 } });
    }
    return lockToken;
  }

  // Lua CAS — the ONLY acceptable release mechanism (§8.2)
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
      this.logger.warn({ inventoryId, tokenPrefix: lockToken.slice(0, 8) },
        'Lock already expired or taken — TTL handled cleanup. Safe.');
    }
  }

  // Lock released in finally — AFTER fn() (which contains $transaction) resolves
  async withLock<T>(inventoryId: string, fn: () => Promise<T>): Promise<T> {
    const lockToken = await this.acquire(inventoryId);
    try {
      return await fn();   // $transaction lives inside fn()
    } finally {
      await this.release(inventoryId, lockToken).catch((err: Error) =>
        this.logger.error({ inventoryId, error: err.message }, 'Lock release failed — TTL auto-expires')
      );
    }
  }
}
```

### §11.2 Reserve Execution Flow — Exact Order (Non-Negotiable)

```
reserve(input: ReserveStockInput):

  Step 1 [Redis]:   GET inv_idem:{key}                 → cache hit → return immediately (zero lock, zero DB)
  Step 2 [Redis]:   GET inv_protect_mode               → READ_ONLY → 503 immediately
  Step 3 [DB+Redis]:getPolicy(segment)                 → cache-aside → TTL computation
  Step 4 [DB]:      findByProductId(productId)         → get inventoryId for lock
  Step 5 [Redis]:   abuseGuard.check(ctx)              → all 5 checks → 429/400 if violated
  Step 6 [Redis]:   lockService.withLock(inventoryId)  → OR if DEGRADED: fn() directly
  Step 7 [DB]:      executeReservationWithRetry()      → exponential backoff on ConcurrencyException
  Step 8 [DB tx]:   $transaction (ReadCommitted, timeout:5000):
                      a. findByProductIdWithLock(tx)   → FOR UPDATE row-level lock
                      b. available >= quantity check   → 422 if insufficient (INV-10)
                      c. decrementQuantityWithVersion() → WHERE version=N → count==0 → retry
                      d. reservationRepo.create(tx)    → ownership chain populated
                      e. movementRepo.create(tx)       → RESERVATION_HELD (INV-7)
                      f. update isLowStock flag         → conditional update
                      g. tx.eventOutbox.create()        → InventoryReserved (deterministic key)
                      h. tx.eventOutbox.create()        → InventoryLowStock if newly low (monthly key)
                      return result
  Step 9 [Redis]:   SETEX inv_idem:{key} ttl result    → AFTER $transaction commits (§3, §6)
  Step 10:          metrics.reservationSuccess() + structured log
```

---

## §12 RESERVATION TTL & POLICY GOVERNANCE

### §12.1 computeReservationTtl — Policy-Driven Dynamic TTL

```typescript
computeReservationTtl(policy: SegmentInventoryPolicy, context: ReservationTtlContext): number {
  let ttl = policy.maxReservationTtlSeconds; // base from segment policy — NEVER hardcoded

  // Order type modifiers
  if (context.orderType === 'CART')  ttl = Math.min(ttl, 900);    // Cart: max 15 min
  if (context.orderType === 'ORDER') ttl = Math.min(ttl, 1800);   // Checkout: max 30 min
  if (context.orderType === 'RFQ')   ttl = Math.min(ttl, 86400);  // RFQ: up to 24h

  // Payment method modifiers
  if (context.paymentMethod === 'COD')    ttl = Math.min(ttl, 900);
  if (context.paymentMethod === 'CREDIT') ttl = Math.min(ttl, policy.maxReservationTtlSeconds);

  // Trust modifiers
  if (context.isBusinessVerified && context.orderType === 'RFQ')
    ttl = Math.min(ttl * 2, 172800); // Verified B2B RFQ: up to 48h

  return Math.max(ttl, 300); // Floor: 5 minutes minimum — always
}
```

**Rule**: This function is the ONLY TTL source. No numeric TTL literals in business logic. Any agent writing `const TTL = 900` outside SegmentInventoryPolicy defaults has violated this rule.

### §12.2 Policy Cache Governance

```
getPolicy(segment): cache-aside pattern
  1. Redis GET inv_policy:{segment}  → return if hit
  2. DB findBySegment(segment)       → throw InternalServerErrorException if null
     (Seed data missing → cannot proceed — not a client error)
  3. Redis SETEX inv_policy:{segment} 300s
  4. return policy

On admin policy update:
  → DEL inv_policy:{segment} (immediate invalidation)
  → Next request rebuilds cache from DB
```

---

## §13 RESERVATION OWNERSHIP MODEL

```
FIELDS ON InventoryReservation:
  reservedByUserId      String?   ← Direct actor (null for SYSTEM operations)
  reservedByBusinessId  String?   ← Business context (null for guest carts)
  orderContext          String    ← 'CART' | 'ORDER' | 'RFQ' | 'SYSTEM'
  reservationSource     String    ← 'WEB' | 'API' | 'BULK' | 'WORKER' (default 'WEB')

OWNERSHIP VALIDATION RULES:
  On release: caller must own the reservation.
    reservedByUserId is set → caller.userId must match OR caller.role === ADMIN
    reservedByBusinessId is set → caller.businessId must match OR caller.role === ADMIN
    System releases (expiry worker) → actor = 'SYSTEM' → no ownership check

  On consume: called by OrderService within its $transaction.
    No separate ownership check — OrderService owns the orderId context.
    consume() MUST receive tx from OrderService — it is NOT standalone (§18.3).
```

---

## §14 DEGRADED MODE & PROTECTION STATE MACHINE

### §14.1 State Machine

```
States: NORMAL, DEGRADED, READ_ONLY

Transitions:
  Auto:
    NORMAL → DEGRADED:     Redis failure count > 50 in 60s (auto-detection)
    DEGRADED → NORMAL:     Redis recovered, ops cleared failure counter

  Manual (operator only):
    NORMAL → READ_ONLY:    ops sets inv_protect_mode = 'READ_ONLY'
    DEGRADED → READ_ONLY:  ops escalation
    READ_ONLY → NORMAL:    ops explicitly clears (never auto)

OperationalParams per mode:
  NORMAL:    skipRedisLock=false, maxRetries=3,  delays=[100,200,400],       allowWrites=true
  DEGRADED:  skipRedisLock=true,  maxRetries=5,  delays=[200,400,800,1600,3200], allowWrites=true
  READ_ONLY: skipRedisLock=true,  maxRetries=0,  delays=[],                  allowWrites=false

READ_ONLY enforcement:
  reserve() checks: if (!params.allowWrites) throw 503 INVENTORY_READ_ONLY
  This check occurs AFTER idempotency (Step 2 in §11.2)
  Already-cached idempotency results are still served (no disruption for retries)
```

---

## §15 ABUSE PROTECTION ARCHITECTURE

### §15.1 InventoryAbuseGuard — Five Checks in Parallel

```typescript
async check(ctx: AbuseCheckContext): Promise<void> {
  // All 5 checks run concurrently — fail-fast on any violation
  await Promise.all([
    this.checkUserReservationCount(ctx),   // DB count — anti-hoarding
    this.checkUserVelocity(ctx),           // Redis INCR — spam prevention
    this.checkIpVelocity(ctx),             // Redis INCR — bot protection (SHA-256 ipHash)
    ctx.businessId
      ? this.checkBusinessVelocity(ctx)    // Redis INCR — B2B flood protection
      : Promise.resolve(),
    this.checkQuantityLimit(ctx),          // Pure function — no I/O
  ]);
}
```

### §15.2 Velocity Counter Pattern (Critical — Atomicity Required)

```
ALL velocity checks use Redis INCR (atomic increment).
FORBIDDEN: redis.get() + parseInt() + redis.set() (non-atomic, race condition)

CORRECT pattern:
  const count = await this.redis.incr(key);     // atomic
  if (count === 1) await this.redis.expire(key, 3600); // set TTL on first increment
  if (count > policy.velocityLimit) throw 429;

WHY INCR not GET+SET:
  Two concurrent requests both GET the same count (e.g. 49).
  Both are below limit of 50. Both proceed.
  Both SET to 50. Effective limit is bypassed by concurrency.
  INCR is a single atomic operation — cannot be raced.
```

### §15.3 Abuse Check Thresholds

```
checkUserReservationCount: count >= policy.maxReservationsPerUser → 429 RESERVATION_LIMIT_EXCEEDED
checkUserVelocity:         count > policy.reservationVelocityLimitPerHour → 429 RESERVATION_VELOCITY_EXCEEDED
checkIpVelocity:           count > 200 reservations/hour/IP → 429 IP_RATE_LIMIT_EXCEEDED
checkBusinessVelocity:     count > policy.reservationVelocityLimitPerHour * 3 → 429 BUSINESS_VELOCITY_EXCEEDED
checkQuantityLimit:        qty > policy.maxReservationQtyPerRequest → 400 QUANTITY_LIMIT_EXCEEDED

ALL thresholds come from SegmentInventoryPolicy.
NEVER hardcoded.
ipHash = SHA256(req.ip) — raw IP never stored or logged anywhere.
```

---

## §16 RECONCILIATION & SNAPSHOT ARCHITECTURE

### §16.1 Incremental Reconciliation Design

```
WHY INCREMENTAL (not full scan):
  Full scan: O(N) where N = total inventory records.
  At 1M products → multi-hour job → defeats real-time drift detection.

  Incremental: O(Changed) using idx_inv_updated_at.
  At 1M products with 1% daily change rate → 10K records per hourly run.
  Scales linearly with actual change rate, not with total catalog size.

MODES:
  1. INCREMENTAL (default — hourly):
     Query: Inventory WHERE updatedAt > checkpoint (uses idx_inv_updated_at)
     Compare actual qty vs sum(InventoryMovements since last snapshot)
     Flag drift > DRIFT_TOLERANCE (5%)
     Checkpoint advanced per batch

  2. CHANGED_PRIORITY (operator-triggered on drift alert):
     Same as incremental but for specific drifted inventoryIds
     Higher BullMQ priority — runs immediately

  3. PARTITIONED_FULL (weekly — Sunday 3 AM):
     Full scan in 500-record cursor-based batches
     Each batch isolated — one failure does not block others

DRIFT SCORING:
  driftScore = |expected - actual| / max(|expected|, 1)
  > 0.05 (5% drift)  → WARN log + CHANGED_PRIORITY reconciliation triggered
  > 0.20 (20% drift) → ERROR log + isCritical=true metric + ops paged immediately

  ### Snapshot Authority Governance

InventorySnapshot is:
- observability infrastructure
- reconciliation infrastructure
- forensic infrastructure

It is NEVER:
- inventory authority
- reservation authority
- automatic recovery authority

InventorySnapshot MUST NEVER overwrite live inventory state automatically.

Reconciliation findings MUST:
- generate alerts
- generate operational visibility
- trigger controlled remediation workflows

ANY inventory correction based on reconciliation:
- requires explicit remediation flow
- requires audit visibility
- requires operational review for critical drift

WHY:
Snapshots may themselves become stale,
partially delayed,
or generated during degraded operational conditions.

DB transactional inventory state remains the ONLY authority.

Net delta computation (typed $queryRaw — no string interpolation):
  STOCK_ADDED, RETURN_RECEIVED, TRANSFER_IN       → positive delta
  STOCK_REMOVED, ORDER_FULFILLED, DAMAGED, TRANSFER_OUT → negative delta
  RESERVATION_HELD, RESERVATION_RELEASED          → excluded (affect reservedQty, not quantity)
```

---

## §17 EVENT VERSIONING GOVERNANCE

### §17.1 Event Evolution Policy

```
ALL inventory events MUST conform to the envelope schema (§6.3).

DEDUPLICATION KEYS (§6.1 — locked, canonical):
  InventoryReserved:   inv-reserved-{reservationId}
  InventoryReleased:   inv-released-{reservationId}
  InventoryConsumed:   inv-consumed-{reservationId}
  InventoryChanged:    inv-changed-{inventoryId}-v{newVersion}
  InventoryLowStock:   inv-low-stock-{inventoryId}-{YYYY-MM}
  InventoryDrift:      inv-drift-{inventoryId}-{YYYY-MM-DD}

VERSION EVOLUTION RULES:
  MINOR (1.0 → 1.1): backward compatible — add optional fields only, never remove/rename
  MAJOR (1.x → 2.0): dual-publish for 30-day migration window before v1.x retirement
  REPLAY: All consumers MUST be replay-safe (idempotent) — dedup key prevents double-processing
  OUT-OF-ORDER: Consumers must handle out-of-order delivery

  EVENT ORDERING GUARANTEE:

EventOutbox guarantees:
- per-aggregate causal ordering
NOT:
- global ordering across the entire platform

Consumers MUST tolerate:
- delayed delivery
- duplicate delivery
- out-of-order delivery across unrelated aggregates

Inventory consumers MUST rely on:
- aggregate identity
- eventVersion
- idempotent processing

Consumers MUST NEVER rely on:
- global event arrival order
- queue arrival timing
- cross-aggregate ordering assumptions

SPRINT 3 CURRENT: eventVersion: "1.0", schemaVersion: "4.3"
```

---

## §18 SAGA GOVERNANCE & SPRINT 4 CONTRACT

### §18.1 Inventory as Saga Participant (Future-Compatible Design)

```
CURRENT (Sprint 3 — modular monolith):
  Saga coordination via direct service calls within same process.
  OrderService (Sprint 4) calls InventoryService within same $transaction.
  No distributed coordination needed — same DB, same transaction boundary.

FUTURE (Phase 3 — microservices):
  InventoryService becomes a microservice.
  Same three operations — only the transport changes (HTTP or Kafka).
  Zero InventoryService code changes required.

SAGA PARTICIPATION CONTRACT (forward-compatible):
  Forward action:    InventoryService.reserve(input)      → InventoryReserved event
  Compensation:      InventoryService.release(id, reason) → InventoryReleased event
  Confirmation:      InventoryService.consume(id, tx)     → InventoryConsumed event
```

### §18.2 Compensation Philosophy

```
1. Compensation is always idempotent.
   Compensating twice = same state as compensating once.

2. Compensation is always eventually possible.
   Even if transient failure, the expiry worker provides the ultimate safety net.

3. Compensation does NOT assume forward action succeeded.
   release() checks reservation state before acting.
   If not ACTIVE → return { alreadyReleased: true } — no error, no confusion.

4. Partial compensation is logged, not thrown.
   If incrementQuantityWithVersion() fails after MAX_INCREMENT_ATTEMPTS during release():
   → CRITICAL log (ops investigate)
   → DO NOT throw — reservation IS released
   → Drift detection catches the quantity discrepancy
   → Manual reconciliation resolves it
```

### §18.3 Sprint 4 Public Interface Contract (Locked)

```typescript
// What InventoryModule exports for Sprint 4 OrderModule — ONLY these methods:
interface InventoryServicePublicInterface {
  reserve(input: ReserveStockInput): Promise<ReserveStockResult>;
  release(reservationId: string, reason: ReleaseReason, actorId: string): Promise<ReleaseResult>;
  releaseAllForOrder(orderId: string, reason: ReleaseReason, actorId: string): Promise<ReleaseResult[]>;
  consume(reservationId: string, actorId: string, tx: PrismaTransactionClient): Promise<void>;
  getAvailability(productId: string, segment: Segment): Promise<InventoryAvailabilityResponse>;
}

// CRITICAL: consume() takes tx from OrderService (called inside OrderService $transaction)
// consume() MUST NOT open its own $transaction
// consume() MUST use the passed tx for all DB operations
```

### §18.4 Sprint 4 Coupling Rules (Locked)

```
Sprint 4 MUST:
  - Call reserve() BEFORE order.status transitions to PLACED
  - Call consume() WITHIN the payment capture $transaction (passing tx)
  - Call release() on ALL payment failure scenarios

Sprint 4 MUST NOT:
  - Import any InventoryModule repository
  - Write to Inventory, InventoryReservation, InventoryMovement directly
  - Bypass InventoryService for any inventory operation
  - Import InventoryModule into itself (InventoryModule imports OrderModule — never reverse)
```

---

## §19 HOT PRODUCT CONTENTION STRATEGY

### §19.1 Adaptive Retry Tiers

```
DETECTION:
  inv_hot_product:{inventoryId} — INCR on every failed lock acquisition
  TTL: 300s (5-minute rolling window)
  Threshold: 20 failed acquisitions in 5 minutes → HOT PRODUCT

MITIGATION TIERS:
  Tier 0 (Normal):   < 20 contention events/5min → standard retry [100ms, 200ms, 400ms]
  Tier 1 (Warm):   20-100 contention events/5min → WARNING alert, delays [200ms, 500ms, 1000ms]
  Tier 2 (Hot):  100-500 contention events/5min → CRITICAL alert, delays [500ms, 1000ms, 2000ms]
  Tier 3 (Viral):    > 500 contention events/5min → CRITICAL + ops decision gate

CURRENT SPRINT 3 IMPLEMENTATION:
  Detection + alerting:  IMPLEMENTED (inv_hot_product counter + CONTENTION_THRESHOLD)
  Adaptive delays:        IMPLEMENTED (from OperationalParams)
  Hard soft-block:        DOCUMENTED (ops-triggered AppConfig flag — not auto)
  Queue-based wait room:  NOT IMPLEMENTED (Phase 2 — premature complexity in Phase 1)

FUTURE PHASE 2 (Tier 2-3 viral launches):
  Queue reservations in BullMQ with product-level concurrency: 1
  Single worker processes one reservation at a time per inventoryId
  Other requests wait in queue with estimated wait time response
  Sprint 3 plants hook: inv_hot_product counter is the trigger signal
```

---

## §20 DETAILED IMPLEMENTATION REFERENCE

### §20.1 InventoryReserveService — Critical Path

> Full implementation: `SPRINT_3_IMPLEMENTATION_LOCKED.md` Section 16.1 (REFERENCE ONLY)
> The code in that document is authoritative for implementation details.
> Key invariants (non-negotiable, repeated here for enforcement):

```
MUST NOT put Redis/HTTP/BullMQ calls inside $transaction  (§3)
MUST use inv_lock:{inventoryId} not inv_lock:{productId}  (§8.2)
MUST check idempotency FIRST before anything else          (INV-6, §11.2)
MUST release lock in withLock() finally — not inside tx   (INV-4)
MUST set idempotency cache AFTER $transaction commits      (INV-6)
MUST use computeReservationTtl() — never hardcoded TTL    (§12.1)
MUST pass tx to ALL repository calls inside $transaction  (§3.3)
```

### §20.2 InventoryReleaseService — Compensation Path

> Full implementation: `SPRINT_3_IMPLEMENTATION_LOCKED.md` Section 16.2 (REFERENCE ONLY)

```
TERMINAL STATES: ['RELEASED', 'EXPIRED', 'CANCELLED', 'CONSUMED']
  → return { released: false, alreadyReleased: true } — NEVER throw

STATUS MAP (locked — cannot change without DDR):
  ORDER_CANCELLED   → CANCELLED
  PAYMENT_FAILED    → RELEASED
  CART_EXPIRED      → EXPIRED
  RESERVATION_EXPIRED → EXPIRED
  MANUAL_RELEASE    → RELEASED

INCREMENT FAILURE HANDLING:
  maxAttempts = 3, backoff = 50ms per attempt
  All attempts exhausted → CRITICAL log, DO NOT throw
  Reservation IS released. Inventory drift will be caught by reconciliation.

RELEASE IDEMPOTENCY MECHANISM:
  reservationRepo.release() uses updateMany WHERE status='ACTIVE'
  count === 0 → concurrent release won → safe to continue (not an error)

releaseAllForOrder() — SEQUENTIAL not parallel:
  Sequential release to avoid DB contention on same inventory
  Each release() is individually try/caught (one failure must not block others)
```

### §20.3 Controller Route Security Matrix

```
GET  /inventory/:productId           @Public()
GET  /inventory/seller               @Roles(SELLER, SELLER_MANAGER)
PATCH /inventory/:productId          @Roles(SELLER, SELLER_MANAGER)
POST /inventory/reserve              @Roles(BUYER, SELLER_MANAGER, ADMIN)
POST /inventory/release              @Roles(SELLER_MANAGER, ADMIN)
GET  /inventory/:productId/movements @Roles(SELLER, SELLER_MANAGER)

POST /reserve Idempotency-Key enforcement:
  const idempKey = req.headers['idempotency-key'];
  if (!idempKey) throw new BadRequestException({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
  const ipHash = createHash('sha256').update(req.ip ?? 'unknown').digest('hex');
```

### §20.4 Workers

**ReservationExpiryWorker** (`*/5 * * * *`, jobId: `expire-reservations-cron`):
- Batch: `findExpiredActive(100)` — uses `idx_invres_active_expiry`
- Each release in isolated try/catch — one failure MUST NOT block others
- `expired.length === 100` → schedule immediate re-run (1s delay)

**InventorySnapshotWorker** (`0 2 * * *`, jobId: `daily-snapshot-cron`):
- Paginated cursor batches (500 per batch) — NEVER offset pagination
- `createMany({ skipDuplicates: true })` — idempotent
- `handleIncrementalReconciliation` (`0 * * * *`, jobId: `incremental-reconciliation-cron`):
  delegates to `reconcileService.runIncrementalReconciliation()`

---

## §21 ZOD DTOS

```typescript
// packages/types/src/inventory/inventory.schemas.ts

export const ReserveInventorySchema = z.object({
  productId: z.string().cuid(),
  quantity: z.number().int().min(1).max(100000),
  cartId: z.string().cuid().optional(),
  orderId: z.string().cuid().optional(),
  orderType: z.enum(['CART', 'ORDER', 'RFQ']).optional().default('CART'),
  paymentMethod: z.enum(['ONLINE_UPI', 'ONLINE_CARD', 'COD', 'CREDIT', 'BANK_TRANSFER']).optional(),
  // expiresAt is FORBIDDEN as an input field (§5 — server time authority)
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

export interface InventoryAvailabilityResponse {
  productId: string;
  availableQuantity: number;    // quantity (never reserved or damaged)
  isLowStock: boolean;
  lastUpdated: string;          // ISO 8601
}

export interface InventoryDetailResponse {
  productId: string;
  inventoryId: string;
  quantity: number;
  reservedQty: number;
  damagedQty: number;
  availableQuantity: number;    // quantity — reservedQty — damagedQty
  lowStockThreshold: number;
  isLowStock: boolean;
  version: number;
  lastUpdated: string;
}
```

---

## §22 QUEUE CONFIGURATION

```typescript
// CRITICAL: stable jobId prevents cron duplication on API restart (§34 Warning 9)
// Each API restart without stable jobId = another duplicate cron schedule

await inventoryQueue.add('expire-reservations', {}, {
  repeat: { pattern: '*/5 * * * *' },
  jobId: 'expire-reservations-cron',    // STABLE — mandatory
  attempts: 3, backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: { count: 10 }, removeOnFail: { count: 100 },
});

await inventoryQueue.add('daily-snapshot', {}, {
  repeat: { pattern: '0 2 * * *' },
  jobId: 'daily-snapshot-cron',         // STABLE — mandatory
  attempts: 1,
  removeOnComplete: { count: 5 },
});

await inventoryQueue.add('incremental-reconciliation', {}, {
  repeat: { pattern: '0 * * * *' },
  jobId: 'incremental-reconciliation-cron', // STABLE — mandatory
  attempts: 2, backoff: { type: 'fixed', delay: 30000 },
  removeOnComplete: { count: 24 }, removeOnFail: { count: 48 },
});
```

---

## §23 CACHING STRATEGY

```
WHAT IS CACHED (display optimization only — §4):
  inv_stock:{productId}       TTL=30s   → UI stock badge display (NOT reservation decisions)
  inv_policy:{segment}        TTL=300s  → Policy lookups acceleration
  inv_idem:{idempotencyKey}   TTL=reservationTtl → Idempotency result (set AFTER $tx commits)
  inv_protect_mode            No TTL    → Persistent protection mode flag

WHAT IS NEVER CACHED (§4.3):
  Inventory.quantity for reservation decisions     → Always FOR UPDATE in $transaction
  InventoryReservation records                     → Always DB-authoritative
  Any data used for correctness decisions          → Always fresh DB read

CACHE INVALIDATION:
  PATCH /inventory/:productId → DEL inv_stock:{productId}  (immediate)
  After reserve():             → DEL inv_stock:{productId}  (async best-effort)
  After release():             → DEL inv_stock:{productId}  (async best-effort)
  Fallback: 30s TTL auto-expires (acceptable for display-only data)
```

---

## §24 FRONTEND

### §24.1 Buyer: StockStatus Component

```tsx
// apps/web/app/(main)/products/[slug]/page.tsx
function StockStatus({ productId, segment }: { productId: string; segment: string }) {
  const { data } = useSWR(
    `/api/v1/inventory/${productId}?segment=${segment}`,
    fetcher,
    { refreshInterval: 30_000, fallbackData: { availableQuantity: 0, isLowStock: false } },
  );
  if (data.availableQuantity === 0)
    return <span className="text-error">Stock khatam — Out of Stock</span>;
  if (data.isLowStock)
    return <span className="text-warning">Sirf {data.availableQuantity} bache — Jaldi karein!</span>;
  return <span className="text-success">Available</span>;
}
```

### §24.2 Seller: Inventory Management Dashboard

```
File: apps/seller-dashboard/app/(main)/inventory/page.tsx

FEATURES:
  Product list: isLowStock DESC → updatedAt DESC
  Red badge:   isLowStock=true
  Amber badge: quantity < 10 && !isLowStock
  Low stock filter toggle
  Inline edit modal: quantity + threshold + reason + optimistic update
  Movement history tab: cursor-paginated (20 per page), append-only display

EDIT MODAL SAFETY WARNING:
  if (newQty < inventory.reservedQty):
    "Warning: active reservations exceed new stock — active reservations may fail to consume."
```

---

## §25 OBSERVABILITY

### §25.1 Required Metrics

```typescript
// inventory.metrics.ts — ALL of these MUST be implemented

// Counters
inventory_reservation_success_total{segment}
inventory_reservation_failure_total{reason, segment}
inventory_idempotency_hit_total
inventory_optimistic_lock_retry_total{attempt}
inventory_oversell_prevented_total           ← MUST be 0 in production
inventory_reservation_released_total{reason}
inventory_expiry_processed_total
inventory_drift_detected{isCritical}         ← MUST be 0 on fresh system
inventory_abuse_violation_total{type, segment}
inventory_protection_mode_changes{mode}
inventory_hot_product_detected{inventoryId}

// Histograms
inventory_reservation_latency_ms             ← p95 target: < 100ms

// Gauges
inventory_active_reservations
inventory_low_stock_products
```

### §25.2 Alert Rules

```yaml
# PAGE OPS IMMEDIATELY — zero tolerance
- inventory_oversell_prevented_total > 0
- inventory_drift_detected{isCritical="true"} > 0
- inventory_protection_mode_active{mode="READ_ONLY"} == 1

# INVESTIGATE WITHIN 1 HOUR
- inventory_reservation_failure_rate > 5% (5-min window)
- inventory_optimistic_lock_retry{attempt="3"} > 10/min
- inventory_expiry_worker_failed > 0
- inventory_drift_detected{isCritical="false"} > 0
- inventory_active_reservations > 50000
- inventory_reservation_p95_latency_ms > 100
- inv_hot_product > 100 (5-min window)
- inventory_abuse_violations{type="user_velocity"} > 50/min

# OPERATIONAL
- inventory_protection_mode_active{mode="DEGRADED"} == 1  (INFO — not page-worthy alone)
- inventory_low_stock_products > 100  (business alert)
```

### §25.3 Structured Log Events (Pino — required fields)

```typescript
// Reserve success:
logger.info({ productId, inventoryId, qty, reservationId, mode, latencyMs }, 'Stock reserved')
// Oversell prevented:
logger.warn({ productId, available, requested, userId }, 'INSUFFICIENT_STOCK — oversell prevented')
// Optimistic lock retry:
logger.warn({ productId, attempt }, 'Optimistic lock conflict — retrying')
// Drift detected:
logger.error({ inventoryId, expectedQty, actualQty, driftScore, isCritical }, 'INVENTORY DRIFT')
// Redis failure:
logger.error({ error }, 'Redis unavailable — inventory writes in degraded mode')
// Hot product:
logger.warn({ inventoryId, contentionCount }, 'HOT PRODUCT — contention spike')
// Abuse violation:
logger.warn({ userId, violationType, segment }, 'Inventory abuse violation')

// LOGGING GOVERNANCE:
// - NEVER use console.log (use NestJS Logger wrapping Pino)
// - NEVER log raw IP addresses (use ipHash SHA-256)
// - NEVER log raw idempotency key values
// - ALWAYS include { productId, inventoryId, userId } in inventory log context
```

---

## §26 FAILURE HANDLING & SECURITY

### §26.1 Failure Mode Matrix

| Failure | Detection | Mitigation | Recovery |
|---|---|---|---|
| Redis DOWN during reserve | Lock acquisition fails | DEGRADED mode: DB-only path, maxRetries=5 | Alert ops. Redis restart. Auto-revert to NORMAL. |
| DB contention (hot product) | Version mismatch, retries exhausted | 409 LOCK_UNAVAILABLE. Client retries with backoff. | Normal. Adaptive delays activate. |
| Worker crash mid-expiry | Reservation stays ACTIVE past expiry | Next expiry run (≤5 min) picks it up. Idempotent. | Automatic. |
| Transaction timeout (>5s) | Prisma P2024 | Auto-rollback → 503. Client retries. | Automatic. |
| Duplicate reservation (same key) | Redis idempotency hit | Return cached result. No DB write. | By design. |
| Partial release (increment failed) | CRITICAL log | Reservation IS released. Reconciliation catches drift. | Manual ops. |
| Queue DLQ overflow | BullMQ dead-letter | Alert ops. Review job payload for poison jobs. | Manual ops. |
| Inventory drift detected | Incremental reconciliation | CRITICAL log + metric. Ops paged. Manual reconcile. | Manual ops. |
| Abuse/velocity limit exceeded | AbuseGuard check | 429 TooManyRequests. Velocity counter expires in 1h. | Auto TTL expiry. |
| Hot product viral spike | inv_hot_product counter | CRITICAL alert. Adaptive delays. Ops gate for soft-block. | Ops decision. |
| READ_ONLY mode | inv_protect_mode key | 503 INVENTORY_READ_ONLY on all reserve attempts. | Ops clears key. |

### §26.2 Security Attack Vector Matrix

| Attack | Mitigation |
|---|---|
| Replay attack (same request retried) | Idempotency key (Redis NX) with TTL=reservationTtl |
| Inventory hoarding (user reserves all stock) | maxReservationsPerUser in SegmentInventoryPolicy |
| Reservation spam (velocity attack) | Per-user/IP/business INCR counters (atomic) |
| Suspicious bulk reserve | maxReservationQtyPerRequest validation |
| Forged reservationId release | Ownership check: reservedByUserId must match actor |
| Seller stock inflation | max(1,000,000) via Zod schema validation |
| Concurrent reservation storm | Redis lock + optimistic locking — serializes writes |
| Quantity cache bypass | Cache never used for reservation decisions (§4) |
| Bot scraping | IP velocity limiting + SHA-256 IP hashing |
| Seller accessing other seller's inventory | Two-hop ownership: userId→businessId→inventoryId |
| Buyer directly calling /release | Route requires SELLER_MANAGER or ADMIN role |
| Client-supplied expiry timestamp | expiresAt is not an input field (§5 server time rule) |
| Queue poisoning | Zod validation at worker entry. Malformed → DLQ. |

---

## §27 PHASED EXECUTION PLAN

> **EXECUTION RULE**: Implement EXACTLY one phase at a time. Gate before advancing.
> Each phase is independently deployable and testable. No giant merges. No giant commits.

---

### PHASE 1 — SCHEMA & INFRASTRUCTURE FOUNDATION
**Duration**: Day 1–2 | **Risk**: LOW-MEDIUM | **Model**: Gemini 3.1 Pro

**Objective**: DB schema correct, module scaffolded, stubs in place, DTOs typed. Nothing executable runs yet.

**Sub-phases**:

**1A: Schema Verification & Migration (Day 1 AM)**

Read `architecture/database/6. VyaparNet_SCHEMA_v4.3_FINAL_FREEZE.md` FULLY before writing any SQL.
Verify each column against §9.1–9.4 checklist. Do NOT add columns that already exist.

```
Checklist:
  Inventory:           version, damagedQty, incomingQty, lowStockThreshold, isLowStock
  InventoryReservation: reservedByUserId, reservedByBusinessId, orderContext, reservationSource
  ReservationStatus:   ACTIVE, CONSUMED, EXPIRED, CANCELLED, RELEASED (all five)
  InventoryMovementType: all ten types (§9.4)
  SegmentInventoryPolicy: new model (§9.1)
```

Run: `prisma migrate dev --name sprint3-inventory-hardening`
Run CONCURRENTLY indexes SEPARATELY (NOT inside migration transaction — §9.5 warning).

**1B: Zod DTOs (Day 1 PM)**

Create `packages/types/src/inventory/inventory.schemas.ts` with all schemas from §21.
**CRITICAL**: `expiresAt` is FORBIDDEN as an input field in any schema (§5 server time rule).
Export from `packages/types/src/index.ts`.

**1C: Module Skeleton & Stubs (Day 2 AM)**

Create all 5 repository stubs. All methods MUST throw `new Error('Phase 1 stub — not implemented')`.
NEVER return empty objects or null. Fail loudly. Prevent Phase 2+ services from accidentally running.

**Files Touched**:

| File | Action |
|---|---|
| `packages/database/prisma/schema.prisma` | MODIFY — add SegmentInventoryPolicy, missing columns |
| `packages/database/prisma/migrations/sprint3*` | CREATE — SQL from §9.5 |
| `packages/types/src/inventory/inventory.schemas.ts` | CREATE — all Zod schemas from §21 |
| `packages/types/src/index.ts` | MODIFY — export inventory schemas |
| `apps/api/src/modules/inventory/inventory.module.ts` | CREATE — skeleton only |
| `apps/api/src/modules/inventory/repositories/*.ts` | CREATE — 5 stub files |
| `apps/api/src/modules/inventory/dto/index.ts` | CREATE — re-export |

**Gate Criteria**:
```
prisma migrate status → all applied
pnpm typecheck → zero errors (entire monorepo)
pnpm build → zero errors
import { ReserveInventorySchema } from '@vyaparnet/types' → no type error
expiresAt field does NOT appear in any input schema
```

**Rollback**: `prisma migrate reset` (dev). Restore backup (staging). No data loss — nothing written.

---

### PHASE 2 — FOUNDATION SERVICES
**Duration**: Day 2–3 | **Risk**: HIGH (2A: locking) / MEDIUM (2B-E) | **Model**: Claude Sonnet 4.6 (2A), Gemini 3.1 Pro (2B-E)

**Objective**: InventoryLockService, InventoryPolicyService, InventoryProtectionModeService, InventoryAbuseGuard, and all repositories fully implemented and unit-tested.

**Sub-phase 2A: InventoryLockService (Claude Sonnet 4.6)**

Implement `inventory-lock.service.ts` exactly per §11.1.

Critical correctness requirements:
- Lock key: `inv_lock:{inventoryId}` — NOT productId
- acquire(): `redis.set(key, lockToken, 'EX', 30, 'NX')` — single atomic command
- release(): Lua CAS script — NEVER plain `redis.del()`
- withLock(): try-finally — lock ALWAYS released even if fn() throws
- Hot detection: INCR inv_hot_product:{inventoryId} on failed acquire

**Sub-phase 2B-D: Policy + ProtectionMode + AbuseGuard (Gemini 3.1 Pro)**

Per §12.1, §14.1, §15.1–15.3.
All velocity checks use Redis INCR (atomic — NOT get+set — §15.2).
ipHash = SHA-256 of raw IP. Raw IP never stored or logged.

**Sub-phase 2E: Repositories Full Implementation (Gemini 3.1 Pro)**

Replace all stubs. movement.repository.ts and snapshot.repository.ts:
ZERO update/delete methods. Comment at file top: `// APPEND-ONLY: This repository has no update or delete methods by design.`
findByProductIdWithLock() MUST receive tx parameter (FOR UPDATE outside tx = no-op).
All findMany() have explicit `take` and `orderBy` — NO unbounded queries.

**Unit Test Requirements (ALL mandatory for Phase 2 gate)**:

```
inventory-lock.service.spec.ts:
  acquire() → returns lockToken string
  acquire() when key exists → ConflictException
  acquire() → increments inv_hot_product on failure
  acquire() threshold exceeded → metrics.hotProductDetected()
  release() correct token → returns 1
  release() wrong token → returns 0, logs warn (NOT throw)
  withLock() success → lock acquired, fn called, lock released
  withLock() fn throws → lock STILL released (finally block)
  withLock() acquire fails → exception propagates, fn NOT called

inventory-policy.service.spec.ts:
  computeReservationTtl CART → <= 900
  computeReservationTtl ORDER → <= 1800
  computeReservationTtl RFQ → <= 86400
  computeReservationTtl always >= 300 (floor)
  getPolicy() → Redis hit → returns cached
  getPolicy() miss → hits DB, sets Redis 300s TTL
  getPolicy() no policy → InternalServerErrorException

inventory-abuse-guard.service.spec.ts:
  under all limits → passes (no throw)
  activeCount >= max → 429 RESERVATION_LIMIT_EXCEEDED
  userVelocity > limit → 429 RESERVATION_VELOCITY_EXCEEDED
  ipVelocity > 200 → 429 IP_RATE_LIMIT_EXCEEDED
  businessVelocity > 3x limit → 429 BUSINESS_VELOCITY_EXCEEDED
  quantity > max → 400 QUANTITY_LIMIT_EXCEEDED
```

**Gate Criteria**:
```
pnpm test → all Phase 2 tests passing (100%)
pnpm typecheck → zero errors
Lock/unlock verified against real Redis (docker-compose up)
Policy cache verified (Redis key set after first getPolicy() call)
movement.repository.ts has zero update/delete methods (grep verified)
```

---

### PHASE 3 — RESERVE & RELEASE SERVICES
**Duration**: Day 3–5 | **Risk**: CRITICAL | **Model**: Claude Sonnet 4.6 (3A, 3B), Gemini 3.1 Pro (3C-E)

**Objective**: The seven-layer defense implemented. Correct under all concurrency scenarios.

**Sub-phase 3A: InventoryReserveService (Claude Sonnet 4.6)**

Implement `inventory-reserve.service.ts` per §11.2 execution flow.

Non-negotiable implementation rules (violations = Phase 3 gate BLOCKED):
- Idempotency check is Step 1 — FIRST await in reserve() — nothing before it
- Protection mode check is Step 2
- AbuseGuard.check() is Step 5 — BEFORE lock acquisition
- lockService.withLock() contains the entire retry + $transaction flow
- $transaction contains ONLY DB operations (§3.1 — no Redis, no HTTP inside)
- Lock released in withLock() finally — AFTER $transaction resolves
- Idempotency cache SET is Step 9 — AFTER $transaction commits — outside $transaction
- computeReservationTtl() computes all TTLs — no numeric TTL literals

**Sub-phase 3B: InventoryReleaseService (Claude Sonnet 4.6)**

Implement `inventory-release.service.ts` per §20.2.

Non-negotiable:
- Terminal states → `{ alreadyReleased: true }` — NEVER throw
- `reservationRepo.release()` uses updateMany WHERE status='ACTIVE' (idempotent)
- If count === 0 → concurrent release won → safe, continue
- increment failure after MAX_INCREMENT_ATTEMPTS → CRITICAL log — DO NOT throw
- EventOutbox dedup key: `inv-released-{reservationId}` (deterministic — §6)

**Sub-phase 3C-E: Update + Query + Reconcile (Gemini 3.1 Pro)**

- updateStock(): two-hop ownership verify first, then $transaction with movement + EventOutbox
- getAvailability(): cache-aside (inv_stock, 30s) — NEVER use for reservation decisions (§4)
- runIncrementalReconciliation(): checkpoint-based, typed $queryRaw, drift scoring per §16.1

**Mandatory Concurrency Tests (BLOCKING gate — real DB + real Redis)**:

```
C1: 10 parallel reserve(qty=1), stock=1 → exactly 1 ACTIVE, 9 INSUFFICIENT_STOCK
C2: 50 parallel reserve(qty=1), stock=30 → exactly 30 ACTIVE
C3: same idempotencyKey x5 concurrent → 1 DB write, 1 movement, all 5 same result
C4: reserve(qty=5) + concurrent release() + reserve(qty=5) → second reserve succeeds
C5: mock Redis to throw → DEGRADED → reserve completes via DB-only → zero oversell
C6: protection mode = READ_ONLY → 503 before any DB access
C7: velocity counter > limit → 429 before lock acquired
C8: quantity > maxReservationQtyPerRequest → 400

After ALL tests:
  inventory.quantity + inventory.reservedQty === original starting quantity
  Zero InventoryMovements other than expected
  Zero duplicate EventOutbox entries (dedup key verified)
  inventory_oversell_prevented_total === 0
```

**Gate Criteria**:
```
All C1-C8 concurrency tests passing (real DB + real Redis)
inventory.quantity + reservedQty = original after all tests
Zero InventoryMovement update/delete methods (grep verified)
EventOutbox dedup keys are deterministic — no Date.now() (grep verified)
pnpm typecheck → zero errors
No Redis/HTTP/BullMQ calls inside any $transaction callback (code review)
```

---

### PHASE 4 — CONTROLLER & PUBLIC FACADE
**Duration**: Day 5–6 | **Risk**: MEDIUM | **Model**: Gemini 3.1 Pro

**Objective**: API endpoints wired, auth guards correct, InventoryService facade exported.

- InventoryService facade: thin delegation to sub-services — public interface per §18.3
- InventoryController: routes per §20.3, Idempotency-Key enforcement, ipHash computation
- InventoryModule: exports [InventoryService] ONLY — repositories NEVER exported
- OpenAPI spec: `/contracts/inventory.yaml` with all 6 endpoints, all error codes, required headers

**Gate Criteria**:
```
GET /api/v1/inventory/:productId → 200 without auth token
POST /api/v1/inventory/reserve without Idempotency-Key → 400
OpenAPI spec committed to /contracts/inventory.yaml
InventoryModule exports only [InventoryService] (no repositories)
pnpm typecheck → zero errors
```

---

### PHASE 5 — BACKGROUND WORKERS & CRON REGISTRATION
**Duration**: Day 6–7 | **Risk**: MEDIUM | **Model**: Gemini 3.1 Pro (5A, 5B), Gemini 3.5 Flash (5C)

- ReservationExpiryWorker: per §20.4 — isolated try/catch per reservation, batch chaining
- InventorySnapshotWorker: cursor pagination (never offset), daily + incremental
- Cron registration: ALL with stable jobId (§22) — prevents duplicate cron flood on restart

**Gate Criteria**:
```
All three crons registered with stable jobId (verify in BullMQ dashboard)
EXPLAIN ANALYZE: idx_invres_active_expiry used for expiry query
EXPLAIN ANALYZE: idx_inv_updated_at used for incremental reconciliation
Expiry worker: run twice → zero duplicate InventoryMovements (idempotency verified)
```

---

### PHASE 6 — SEED DATA & EVENT WIRING
**Duration**: Day 7 | **Risk**: LOW | **Model**: Gemini 3.5 Flash

- Seed: UPSERT for TEXTILE + SPARE_PARTS SegmentInventoryPolicy (idempotent — safe to re-run)
- ProductCreated consumer: creates Inventory(quantity=0) — idempotent (check existing first)

**Gate Criteria**:
```
pnpm db:seed → SegmentInventoryPolicy rows for TEXTILE + SPARE_PARTS exist
ProductCreated fired twice → only 1 Inventory record (idempotency verified)
GET /api/v1/inventory/:productId → 200 (availableQuantity=0, isLowStock=false)
```

---

### PHASE 7 — FRONTEND INTEGRATION
**Duration**: Day 7–8 | **Risk**: LOW | **Model**: Gemini 3.5 Flash

Per §24.1 and §24.2. No business logic in frontend. SWR polling interval = 30s.

**Gate Criteria**:
```
StockStatus shows "Stock khatam" for quantity=0
StockStatus shows "Sirf N bache" for isLowStock=true
SWR refreshInterval=30_000 (verified in component)
Seller edit modal: submit → PATCH call → success → optimistic update
Movement history: loads, cursor pagination works
```

---

### PHASE 8 — OBSERVABILITY, LOAD TESTS & SECURITY AUDIT
**Duration**: Day 8–9 | **Risk**: LOW-MEDIUM | **Model**: Gemini 3.1 Pro (8A, 8C, 8D), Gemini 3.5 Flash (8B)

- InventoryMetrics: all 15 metrics per §25.1
- Grafana dashboard: all panels + all alert rules from §25.2
- Load tests L1–L7: with DB state assertions (not just HTTP codes) per §28
- Security audit: all items from §26.2

**Gate Criteria**:
```
All L1-L7 load tests passing with DB state assertions
inventory_oversell_prevented_total = 0 after all tests
inventory_drift_detected = 0 on fresh system
inventory_reservation_p95_latency_ms < 100ms
All Grafana alert rules configured
pnpm audit → zero critical vulnerabilities
```

---

## §28 SPRINT VALIDATION GATE

> Zero failures allowed. ALL items must pass. Sprint 4 DOES NOT BEGIN until this gate is certified PASSED.

### Concurrency Safety (Zero Tolerance)
```
[ ] L1: 10 concurrent reserves, stock=1 → exactly 1 succeeds
[ ] L2: 50 concurrent reserves, stock=30 → exactly 30 succeed
[ ] L3: Idempotency (same key x5) → 1 reservation, 1 movement, all 5 same result
[ ] L4: Reserve → release → reserve → second succeeds (stock restored correctly)
[ ] L5: Redis down → DEGRADED → no oversell → CRITICAL log emitted
[ ] L6: 1000 expired reservations → expiry worker → all EXPIRED → no duplicates on re-run
[ ] L7: Velocity abuse → 429 after threshold → no lock acquired for rejected requests
[ ] inventory.quantity + reservedQty = original at all times
[ ] inventory.quantity NEVER < 0 (SQL: SELECT * WHERE quantity < 0 → ZERO rows)
[ ] inventory_oversell_prevented_total = 0
```

### Transaction Boundary (Zero Tolerance)
```
[ ] Zero Redis calls inside any $transaction callback (code review + grep)
[ ] Zero HTTP/BullMQ calls inside any $transaction callback
[ ] All $transaction calls have timeout: 5000
[ ] All $transaction calls have isolationLevel: 'ReadCommitted'
[ ] Lock released in withLock() finally — after $transaction resolves (not inside tx)
[ ] Idempotency cache SET is outside $transaction (after commit)
```

### Cache Governance (Zero Tolerance)
```
[ ] inv_stock cache used ONLY in getAvailability() (display path)
[ ] inv_stock cache NOT read in reserve() or updateStock() (correctness paths)
[ ] No reservation decision based on cached quantity anywhere
[ ] expiresAt field absent from all Zod input schemas
```

### Server Time & Expiry
```
[ ] expiresAt computed server-side (Date.now() + ttl * 1000) — never from client input
[ ] expiresAt absent from ReserveInventorySchema and all input DTOs
[ ] Expiry worker uses new Date() for comparison (server time — not client time)
```

### EventOutbox Governance
```
[ ] grep 'Date.now()' near 'deduplicationKey' → ZERO matches
[ ] grep 'new Date()' near 'deduplicationKey' → ZERO matches
[ ] grep 'randomUUID()' near 'deduplicationKey' → ZERO matches
[ ] All EventOutbox creates inside $transaction
[ ] All events have eventVersion: "1.0" and schemaVersion: "4.3"
[ ] dedup keys match §6.1 canonical table exactly
```

### Append-Only Repositories
```
[ ] movement.repository.ts: grep update/delete → ZERO matches
[ ] snapshot.repository.ts: grep update/delete → ZERO matches
[ ] Comment at top of each: // APPEND-ONLY...
```

### Idempotency & Ownership
```
[ ] POST /reserve without Idempotency-Key → 400 IDEMPOTENCY_KEY_REQUIRED
[ ] Same key twice → same reservationId, 1 movement
[ ] POST /release on terminal state → 200 { alreadyReleased: true } (never error)
[ ] Seller A cannot modify Seller B's inventory → 403
[ ] Buyer POST /release → 403
[ ] User release another user's reservation → 403
[ ] ADMIN can release any reservation → 200
```

### Velocity & Abuse
```
[ ] Velocity counters use Redis INCR (not GET+SET) — grep verified
[ ] All thresholds from SegmentInventoryPolicy (not hardcoded — grep verified)
[ ] Raw IP never logged — ipHash SHA-256 only
```

### Workers & Crons
```
[ ] expire-reservations-cron: stable jobId, */5 * * * *
[ ] daily-snapshot-cron: stable jobId, 0 2 * * *
[ ] incremental-reconciliation-cron: stable jobId, 0 * * * *
[ ] EXPLAIN ANALYZE: idx_invres_active_expiry used for expiry query (NOT Seq Scan)
[ ] EXPLAIN ANALYZE: idx_inv_updated_at used for incremental reconciliation (NOT Seq Scan)
```

### Observability
```
[ ] All 15 metrics in §25.1 implemented
[ ] inventory_reservation_p95_latency_ms < 100ms
[ ] Grafana dashboard imported, all panels rendering
[ ] All alert rules in §25.2 configured
[ ] Zero console.log in inventory module (grep verified)
[ ] All logs via NestJS Logger with structured context
```

### Quality
```
[ ] pnpm typecheck → ZERO errors (entire monorepo)
[ ] pnpm test → 100% pass rate
[ ] pnpm lint → ZERO errors
[ ] Coverage >= 80% for inventory module
[ ] OpenAPI spec at /contracts/inventory.yaml
[ ] No TTL numeric literals outside SegmentInventoryPolicy (grep: /\d{3,}/; review matches)
```

---

## §29 FAILURE CONDITIONS

Sprint 3 is FAILED if ANY of the following occur:

| Failure | Severity |
|---|---|
| Oversell in any concurrency test | BLOCKING — CRITICAL |
| inventory.quantity < 0 at any point | BLOCKING — CRITICAL |
| Redis/HTTP/BullMQ call inside $transaction | BLOCKING — ARCHITECTURE VIOLATION |
| Client-supplied expiresAt used for reservation | BLOCKING — SERVER TIME VIOLATION |
| Non-deterministic dedup key (timestamp in EventOutbox key) | BLOCKING |
| Lock key uses productId instead of inventoryId | BLOCKING — ARCHITECTURAL DRIFT |
| Lock released before $transaction commits | BLOCKING — CRITICAL |
| release() throws on double-call (terminal state) | BLOCKING — IDEMPOTENCY VIOLATION |
| reserve() creates duplicate movements on retry | BLOCKING |
| MovementRepository has update() or delete() | BLOCKING |
| Seller can modify another seller's inventory | BLOCKING — CRITICAL |
| Reservation not in same $transaction as quantity decrement | BLOCKING |
| Expiry worker not idempotent | BLOCKING |
| No Idempotency-Key enforcement on /reserve | BLOCKING |
| InventoryModule exports repositories | BLOCKING |
| TypeScript errors in any inventory file | BLOCKING |
| Any failing test | BLOCKING |
| Cache used for reservation quantity decision | BLOCKING |
| computeReservationTtl() bypassed (hardcoded TTL) | HIGH |
| AbuseGuard not called before lock acquisition | HIGH |
| Redis lock not using Lua CAS release | HIGH |
| SegmentInventoryPolicy not seeded | HIGH |
| Cron workers missing stable jobId | HIGH |
| EXPLAIN ANALYZE shows Seq Scan on hot queries | HIGH |
| Velocity counters using GET+SET instead of INCR | HIGH |
| Protection mode not checked before reserve | HIGH |
| Event version not included in EventOutbox payload | MEDIUM |
| Reservation ownership fields missing | MEDIUM |
| Incremental reconciliation not implemented (full scan only) | MEDIUM |

---

## §30 SPRINT 3 → SPRINT 4 HANDOFF

```bash
# After Sprint 3 validation gate CERTIFIED PASSED:
# Update CURRENT_PHASE.md:
# - Sprint 3: ALL tasks → DONE
# - Sprint 4: tasks → NOT STARTED
# Commit: docs: Sprint 3 complete — Sprint 4 begins
```

**Sprint 4 Required Reading**:
```
1. This document — §18 (Saga Governance + public contract)
2. architecture/workflows/11. VyaparNet_Workflow_Sequence_Diagrams_v1.md — §7.1 (Order Placement)
3. architecture/database/6. VyaparNet_SCHEMA_v4.3_FINAL_FREEZE.md — Order, Cart, Payment models
4. SPRINT2_IMPLEMENTATION_LOCKED_final_v2.0.md — patterns to follow
5. context/LOCKED_DECISIONS.md — §3 (payment safety rules)
```

**Sprint 4 Integration Example**:
```typescript
// OrderService.createOrder() — how Sprint 4 calls Sprint 3:
const reservation = await inventoryService.reserve({
  productId,
  quantity,
  requestedBy: userId,
  idempotencyKey: `order-${orderId}-product-${productId}`, // deterministic — no timestamp
  orderId,
  segment,
  ipHash,
  orderType: 'ORDER',
  paymentMethod: order.paymentMethod,
});

// On payment success (inside PaymentService $transaction):
await inventoryService.consume(reservation.reservationId, userId, tx);

// On payment fail:
await inventoryService.release(reservation.reservationId, 'PAYMENT_FAILED', userId);

// On order cancel:
await inventoryService.releaseAllForOrder(orderId, 'ORDER_CANCELLED', userId);
```

---

## §31 UNIVERSAL AGENT IMPLEMENTATION PROMPT

> Usage: Replace `[PHASE N]` with the exact phase. Read referenced sections before running.

```
You are implementing Sprint 3 of VyaparNet.

CURRENT PHASE: [PHASE N — e.g. "Phase 3A — InventoryReserveService"]

AUTHORITY DOCUMENT (ONLY): /Users/akashkumar/Documents/VyaparNet/implementation/sprint-packs/SPRINT_3_ORCHESTRATION.md

═══════════════════════════════════════════════════════════════════
MANDATORY FIRST STEP — DO NOT SKIP
═══════════════════════════════════════════════════════════════════

Before writing a single line of code:

1. Read §0 (Global Non-Negotiable Invariants) — the full section.
2. Read §3 (Transaction Boundary Governance) — the full section.
3. Read §4 (Cache Authority Governance) — the full section.
4. Read §5 (Server Time Authority) — the full section.
5. Read §6 (EventOutbox Deduplication Governance) — the full section.
6. Read §27 Phase [N] — exact scope, gate criteria, implementation warnings.
7. Read the specific implementation sections referenced by Phase [N].
8. Read context/LOCKED_DECISIONS.md.

═══════════════════════════════════════════════════════════════════
IMPLEMENTATION BOUNDARIES — HARD RULES
═══════════════════════════════════════════════════════════════════

You MUST implement ONLY what is listed in Phase [N]'s exact scope.

You MUST NOT:
- Implement anything from phases after [N]
- Modify files not listed in Phase [N]'s Files Touched table
- Add API routes not defined in §20.3
- Modify Prisma schema beyond what Phase 1 establishes
- Add new Segment enum values
- Skip any test listed in Phase [N]

═══════════════════════════════════════════════════════════════════
GLOBAL INVARIANT ENFORCEMENT (ZERO TOLERANCE)
═══════════════════════════════════════════════════════════════════

1. TRANSACTION BOUNDARY (§3): ZERO external calls inside $transaction.
   Redis, HTTP, BullMQ, EventEmitter, file system: ALL forbidden inside tx.

2. CACHE AUTHORITY (§4): Redis inv_stock cache is display-only.
   NEVER used for reservation decisions. NEVER used in reserve() or updateStock().

3. SERVER TIME (§5): expiresAt computed server-side ONLY.
   FORBIDDEN as any input field. Never from client request body.

4. DEDUP KEYS (§6): ALL EventOutbox keys are deterministic.
   FORBIDDEN: Date.now(), new Date(), randomUUID() in deduplicationKey.

5. LOCK KEY: inv_lock:{inventoryId} — NOT productId.

6. LUA CAS: Lock release via redis.eval() Lua script ONLY.
   NEVER: redis.del(). NEVER: GET then DEL.

7. LOCK TIMING: withLock() finally releases AFTER $transaction resolves.
   NEVER inside $transaction. NEVER before commit.

8. IDEMPOTENCY ORDER: First await in reserve() = Redis GET inv_idem:{key}.
   NOTHING before this. Idempotency SETEX happens AFTER $transaction commits.

9. MOVEMENT REPO: Zero update() or delete() methods. Ever.

10. RELEASE: Terminal states → { alreadyReleased: true }. NEVER throw.

11. ALL TTLs from computeReservationTtl(). Zero hardcoded TTL literals.

12. SEGMENT ISOLATION: All queries scoped to segment.

13. TWO-HOP OWNERSHIP: All seller mutations verified userId→businessId→inventoryId.

═══════════════════════════════════════════════════════════════════
LOGGING GOVERNANCE
═══════════════════════════════════════════════════════════════════

- NEVER console.log — use this.logger (NestJS Logger wrapping Pino)
- NEVER log raw IP — use ipHash SHA-256
- NEVER log idempotency key values in plaintext
- Include structured context: { productId, inventoryId, userId, reservationId }

═══════════════════════════════════════════════════════════════════
PHASE COMPLETION SELF-AUDIT
═══════════════════════════════════════════════════════════════════

Before declaring phase complete, confirm EACH item:

[ ] Only modified files listed in Phase [N] scope
[ ] pnpm typecheck → ZERO errors
[ ] pnpm test → ALL phase tests passing (100%)
[ ] pnpm lint → ZERO errors
[ ] Zero console.log
[ ] No numeric TTL literals (computeReservationTtl() used)
[ ] No timestamp in any EventOutbox deduplicationKey
[ ] No raw string in $queryRaw (Prisma.sql template only)
[ ] No update()/delete() in movement or snapshot repositories
[ ] Lock key is inv_lock:{inventoryId} if touching locking code
[ ] Idempotency check is first operation in reserve() if touching reserve
[ ] release() returns alreadyReleased=true for terminal states (not throws)
[ ] No Redis/HTTP/BullMQ call inside any $transaction callback
[ ] expiresAt not in any Zod input schema
[ ] Have NOT implemented anything from future phases

═══════════════════════════════════════════════════════════════════
STOP AFTER PHASE GATE
═══════════════════════════════════════════════════════════════════

After Phase [N] gate criteria are fully met:
1. Report exact gate status (PASS/FAIL per criterion with evidence)
2. STOP — do not proceed to Phase [N+1]
3. Wait for explicit instruction before beginning next phase
```

---

## §32 SPRINT 3 FINAL AUDIT PROMPT

> Run AFTER all phases complete. Sprint 4 CANNOT begin until CERTIFIED PASS.

```
You are Principal Enterprise Architecture Auditor for VyaparNet Sprint 3 Final Audit.

AUTHORITY DOCUMENT: /Users/akashkumar/Documents/VyaparNet/implementation/sprint-packs/SPRINT_3_ORCHESTRATION.md

Read §0 (Global Invariants), §3 (Transaction Boundary), §4 (Cache Authority),
§5 (Server Time), §6 (EventOutbox Dedup), §29 (Failure Conditions) BEFORE auditing.

═══════════════════════════════════════════════════════════════════
AUDIT DOMAIN 1: GLOBAL INVARIANTS (BLOCKING)
═══════════════════════════════════════════════════════════════════

INV-1 DB Authority:
  [ ] inv_stock cache NOT used in reserve() or updateStock()
  [ ] All correctness decisions read from DB inside $transaction

INV-2 Non-Negative Quantity:
  [ ] Run SQL: SELECT * FROM "Inventory" WHERE quantity < 0 → ZERO rows
  [ ] decrementQuantityWithVersion has quantity: { gte: qty } guard

INV-3 Atomic Bundle:
  [ ] quantity decrement + reservation + movement + EventOutbox = one $transaction

INV-4 Lock Timing:
  [ ] Lock acquired before $transaction, released after (withLock() finally)
  [ ] No lockService.release() inside $transaction callback

INV-5 Optimistic Locking:
  [ ] decrementQuantityWithVersion WHERE version=N → count==0 → ConcurrencyException → retry

INV-6 Idempotency Order:
  [ ] First await in reserve() = Redis GET inv_idem:{key}
  [ ] SETEX happens outside $transaction, after commit

INV-7 Append-Only:
  [ ] movement.repository.ts: grep update/delete → ZERO
  [ ] snapshot.repository.ts: grep update/delete → ZERO

INV-8 Server Time:
  [ ] expiresAt NOT in any input schema
  [ ] expiresAt computed server-side in executeReservationTransaction()

INV-9 Degraded Correctness:
  [ ] DEGRADED mode still uses $transaction + version check
  [ ] DEGRADED mode does NOT skip movement creation or EventOutbox

INV-10 Anti-Oversell:
  [ ] available < quantity → 422 INSUFFICIENT_STOCK (inside $transaction with FOR UPDATE)
  [ ] This check is INSIDE $transaction, not before it

═══════════════════════════════════════════════════════════════════
AUDIT DOMAIN 2: TRANSACTION BOUNDARY (BLOCKING)
═══════════════════════════════════════════════════════════════════

  [ ] grep 'redis\.' inside any $transaction callback → ZERO matches
  [ ] grep 'queue.add\|job.queue' inside any $transaction → ZERO matches
  [ ] grep 'fetch\|axios\|http' inside any $transaction → ZERO matches
  [ ] grep 'eventEmitter.emit' inside any $transaction → ZERO matches
  [ ] All $transaction have timeout: 5000
  [ ] All $transaction have isolationLevel: 'ReadCommitted'
  [ ] All $transaction use WITH clause or FOR UPDATE on specific Inventory row

═══════════════════════════════════════════════════════════════════
AUDIT DOMAIN 3: CACHE AUTHORITY (HIGH)
═══════════════════════════════════════════════════════════════════

  [ ] inv_stock cache read ONLY in getAvailability() — not in reserve() or updateStock()
  [ ] No parseInt(cachedValue) used to make reservation decisions
  [ ] Cache invalidation after PATCH and after reserve/release (async best-effort)

═══════════════════════════════════════════════════════════════════
AUDIT DOMAIN 4: SERVER TIME (HIGH)
═══════════════════════════════════════════════════════════════════

  [ ] expiresAt absent from ReserveInventorySchema
  [ ] expiresAt absent from all input DTOs
  [ ] expiresAt computed in executeReservationTransaction() only
  [ ] Expiry worker uses new Date() for comparison (server time)

═══════════════════════════════════════════════════════════════════
AUDIT DOMAIN 5: EVENTOUTBOX DEDUP (BLOCKING)
═══════════════════════════════════════════════════════════════════

  [ ] grep 'deduplicationKey.*Date.now()' → ZERO matches
  [ ] grep 'deduplicationKey.*new Date()' → ZERO matches
  [ ] grep 'deduplicationKey.*randomUUID()' → ZERO matches
  [ ] All dedup keys match §6.1 canonical table
  [ ] All EventOutbox creates inside $transaction
  [ ] All events have eventVersion: "1.0" and schemaVersion: "4.3"

═══════════════════════════════════════════════════════════════════
AUDIT DOMAIN 6: CONCURRENCY (BLOCKING)
═══════════════════════════════════════════════════════════════════

  [ ] Lock key is inv_lock:{inventoryId} (NOT productId)
  [ ] release() uses Lua CAS script — grep 'redis.del' in lock service → ZERO direct dels
  [ ] Idempotency order correct: Redis GET before protection mode before abuse before lock
  [ ] AbuseGuard.check() called BEFORE lockService.withLock()
  [ ] Concurrency tests C1-C8 all passing
  [ ] Load tests L1-L7 all passing with DB state assertions

═══════════════════════════════════════════════════════════════════
AUDIT DOMAIN 7: RELEASE & COMPENSATION (BLOCKING)
═══════════════════════════════════════════════════════════════════

  [ ] Terminal states: RELEASED, EXPIRED, CANCELLED, CONSUMED → { alreadyReleased: true }
  [ ] release() NEVER throws for terminal state reservations
  [ ] STATUS_MAP matches §20.2 exactly
  [ ] increment failure → CRITICAL log, NOT throw
  [ ] EventOutbox InventoryReleased: dedup = inv-released-{reservationId}

═══════════════════════════════════════════════════════════════════
AUDIT DOMAIN 8: SEGMENT EXTENSIBILITY (MEDIUM)
═══════════════════════════════════════════════════════════════════

  [ ] grep 'TEXTILE\|SPARE_PARTS' in service files → ZERO matches (only in seed + test data)
  [ ] All thresholds from SegmentInventoryPolicy — no hardcoded numbers
  [ ] New segment = only a new DB seed row — zero code changes required

═══════════════════════════════════════════════════════════════════
AUDIT DOMAIN 9: SPRINT 4 READINESS (BLOCKING)
═══════════════════════════════════════════════════════════════════

  [ ] InventoryModule exports: [InventoryService] only
  [ ] No repositories exported
  [ ] consume() signature: (reservationId, actorId, tx: PrismaTransactionClient) — tx required
  [ ] consume() uses passed tx for ALL operations — does not open own $transaction
  [ ] All five public methods match §18.3 interface exactly

═══════════════════════════════════════════════════════════════════
AUDIT VERDICT
═══════════════════════════════════════════════════════════════════

CERTIFIED ✅ — Sprint 3 production-ready. Sprint 4 may begin.
  (All BLOCKING items PASS, no HIGH items FAIL)

BLOCKED ❌ — Sprint 4 MUST NOT begin.
  Failing items: [list each with domain.item and file:line evidence]
  Remediations required: [exact changes needed for each failing item]
```

---

## §33 GOVERNANCE RULES

### §33.1 Commit Governance

```
One commit per sub-phase. Never commit across phase boundaries.

Format: feat(inventory): Phase N.N — [description]
Example: feat(inventory): Phase 2A — InventoryLockService with Lua CAS release

FORBIDDEN:
  "inventory module done"     — too vague
  "WIP" commits on main       — incomplete state
  Multi-phase commits         — defeats phased gate model
  Committing failing tests    — gate must pass before commit

REQUIRED per commit:
  pnpm typecheck → zero errors
  pnpm lint → zero errors
  All tests for committed phase pass
```

### §33.2 DB Migration Governance

```
RULE 1: One migration per sprint — name: 0003_sprint3_inventory_hardening
RULE 2: CREATE INDEX CONCURRENTLY runs AFTER migration — never inside migration transaction
RULE 3: No ALTER TABLE DROP COLUMN in Phase 1 — additive only
RULE 4: Migration irreversible in staging — backup before applying
RULE 5: Run prisma migrate diff before applying to staging
RULE 6: Read v4.3 schema FULLY before writing any ALTER TABLE — duplicate columns = irreversible failure
```

### §33.3 Redis Key Governance

```
All Sprint 3 Redis keys MUST use exact prefixes from §8.1.

FORBIDDEN key patterns: inventory:{anything}, stock:{productId}, lock:{anything}
ALL keys use inv_ prefix as defined in §8.1 registry.
```

### §33.4 Repository Governance

```
RULE 1: Repositories are the ONLY place with Prisma access
RULE 2: movement.repository.ts is APPEND-ONLY forever (no update/delete/updateMany)
RULE 3: snapshot.repository.ts is APPEND-ONLY forever
RULE 4: No repository imports another repository
RULE 5: findByProductIdWithLock() MUST receive tx (FOR UPDATE outside tx = no-op)
RULE 6: All findMany() have explicit take and orderBy (no unbounded queries)
RULE 7: All $queryRaw use Prisma.sql template tag — NEVER string interpolation
```

### §33.5 DTO Governance

```
ALL inventory DTOs: packages/types/src/inventory/inventory.schemas.ts
DTOs are Zod schemas — NOT class-validator decorators
expiresAt MUST NOT appear as an input field in any DTO
No modifying Sprint 1 or 2 DTOs without DDR approval
```

### §33.6 Testing Governance

```
RULE 1: Phase 2 and 3 tests are NOT optional — gate does not advance without 100% pass
RULE 2: Concurrency tests C1-C8 run with real PostgreSQL + real Redis (no mocking for these)
RULE 3: Load tests L1-L7 assert DB state, not just HTTP codes
RULE 4: Coverage target >= 80% for inventory module
RULE 5: No test.only() or test.skip() in committed code
```

### §33.7 Observability Governance

```
RULE 1: Every business operation emits at least one metric
RULE 2: inventory_oversell_prevented_total must be 0 in production — alert at > 0
RULE 3: inventory_drift_detected must be 0 on fresh system — alert at > 0
RULE 4: All logs via NestJS Logger (Pino) — no console.log
RULE 5: Structured context required: { productId, inventoryId, qty, reservationId, mode }
```

---

## §34 AI-AGENT IMPLEMENTATION WARNINGS

These are real failure patterns observed in AI implementations of distributed inventory systems.

```
WARNING 1 — REDIS INSIDE $TRANSACTION (§3 — most common failure)
  AI agents put Redis operations (cache reads, lock checks) inside $transaction.
  This causes lock-duration amplification and potential deadlock.
  Detection: grep for 'redis\.' inside any $transaction callback → ZERO allowed

WARNING 2 — LOCK KEY DRIFT
  AI agents use productId instead of inventoryId for lock keys.
  FORBIDDEN: inv_lock:{productId}
  REQUIRED:  inv_lock:{inventoryId}
  Detection: grep 'inv_lock:.*productId' → ZERO matches

WARNING 3 — PLAIN DEL FOR LOCK RELEASE
  AI agents use redis.del(key) without Lua CAS token check.
  FORBIDDEN: redis.del(key) for lock release
  REQUIRED:  redis.eval(luaScript, 1, key, lockToken)
  Detection: grep 'redis.del' in inventory-lock.service.ts → ZERO direct dels

WARNING 4 — LOCK RELEASED INSIDE $TRANSACTION
  Race condition: another thread enters before current transaction commits.
  Detection: search for release() call inside $transaction(async (tx) => { ... })

WARNING 5 — IDEMPOTENCY CHECK NOT FIRST
  AI agents put idempotency after protection mode or policy checks.
  Detection: read reserve() top-to-bottom — first await MUST be Redis GET inv_idem

WARNING 6 — TIMESTAMP IN DEDUP KEY (§6 — second most common failure)
  AI agents generate: `inv-reserved-${reservationId}-${Date.now()}`
  Every retry = unique key = duplicate events on replay.
  Detection: grep 'Date.now()\|new Date()' near 'deduplicationKey' → ZERO

WARNING 7 — CLIENT-SUPPLIED EXPIRY ACCEPTED (§5)
  AI agents add expiresAt to Zod input schema accepting client values.
  Detection: grep 'expiresAt' in any Zod .object() schema → must NOT appear as input

WARNING 8 — CONCURRENT RELEASE THROWS INSTEAD OF IDEMPOTENT
  AI agents throw on already-released reservation.
  REQUIRED: Terminal states → { alreadyReleased: true } — never throw.
  Detection: release() test with RELEASED reservation must return 200, not 4xx

WARNING 9 — UPDATE METHOD IN MOVEMENT REPO
  AI agents add updateReason() or similar to movement.repository.ts.
  Detection: grep 'update' in movement.repository.ts → ZERO

WARNING 10 — HARDCODED TTL VALUES
  AI agents write: const TTL = 900
  REQUIRED: ALL TTLs from computeReservationTtl(policy, context)
  Detection: grep for 3-digit numeric literals in inventory services → review each

WARNING 11 — CRON JOB ID MISSING
  Each API restart without stable jobId creates another cron. 10 restarts = 10x frequency.
  Detection: check BullMQ repeatable jobs list for duplicates after restart

WARNING 12 — MOVEMENT REPO CALLED WITHOUT TX IN TRANSACTION
  Agents call movementRepo.create(data) without tx inside $transaction callback.
  REQUIRED: Every repo call inside $transaction includes the tx argument.
  Detection: search $transaction callbacks for repo calls without tx argument

WARNING 13 — OFFSET PAGINATION IN WORKERS
  AI agents use skip: N offset pagination in snapshot worker.
  At 1M records: O(N²) degradation.
  REQUIRED: Cursor pagination (lastId) — never offset.
  Detection: grep 'skip:' in snapshot worker → ZERO (except cursor skip: 1)

WARNING 14 — VELOCITY COUNTER NON-ATOMIC (§15.2)
  AI agents use: const count = parseInt(await redis.get(key)); redis.set(key, count+1)
  Two concurrent requests race → limit bypassed.
  REQUIRED: redis.incr(key) (single atomic operation)
  Detection: grep 'redis.get.*velocity\|redis.set.*velocity' → ZERO (must use INCR)

WARNING 15 — FULL SCAN IN RECONCILIATION
  AI agents implement reconciliation as findAll() → check each record.
  O(N) — fails at scale.
  REQUIRED: findUpdatedSince(checkpoint, batchSize) using idx_inv_updated_at.
  Detection: findMany() without WHERE updatedAt > checkpoint in reconcile service

WARNING 16 — HTTP CALL INSIDE TRANSACTION
  AI agents make external service calls (notification, payment verification) inside $transaction.
  This amplifies lock duration by network latency and causes contention.
  Detection: grep 'fetch\|axios\|http.request\|got(' inside $transaction callback → ZERO
```

---

## §35 ROLLBACK & OPERATIONAL READINESS

### §35.1 Phase-Level Rollbacks

```
Rollback Phase 8 (observability):
  Remove: inventory.metrics.ts, grafana dashboard, load test files
  Risk: ZERO — no business logic affected

Rollback Phase 7 (frontend):
  Remove: StockStatus, inventory management page
  Risk: ZERO to backend

Rollback Phase 6 (seed + event consumer):
  Remove: SegmentInventoryPolicy rows (DELETE FROM), event consumer
  Risk: LOW — products won't auto-create Inventory on publish

Rollback Phase 5 (workers):
  Remove: workers, cron registration
  Risk: MEDIUM — reservations accumulate past expiry
  Action: Run manual expiry SQL:
    SELECT id FROM "InventoryReservation"
    WHERE status='ACTIVE' AND expires_at < now()
    -- Then release each via InventoryService.release()

Rollback Phase 4 (controller):
  Remove: controller, facade. Module reverts to no-routes state.
  Risk: LOW — internal services still functional

Rollback Phase 3 (reserve/release — DANGEROUS):
  Stop all traffic first.
  Remove: reserve/release/update service files
  Delete: All test InventoryReservation rows
  Restore: Inventory quantities to pre-test values manually
  Risk: HIGH — requires manual DB reconciliation

Rollback Phase 2 (services):
  Remove: 4 service files, replace repo implementations with stubs
  Risk: LOW — no data written

Rollback Phase 1 (schema — MOST DANGEROUS):
  Dev: prisma migrate reset
  Staging: Restore from pre-migration backup
  NEVER: manual ALTER TABLE DROP COLUMN in production
  Risk: CRITICAL — full data risk in staging+
```

### §35.2 Operational Readiness Checklist

```
INFRASTRUCTURE
[ ] Redis 7 running with AOF persistence (not in-memory only)
[ ] PostgreSQL 15 running with autovacuum enabled
[ ] Autovacuum tuning SQL applied (§9.5)
[ ] BullMQ worker process running (separate from API process)
[ ] inv_protect_mode Redis key absent (NORMAL mode default)

DATABASE
[ ] prisma migrate status → all applied on staging
[ ] All CONCURRENTLY indexes created (verify with pg_stat_user_indexes)
[ ] EXPLAIN ANALYZE for hot paths — no Seq Scan on indexed columns
[ ] pg_stat_statements extension enabled
[ ] SegmentInventoryPolicy seeded for TEXTILE + SPARE_PARTS

OBSERVABILITY
[ ] Grafana dashboard imported and accessible
[ ] Alert rules configured:
    inventory_oversell_prevented_total > 0 → PAGE IMMEDIATELY
    inventory_drift_detected{isCritical="true"} > 0 → PAGE IMMEDIATELY
    inventory_protection_mode_active{mode="READ_ONLY"} == 1 → PAGE
[ ] Pino logs visible in log aggregator

API
[ ] GET /api/v1/health/ready → 200
[ ] GET /api/v1/inventory/:productId (public) → 200
[ ] OpenAPI spec at /contracts/inventory.yaml matches deployed routes

RECOVERY RUNBOOKS DOCUMENTED
[ ] Runbook: inv_protect_mode = READ_ONLY — how to recover
[ ] Runbook: Inventory drift detected — investigation steps
[ ] Runbook: Expiry worker DLQ accumulates — manual cleanup procedure
[ ] Runbook: Manual expiry SQL script ready for stuck ACTIVE reservations
```

---

## §36 FUTURE SCALABILITY & MIGRATION NOTES

### §36.1 Segment Expansion (Zero Code Changes)

```
Adding PHARMA, ELECTRONICS, RFQ:
  1. Add enum value to Segment (Prisma migration — required)
  2. Insert SegmentInventoryPolicy seed row
  3. ZERO application code changes

Works because:
  All segment behavior is in SegmentInventoryPolicy (DB-driven)
  InventoryEngine has no if/switch(segment) blocks
  computeReservationTtl() is policy-driven
```

### §36.2 Variant/Location-Level Inventory

```
Current: 1 Product → 1 Inventory record
Future:  1 Product → N Inventory records (per variant/location)

Migration path:
  Lock key is inv_lock:{inventoryId} → already fine-grained, no changes needed
  InventoryReserveService takes inventoryId → no service changes
  Buyer selects variant → system resolves inventoryId → same reserve() call
  ZERO service code changes
```

### §36.3 Microservice Extraction (Phase 3)

```
InventoryModule designed as saga participant from day 1 (§18).
When extracted:
  - InventoryService public interface stays identical
  - Transport layer added (HTTP or Kafka)
  - OrderModule calls inventory via HTTP instead of direct import
  - EventOutbox events move to Kafka topics
  Sprint 3 code changes: ZERO
```

### §36.4 Hot Product Wait-Room (Phase 2)

```
Sprint 3 plants detection hook (inv_hot_product counter in §19.1).
Phase 2 addition (when needed):
  - Tier 2+ contention → route reservations to BullMQ queue (concurrency: 1 per inventoryId)
  - Response: { status: 'QUEUED', estimatedWaitSeconds: N }
  Sprint 3 code changes needed for this: add queue routing in reserve() at Tier 2 threshold
```

### §36.5 PostgreSQL Partitioning (Phase 2)

```
InventoryReservation: partition by expiry month (expiresAt column)
InventoryMovement:    partition by creation month (eventMonth column pattern)
pg_partman for automated partition creation
Sprint 3 code changes: ZERO (queries use indexed date columns naturally)
```

### §36.6 Redis → Redis Cluster (Phase 2)

```
All inventory Redis keys use single key per operation → Cluster-safe
Lua scripts use single key (KEYS[1]) → Cluster-safe
Change needed: Redis connection configuration only
Sprint 3 code changes: ZERO
```

---

**END OF SPRINT 3 EXECUTION LOCK FINAL v3.0**

---

*This document is the complete, unified, hardened implementation authority for Sprint 3.*
*It supersedes sprint3.md, SPRINT_3_IMPLEMENTATION_LOCKED.md, and SPRINT_3_ORCHESTRATION.md v1.0.*
*Those documents are ARCHIVE / REFERENCE ONLY.*

*Zero-oversell guarantee is a product promise.*
*Every governance rule here — transaction boundary isolation, cache authority, server time authority,*
*deterministic dedup keys, Lua CAS locking, inventory-level granularity, dynamic TTL computation,*
*bucketed expiry, incremental reconciliation, multi-dimensional abuse protection,*
*degraded mode correctness guarantees, saga compensation philosophy, event version evolution —*
*exists to keep that promise under every failure mode, at every scale, for every future segment.*

*No Sprint 4 implementation begins until Sprint 3 validation gate is CERTIFIED PASSED with ZERO failures.*

*This document is the ONLY implementation authority for Sprint 3.*
