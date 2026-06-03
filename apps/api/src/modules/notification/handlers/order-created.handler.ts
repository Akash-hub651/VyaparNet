import type { OrderCreatedPayload } from '@vyaparnet/types';
import type { HandlerContext } from '../channels/channel.interface';

/**
 * handleOrderCreated — handles 'OrderCreated' EventOutbox event.
 *
 * Sends notifications to:
 *   1. Buyer: SMS + Email + In-App via 'OrderCreated_BUYER' template
 *   2. Seller: SMS + Email + In-App via 'OrderCreated_SELLER' template
 *
 * INV-S6-25: Buyer dedup key and Seller dedup key are ALWAYS separate.
 *   buyer key:  notif:{buyerId}:OrderCreated:{orderId}
 *   seller key: notif:{sellerUserId}:OrderCreated:{orderId}
 *   Setting ONE must NOT affect the OTHER.
 *
 * INV-S6-7: Buyer's phone/email/name MUST NOT appear in seller notification path.
 *   buyerContact is ONLY passed to buyer createAndEnqueue — never to seller.
 *
 * FOOTGUN-3-F avoidance: Separate dedup keys for buyer and seller.
 * FOOTGUN-3-D avoidance: All optional fields use nullish coalescing.
 */
export async function handleOrderCreated(
  payload: OrderCreatedPayload,
  ctx: HandlerContext,
): Promise<void> {
  const { orderId, orderNumber, buyerId, sellerId, grandTotal, buyerCode } =
    payload;

  // ─── Step 1: Buyer dedup check (INV-S6-6) ────────────────────────────────────
  // INV-S6-25: This is the BUYER key — separate from seller key below
  const dedupKeyBuyer = `notif:${buyerId}:OrderCreated:${orderId}`;
  if (await ctx.deduplicationService.isDuplicate(dedupKeyBuyer)) {
    ctx.logger.log({ buyerId, orderId }, 'NOTIFICATION_DEDUP_SKIPPED_BUYER');
    ctx.metrics.notificationDedupSkippedTotal.inc({
      eventType: 'OrderCreated',
    });
    return;
  }

  // ─── Step 2: Resolve contacts ─────────────────────────────────────────────────
  const buyerContact = await ctx.userContactService.getContact(buyerId);
  // INV-S6-15: getBusinessOwnerUserId reads Business table directly — no SellerModule
  // sellerId is optional in OrderCreatedPayload (Sprint 4 stores sellerId in items[].sellerId)
  const sellerUserId = sellerId
    ? await ctx.userContactService.getBusinessOwnerUserId(sellerId)
    : null;
  // INV-S6-7: sellerContact is resolved SEPARATELY — never mixed with buyerContact data
  const sellerContact = sellerUserId
    ? await ctx.userContactService.getContact(sellerUserId)
    : null;

  // ─── Step 3: Template variables ───────────────────────────────────────────────
  const vars: Record<string, string> = {
    orderNumber,
    grandTotal: grandTotal?.toString() ?? '',
    buyerCode: buyerCode ?? 'UNKNOWN',
  };

  // ─── Step 4: Buyer notifications (SMS + Email + In-App) ──────────────────────
  // INV-S6-7: buyerContact passed ONLY here — never to seller path
  await ctx.notificationService.createAndEnqueue({
    userId: buyerId,
    contact: buyerContact,
    templateName: 'OrderCreated_BUYER_hi',
    variables: vars,
    entityId: orderId,
    eventType: 'OrderCreated',
    channels: ['sms', 'email', 'inApp'],
  });

  // ─── Step 5: Seller notifications (if seller owner resolvable) ────────────────
  if (sellerContact && sellerUserId) {
    // INV-S6-25: Seller dedup key is SEPARATE from buyer dedup key (FOOTGUN-3-F avoidance)
    const dedupKeySeller = `notif:${sellerUserId}:OrderCreated:${orderId}`;
    const sellerAlreadyNotified =
      await ctx.deduplicationService.isDuplicate(dedupKeySeller);

    if (!sellerAlreadyNotified) {
      // INV-S6-7: sellerContact — buyer's details NEVER passed here
      await ctx.notificationService.createAndEnqueue({
        userId: sellerUserId,
        contact: sellerContact,
        templateName: 'OrderCreated_SELLER_hi',
        variables: vars,
        entityId: orderId,
        eventType: 'OrderCreated',
        channels: ['sms', 'email', 'inApp'],
      });
      // Set seller dedup AFTER successful enqueue (INV-S6-6)
      await ctx.deduplicationService.setProcessed(dedupKeySeller, 300);
    } else {
      ctx.logger.log(
        { sellerUserId, orderId },
        'NOTIFICATION_DEDUP_SKIPPED_SELLER',
      );
      ctx.metrics.notificationDedupSkippedTotal.inc({
        eventType: 'OrderCreated',
      });
    }
  }

  // ─── Step 6: Set buyer dedup key AFTER successful processing (INV-S6-6) ───────
  await ctx.deduplicationService.setProcessed(dedupKeyBuyer, 300);
}
