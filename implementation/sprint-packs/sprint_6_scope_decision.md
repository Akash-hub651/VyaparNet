# SPRINT_6_SCOPE_DECISIONS.md

## VyaparNet — Notification Platform

### Version: v1.0 — FINAL SCOPE DECISIONS
### Authority: Enterprise Product Decision Board + Principal Marketplace Architect + Notification Platform Design Authority
### Sprint 5 Handoff: FINAL AUDIT FREEZE — Build 0 errors, 172 files, all invariants verified
### Status: APPROVED FOR SPRINT 6 ARCHITECTURE GENERATION

---

> **HOW TO USE THIS DOCUMENT**
> Read §E1 (Executive Summary) first for intent.
> Read §D (Scope Decisions) for what is IN and OUT.
> Read §CH (Channel Decisions) for delivery architecture.
> Read §EV (Event Decisions) for event consumption.
> Read §UX (UX Decisions) for user experience rules.
> Read §SEC (Security) for security constraints.
> Read §SC (Scale) for architecture permanence.
> Read §FC (Future Compatibility) for Sprint 7–9 readiness.
> Read §AI (AI-Agent Safety) for implementation traps to avoid.
> Sprint 6 Architecture Generation uses this document as sole authority.

---

## TABLE OF CONTENTS

- §E1 — Executive Summary
- §D1 — Sprint Identity
- §D2 — Scope Inclusion Decisions
- §D3 — Scope Exclusion Decisions
- §D4 — Notification Ownership Decisions
- §CH — Channel Decisions
- §EV — Event Consumption Decisions
- §UX — User Experience Decisions
- §SEC — Security Decisions
- §SC — Scalability Decisions
- §FC — Future Sprint Compatibility Decisions
- §AI — AI-Agent Safety Decisions
- §DL — Decision Log
- §RA — Risks Accepted
- §RR — Risks Rejected
- §FV — Final Scope Verdict

---

## §E1 EXECUTIVE SUMMARY

Sprint 6 is the **trust fabric** of VyaparNet. Without notifications, buyers operate blind. Sellers miss orders. The commerce loop breaks.

Sprint 5 completed the action layer — both sides can act on their obligations. Sprint 6 closes the feedback loop — both sides know what happened, in real time, on the channel they prefer.

**Core insight from product analysis:**
India's B2B wholesale market runs on WhatsApp and phone calls. Buyers follow up on orders manually. Sellers miss confirmations. Sprint 6 replaces manual follow-up with automated, reliable, preference-respecting notification delivery. This is not a feature — it is a retention mechanism.

**Core architectural insight:**
Sprint 5's EventOutbox is loaded with events waiting to be consumed. Sprint 6 is the first consumer. The architecture was built for this sprint. Every Sprint 5 invariant was designed with Sprint 6 consumption in mind.

**Philosophy:**
- Reliability over real-time: a delayed notification is better than a duplicate or missing one
- Preference-first: every notification is gated by user preference
- Anti-spam as a first-class concern: one event, one notification, maximum
- Channel independence: SMS failure must never block In-App delivery

---

## §D1 SPRINT IDENTITY

| Property | Value |
|---|---|
| Sprint | 6 — Notification Platform |
| Objective | Reliable, preference-respecting, idempotent multi-channel notification delivery for all critical order and payment events |
| Inherits from | Sprint 1 (SMS/auth), Sprint 2 (S3), Sprint 3 (inventory events), Sprint 4 (order events), Sprint 5 (status change events) |
| Primary event sources | EventOutbox: OrderStatusChanged, SupplierScoreUpdated (Sprint 5), OrderCreated, PaymentReceived, PaymentFailed (Sprint 4) |
| New module | notification — completely new NestJS module |
| Existing modules modified | None — Sprint 6 is a pure consumer, not a mutator |
| New queues | notifications (BullMQ) |
| New DB models | Notification, NotificationTemplate (already in schema v4.3 — activation only). PushSubscription (new migration required) |

---

## §D2 SCOPE INCLUSION DECISIONS

### D2.1 — Notification Infrastructure (MANDATORY)

**INCLUDED:**

| Component | Decision | Rationale |
|---|---|---|
| NotificationModule | IN | New NestJS module — owns all notification logic |
| NotificationWorker (BullMQ) | IN | Async delivery — cannot block checkout or status transition path |
| OutboxConsumerWorker | IN | Polls EventOutbox PENDING events and routes to NotificationWorker |
| NotificationRepository | IN | Owns Notification table reads/writes — no other module accesses directly |
| TemplateService | IN | Renders notification bodies from templates + payload variables |
| DeduplicationService | IN | Redis-based: prevents duplicate sends within 5-minute window |
| Notification preference CRUD | IN | User controls which channels they receive per event type |
| Notification model activation | IN | Schema v4.3 already has this model — activation only |
| NotificationTemplate model + seed | IN | All event templates seeded in Hindi + English |

### D2.2 — Buyer Notifications (INCLUDED)

| Event | Notification | Channel(s) | Rationale |
|---|---|---|---|
| OrderCreated | "Order placed successfully" | SMS + In-App | Confirmation of purchase |
| OrderStatusChanged → CONFIRMED | "Seller ne aapka order accept kar liya" | SMS + In-App | Trust signal |
| OrderStatusChanged → PROCESSING | "Aapka order pack ho raha hai" | In-App only | Low urgency — informational |
| OrderStatusChanged → SHIPPED | "Order ship ho gaya — tracking: {number}" | SMS + In-App | High urgency |
| PaymentReceived | "Payment successful" | SMS + In-App | Financial confirmation — critical |
| PaymentFailed | "Payment fail ho gayi — retry karein" | SMS + In-App + Email | Financial urgency — all channels |
| Buyer-initiated cancellation | "Order cancel ho gaya" | In-App only | Buyer already knows |
| Seller-initiated cancellation | "Seller ne order cancel kiya" | SMS + In-App | Sprint 7 scope — deferred |

### D2.3 — Seller Notifications (INCLUDED)

| Event | Notification | Channel(s) | Rationale |
|---|---|---|---|
| New order (OrderCreated) | "Naya order aaya! {amount}" | SMS + In-App | Most critical — revenue |
| SupplierScoreUpdated (score improved ≥5 pts) | "Aapka score badh gaya!" | In-App only | Positive reinforcement |
| SupplierScoreUpdated (score dropped ≥5 pts) | "Aapka score gir gaya — dhyan dein" | SMS + In-App | Service quality alert |
| Low stock (StockLow — Sprint 3) | "Stock kam ho raha hai: {product}" | SMS + In-App | Operational alert |

### D2.4 — In-App Notifications (INCLUDED)

**Decision: YES — In-App is the primary persistence layer.**

All notifications are stored as Notification records in DB.

APIs:
- GET /notifications — unread list, cursor paginated, authenticated user only
- PATCH /notifications/:id/read — mark single as read
- PATCH /notifications/read-all — mark all as read
- GET /notifications/unread-count — badge count (polling-based, 30s interval)

### D2.5 — SMS Channel (INCLUDED — PRIMARY CHANNEL)

**Decision: YES — SMS is mandatory.**

India B2B context: SMS has 98% read rate. Reuses SmsService from Sprint 1 (MSG91/Twilio abstraction). No new SMS provider integration.

**SMS events (buyer):** OrderCreated, CONFIRMED, SHIPPED, PaymentReceived, PaymentFailed
**SMS events (seller):** OrderCreated (new order), score drop ≥5 pts, low stock

### D2.6 — Email Channel (INCLUDED — SECONDARY CHANNEL)

**Decision: YES — Email for transactional records only.**

Buyers (businesses) want paper trail. Transactional only — no marketing, no newsletters.

**Provider:** Resend (modern API, developer-friendly, good deliverability).

**Email events (buyer):** OrderCreated, PaymentReceived, PaymentFailed
**Email events (seller):** OrderCreated (new order — real-time, not daily digest)

**D2.6a — Seller email:** Single real-time email per new order. Daily digest deferred to Phase 2.

### D2.7 — Push Notifications (INCLUDED — TERTIARY CHANNEL)

**Decision: YES — Web Push for PWA.**

Standard Web Push API (RFC 8030). VAPID authentication. Library: web-push npm package.

**D2.7a — PushSubscription storage:** Separate PushSubscription table (new migration). Rationale: one user can have multiple subscribed devices. JSONB on User cannot support multi-device.

**Push events (high urgency only):** new order (seller), SHIPPED + PaymentFailed (buyer).

---

## §D3 SCOPE EXCLUSION DECISIONS

### D3.1 — WhatsApp Business API — EXCLUDED

**Decision: NO for Sprint 6.**

Reasons:
- WhatsApp Business API requires Facebook Business verification (2–4 weeks approval)
- Template message pre-approval required for each notification type (7–14 days each)
- Cost: ₹0.60–₹1.20/message vs ₹0.10–₹0.25 for SMS
- Volume not yet at scale to justify

**When to include:** Phase 2, when MAU > 10K and WhatsApp opt-in rate is validated.

### D3.2 — Email Marketing / Newsletters — EXCLUDED

Deferred to marketing product (Phase 3). Requires unsubscribe management, bounce monitoring, list infrastructure.

### D3.3 — Real-Time WebSocket Notifications — EXCLUDED

Polling GET /notifications/unread-count every 30 seconds is sufficient for MVP. Order events happen in minutes/hours, not seconds. WebSocket adds horizontal scaling complexity.

**When to include:** Sprint 9 or Phase 2 with real-time P2P chat.

### D3.4 — Push Notification Analytics — EXCLUDED

Delivery receipts, open rates, click-through tracking — Phase 2. Adds significant service worker complexity.

### D3.5 — Complex Notification Segmentation — EXCLUDED

Rules like "first-order buyer only" — Phase 2. Sprint 6 notifications are universal per preference.

### D3.6 — In-App Chat — EXCLUDED

Notification panel is NOT a chat interface — it is a one-way event log.

### D3.7 — Notification Analytics Dashboard — EXCLUDED

Grafana metrics sufficient for Sprint 6. User-facing analytics dashboard is Phase 2.

### D3.8 — SupplierScoreUpdated: Notification Threshold Gating

EventOutbox emits when score changes ≥1 point (INV-S5-18 — unchanged). However, NotificationWorker applies its own threshold:

**DECISION: Notify seller only when compositeScore changes ≥5 points.**

This is NOT a change to Sprint 5 event emission. It is a consumer-side filter in NotificationWorker.

---

## §D4 NOTIFICATION OWNERSHIP DECISIONS

### D4.1 — NotificationModule is a Pure Consumer

NotificationModule READS from EventOutbox. It NEVER writes to EventOutbox. It NEVER modifies Order, Inventory, or Payment models.

**Forbidden imports in NotificationModule:** OrderService, InventoryService, PaymentService, SellerOrderService, BuyerOrderService.

### D4.2 — EventOutbox Ownership Unchanged

Sprint 6 does NOT modify the EventOutbox writing path. OutboxConsumerWorker only reads PENDING events and marks them COMPLETED after successful BullMQ enqueue.

**The only EventOutbox write Sprint 6 performs:**
```
status = COMPLETED, processedAt = now()
```

### D4.3 — Notification Table Ownership

Only NotificationRepository reads from and writes to the Notification table. No other module may query Notification directly.

Sprint 7 Admin access path: NotificationModule exports a read-only AdminNotificationService, OR Sprint 7 creates its own AdminNotificationRepository. NOT via direct Prisma access from Admin module.

### D4.4 — User Contact Resolution

NotificationWorker uses a dedicated UserContactService (thin, read-only) — NOT importing UsersService from the auth module.

**UserContactService contract:**
```typescript
interface IUserContactService {
  getContact(userId: string): Promise<{
    phone: string | null;
    email: string | null;
    preferredLanguage: 'hi' | 'en';
    name: string | null;
  }>;
}
```

NotificationModule queries User table directly via Prisma for this data. NOT via importing UsersModule.

### D4.5 — NotificationPreference Ownership

**DECISION: Stored as JSONB field on User.notificationPreferences** (already in schema v4.3).

Default preference shape:
```typescript
{
  sms: { orderUpdates: true, paymentUpdates: true, scorecard: false, lowStock: true },
  email: { orderUpdates: true, paymentUpdates: true, lowStock: false },
  push: { orderUpdates: true, paymentUpdates: true, lowStock: false },
  inApp: { orderUpdates: true, paymentUpdates: true, scorecard: true, lowStock: true }
}
```

Key decisions:
- scorecard SMS = false by default (avoids alerting sellers too frequently)
- lowStock email = false by default (too noisy for email)
- inApp always true for all categories (in-app is the ground truth store)

### D4.6 — Template Ownership

All notification templates are stored in NotificationTemplate DB table (seeded at app startup — idempotent). Templates are NOT hardcoded in TypeScript.

Template variables use {{camelCase}} placeholders. TemplateService performs safe string substitution (no eval, no template literal injection).

---

## §CH CHANNEL DECISIONS

### CH.1 — SMS: YES — Required

| Dimension | Decision |
|---|---|
| Provider | MSG91 (primary) / Twilio (fallback) — same from Sprint 1. No new integration |
| Cost | Rs 0.10–0.25 per SMS. Acceptable for MVP |
| Failure handling | Retry 3x (5s, 10s, 20s). After 3 failures — DLQ. In-App still delivered |
| PII handling | Phone masked in logs (last 4 digits only) |
| Scalability | SmsProvider interface — provider swap requires zero application code change |

### CH.2 — Email: YES — Transactional Only

| Dimension | Decision |
|---|---|
| Provider | Resend (primary) |
| Cost | Free tier: 3K emails/month. Pro: $20/month |
| Failure handling | Retry 3x. After failure — DLQ. SMS + In-App still delivered |
| Scalability | EmailProvider interface — swap Resend for SES with zero application code change |
| HTML templates | Mobile-first, branded, Hinglish subject lines, pre-compiled |

### CH.3 — In-App: YES — Required (Primary Persistence Layer)

| Dimension | Decision |
|---|---|
| Storage | Notification DB table — append-only |
| Read pattern | Polling GET /notifications/unread-count every 30s |
| Cost | Zero — no external provider |
| Failure handling | In-App is channel of last resort. If SMS + Email both fail, In-App is guaranteed |
| Retention | 90 days active. After 90 days: archived to notificationMonth partition |

### CH.4 — Push Notifications: YES — Web Push Only

| Dimension | Decision |
|---|---|
| Standard | Web Push API (RFC 8030). VAPID authentication |
| Library | web-push npm package |
| Subscription storage | PushSubscription table — new migration |
| Cost | Zero — no external provider |
| Failure handling | Best-effort. 410 Gone — delete stale subscription |
| Events | High urgency only: new order (seller), SHIPPED + PaymentFailed (buyer) |

### CH.5 — Channel Priority Order

```
In-App (synchronous) → SMS (BullMQ) → Push (BullMQ) → Email (BullMQ)
```

In-App is written synchronously. Each external channel is a separate BullMQ job. Failure of one channel does NOT block others.

---

## §EV EVENT CONSUMPTION DECISIONS

### EV.1 — Events to Consume

| Event | Source | Consumer Action | Priority |
|---|---|---|---|
| OrderCreated | Sprint 4 orders.service.ts | Buyer: "Order placed". Seller: "Naya order" | HIGH |
| OrderStatusChanged → CONFIRMED | Sprint 5 seller-order.service.ts | Buyer: "Order confirmed" | HIGH |
| OrderStatusChanged → PROCESSING | Sprint 5 seller-order.service.ts | Buyer: In-App only | LOW |
| OrderStatusChanged → SHIPPED | Sprint 5 seller-order.service.ts | Buyer: "Order shipped" + trackingNumber | HIGH |
| OrderStatusChanged → CANCELLED (buyer) | Sprint 5 buyer-order.service.ts | Buyer: In-App only | LOW |
| PaymentReceived | Sprint 4 orders.service.ts | Buyer: "Payment successful" | HIGH |
| PaymentFailed | Sprint 4 payment.service.ts | Buyer: all channels — retry link | CRITICAL |
| SupplierScoreUpdated | Sprint 5 seller-scorecard.service.ts | Seller: In-App if change ≥5 pts | LOW |
| StockLow | Sprint 3 inventory.service.ts | Seller: SMS + In-App | MEDIUM |

### EV.2 — Events to NOT Consume

| Event | Reason |
|---|---|
| InventoryReserved | Internal inventory mechanics — not user-facing |
| InventoryReleased | Internal — not user-facing |
| OrderConfirmed (Sprint 4 legacy) | Duplicate with OrderStatusChanged CONFIRMED — would cause double notification |
| OrderCancelled (Sprint 4 legacy) | Handle via OrderStatusChanged CANCELLED instead |

**CRITICAL DECISION:** Use OrderStatusChanged as the single source of truth for all order lifecycle notifications. Do NOT also consume OrderConfirmed / OrderCancelled. Consuming both WILL cause duplicate notifications. This must be explicitly enforced in OutboxConsumerWorker routing map.

### EV.3 — New Events in Sprint 6: NO

Sprint 6 MUST NOT create new EventOutbox events. Notification delivery is infrastructure. NotificationModule never writes to EventOutbox.

Notification failures go to a dedicated notification_failures log table, NOT EventOutbox.

### EV.4 — OutboxConsumerWorker Polling Strategy

```
Poll interval: every 5 seconds
Batch size: 50 events per poll
Event ordering: FIFO by createdAt (oldest first)
Filter: status = PENDING AND eventType IN (consumed event types)
Locking: Redis SET NX per eventId — prevents duplicate processing under concurrent workers
```

**Architecture:**
```
OutboxConsumerWorker → polls EventOutbox → enqueues to 'notifications' BullMQ queue → marks EventOutbox.status = COMPLETED
NotificationWorker → processes 'notifications' queue jobs → calls SmsService / EmailService / PushService → creates Notification records
```

EventOutbox event is marked COMPLETED as soon as it's safely in BullMQ — NOT after delivery. Notification delivery retries do NOT re-process EventOutbox.

### EV.5 — EventOutbox Payload Validation at Consumer Boundary

**MANDATORY — All EventOutbox payloads MUST be validated via Zod schemas:**

```typescript
import { OrderStatusChangedPayloadSchema } from '@vyaparnet/types';
const result = OrderStatusChangedPayloadSchema.safeParse(outboxEvent.payload);
if (!result.success) {
  this.logger.error({ eventId, errors: result.error }, 'OUTBOX_PAYLOAD_INVALID');
  await this.markEventFailed(eventId, 'INVALID_PAYLOAD');
  return; // do NOT crash worker, do NOT retry
}
```

Import from packages/types/src/events/outbox-payloads.schemas.ts (created in Sprint 5 R2).

### EV.6 — StockLow Event

Maximum 1 low-stock notification per product per 24 hours.
Redis key: notif:lowstock:{productId}:{businessId} TTL=86400s.

### EV.7 — OUTBOX_EVENT_NOTIFICATION_MAP Design (MANDATORY)

**DECISION: The event routing map MUST be designed as an extensible registry — NOT a switch statement.**

```typescript
// CORRECT — extensible registry
const OUTBOX_EVENT_NOTIFICATION_MAP: Record<string, EventHandler> = {
  OrderCreated: handleOrderCreated,
  OrderStatusChanged: handleOrderStatusChanged,
  PaymentReceived: handlePaymentReceived,
  PaymentFailed: handlePaymentFailed,
  SupplierScoreUpdated: handleSupplierScoreUpdated,
  StockLow: handleStockLow,
};

// Sprint 8 adds: OUTBOX_EVENT_NOTIFICATION_MAP['ReturnInitiated'] = handleReturnInitiated;
// Zero existing code changes required
```

---

## §UX USER EXPERIENCE DECISIONS

### UX.1 — Buyer UX — What They Need to Know

High urgency (SMS + In-App): OrderCreated, CONFIRMED, SHIPPED, PaymentReceived, PaymentFailed
Low urgency (In-App only): PROCESSING, buyer-initiated cancellation

Anti-spam rules:
- Maximum 1 SMS per order lifecycle stage
- PROCESSING: In-App only
- Buyer cancels own order: In-App only (they initiated it)
- PaymentFailed: all channels (financial urgency)

### UX.2 — Seller UX — What They Need to Know

High urgency (SMS + In-App): new order, score drop ≥5 pts, low stock
Low urgency (In-App only): score improvement ≥5 pts

Anti-spam rules:
- New order: SMS immediately — non-negotiable
- Score update: In-App only by default (SMS is opt-in)
- Low stock: SMS once per product per 24 hours

### UX.3 — Notification Panel (In-App Bell)

Content format:
```
- Icon: per notification type
- Title: max 60 chars, Hindi/English per preference
- Body: max 120 chars
- Timestamp: relative ("2 min pehle")
- CTA: deep link to relevant entity
- Unread indicator: bold title + colored left border
```

Pagination: 20 per page, cursor-based (no OFFSET, no total count — consistent with platform rule INV-S5-20).

Unread badge: shows count of notifications from last 30 days only.

### UX.4 — Notification Language

User.preferredLanguage field (set during Sprint 1 onboarding):
- hi → Hinglish template
- en → English template
- Default: hi

Hinglish style: natural mix, not forced translation. "Order ship ho gaya" not "Aapka krayadesh bhej diya gaya."

### UX.5 — Notification Preference Defaults

| Notification Type | SMS | Email | Push | In-App |
|---|---|---|---|---|
| Order updates (buyer) | ON | ON | ON | ON |
| Payment updates (buyer) | ON | ON | ON | ON |
| New orders (seller) | ON | ON | ON | ON |
| Scorecard alerts (seller) | OFF | OFF | OFF | ON |
| Low stock alerts (seller) | ON | OFF | OFF | ON |
| Promotions | OFF | OFF | OFF | OFF |

### UX.6 — Anti-Fatigue Hard Limits (PLATFORM RULE)

| Rule | Limit |
|---|---|
| Same notification type per user per order | Max 1 SMS, 1 Email |
| Low stock per product per day | Max 1 SMS |
| Score change notification | Only when change ≥5 points |
| Deduplication window | 5 minutes (same userId + eventType + entityId) |
| All-channel delivery | Only for PaymentFailed |

---

## §SEC SECURITY DECISIONS

### SEC.1 — Notification Ownership Enforcement

Every Notification record has userId. ALL reads MUST filter by req.user.id. Cross-user access is a security violation.

```typescript
// CORRECT
await prisma.notification.findMany({ where: { userId: req.user.id, ... } });
// FORBIDDEN — no userId filter
await prisma.notification.findMany({ where: { id: notificationId } });
```

### SEC.2 — PII in Notifications

| Data | In notification body | In logs |
|---|---|---|
| Buyer phone | NO | NO (masked: last 4 digits) |
| Buyer email | NO | NO (masked: domain only) |
| Buyer name | YES — first name only | YES |
| Buyer address | NO | NO |
| Order amount | YES — total only | YES |

Seller receives order amount and order number in new-order notification. Buyer's name/phone NOT in seller notification (consistent with Sprint 5 buyerCode masking).

### SEC.3 — Push Subscription Security

- Subscription stored per (userId, endpoint) — unique constraint
- Subscription creation: verify userId matches req.user.id
- 410 Gone from push service: immediately delete subscription
- VAPID keys: in environment variables only, NEVER in DB or logs

### SEC.4 — Template Injection Prevention

```typescript
// CORRECT — safe substitution
template.replace('{{orderNumber}}', this.sanitize(payload.orderNumber));
// FORBIDDEN
eval(`\`${template}\``);
```

All substituted values sanitized (strip HTML tags, strip SMS-dangerous chars, limit length).

### SEC.5 — EventOutbox Replay Prevention

Redis idempotency key: outbox-processed:{eventId} TTL=86400s.

If same EventOutbox event arrives twice:
1. Check Redis key — if present, skip
2. Mark COMPLETED (idempotent)
3. Do NOT enqueue to BullMQ again

### SEC.6 — No Direct Notification Trigger API

Notification sends are never directly triggerable via API. Only EventOutbox events trigger notifications. This prevents notification abuse.

Exception: Sprint 7 AdminNotificationService.sendDirect() is gated by Admin role and audit logged.

### SEC.7 — Email Security Prerequisites

- SPF and DKIM records configured before Sprint 6 production deploy
- From address: noreply@vyaparnet.com (dedicated transactional domain)
- Unsubscribe link in every email
- No user-provided content in email subject line (prevents header injection)

---

## §SC SCALABILITY DECISIONS

### SC.1 — Notification Queue Architecture

```
Queue: 'notifications' (separate from 'payments' and 'scoring')
Concurrency: 10 workers per process
Job structure: { channel: 'sms' | 'email' | 'push' | 'inApp', userId, notificationId, payload }
Job timeout: 30 seconds
Retries: 3 with linear backoff (5s, 10s, 20s)
DLQ: 'notifications-failed'
DLQ retention: 7 days
```

### SC.2 — Channel Independence

Each channel delivery is a separate BullMQ job. SMS failure does NOT affect Email job. Email failure does NOT affect In-App creation.

In-App notification is written synchronously (simple DB insert — no external dependency risk).

### SC.3 — OutboxConsumerWorker Concurrency Safety

Redis distributed lock per eventId:
```
Lock key: outbox-consumer-lock:{eventId}
Lock TTL: 30 seconds
Lock strategy: SET NX
```

Only one worker instance processes each EventOutbox event. If lock not acquired, skip in this batch cycle.

### SC.4 — In-App Notification Query Performance

Required index:
```sql
CREATE INDEX "idx_notif_user_read_date"
ON "Notification" ("userId", "isRead", "createdAt" DESC);
```

Unread count: lightweight COUNT(1) capped at 100 — not a full COUNT(*) scan.

### SC.5 — Template Pre-Compilation

TemplateService pre-compiles all active templates at module startup. Not re-parsed per send. Cache invalidated on module restart (acceptable for MVP).

### SC.6 — Notification Retention

- Active: 90 days in Notification table
- Archive: notificationMonth partition field (already in schema v4.3)
- Never deleted: audit trail requirement

### SC.7 — Sprint 6 Scale Limits (Document for Sprint 7 Review)

| Metric | Sprint 6 Safe Limit |
|---|---|
| Notifications per day | 50,000 |
| Active push subscriptions | 10,000 |
| EventOutbox events per poll cycle | 50 |
| Concurrent NotificationWorker instances | 10 |

When notifications_per_day > 50K: SMS batching, push priority queuing, email rate limiting.

---

## §FC FUTURE SPRINT COMPATIBILITY DECISIONS

### FC.1 — Sprint 7 (Admin) Compatibility

| Requirement | Sprint 6 Decision |
|---|---|
| Admin can view notification delivery status | Notification.status field (PENDING/SENT/FAILED/READ) |
| Admin can send manual notifications | NotificationModule exports NotificationService.sendDirect(userId, template, payload) |
| Admin notification for KYC approval/rejection | Sprint 7 calls sendDirect() — no new event needed |
| Admin DLQ monitoring | notification_dlq_size gauge |

**FC.1a — Trap:** Sprint 7 agent must use NotificationService.sendDirect() — NOT create its own notification send path. Bypassing NotificationModule breaks deduplication, preference checks, and observability.

### FC.2 — Sprint 8 (Returns & Disputes) Compatibility

Sprint 8 adds EventOutbox events (ReturnInitiated, DisputeOpened, RefundProcessed). Sprint 6 OutboxConsumerWorker adds handlers to OUTBOX_EVENT_NOTIFICATION_MAP. Sprint 8 seeds new NotificationTemplate rows. Zero Sprint 6 code changes required for routing structure.

```typescript
// Sprint 8 simply adds:
OUTBOX_EVENT_NOTIFICATION_MAP['ReturnInitiated'] = handleReturnInitiated;
```

### FC.3 — Sprint 9 (ERP / OpenSearch / Analytics) Compatibility

| Requirement | Sprint 6 Decision |
|---|---|
| Notification delivery rate analytics | notification_sent_total{channel}, notification_failed_total{channel,reason} |
| OpenSearch indexing | Notification table cursor-paginated for Sprint 9 indexer |
| Data export | notificationMonth partition field already in schema v4.3 |

### FC.4 — WhatsApp Business (Phase 2)

Sprint 6 channel abstraction supports future WhatsApp addition:

```typescript
interface NotificationChannel {
  name: 'sms' | 'email' | 'push' | 'inApp' | 'whatsapp'; // extensible
  send(notification: NotificationJob): Promise<void>;
}
// Phase 2: WhatsAppChannel implements NotificationChannel — zero routing changes
```

### FC.5 — WebSocket Real-Time (Phase 2)

When WebSocket is added in Phase 2:
1. Existing In-App Notification records serve as historical backfill
2. WebSocket pushes new events in real-time
3. Bell panel reads from DB (existing API) for history
4. Zero Sprint 6 code changes needed

---

## §AI AI-AGENT SAFETY DECISIONS

### AI-T1 — EventOutbox Double Consumption Trap

**Trap:** Agent consumes both OrderCreated AND OrderConfirmed AND OrderStatusChanged CONFIRMED → 3 SMS for 1 order confirmation.

**Fix:** ONLY consume OrderStatusChanged for status transition events. OrderCreated is for "order placed" notification only.

Exact routing:
```
OrderCreated                          → "Order placed" (buyer + seller)
OrderStatusChanged.statusTo=CONFIRMED → "Order confirmed" (buyer only)
OrderStatusChanged.statusTo=SHIPPED   → "Order shipped" (buyer only)
PaymentReceived                       → "Payment confirmed" (buyer only)
PaymentFailed                         → "Payment failed" (buyer only, all channels)
```

Do NOT also consume OrderConfirmed or OrderCancelled (older Sprint 4 events — would cause duplicates).

### AI-T2 — Importing Domain Services into NotificationModule Trap

**Trap:** Agent imports SellerOrderService to "enrich" notification data.

**Fix:** All data for notification comes from EventOutbox.payload. If payload is missing data, enrich the payload at the source (Sprint 5 code), not by importing domain services.

Only DB models NotificationModule may query: Notification, NotificationTemplate, User (read-only via UserContactService), EventOutbox (status update only).

### AI-T3 — Worker Crash on Missing Optional Payload Fields

**Trap:** `payload.estimatedDelivery.toUpperCase()` — estimatedDelivery is optional in SHIPPED event.

**Fix:** Always handle optional fields defensively:
```typescript
const trackingNumber = payload.trackingNumber ?? null;
const estimatedDelivery = payload.estimatedDelivery ?? null;
```

Always use safeParse (not parse) at worker boundary.

### AI-T4 — User Phone Lookup Without Null Check

**Trap:** `smsService.send((await userContactService.getContact(userId)).phone, msg)` — phone may be null.

**Fix:**
```typescript
const contact = await this.userContactService.getContact(buyerId);
if (!contact.phone) {
  this.logger.warn({ userId: buyerId }, 'SMS_SKIPPED_NO_PHONE');
  return; // graceful skip
}
```

### AI-T5 — Notification Sent Before Preference Check

**Trap:** Agent sends SMS first, then checks preference → SMS already sent even if disabled.

**Fix:** Preference check is FIRST operation. Before any channel delivery:
```typescript
const prefs = user.notificationPreferences;
if (!prefs?.sms?.orderUpdates) return;
```

### AI-T6 — Redis Dedup Key Not Deterministic

**Trap:** `notif:${userId}:${eventType}:${Date.now()}` — never deduplicates (always unique).

**Fix:** Key must be deterministic per entity:
```typescript
const dedupKey = `notif:${userId}:${eventType}:${entityId}`; // entityId = orderId or productId
// TTL: 300s
```

### AI-T7 — Creating EventOutbox Events in NotificationModule

**Trap:** `await prisma.eventOutbox.create({ eventType: 'NotificationSent' })` — violates EventOutbox governance.

**Fix:** Use Prometheus counters and structured logs. EventOutbox is domain state. Notification delivery is infrastructure.

### AI-T8 — SellerContextGuard Applied to Notification Routes

**Trap:** Agent applies SellerContextGuard to GET /notifications because "sellers use it too."

**Fix:** GET /notifications is user-level, not seller-specific. Auth: JwtAuthGuard only. Roles: BUYER + SELLER both allowed. NO SellerContextGuard.

### AI-T9 — Template Variables Not Sanitized

**Trap:** productName directly injected into SMS template — may contain SMS-dangerous characters.

**Fix:** Sanitize all substituted values before rendering:
```typescript
private sanitize(value: string): string {
  return value.replace(/[~^{}|\\<>]/g, '').slice(0, 100);
}
```

### AI-T10 — Marking EventOutbox COMPLETED Before BullMQ Enqueue

**Trap:** Mark COMPLETED first → BullMQ enqueue fails → event lost forever.

**Fix:**
```typescript
await this.notificationsQueue.add(jobName, jobData); // FIRST
await prisma.eventOutbox.update({ // AFTER successful enqueue
  where: { id: eventId },
  data: { status: 'COMPLETED', processedAt: new Date() }
});
```

### AI-T11 — SupplierScoreUpdated: Notify on Every 1-Point Change

**Trap:** Sprint 5 emits SupplierScoreUpdated when score changes ≥1 point. Agent notifies on every event → seller gets SMS every 6 hours.

**Fix:** NotificationWorker filter: only notify when Math.abs(compositeScore - previousCompositeScore) >= 5.

### AI-T12 — Low Stock: Notify on Every Threshold Breach

**Trap:** Seller gets 50 SMS in a day if stock oscillates at threshold.

**Fix:** Redis rate key: notif:lowstock:{productId}:{businessId} TTL=86400s. Check before send. If key exists, skip.

### AI-T13 — PushSubscription Stored on User JSONB

**Trap:** Agent stores push subscription in User.notificationPreferences JSONB — only one device supported.

**Fix:** Separate PushSubscription table with (userId, endpoint) unique constraint. Multi-device supported.

### AI-T14 — NotificationWorker Reading Stale Templates

**Trap:** TemplateService fetches templates on every send → N queries per notification → performance disaster.

**Fix:** TemplateService pre-compiles all templates at module init. In-memory cache. Restart to refresh.

---

## §DL DECISION LOG

| ID | Decision | Rationale |
|---|---|---|
| DL-1 | SMS: YES | 98% read rate India B2B. Trust signal. Required. |
| DL-2 | Email: YES (transactional only) | Paper trail for businesses. Resend. |
| DL-3 | In-App: YES | Zero-cost. Ground truth. Channel of last resort. |
| DL-4 | Push: YES (Web Push only) | Re-engagement. High urgency only. |
| DL-5 | WhatsApp: NO | Approval delay 2-4 weeks. Cost. Not justified at MVP volume. |
| DL-6 | WebSocket: NO | Polling sufficient. Complexity not justified. |
| DL-7 | OrderStatusChanged as sole source for status notifications | Prevents duplicate with OrderConfirmed/OrderCancelled |
| DL-8 | No new EventOutbox events | Pure consumer — no domain state |
| DL-9 | PushSubscription separate table | Multi-device support required |
| DL-10 | NotificationPreference as JSONB on User | Already in schema v4.3. Avoids new migration. |
| DL-11 | Seller email: real-time per order | Simplicity. Immediate seller response critical. |
| DL-12 | Score notification threshold: ≥5 points | Prevents notification fatigue. Source event unchanged. |
| DL-13 | Low stock: max 1 SMS per product per 24h | Prevents storm when stock oscillates at threshold. |
| DL-14 | In-App synchronous | Simple DB insert, no external dependency. |
| DL-15 | OUTBOX_EVENT_NOTIFICATION_MAP extensible registry | Sprint 7/8 adds handlers without modifying switch statements. |
| DL-16 | Channel abstraction interface | Phase 2 WhatsApp: zero routing changes. |
| DL-17 | Payload validation via Zod at consumer boundary | Prevents runtime crashes from malformed payloads. |
| DL-18 | Preference check is first operation | No channel sends before preference verified. |
| DL-19 | Dedup: 5 minutes per userId+eventType+entityId | Prevents double SMS from EventOutbox relay duplicates. |
| DL-20 | scorecard SMS default = OFF | Prevents sellers feeling constantly judged. |

---

## §RA RISKS ACCEPTED

| Risk | Acceptance Rationale |
|---|---|
| Push subscription staleness | 410 Gone handled with delete. Acceptable. |
| SMS provider throttling at scale | Queue backoff handles it. MVP volume not a risk. |
| Email going to spam initially | SPF/DKIM setup is operational prerequisite. Monitored. |
| In-App polling latency (30s max) | Acceptable for B2B — events happen in minutes/hours. |
| Template change requires restart | Templates change infrequently. Sprint 9 adds Redis cache. |
| PushSubscription new migration needed | Minor migration. No data risk. |

---

## §RR RISKS REJECTED

| Risk | Rejection |
|---|---|
| WhatsApp added to Sprint 6 | REJECTED. Approval time blocks sprint delivery. |
| NotificationModule importing domain services | REJECTED. Violates package boundaries Sprint 1-5. |
| EventOutbox events for notification delivery | REJECTED. Creates circular consumption risk. |
| WebSocket | REJECTED. Complexity not justified for MVP. |
| Daily digest for seller email | REJECTED. Adds scheduling complexity. Real-time simpler. |
| Consuming OrderConfirmed + OrderStatusChanged CONFIRMED | REJECTED. Guaranteed double notification. |
| NotificationPreference as separate table | REJECTED. JSONB already in schema v4.3. |
| LLM-generated notification content | REJECTED. PII risk, latency, unpredictable output. |

---

## §FV FINAL SCOPE VERDICT

### SPRINT 6 — APPROVED FOR ARCHITECTURE GENERATION

**What Sprint 6 WILL build:**

1. NotificationModule — new, isolated, pure consumer module
2. OutboxConsumerWorker — polls EventOutbox, routes to BullMQ
3. NotificationWorker — delivers via SMS, Email, Push; writes In-App synchronously
4. 4 delivery channels — SMS (MSG91), Email (Resend), Web Push, In-App
5. TemplateService — pre-compiled, safe substitution, Hindi + English templates
6. DeduplicationService — Redis-based, 5-minute window
7. UserContactService — thin read-only user contact resolver
8. Preference management APIs — GET + PUT /notifications/preferences
9. In-App notification APIs — GET + PATCH /notifications, /notifications/read-all, /notifications/unread-count
10. PushSubscription table — new migration (multi-device support)
11. 6 Prometheus metrics — delivery counters, failure counters, latency histogram, queue depth, dedup counter, DLQ size
12. 2 Grafana alerts — queue depth > 5K, SMS failure rate > 10%
13. OUTBOX_EVENT_NOTIFICATION_MAP — extensible registry (Sprint 7/8 can add handlers)
14. Channel abstraction interface — Phase 2 WhatsApp addition: zero routing changes

**What Sprint 6 WILL NOT build:**

- WhatsApp channel
- WebSocket real-time notifications
- Email marketing / newsletters
- Complex segmentation rules
- Notification analytics dashboard
- Push notification click tracking
- In-app chat
- Any domain logic (no mutations to Order/Inventory/Payment)
- Any new EventOutbox writes

**Sprint 7/8/9 are not blocked by any Sprint 6 decision.**

**No Sprint 1-5 invariant is weakened by any Sprint 6 decision.**

---

*Version: v1.0 Final*
*Authority: Enterprise Product Decision Board + Notification Platform Design Authority + Distributed Systems Governance Board*
*Sprint 6 Architecture Generation may proceed using this document as sole authority.*
*Next step: Generate SPRINT_6_EXECUTION_LOCK.md using this document + all Sprint 1-5 authoritative documents.*
