import type { OrderStatusChangedPayload } from '@vyaparnet/types';
import type { HandlerContext } from '../channels/channel.interface';

/**
 * ORDER_STATUS_NOTIFICATION_CONFIG — maps OrderStatus → notification configuration.
 *
 * GOVERNANCE (INV-S6-13):
 * - CONFIRMED is here (via OrderStatusChanged.statusTo) — NOT as a separate event.
 * - CANCELLED is here (via OrderStatusChanged.statusTo) — NOT as a separate event.
 * - DELIVERED: Sprint 7 Admin — out of scope for Sprint 6.
 * - COMPLETED: No notification — end state.
 *
 * INV-S6-12: Record, not switch/case — O(1) lookup, no fall-through risk.
 */
const ORDER_STATUS_NOTIFICATION_CONFIG: Record<
  string,
  {
    templateName: string;
    channels: string[];
  }
> = {
  CONFIRMED: {
    templateName: 'OrderConfirmed_BUYER_hi',
    channels: ['sms', 'inApp'],
  },
  PROCESSING: { templateName: 'OrderProcessing_BUYER_hi', channels: ['inApp'] }, // In-App only
  SHIPPED: {
    templateName: 'OrderShipped_BUYER_hi',
    channels: ['sms', 'inApp'],
  },
  OUT_FOR_DELIVERY: {
    templateName: 'OrderOutForDelivery_BUYER_hi',
    channels: ['inApp'],
  },
  CANCELLED: { templateName: 'OrderCancelled_BUYER_hi', channels: ['inApp'] }, // In-App only
  // DELIVERED — Sprint 7 Admin; excluded here
  // COMPLETED — No notification; end state
};

/**
 * handleOrderStatusChanged — handles 'OrderStatusChanged' EventOutbox event.
 *
 * Routes to a buyer notification based on the `statusTo` field.
 * Each status transition → different template + channel combination.
 *
 * INV-S6-13: OrderConfirmed/OrderCancelled are NOT separate event types.
 *   They are handled here via statusTo. Only one eventType in OUTBOX_EVENT_NOTIFICATION_MAP.
 *
 * FOOTGUN-3-D avoidance: trackingNumber and estimatedDelivery are optional — nullish coalescing used.
 */
export async function handleOrderStatusChanged(
  payload: OrderStatusChangedPayload,
  ctx: HandlerContext,
): Promise<void> {
  const {
    orderId,
    buyerId,
    orderNumber,
    statusTo,
    trackingNumber,
    estimatedDelivery,
  } = payload;

  // Look up notification config for this status transition
  const config = ORDER_STATUS_NOTIFICATION_CONFIG[statusTo];
  if (!config) {
    // Status has no notification config — valid end-state (DELIVERED, COMPLETED, etc.)
    ctx.logger.debug(
      { statusTo, orderId },
      'ORDER_STATUS_NO_NOTIFICATION_CONFIG',
    );
    return;
  }

  // Dedup key: includes statusTo to avoid dedup collision across status transitions
  const dedupKey = `notif:${buyerId}:OrderStatusChanged_${statusTo}:${orderId}`;
  if (await ctx.deduplicationService.isDuplicate(dedupKey)) {
    ctx.logger.log(
      { buyerId, orderId, statusTo },
      'NOTIFICATION_DEDUP_SKIPPED',
    );
    ctx.metrics.notificationDedupSkippedTotal.inc({
      eventType: `OrderStatusChanged_${statusTo}`,
    });
    return;
  }

  const buyerContact = await ctx.userContactService.getContact(buyerId);

  // FOOTGUN-3-D avoidance: Optional fields use nullish coalescing — never throw on missing
  const vars: Record<string, string> = {
    orderNumber,
    ...(trackingNumber != null && { trackingNumber }),
    ...(estimatedDelivery != null && { estimatedDelivery }),
  };

  await ctx.notificationService.createAndEnqueue({
    userId: buyerId,
    contact: buyerContact,
    templateName: config.templateName,
    variables: vars,
    entityId: orderId,
    eventType: `OrderStatusChanged_${statusTo}`,
    channels: config.channels,
  });

  // Set dedup key AFTER successful enqueue (INV-S6-6)
  await ctx.deduplicationService.setProcessed(dedupKey, 300);
}
