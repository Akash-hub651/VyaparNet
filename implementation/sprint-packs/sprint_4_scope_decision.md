# VYAPARNET — SPRINT 4 SCOPE DECISIONS
## Enterprise Architecture Assumption Lock
### Version: v1.0 | Status: AWAITING APPROVAL
### Authority: Post-Sprint-3 Freeze | Date: 2026-05-28
### Precedes: Sprint 4 Architecture Generation

---

> **DOCUMENT PURPOSE**
> This document locks every architectural assumption, philosophy, and boundary decision for Sprint 4.
> It is the ONLY input to Sprint 4 Architecture Generation.
> No architecture generation begins until this document is reviewed and approved.
> Every decision in this document builds on Sprint 1–3 frozen guarantees — it does not replace them.

---

## ABSOLUTE SPRINT 1–3 GUARANTEES (INHERITED — NON-NEGOTIABLE)

The following are treated as immutable laws in Sprint 4. No Sprint 4 decision may weaken them.

| Guarantee | Source | Sprint 4 Implication |
|---|---|---|
| Zero-oversell guarantee | Sprint 3 INV-1 through INV-10 | `consume()` happens inside OrderService `$transaction` with `tx` passed from caller |
| `InventoryService` is the sole inventory authority | Sprint 3 INV-12 | OrderModule NEVER writes to Inventory tables directly |
| EventOutbox is the ONLY cross-module communication | Sprint 3 INV-13 | Orders, payments, and carts emit ALL side-effects via EventOutbox |
| Append-only audit philosophy | Sprint 3 INV-7 | `OrderStatusHistory` is append-only; no DELETE/UPDATE |
| Deterministic EventOutbox deduplication keys | Sprint 3 §6 | All Sprint 4 events use deterministic keys (no `Date.now()`, no `randomUUID()`) |
| No Redis/HTTP/external calls inside `$transaction` | Sprint 3 §3 | All Sprint 4 transactions follow the same boundary rule |
| Optimistic locking on high-contention writes | Sprint 3 §11 | Payment writes use idempotency, not optimistic locking (different pattern — see §D4) |
| Segment isolation on all queries | Sprint 3 INV-11 | Cart, Order, and Payment queries always filter by segment |
| Idempotency key is the first operation | Sprint 3 INV-6 | Payment and order idempotency checks are the first operation in their flows |
| DTO governance via Zod in `packages/types` | Sprint 1–3 pattern | All Sprint 4 DTOs live in `packages/types/src/{cart,order,payment}/` |

---

## §D1 — CART PHILOSOPHY

### Decision

**Persistent server-side cart with DB-backed storage, Redis display-layer cache, per-user per-segment uniqueness, no guest cart support in Sprint 4, buyer-owned with TTL-based invalidation.**

---

### D1.1 — Cart Storage Model

**Decision:** Persistent cart stored in PostgreSQL `Cart` + `CartItem` tables. Redis used as display-layer cache only (TTL 60s). Cart is NOT session-only.

**Why chosen:**
VyaparNet is a B2B platform where buyers compose orders over hours or across multiple visits. A cart representing ₹2–5 lakh worth of textile or spare-parts inventory cannot be lost on session expiry or browser close. Session carts suit B2C impulse purchases; persistent carts suit B2B procurement intent.

**Alternatives rejected:**
- **Session/Redis-only cart:** Lost on TTL expiry, Redis unavailability, or device switch. Unacceptable for B2B context.
- **Client-side cart (localStorage):** No server reconciliation, stale pricing, MOQ bypass risk, security exposure.
- **Hybrid session + persist on checkout:** Too complex, race conditions on persist, orphaned session carts common.

**Tradeoffs:**
- `+` Survives page close, device switch, Redis failure.
- `+` Enables reorder (Sprint 5) by reading persisted cart history.
- `+` Accurate inventory check against DB-authoritative stock.
- `-` DB writes on every cart mutation (add/update/remove). Mitigated by: lightweight writes on indexed columns, no transaction required for cart mutations (non-critical write path).

**Future scalability impact:** At scale, `CartItem` table grows. Partition by `userId` range or `createdAt` month in Phase 2. Cart queries are always scoped to `userId + segment` (indexed).

**Operational impact:** Cart cleanup cron (Sprint 4) purges abandoned carts older than 30 days. Index `idx_cart_user_seg_stat` is Tier 1 (already defined in schema v4.3).

**Sprint 5+ implications:** Reorder (Sprint 5) reads last completed order, not last cart — independent of this decision.

**Risk considerations:** Cart DB write is not atomic with inventory check at add-to-cart (intentional — soft reservation happens at checkout). This means a cart item may become unavailable before checkout. This is by design: UI shows live stock status, and checkout-time inventory validation catches stale items.

**AI-agent implementation implications:**
- CartRepository must ALWAYS filter by `userId + segment`. Never return carts cross-segment.
- `GET /cart` should serve from Redis cache (60s TTL). `POST/PUT/DELETE /cart/items` invalidates Redis key immediately after DB write.
- Cart totals are computed server-side on every GET. Never trust client-sent totals.

---

### D1.2 — Cart Expiration Policy

**Decision:** Abandoned carts (no activity > 30 days) are soft-deleted by a cron worker. Active carts with ACTIVE status: no forced expiry. Cart items whose product becomes INACTIVE are flagged on next cart load.

**Why chosen:** B2B buyers may sit on a cart for days researching vendors. 30 days is the minimum acceptable window. Forcing earlier expiry destroys purchase intent.

**Alternative rejected:** 7-day expiry (too aggressive for B2B procurement cycles).

**Sprint 5+ implications:** Cart history can serve as a reorder signal (Sprint 5 reorder feature reads from OrderHistory, not Cart).

**AI-agent implementation implications:** Cron worker uses `updatedAt < 30 days ago AND status = ACTIVE`. Soft-delete (`status = ABANDONED`) not hard-delete — preserves audit trail.

---

### D1.3 — Cart Ownership Rules

**Decision:** One cart per `userId + segment + ACTIVE`. Unique constraint enforced at DB level (`idx_cart_user_seg_stat` UNIQUE). Buyers own their carts. Sellers cannot create carts. Admins can read carts for support purposes.

**Why chosen:** Segment isolation is a system law (INV-11). A buyer browsing TEXTILE cannot accidentally mix SPARE_PARTS items into the same checkout. B2B multi-segment purchasing is deferred to Phase 2.

**Alternative rejected:** Multi-segment cart — requires complex split-checkout logic, violates segment isolation philosophy in Sprint 4 scope.

**AI-agent implementation implications:** CartService.addItem() must validate that `product.segment === cart.segment`. Reject with `SEGMENT_MISMATCH` error if different.

---

### D1.4 — Multi-Device Sync Philosophy

**Decision:** Persistent DB cart is inherently multi-device. Any authenticated device reads the same cart by `userId + segment`. No explicit sync logic needed — DB is the source of truth.

**Why chosen:** Follows the Sprint 1–3 philosophy of PostgreSQL as the authoritative state. Redis display cache invalidated on write ensures fresh data on next device poll.

**AI-agent implementation implications:** No special multi-device handling code required. SWR/polling on frontend with 30s refresh interval covers staleness.

---

### D1.5 — Cart Reservation Policy (Critical)

**Decision:** Cart add-to-cart does NOT reserve inventory. Inventory reservation happens ONLY at checkout initiation. Cart is a wish list until the buyer proceeds to checkout.

**Why chosen:**
This is the most important cart decision. Reserving inventory on add-to-cart in B2B creates hoarding attacks: a buyer adds 1000 units to cart, never checks out, and blocks all other buyers. The Sprint 3 `InventoryAbuseGuard` is designed for the reservation path, not the cart path. Cart-time reservation would require managing reservation expiry for every cart mutation — massive operational complexity for no correctness benefit.

**Alternatives rejected:**
- **Reserve on add-to-cart:** Creates hoarding vectors, amplifies expiry worker load, forces complex partial-reserve logic on cart removal.
- **Reserve on checkout step 1 only:** Better, but still creates reservations without payment intent. Deferred to Phase 2 if business requires it.

**Tradeoffs:**
- `+` No hoarding vectors at cart stage.
- `+` Zero inventory write-amplification on cart mutations.
- `-` Stock may drop between add-to-cart and checkout. Mitigated by: checkout-time inventory validation with clear error messages, live stock badge on cart page (SWR 30s refresh), `isLowStock` flag surfaced on cart items.

**Sprint 4 checkout implications:** Checkout must validate real-time stock BEFORE reserve. Cart items with zero stock block checkout with explicit `CART_ITEM_UNAVAILABLE` error.

**AI-agent implementation implications:**
- `CartService.addItem()` calls `InventoryService.getAvailability()` (display path only) to check `availableQuantity > 0` and enforce MOQ. This is a soft check — not a reservation.
- `CartService.addItem()` does NOT call `InventoryService.reserve()`.
- The checkout flow (OrderService) calls `InventoryService.reserve()`.

---

### D1.6 — Guest Cart Support

**Decision:** No guest cart in Sprint 4. Authentication is required for cart creation. Rationale: VyaparNet is a verified B2B platform (all Sprint 1 onboarding is identity-bound). Guest cart support deferred to Phase 2 if B2C expansion is needed.

---

### D1.7 — Cart Merge Behavior

**Decision:** No cart merge in Sprint 4. Since there is no guest cart, there is nothing to merge. A logged-in buyer always has exactly one active cart per segment.

---

### D1.8 — Cart Pricing Snapshot Philosophy

**Decision:** Cart items store `productId` and `quantity` only. Price is fetched live from `Inventory.price` on every `GET /cart`. Price is snapshotted into `OrderItem` at order creation time (immutable snapshot). Cart does NOT snapshot price.

**Why chosen:** B2B prices change frequently. A cart showing a stale price from 3 days ago is worse than showing the live price. The order snapshot is the authoritative price record — locking occurs at order time, not cart time.

**Tradeoff:** Price can change between cart add and checkout. UI must show "Price may have changed" warning if cart was last viewed > 1 hour ago.

**AI-agent implementation implications:** `OrderItem.unitPrice` is always captured at `createOrder()` time from `Inventory.price`. `CartItem` has no `price` column.

---

### D1.9 — Cart Invalidation Philosophy

**Decision:** Cart items are invalidated (surfaced as warnings, not silently removed) when: (a) product becomes INACTIVE, (b) stock reaches 0, (c) price changes > 20% since last cart view. Hard removal of cart items requires buyer action.

**Why chosen:** Silent removal destroys buyer trust. B2B buyers may be tracking large orders and need to know what changed and why.

**AI-agent implementation implications:** `GET /cart` response includes `itemWarnings: [{ cartItemId, warningType: 'PRODUCT_INACTIVE' | 'OUT_OF_STOCK' | 'PRICE_CHANGED', details: {} }]`. Frontend displays warning banners. Buyer must acknowledge before proceeding to checkout.

---

## §D2 — CHECKOUT PHILOSOPHY

### Decision

**Orchestrated checkout with pre-checkout validation, inventory reservation at checkout-start, synchronous order creation with atomic transaction, async payment handling, degraded-mode COD fallback.**

---

### D2.1 — Synchronous vs Orchestrated Checkout

**Decision:** Checkout is **synchronous orchestration within a single NestJS request** for Sprint 4. No distributed saga coordinator. OrderService orchestrates: validate → reserve → create order (atomic `$transaction`) → initiate payment. This is the modular monolith pattern — same process, same DB.

**Why chosen:**
Sprint 3 §18.1 explicitly states: "Saga coordination via direct service calls within same process. OrderService (Sprint 4) calls InventoryService within same $transaction. No distributed coordination needed — same DB, same transaction boundary." This is the locked Sprint 3 contract. Deviating requires a DDR.

**Alternative rejected:**
- **Distributed saga coordinator (Choreography or Orchestration-based):** Phase 3 evolution. Premature at modular monolith stage.
- **Full async checkout (event-driven, fire-and-forget):** Deferred to Phase 2. Requires WebSocket/polling infrastructure for status feedback.

**Sprint 5+ implications:** When InventoryService is extracted to a microservice (Phase 3), the saga becomes distributed. The `reserve()` → `consume()` → `release()` interface (locked in Sprint 3 §18.3) remains identical. Only transport changes.

---

### D2.2 — Pre-Checkout Validation Strategy

**Decision:** Checkout validates ALL items before reserving ANY. Validation is a read-only pass: product exists + is ACTIVE, product segment matches cart segment, quantity >= MOQ, `InventoryService.getAvailability()` shows stock > 0. If any item fails, checkout aborts with specific `CART_ITEM_UNAVAILABLE` error listing all failing items. No partial validation.

**Why chosen:** Partial reservation (some items reserved, others failing) is a nightmare to compensate. Better to fail fast on all items before touching inventory.

**AI-agent implementation implications:** Validation is a `Promise.all()` of read operations. Then reservations are sequential per item (not parallel — avoids lock contention storm on same inventory).

---

### D2.3 — Inventory Validation Timing

**Decision:** Inventory is validated (via `getAvailability()`) at checkout start (pre-checkout pass), then reserved (via `reserve()`) item by item before order creation. The reservation is the authoritative check — not the pre-validation.

**Why chosen:** Pre-validation catches obvious failures early (returns clear errors). `reserve()` is the correctness authority (Sprint 3 guarantee). Both are needed.

**AI-agent implementation implications:**
- Pre-validation: `InventoryService.getAvailability()` — display path, not correctness authority.
- Reservation: `InventoryService.reserve()` — correctness authority, uses 7-layer defense.
- If reserve() fails on item N after items 1..N-1 succeeded: release all 1..N-1 via `InventoryService.releaseAllForOrder()`.

---

### D2.4 — Reservation Timing

**Decision:** Inventory reservation happens BEFORE the order `$transaction`. On `POST /orders`:
1. Pre-validate all items (read path).
2. Reserve each item via `InventoryService.reserve()` (outside `$transaction` — Sprint 3 contract).
3. Create order in a single `$transaction` (order + items + status history + EventOutbox).
4. If `$transaction` fails: release all reservations via `releaseAllForOrder()`.

**Why chosen:** Sprint 3 §18.4 mandates: "Call reserve() BEFORE order.status transitions to PLACED." `InventoryService.reserve()` cannot be called inside the order `$transaction` (Sprint 3 §3 prohibition: no external service calls inside `$transaction`). consume() is called inside the payment `$transaction`.

**AI-agent implementation implications:**
```typescript
// Correct ordering — locked:
// 1. reserve() outside $transaction
// 2. $transaction (order creation)
// 3. If $transaction fails: releaseAllForOrder()
// 4. consume() inside payment $transaction
```

---

### D2.5 — Partial Checkout Support

**Decision:** No partial checkout in Sprint 4. All items in the cart must be available for checkout to proceed. If any item is unavailable, checkout fails with a list of all failing items.

**Why chosen:** Partial checkout (checking out some items and leaving others in cart) requires complex split-order logic, partial payment amounts, and partial inventory management. Deferred to Phase 2.

**Sprint 5+ implications:** Partial checkout becomes important for large B2B orders. Sprint 5 reorder feature mitigates this by allowing buyers to retry unavailable items separately.

---

### D2.6 — Multi-Seller Checkout Support

**Decision:** Multi-seller checkout is **supported in Sprint 4 at the data model level** (each `OrderItem` carries `sellerId`, inventory reservations are per-product per-seller) but **presented as a single order** to the buyer in Sprint 4. Split order visibility and split payment/fulfillment are deferred to Sprint 5+.

**Why chosen:** The schema v4.3 `OrderItem` already has `sellerId`. Reservations are already per-product (per inventory record). The data model is multi-seller-ready. The buyer experience complexity of "your order is split across 3 sellers" is deferred until the seller dashboard (Sprint 5) can show each seller their specific items.

**Sprint 5+ implications:** Sprint 5 introduces `GET /seller/orders/:id` showing only that seller's items. The underlying order remains unified in Sprint 4.

**AI-agent implementation implications:** `OrderItem.sellerId` MUST be populated from `Product.businessId` at order creation. Never null.

---

### D2.7 — Retry Philosophy

**Decision:** Checkout retry is handled by idempotency keys, not retry loops in the checkout path. `POST /orders` requires `Idempotency-Key` header. Second call with same key returns the existing order. Failed checkout (payment failure) requires buyer to re-initiate payment separately, not re-run the entire checkout.

**AI-agent implementation implications:** Order idempotency key pattern: `order-${cartId}-${userId}`. TTL: 1 hour. Stored in Redis after order `$transaction` commits.

---

### D2.8 — Degraded-Mode Checkout Behavior

**Decision:** If Redis is unavailable (DEGRADED mode), COD checkout must still succeed. Online payment checkout degrades to "payment initiation deferred" — buyer can complete COD and retry online payment from order detail page.

**Why chosen:** COD is the zero-dependency payment path. The system must never block revenue because Redis is down.

**AI-agent implementation implications:**
- COD path: no Redis dependency in happy path (inventory service uses degraded mode internally with DB-only locking — Sprint 3 §8.3).
- Online payment path: if payment idempotency check fails (Redis down), return 503 with `retryable: true`. Buyer retries from order page.

---

## §D3 — ORDER LIFECYCLE DESIGN

### Decision

**Enterprise-safe 9-state order lifecycle with immutable status history, compensation states, and time-bounded cancellation window.**

---

### D3.1 — Order States (Locked)

```
DRAFT            → Created but not submitted (future: save-for-later)
PLACED           → Submitted by buyer, inventory reserved, payment pending
CONFIRMED        → Payment captured OR COD accepted
PROCESSING       → Seller has acknowledged and is preparing
SHIPPED          → Seller has dispatched with tracking number
DELIVERED        → Delivery confirmed (seller-marked or auto after timeout)
COMPLETED        → Buyer acknowledged receipt (or auto after 7 days post-delivery)
CANCELLED        → Cancelled before SHIPPED (buyer or admin), inventory released
PAYMENT_FAILED   → Payment failed, inventory released, buyer can retry payment
```

**Rationale for each state:**

| State | Why Needed |
|---|---|
| `PLACED` | Inventory is reserved but not consumed. Payment pending. Order is legally created. |
| `CONFIRMED` | Inventory consumed (payment captured). Order is revenue. Triggers seller notification. |
| `PROCESSING` | Seller working on fulfillment. Sprint 5 activation. |
| `SHIPPED` | Tracking number required. Sprint 5 activation. |
| `DELIVERED` | Fulfillment complete. Payout trigger (Sprint 7). |
| `COMPLETED` | Return window closed. Final state. |
| `CANCELLED` | Inventory released. Compensation complete. Terminal state. |
| `PAYMENT_FAILED` | Inventory released. Order exists but is inert. Buyer can retry payment within 30 min window. |

---

### D3.2 — State Transitions (Locked)

```
PLACED          → CONFIRMED        (COD: immediate | Online: on payment webhook capture)
PLACED          → PAYMENT_FAILED   (Online: on payment webhook failure)
PLACED          → CANCELLED        (Buyer cancel within window | Admin force-cancel)
PAYMENT_FAILED  → CONFIRMED        (Buyer retries payment successfully)
PAYMENT_FAILED  → CANCELLED        (30-min retry window expires)
CONFIRMED       → PROCESSING       (Sprint 5 — seller confirms)
CONFIRMED       → CANCELLED        (Admin only, before PROCESSING)
PROCESSING      → SHIPPED          (Sprint 5 — seller marks shipped)
SHIPPED         → DELIVERED        (Sprint 5 — seller marks delivered)
DELIVERED       → COMPLETED        (Sprint 5 — auto after 7 days)
DELIVERED       → [Return window]  (Sprint 8 — return request)
```

**Invalid transitions rejected by server-side state machine** — client cannot pass arbitrary status.

**AI-agent implementation implications:** `OrderService.updateStatus()` must validate the transition against an immutable transition map. Any invalid transition → `422 INVALID_STATUS_TRANSITION`.

---

### D3.3 — Terminal States

```
COMPLETED    → No further transitions. Ever.
CANCELLED    → No further transitions. Ever.
```

**Attempting to transition a terminal-state order → `422 ORDER_ALREADY_TERMINAL`.**

---

### D3.4 — Compensation States

`PAYMENT_FAILED` is the compensation state for Sprint 4. It signals:
- Inventory has been released via `InventoryService.release(reservationId, 'PAYMENT_FAILED', userId)`.
- Buyer can retry payment within 30-minute window.
- After 30 minutes: auto-transition to `CANCELLED` via a BullMQ worker (`PaymentRetryExpiryWorker`).

---

### D3.5 — Cancellation Window

**Decision:** Buyers can cancel before `SHIPPED`. After `SHIPPED`, only Admin can cancel. After `DELIVERED`, no cancellation — return request (Sprint 8).

**Sprint 4 scope:** Buyer cancel is only valid in `PLACED` or `CONFIRMED` state before `PROCESSING`. Once seller begins `PROCESSING` (Sprint 5), buyer cancellation requires admin approval.

---

### D3.6 — Order Expiration Rules

**Decision:** Orders in `PLACED` state with no payment response after 30 minutes are transitioned to `PAYMENT_FAILED` by `PaymentReconciliationWorker` (already planned in roadmap). This covers missed webhooks.

---

### D3.7 — Approval States

**Decision:** No order-level approval states in Sprint 4. Approval states (requiring procurement manager sign-off before checkout) are deferred to RFQ workflow (Sprint 8) and enterprise procurement (Phase 2).

**Sprint 8 implications:** RFQ-converted orders may have `PENDING_APPROVAL` state before `PLACED`. This is addable as an additional state without disrupting the Sprint 4 machine (state machine is extensible by design).

---

### D3.8 — OrderStatusHistory (Immutable Audit Log)

**Decision:** Every state transition creates an `OrderStatusHistory` record. This table is append-only (no UPDATE/DELETE — same philosophy as `InventoryMovement`). Every record includes: `orderId`, `statusFrom`, `statusTo`, `actorId`, `actorRole`, `reason` (optional), `timestamp`.

**AI-agent implementation implications:** `OrderStatusHistoryRepository` must have ZERO `update()` or `delete()` methods. Comment at top: `// APPEND-ONLY: This repository has no update or delete methods by design.`

---

## §D4 — PAYMENT ORCHESTRATION PHILOSOPHY

### Decision

**Synchronous payment initiation with async confirmation via webhooks, payment provider abstracted behind PaymentProvider interface, dual-mode (COD + Razorpay), idempotency-first payment handling, reconciliation worker for missed webhooks.**

---

### D4.1 — Synchronous vs Async Payment Confirmation

**Decision:** Payment initiation is synchronous (API call to Razorpay, returns payment URL/session). Payment confirmation is async (Razorpay webhook → PaymentWebhookController → update order status). Reconciliation worker polls Razorpay every 5 minutes for payments without webhook confirmation.

**Why chosen:** This is the industry-standard approach for Indian payment gateways (Razorpay, Paytm, PayU). Razorpay calls our webhook; we don't poll in the happy path. The reconciliation worker handles missed webhooks (common in India due to network failures).

**AI-agent implementation implications:**
- `POST /payments/initiate`: synchronous Razorpay order creation, returns `{ paymentUrl, razorpayOrderId }`.
- `POST /payments/webhook`: async processing. Returns `200 OK` immediately after idempotency check + queueing to BullMQ worker for actual processing.
- Webhook processing must NOT block on the webhook response — return 200 immediately.

---

### D4.2 — Payment Provider Abstraction

**Decision:** `PaymentProvider` interface abstracts all gateway-specific logic. Sprint 4 implements `RazorpayPaymentProvider`. COD is implemented as `CodPaymentProvider` (no external call — immediately confirms).

```typescript
interface PaymentProvider {
  createOrder(amount: number, currency: string, metadata: PaymentOrderMetadata): Promise<PaymentProviderOrder>;
  verifyWebhookSignature(payload: Buffer, signature: string, secret: string): boolean;
  capturePayment(providerOrderId: string): Promise<PaymentCaptureResult>;
  refundPayment(providerPaymentId: string, amount: number, reason: string): Promise<RefundResult>;
  getPaymentStatus(providerOrderId: string): Promise<PaymentStatus>;
}
```

**Why chosen:** Future payment providers (Paytm, PayU, UPI direct, Stripe for international) can be added without changing OrderService or PaymentService. Only a new provider class is added.

**Sprint 5+ implications:** B2B credit payments (khata/credit line) will implement `CreditPaymentProvider` in Phase 3. Zero OrderService changes required.

**AI-agent implementation implications:** All Razorpay SDK calls MUST be inside `RazorpayPaymentProvider`. `PaymentService` only calls the `PaymentProvider` interface. No Razorpay imports outside the provider class.

---

### D4.3 — Webhook Philosophy

**Decision:** Webhook endpoint (`POST /payments/webhook`) is a separate NestJS controller with `express.raw()` middleware (raw body preserved for HMAC verification). JSON parsing middleware must NOT process this route. Webhook signature verified BEFORE any business logic.

**Security rules:**
1. HMAC signature verification is mandatory. Invalid signature → `400` immediately, no further processing.
2. Idempotency check: `webhookEventId` checked in Redis (TTL 24h). Duplicate → `200` immediately (no reprocessing).
3. Webhook body is queued to BullMQ worker for actual processing — webhook controller returns `200` within 200ms.

**Razorpay-specific:** Razorpay retries webhooks 5+ times on non-200. Without idempotency, duplicate order confirmations would occur. This is the second-most critical security requirement in Sprint 4.

**AI-agent implementation implications:**
- `WebhookController` is a separate class from `PaymentController`.
- `@UseInterceptors(RawBodyInterceptor)` or equivalent to preserve raw bytes for HMAC.
- Idempotency key: `webhook-${razorpayEventId}` stored in Redis AFTER queueing.
- `WebhookProcessorWorker` (BullMQ) handles: update Payment status → update Order status → emit EventOutbox event → update inventory (consume).

---

### D4.4 — Payment Retry Philosophy

**Decision:** If payment fails, order enters `PAYMENT_FAILED` state. Buyer has 30-minute window to retry payment from the order detail page (`POST /payments/retry`). Retry creates a NEW payment record with a new idempotency key, linking to the SAME orderId. If buyer does not retry within 30 minutes, `PaymentRetryExpiryWorker` transitions order to `CANCELLED` and ensures inventory is released.

**AI-agent implementation implications:**
- `POST /payments/retry` validates: `order.status === 'PAYMENT_FAILED'` AND `order.paymentFailedAt > now - 30min`.
- New `Payment` record created (old record preserved — append-only audit).
- New idempotency key: `payment-retry-${orderId}-${attempt}` (deterministic, not timestamp-based).

---

### D4.5 — Duplicate Webhook Handling

**Decision:** Redis idempotency key `webhook-{razorpayEventId}` (TTL 24h) is checked as the FIRST operation in webhook processing. If key exists → return `200 OK` with cached result immediately. Key is SET after processing is queued (not after completion — avoids race where webhook re-fires before queue job completes).

**Why chosen:** Razorpay sends duplicate webhooks frequently (5+ retries on non-200). Without deduplication, the same payment could confirm an order multiple times. Redis NX (set-if-not-exists) ensures exactly-once queueing.

---

### D4.6 — Reconciliation Philosophy

**Decision:** `PaymentReconciliationWorker` runs every 5 minutes (BullMQ cron). It queries `Payment WHERE status = 'PENDING' AND createdAt < now() - 10min`. For each: calls `PaymentProvider.getPaymentStatus()` and updates accordingly. This catches: missed webhooks, slow delivery, Razorpay outages.

**Alert:** If reconciliation finds > 10 pending payments in a single run → WARNING alert (possible webhook delivery failure).

---

### D4.7 — Payment Failure Handling

**Decision:** On payment failure (webhook `payment.failed` event):
1. Update `Payment.status = FAILED`.
2. Update `Order.status = PAYMENT_FAILED`.
3. Call `InventoryService.release(reservationId, 'PAYMENT_FAILED', userId)` for ALL reserved items.
4. Emit `PaymentFailed` event to EventOutbox (deterministic dedup key: `payment-failed-{paymentId}`).
5. Notification consumer picks up event and notifies buyer.

**Inventory release timing:** Release happens in the `WebhookProcessorWorker` (BullMQ worker), NOT inside a webhook HTTP handler. This ensures: release is retryable on failure, webhook returns 200 quickly, release is decoupled from webhook latency.

**AI-agent implementation implications:** `WebhookProcessorWorker` must use `InventoryService.releaseAllForOrder()` — not individual release calls — to handle partial checkout scenarios cleanly.

---

### D4.8 — Refund Preparation Strategy

**Decision:** Refund methods are defined in the `PaymentProvider` interface as stubs in Sprint 4. Actual refund initiation is deferred to Sprint 8 (Returns & Disputes). Sprint 4 creates the `refundPayment()` method on `RazorpayPaymentProvider` as a skeleton that throws `NotImplementedException`.

**Why chosen:** Building refund logic in Sprint 4 without the return/dispute workflow (Sprint 8) creates orphaned infrastructure. The interface is defined now so the integration point is clear.

---

### D4.9 — Partial Payment Support

**Decision:** No partial payment in Sprint 4. Orders are either fully paid or not. Partial payment (e.g., advance + balance) is a Phase 3 B2B credit feature.

---

### D4.10 — COD Support

**Decision:** COD (Cash on Delivery) is a first-class payment method in Sprint 4. COD flow:
1. Buyer selects COD at checkout.
2. `POST /orders` → creates order, reserves inventory, immediately transitions to `CONFIRMED` (no payment gateway call).
3. `consume()` is called immediately inside the order `$transaction` for COD (no pending payment state).
4. Inventory is consumed at order creation for COD (not deferred to payment capture).
5. Emit `OrderConfirmed` event.

**Why chosen:** COD is the primary payment method for Indian B2B SMBs. Making it a full fallback path ensures revenue even when Razorpay is unavailable.

**COD-specific inventory consumption decision:** For COD, `consume()` is called INSIDE the order creation `$transaction`. For online payments, `consume()` is called INSIDE the payment confirmation `$transaction` (when webhook arrives). This is the critical distinction.

**AI-agent implementation implications:**
```typescript
// COD path — consume inside order $transaction:
await prisma.$transaction(async (tx) => {
  const order = await tx.order.create({...});
  await tx.orderItem.createMany({...});
  for (const reservation of reservations) {
    await inventoryService.consume(reservation.id, userId, tx); // ← consume inside tx
  }
  await tx.orderStatusHistory.create({ statusTo: 'CONFIRMED' });
  await tx.eventOutbox.create({ eventType: 'OrderCreated' });
  await tx.eventOutbox.create({ eventType: 'OrderConfirmed' });
});

// Online payment path — consume inside payment $transaction (later):
// Order $transaction: creates order in PLACED state (reservations held, not consumed)
// Payment $transaction (webhook): consume + confirm order + emit events
```

---

## §D5 — SAGA ORCHESTRATION STRATEGY

### Decision

**In-process saga orchestration (not distributed). OrderService is the saga coordinator. Compensation is explicit and idempotent. No choreography. No Saga framework library.**

---

### D5.1 — Choreography vs Orchestration

**Decision:** **Orchestration** (not choreography). `OrderService` is the explicit saga coordinator. It calls `InventoryService.reserve()`, creates the order, then coordinates with `PaymentService`. Compensation is explicit: `OrderService` calls `InventoryService.releaseAllForOrder()` on failure.

**Why chosen:**
- Choreography requires event-driven coordination across services. In a modular monolith, this means EventEmitter-based coordination — which creates invisible coupling and hard-to-debug failure paths.
- Orchestration gives explicit, readable compensation logic in one place. When something goes wrong at 3AM, the developer reads `OrderService.createOrder()` top-to-bottom to understand what happened.
- Sprint 3 §18.1 explicitly describes the Sprint 4 pattern as "Saga coordination via direct service calls within same process."

**Alternative rejected:** Choreography via EventEmitter — creates invisible coupling, hard to test, harder to add steps.

**Sprint 5+ implications:** When extracted to microservices (Phase 3), OrderService becomes a saga orchestrator that calls InventoryService via HTTP and PaymentService via HTTP. The in-process calls become HTTP calls. The compensation logic is unchanged.

---

### D5.2 — Saga Coordinator Philosophy

**Decision:** `OrderService` coordinates the checkout saga explicitly:
```
Step 1: Validate cart items (read path)
Step 2: reserve() all items (forward action — compensation: release())
Step 3: create order $transaction (forward action — compensation: releaseAllForOrder())
Step 4: initiate payment (forward action — compensation: on webhook failure, releaseAllForOrder())
Step 5: consume() on payment confirmation (forward action — no compensation; terminal commit)
```

If any step fails, the coordinator compensates all prior steps.

---

### D5.3 — Compensation Trigger Rules

**Decision:**

| Failure Point | Compensation Action |
|---|---|
| Validation fails before reserve | No compensation needed (nothing touched) |
| reserve() fails for item N, items 1..N-1 succeeded | `releaseAllForOrder(orderId, 'ORDER_FAILED')` |
| Order `$transaction` fails after all reserves | `releaseAllForOrder(orderId, 'ORDER_FAILED')` |
| Payment initiation fails (gateway error) | Order stays `PLACED`. Buyer retries payment. 30-min expiry triggers `CANCELLED`. |
| Payment webhook `payment.failed` received | `releaseAllForOrder(orderId, 'PAYMENT_FAILED')`, Order → `PAYMENT_FAILED` |
| Payment retry expiry (30-min window expires) | `releaseAllForOrder(orderId, 'ORDER_CANCELLED')`, Order → `CANCELLED` |
| Order cancelled by buyer/admin | `releaseAllForOrder(orderId, 'ORDER_CANCELLED')` |

---

### D5.4 — Retry Semantics

**Decision:** Sprint 4 does NOT implement application-level retry in the checkout saga. Idempotency keys handle retries at the HTTP level. Internal retries (concurrency conflicts) are handled by `InventoryService.reserve()` internally (Sprint 3 guarantees). The saga coordinator does not retry failed reservations — it compensates and returns an error.

**Why chosen:** Application-level retry in a multi-step saga amplifies complexity. Idempotency + idempotent compensation is simpler and safer.

---

### D5.5 — Timeout Semantics

**Decision:**
- Order `$transaction` timeout: 10 seconds (longer than inventory `$transaction` 5s because it includes more operations).
- Payment initiation timeout: 30 seconds (Razorpay API call — per runtime architecture §1.5).
- Payment confirmation: no timeout (webhook-based, asynchronous).
- `PaymentReconciliationWorker` treats orders as PAYMENT_FAILED if no webhook received within 30 minutes.

---

### D5.6 — Failure Escalation Rules

**Decision:**
- Single payment failure: → `PAYMENT_FAILED` state, buyer retry window.
- Payment gateway unavailable (consecutive failures): Alert ops. COD should still work.
- Inventory release failure during compensation: CRITICAL log, ops page. Order is still cancelled. Reconciliation catches inventory drift.
- `$transaction` timeout during order creation: Auto-rollback → inventory was reserved but order not created → orphaned reservations → cleaned by expiry worker (Sprint 3 guarantee).

---

### D5.7 — Replay Safety

**Decision:** ALL saga steps are replay-safe via idempotency keys:
- `reserve()`: idempotency key = `order-${orderId}-product-${productId}` (Sprint 3 contract).
- Order creation: idempotency key = `order-${cartId}-${userId}`.
- Payment initiation: idempotency key = client-provided `Idempotency-Key` header.
- Webhook processing: idempotency key = `webhook-${razorpayEventId}`.

---

### D5.8 — Idempotency Guarantees

**Decision:** Every mutating operation in the checkout saga has an idempotency key. Keys are deterministic (no timestamps, no random values). Stored in Redis after the corresponding `$transaction` commits.

---

### D5.9 — consume() Orchestration Timing

**Decision:**

| Payment Method | `consume()` Timing |
|---|---|
| COD | Inside order creation `$transaction` (immediate) |
| Online (Razorpay) | Inside `WebhookProcessorWorker` `$transaction` on `payment.captured` webhook |
| Payment retry success | Inside retry payment `$transaction` |

`consume()` always receives `tx` from the calling `$transaction` — it never opens its own `$transaction` (Sprint 3 §18.3 mandate).

---

## §D6 — RESERVATION CONSUMPTION STRATEGY

### Decision

**consume() happens at payment capture (or immediate for COD). release() is always compensation. Expiry worker is the ultimate safety net. All paths are idempotent.**

---

### D6.1 — When consume() Happens (Locked)

```
COD:            Inside order creation $transaction (PLACED → CONFIRMED immediately)
Online payment: Inside WebhookProcessorWorker $transaction on payment.captured event
Payment retry:  Inside retry payment $transaction on successful capture
```

`consume()` moves `InventoryReservation.status` from `ACTIVE` to `CONSUMED`. It also emits `InventoryConsumed` event to EventOutbox (dedup key: `inv-consumed-{reservationId}`).

---

### D6.2 — When release() Happens

```
ORDER_CANCELLED:     InventoryService.releaseAllForOrder(orderId, 'ORDER_CANCELLED', actorId)
PAYMENT_FAILED:      InventoryService.releaseAllForOrder(orderId, 'PAYMENT_FAILED', actorId)
PAYMENT_RETRY_EXPIRED: InventoryService.releaseAllForOrder(orderId, 'ORDER_CANCELLED', 'SYSTEM')
RESERVATION_EXPIRED: Sprint 3 ReservationExpiryWorker (automatic, TTL-based — 15min default)
```

All release() calls are idempotent (Sprint 3 guarantee): calling release() on an already-released reservation returns `{ alreadyReleased: true }` — never throws.

---

### D6.3 — Payment-Failure Behavior

**Decision:** On `payment.failed` webhook: `WebhookProcessorWorker` calls `InventoryService.releaseAllForOrder()`. Sequential release (not parallel) to avoid DB contention. Each individual release is wrapped in try/catch — one failure does not block others (Sprint 3 §20.2 pattern).

---

### D6.4 — Timeout Behavior

**Decision:** If no webhook received within 30 minutes of payment initiation: `PaymentReconciliationWorker` calls Razorpay API (`getPaymentStatus()`). If status is `failed` or `expired` → trigger same payment failure flow. If status is `pending` → wait another 5 minutes. After 30 minutes total: force `PAYMENT_FAILED` and release inventory.

**Why 30 minutes:** Razorpay UPI payments can legitimately take up to 30 minutes for completion on slow networks (common in rural India). 10 minutes would create false failures.

---

### D6.5 — Orphan Reservation Prevention

**Decision:** Three layers prevent orphaned reservations (reservations without a corresponding order):
1. **Application layer:** OrderService explicitly calls `releaseAllForOrder()` on any `$transaction` failure.
2. **TTL layer:** All reservations have `expiresAt` (server-computed, 15min for ORDER context). Sprint 3 `ReservationExpiryWorker` cleans these automatically.
3. **Reconciliation layer:** Sprint 3 `InventorySnapshotWorker` detects drift between actual stock and sum of movements.

**AI-agent implementation implications:** Even if release() is not called explicitly (process crash scenario), the Sprint 3 expiry worker guarantees cleanup within 5–20 minutes. This is the safety net, not the primary path.

---

## §D7 — RFQ WORKFLOW BOUNDARIES

### Decision

**Foundation-only in Sprint 4. RFQ full workflow (quote submission, comparison, negotiation) is Sprint 8. Sprint 4 plants the reservation and order foundations that RFQ will build on.**

---

### D7.1 — RFQ Inside Sprint 4 or Not

**Decision:** RFQ is **NOT** in Sprint 4. Sprint 4 plants foundation that makes Sprint 8 RFQ safe:

| Foundation Element | Sprint 4 Action | Sprint 8 Usage |
|---|---|---|
| `orderType: 'RFQ'` in `ReserveInventorySchema` | Already defined in Sprint 3 DTO (§21) | Used when RFQ converts to order |
| RFQ TTL in `computeReservationTtl()` | TTL = up to 86400s for RFQ order type | RFQ reservations can hold for 24h |
| `orderContext: 'RFQ'` in `InventoryReservation` | Field exists from Sprint 3 §9.3 | Tagged for audit/reporting |
| `Quotation` DB model | In schema v4.3 — NOT activated | Activated in Sprint 8 |

**Why deferred:** Sprint 4 is already the most complex sprint in the roadmap. Adding RFQ (multi-party approval, quote comparison, negotiation) would make it undeliverable in 2 weeks. RFQ is Sprint 8.

---

### D7.2 — RFQ-to-Order Relationship

**Decision (for Sprint 8 preparation):** An RFQ-converted order is a `createOrder()` call with `source: 'RFQ'` and `rfqId: quotationId`. The order creation saga is identical to a regular order. The inventory reservation uses `orderType: 'RFQ'` (longer TTL). The `Quotation` record is linked via `orderId` on conversion.

**Sprint 4 implication:** `CreateOrderDto` must include `source: z.enum(['CART', 'RFQ']).default('CART')` and `rfqId: z.string().cuid().optional()`. This field is unused in Sprint 4 but prepares the API for Sprint 8 without a breaking change.

---

### D7.3 — Quote Lifecycle Assumptions

**Decision (for Sprint 8 design):** Quote states: `DRAFT → SUBMITTED → ACCEPTED → CONVERTED | REJECTED | EXPIRED`. Quote expiry is TTL-based (validUntil field). Quote acceptance triggers `createOrder()` via the existing Sprint 4 API.

---

### D7.4 — Future Procurement Workflow Extensibility

**Decision:** The `orderType` field in `ReserveInventorySchema` (`'CART' | 'ORDER' | 'RFQ'`) is the extensibility hook. Future procurement types (purchase orders, tender responses, blanket orders) add new enum values here without changing service logic.

---

## §D8 — MULTI-SELLER & SPLIT ORDER STRATEGY

### Decision

**Single logical order for buyer, multi-seller at data model level, split fulfillment in Sprint 5, split payment deferred to Phase 2.**

---

### D8.1 — Single Seller vs Multi-Seller Checkout

**Decision:** Sprint 4 supports multi-seller checkout as a single logical order. The buyer sees one order number. Each `OrderItem` carries `sellerId`. Inventory reservations are per-product-per-seller.

**Why chosen:** Schema v4.3 already models this. Forcing single-seller carts would prevent large B2B buyers from consolidating procurement across multiple suppliers.

**Seller visibility:** Sprint 5 introduces seller-specific order views. Sprint 4 only establishes the data model.

---

### D8.2 — Split Shipment Preparation

**Decision:** Sprint 4 creates data foundations for split shipment:
- `OrderItem.sellerId` populated at order creation.
- `OrderItem.status` (per-item status) is in schema v4.3.
- Sprint 5 activates per-seller shipment tracking.
- Sprint 4 does NOT implement per-seller `SHIPPED` status (that requires Sprint 5 seller dashboard).

---

### D8.3 — Split Payment Preparation

**Decision:** Split payment (different payment amounts going to different sellers) is Phase 2 (Razorpay Route). Sprint 4 treats the order as a single payment. Platform commission and seller payout are calculated in Sprint 7.

**Sprint 4 implication:** `Payment` record is for the full order amount. No seller-level payment records in Sprint 4.

---

### D8.4 — Future Warehouse Routing Preparation

**Decision:** `OrderItem.warehouseId` is null in Sprint 4. Warehouse routing (assigning items to specific warehouses for fulfillment) is deferred to Phase 2 (warehouse service extraction).

**Sprint 4 preparation:** No warehouse logic. But `sellerId` on `OrderItem` creates the routing anchor for future warehouse assignment.

---

### D8.5 — Fulfillment Decomposition Strategy

**Decision:** Sprint 4 creates one `OrderTracking` record per order (not per item). Sprint 5 may decompose to per-seller tracking. Sprint 4 `OrderTracking` has `sellerId` field to enable this decomposition in Sprint 5 without schema changes.

---

## §D9 — FUTURE ERP & MICROSERVICE READINESS

### Decision

**Sprint 4 must be extractable into separate services without application code changes. All integration points are abstracted. EventOutbox is the ERP integration bus.**

---

### D9.1 — ERP Sync Readiness

**Decision:** All `OrderCreated`, `OrderConfirmed`, `OrderStatusChanged`, `PaymentReceived` events are published to EventOutbox with full payload. An ERP sync consumer (Sprint 9 / Phase 2) can subscribe to these events without any changes to Sprint 4 code.

**Sprint 4 implementation:** No ERP calls in Sprint 4. EventOutbox is the integration bus by design. ERP consumers are Sprint 9+ concern.

**Required event payloads (must include):**
- `OrderCreated`: `orderId, buyerId, sellerId(s), items[], totalAmount, segment, address`
- `OrderConfirmed`: `orderId, paymentMethod, paymentId, confirmedAt`
- `PaymentReceived`: `orderId, paymentId, amount, gatewayTxnId, method`

---

### D9.2 — Warehouse Service Readiness

**Decision:** `OrderItem.warehouseId` is null in Sprint 4. `OrderService` has a `resolveWarehouse()` method stub that returns null. Phase 2 fills this in with warehouse routing logic. The stub method is the extraction hook.

---

### D9.3 — Payment Service Extraction Readiness

**Decision:** `PaymentProvider` interface is the extraction boundary. When PaymentService becomes a microservice: `PaymentProvider.createOrder()` becomes an HTTP call to the payment microservice. Zero `OrderService` changes required.

---

### D9.4 — Order Service Extraction Readiness

**Decision:** `OrderService` is already package-boundary isolated (Sprint 3 §10 principle). It imports `InventoryService` (from `InventoryModule.exports`), `PaymentProvider` (interface), and `PrismaService`. When extracted: InventoryService becomes HTTP, PaymentProvider is already abstracted. `EventOutbox` events become Kafka topics.

---

### D9.5 — Notification Service Readiness

**Decision:** Sprint 4 emits `OrderCreated`, `OrderConfirmed`, `PaymentReceived`, `PaymentFailed` to EventOutbox. Sprint 6 `NotificationWorker` consumes these. No coupling between Sprint 4 order logic and Sprint 6 notification logic. EventOutbox is the decoupling layer.

---

### D9.6 — Reconciliation Service Readiness

**Decision:** `Payment` table has all fields needed for future reconciliation: `gatewayOrderId`, `gatewayPaymentId`, `amount`, `currency`, `status`, `capturedAt`, `failedAt`, `refundedAt`. A reconciliation microservice (Phase 2) reads this table directly or via EventOutbox.

---

## §D10 — OPERATIONAL RESILIENCE

### Decision

**COD as zero-dependency fallback, idempotency at every layer, reconciliation worker for missed webhooks, dead-letter queue for failed jobs, observability-first design.**

---

### D10.1 — Degraded-Mode Checkout Behavior

| Component Failure | Impact | Degraded Behavior |
|---|---|---|
| Redis unavailable | Inventory uses DB-only locking (Sprint 3 DEGRADED mode) | COD checkout still works. Online payment idempotency check fails → 503 retryable |
| Razorpay unavailable | Online payment initiation fails | COD automatically offered. Error: "Online payment unavailable — COD available" |
| BullMQ unavailable | Webhook worker queue unavailable | Webhook returns 503 — Razorpay retries. ReconciliationWorker catches on next run |
| DB unavailable | All writes fail | API returns 503. Load balancer routes to healthy containers |
| PaymentReconciliation worker down | Missed webhooks not caught | Alert ops within 15 minutes (Grafana: `payment_reconciliation_missed_total > 10`) |

---

### D10.2 — Partial Failure Handling

**Decision:** If reserve() succeeds for items 1..N-1 but fails for item N: ALL prior reserves are released (`releaseAllForOrder()` called sequentially, isolated try/catch per release). Buyer receives clear error: "Kuch items available nahi hain — kuch baad mein try karein."

---

### D10.3 — Retry Storm Prevention

**Decision:** 
- No application-level retry loops in checkout saga. Idempotency keys handle HTTP-level retries.
- Razorpay webhook retries handled by Redis idempotency (dedup key TTL 24h).
- BullMQ worker retries: max 3 attempts, exponential backoff (2s, 4s, 8s). After 3 failures → DLQ.
- `PaymentReconciliationWorker`: max 0 retries (cron job — next run in 5 minutes handles any failure).

---

### D10.4 — Dead-Letter Philosophy

**Decision:**
- `PaymentWebhookProcessorWorker` DLQ: alert ops immediately. Unprocessed webhook = unconfirmed order.
- `PaymentRetryExpiryWorker` DLQ: alert ops. Expired orders not transitioned = inventory not released.
- All DLQ jobs include full payload for manual replay.
- DLQ alert threshold: > 5 jobs in DLQ → `CRITICAL` alert.

---

### D10.5 — Reconciliation Requirements

**Decision:** Three reconciliation mechanisms:
1. **Payment reconciliation** (every 5 min): `PaymentReconciliationWorker` polls Razorpay for `PENDING` payments > 10 min old.
2. **Inventory reconciliation** (Sprint 3 hourly): Catches any inventory drift from failed compensations.
3. **Order state reconciliation** (daily): Admin exception center (Sprint 7) finds stuck orders. Sprint 4 seeds this with the state machine.

---

### D10.6 — Observability Requirements

**Sprint 4 Required Metrics:**

```
order_created_total{payment_method, segment}
order_confirmed_total{payment_method}
order_cancelled_total{reason, actor}
order_payment_failed_total{reason}
checkout_funnel_step_total{step}           ← add-to-cart, checkout-start, payment-start, confirmed
payment_initiated_total{provider}
payment_success_total{provider}
payment_failed_total{provider, reason}
payment_webhook_received_total{event_type}
payment_webhook_duplicate_total
payment_webhook_invalid_signature_total    ← alert if > 0
payment_reconciliation_missed_total        ← caught by reconciliation worker
payment_reconciliation_latency_ms
cart_item_count{segment}
cart_abandonment_total
```

**Required alerts:**
- `payment_webhook_invalid_signature_total > 0` → CRITICAL (possible attack)
- `payment_failed_total > 5% of payment_initiated_total` (5-min window) → CRITICAL
- `payment_reconciliation_missed_total > 10` (single run) → WARNING
- `order_stuck_in_placed > 30min` → WARNING (webhook delivery issue)
- `payment_webhook_queue_depth > 1000` → CRITICAL (worker falling behind)

---

### D10.7 — Stuck-Order Recovery Strategy

**Decision:**
- Orders stuck in `PLACED` > 30 minutes: `PaymentReconciliationWorker` handles.
- Orders stuck in `PLACED` > 24 hours: Exception center (Sprint 7 admin) flags for manual review.
- Sprint 4 provides: `GET /admin/orders?status=PLACED&stuckSince=30min` API (admin-only, Sprint 7 uses it).

---

## §D11 — SECURITY & FRAUD PREPARATION

### Decision

**Webhook HMAC validation is mandatory. Idempotency at every layer. Anti-double-charge protection. Checkout throttling at rate-limiter level.**

---

### D11.1 — Webhook Signature Validation

**Decision:** MANDATORY. No webhook is processed without valid HMAC-SHA256 signature verification. Invalid signature → `400` immediately. Zero exceptions.

Implementation:
```typescript
// MUST use crypto.timingSafeEqual — not string comparison (timing attack)
const expectedSignature = crypto
  .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
  .update(rawBody)
  .digest('hex');
const isValid = crypto.timingSafeEqual(
  Buffer.from(signature),
  Buffer.from(expectedSignature)
);
if (!isValid) throw new BadRequestException({ code: 'INVALID_WEBHOOK_SIGNATURE' });
```

**Alert:** `payment_webhook_invalid_signature_total > 0` → immediate CRITICAL alert. Invalid signatures indicate either a misconfigured webhook or an active attack.

---

### D11.2 — Payment Replay Protection

**Decision:**
- Razorpay event idempotency: `webhook-{razorpayEventId}` in Redis (TTL 24h). First-write-wins (NX).
- Order creation idempotency: `order-${cartId}-${userId}` in Redis (TTL 1h).
- Payment initiation idempotency: client-provided `Idempotency-Key` header, stored in Redis (TTL 24h).

---

### D11.3 — Idempotency-Key Policy

**Decision:**

| Operation | Idempotency Key | TTL | Required |
|---|---|---|---|
| `POST /orders` | `order-{cartId}-{userId}` (or client-provided) | 1h | MANDATORY |
| `POST /payments/initiate` | Client-provided header | 24h | MANDATORY |
| `POST /payments/webhook` | `webhook-{razorpayEventId}` | 24h | Internal |
| `POST /orders/:id/cancel` | `cancel-{orderId}-{actorId}` | 1h | Recommended |
| `POST /payments/retry` | `payment-retry-{orderId}-{attempt}` | 24h | Internal |

Requests to `POST /orders` or `POST /payments/initiate` without `Idempotency-Key` header → `400 IDEMPOTENCY_KEY_REQUIRED`.

---

### D11.4 — Anti-Duplicate-Order Strategy

**Decision:**
- **Client-side:** Disable submit button immediately on first click.
- **Server-side:** Order idempotency key (1h TTL) prevents duplicate orders from same cart.
- **Semantic duplicate detection:** If same `userId + cartId` has placed an order in the last 5 minutes → warn buyer (not block — buyer may genuinely want two orders).

---

### D11.5 — Anti-Double-Payment Strategy

**Decision:**
- Payment idempotency key prevents duplicate payment initiations.
- `Payment.idempotencyKey` has UNIQUE constraint in DB (idx_pay_idem_key — Tier 1).
- If webhook fires twice for same `razorpayEventId` → Redis dedup key returns cached result, no second processing.
- If same Razorpay payment ID captured twice → DB UNIQUE constraint on `Payment.gatewayPaymentId` prevents duplicate `CAPTURED` records.

---

### D11.6 — Abuse Prevention

**Decision:**
- Cart add-to-cart: 50 items/minute per user via rate limiter (Redis counter).
- Checkout initiation: 10/hour per user (prevents automated checkout abuse).
- Payment initiation: 5/hour per user.
- All rate limits use Redis INCR (atomic) — same pattern as Sprint 3 abuse guard.

---

### D11.7 — Checkout Throttling

**Decision:** `POST /orders` is rate-limited to 5 attempts per user per hour. Excessive order attempts (bot behavior) → `429 CHECKOUT_RATE_LIMIT_EXCEEDED`. Alert if any user hits this limit (fraud signal).

---

### D11.8 — OTP Re-Verification for High-Value Payments

**Decision:** Payments > ₹50,000 require OTP re-verification (from the roadmap §12 security requirements). Sprint 4 implementation: `POST /payments/initiate` checks `order.totalAmount > 50000 && request.headers['x-reauth-token']`. If amount > threshold and no reauth token → `403 REAUTH_REQUIRED`. Frontend triggers OTP flow, receives reauth token, retries payment initiation.

**AI-agent implementation implications:** `ReauthTokenService` creates a short-lived (5-minute) Redis token after OTP verification. Consumed once by payment initiation.

---

## §D12 — FUTURE SCALABILITY ASSUMPTIONS

### Decision

**Sprint 4 builds for current scale (500 concurrent users, 50 orders/minute) with architectural patterns that scale to 10x without rewrites.**

---

### D12.1 — Orders at Scale

**Decision:**
- `Order.orderMonth` partition key MUST be set at order creation (already in schema v4.3). Format: `YYYY-MM`.
- `OrderItem` partitioning by `orderId` (future, Phase 2 — cursor pagination already handles current scale).
- All order queries are scoped by `buyerId` or `sellerId` + indexed (never full table scans).

**Scalability path:** At 1M orders/month, partition by `orderMonth`. Current PostgreSQL handles this without partitioning up to ~10M orders.

---

### D12.2 — High-Concurrency Checkout

**Decision:** Sprint 4 does not implement queue-based checkout (wait rooms). The Sprint 3 hot-product detection (`inv_hot_product` counter) is the signal for Phase 2 queue-based checkout. At current scale (50 orders/min), synchronous checkout with Sprint 3 locking is sufficient.

**Monitoring:** If `inventory_hot_product_detected` fires for any product consistently → Phase 2 queue-based checkout prioritized.

---

### D12.3 — High-Payment Concurrency

**Decision:** Razorpay API handles 1000+ payments/second natively. Sprint 4 bottleneck is DB writes (Payment record + Order update). Mitigated by: payment idempotency Redis cache prevents duplicate DB writes, `Payment` table indexes on `orderId` and `idempotencyKey`.

**Scalability path:** `Payment` table partitioned by `paymentMonth` in Phase 2 if volume justifies.

---

### D12.4 — OpenSearch Integration Preparation

**Decision:** Sprint 4 emits `OrderCreated` and `OrderConfirmed` events to EventOutbox. An OpenSearch indexer (Phase 2) can consume these for order analytics without any Sprint 4 changes.

**Sprint 4 implication:** EventOutbox event payloads must be comprehensive (include all fields that analytics would need). Don't strip fields from event payloads.

---

### D12.5 — Queue Scaling

**Decision:** Sprint 4 uses two BullMQ queues:
1. `payments` queue: `PaymentWebhookProcessorWorker` + `PaymentReconciliationWorker` + `PaymentRetryExpiryWorker`.
2. `orders` queue: `PaymentRetryExpiryWorker` (order lifecycle crons).

Queue naming follows Sprint 0 BullMQ registration pattern. All cron jobs use stable `jobId` (Sprint 3 §22 pattern — prevents duplication on restart).

**Scalability path:** Separate `payments-webhooks` and `payments-reconciliation` queues in Phase 2 for independent scaling.

---

### D12.6 — Async Orchestration Scaling

**Decision:** Sprint 4's synchronous checkout is sufficient for MVP scale. Phase 2 evolution: if checkout p95 > 2s under load, decompose into:
1. Sync: validate + reserve + create order (< 500ms).
2. Async: payment initiation via BullMQ (buyer polls for payment URL).

Sprint 4 `POST /orders` architecture does not prevent this evolution (the async decomposition is additive, not a rewrite).

---

## SPRINT 4 MODULE BOUNDARY DECISIONS

### Module Structure (Locked for Sprint 4 Architecture)

```
apps/api/src/modules/
├── order/
│   ├── cart/
│   │   ├── cart.module.ts
│   │   ├── cart.controller.ts
│   │   ├── cart.service.ts
│   │   ├── cart.repository.ts
│   │   └── tests/
│   └── orders/
│       ├── orders.module.ts
│       ├── orders.controller.ts
│       ├── orders.service.ts         ← Saga coordinator
│       ├── orders.repository.ts
│       ├── order-status-history.repository.ts  ← APPEND-ONLY
│       └── tests/
├── payment/
│   ├── payment.module.ts
│   ├── payment.controller.ts
│   ├── payment.service.ts
│   ├── payment.repository.ts
│   ├── providers/
│   │   ├── payment-provider.interface.ts
│   │   ├── razorpay.provider.ts
│   │   └── cod.provider.ts
│   ├── webhook.controller.ts          ← Separate, raw body
│   └── workers/
│       ├── payment-webhook-processor.worker.ts
│       ├── payment-reconciliation.worker.ts
│       └── payment-retry-expiry.worker.ts
│   └── tests/

packages/types/src/
├── cart/
│   └── cart.schemas.ts
├── order/
│   └── order.schemas.ts
└── payment/
    └── payment.schemas.ts
```

### Module Boundary Rules (Locked)

```
OrderModule OWNS: Cart, CartItem, Order, OrderItem, OrderTracking, OrderStatusHistory
OrderModule EXPORTS: [OrderService, CartService]
OrderModule IMPORTS: InventoryModule (for InventoryService), PaymentModule (for PaymentService)

PaymentModule OWNS: Payment
PaymentModule EXPORTS: [PaymentService]
PaymentModule IMPORTS: OrderModule (forwardRef — circular: Payment updates Order status)

InventoryModule EXPORTS: [InventoryService] — consumed by OrderModule
OrderModule NEVER: writes to Inventory, InventoryReservation, InventoryMovement directly

OrderStatusHistoryRepository: APPEND-ONLY (no update/delete methods — same as InventoryMovement)
```

---

## SPRINT 4 REDIS KEY REGISTRY (LOCKED)

```
cart:{userId}:{segment}                     TTL=60s     Display cache. OrderService reads DB directly.
order_idem:{cartId}:{userId}                TTL=3600s   Order creation idempotency
payment_idem:{clientKey}                    TTL=86400s  Payment initiation idempotency
webhook_idem:{razorpayEventId}              TTL=86400s  Webhook deduplication
payment_retry_window:{orderId}              TTL=1800s   30-min retry window flag
reauth:{token}                             TTL=300s    High-value payment re-verification
checkout_rate:{userId}                      TTL=3600s   Checkout throttle counter (INCR)
cart_rate:{userId}                         TTL=60s     Cart add-to-cart rate limit counter
```

---

## SPRINT 4 EVENTOUTBOX DEDUPLICATION KEYS (LOCKED)

```
OrderCreated:      order-created-{orderId}
OrderConfirmed:    order-confirmed-{orderId}
OrderCancelled:    order-cancelled-{orderId}-{cancellationId}
PaymentInitiated:  payment-initiated-{paymentId}
PaymentReceived:   payment-received-{paymentId}
PaymentFailed:     payment-failed-{paymentId}
CartAbandoned:     cart-abandoned-{cartId}       (future Sprint 5 reorder signal)
```

**Rule:** All keys are deterministic. Zero `Date.now()`, `new Date()`, or `randomUUID()` in any `deduplicationKey`. (Sprint 3 §6 law — inherited.)

---

## SPRINT 4 TRANSACTION BOUNDARY GOVERNANCE

The Sprint 3 §3 transaction boundary rule applies identically to Sprint 4:

```
PERMITTED inside $transaction:
  ✅ DB reads/writes via tx
  ✅ inventoryService.consume(reservationId, actorId, tx)  ← passes tx through
  ✅ Synchronous computation

FORBIDDEN inside $transaction:
  ❌ Redis operations
  ❌ HTTP calls (Razorpay API, SMS, etc.)
  ❌ BullMQ queue.add()
  ❌ EventEmitter.emit()
  ❌ Any external I/O
```

**COD order creation transaction (correct pattern):**
```typescript
await prisma.$transaction(async (tx) => {
  const order = await tx.order.create({...});
  await tx.orderItem.createMany({...});
  for (const res of reservations) {
    await inventoryService.consume(res.id, userId, tx); // ← passes tx, no new tx opened
  }
  await tx.orderStatusHistory.create({ statusTo: 'CONFIRMED' });
  await tx.eventOutbox.create({ eventType: 'OrderCreated', deduplicationKey: `order-created-${order.id}` });
  await tx.eventOutbox.create({ eventType: 'OrderConfirmed', deduplicationKey: `order-confirmed-${order.id}` });
}, { timeout: 10000, isolationLevel: 'ReadCommitted' });
// ← Redis idempotency cache SET happens AFTER this resolves
```

---

## AI-AGENT MASTER IMPLEMENTATION WARNINGS (SPRINT 4)

These extend Sprint 3 §34 warnings. AI agents implementing Sprint 4 must internalize all Sprint 3 warnings PLUS these:

```
S4-W1 — consume() INSIDE $transaction, NOT before it
  COD: consume() is INSIDE the order $transaction (receives tx)
  Online: consume() is INSIDE the webhook processor $transaction (receives tx)
  FORBIDDEN: consume() called outside any $transaction without passing tx

S4-W2 — Razorpay SDK calls inside $transaction
  Calling razorpayClient.orders.create() inside prisma.$transaction = network call inside tx
  FORBIDDEN: ANY Razorpay SDK call inside $transaction
  REQUIRED: All Razorpay calls before or after $transaction

S4-W3 — Webhook raw body parsing
  Express JSON middleware will destroy the raw body needed for HMAC
  REQUIRED: express.raw() middleware on /payments/webhook BEFORE json middleware
  FORBIDDEN: JSON.parse(req.body) then verify signature on parsed body

S4-W4 — COD vs Online payment $transaction difference
  COD: consume() inside order creation $transaction (immediate consumption)
  Online: consume() inside webhook processor $transaction (deferred consumption)
  FORBIDDEN: Calling consume() outside any $transaction regardless of payment method

S4-W5 — release() sequential, not parallel
  releaseAllForOrder() releases reservations SEQUENTIALLY
  FORBIDDEN: Promise.all(reservations.map(r => release(r.id))) — DB contention
  REQUIRED: Sequential release with isolated try/catch per item

S4-W6 — Payment idempotency Redis NX timing
  Idempotency key must be SET AFTER the $transaction commits
  FORBIDDEN: SET before $transaction (if tx fails, idempotency key blocks retry)
  FORBIDDEN: SET inside $transaction (Redis call forbidden inside tx)

S4-W7 — Order status history append-only
  OrderStatusHistoryRepository MUST have zero update() or delete() methods
  Same pattern as InventoryMovementRepository (Sprint 3 INV-7)
  Grep verification: grep 'update\|delete' order-status-history.repository.ts → ZERO

S4-W8 — Cart pricing — never trust client
  Cart totals and unit prices are ALWAYS computed server-side
  FORBIDDEN: Using any price value from request body for order calculation
  REQUIRED: Price fetched from Inventory.price at createOrder() time

S4-W9 — Duplicate webhook processing
  Without idempotency: Razorpay sends 5+ webhooks → 5x order confirmations → 5x consume() calls
  REQUIRED: webhook-{razorpayEventId} Redis NX check as FIRST operation in webhook handler
  REQUIRED: Check before queueing, not after

S4-W10 — Cron stable jobId (inherited from Sprint 3 §34 Warning 11)
  All Sprint 4 cron workers must use stable jobId
  REQUIRED: jobId: 'payment-reconciliation-cron', jobId: 'payment-retry-expiry-cron'
  FORBIDDEN: No jobId → duplicate crons on every API restart
```

---

## SPRINT 4 VALIDATION GATE (PRE-GENERATION LOCK)

Before Sprint 4 architecture generation begins, confirm:

```
[ ] All 12 scope decision domains reviewed and approved
[ ] Cart philosophy (persistent, no guest, no cart-time reservation) — APPROVED
[ ] Checkout philosophy (orchestrated, pre-validate then reserve) — APPROVED
[ ] Order lifecycle (9 states, immutable history) — APPROVED
[ ] Payment philosophy (sync initiate, async confirm, COD fallback) — APPROVED
[ ] Saga strategy (in-process orchestration, OrderService coordinator) — APPROVED
[ ] Reservation consumption (COD: immediate, Online: on webhook) — APPROVED
[ ] RFQ boundaries (deferred to Sprint 8, foundation planted) — APPROVED
[ ] Multi-seller strategy (unified order, split data) — APPROVED
[ ] ERP readiness (EventOutbox as integration bus) — APPROVED
[ ] Operational resilience (COD fallback, reconciliation, DLQ) — APPROVED
[ ] Security decisions (HMAC mandatory, idempotency everywhere) — APPROVED
[ ] Scalability assumptions (current scale, Phase 2 evolution paths clear) — APPROVED
```

---

## WHAT SPRINT 4 EXPLICITLY DOES NOT INCLUDE

| Feature | Deferred To |
|---|---|
| Seller order management UI | Sprint 5 |
| Order tracking UI | Sprint 5 |
| Split payment (Razorpay Route) | Phase 2 |
| Return/refund workflow | Sprint 8 |
| RFQ full workflow | Sprint 8 |
| Invoice PDF generation | Sprint 7 |
| Seller payout calculation | Sprint 7 |
| Credit/khata payment | Phase 3 |
| Multi-segment cart | Phase 2 |
| Guest cart | Phase 2 |
| Warehouse routing | Phase 2 |
| ERP direct integration | Phase 2 |
| WebSocket real-time order updates | Phase 2 |
| Buyer credit limit management | Phase 3 |
| Partial checkout | Phase 2 |
| Approval chains for orders | Phase 2 |

---

*END OF SPRINT 4 SCOPE DECISIONS v1.0*

*This document is the authoritative architectural assumption lock for Sprint 4.*
*Sprint 4 Architecture Generation does NOT begin until this document is approved.*
*Every decision here builds on Sprint 1–3 frozen guarantees — it does not replace them.*
