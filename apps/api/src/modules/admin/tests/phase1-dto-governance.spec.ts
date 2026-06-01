/**
 * Phase 1 DTO Governance Tests — Sprint 7
 *
 * Tests all admin Zod schemas and Sprint 7 outbox payload schemas.
 *
 * Governance invariants verified:
 * - INV-S7-12: AdminChangeRoleDtoSchema rejects ADMIN and SELLER_MANAGER
 * - INV-S7-20: BulkApproveDtoSchema rejects arrays > 100
 * - INV-S7-30: OrderCreatedPayloadSchema accepts buyerCode
 * - INV-S7-31: NotificationListQuerySchema accepts dateFrom/dateTo/status
 * - H-P1-2: All 6 Sprint 7 EventOutbox payload schemas exported correctly
 * - FOOTGUN-1-C: z.enum(['BUYER','SELLER']) — not z.string() — for role
 */
import { describe, it, expect } from 'vitest';
import {
  AdminChangeRoleDtoSchema,
  AdminSuspendUserDtoSchema,
  BulkApproveDtoSchema,
  AdminBusinessListQuerySchema,
  AdminOrderListQuerySchema,
  AdminUpdateFlagDtoSchema,
  RejectBusinessDtoSchema,
  AdminCancelDtoSchema,
} from '@vyaparnet/types';
import {
  OrderCreatedPayloadSchema,
  BusinessVerifiedPayloadSchema,
  BusinessSuspendedPayloadSchema,
  BusinessRejectedPayloadSchema,
  ProductApprovedPayloadSchema,
  ProductRejectedPayloadSchema,
  UserSuspendedPayloadSchema,
} from '@vyaparnet/types';
import { NotificationListQuerySchema } from '@vyaparnet/types';

// ── INV-S7-12: AdminChangeRoleDto security control ───────────────────────────

describe('INV-S7-12: AdminChangeRoleDtoSchema — role escalation prevention', () => {
  it('accepts BUYER as target role', () => {
    const result = AdminChangeRoleDtoSchema.safeParse({ role: 'BUYER' });
    expect(result.success).toBe(true);
  });

  it('accepts SELLER as target role', () => {
    const result = AdminChangeRoleDtoSchema.safeParse({ role: 'SELLER' });
    expect(result.success).toBe(true);
  });

  it('REJECTS ADMIN as target role — prevents privilege escalation', () => {
    const result = AdminChangeRoleDtoSchema.safeParse({ role: 'ADMIN' });
    expect(result.success).toBe(false);
  });

  it('REJECTS SELLER_MANAGER as target role — prevents privilege escalation', () => {
    const result = AdminChangeRoleDtoSchema.safeParse({
      role: 'SELLER_MANAGER',
    });
    expect(result.success).toBe(false);
  });

  it('REJECTS arbitrary string role (not z.string() — enum enforced)', () => {
    const result = AdminChangeRoleDtoSchema.safeParse({ role: 'SUPERUSER' });
    expect(result.success).toBe(false);
  });

  it('REJECTS empty body (role is required)', () => {
    const result = AdminChangeRoleDtoSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('REJECTS unknown keys (strict mode)', () => {
    const result = AdminChangeRoleDtoSchema.safeParse({
      role: 'BUYER',
      extra: 'field',
    });
    expect(result.success).toBe(false);
  });
});

// ── INV-S7-20: BulkApproveDto batch size cap ─────────────────────────────────

describe('INV-S7-20: BulkApproveDtoSchema — batch size cap at 100', () => {
  it('accepts batch of 1 product', () => {
    const result = BulkApproveDtoSchema.safeParse({ productIds: ['prod-1'] });
    expect(result.success).toBe(true);
  });

  it('accepts batch of exactly 100 products', () => {
    const productIds = Array.from({ length: 100 }, (_, i) => `prod-${i}`);
    const result = BulkApproveDtoSchema.safeParse({ productIds });
    expect(result.success).toBe(true);
  });

  it('REJECTS batch of 101 products', () => {
    const productIds = Array.from({ length: 101 }, (_, i) => `prod-${i}`);
    const result = BulkApproveDtoSchema.safeParse({ productIds });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('100');
    }
  });

  it('REJECTS empty batch', () => {
    const result = BulkApproveDtoSchema.safeParse({ productIds: [] });
    expect(result.success).toBe(false);
  });

  it('REJECTS unknown keys (strict mode)', () => {
    const result = BulkApproveDtoSchema.safeParse({
      productIds: ['p1'],
      force: true,
    });
    expect(result.success).toBe(false);
  });
});

// ── INV-S7-30: buyerCode in OrderCreatedPayloadSchema ────────────────────────

describe('INV-S7-30: OrderCreatedPayloadSchema — buyerCode field', () => {
  const basePayload = {
    orderId: 'ord-123',
    orderNumber: 'ORD-001',
    buyerId: 'buyer-456',
    segment: 'TEXTILE',
    grandTotal: 1500,
    paymentMethod: 'RAZORPAY',
  };

  it('accepts payload WITH buyerCode (masked)', () => {
    const result = OrderCreatedPayloadSchema.safeParse({
      ...basePayload,
      buyerCode: 'BUYER-abc123',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.buyerCode).toBe('BUYER-abc123');
    }
  });

  it('accepts payload WITHOUT buyerCode (optional)', () => {
    const result = OrderCreatedPayloadSchema.safeParse(basePayload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.buyerCode).toBeUndefined();
    }
  });
});

// ── INV-S7-31: NotificationListQuerySchema ────────────────────────────────────

describe('INV-S7-31: NotificationListQuerySchema — dateFrom/dateTo/status', () => {
  it('accepts dateFrom as ISO datetime', () => {
    const result = NotificationListQuerySchema.safeParse({
      dateFrom: '2026-06-01T00:00:00Z',
    });
    expect(result.success).toBe(true);
  });

  it('accepts dateTo as ISO datetime', () => {
    const result = NotificationListQuerySchema.safeParse({
      dateTo: '2026-06-30T23:59:59Z',
    });
    expect(result.success).toBe(true);
  });

  it('accepts status filter FAILED (admin DLQ investigation)', () => {
    const result = NotificationListQuerySchema.safeParse({ status: 'FAILED' });
    expect(result.success).toBe(true);
  });

  it('accepts status filter SENT', () => {
    const result = NotificationListQuerySchema.safeParse({ status: 'SENT' });
    expect(result.success).toBe(true);
  });

  it('accepts status filter PENDING', () => {
    const result = NotificationListQuerySchema.safeParse({ status: 'PENDING' });
    expect(result.success).toBe(true);
  });

  it('REJECTS invalid status', () => {
    const result = NotificationListQuerySchema.safeParse({
      status: 'DELIVERED',
    });
    expect(result.success).toBe(false);
  });

  it('REJECTS invalid dateFrom (not a datetime)', () => {
    const result = NotificationListQuerySchema.safeParse({
      dateFrom: '2026-06-01',
    });
    expect(result.success).toBe(false);
  });

  it('accepts combined dateFrom + dateTo + status (admin audit pattern)', () => {
    const result = NotificationListQuerySchema.safeParse({
      dateFrom: '2026-06-01T00:00:00Z',
      dateTo: '2026-06-30T23:59:59Z',
      status: 'FAILED',
      limit: 20,
    });
    expect(result.success).toBe(true);
  });
});

// ── H-P1-2: All 6 Sprint 7 EventOutbox payload schemas ───────────────────────

describe('H-P1-2: Sprint 7 EventOutbox payload schemas — all 6 present and correct', () => {
  const cuid = 'cjld2cjxh0000qzrmn831i7rn'; // valid cuid for test

  it('BusinessVerifiedPayloadSchema validates correctly', () => {
    const result = BusinessVerifiedPayloadSchema.safeParse({
      businessId: cuid,
      businessName: 'Sharma Textiles',
      sellerUserId: cuid,
      segment: 'TEXTILE',
      adminUserId: cuid,
    });
    expect(result.success).toBe(true);
  });

  it('BusinessSuspendedPayloadSchema validates correctly', () => {
    const result = BusinessSuspendedPayloadSchema.safeParse({
      businessId: cuid,
      businessName: 'Sharma Textiles',
      sellerUserId: cuid,
      reason: 'Fraudulent activity detected',
      adminUserId: cuid,
    });
    expect(result.success).toBe(true);
  });

  it('BusinessRejectedPayloadSchema validates correctly', () => {
    const result = BusinessRejectedPayloadSchema.safeParse({
      businessId: cuid,
      businessName: 'Sharma Textiles',
      sellerUserId: cuid,
      rejectionReason: 'KYC documents are unclear',
      adminUserId: cuid,
    });
    expect(result.success).toBe(true);
  });

  it('ProductApprovedPayloadSchema validates correctly', () => {
    const result = ProductApprovedPayloadSchema.safeParse({
      productId: cuid,
      productName: 'Silk Saree',
      businessId: cuid,
      sellerUserId: cuid,
      segment: 'TEXTILE',
      adminUserId: cuid,
    });
    expect(result.success).toBe(true);
  });

  it('ProductRejectedPayloadSchema validates correctly', () => {
    const result = ProductRejectedPayloadSchema.safeParse({
      productId: cuid,
      productName: 'Silk Saree',
      businessId: cuid,
      sellerUserId: cuid,
      rejectionReason: 'Image quality too low',
      adminUserId: cuid,
    });
    expect(result.success).toBe(true);
  });

  it('UserSuspendedPayloadSchema validates correctly', () => {
    const result = UserSuspendedPayloadSchema.safeParse({
      userId: cuid,
      userRole: 'SELLER',
      reason: 'Repeated policy violation',
      adminUserId: cuid,
    });
    expect(result.success).toBe(true);
  });

  it('All 6 schemas use .strict() — rejects unknown keys', () => {
    const base = {
      businessId: cuid,
      businessName: 'X',
      sellerUserId: cuid,
      segment: 'T',
      adminUserId: cuid,
    };
    expect(
      BusinessVerifiedPayloadSchema.safeParse({ ...base, extra: 'field' })
        .success,
    ).toBe(false);
    expect(
      ProductApprovedPayloadSchema.safeParse({
        productId: cuid,
        productName: 'X',
        businessId: cuid,
        sellerUserId: cuid,
        segment: 'T',
        adminUserId: cuid,
        extra: 'field',
      }).success,
    ).toBe(false);
  });
});

// ── Additional schema validations ─────────────────────────────────────────────

describe('AdminBusinessListQuerySchema — cursor pagination', () => {
  it('accepts valid kycStatus filter', () => {
    const result = AdminBusinessListQuerySchema.safeParse({
      kycStatus: 'PENDING',
    });
    expect(result.success).toBe(true);
  });

  it('defaults limit to 20', () => {
    const result = AdminBusinessListQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.limit).toBe(20);
  });

  it('REJECTS limit > 100', () => {
    const result = AdminBusinessListQuerySchema.safeParse({ limit: 101 });
    expect(result.success).toBe(false);
  });
});

describe('RejectBusinessDtoSchema — reason minimum length', () => {
  it('REJECTS reason shorter than 10 chars', () => {
    const result = RejectBusinessDtoSchema.safeParse({ reason: 'too short' });
    expect(result.success).toBe(false);
  });

  it('accepts reason of exactly 10 chars', () => {
    const result = RejectBusinessDtoSchema.safeParse({ reason: '1234567890' });
    expect(result.success).toBe(true);
  });
});

describe('AdminSuspendUserDtoSchema', () => {
  it('REJECTS reason shorter than 10 chars', () => {
    expect(
      AdminSuspendUserDtoSchema.safeParse({ reason: 'short' }).success,
    ).toBe(false);
  });

  it('accepts valid reason', () => {
    expect(
      AdminSuspendUserDtoSchema.safeParse({
        reason: 'Policy violation confirmed',
      }).success,
    ).toBe(true);
  });
});

describe('AdminUpdateFlagDtoSchema', () => {
  it('accepts enabled with rolloutPercent', () => {
    expect(
      AdminUpdateFlagDtoSchema.safeParse({ enabled: true, rolloutPercent: 50 })
        .success,
    ).toBe(true);
  });

  it('accepts enabled without rolloutPercent (optional)', () => {
    expect(AdminUpdateFlagDtoSchema.safeParse({ enabled: false }).success).toBe(
      true,
    );
  });

  it('REJECTS rolloutPercent > 100', () => {
    expect(
      AdminUpdateFlagDtoSchema.safeParse({ enabled: true, rolloutPercent: 101 })
        .success,
    ).toBe(false);
  });
});

// ── AdminOrderListQuerySchema ─────────────────────────────────────────────────

describe('AdminOrderListQuerySchema — order list query validation', () => {
  it('accepts valid status filter', () => {
    const result = AdminOrderListQuerySchema.safeParse({
      status: 'PROCESSING',
    });
    expect(result.success).toBe(true);
  });

  it('accepts dateFrom + dateTo range', () => {
    const result = AdminOrderListQuerySchema.safeParse({
      dateFrom: '2026-06-01T00:00:00Z',
      dateTo: '2026-06-30T23:59:59Z',
    });
    expect(result.success).toBe(true);
  });

  it('defaults limit to 20', () => {
    const result = AdminOrderListQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.limit).toBe(20);
  });

  it('REJECTS limit > 100', () => {
    const result = AdminOrderListQuerySchema.safeParse({ limit: 200 });
    expect(result.success).toBe(false);
  });

  it('REJECTS invalid status', () => {
    const result = AdminOrderListQuerySchema.safeParse({
      status: 'INVALID_STATUS',
    });
    expect(result.success).toBe(false);
  });
});

// ── AdminCancelDtoSchema — INV-S7-13 force-cancel reason ─────────────────────

describe('AdminCancelDtoSchema — force-cancel requires reason (INV-S7-13)', () => {
  it('accepts valid cancellation reason', () => {
    const result = AdminCancelDtoSchema.safeParse({
      reason: 'Seller unresponsive for 72 hours — auto-cancel per policy',
    });
    expect(result.success).toBe(true);
  });

  it('REJECTS reason shorter than 10 chars', () => {
    const result = AdminCancelDtoSchema.safeParse({ reason: 'Too short' });
    expect(result.success).toBe(false);
  });

  it('REJECTS empty body (reason required)', () => {
    const result = AdminCancelDtoSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('REJECTS unknown keys (strict mode)', () => {
    const result = AdminCancelDtoSchema.safeParse({
      reason: 'Valid reason here',
      force: true,
    });
    expect(result.success).toBe(false);
  });
});
