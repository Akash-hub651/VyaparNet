# VYAPARNET — SPRINT 5 SCOPE DECISIONS
## Enterprise Architecture Board Authority
### Version: v1.1 | Status: APPROVED — ALL DECISIONS FINAL
### Authority: Post-Sprint-4 Freeze | Date: 2026-05-29
### Precedes: Sprint 5 Architecture Generation
### Board: Enterprise Architecture + Marketplace Platform Design + B2B Commerce Domain + Distributed Systems Review

---

> **DOCUMENT PURPOSE**
> This document locks every architectural assumption, philosophy, and boundary decision for Sprint 5.
> It is the ONLY input to Sprint 5 Architecture Generation.
> No architecture generation begins until this document is reviewed and approved.
> Every decision inherits Sprint 1–4 frozen guarantees without weakening any of them.
> Where this document is silent, the governing document is the Sprint 1–4 lock that addressed it.

---

## EXECUTIVE SUMMARY

Sprint 5 completes the **minimum viable commerce loop** of VyaparNet. Sprint 4 created the transaction engine. Sprint 5 exposes that engine to the two parties who need to act on it: the **seller** (who must fulfill) and the **buyer** (who must track). Without Sprint 5, VyaparNet is a closed system — money moves but neither party can see or act on their obligations.

This sprint also plants the governance seeds for Sprint 6 (Notifications), Sprint 7 (Admin), Sprint 8 (Returns), and Sprint 9 (ERP/Analytics) — every EventOutbox event, every ownership boundary, and every scorecard formula defined here will be consumed downstream.

**Critical architectural truth this sprint must establish:**

> A seller on VyaparNet NEVER sees another seller's order. A buyer NEVER sees another buyer's order. These are not implementation details — they are identity-level contracts enforced at every layer.

---

## ABSOLUTE SPRINT 1–4 GUARANTEES (INHERITED — NON-NEGOTIABLE)

The following are immutable laws in Sprint 5. No Sprint 5 decision may weaken them.

| Guarantee | Source | Sprint 5 Implication |
|---|---|---|
| Zero-oversell guarantee | Sprint 3 INV-1–INV-10 | Reorder and inventory update paths must check stock before any write |
| InventoryService is the sole inventory authority | Sprint 3 INV-12 | Seller inventory updates MUST go through InventoryService — never direct DB writes |
| EventOutbox is the ONLY cross-module communication | Sprint 3 INV-13 | `OrderStatusChanged`, `SupplierScoreUpdated` — ONLY via EventOutbox |
| Append-only audit philosophy | Sprint 3 INV-7 | `OrderStatusHistory` — no UPDATE, no DELETE. Status transitions create new rows only |
| Deterministic EventOutbox dedup keys | Sprint 3 §6 | All Sprint 5 events use deterministic keys — no `Date.now()`, no `randomUUID()` |
| No Redis/HTTP/external calls inside `$transaction` | Sprint 3 §3 | S3 upload links, Redis KPI cache — ALL happen outside transaction boundaries |
| Idempotency key is first operation | Sprint 3 INV-6 | Status transitions and reorders must check idempotency before any DB write |
| DTO governance via Zod in `packages/types` | Sprint 1–3 | All Sprint 5 DTOs live in `packages/types/src/{seller,buyer}/` |
| Buyer ownership via `buyerId` filter | Sprint 4 | `order.buyerId = req.user.id` on ALL buyer reads/mutations |
| @Roles(BUYER) on buyer routes, @Roles(SELLER) on seller routes | Sprint 4 OPTIONAL-4 | Never relaxed, never skipped, never conditionally applied |
| payment.create + eventOutbox.create atomic | Sprint 4 MEDIUM-1 | No new non-atomic two-write patterns anywhere in Sprint 5 |

---

## DECISION INDEX

| ID | Decision Topic | Summary |
|---|---|---|
| D1 | Seller Order Visibility Model | Seller sees OrderItems for their businessId only — not full cross-seller order |
| D2 | Seller Ownership Enforcement | Dual-layer: Controller (JWT role) + Repository (businessId filter). Guard resolves businessId |
| D3 | Order Status Transition Authority | SELLER: PLACED→CONFIRMED→PROCESSING→SHIPPED. trackingNumber REQUIRED for SHIPPED. No auto-confirm |
| D4 | Dispatch Proof Architecture | trackingNumber = mandatory authoritative proof. Dispatch proof = optional supporting evidence |
| D4.1 | Dispatch Proof Upload Governance | S3 pre-signed URL + HEAD verify before DB write. URL stored in OrderTracking |
| D5 | Seller KPI Authority | DB is source of truth. Redis cache TTL 60s. Redis failure → bypass cache, serve from DB |
| D5.1 | KPI Cache Failure Governance | Redis outage MUST NOT block dashboard. DB fallback mandatory. Observability signal on bypass |
| D6 | Seller Scorecard Design | 3 metrics, 6h batch cron, separate SellerScore model, ≥1 point threshold for event emission |
| D7 | Buyer Reorder Strategy | Current prices + current inventory. Partial reorder allowed. Every skipped item in warnings[] |
| D8 | Buyer Order Tracking Model | OrderStatusHistory is timeline authority. OrderTracking carries logistics metadata only |
| D9 | Payment Retry Governance | Sprint 4 server logic is final. Sprint 5 adds buyer-facing UI only |
| D10 | Dashboard Performance Strategy | Cursor pagination mandatory. OFFSET banned. No COUNT(*) on list endpoints |
| D11 | EventOutbox Requirements | OrderStatusChanged + SupplierScoreUpdated with complete payloads |
| D12 | Observability Requirements | 7 new metrics, 3 alerts. All wired at implementation time — no ghost metrics |
| D13 | Security Decisions | Seller isolation at DB layer. Buyer privacy masked. Upload abuse prevention |
| D14 | Future Sprint Compatibility | All decisions verified against Sprint 6, 7, 8, 9 requirements |

---

## §D1 — SELLER ORDER VISIBILITY MODEL

### Context

The `Order` model has both `buyerId` and `sellerId`. In the current architecture, a single order belongs to one buyer AND one seller (`Business`). VyaparNet does not support multi-seller split orders in Sprint 5 (Phase 2 feature). `OrderItem.sellerId` exists in schema for that future.

### Problem

What does a seller see when they call `GET /seller/orders`?

If the platform evolves to multi-seller cart split orders, `OrderItem.sellerId` will differ from `Order.sellerId`. We must decide NOW which model is authoritative to prevent future data leakage.

### Alternatives Considered

- **Option A: Seller sees full Order including ALL OrderItems** — Works for single-seller. Breaks on multi-seller split orders. Leaks competitor pricing.
- **Option B: Seller sees only OrderItems where `OrderItem.sellerId = businessId`** — Correct for multi-seller future. Complex now.
- **Option C: Hybrid — Full Order header, filtered OrderItems** — Order header (address, status, dates) visible. Only their own OrderItems visible. **Selected.**

### Decision

**Option C — Hybrid: Full Order header, filtered OrderItems.**

- Seller CAN see: `order.shippingAddressSnapshot`, `order.status`, `order.grandTotal`, `order.orderNumber`, `order.createdAt`
- Seller CAN see only: `OrderItem` records where `OrderItem.sellerId = seller.businessId`
- Seller CANNOT see: OrderItems belonging to other sellers
- Seller CANNOT see: Raw `order.buyerId`, buyer phone, or buyer email (see D13.3)

### Repository Authority

```typescript
// SellerOrderRepository — mandatory signature
findByIdForSeller(orderId: string, sellerId: string): Promise<SellerOrderView>
  → WHERE order.id = orderId AND order.sellerId = sellerId
  → INCLUDE items WHERE items.sellerId = sellerId
  // NEVER return items where sellerId does not match
```

**This filter MUST be in the repository layer, not the service layer.**

### Future Impact

- Phase 2 multi-seller cart split: zero schema change, zero repository change
- Sprint 7 Admin: separate admin query without `sellerId` filter — different module, different repository
- Sprint 8 Returns: `ReturnRequest.sellerId` uses same filter pattern

### Risks Avoided

- Cross-seller product, price, and buyer identity exposure
- Phase 2 migration complexity (design already accommodates it)

---

## §D2 — SELLER OWNERSHIP ENFORCEMENT

### Context

`Order.sellerId` references `Business.id`. JWT carries `user.id`. These are NOT the same value. This mismatch is the single most dangerous implementation trap in Sprint 5.

### Problem

How do we translate `req.user.id → business.id` for ownership checks? Where in the stack?

### Alternatives Considered

- **Option A: Service resolves businessId on every call** — duplicated, one miss = security breach
- **Option B: businessId embedded in JWT** — stale on business suspension, security risk
- **Option C: Middleware resolves once per request** — clean, but single point of failure
- **Option D: Guard resolves once + Repository enforces** — defense in depth. **Selected.**

### Decision

**Option D — Dual-layer: Guard resolves businessId, Repository enforces it.**

```
Layer 1 — @Roles(UserRole.SELLER)   via global RolesGuard (Controller decorator)
Layer 2 — SellerContextGuard        resolves Business from userId → attaches req.seller
Layer 3 — Repository                EVERY query WHERE sellerId = req.seller.businessId
```

**SellerContextGuard behavior:**
1. Read `user.id` from JWT
2. Query `Business WHERE ownerId = user.id AND isDeleted = false`
3. If not found → `403 BUSINESS_NOT_FOUND`
4. If `kycStatus = SUSPENDED` → `403 BUSINESS_SUSPENDED`
5. Attach `req.seller = { businessId: business.id, segment: business.segment }`

**Redis cache:** `seller_biz:{userId}` → TTL 60s. Invalidated on Business update/suspension.

### AI-Agent Safety Rule

> **TRAP S5-T1:** Never compare `order.sellerId !== req.user.id`. This is always wrong.
> **FIX:** SellerContextGuard resolves `businessId`. Repository uses `businessId`. Never compare `Business.id` to `User.id`.

### Future Impact

- Sprint 7 Admin: no `SellerContextGuard`. Admin guard is entirely separate code path
- Multi-business seller (Phase 2): Guard returns `business[]`, context switched via query param
- Sprint 8 Returns: same `businessId` pattern for `ReturnRequest` ownership

---

## §D3 — ORDER STATUS TRANSITION AUTHORITY

### Context

`OrderStatus` has 16 possible states. Not all transitions are valid. Not all actors can make all transitions. Ambiguity enables fraud (seller marking DELIVERED without shipping, buyer self-cancelling after SHIPPED).

### Complete Transition Table

| Actor | From | To | Requirement | Decision Authority |
|---|---|---|---|---|
| SELLER | PLACED | CONFIRMED | Mandatory — seller must explicitly accept | **OQ-1 FINAL: No auto-confirm** |
| SELLER | CONFIRMED | PROCESSING | Optional intermediate step | — |
| SELLER | CONFIRMED | SHIPPED | `trackingNumber.trim().length > 0` REQUIRED | **OQ-2 FINAL: Mandatory** |
| SELLER | PROCESSING | SHIPPED | `trackingNumber.trim().length > 0` REQUIRED | **OQ-2 FINAL: Mandatory** |
| BUYER | PLACED | CANCELLED | Within Sprint 4 cancellation window | — |
| BUYER | CONFIRMED | CANCELLED | Within **2-hour grace window** (flat, not segment-configurable) | **OQ-3 FINAL: 2h flat** |
| SYSTEM | PLACED | PAYMENT_FAILED | Payment webhook (Sprint 4 implemented) | — |
| SYSTEM | PLACED | CONFIRMED | COD auto-confirm only (Sprint 4 implemented) | — |
| SYSTEM | PAYMENT_FAILED | CANCELLED | Retry window expired (Sprint 4 implemented) | — |
| ADMIN | SHIPPED | DELIVERED | Sprint 7 only — not Sprint 5 | — |
| ADMIN | DELIVERED | COMPLETED | Sprint 7 only | — |
| ADMIN | ANY | CANCELLED | Sprint 7 only, with mandatory reason | — |

### Decision

**D3.1 — SELLER state machine (Sprint 5 scope) — OQ-1 RESOLVED: Mandatory Confirmation:**

Seller confirmation of PLACED orders is **mandatory**. There is **no auto-confirm after any time window**.

- Orders remain in `PLACED` status indefinitely until seller explicitly calls `PATCH /seller/orders/:id/status → CONFIRMED`.
- If a seller fails to confirm within 24 hours, the order is flagged in the KPI dashboard as overdue — but the system does NOT auto-confirm and does NOT auto-cancel in Sprint 5.
- Sprint 7 Admin will handle escalation/cancellation of stale unconfirmed orders.
- Rationale: Auto-confirm would allow inventory-less sellers to accept orders without reviewing them — a significant fraud and dispute risk in B2B trade where order values can exceed ₹1 lakh.

```typescript
const SELLER_VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PLACED: ['CONFIRMED'],
  CONFIRMED: ['PROCESSING', 'SHIPPED'], // PROCESSING is skippable
  PROCESSING: ['SHIPPED'],
  // All other statuses: seller cannot initiate transitions
};
```

**D3.2 — trackingNumber Validation — OQ-2 RESOLVED: Mandatory:**

TrackingNumber is **mandatory** when transitioning to SHIPPED. The following validation MUST execute BEFORE the `$transaction` begins:

```typescript
// Service layer — before $transaction
if (toStatus === 'SHIPPED') {
  if (!body.trackingNumber || body.trackingNumber.trim().length === 0) {
    throw new UnprocessableEntityException({
      code: 'TRACKING_NUMBER_REQUIRED',
      message: 'Tracking number is mandatory to mark order as shipped',
    });
  }
}
```

Rationale: Tracking number is the authoritative proof that a physical shipment has occurred. Without it, `SHIPPED` status is unverifiable and provides no actionable information to the buyer. Local delivery sellers MUST provide any reference (hand-delivery note, local courier receipt number, or self-generated reference) — the field is non-null but not externally validated for format.

**D3.3 — Buyer cancellation grace window — OQ-3 RESOLVED: 2 hours flat, NOT segment-configurable:**

Allowed within **2-hour grace window** after `order.confirmedAt`. After 2h → `422 CANCELLATION_WINDOW_EXPIRED`.
This window is uniform across all segments (TEXTILE, SPARE_PARTS, etc.). Segment-specific windows add implementation complexity without clear B2B justification — deferred to Phase 2 if requested by segment managers.

**D3.4 — Idempotency on status transitions:** Every `PATCH /seller/orders/:id/status` requires `Idempotency-Key` header.
```
Dedup check: Redis SET NX `status-transition:{orderId}:{toStatus}:{idempotencyKey}` TTL 86400s
If key exists → return 200 with current order state (no error, no re-processing)
```

**D3.5 — Every transition MUST (inside single $transaction):**
1. `tx.order.update({ status: newStatus, [timestampField]: new Date() })`
2. `tx.orderStatusHistory.create({ statusFrom, statusTo, actorId, actorRole, reason })`
3. `tx.eventOutbox.create({ eventType: 'OrderStatusChanged', ... })`

Invalid transition → `422 INVALID_STATUS_TRANSITION` with `{ from, to, allowedTransitions[] }` — BEFORE any `$transaction` begins.

### AI-Agent Implementation Traps

> **TRAP S5-T3:** Agent writes `order.update({ status: newStatus })` without state machine check.
> **FIX:** State machine validation BEFORE `$transaction`. `$transaction` runs only if transition is valid.

> **TRAP S5-T7:** `eventOutbox.create()` called OUTSIDE the `$transaction`. If crash happens between commit and outbox write, event is lost permanently.
> **FIX:** All three writes (order update, history, outbox) inside single `$transaction`. This is Sprint 4 MEDIUM-1 law.

> **TRAP S5-T8:** Agent allows `SHIPPED` transition with empty/null `trackingNumber`.
> **FIX:** Validate `trackingNumber.trim().length > 0` BEFORE state machine check. Return `422 TRACKING_NUMBER_REQUIRED` immediately.

---

## §D4 — DISPATCH PROOF ARCHITECTURE

### OQ-6 RESOLVED: Dispatch Proof Governance — Tracking Number vs. Dispatch Proof

**Decision (FINAL):**

| Authority | Field | Status | Rationale |
|---|---|---|---|
| **Shipment proof** | `trackingNumber` | **MANDATORY** (OQ-2) | Authoritative evidence that a shipment has occurred. Required for SHIPPED transition. Buyer can track. Disputes use this as primary proof |
| **Supporting evidence** | Dispatch proof (S3 upload) | **OPTIONAL** | Photo/invoice adds credibility but is not gating. Sellers without mobile cameras or file access must not be blocked from shipping |

**Rule:** A seller can mark SHIPPED with only `trackingNumber`. Uploading a dispatch proof is encouraged but never required.
**Rule:** Dispatch proof upload can happen AFTER the SHIPPED transition — it is a standalone action, not part of the SHIPPED transaction.
**Rule:** In Sprint 8 disputes, `trackingNumber` is the primary artifact. Dispatch proof is secondary corroborating evidence.

### Upload Method Decision (OQ-6 — D4.1)

**Hybrid: Pre-signed S3 PUT URL + Mandatory S3 HEAD verification before DB write.**

**Flow:**
```
1. POST /seller/orders/:id/dispatch-proof/upload-url
   → Order must be in SHIPPED, OUT_FOR_DELIVERY, or DELIVERED status (not PLACED/CONFIRMED)
   → API generates pre-signed S3 PUT URL scoped to dispatch-proofs/{sellerId}/{orderId}/
   → Returns { uploadUrl, s3Key, expiresAt }

2. Client uploads directly to S3 using uploadUrl
   → File bytes NEVER pass through API server

3. POST /seller/orders/:id/dispatch-proof/confirm { s3Key }
   → API calls S3 HEAD on s3Key to verify file exists
   → If not found → 422 FILE_NOT_UPLOADED
   → Verify s3Key prefix matches dispatch-proofs/{sellerId}/ (ownership)
   → Write OrderTracking row with dispatchProofUrl and dispatchProofAt
   → NO OrderStatusHistory entry (status does not change on proof upload)
   → NO EventOutbox event (proof upload is not a status transition)
```

**Key distinction:** Dispatch proof upload does NOT create an `OrderStatusChanged` event. It is not a status transition. The `SHIPPED` status event is the transition; the proof upload is supplemental.

### S3 Key Structure

```
dispatch-proofs/{businessId}/{orderId}/{unixTimestamp}_{sanitizedFilename}
```

- `{businessId}` in key prefix → enforces ownership at signed URL generation time
- `{unixTimestamp}` → prevents collision on re-upload

### Schema Addition Required

```prisma
model OrderTracking {
  // existing fields...
  dispatchProofUrl  String?    // S3 HTTPS URL — NULL until seller uploads proof
  dispatchProofAt   DateTime?  // Upload confirmation timestamp
}
```

### MIME + Size Rules

- Allowed: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`
- Max size: **5MB** (enforced via S3 bucket policy `content-length-range` condition on signed URL)
- Server validates Content-Type from S3 HEAD response on confirm step

### Retention Policy

Dispatch proofs are **never auto-deleted** in Sprint 5. Sprint 9 governance applies lifecycle rules.

### Risks Avoided

- Seller uploading to another seller's S3 prefix (key scoping at generation time)
- API server memory exhaustion from file proxying
- False dispatch confirmation (HEAD verify before DB write)
- Orphaned S3 files (confirm step links key to OrderTracking before persisting)
- Local delivery sellers blocked from shipping because they lack file upload capability (proof is optional)

---

## §D5 — SELLER KPI AUTHORITY

### Context

KPI dashboard must show: today's order count, today's revenue, pending orders count, low-stock product count.

### Decision

**Indexed live query + Redis cache TTL 60s. No materialized views in Sprint 5.**

```typescript
// Cache key pattern
kpi:{sellerId}:{segment}:{YYYY-MM-DD}

// If cache hit → return immediately
// If cache miss → run 4 indexed queries, populate cache, return
```

**Queries (all using existing indexes):**
```sql
-- idx_order_seller_stat: (sellerId, status)
-- idx_order_seller_date needed: (sellerId, createdAt)

SELECT COUNT(*) FROM "Order"
WHERE "sellerId" = $1 AND DATE("createdAt") = CURRENT_DATE AND "isDeleted" = false;

SELECT COALESCE(SUM("grandTotal"), 0) FROM "Order"
WHERE "sellerId" = $1 AND DATE("createdAt") = CURRENT_DATE
  AND "status" NOT IN ('CANCELLED', 'PAYMENT_FAILED');

SELECT COUNT(*) FROM "Order"
WHERE "sellerId" = $1 AND "status" IN ('PLACED', 'CONFIRMED', 'PROCESSING');

SELECT COUNT(*) FROM "InventoryItem"
WHERE "businessId" = $1 AND "isLowStock" = true;
```

**Required new index:**
```
idx_order_seller_date: (sellerId, createdAt) — verify does not already exist
```

**Implementation gate:** `EXPLAIN ANALYZE` required on each query against staging DB with >10K orders. Seq Scan on large table = blocking issue.

**Cache invalidation triggers:**
| Event | Action |
|---|---|
| New order created for seller | DEL `kpi:{sellerId}:{segment}:{date}` |
| Order status changed for seller | DEL `kpi:{sellerId}:{segment}:{date}` |
| `InventoryItem.isLowStock` toggled | DEL `kpi:{sellerId}:{segment}:{date}` |

Cache invalidation happens AFTER `$transaction` commits, OUTSIDE the transaction.

### D5.1 — KPI Cache Failure Governance (NEW)

**Decision: Redis is an optimization layer only. KPI correctness MUST NEVER depend on Redis availability.**

This rule is consistent with Sprint 3 and Sprint 4 Redis governance (Redis is never the source of truth; it is always a read-through cache).

**If Redis is unavailable, degraded, or times out:**

```typescript
async getKpis(sellerId: string, segment: string): Promise<SellerKpiDto> {
  const cacheKey = `kpi:${sellerId}:${segment}:${today}`;

  try {
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch (redisError) {
    // Redis unavailable — bypass cache, serve from DB
    this.logger.warn({ sellerId, error: redisError.message },
      'KPI_REDIS_BYPASS: Redis unavailable — serving KPI from DB directly');
    this.metrics.kpiRedisBypassTotal.inc();   // observability signal — MANDATORY
    // fall through to DB queries below
  }

  const kpis = await this.fetchKpisFromDb(sellerId, segment);

  // Attempt to populate cache — silent fail if Redis still down
  try {
    await this.redis.set(cacheKey, JSON.stringify(kpis), 'EX', 60);
  } catch { /* silent — DB result already computed */ }

  return kpis;
}
```

**Rules:**
- Redis timeout MUST be bounded (recommend 200ms max for cache GET). Use `redis.get()` with timeout wrapper.
- A Redis outage that blocks `GET /seller/dashboard/kpis` is a **P1 regression**. Dashboard availability > cache availability.
- `kpiRedisBypassTotal` counter MUST be registered in `metrics.providers.ts` and wired in `MetricsService` (no ghost metrics — Sprint 4 OPTIONAL-1 law).
- Alert: If `kpiRedisBypassTotal` increments continuously for >5 minutes → `WARNING: Redis KPI cache degraded`.

**Additional metric required (added to D12):**
`kpi_redis_bypass_total` — Counter — `{seller_segment}` — Fired when Redis unavailable and DB fallback executed.

### AI-Agent Trap

> **TRAP S5-T4:** KPI query without `sellerId` scope returns data for ALL sellers.
> **FIX:** Every KPI query has `WHERE "sellerId" = req.seller.businessId` as MANDATORY clause.

> **TRAP S5-T9:** Agent assumes Redis availability is guaranteed. Wraps `redis.get()` without try/catch. Dashboard fails when Redis is down.
> **FIX:** Always wrap Redis cache reads in try/catch. On error, bypass cache and execute DB queries. Emit `kpiRedisBypassTotal.inc()` counter.

---

## §D6 — SELLER SCORECARD DESIGN

### Context

Seller scorecard is a trust signal for buyers and a performance signal for sellers. It must be: explainable, computable from existing data, resistant to manipulation, and compatible with Sprint 9 analytics.

### Metrics (3 Primary)

| Metric | Formula | Weight | Data Source |
|---|---|---|---|
| Dispatch Speed Score | `% orders shipped within 48h of confirmedAt` | 40% | OrderStatusHistory timestamps |
| Delivery Quality Score | `avg(SellerRating.deliverySpeed + SellerRating.productQuality) / 2` | 40% | SellerRating table |
| Acceptance Rate | `% PLACED orders confirmed (vs cancelled by seller)` | 20% | OrderStatusHistory |

**Composite Score:** Weighted sum, scaled 0–100.
**Minimum sample:** ≥5 completed orders. Below: "Naya Seller — Score jald aayega".
**Data window:** Last 90 days of orders.
**Rating fallback:** If SellerRating count < 3, `deliveryQualityScore` weight transfers to `dispatchSpeedScore` (60% dispatch, 40% acceptance rate).

### Computation Frequency

**Batch cron every 6 hours. NOT real-time.**

- Cron schedule: `0 */6 * * *`
- Stable jobId: `seller-scorecard-cron` (prevents duplicate on API restart per §14.3)
- Runs via BullMQ 'scoring' queue (OR added to existing 'payments' queue if acceptable — decision: **new 'scoring' queue for clean separation**)

### Schema Addition Required — OQ-4 RESOLVED: Separate Prisma Model

`SellerScore` is a **separate Prisma model** — NOT JSONB on `Business`. Rationale: Sprint 7 Admin needs to query, filter, and override scores independently. A separate table allows `SELECT * FROM SellerScore ORDER BY compositeScore DESC` for admin dashboards without unpacking JSONB. JSONB approach rejected.

```prisma
model SellerScore {
  id                     String   @id @default(cuid())
  businessId             String   @unique
  compositeScore         Int      // 0-100
  dispatchSpeedScore     Int      // 0-100
  deliveryQualityScore   Int      // 0-100
  acceptanceRate         Int      // 0-100
  orderCount             Int      // sample size used for calculation
  calculatedAt           DateTime
  previousCompositeScore Int?     // NULL on first calculation

  business Business @relation(fields: [businessId], references: [id])

  @@index([businessId], map: "idx_seller_score_biz")
  @@index([compositeScore], map: "idx_seller_score_composite") // Sprint 7 Admin sort
}
```

### `SupplierScoreUpdated` EventOutbox Emission — OQ-5 RESOLVED: ≥1 Point Threshold

Emitted by cron ONLY if `compositeScore` changed by **≥1 point** vs `previousCompositeScore`.
Threshold of ≥5 was considered to reduce noise but rejected — a 1-point improvement is meaningful for seller motivation and buyer trust signal updates.
Dedup key: `supplier-score-updated-{businessId}-{calculatedAt-rounded-to-hour}` (NOT `Date.now()`).

### Anti-Gaming Properties

- Score computed from immutable `OrderStatusHistory` server-set timestamps
- `shippedAt` set by system on SELLER → SHIPPED transition, not self-reported
- Minimum sample size prevents cherry-picking
- 90-day rolling window prevents one-time gaming

### Hinglish Narrative Templates

Score explanations generated from range-based templates (NOT hardcoded per seller):
```
dispatchSpeed > 80%: "Aaapke orders bahut tezi se ship hote hain! 🚀"
dispatchSpeed 50-80%: "Dispatch thoda improve ho sakta hai."
dispatchSpeed < 50%: "Orders mein delay ho raha hai — buyers wait kar rahe hain."
```
Templates stored in DB (reuse `NotificationTemplate` pattern from Sprint 6 prep).

---

## §D7 — BUYER REORDER STRATEGY

### Context

"1-tap reorder" is a key buyer retention feature. Prices and stock change over time — what should reorder use?

### Decision

**Reorder uses CURRENT prices and CURRENT inventory. Historical snapshot prices are NEVER reused.**

### Reorder Flow

```typescript
POST /buyer/orders/:id/reorder

1. Load original order's OrderItems
2. For each item:
   a. Check product is still ACTIVE
   b. Check inventoryService.getAvailability(productId, segment).availableQuantity > 0
   c. Load product.basePrice (CURRENT — not item.unitPrice snapshot)
3. Add available items to NEW cart via CartService.upsertItem()
4. Return {
     cartId: string,
     addedCount: number,
     warnings: Array<{
       type: 'OUT_OF_STOCK' | 'PRODUCT_UNAVAILABLE' | 'PRICE_CHANGED',
       productId: string,
       productName: string,
       priceFrom?: number,   // old price
       priceTo?: number,     // current price
     }>
   }
```

**Partial reorder is ALLOWED:** 3 of 5 items in stock → 3 added to cart.

**Partial reorder is NEVER silent:** Every skipped item MUST appear in `warnings[]`. Frontend must display these prominently.

**Price change warning threshold:** If `|currentPrice - snapshotPrice| / snapshotPrice > 0.10` (>10% change), add `PRICE_CHANGED` warning even if item IS added to cart.

### Rate Limiting

**5 reorders per buyer per hour** via Redis Lua script (same pattern as cart rate limit, Sprint 4):
```
key: reorder_rate:{userId}, INCR + EXPIRE 3600, limit 5
```

### AI-Agent Trap

> **TRAP S5-T2:** Agent uses `originalOrderItem.unitPrice` to populate new cart. This uses historical snapshot price — incorrect.
> **FIX:** Load `Product.basePrice` fresh from DB for each item. Never reuse `OrderItem.unitPrice` for reorder pricing.

---

## §D8 — BUYER ORDER TRACKING MODEL

### Two Tables, Clear Roles

| Table | Role | Written By |
|---|---|---|
| `OrderStatusHistory` | **Timeline authority** — immutable log of every status transition | Every status change transaction |
| `OrderTracking` | **Logistics metadata** — tracking number, carrier, ETA | Seller when marking SHIPPED |

### Decision

**`OrderStatusHistory` is the SINGLE source of truth for the buyer-facing timeline.**

`OrderTracking` is supplementary metadata (links to courier, ETA, location). It does NOT drive the status display.

### Buyer-Facing Timeline Response

```typescript
interface BuyerOrderTimeline {
  statusHistory: Array<{
    status: OrderStatus
    timestamp: DateTime
    actorType: 'SELLER' | 'SYSTEM' | 'BUYER'
    // label mapping is FRONTEND responsibility — API returns raw enum
  }>
  tracking: {
    carrier: string | null
    trackingNumber: string | null
    trackingUrl: string | null         // carrier deep link
    estimatedDelivery: DateTime | null
    dispatchProofUrl: string | null    // S3 signed URL (short TTL for buyer view)
  } | null
}
```

**Status label mapping is frontend responsibility** — prevents backend enum changes from breaking display strings.

### Sprint 6 Notification Compatibility

`OrderStatusHistory` contains all fields Sprint 6 NotificationWorker needs:
- `statusTo` → event type to notify
- `orderId` → link to buyer's contact via `Order.buyerId → User.phone`
- `timestamp` → "Your order was shipped at 3:45 PM"

No schema changes needed for Sprint 6.

---

## §D9 — PAYMENT RETRY GOVERNANCE

### Context

Payment retry server logic was fully implemented in Sprint 4 (dual-authority window, idempotency, MEDIUM-3 fix). Sprint 5 scope is **buyer-facing UI only**.

### Decision

**D9.1:** No new server-side payment retry logic. Sprint 4 implementation is final authority.

**D9.2 — New thin endpoint required:**
```
GET /payments/:orderId/retry-status
→ { retryAllowed: boolean, retryWindowRemainingMs: number | null, attemptCount: number }
```
This endpoint consolidates retry eligibility for frontend countdown display.

**D9.3 — Buyer retry UI rules:**
- Show retry button ONLY when `order.status = PAYMENT_FAILED`
- Show countdown: `retryWindowRemainingMs` updates every 10s via polling
- On tap: disable button, call `POST /payments/retry` with client-generated `Idempotency-Key: {uuid}`
- If `retryWindowRemainingMs ≤ 0`: hide button, show "Samay samaapt — support se sampark karein"
- Re-enable button only if 4xx error returned (not on success)

**D9.4 — Sprint 4 abuse prevention inherited:**
- Max 3 retry attempts via `failedPayments.length + 1` check
- Dual-authority window (DB + Redis)
- Client idempotency key prevents double-tap double-charge

---

## §D10 — DASHBOARD PERFORMANCE STRATEGY

### D10.1 — Cursor Pagination (MANDATORY everywhere)

```typescript
// ✅ ALL list endpoints use cursor
GET /seller/orders?cursor={orderId}&limit=20
Response: { items: [], nextCursor: string | null, hasMore: boolean }

// ❌ BANNED — OFFSET pagination
GET /seller/orders?page=2&pageSize=20  // NEVER
```

**Rationale:** At 100K orders, `OFFSET 50000` requires scanning 50K rows. Cursor pagination is O(log n) on the index.

### D10.2 — No Total Counts on List Endpoints

List endpoints NEVER return `{ total: number }`. `COUNT(*)` on large tables is expensive and often meaningless.
If UI needs count, a separate cacheable `GET /seller/orders/count?status=PLACED` endpoint is allowed (Redis TTL 30s).

### D10.3 — N+1 Prevention Rules

```typescript
// ✅ Order list: preview items only
prisma.order.findMany({
  include: { items: { take: 3 } },  // NOT take: undefined
})

// ✅ Order detail: full items + latest tracking
prisma.order.findUnique({
  include: {
    items: true,
    tracking: { orderBy: { createdAt: 'desc' }, take: 1 }
  }
})

// ❌ BANNED — N+1 pattern
orders.map(async (o) => ({ ...o, items: await getItems(o.id) }))
```

### D10.4 — Index Verification Gate

`EXPLAIN ANALYZE` on staging DB with >10K orders for every new query before Sprint 5 freeze.
Any plan showing `Seq Scan` on a table with >10K rows → must add index before marking complete.

---

## §D11 — EVENTOUTBOX REQUIREMENTS

### Event 1: `OrderStatusChanged`

```typescript
{
  eventType: 'OrderStatusChanged',
  eventVersion: '1.0',
  schemaVersion: '5.0',
  deduplicationKey: `order-status-changed-{orderId}-{toStatus}`,
  payload: {
    orderId: string,
    orderNumber: string,
    buyerId: string,           // User.id — Sprint 6 uses to lookup phone
    sellerId: string,          // Business.id
    segment: string,
    statusFrom: OrderStatus,
    statusTo: OrderStatus,
    actorId: string,
    actorRole: 'SELLER' | 'SYSTEM' | 'BUYER',
    timestamp: string,         // ISO8601
    trackingNumber?: string,   // populated when statusTo = SHIPPED
    estimatedDelivery?: string
  }
}
```

**Emitted:** Every seller-initiated transition AND buyer cancellation.
**Dedup key rationale:** Order can only reach each status ONCE (state machine enforced) → key is inherently unique per valid transition.

### Event 2: `SupplierScoreUpdated`

```typescript
{
  eventType: 'SupplierScoreUpdated',
  eventVersion: '1.0',
  schemaVersion: '5.0',
  deduplicationKey: `supplier-score-updated-{businessId}-{roundedHour}`,
  // roundedHour = ISO string sliced to hour: "2026-05-29T14"
  payload: {
    businessId: string,
    compositeScore: number,
    dispatchSpeedScore: number,
    deliveryQualityScore: number,
    acceptanceRate: number,
    previousCompositeScore: number | null,
    calculatedAt: string,
    orderCount: number,
  }
}
```

**Emitted:** Scorecard cron ONLY when score changes by ≥1 point.

### AI-Agent Trap

> **TRAP S5-T6:** `deduplicationKey: \`supplier-score-updated-${businessId}-${Date.now()}\``
> **FIX:** Round to hour: `new Date().toISOString().slice(0, 13)`. Never use `Date.now()` or `randomUUID()` in dedup keys.

---

## §D12 — OBSERVABILITY REQUIREMENTS

### New Metrics (Sprint 5) — All must be wired at implementation time

| Metric | Type | Labels | Purpose |
|---|---|---|---|
| `order_status_transition_total` | Counter | `{from, to, actor}` | Track all transitions |
| `seller_dispatch_time_hours` | Histogram | `{segment}` | CONFIRMED → SHIPPED latency |
| `buyer_reorder_total` | Counter | `{segment, outcome}` | `outcome: success\|partial\|zero` |
| `seller_kpi_query_latency_ms` | Histogram | — | KPI endpoint performance |
| `dispatch_proof_upload_total` | Counter | `{outcome}` | `outcome: success\|verify_failed\|size_exceeded` |
| `seller_scorecard_run_total` | Counter | — | Cron execution count |
| `seller_scorecard_latency_ms` | Histogram | — | Time to compute all scores |

### New Alerts

| Alert | Condition | Severity |
|---|---|---|
| Order stuck in PROCESSING | `status=PROCESSING AND processingAt < now() - 48h` | WARNING |
| Seller dispatch latency high | `seller_dispatch_time_hours p95 > 72h` | WARNING |
| Dispatch proof failure rate | `>20% failures in 5-minute window` | ERROR |

**Governance law:** All metrics MUST be registered in `metrics.providers.ts` AND injected in `MetricsService` AND wired in the worker/service BEFORE that worker is considered complete. The Sprint 4 OPTIONAL-1 "registered but never incremented" pattern is explicitly BANNED in Sprint 5.

---

## §D13 — SECURITY DECISIONS

### D13.1 — Cross-Role Route Isolation

| Route Prefix | @Roles | Guard |
|---|---|---|
| `/seller/*` | SELLER | SellerContextGuard (resolves businessId) |
| `/buyer/*` | BUYER | (no extra guard — buyerId from JWT) |
| `/payments/*` | BUYER | Already applied in Sprint 4 |

SELLER cannot call BUYER routes. BUYER cannot call SELLER routes. No conditional application.

### D13.2 — Seller Isolation at Repository Layer

Every `SellerOrderRepository` and `SellerInventoryRepository` method MUST accept `sellerId` as mandatory parameter and apply as mandatory `WHERE` clause.

**Code review gate:** Any seller repository method without `sellerId` in signature → automatic rejection.

### D13.3 — Buyer Privacy in Seller View

Sellers need shipping address to dispatch. They do NOT need buyer identity.

**`GET /seller/orders/:id` returns:**
- `shippingAddressSnapshot` (already a snapshot — no live User data)
- `buyerCode`: masked identifier like `BUYER-{first6ofbuyerId}` — NOT raw `buyerId`
- Buyer phone/email: **NOT returned to seller**

Buyer contacts seller through VyaparNet messaging (Sprint 7). Direct phone exposure is a privacy breach.

### D13.4 — Dispatch Proof Upload Security

- Pre-signed URL scoped to `dispatch-proofs/{businessId}/` prefix — enforced at generation
- S3 bucket policy: `PutObject` allowed only for `dispatch-proofs/*` via API IAM role
- Max 5MB enforced via `content-length-range` condition in signed URL policy
- API server HEAD-verifies S3 key before writing to DB
- Confirm step validates s3Key prefix matches `dispatch-proofs/{sellerId}/` — rejects cross-seller keys

### D13.5 — Reorder Abuse Prevention

Rate limit: **5 reorders per buyer per hour** via Redis Lua (same atomic INCR + EXPIRE pattern as Sprint 4 cart rate limit).

```
key: reorder_rate:{userId}
limit: 5 per 3600s
error: 429 REORDER_RATE_LIMIT_EXCEEDED
```

### D13.6 — Scorecard Integrity

- Score data source: immutable `OrderStatusHistory` — server-set timestamps
- `shippedAt` set by system on seller's SHIPPED transition — not self-reported
- Minimum 5 orders prevents gaming with cherry-picked data
- 90-day rolling window distributes historical behavior

---

## §D14 — FUTURE SPRINT COMPATIBILITY

### Sprint 6 (Notifications)

| Sprint 5 Decision | Sprint 6 Requirement | Status |
|---|---|---|
| `OrderStatusChanged` in EventOutbox with `buyerId`, `sellerId`, `statusTo` | NotificationWorker consumes to send SMS/email | ✅ Payload complete |
| `SupplierScoreUpdated` with `compositeScore` + `previousCompositeScore` | Notify seller when score changes | ✅ Both values in payload |
| Buyer phone NOT in seller order view | Sprint 6 looks up phone from `User` via `buyerId` | ✅ `buyerId` in event payload |
| `OrderStatusHistory.actorRole` field | Determines who receives notification | ✅ Already in schema |

### Sprint 7 (Admin)

| Sprint 5 Decision | Sprint 7 Requirement | Status |
|---|---|---|
| SHIPPED → DELIVERED reserved for Admin | Sprint 7 adds `PATCH /admin/orders/:id/status` | ✅ Gap intentionally left |
| `SellerContextGuard` separate from Admin context | Admin queries all sellers without businessId filter | ✅ Different module, different repo |
| Dispatch proof URL in `OrderTracking` | Admin dispute review downloads proof | ✅ S3 URL accessible |
| `SellerScore` table | Admin can view, override, or flag scores | ✅ Separate queryable table |

### Sprint 8 (Returns & Disputes)

| Sprint 5 Decision | Sprint 8 Requirement | Status |
|---|---|---|
| `Order.returns ReturnRequest[]` in schema | Sprint 8 creates ReturnRequest for DELIVERED orders | ✅ Schema already ready |
| Dispatch proof in OrderTracking | Dispute evidence requires dispatch proof | ✅ URL stored |
| DELIVERED only Admin-settable | Returns only possible after DELIVERED | ✅ State machine enforces |
| Scorecard includes delivery quality | Returns increase complaints → scorecard recalc | ✅ Cron picks up new SellerRating data |

### Sprint 9 (ERP / OpenSearch / Analytics)

| Sprint 5 Decision | Sprint 9 Requirement | Status |
|---|---|---|
| `SupplierScoreUpdated` EventOutbox | Analytics export to OpenSearch | ✅ Complete payload |
| KPI queries on indexed columns | Sprint 9 historical aggregation uses same indexes | ✅ Compatible |
| Cursor pagination on all lists | OpenSearch indexing job cursors through orders | ✅ No OFFSET dependency |
| `orderMonth` partition key | Sprint 9 time-range exports partition by month | ✅ Already in schema |

---

## RISKS ELIMINATED

| Risk | Elimination |
|---|---|
| Cross-seller order data exposure | D1+D2: Repository `sellerId` filter mandatory at every layer |
| Seller seeing buyer personal identity | D13.3: `buyerCode` mask, no phone/email in seller view |
| Illegal status transitions (CANCELLED → SHIPPED) | D3: Server-side state machine, 422 on invalid |
| Fake SHIPPED without real shipment | D3.2+OQ-2: `trackingNumber` mandatory — non-empty string required |
| Auto-confirm allowing inventory-less seller fraud | OQ-1: No auto-confirm. Seller must explicitly accept every order |
| Segment-specific cancellation window complexity | OQ-3: 2-hour flat window — uniform, no segment branching |
| Scorecard stored in JSONB (Admin query impossible) | OQ-4: Separate `SellerScore` table — queryable, sortable by Admin |
| Score noise suppressing seller motivation | OQ-5: ≥1 point threshold balances signal vs. noise |
| Local delivery seller blocked by proof upload requirement | OQ-6: Dispatch proof is optional — tracking number is the gate |
| Dashboard outage when Redis is down | D5.1: DB fallback mandatory — Redis failure never blocks KPI dashboard |
| Silent Redis bypass (no visibility) | D5.1: `kpiRedisBypassTotal` counter — bypass always logged and counted |
| Double status transition from duplicate request | D3.4: Idempotency-Key + Redis SET NX dedup |
| S3 upload to wrong seller's prefix | D4+D13.4: Signed URL scoped to `{sellerId}` prefix |
| False dispatch confirmation | D4.1: API HEAD-verifies S3 key before writing URL to DB |
| Reorder at stale snapshot prices | D7: Current `Product.basePrice` always loaded fresh |
| Silent partial reorder (buyer unaware) | D7: Every skipped item in `warnings[]` — mandatory |
| KPI queries leaking cross-seller data | D5+S5-T4: sellerId scope on every KPI query |
| Scorecard gaming with fake orders | D6: Computed from immutable OrderStatusHistory timestamps |
| Ghost metrics (registered but never incremented) | D12: Sprint 4 OPTIONAL-1 lesson enforced as rule |
| N+1 queries on order list | D10.3: `include` with `take` limits enforced |
| OFFSET pagination disaster at scale | D10.1: Cursor pagination mandatory, OFFSET banned |
| Sprint 6 notification building on wrong data model | D11+D8: EventOutbox payload complete, OrderStatusHistory is authority |

---

## AI-AGENT SAFETY REVIEW

Nine implementation traps identified and documented:

| Trap | Description | Fix |
|---|---|---|
| S5-T1 | Comparing `order.sellerId` to `req.user.id` (Business.id ≠ User.id) | SellerContextGuard resolves businessId; repository uses businessId |
| S5-T2 | Reorder using `OrderItem.unitPrice` (historical snapshot) | Load `Product.basePrice` fresh for every reorder item |
| S5-T3 | Status transition without state machine check | State machine validation BEFORE `$transaction` begins |
| S5-T4 | KPI query without `sellerId` scope | Every query has mandatory `WHERE sellerId = req.seller.businessId` |
| S5-T5 | Dispatch proof URL stored before S3 verification | HEAD-verify S3 key before any DB write |
| S5-T6 | Scorecard dedup key using `Date.now()` | Round to hour: `ISO.slice(0, 13)` |
| S5-T7 | `eventOutbox.create()` outside `$transaction` | All three writes (update, history, outbox) inside single `$transaction` |
| S5-T8 | SHIPPED transition allowed with empty/null trackingNumber | Validate `trackingNumber.trim().length > 0` BEFORE state machine check |
| S5-T9 | Redis.get() without try/catch — dashboard fails when Redis is down | Wrap all Redis cache reads; on error bypass to DB, emit `kpiRedisBypassTotal` |

---

## OPEN QUESTIONS — ALL RESOLVED

| # | Question | Status | Final Decision |
|---|---|---|---|
| OQ-1 | Seller confirmation: mandatory or auto-confirm? | ✅ **RESOLVED** | **Mandatory — no auto-confirm**. Orders stay PLACED until seller explicitly acts. |
| OQ-2 | `trackingNumber` when marking SHIPPED: required or optional? | ✅ **RESOLVED** | **Required** — `trackingNumber.trim().length > 0` enforced. No format validation |
| OQ-3 | Buyer cancellation grace window: 2h or segment-configurable? | ✅ **RESOLVED** | **2 hours flat, not segment-configurable**. Deferred to Phase 2 if needed |
| OQ-4 | `SellerScore`: separate Prisma model or JSONB on Business? | ✅ **RESOLVED** | **Separate `SellerScore` Prisma model** — enables Admin sorting/filtering in Sprint 7 |
| OQ-5 | `SupplierScoreUpdated` threshold: ≥1 or ≥5 points? | ✅ **RESOLVED** | **≥1 point** — preserves signal value for seller motivation |
| OQ-6 | Dispatch proof vs. tracking number governance? | ✅ **RESOLVED** | `trackingNumber` = mandatory gate. Dispatch proof = optional supporting evidence |

No blocking questions remain. All decisions are final.

---

## SPRINT 5 READINESS VERDICT

**VERDICT: ✅ FULLY APPROVED FOR SPRINT 5 ARCHITECTURE GENERATION**
**No blocking questions. No open ambiguities. All 6 OQs resolved. Document is FINAL.**

| Dimension | Status | Note |
|---|---|---|
| Sprint 1–4 inherited guarantees | ✅ INTACT | All laws explicitly carried forward — none weakened |
| Seller data isolation | ✅ DECIDED | Dual-layer: SellerContextGuard + Repository businessId filter |
| Buyer data isolation | ✅ DECIDED | buyerId JWT filter + @Roles(BUYER) |
| Order state machine | ✅ DECIDED + HARDENED | No auto-confirm (OQ-1), trackingNumber required (OQ-2), 2h buyer grace (OQ-3) |
| Dispatch proof governance | ✅ DECIDED | trackingNumber = mandatory gate. Dispatch proof = optional evidence (OQ-6) |
| KPI performance | ✅ DECIDED + HARDENED | Indexed query + Redis TTL 60s + DB fallback on Redis failure (D5.1) |
| KPI Redis failure resilience | ✅ DECIDED | Redis outage never blocks dashboard. DB fallback mandatory. Bypass metric emitted |
| Seller scorecard | ✅ DECIDED | 3 metrics, 6h cron, separate SellerScore model (OQ-4), ≥1 point threshold (OQ-5) |
| Buyer reorder | ✅ DECIDED | Current prices, partial allowed, every skipped item in warnings[] |
| Order tracking | ✅ DECIDED | OrderStatusHistory is timeline authority |
| Payment retry | ✅ DECIDED | Sprint 4 server logic final; UI only in Sprint 5 |
| Dashboard performance | ✅ DECIDED | Cursor pagination mandatory, OFFSET banned, no COUNT(*) |
| EventOutbox | ✅ DECIDED | 2 events with complete payloads + deterministic dedup keys |
| Observability | ✅ DECIDED | 8 new metrics (incl. kpi_redis_bypass_total), 3 alerts, no ghost metrics |
| Security | ✅ DECIDED | Cross-role isolation, signed uploads, buyer privacy masking |
| Future compatibility | ✅ VERIFIED | Sprint 6, 7, 8, 9 all explicitly verified |
| AI-agent traps | ✅ DOCUMENTED | 9 traps with exact wrong pattern + fix |
| Open questions | ✅ ZERO BLOCKING | All 6 OQs resolved and integrated |

---

*Document version: v1.1 — Final decisions integrated by Enterprise Architecture Board*
*All open questions resolved. Document approved for Sprint 5 Architecture Generation.*
*Next step: Generate SPRINT_5_EXECUTION_LOCK.md using this document as the sole authority.*
