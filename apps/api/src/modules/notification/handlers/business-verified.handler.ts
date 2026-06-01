import type { HandlerContext } from '../channels/channel.interface';
import type { BusinessVerifiedPayload } from '@vyaparnet/types';

/**
 * handleBusinessVerified — handles 'BusinessVerified' EventOutbox event.
 *
 * Sends KycApproved notification to the seller (Business.ownerId).
 *
 * GOVERNANCE:
 * - This handler is called by OutboxConsumerWorker AFTER the $transaction commits.
 *   It is NOT called inside a $transaction (INV-S7-19).
 * - sendDirect() in AdminKycService also sends this notification immediately.
 *   This handler acts as the async confirmation path (EventOutbox consumer).
 * - The handler is idempotent because OutboxConsumerWorker already deduplicates
 *   by EventOutbox.deduplicationKey before invoking handlers.
 *
 * Template: KycApproved_SELLER_hi
 * Variables: { businessName }
 */
export async function handleBusinessVerified(
  payload: BusinessVerifiedPayload,
  ctx: HandlerContext,
): Promise<void> {
  const { businessId, businessName, sellerUserId } = payload;

  // Dedup key for notification delivery (NOT EventOutbox dedup)
  const dedupKey = `notif:${sellerUserId}:BusinessVerified:${businessId}`;
  if (await ctx.deduplicationService.isDuplicate(dedupKey)) {
    ctx.logger.log(
      { sellerUserId, businessId },
      'NOTIFICATION_DEDUP_SKIPPED_BUSINESS_VERIFIED',
    );
    return;
  }

  const contact = await ctx.userContactService.getContact(sellerUserId);

  await ctx.notificationService.createAndEnqueue({
    userId: sellerUserId,
    contact,
    templateName: 'KycApproved_SELLER_hi',
    variables: { businessName },
    entityId: businessId,
    eventType: 'BusinessVerified',
    channels: ['sms', 'email', 'inApp'],
  });

  await ctx.deduplicationService.setProcessed(dedupKey, 300);
}
