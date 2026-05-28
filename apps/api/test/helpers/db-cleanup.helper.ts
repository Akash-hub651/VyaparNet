import type { PrismaClient } from '@vyaparnet/database';

/**
 * cleanDatabase() — FK-safe test database teardown utility.
 *
 * Authority: VyaparNet Test Governance — Sprint 3 Enterprise Fix
 *
 * ════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS
 * ════════════════════════════════════════════════════════════════
 *
 * Every integration test that resets the DB MUST call this helper
 * instead of writing its own deleteMany() chain.
 *
 * Rationale:
 *   - FK constraints require child tables to be deleted BEFORE parent tables.
 *   - When new tables are added in future sprints, only THIS file needs updating.
 *   - Copy-pasting deleteMany() across test files caused Sprint 3 failures
 *     when Inventory (child of Product) was added — product.deleteMany() was
 *     called before inventory.deleteMany() → Prisma FK constraint violation.
 *
 * ════════════════════════════════════════════════════════════════
 * FK DELETION ORDER — RATIONALE
 * ════════════════════════════════════════════════════════════════
 *
 * LAYER 0 — No FK deps (safe to delete in any order first):
 *   EventOutbox, AuditLog, AppConfig, FeatureFlag, CacheInvalidationEvent,
 *   DeadLetterEvent, NotificationTemplate, SegmentApprovalPolicy,
 *   SegmentAttributeSchema, SearchAnalytics, SearchReindexJob
 *
 * LAYER 1 — FK → User or root:
 *   OtpAttempt, LoginSession, SecurityEvent
 *
 * LAYER 2 — FK → Inventory (must precede Inventory):
 *   InventoryReservation, InventoryMovement, InventorySnapshot, SegmentInventoryPolicy
 *
 * LAYER 3 — FK → Product (must precede Product):
 *   Inventory (also FK → Business)
 *   ProductMedia, ProductVariant, ProductPriceHistory, ProductReview
 *   SearchProductDocument
 *
 * LAYER 4 — FK → Order (must precede Order):
 *   OrderItem, OrderStatusHistory, OrderTracking, Payment, PaymentStatusHistory,
 *   TaxInvoice, ReturnRequest, Dispute, PlatformCommission
 *
 * LAYER 5 — FK → Quotation:
 *   QuotationItem, PriceNegotiation
 *
 * LAYER 6 — FK → Cart:
 *   CartItem
 *
 * LAYER 7 — FK → Business/User (Bulk):
 *   Product, Order, Cart, Quotation, Address, KycDocument, ApiCredential,
 *   BuyerCreditLimit, BuyerLedger, FraudSignal, FieldVisit, QualityCheckRecord,
 *   Coupon, Media, Notification, SellerPayout, SellerRating, SupportTicket,
 *   WebhookEndpoint, WebhookDelivery
 *
 * LAYER 8 — FK → User (via Business):
 *   Business
 *
 * LAYER 9 — Root entities:
 *   Category, User
 *
 * ════════════════════════════════════════════════════════════════
 * SPRINT MAINTENANCE CONTRACT
 * ════════════════════════════════════════════════════════════════
 *
 * When a new model is added to schema.prisma:
 *   1. Identify its FK dependencies (parent tables).
 *   2. Add deleteMany() to the correct layer in this file.
 *   3. Do NOT add deleteMany() in individual test files.
 *
 * When a FK relationship is changed:
 *   1. Update this file's deletion order accordingly.
 *
 * ════════════════════════════════════════════════════════════════
 *
 * @param prisma — PrismaClient or PrismaService (both compatible)
 * @param options.scope — 'full' (default) deletes all tables.
 *                        'inventory-only' deletes only Sprint 3 inventory tables.
 */
export async function cleanDatabase(
  prisma: PrismaClient,
  options: { scope?: 'full' | 'inventory-only' } = {},
): Promise<void> {
  const scope = options.scope ?? 'full';

  if (scope === 'inventory-only') {
    // Targeted cleanup: only Sprint 3 inventory tables, in FK-safe order
    await prisma.inventoryReservation.deleteMany();
    await prisma.inventoryMovement.deleteMany();
    await prisma.inventorySnapshot.deleteMany();
    await prisma.inventory.deleteMany();
    return;
  }

  // ── LAYER 0: No FK dependencies ──────────────────────────────────────────
  await prisma.eventOutbox.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.cacheInvalidationEvent.deleteMany();
  await prisma.deadLetterEvent.deleteMany();
  await prisma.searchAnalytics.deleteMany();
  await prisma.searchReindexJob.deleteMany();

  // ── LAYER 1: FK → User (session/auth artifacts) ──────────────────────────
  await prisma.otpAttempt.deleteMany();
  await prisma.loginSession.deleteMany();
  await prisma.securityEvent.deleteMany();

  // ── LAYER 2: FK → Inventory (Sprint 3 — MUST precede Inventory) ──────────
  await prisma.inventoryReservation.deleteMany();
  await prisma.inventoryMovement.deleteMany();
  await prisma.inventorySnapshot.deleteMany();

  // ── LAYER 3A: FK → Product (Sprint 2/3 — MUST precede Product) ───────────
  await prisma.inventory.deleteMany();          // FK → Product, Business
  await prisma.searchProductDocument.deleteMany(); // FK → Product (via productId field)
  await prisma.productMedia.deleteMany();
  await prisma.productVariant.deleteMany();
  await prisma.productPriceHistory.deleteMany();
  await prisma.productReview.deleteMany();

  // ── LAYER 4: FK → Order (MUST precede Order) ─────────────────────────────
  await prisma.orderItem.deleteMany();
  await prisma.orderStatusHistory.deleteMany();
  await prisma.orderTracking.deleteMany();
  await prisma.paymentStatusHistory.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.taxInvoice.deleteMany();
  await prisma.returnRequest.deleteMany();
  await prisma.dispute.deleteMany();
  await prisma.platformCommission.deleteMany();

  // ── LAYER 5: FK → Quotation ───────────────────────────────────────────────
  await prisma.quotationItem.deleteMany();
  await prisma.priceNegotiation.deleteMany();

  // ── LAYER 6: FK → Cart ───────────────────────────────────────────────────
  await prisma.cartItem.deleteMany();

  // ── LAYER 7: Mid-tier entities (FK → Business or User) ───────────────────
  await prisma.product.deleteMany();
  await prisma.order.deleteMany();
  await prisma.quotation.deleteMany();
  await prisma.cart.deleteMany();
  await prisma.address.deleteMany();
  await prisma.kycDocument.deleteMany();
  await prisma.apiCredential.deleteMany();
  await prisma.buyerCreditLimit.deleteMany();
  await prisma.buyerLedger.deleteMany();
  await prisma.fraudSignal.deleteMany();
  await prisma.fieldVisit.deleteMany();
  await prisma.qualityCheckRecord.deleteMany();
  await prisma.coupon.deleteMany();
  await prisma.media.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.sellerPayout.deleteMany();
  await prisma.sellerRating.deleteMany();
  await prisma.supportTicket.deleteMany();
  await prisma.webhookDelivery.deleteMany();
  await prisma.webhookEndpoint.deleteMany();

  // ── LAYER 8: Business (FK → User, parent of Product/Inventory/many others) ─
  await prisma.business.deleteMany();

  // ── LAYER 9: Root entities ────────────────────────────────────────────────
  await prisma.segmentInventoryPolicy.deleteMany();
  await prisma.category.deleteMany();
  await prisma.user.deleteMany();
}
