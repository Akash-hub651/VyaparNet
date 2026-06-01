import type { StockLowPayload } from '@vyaparnet/types';
import type { HandlerContext } from '../channels/channel.interface';

/**
 * handleStockLow — handles 'StockLow' EventOutbox event.
 *
 * Sends to SELLER only (SMS + In-App).
 *
 * INV-S6-11: Max 1 SMS per (productId, businessId) per 24 hours.
 *   If SMS rate-limited: send In-App only (silent degradation — not skipped entirely).
 *   Rate limit key: `notif:lowstock:{productId}:{businessId}`  TTL=86400s.
 *
 * This prevents SMS spam when inventory frequently dips below threshold during peak hours.
 */
export async function handleStockLow(
  payload: StockLowPayload,
  ctx: HandlerContext,
): Promise<void> {
  const {
    productId,
    businessId,
    productName,
    currentStock,
    quantity,
    threshold,
  } = payload;

  // businessId is optional in payload — guard before proceeding
  if (!businessId) {
    ctx.logger.warn({ productId }, 'STOCK_LOW_NO_BUSINESS_ID_SKIP');
    return;
  }

  // Resolve stock quantity from whichever field is present
  const stockQty = currentStock ?? quantity ?? 0;

  // Resolve seller user ID via Business owner (INV-S6-15: direct Prisma read)
  const sellerUserId =
    await ctx.userContactService.getBusinessOwnerUserId(businessId);
  if (!sellerUserId) {
    ctx.logger.warn({ businessId, productId }, 'STOCK_LOW_SELLER_NOT_FOUND');
    return;
  }

  // General dedup key for In-App (5 minute window — avoids In-App spam too)
  const dedupKey = `notif:${sellerUserId}:StockLow:${productId}`;
  if (await ctx.deduplicationService.isDuplicate(dedupKey)) {
    ctx.logger.log({ sellerUserId, productId }, 'NOTIFICATION_DEDUP_SKIPPED');
    ctx.metrics.notificationDedupSkippedTotal.inc({ eventType: 'StockLow' });
    return;
  }

  const sellerContact = await ctx.userContactService.getContact(sellerUserId);

  // INV-S6-11: Check SMS rate limit (24h per productId+businessId pair)
  const smsRateLimited = await ctx.deduplicationService.isLowStockRateLimited(
    productId,
    businessId,
  );
  // If SMS is rate-limited: In-App only. If not: SMS + In-App.
  const channels = smsRateLimited ? ['inApp'] : ['sms', 'inApp'];

  const vars: Record<string, string> = {
    productName: productName ?? productId,
    stockQty: stockQty.toString(),
    threshold: threshold?.toString() ?? '0',
  };

  await ctx.notificationService.createAndEnqueue({
    userId: sellerUserId,
    contact: sellerContact,
    templateName: 'StockLow_SELLER_hi',
    variables: vars,
    entityId: productId,
    eventType: 'StockLow',
    channels,
  });

  // Set general dedup (5 min) after successful enqueue
  await ctx.deduplicationService.setProcessed(dedupKey, 300);

  // INV-S6-11: Set SMS-specific rate limit (24h) AFTER successful SMS enqueue
  if (!smsRateLimited) {
    await ctx.deduplicationService.setLowStockRateLimit(productId, businessId);
  }
}
