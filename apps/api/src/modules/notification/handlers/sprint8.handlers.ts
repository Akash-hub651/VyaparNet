import type { HandlerContext } from '../channels/channel.interface';
import {
  ReturnInitiatedPayloadSchema,
  ReturnApprovedPayloadSchema,
  ReturnRejectedPayloadSchema,
  RefundInitiatedPayloadSchema,
  DisputeOpenedPayloadSchema,
  DisputeResolvedPayloadSchema,
  QuoteCreatedPayloadSchema,
  QuoteAcceptedPayloadSchema,
} from '@vyaparnet/types';

export function createReturnInitiatedHandler() {
  return async (payload: unknown, ctx: HandlerContext): Promise<void> => {
    const parsed = ReturnInitiatedPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      ctx.logger.error('Invalid ReturnInitiated payload', parsed.error);
      return;
    }
    const data = parsed.data;

    const dedupKey = `notif:${data.buyerId}:ReturnInitiated:${data.returnId}`;
    if (await ctx.deduplicationService.isDuplicate(dedupKey)) return;

    const contact = await ctx.userContactService.getContact(data.buyerId);
    await ctx.notificationService.createAndEnqueue({
      userId: data.buyerId,
      contact,
      templateName: 'ReturnInitiated_BUYER_hi', // _hi logic handled via preference or fallback internally, passing standard name
      variables: {
        returnId: data.returnId,
        orderId: data.orderId,
        reason: data.reason,
      },
      entityId: data.returnId,
      eventType: 'ReturnInitiated',
      channels: ['sms', 'inApp'],
    });

    await ctx.deduplicationService.setProcessed(dedupKey, 300);
  };
}

export function createReturnApprovedHandler() {
  return async (payload: unknown, ctx: HandlerContext): Promise<void> => {
    const parsed = ReturnApprovedPayloadSchema.safeParse(payload);
    if (!parsed.success) return;
    const data = parsed.data;

    // Notify Buyer
    const buyerDedupKey = `notif:${data.buyerId}:ReturnApproved:${data.returnId}:buyer`;
    if (!(await ctx.deduplicationService.isDuplicate(buyerDedupKey))) {
      const buyerContact = await ctx.userContactService.getContact(
        data.buyerId,
      );
      await ctx.notificationService.createAndEnqueue({
        userId: data.buyerId,
        contact: buyerContact,
        templateName: 'ReturnApproved_BUYER_hi',
        variables: { returnId: data.returnId, orderId: data.orderId },
        entityId: data.returnId,
        eventType: 'ReturnApproved',
        channels: ['sms', 'inApp'],
      });
      await ctx.deduplicationService.setProcessed(buyerDedupKey, 300);
    }

    // Notify Seller (INV-S8 Architecture Fix: Lookup sellerId via orderId since it's missing in §15.2 schema)
    const sellerId = await ctx.userContactService.getOrderSellerId(
      data.orderId,
    );
    if (sellerId) {
      const sellerDedupKey = `notif:${sellerId}:ReturnApproved:${data.returnId}:seller`;
      if (!(await ctx.deduplicationService.isDuplicate(sellerDedupKey))) {
        const sellerContact = await ctx.userContactService.getContact(sellerId);
        await ctx.notificationService.createAndEnqueue({
          userId: sellerId,
          contact: sellerContact,
          templateName: 'ReturnRaised_SELLER_hi',
          variables: { orderId: data.orderId },
          entityId: data.returnId,
          eventType: 'ReturnApproved',
          channels: ['inApp'],
        });
        await ctx.deduplicationService.setProcessed(sellerDedupKey, 300);
      }
    }
  };
}

export function createReturnRejectedHandler() {
  return async (payload: unknown, ctx: HandlerContext): Promise<void> => {
    const parsed = ReturnRejectedPayloadSchema.safeParse(payload);
    if (!parsed.success) return;
    const data = parsed.data;

    const dedupKey = `notif:${data.buyerId}:ReturnRejected:${data.returnId}`;
    if (await ctx.deduplicationService.isDuplicate(dedupKey)) return;

    const contact = await ctx.userContactService.getContact(data.buyerId);
    await ctx.notificationService.createAndEnqueue({
      userId: data.buyerId,
      contact,
      templateName: 'ReturnRejected_BUYER_hi',
      variables: { returnId: data.returnId, reason: data.reason },
      entityId: data.returnId,
      eventType: 'ReturnRejected',
      channels: ['sms', 'inApp'],
    });

    await ctx.deduplicationService.setProcessed(dedupKey, 300);
  };
}

export function createRefundInitiatedHandler() {
  return async (payload: unknown, ctx: HandlerContext): Promise<void> => {
    const parsed = RefundInitiatedPayloadSchema.safeParse(payload);
    if (!parsed.success) return;
    const data = parsed.data;

    const dedupKey = `notif:${data.buyerId}:RefundInitiated:${data.returnId}`;
    if (await ctx.deduplicationService.isDuplicate(dedupKey)) return;

    const contact = await ctx.userContactService.getContact(data.buyerId);
    await ctx.notificationService.createAndEnqueue({
      userId: data.buyerId,
      contact,
      templateName: 'RefundInitiated_BUYER_hi',
      variables: { returnId: data.returnId, amount: data.amount },
      entityId: data.returnId,
      eventType: 'RefundInitiated',
      channels: ['sms', 'email', 'inApp'],
    });

    await ctx.deduplicationService.setProcessed(dedupKey, 300);
  };
}

export function createDisputeOpenedHandler() {
  return async (payload: unknown, ctx: HandlerContext): Promise<void> => {
    const parsed = DisputeOpenedPayloadSchema.safeParse(payload);
    if (!parsed.success) return;
    const data = parsed.data;

    const dedupKey = `notif:${data.buyerId}:DisputeOpened:${data.disputeId}`;
    if (await ctx.deduplicationService.isDuplicate(dedupKey)) return;

    const contact = await ctx.userContactService.getContact(data.buyerId);
    await ctx.notificationService.createAndEnqueue({
      userId: data.buyerId,
      contact,
      templateName: 'DisputeOpened_BUYER_hi',
      variables: {
        disputeId: data.disputeId,
        orderId: data.orderId,
        priority: data.priority,
      },
      entityId: data.disputeId,
      eventType: 'DisputeOpened',
      channels: ['inApp'],
    });

    await ctx.deduplicationService.setProcessed(dedupKey, 300);
  };
}

export function createDisputeResolvedHandler() {
  return async (payload: unknown, ctx: HandlerContext): Promise<void> => {
    const parsed = DisputeResolvedPayloadSchema.safeParse(payload);
    if (!parsed.success) return;
    const data = parsed.data;

    const dedupKey = `notif:${data.buyerId}:DisputeResolved:${data.disputeId}`;
    if (await ctx.deduplicationService.isDuplicate(dedupKey)) return;

    const contact = await ctx.userContactService.getContact(data.buyerId);
    await ctx.notificationService.createAndEnqueue({
      userId: data.buyerId,
      contact,
      templateName: 'DisputeResolved_BUYER_hi',
      variables: { disputeId: data.disputeId, outcome: data.outcome },
      entityId: data.disputeId,
      eventType: 'DisputeResolved',
      channels: ['sms', 'inApp'],
    });

    await ctx.deduplicationService.setProcessed(dedupKey, 300);
  };
}

export function createQuoteCreatedHandler() {
  return async (payload: unknown, ctx: HandlerContext): Promise<void> => {
    const parsed = QuoteCreatedPayloadSchema.safeParse(payload);
    if (!parsed.success) return;
    const data = parsed.data;

    const dedupKey = `notif:${data.buyerId}:QuoteCreated:${data.quotationId}`;
    if (await ctx.deduplicationService.isDuplicate(dedupKey)) return;

    const contact = await ctx.userContactService.getContact(data.buyerId);
    await ctx.notificationService.createAndEnqueue({
      userId: data.buyerId,
      contact,
      templateName: 'QuoteReceived_BUYER_hi',
      variables: {
        quotationId: data.quotationId,
        totalPrice: data.totalPrice,
        validUntil: data.validUntil,
      },
      entityId: data.quotationId,
      eventType: 'QuoteCreated',
      channels: ['inApp'],
    });

    await ctx.deduplicationService.setProcessed(dedupKey, 300);
  };
}

export function createQuoteAcceptedHandler() {
  return async (payload: unknown, ctx: HandlerContext): Promise<void> => {
    const parsed = QuoteAcceptedPayloadSchema.safeParse(payload);
    if (!parsed.success) return;
    const data = parsed.data;

    const dedupKey = `notif:${data.sellerId}:QuoteAccepted:${data.quotationId}`;
    if (await ctx.deduplicationService.isDuplicate(dedupKey)) return;

    const contact = await ctx.userContactService.getContact(data.sellerId);
    await ctx.notificationService.createAndEnqueue({
      userId: data.sellerId,
      contact,
      templateName: 'QuoteAccepted_SELLER_hi',
      variables: { quotationId: data.quotationId, rfqId: data.rfqId },
      entityId: data.quotationId,
      eventType: 'QuoteAccepted',
      channels: ['sms', 'inApp'],
    });

    await ctx.deduplicationService.setProcessed(dedupKey, 300);
  };
}
