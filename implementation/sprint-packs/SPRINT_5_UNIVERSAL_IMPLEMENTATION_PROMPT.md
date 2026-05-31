# SPRINT 5 — UNIVERSAL IMPLEMENTATION PROMPT
## VyaparNet: Buyer & Seller Dashboards

> **HOW TO USE THIS PROMPT**
> Fill in: `[PHASE NUMBER]` and `[PHASE NAME]` at the top.
> Give this entire document to the implementing AI model.
> The model will implement, self-audit, validate, and STOP for your review.
> You review → approve → give next phase prompt.

---

## ════════════════════════════════════════════════════
## YOU ARE IMPLEMENTING:
## Phase [PHASE NUMBER] — [PHASE NAME]
## ════════════════════════════════════════════════════

---

# IDENTITY & ROLE

You are acting as:

- **Principal Software Engineer** (10+ years, TypeScript/NestJS expert)
- **Enterprise Security Architect** (ownership isolation, zero data leakage)
- **Distributed Systems Engineer** (transaction correctness, Redis, BullMQ)
- **Code Quality Authority** (zero linting errors, strict typing, clean architecture)
- **Self-Auditing Reviewer** (adversarial, finds your own bugs before shipping)

You write code the way the best engineers at Stripe, Shopify, and Amazon do:
- Every edge case considered
- Every invariant enforced
- Every error handled explicitly
- Zero assumptions, zero shortcuts
- Production-grade from line 1

---

# ════════════════════════════════════════════════════
# STEP 0 — MANDATORY DOCUMENT ANALYSIS (DO THIS FIRST)
# ════════════════════════════════════════════════════

**Before writing a single line of code**, you MUST read and fully understand:

## PRIMARY AUTHORITY DOCUMENTS (ALL MANDATORY):

### 1. SPRINT_5_EXECUTION_LOCK_FINAL.md (v1.2 FINAL AUDIT FREEZE)
Path: `implementation/sprint-packs/SPRINT_5_EXECUTION_LOCK_FINAL.md`

Read these sections in order — NO SKIPPING:
```
§0   — Global Non-Negotiable System Invariants (INV-1 through INV-S5-41)
§2   — Sprint 4 Inheritance Contract
§4   — Transaction Boundary Governance (most common bug source)
§5   — Redis Key Registry
§7   — Module Structure & Package Boundaries
§8   — API Contract Reference
§9   — Security Architecture (SellerContextGuard, S3 scoping, buyer privacy)
§10  — EventOutbox Governance
§11  — Observability Architecture
§12  — Degraded-Mode Behavior

→ THEN READ YOUR PHASE SECTION:
§13  = Phase 0  | §14 = Phase 1  | §15 = Phase 2  | §16 = Phase 3
§17  = Phase 4  | §18 = Phase 5  | §19 = Phase 6  | §20 = Phase 7
§21  = Phase 8  | §22 = Phase 9  | §23 = Phase 10 | §24 = Phase 11
§25  = Phase 12

→ ALSO READ:
§26  — Universal Agent Implementation Prompt (cross-check)
§30  — Final Audit Report (know what was already found and fixed)
```

### 2. sprint_5scope_decision.md (v1.1 APPROVED)
Path: `implementation/sprint-packs/sprint_5scope_decision.md`

Read ALL sections — especially:
- All 6 resolved Open Questions (OQ-1 through OQ-6)
- All D-series decisions (D1 through D6)
- Security decisions
- EventOutbox decisions

### 3. SPRINT_4_EXECUTION_LOCK_FINAL.md (v3.0 — for inheritance)
Path: `implementation/sprint-packs/SPRINT_4_EXECUTION_LOCK_FINAL.md`

Read: §0 (INV-11 through INV-33), §5 (EventOutbox), §25 (Sprint 5 handoff)

### 4. SPRINT3_EXECUTION_LOCK_FINAL.md (for inventory contract)
Path: `implementation/sprint-packs/SPRINT3_EXECUTION_LOCK_FINAL.md`

Read: §18 (InventoryService public interface) — MANDATORY for any phase touching orders or cancellations.

### 5. LIVE CODEBASE — Read before writing:
```bash
# Read existing schema (know every existing field BEFORE adding new ones)
cat packages/database/prisma/schema.prisma

# Read existing metrics (never duplicate a metric name)
cat apps/api/src/modules/observability/metrics.providers.ts

# Read existing state machine (understand current SPRINT5_STATES guard)
cat apps/api/src/modules/order/order-state-machine.ts

# Read existing module structure
find apps/api/src/modules -name "*.module.ts" | head -20

# Read existing Redis key patterns (never create conflicting keys)
grep -rn "redis\." apps/api/src/modules --include="*.ts" | grep "\.set\|\.get\|\.del" | head -30
```

**STOP. Do not proceed until you have read ALL of the above.**

Output after reading:
```
DOCUMENT ANALYSIS COMPLETE:
- INV-1 through INV-S5-41: [CONFIRMED UNDERSTOOD]
- Phase [N] section read: [CONFIRMED]
- scope_decision.md OQ-1 through OQ-6: [CONFIRMED]
- Sprint 3 InventoryService contract: [CONFIRMED / NOT NEEDED FOR THIS PHASE]
- schema.prisma current state: [CONFIRMED - list any fields relevant to this phase]
- metrics.providers.ts current metrics: [CONFIRMED - list existing metric names]
```

---

# ════════════════════════════════════════════════════
# STEP 1 — IMPLEMENTATION RULES (ABSOLUTE LAWS)
# ════════════════════════════════════════════════════

## THE GOLDEN INVARIANTS — VIOLATION = INVALID CODE

```
INV-S5-1:  Order.sellerId = Business.id — NEVER User.id. NEVER compare directly.
INV-S5-2:  SellerContextGuard on EVERY /seller/* route. Missing = security bug.
INV-S5-3:  Every SellerOrderRepository method takes sellerId (Business.id) as mandatory param.
INV-S5-4:  Seller NEVER receives buyerId, buyer.phone, buyer.email. Only buyerCode = BUYER-{first6}.
INV-S5-5:  CONFIRMED/PROCESSING → SHIPPED requires trackingNumber.trim().length > 0.
INV-S5-6:  No auto-confirm. PLACED stays PLACED until seller explicitly acts.
INV-S5-7:  SHIPPED → DELIVERED is RESERVED for Sprint 7. Return 422 TRANSITION_RESERVED_FOR_ADMIN.
INV-S5-8:  Every status transition: order.update + orderStatusHistory.create + eventOutbox.create
           ALL inside single $transaction. Atomic. No exceptions.
INV-S5-9:  Dispatch proof upload does NOT create EventOutbox or OrderStatusHistory.
INV-S5-10: Confirm step MUST S3 HEAD-verify before writing URL to DB.
INV-S5-11: s3Key MUST start with dispatch-proofs/{businessId}/ — reject cross-seller keys.
INV-S5-12: Reorder ALWAYS uses current product.basePrice. NEVER OrderItem.unitPrice.
INV-S5-13: Every skipped reorder item MUST appear in warnings[]. No silent skips.
INV-S5-14: EVERY KPI query: WHERE sellerId = businessId AND segment = segment. MANDATORY.
INV-S5-15: Redis KPI failure → bypass to DB. Dashboard NEVER fails because of Redis.
INV-S5-16: SellerScore is separate Prisma model. NOT JSONB on Business.
INV-S5-17: SupplierScoreUpdated dedup key uses ISO hour. NOT Date.now().
INV-S5-18: SupplierScoreUpdated emitted ONLY if score changed ≥1 point.
INV-S5-19: Scorecard cron uses stable jobId: 'seller-scorecard-cron'.
INV-S5-20: Cursor pagination on ALL list endpoints. OFFSET is BANNED.
INV-S5-21: SELLER cannot call /buyer/* routes. BUYER cannot call /seller/* routes.
INV-S5-22: OrderStatusHistory.actorRole MUST use SystemActorType enum.
INV-S5-23: All Sprint 5 EventOutbox records use schemaVersion: '5.0'.
INV-S5-24: Buyer cancel grace window after CONFIRMED = exactly 2 hours.
INV-S5-25: Reorder rate limit: 5 per buyer per hour via atomic Lua script.
INV-S5-26: S3 pre-signed URL prefix is server-controlled: dispatch-proofs/{businessId}/
INV-S5-27: InventoryService is the SOLE authority. No direct Inventory table queries.
INV-S5-28: Scorecard minimum sample size: 5 completed orders.
INV-S5-29: KPI cache invalidation AFTER $transaction commits. OUTSIDE transaction.
INV-S5-30: All Sprint 5 DTOs live in packages/types/src/seller/ or packages/types/src/buyer/
INV-S5-31: Order list: include items { take: 3 }. Order detail: include items { true }.
INV-S5-32: Status transition validation BEFORE $transaction begins.
INV-S5-33: Segment isolation: ALL queries filter by businessId AND segment.
INV-S5-34: Buyer cancel MUST release inventory via releaseAllForOrder() AFTER tx commits.
INV-S5-35: Dispatch proof confirm MUST validate S3 Content-Type MIME.
           Allowed: image/jpeg, image/png, image/webp, application/pdf ONLY.
INV-S5-36: KPI cache TTL = 60 + Math.floor(Math.random() * 15) seconds. NEVER flat 60.
INV-S5-37: Reorder rate limit Redis failure → 503 RATE_LIMIT_UNAVAILABLE_TRY_LATER. NEVER fail-open.
INV-S5-38: STATUS_TIMESTAMP_FIELD_MAP defined as explicit constant at module level.
INV-S5-39: ALL Sprint 5 $transaction() calls MUST have { timeout: 5000 }.
INV-S5-40: SellerScorecardWorker MUST skip kycStatus = SUSPENDED businesses.
INV-S5-41: InventoryService.release() called post-cancel MUST be idempotent (WARN not throw).
```

## INHERITED INVARIANTS (ALSO ABSOLUTE):

```
INV-1:  DB $transaction is the ONLY correctness authority.
INV-6:  Idempotency key is the FIRST operation.
INV-7:  InventoryMovement is APPEND-ONLY forever.
INV-8:  Redis is display optimization ONLY — never correctness authority.
INV-9:  Server-computed timestamps — never client-provided.
INV-13: OrderStatusHistory is APPEND-ONLY forever.
INV-17: EventOutbox dedup keys are deterministic. No Date.now(), no randomUUID().
INV-20: eventVersion + schemaVersion on EVERY EventOutbox record.
INV-21: Rate-limit INCR+EXPIRE via atomic Lua script. Never two-command pattern.
```

## TRANSACTION BOUNDARY RULES (§4):

```
INSIDE $transaction:  order.update, orderStatusHistory.create, eventOutbox.create
OUTSIDE $transaction: redis.get(), redis.set(), redis.del()
OUTSIDE $transaction: S3 presigned URL generation
OUTSIDE $transaction: S3 HEAD request
OUTSIDE $transaction: BullMQ queue.add()
OUTSIDE $transaction: InventoryService.getAvailability()
OUTSIDE $transaction: KPI cache invalidation
OUTSIDE $transaction: InventoryService.releaseAllForOrder() (AFTER commit)
ALL $transaction(): { timeout: 5000 } — MANDATORY (INV-S5-39)
```

---

# ════════════════════════════════════════════════════
# STEP 2 — IMPLEMENT PHASE [PHASE NUMBER]: [PHASE NAME]
# ════════════════════════════════════════════════════

## Pre-Implementation Checklist (Complete Before Writing Code):

```
[ ] Read §0 through §12 of SPRINT_5_EXECUTION_LOCK_FINAL.md
[ ] Read the specific phase section for Phase [N]
[ ] Read all acceptance criteria for this phase
[ ] Read all AI Footguns for this phase (know what NOT to do)
[ ] Read schema.prisma — know existing fields
[ ] Read metrics.providers.ts — know existing metric names
[ ] Confirm: what files will I create? what files will I modify?
[ ] Confirm: which INV-S5-N invariants apply to this phase?
```

## Implementation Standards:

### TypeScript:
```
- strict: true always
- No 'any' type — use proper generics or unknown with narrowing
- All function parameters explicitly typed
- All return types explicitly declared
- No implicit returns
- Zod schemas for ALL external input validation (DTOs)
- Decimal.js for ALL monetary values — never JavaScript number
```

### NestJS:
```
- Injectable() on all services
- Module imports/exports explicit — no circular dependencies
- Guards applied at CONTROLLER class level (not individual methods)
- @Roles() decorator at controller class level
- DI for all dependencies — no direct instantiation
- No static methods on services
```

### Prisma:
```
- NEVER prisma.inventory from seller/buyer modules (INV-S5-27)
- ALWAYS include sellerId/buyerId filter on every query
- ALWAYS include isDeleted: false filter
- Cursor pagination with take: limit + 1 pattern
- orderBy: { createdAt: 'desc' } on all list queries
- $transaction({ timeout: 5000 }) — always (INV-S5-39)
- select: { id: true, ... } for bulk queries — never load full objects
```

### Error Handling:
```
- All external calls (Redis, S3) wrapped in try/catch
- Never let Redis failure propagate as 500
- Never let S3 failure block non-S3 operations
- Explicit error codes in all thrown exceptions
- CRITICAL log for inventory release failures
- WARN log for Redis bypasses
- Structured JSON logging (not console.log)
```

### Security Checklist:
```
- Cross-seller access → 404 (NOT 403 — don't reveal existence)
- Cross-buyer access → 404
- buyerCode masking on ALL seller-facing DTOs
- S3 key prefix always server-controlled
- No req.user.id used in repositories (only in guards)
- SUSPENDED sellers → 403 BUSINESS_SUSPENDED
```

---

# ════════════════════════════════════════════════════
# STEP 3 — MANDATORY SELF-AUDIT
# ════════════════════════════════════════════════════

After your implementation is complete, perform this FULL self-audit.
**Do not skip. Do not summarize. Go through each item.**

## AUDIT DIMENSION 1: Invariant Compliance

For EACH invariant that applies to your phase, verify:

```
[ ] INV-S5-1:  Order.sellerId comparison uses Business.id, not User.id
[ ] INV-S5-2:  SellerContextGuard present on every seller controller class
[ ] INV-S5-3:  SellerOrderRepository methods all require sellerId parameter
[ ] INV-S5-4:  No buyerId, buyer.phone, buyer.email in any seller DTO
[ ] INV-S5-5:  SHIPPED transition validates trackingNumber.trim().length > 0
[ ] INV-S5-6:  No auto-confirm logic anywhere
[ ] INV-S5-7:  DELIVERED/COMPLETED transitions throw 422 TRANSITION_RESERVED_FOR_ADMIN
[ ] INV-S5-8:  Status transitions: all 3 writes inside single $transaction
[ ] INV-S5-9:  Dispatch proof confirm: no EventOutbox, no OrderStatusHistory
[ ] INV-S5-10: Dispatch proof confirm: S3 HEAD called before DB write
[ ] INV-S5-11: s3Key prefix check against dispatch-proofs/{businessId}/
[ ] INV-S5-12: Reorder uses product.basePrice NOT item.unitPrice
[ ] INV-S5-13: All reorder skips in warnings[] — no silent skips
[ ] INV-S5-14: All KPI queries have sellerId + segment filters
[ ] INV-S5-15: Redis failure → DB fallback, never 500
[ ] INV-S5-17: SupplierScoreUpdated dedup key uses ISO hour slice
[ ] INV-S5-18: SupplierScoreUpdated only emitted on ≥1 point change
[ ] INV-S5-19: Scorecard cron jobId = 'seller-scorecard-cron' (stable)
[ ] INV-S5-20: All list endpoints use cursor pagination, no OFFSET, no COUNT
[ ] INV-S5-21: @Roles(SELLER) on seller controllers, @Roles(BUYER) on buyer
[ ] INV-S5-22: actorRole uses SystemActorType enum (not raw string)
[ ] INV-S5-23: All eventOutbox.create() have schemaVersion: '5.0'
[ ] INV-S5-24: Buyer cancel grace window uses confirmedAt, not updatedAt
[ ] INV-S5-25: Reorder rate limit uses atomic Lua script
[ ] INV-S5-27: No prisma.inventory queries from seller/buyer modules
[ ] INV-S5-29: Cache invalidation AFTER tx commit, never inside tx
[ ] INV-S5-30: All DTOs in packages/types/src/seller/ or /buyer/
[ ] INV-S5-31: List queries: items { take: 3 }. Detail: items { true }
[ ] INV-S5-32: Transition validation BEFORE $transaction
[ ] INV-S5-33: Segment filter on all queries
[ ] INV-S5-34: Buyer cancel calls releaseAllForOrder() AFTER tx
[ ] INV-S5-35: MIME validation: only jpeg/png/webp/pdf allowed
[ ] INV-S5-36: KPI TTL uses jitter: 60 + Math.floor(Math.random() * 15)
[ ] INV-S5-37: Reorder rate limit Redis fail → 503, NOT fail-open
[ ] INV-S5-38: STATUS_TIMESTAMP_FIELD_MAP defined as explicit constant
[ ] INV-S5-39: ALL $transaction() calls have { timeout: 5000 }
[ ] INV-S5-40: Scorecard skips kycStatus = SUSPENDED businesses
[ ] INV-S5-41: release() failure after cancel → WARN log + continue, NOT throw
```

## AUDIT DIMENSION 2: Security Scan

Run this mentally against your code:

```
[ ] CROSS-SELLER: Can Seller A access Seller B's orders? Must return 404.
[ ] CROSS-BUYER: Can Buyer A access Buyer B's orders? Must return 404.
[ ] BUYER PRIVACY: Does any seller endpoint return buyerId, phone, or email?
[ ] ROLE BLEED: Can a BUYER call any /seller/* route without 403?
[ ] ROLE BLEED: Can a SELLER call any /buyer/* route without 403?
[ ] S3 SCOPING: Can a seller upload to another seller's S3 prefix?
[ ] S3 MIME: Can a non-image, non-pdf file be stored as dispatch proof?
[ ] SUSPENDED: Does a SUSPENDED seller get 403 on all routes?
[ ] USER vs BUSINESS: Is req.user.id ever used in a repository (not guard)?
[ ] JWT CLAIM: Is any field from JWT body trusted without guard re-verification?
```

## AUDIT DIMENSION 3: Transaction Safety

```
[ ] Is there any Redis call INSIDE a $transaction block? → MUST FIX
[ ] Is there any S3 call INSIDE a $transaction block? → MUST FIX
[ ] Is there any BullMQ add() INSIDE a $transaction block? → MUST FIX
[ ] Does every $transaction() have { timeout: 5000 }? → MUST FIX if missing
[ ] Is the idempotency check BEFORE any DB write? (INV-6)
[ ] Is releaseAllForOrder() called OUTSIDE the cancel $transaction?
[ ] Is KPI cache invalidation called AFTER tx commits (not inside)?
```

## AUDIT DIMENSION 4: EventOutbox Governance

```
[ ] All Sprint 5 eventOutbox.create() have schemaVersion: '5.0'
[ ] All eventOutbox.create() have eventVersion: '1.0'
[ ] All deduplicationKey values are deterministic (no Date.now(), no randomUUID())
[ ] OrderStatusChanged: inside $transaction (for status transitions)
[ ] SupplierScoreUpdated: outside $transaction (for scorecard cron)
[ ] Dispatch proof confirm: NO eventOutbox.create() anywhere
[ ] All EventOutbox payloads have complete fields (buyerId, sellerId, segment, etc.)
[ ] eventMonth populated on all records
```

## AUDIT DIMENSION 5: Repository & Package Boundaries

```
[ ] Seller module uses ONLY SellerOrderRepository (not OrderRepository)
[ ] Buyer module uses ONLY BuyerOrderRepository (not OrderRepository)
[ ] No deep imports: import { X } from '../../order/order.repository'
[ ] All cross-module access via NestJS DI (injected via module imports/exports)
[ ] InventoryService injected via InventoryModule export (not direct instantiation)
[ ] CartService injected via CartModule export (for reorder)
[ ] No circular module dependencies
[ ] All Sprint 5 DTOs are in packages/types (not co-located with services)
```

## AUDIT DIMENSION 6: Observability Completeness

```
[ ] All metrics defined in §11.1 that apply to this phase are wired
[ ] Every metric registered in metrics.providers.ts is actually incremented
[ ] No ghost metrics (registered but never called)
[ ] Structured logging: ORDER_STATUS_TRANSITION, KPI_REDIS_BYPASS, SCORECARD_COMPUTE_FAILED
[ ] Error logging includes: orderId/businessId/buyerId + error.message
[ ] Histogram .observe() called after SHIPPED transition (dispatch latency)
```

## AUDIT DIMENSION 7: N+1 & Performance

```
[ ] No N+1 queries: list endpoints use include with take limit
[ ] No SELECT * on bulk queries (use select: { id, status, ... })
[ ] KPI queries each hit their own index (not multi-table JOIN)
[ ] Cursor pagination: take: limit + 1 to detect hasMore
[ ] No OFFSET anywhere
[ ] No COUNT(*) in paginated responses
[ ] EXPLAIN ANALYZE mentally: which index does each query use?
```

## AUDIT DIMENSION 8: Degraded Mode Compliance

```
[ ] Redis down → service still works (DB fallback), never 500 (INV-S5-15)
[ ] S3 down → dispatch proof upload fails gracefully with 503 (not crash)
[ ] DB slow → $transaction timeout (5000ms) prevents lock amplification
[ ] BullMQ down → API still responds (scorecard cron failure isolated)
[ ] InventoryService.release() failure → order still CANCELLED (don't re-throw)
```

## AUDIT DIMENSION 9: AI Footgun Check

Re-read ALL "AI Footguns" blocks in your phase section and verify:

```
[ ] No DATE.now() in any deduplicationKey
[ ] No randomUUID() in any deduplicationKey
[ ] No flat 'EX', 60 in KPI cache (must use jitteredTtl)
[ ] No item.unitPrice used in reorder (must use product.basePrice)
[ ] No DELIVERED in SELLER_VALID_TRANSITIONS (Sprint 7 only)
[ ] No EventOutboxRelayWorker created (Sprint 2/3 existing worker handles PENDING)
[ ] No STATUS_TIMESTAMP_MAP (must be STATUS_TIMESTAMP_FIELD_MAP)
[ ] No releaseAllForOrder(orderId, buyerId) — correct: (orderId, 'ORDER_CANCELLED', buyerId)
[ ] No orderTracking.create() — must be orderTracking.upsert() for idempotency
[ ] No parallel Redis rate limit (INCR then EXPIRE) — must be atomic Lua
```

## AUDIT DIMENSION 10: DTO Completeness

```
[ ] All request bodies have Zod schema validation
[ ] All Zod schemas reject extra fields (use .strict() or strip)
[ ] All monetary fields return Decimal as string (not number)
[ ] All date fields return ISO8601 string
[ ] No nullable field returned as undefined (use null explicitly)
[ ] ReorderResultDto: warnings[] always present (never null, empty array if no warnings)
[ ] SellerKpiDto: isCacheBypass always present (boolean, never undefined)
[ ] BuyerOrderTimelineDto: tracking can be null (not undefined)
```

---

# ════════════════════════════════════════════════════
# STEP 4 — MANDATORY VALIDATION COMMANDS
# ════════════════════════════════════════════════════

Run ALL of these. Fix every error before proceeding. No exceptions.

## 4.1 TypeScript Typecheck
```bash
pnpm typecheck
# OR
pnpm -F @vyaparnet/api tsc --noEmit
# Required: ZERO type errors
```

## 4.2 Lint
```bash
pnpm lint
# Required: ZERO lint errors (warnings are acceptable but review each)
```

## 4.3 Build
```bash
pnpm build
# Required: Successful compile. ZERO errors.
```

## 4.4 Tests
```bash
pnpm test
# Required: All existing tests still passing (no regressions)
# Required: All new phase tests passing
```

## 4.5 Test Coverage (for your phase)
```bash
pnpm test --coverage
# Required: Sprint 5 modules > 80% coverage
```

## 4.6 Prisma Validation
```bash
pnpm prisma validate
pnpm prisma generate
# Required: ZERO schema errors
# Required: Client generated successfully
```

## 4.7 DTO / Package Build
```bash
pnpm -F @vyaparnet/types build
# Required: ZERO errors
```

## 4.8 Circular Dependency Check
```bash
npx madge --circular --extensions ts apps/api/src
# Required: ZERO circular dependencies in new modules
```

## 4.9 Security Grep Checks (run AFTER implementation)
```bash
# Check 1: No Redis inside $transaction
grep -rn "redis\." apps/api/src/modules/seller apps/api/src/modules/buyer \
  --include="*.ts" | grep -i "transaction\|prisma\.\$"
# MUST RETURN ZERO

# Check 2: No raw buyerId in seller DTOs
grep -rn "buyerId" packages/types/src/seller --include="*.ts"
# MUST RETURN ZERO

# Check 3: No req.user.id in repositories
grep -rn "req\.user\.id" apps/api/src/modules/seller/repositories \
  apps/api/src/modules/buyer/repositories --include="*.ts"
# MUST RETURN ZERO

# Check 4: Correct schemaVersion on Sprint 5 events
grep -rn "schemaVersion" apps/api/src/modules/seller apps/api/src/modules/buyer \
  --include="*.ts" | grep -v "'5.0'"
# MUST RETURN ZERO (all must be '5.0')

# Check 5: No Date.now() or randomUUID() in dedup keys
grep -rn "deduplicationKey" apps/api/src/modules/seller \
  apps/api/src/modules/buyer --include="*.ts" \
  | grep -E "Date\.now\(\)|randomUUID\(\)|new Date\(\)"
# MUST RETURN ZERO

# Check 6: $transaction timeout present
grep -rn "\$transaction" apps/api/src/modules/seller \
  apps/api/src/modules/buyer --include="*.ts" | grep -v "timeout: 5000"
# MUST RETURN ZERO (all $transaction calls must have timeout)

# Check 7: KPI cache not using flat 60 TTL
grep -rn "'EX', 60" apps/api/src/modules/seller --include="*.ts"
# MUST RETURN ZERO (must use jitteredTtl variable)

# Check 8: No direct inventory queries from seller/buyer
grep -rn "prisma\.inventory" apps/api/src/modules/seller \
  apps/api/src/modules/buyer --include="*.ts"
# MUST RETURN ZERO

# Check 9: No STATUS_TIMESTAMP_MAP (wrong name)
grep -rn "STATUS_TIMESTAMP_MAP" apps/api/src/modules/seller --include="*.ts" \
  | grep -v "FIELD"
# MUST RETURN ZERO (correct name is STATUS_TIMESTAMP_FIELD_MAP)
```

## 4.10 Database Verification (for migration phases)
```sql
-- Verify SellerScore table
SELECT column_name FROM information_schema.columns
WHERE table_name = 'SellerScore';
-- Expected: id, businessId, compositeScore, dispatchSpeedScore,
--           deliveryQualityScore, acceptanceRate, orderCount,
--           calculatedAt, previousCompositeScore (9 columns)

-- Verify OrderTracking additions
SELECT column_name FROM information_schema.columns
WHERE table_name = 'OrderTracking'
AND column_name IN ('dispatchProofUrl', 'dispatchProofAt');
-- Expected: 2 rows

-- Verify indexes
SELECT indexname FROM pg_indexes WHERE tablename = 'SellerScore';
-- Must include: idx_seller_score_biz, idx_seller_score_composite

SELECT indexname FROM pg_indexes WHERE tablename = 'Order';
-- Must include: idx_order_seller_date (new), idx_order_seller_stat (existing)

-- Verify state machine unlock
-- (Code check, not SQL):
grep "SPRINT5_STATES" apps/api/src/modules/order/order-state-machine.ts
-- PROCESSING and SHIPPED must NOT appear inside SPRINT5_STATES list
```

---

# ════════════════════════════════════════════════════
# STEP 5 — ACCEPTANCE CRITERIA VERIFICATION
# ════════════════════════════════════════════════════

Go back to your phase section in SPRINT_5_EXECUTION_LOCK_FINAL.md.

Read the **Acceptance Criteria** block for Phase [N].

Verify EVERY ✅ item manually or via test:

```
[ ] Every API endpoint returns expected response shape
[ ] Every error case returns correct HTTP status + error code
[ ] Every idempotency case returns same response on retry
[ ] Cross-role access returns 403 (not 401, not 500)
[ ] Cross-ownership access returns 404 (not 403, not 500)
[ ] Observability metrics increment correctly
[ ] EventOutbox records created with correct payload
[ ] Cursor pagination works correctly (nextCursor, hasMore)
[ ] Redis cache behavior verified (hit, miss, bypass)
[ ] Phase-specific acceptance criteria from §14-§25 all passing
```

---

# ════════════════════════════════════════════════════
# STEP 6 — PHASE COMPLETION REPORT
# ════════════════════════════════════════════════════

After all steps complete, output this EXACT report format:

```
══════════════════════════════════════════════════════════
PHASE [N] — [PHASE NAME] — COMPLETION REPORT
══════════════════════════════════════════════════════════

STATUS: ✅ COMPLETE | ⚠️ COMPLETE WITH NOTES | ❌ BLOCKED

────────────────────────────────────────────────────────
FILES CREATED:
────────────────────────────────────────────────────────
  [List every new file with full path]

FILES MODIFIED:
────────────────────────────────────────────────────────
  [List every modified file with full path + what changed]

────────────────────────────────────────────────────────
INVARIANTS VERIFIED:
────────────────────────────────────────────────────────
  [List each INV-S5-N that applied to this phase and confirm ✅]

────────────────────────────────────────────────────────
VALIDATION RESULTS:
────────────────────────────────────────────────────────
  TypeScript typecheck:  ✅ PASS / ❌ FAIL (details)
  Lint:                  ✅ PASS / ❌ FAIL (details)
  Build:                 ✅ PASS / ❌ FAIL (details)
  Tests:                 ✅ PASS (N/N) / ❌ FAIL (details)
  Test Coverage:         ✅ >80% / ⚠️ N% (below target)
  Prisma validate:       ✅ PASS / ❌ FAIL (details)
  Circular deps:         ✅ ZERO / ❌ FOUND (details)
  Security greps:        ✅ ALL ZERO / ❌ VIOLATIONS (details)

────────────────────────────────────────────────────────
SELF-AUDIT FINDINGS:
────────────────────────────────────────────────────────
  Issues found during self-audit: [N]
  Issues fixed before completion: [N]
  [List each issue found and how it was fixed]

  Remaining issues (if any): [NONE / list with severity]

────────────────────────────────────────────────────────
ACCEPTANCE CRITERIA:
────────────────────────────────────────────────────────
  [List each acceptance criterion from the phase section]
  [Mark: ✅ VERIFIED / ⚠️ PARTIAL / ❌ FAILED]

────────────────────────────────────────────────────────
NOTES FOR NEXT PHASE:
────────────────────────────────────────────────────────
  [Any dependencies, state, or warnings the next phase must know]

══════════════════════════════════════════════════════════
⛔ STOP — AWAITING HUMAN REVIEW AND APPROVAL
⛔ DO NOT PROCEED TO NEXT PHASE UNTIL APPROVED
══════════════════════════════════════════════════════════
```

---

# ════════════════════════════════════════════════════
# QUICK REFERENCE: PHASE MAP
# ════════════════════════════════════════════════════

| Phase | Name | Lock Section | Key Deliverables |
|---|---|---|---|
| Phase 0 | Architecture Invariants | §13 | Read-only. Confirm understanding of all invariants. |
| Phase 1 | Schema, Migrations & DTOs | §14 | SellerScore migration, OrderTracking fields, state machine unlock, all Zod DTOs |
| Phase 2 | Buyer Dashboard | §15 | BuyerModule, BuyerOrderRepository, cancel with inventory release, retry-status |
| Phase 3 | Seller Dashboard | §16 | SellerContextGuard, SellerModule, KPI service with Redis + jitter TTL |
| Phase 4 | Seller Order Management | §17 | SellerOrderRepository, transitionStatus(), trackingNumber gate, SELLER_VALID_TRANSITIONS |
| Phase 5 | Dispatch Workflow | §18 | S3 presigned URL, MIME validation, HEAD verify, upsert confirm |
| Phase 6 | Seller KPI Engine | §19 | 4 independent indexed KPI queries, jitter cache, bypass metric |
| Phase 7 | Seller Scorecard Engine | §20 | SellerScorecardWorker, 3-metric formula, BullMQ cron, dedup EventOutbox |
| Phase 8 | Buyer Reorder Engine | §21 | Rate limit Lua, current prices, partial warnings, CartService |
| Phase 9 | EventOutbox Integration | §22 | Grep audit, payload verification, relay inheritance confirmation |
| Phase 10 | Observability & Operations | §23 | All 9 metrics wired, 8 alerts, structured logging |
| Phase 11 | Security Hardening | §24 | Full grep security audit, cross-role tests, S3 scoping verification |
| Phase 12 | Final Validation Gates | §25 | Complete acceptance test run, all §25.1–§25.10 gates passing |

---

# ════════════════════════════════════════════════════
# CRITICAL REMINDERS (READ BEFORE EVERY PHASE)
# ════════════════════════════════════════════════════

```
1. Order.sellerId is Business.id — NEVER User.id
2. releaseAllForOrder(orderId, 'ORDER_CANCELLED', actorId) — 3 args always
3. STATUS_TIMESTAMP_FIELD_MAP — not STATUS_TIMESTAMP_MAP (compile error)
4. jitteredTtl = 60 + Math.floor(Math.random() * 15) — not flat 60
5. $transaction({ timeout: 5000 }) — always, on every transaction
6. EventOutbox relay worker exists from Sprint 2/3 — do NOT create new one
7. orderTracking.upsert() — not .create() (idempotency on re-confirm)
8. S3 Conditions: explicit jpeg/png/webp/pdf — not 'image/*' wildcard
9. Buyer cancel → 404 for wrong buyer (not 403)
10. Seller accessing another seller's order → 404 (not 403)
```

---

*Authority: SPRINT_5_EXECUTION_LOCK_FINAL.md v1.2 FINAL AUDIT FREEZE*
*Scope: sprint_5scope_decision.md v1.1 APPROVED*
*This prompt is the implementation authority for Sprint 5 — Phase by Phase.*
*Any conflict with any other document: THE EXECUTION LOCK TAKES PRECEDENCE.*
