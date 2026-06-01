import type { PaymentReceivedPayload } from '@vyaparnet/types';
import type { HandlerContext } from '../channels/channel.interface';

/**
 * handlePaymentReceived — handles 'PaymentReceived' EventOutbox event.
 *
 * Sends to BUYER only (SMS + Email + In-App).
 * Payment confirmation is high-priority: SMS + Email + In-App all channels.
 *
 * INV-S6-7: Only buyer contact resolved — seller has no payment receipt notification.
 */
export async function handlePaymentReceived(
  payload: PaymentReceivedPayload,
  ctx: HandlerContext,
): Promise<void> {
  const { orderId, buyerId, amount, orderNumber } = payload;

  // buyerId is optional in PaymentReceivedPayload (payment-webhook-processor may not set it)
  if (!buyerId) {
    ctx.logger.warn({ orderId }, 'PAYMENT_RECEIVED_NO_BUYER_ID_SKIP');
    return;
  }

  const dedupKey = `notif:${buyerId}:PaymentReceived:${orderId}`;
  if (await ctx.deduplicationService.isDuplicate(dedupKey)) {
    ctx.logger.log({ buyerId, orderId }, 'NOTIFICATION_DEDUP_SKIPPED');
    ctx.metrics.notificationDedupSkippedTotal.inc({
      eventType: 'PaymentReceived',
    });
    return;
  }

  const buyerContact = await ctx.userContactService.getContact(buyerId);

  const vars: Record<string, string> = {
    orderNumber: orderNumber ?? orderId,
    amount: amount?.toString() ?? '',
  };

  await ctx.notificationService.createAndEnqueue({
    userId: buyerId,
    contact: buyerContact,
    templateName: 'PaymentReceived_BUYER_hi',
    variables: vars,
    entityId: orderId,
    eventType: 'PaymentReceived',
    channels: ['sms', 'email', 'inApp'],
  });

  await ctx.deduplicationService.setProcessed(dedupKey, 300);
}
