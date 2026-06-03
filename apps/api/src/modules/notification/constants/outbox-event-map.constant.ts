import type { HandlerContext } from '../channels/channel.interface';
import type {
  OrderCreatedPayload,
  OrderStatusChangedPayload,
  PaymentReceivedPayload,
  PaymentFailedPayload,
  SupplierScoreUpdatedPayload,
  StockLowPayload,
  BusinessVerifiedPayload,
  BusinessSuspendedPayload,
  BusinessRejectedPayload,
  ProductApprovedPayload,
  ProductRejectedPayload,
  UserSuspendedPayload,
} from '@vyaparnet/types';
import { handleOrderCreated } from '../handlers/order-created.handler';
import { handleOrderStatusChanged } from '../handlers/order-status-changed.handler';
import { handlePaymentReceived } from '../handlers/payment-received.handler';
import { handlePaymentFailed } from '../handlers/payment-failed.handler';
import { handleSupplierScoreUpdated } from '../handlers/supplier-score-updated.handler';
import { handleStockLow } from '../handlers/stock-low.handler';
import { handleBusinessVerified } from '../handlers/business-verified.handler';
import { handleBusinessSuspended } from '../handlers/business-suspended.handler';
import { handleBusinessRejected } from '../handlers/business-rejected.handler';
import { handleProductApproved } from '../handlers/product-approved.handler';
import { handleProductRejected } from '../handlers/product-rejected.handler';
import { handleUserSuspended } from '../handlers/user-suspended.handler';
import {
  createReturnInitiatedHandler,
  createReturnApprovedHandler,
  createReturnRejectedHandler,
  createRefundInitiatedHandler,
  createDisputeOpenedHandler,
  createDisputeResolvedHandler,
  createQuoteCreatedHandler,
  createQuoteAcceptedHandler,
} from '../handlers/sprint8.handlers';

/**
 * OUTBOX_EVENT_NOTIFICATION_MAP — routes EventOutbox eventType to handler function.
 *
 * GOVERNANCE (INV-S6-12):
 * - MUST be a Record<string, handler> — NOT a switch/case statement.
 *   A Record allows O(1) lookup and prevents accidental fall-through bugs.
 * - Adding a handler here = that eventType will be consumed by this worker.
 *   Be deliberate — do NOT add eventTypes you don't intend to process.
 *
 * GOVERNANCE (INV-S6-13):
 * - 'OrderConfirmed' MUST NOT be in this map.
 * - 'OrderCancelled' MUST NOT be in this map (FOOTGUN-3-A).
 * - These are STATUS values emitted via 'OrderStatusChanged' — NOT separate event types.
 * - Adding them here would cause duplicate notifications when OrderStatusChanged is also processed.
 *
 * Handler type signature: (payload: T, ctx: HandlerContext) => Promise<void>
 */
export const OUTBOX_EVENT_NOTIFICATION_MAP: Record<
  string,
  (payload: unknown, ctx: HandlerContext) => Promise<void>
> = {
  // ─── Order Events ────────────────────────────────────────────────────────────
  OrderCreated: (payload, ctx) =>
    handleOrderCreated(payload as OrderCreatedPayload, ctx),
  OrderStatusChanged: (payload, ctx) =>
    handleOrderStatusChanged(payload as OrderStatusChangedPayload, ctx),

  // ─── Payment Events ──────────────────────────────────────────────────────────
  PaymentReceived: (payload, ctx) =>
    handlePaymentReceived(payload as PaymentReceivedPayload, ctx),
  PaymentFailed: (payload, ctx) =>
    handlePaymentFailed(payload as PaymentFailedPayload, ctx),

  // ─── Seller Events ───────────────────────────────────────────────────────────
  SupplierScoreUpdated: (payload, ctx) =>
    handleSupplierScoreUpdated(payload as SupplierScoreUpdatedPayload, ctx),

  // ─── Inventory Events ────────────────────────────────────────────────────────
  StockLow: (payload, ctx) => handleStockLow(payload as StockLowPayload, ctx),

  // ─── Sprint 7: Business KYC Events (Phase 3) ─────────────────────────────
  BusinessVerified: (payload, ctx) =>
    handleBusinessVerified(payload as BusinessVerifiedPayload, ctx),
  BusinessSuspended: (payload, ctx) =>
    handleBusinessSuspended(payload as BusinessSuspendedPayload, ctx),
  BusinessRejected: (payload, ctx) =>
    handleBusinessRejected(payload as BusinessRejectedPayload, ctx),

  // ─── Sprint 7: Product Approval Events (Phase 4) ─────────────────────────
  ProductApproved: (payload, ctx) =>
    handleProductApproved(payload as ProductApprovedPayload, ctx),
  ProductRejected: (payload, ctx) =>
    handleProductRejected(payload as ProductRejectedPayload, ctx),

  // ─── Sprint 7: User Management Events (Phase 5) ─────────────────────────
  UserSuspended: (payload, ctx) =>
    handleUserSuspended(payload as UserSuspendedPayload, ctx),

  // ─── EXPLICITLY EXCLUDED (INV-S6-13) ─────────────────────────────────────────
  // OrderConfirmed   — NOT here. OrderStatusChanged handles CONFIRMED status.
  // OrderCancelled   — NOT here. OrderStatusChanged handles CANCELLED status.
  // OrderDelivered   — Sprint 7 Admin feature handled via admin-order service.

  // ─── Sprint 8 Additions ──────────────────────────────────────────────────────
  ReturnInitiated: createReturnInitiatedHandler(),
  ReturnApproved: createReturnApprovedHandler(),
  ReturnRejected: createReturnRejectedHandler(),
  RefundInitiated: createRefundInitiatedHandler(),
  DisputeOpened: createDisputeOpenedHandler(),
  DisputeResolved: createDisputeResolvedHandler(),
  QuoteCreated: createQuoteCreatedHandler(),
  QuoteAccepted: createQuoteAcceptedHandler(),
};
