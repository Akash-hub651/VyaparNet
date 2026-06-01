import type { PaymentFailedPayload } from '@vyaparnet/types';
import type { HandlerContext } from '../channels/channel.interface';

/**
 * handlePaymentFailed — handles 'PaymentFailed' EventOutbox event.
 *
 * Sends to BUYER only (SMS + Email + In-App) — high priority alert.
 * Payment failure is urgent — buyer must be notified immediately across all channels.
 */
export async function handlePaymentFailed(
  payload: PaymentFailedPayload,
  ctx: HandlerContext,
): Promise<void> {
  const { orderId, buyerId, orderNumber } = payload;

  // buyerId is optional in PaymentFailedPayload (payment-webhook-processor may not set it)
  if (!buyerId) {
    ctx.logger.warn({ orderId }, 'PAYMENT_FAILED_NO_BUYER_ID_SKIP');
    return;
  }

  const dedupKey = `notif:${buyerId}:PaymentFailed:${orderId}`;
  if (await ctx.deduplicationService.isDuplicate(dedupKey)) {
    ctx.logger.log({ buyerId, orderId }, 'NOTIFICATION_DEDUP_SKIPPED');
    ctx.metrics.notificationDedupSkippedTotal.inc({
      eventType: 'PaymentFailed',
    });
    return;
  }

  const buyerContact = await ctx.userContactService.getContact(buyerId);

  // §11.1 AUDIT FIX: Extract failure reason from payload.
  // PaymentFailedPayload has both `failureReason` (newer) and `reason` (legacy) — use whichever is set.
  // Defaults to 'Please check your payment method' if neither is provided (safe user-facing fallback).
  const reason =
    payload.failureReason ??
    payload.reason ??
    'Please check your payment method';

  const vars: Record<string, string> = {
    orderNumber: orderNumber ?? orderId,
    reason,
  };

  await ctx.notificationService.createAndEnqueue({
    userId: buyerId,
    contact: buyerContact,
    templateName: 'PaymentFailed_BUYER_hi',
    variables: vars,
    entityId: orderId,
    eventType: 'PaymentFailed',
    channels: ['sms', 'email', 'inApp'],
  });

  await ctx.deduplicationService.setProcessed(dedupKey, 300);
}
