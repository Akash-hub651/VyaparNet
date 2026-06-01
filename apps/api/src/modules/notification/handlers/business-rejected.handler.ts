import type { HandlerContext } from '../channels/channel.interface';
import type { BusinessRejectedPayload } from '@vyaparnet/types';

/**
 * handleBusinessRejected — handles 'BusinessRejected' EventOutbox event.
 *
 * Sends KYC rejection notification to the seller (Business.ownerId).
 *
 * GOVERNANCE:
 * - Called by OutboxConsumerWorker AFTER $transaction commits (INV-S7-19).
 * - AdminKycService also calls sendDirect() on rejection.
 *   This handler acts as async confirmation path (eventual delivery guarantee).
 * - Deduplication prevents double-delivery within 300s.
 *
 * Template: KycRejected_SELLER_hi
 * Variables: { businessName, reason }
 */
export async function handleBusinessRejected(
  payload: BusinessRejectedPayload,
  ctx: HandlerContext,
): Promise<void> {
  const { businessId, businessName, sellerUserId, rejectionReason } = payload;

  const dedupKey = `notif:${sellerUserId}:BusinessRejected:${businessId}`;
  if (await ctx.deduplicationService.isDuplicate(dedupKey)) {
    ctx.logger.log(
      { sellerUserId, businessId },
      'NOTIFICATION_DEDUP_SKIPPED_BUSINESS_REJECTED',
    );
    return;
  }

  const contact = await ctx.userContactService.getContact(sellerUserId);

  await ctx.notificationService.createAndEnqueue({
    userId: sellerUserId,
    contact,
    templateName: 'KycRejected_SELLER_hi',
    variables: { businessName, rejectionReason },
    entityId: businessId,
    eventType: 'BusinessRejected',
    channels: ['sms', 'email', 'inApp'],
  });

  await ctx.deduplicationService.setProcessed(dedupKey, 300);
}
