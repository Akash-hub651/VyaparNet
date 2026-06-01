import type { HandlerContext } from '../channels/channel.interface';
import type { BusinessSuspendedPayload } from '@vyaparnet/types';

/**
 * handleBusinessSuspended — handles 'BusinessSuspended' EventOutbox event.
 *
 * Sends suspension notification to the seller (Business.ownerId).
 *
 * GOVERNANCE:
 * - Called by OutboxConsumerWorker AFTER $transaction commits (INV-S7-19).
 * - Note: AdminKycService does NOT call sendDirect() on suspension
 *   (suspension is an enforcement action, not a friendly alert).
 *   The EventOutbox handler is the sole notification path for suspension.
 * - Deduplication prevents double-delivery within 300s.
 *
 * Template: KycRejected_SELLER_hi (reused — suspension is a form of account block)
 * Variables: { businessName, reason }
 *
 * DESIGN NOTE: A dedicated BusinessSuspended_SELLER template would be cleaner,
 * but to keep Sprint 7 scope minimal, we reuse KycRejected_SELLER_hi with
 * the suspension reason as the reason variable.
 */
export async function handleBusinessSuspended(
  payload: BusinessSuspendedPayload,
  ctx: HandlerContext,
): Promise<void> {
  const { businessId, businessName, sellerUserId, reason } = payload;

  const dedupKey = `notif:${sellerUserId}:BusinessSuspended:${businessId}`;
  if (await ctx.deduplicationService.isDuplicate(dedupKey)) {
    ctx.logger.log(
      { sellerUserId, businessId },
      'NOTIFICATION_DEDUP_SKIPPED_BUSINESS_SUSPENDED',
    );
    return;
  }

  const contact = await ctx.userContactService.getContact(sellerUserId);

  await ctx.notificationService.createAndEnqueue({
    userId: sellerUserId,
    contact,
    templateName: 'KycRejected_SELLER_hi',
    variables: { businessName, rejectionReason: reason },
    entityId: businessId,
    eventType: 'BusinessSuspended',
    channels: ['sms', 'email', 'inApp'],
  });

  await ctx.deduplicationService.setProcessed(dedupKey, 300);
}
