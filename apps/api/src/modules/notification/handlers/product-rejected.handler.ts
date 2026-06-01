import type { HandlerContext } from '../channels/channel.interface';
import type { ProductRejectedPayload } from '@vyaparnet/types';

/**
 * handleProductRejected — handles 'ProductRejected' EventOutbox event.
 *
 * Sends ProductRejected_SELLER_hi notification to the product's seller.
 *
 * GOVERNANCE:
 * - Called by OutboxConsumerWorker AFTER $transaction commits (INV-S7-19).
 * - AdminProductService also calls sendDirect() on rejection (immediate path).
 *   This handler is the async confirmation path (guaranteed delivery).
 * - Deduplication prevents double-delivery within 300s.
 *
 * Template: ProductRejected_SELLER_hi
 * Variables: { productName, reason }
 */
export async function handleProductRejected(
  payload: ProductRejectedPayload,
  ctx: HandlerContext,
): Promise<void> {
  const { productId, productName, sellerUserId, rejectionReason } = payload;

  const dedupKey = `notif:${sellerUserId}:ProductRejected:${productId}`;
  if (await ctx.deduplicationService.isDuplicate(dedupKey)) {
    ctx.logger.log(
      { sellerUserId, productId },
      'NOTIFICATION_DEDUP_SKIPPED_PRODUCT_REJECTED',
    );
    return;
  }

  const contact = await ctx.userContactService.getContact(sellerUserId);

  await ctx.notificationService.createAndEnqueue({
    userId: sellerUserId,
    contact,
    templateName: 'ProductRejected_SELLER_hi',
    variables: { productName, rejectionReason },
    entityId: productId,
    eventType: 'ProductRejected',
    channels: ['sms', 'email', 'inApp'],
  });

  await ctx.deduplicationService.setProcessed(dedupKey, 300);
}
