import { describe, it, expect } from 'vitest';
import {
  OrderCreatedPayloadSchema,
  StockLowPayloadSchema,
  NotificationPreferenceSchema,
  PushUnsubscribeSchema,
  DEFAULT_NOTIFICATION_PREFERENCES,
} from '@vyaparnet/types';

describe('Phase 1 — Shared Contracts & DTOs', () => {
  it('OrderCreatedPayloadSchema.parse({...}) succeeds in unit test', () => {
    // Standard Sprint 4 event payload format
    const validPayload = {
      orderId: 'order-123',
      orderNumber: 'ORD-987654',
      buyerId: 'buyer-777',
      sellerId: 'seller-888',
      segment: 'TEXTILE',
      grandTotal: '1500.50',
      paymentMethod: 'RAZORPAY',
      timestamp: new Date().toISOString(),
    };

    const parsed = OrderCreatedPayloadSchema.parse(validPayload);
    expect(parsed.orderId).toBe('order-123');
    expect(parsed.grandTotal).toBe('1500.50');
  });

  it('OrderCreatedPayloadSchema.parse({...}) succeeds with Sprint 4/5 actual number fields and extra properties', () => {
    // Actual orders.service.ts format — number for grandTotal, missing top-level sellerId, extra items/shippingAddress
    const actualOutboxPayload = {
      orderId: 'order-123',
      orderNumber: 'ORD-987654',
      buyerId: 'buyer-777',
      segment: 'SPARE_PARTS',
      grandTotal: 1500.5, // number type in real outbox!
      paymentMethod: 'ONLINE_UPI',
      placedAt: new Date().toISOString(),
      orderMonth: '2026-05',
      items: [
        {
          productId: 'p1',
          productName: 'Gear',
          quantity: 2,
          unitPrice: 750.25,
          totalPrice: 1500.5,
        },
      ],
      shippingAddress: { name: 'Acme', line1: 'Road 1' },
    };

    const parsed = OrderCreatedPayloadSchema.parse(actualOutboxPayload);
    expect(parsed.orderId).toBe('order-123');
    expect(parsed.grandTotal).toBe('1500.5'); // transformed to string!
    expect(parsed.sellerId).toBeUndefined();
    expect(parsed.paymentMethod).toBe('ONLINE_UPI');
  });

  it('StockLowPayloadSchema.parse({...}) succeeds in unit test', () => {
    const validPayload = {
      productId: 'prod-456',
      productName: 'Silk Fabric Premium',
      businessId: 'biz-789',
      segment: 'TEXTILE',
      currentStock: 5,
      threshold: 10,
      timestamp: new Date().toISOString(),
    };

    const parsed = StockLowPayloadSchema.parse(validPayload);
    expect(parsed.productId).toBe('prod-456');
    expect(parsed.currentStock).toBe(5);
  });

  it('NotificationPreferenceSchema.parse(DEFAULT_NOTIFICATION_PREFERENCES) succeeds', () => {
    const parsed = NotificationPreferenceSchema.parse(
      DEFAULT_NOTIFICATION_PREFERENCES,
    );
    expect(parsed.sms.orderUpdates).toBe(true);
    expect(parsed.inApp.scorecard).toBe(true);
  });

  it('PushUnsubscribeSchema.parse({ endpoint: "https://..." }) succeeds', () => {
    const validPayload = {
      endpoint: 'https://updates.vyaparnet.in/push/sub-123',
    };
    const parsed = PushUnsubscribeSchema.parse(validPayload);
    expect(parsed.endpoint).toBe('https://updates.vyaparnet.in/push/sub-123');
  });

  it('PushUnsubscribeSchema.parse({ endpoint: "not-a-url" }) fails', () => {
    const invalidPayload = { endpoint: 'not-a-url' };
    const result = PushUnsubscribeSchema.safeParse(invalidPayload);
    expect(result.success).toBe(false);
  });
});
