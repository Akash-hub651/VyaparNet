import type { HandlerContext } from '../channels/channel.interface';
import type { ProductApprovedPayload } from '@vyaparnet/types';

/**
 * handleProductApproved — handles 'ProductApproved' EventOutbox event.
 *
 * Sends ProductApproved_SELLER_hi notification to the product's seller.
 *
 * GOVERNANCE:
 * - Called by OutboxConsumerWorker AFTER $transaction commits (INV-S7-19).
 * - AdminProductService also calls sendDirect() on approval (immediate path).
 *   This handler is the async confirmation path (guaranteed delivery).
 * - Deduplication prevents double-delivery within 300s.
 *
 * Template: ProductApproved_SELLER_hi
 * Variables: { productName }
 */
export async function handleProductApproved(
  payload: ProductApprovedPayload,
  ctx: HandlerContext,
): Promise<void> {
  const { productId, productName, sellerUserId } = payload;

  const dedupKey = `notif:${sellerUserId}:ProductApproved:${productId}`;
  if (await ctx.deduplicationService.isDuplicate(dedupKey)) {
    ctx.logger.log(
      { sellerUserId, productId },
      'NOTIFICATION_DEDUP_SKIPPED_PRODUCT_APPROVED',
    );
    return;
  }

  const contact = await ctx.userContactService.getContact(sellerUserId);

  await ctx.notificationService.createAndEnqueue({
    userId: sellerUserId,
    contact,
    templateName: 'ProductApproved_SELLER_hi',
    variables: { productName },
    entityId: productId,
    eventType: 'ProductApproved',
    channels: ['sms', 'email', 'inApp'],
  });

  await ctx.deduplicationService.setProcessed(dedupKey, 300);
}
