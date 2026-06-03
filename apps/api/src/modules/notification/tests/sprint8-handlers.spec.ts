import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createReturnInitiatedHandler } from '../handlers/sprint8.handlers';

describe('Sprint 8 Handlers (INV-S6-3)', () => {
  let ctx: unknown;

  beforeEach(() => {
    ctx = {
      logger: { error: vi.fn(), log: vi.fn() },
      deduplicationService: { isDuplicate: vi.fn(), setProcessed: vi.fn() },
      userContactService: { getContact: vi.fn(), getOrderSellerId: vi.fn() },
      notificationService: { createAndEnqueue: vi.fn() },
    };
  });

  it('ReturnInitiatedHandler should reject invalid payload (safeParse)', async () => {
    const handler = createReturnInitiatedHandler();
    await handler({ returnId: 123 }, ctx); // Invalid payload

    expect(ctx.logger.error).toHaveBeenCalledWith(
      'Invalid ReturnInitiated payload',
      expect.any(Object),
    );
    expect(ctx.notificationService.createAndEnqueue).not.toHaveBeenCalled();
  });

  it('ReturnInitiatedHandler should process valid payload', async () => {
    const handler = createReturnInitiatedHandler();
    ctx.deduplicationService.isDuplicate.mockResolvedValue(false);
    ctx.userContactService.getContact.mockResolvedValue({ phone: '123' });

    const validPayload = {
      returnId: 'cuid123',
      orderId: 'cuid456',
      buyerId: 'cuid789',
      itemId: 'cuid000',
      segment: 'TEXTILE',
      reason: 'Defective',
      requestedAmount: '100.50',
    };

    await handler(validPayload, ctx);

    expect(ctx.notificationService.createAndEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        templateName: 'ReturnInitiated_BUYER_hi',
        eventType: 'ReturnInitiated',
        entityId: 'cuid123',
      }),
    );
    expect(ctx.deduplicationService.setProcessed).toHaveBeenCalledWith(
      expect.any(String),
      300,
    );
  });
});
