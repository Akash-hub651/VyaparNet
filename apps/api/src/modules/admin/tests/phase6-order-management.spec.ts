import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AdminOrderService } from '../services/admin-order.service';
import { AdminOrderRepository } from '../repositories/admin-order.repository';
import { AdminPayoutService } from '../services/admin-payout.service';
import {
  validateAdminTransition,
  validateSellerTransition,
} from '../../../modules/order/order-state-machine';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { NotificationService } from '../../notification/services/notification.service';
import { AuditSafeWriterService } from '../../security/audit/audit-safe-writer.service';
import { OrderStatus } from '@vyaparnet/database';

const ADMIN_ID = 'admin-1';
const ORDER_ID = 'order-1';
const IDEM_KEY = 'test-idem-key-456';
const MOCK_REQUEST = {
  ip: '127.0.0.1',
  headers: { 'user-agent': 'test-agent' },
} as any;

const makeOrder = (status: OrderStatus) => ({
  id: ORDER_ID,
  orderNumber: 'VN-20260601-12345',
  status,
  segment: 'TEXTILE',
  grandTotal: '5000.00',
  subtotal: '4500.00',
  buyerId: 'buyer-1',
  sellerId: 'biz-1',
  sellerName: 'Test Seller Biz',
  orderMonth: '2026-06',
  placedAt: '2026-06-01T00:00:00.000Z',
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
  buyer: {
    id: 'buyer-1',
    phone: '+91987654321',
    email: null,
    name: 'Test Buyer',
  },
  taxAmount: '500.00',
  shippingCost: '0.00',
  discount: '0.00',
  cancellationReason: null,
  statusHistory: [],
});

describe('AdminOrderService — Phase 6 Order Management', () => {
  let service: AdminOrderService;
  let orderRepo: any;
  let prismaService: any;
  let notificationService: any;
  let auditWriter: any;

  const buildTx = () => ({
    order: { update: vi.fn() },
    orderStatusHistory: { create: vi.fn() },
    eventOutbox: { create: vi.fn().mockResolvedValue({ id: 'ev-1' }) },
    sellerPayout: { create: vi.fn().mockResolvedValue({ id: 'payout-1' }) },
    platformCommission: { create: vi.fn().mockResolvedValue({ id: 'comm-1' }) },
    business: {
      findUnique: vi.fn().mockResolvedValue({ ownerId: 'seller-user-1' }),
    },
    featureFlag: { findMany: vi.fn().mockResolvedValue([]) },
  });

  beforeEach(async () => {
    orderRepo = {
      findMany: vi
        .fn()
        .mockResolvedValue({ data: [], nextCursor: null, hasMore: false }),
      findById: vi.fn().mockResolvedValue(makeOrder(OrderStatus.SHIPPED)),
      updateStatus: vi.fn().mockResolvedValue(undefined),
    };

    prismaService = {
      $transaction: vi
        .fn()
        .mockImplementation(async (fn: (tx: any) => Promise<unknown>) =>
          fn(buildTx()),
        ),
      featureFlag: { findMany: vi.fn().mockResolvedValue([]) },
    };

    notificationService = { sendDirect: vi.fn().mockResolvedValue(undefined) };
    auditWriter = { safeWrite: vi.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminOrderService,
        { provide: AdminOrderRepository, useValue: orderRepo },
        { provide: PrismaService, useValue: prismaService },
        { provide: NotificationService, useValue: notificationService },
        { provide: AuditSafeWriterService, useValue: auditWriter },
        {
          provide: AdminPayoutService,
          useValue: {
            calculatePayoutInsideTx: vi.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get(AdminOrderService);
  });

  // ─── validateAdminTransition unit tests (Step 6.1) ──────────────────────

  describe('validateAdminTransition (pure function)', () => {
    it('SHIPPED → DELIVERED is valid', () => {
      expect(() =>
        validateAdminTransition(OrderStatus.SHIPPED, OrderStatus.DELIVERED),
      ).not.toThrow();
    });

    it('DELIVERED → COMPLETED is valid', () => {
      expect(() =>
        validateAdminTransition(OrderStatus.DELIVERED, OrderStatus.COMPLETED),
      ).not.toThrow();
    });

    it('PLACED → CANCELLED with reason is valid', () => {
      expect(() =>
        validateAdminTransition(
          OrderStatus.PLACED,
          OrderStatus.CANCELLED,
          'Fraud detected by admin',
        ),
      ).not.toThrow();
    });

    it('PROCESSING → CANCELLED with reason is valid', () => {
      expect(() =>
        validateAdminTransition(
          OrderStatus.PROCESSING,
          OrderStatus.CANCELLED,
          'Admin force cancel',
        ),
      ).not.toThrow();
    });

    it('INV-S7-13 FOOTGUN-6-A: PROCESSING → DELIVERED throws INVALID_ADMIN_TRANSITION', () => {
      expect(() =>
        validateAdminTransition(OrderStatus.PROCESSING, OrderStatus.DELIVERED),
      ).toThrow(UnprocessableEntityException);
      try {
        validateAdminTransition(OrderStatus.PROCESSING, OrderStatus.DELIVERED);
      } catch (e: any) {
        expect(e.response.code).toBe('INVALID_ADMIN_TRANSITION');
      }
    });

    it('COMPLETED is terminal — throws ORDER_TERMINAL_STATE', () => {
      expect(() =>
        validateAdminTransition(OrderStatus.COMPLETED, OrderStatus.CANCELLED),
      ).toThrow(UnprocessableEntityException);
      try {
        validateAdminTransition(OrderStatus.COMPLETED, OrderStatus.CANCELLED);
      } catch (e: any) {
        expect(e.response.code).toBe('ORDER_TERMINAL_STATE');
      }
    });

    it('CANCELLED is terminal — throws ORDER_TERMINAL_STATE', () => {
      expect(() =>
        validateAdminTransition(OrderStatus.CANCELLED, OrderStatus.SHIPPED),
      ).toThrow(UnprocessableEntityException);
    });

    it('CANCELLED without reason throws CANCELLATION_REASON_REQUIRED', () => {
      expect(() =>
        validateAdminTransition(OrderStatus.PLACED, OrderStatus.CANCELLED),
      ).toThrow(UnprocessableEntityException);
      try {
        validateAdminTransition(OrderStatus.PLACED, OrderStatus.CANCELLED);
      } catch (e: any) {
        expect(e.response.code).toBe('CANCELLATION_REASON_REQUIRED');
      }
    });

    it('INV-S7-13: validateSellerTransition remains unmodified (DELIVERED still reserved)', () => {
      expect(() =>
        validateSellerTransition(OrderStatus.SHIPPED, OrderStatus.DELIVERED),
      ).toThrow(UnprocessableEntityException);
      try {
        validateSellerTransition(OrderStatus.SHIPPED, OrderStatus.DELIVERED);
      } catch (e: any) {
        expect(e.response.code).toBe('TRANSITION_RESERVED_FOR_ADMIN');
      }
    });
  });

  // ─── getOrderList ────────────────────────────────────────────────────────

  describe('getOrderList', () => {
    it('delegates to repo — no scope restriction (FOOTGUN-6-F)', async () => {
      await service.getOrderList({ limit: 20 });
      expect(orderRepo.findMany).toHaveBeenCalledWith({ limit: 20 });
    });
  });

  // ─── getOrderDetail ──────────────────────────────────────────────────────

  describe('getOrderDetail', () => {
    it('returns order with buyer PII for detail endpoint', async () => {
      orderRepo.findById.mockResolvedValueOnce(makeOrder(OrderStatus.SHIPPED));
      const result = await service.getOrderDetail(
        ORDER_ID,
        ADMIN_ID,
        MOCK_REQUEST,
      );
      expect(result.buyer.phone).toBeDefined(); // PII present in detail
    });

    it('throws NotFoundException for missing order', async () => {
      orderRepo.findById.mockResolvedValueOnce(null);
      await expect(
        service.getOrderDetail('missing', ADMIN_ID, MOCK_REQUEST),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── markDelivered ───────────────────────────────────────────────────────

  describe('markDelivered', () => {
    it('happy path: SHIPPED → DELIVERED', async () => {
      orderRepo.findById.mockResolvedValueOnce(makeOrder(OrderStatus.SHIPPED));
      await service.markDelivered(ORDER_ID, ADMIN_ID, IDEM_KEY, MOCK_REQUEST);

      expect(prismaService.$transaction).toHaveBeenCalledOnce();
      expect(orderRepo.updateStatus).toHaveBeenCalledWith(
        ORDER_ID,
        OrderStatus.SHIPPED,
        OrderStatus.DELIVERED,
        ADMIN_ID,
        expect.anything(),
        expect.anything(),
      );
      expect(auditWriter.safeWrite).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: ADMIN_ID,
          entityType: 'Order',
          newValue: expect.objectContaining({ status: OrderStatus.DELIVERED }),
        }),
      );
    });

    it('FOOTGUN-6-A: PROCESSING → DELIVERED throws (validateAdminTransition, not seller)', async () => {
      orderRepo.findById.mockResolvedValueOnce(
        makeOrder(OrderStatus.PROCESSING),
      );
      await expect(
        service.markDelivered(ORDER_ID, ADMIN_ID, IDEM_KEY, MOCK_REQUEST),
      ).rejects.toThrow(UnprocessableEntityException);
      // $transaction MUST NOT be called (validation is pre-tx)
      expect(prismaService.$transaction).not.toHaveBeenCalled();
    });

    it('INV-S7-6: OrderStatusChanged EventOutbox uses schemaVersion 5.0', async () => {
      orderRepo.findById.mockResolvedValueOnce(makeOrder(OrderStatus.SHIPPED));

      let capturedPayload: any;
      const tx = buildTx();
      tx.eventOutbox.create.mockImplementationOnce((args: any) => {
        capturedPayload = args.data;
        return { id: 'ev-1' };
      });
      prismaService.$transaction.mockImplementationOnce(async (fn: any) =>
        fn(tx),
      );

      await service.markDelivered(ORDER_ID, ADMIN_ID, IDEM_KEY, MOCK_REQUEST);

      expect(capturedPayload.schemaVersion).toBe('5.0'); // INV-S7-6 — NOT '7.0'
      expect(capturedPayload.eventMonth).toBeDefined(); // INV-S7-38
    });

    it('INV-S7-2: safeWrite() called OUTSIDE $transaction', async () => {
      const callOrder: string[] = [];
      orderRepo.findById.mockResolvedValueOnce(makeOrder(OrderStatus.SHIPPED));
      prismaService.$transaction.mockImplementationOnce(async (fn: any) => {
        callOrder.push('$transaction');
        return fn(buildTx());
      });
      auditWriter.safeWrite.mockImplementationOnce(async () => {
        callOrder.push('safeWrite');
      });

      await service.markDelivered(ORDER_ID, ADMIN_ID, IDEM_KEY, MOCK_REQUEST);

      expect(callOrder.indexOf('safeWrite')).toBeGreaterThan(
        callOrder.indexOf('$transaction'),
      );
    });

    it('throws NotFoundException for missing order', async () => {
      orderRepo.findById.mockResolvedValueOnce(null);
      await expect(
        service.markDelivered(ORDER_ID, ADMIN_ID, IDEM_KEY, MOCK_REQUEST),
      ).rejects.toThrow(NotFoundException);
    });

    it('notification failure does NOT block delivery (non-fatal)', async () => {
      orderRepo.findById.mockResolvedValueOnce(makeOrder(OrderStatus.SHIPPED));
      notificationService.sendDirect.mockRejectedValueOnce(
        new Error('SMS provider down'),
      );
      await expect(
        service.markDelivered(ORDER_ID, ADMIN_ID, IDEM_KEY, MOCK_REQUEST),
      ).resolves.not.toThrow();
    });
  });

  // ─── markCompleted ───────────────────────────────────────────────────────

  describe('markCompleted', () => {
    let adminPayoutService: any;

    beforeEach(async () => {
      adminPayoutService = {
        calculatePayoutInsideTx: vi.fn().mockResolvedValue(undefined),
      };
    });

    it('happy path: DELIVERED → COMPLETED — delegates payout to AdminPayoutService (INV-S7-35)', async () => {
      orderRepo.findById.mockResolvedValueOnce(
        makeOrder(OrderStatus.DELIVERED),
      );

      // Get the AdminPayoutService mock from the module
      const module2: TestingModule = await Test.createTestingModule({
        providers: [
          AdminOrderService,
          { provide: AdminOrderRepository, useValue: orderRepo },
          { provide: PrismaService, useValue: prismaService },
          { provide: NotificationService, useValue: notificationService },
          { provide: AuditSafeWriterService, useValue: auditWriter },
          { provide: AdminPayoutService, useValue: adminPayoutService },
        ],
      }).compile();
      const svc2 = module2.get(AdminOrderService);

      await svc2.markCompleted(ORDER_ID, ADMIN_ID, IDEM_KEY, MOCK_REQUEST);

      // Payout creation DELEGATED to AdminPayoutService (FOOTGUN-8-C: Decimal in service)
      expect(adminPayoutService.calculatePayoutInsideTx).toHaveBeenCalledOnce();
      expect(adminPayoutService.calculatePayoutInsideTx).toHaveBeenCalledWith(
        ORDER_ID,
        expect.objectContaining({ sellerId: 'biz-1' }),
        expect.anything(), // tx
        expect.objectContaining({
          commissionPercent: expect.any(Number),
          tdsRatePercent: expect.any(Number),
          gatewayFeePercent: expect.any(Number),
        }),
      );
    });

    it('FOOTGUN-6-D: SellerPayout created INSIDE $transaction (same fn call)', async () => {
      orderRepo.findById.mockResolvedValueOnce(
        makeOrder(OrderStatus.DELIVERED),
      );

      const payoutCallOrder: string[] = [];
      const tx = buildTx();
      tx.sellerPayout.create.mockImplementationOnce(async () => {
        payoutCallOrder.push('sellerPayout.create');
        return { id: 'payout-1' };
      });

      let txFnCalled = false;
      prismaService.$transaction.mockImplementationOnce(async (fn: any) => {
        txFnCalled = true;
        const result = await fn(tx);
        payoutCallOrder.push('$transaction.resolved');
        return result;
      });

      await service.markCompleted(ORDER_ID, ADMIN_ID, IDEM_KEY, MOCK_REQUEST);

      // SellerPayout must be created BEFORE transaction resolved (inside $tx)
      expect(payoutCallOrder.indexOf('sellerPayout.create')).toBeLessThan(
        payoutCallOrder.indexOf('$transaction.resolved'),
      );
      expect(txFnCalled).toBe(true);
    });

    it('FOOTGUN-6-A: SHIPPED → COMPLETED throws INVALID_ADMIN_TRANSITION', async () => {
      orderRepo.findById.mockResolvedValueOnce(makeOrder(OrderStatus.SHIPPED));
      await expect(
        service.markCompleted(ORDER_ID, ADMIN_ID, IDEM_KEY, MOCK_REQUEST),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(prismaService.$transaction).not.toHaveBeenCalled();
    });

    it('COMPLETED order throws ORDER_TERMINAL_STATE', async () => {
      orderRepo.findById.mockResolvedValueOnce(
        makeOrder(OrderStatus.COMPLETED),
      );
      await expect(
        service.markCompleted(ORDER_ID, ADMIN_ID, IDEM_KEY, MOCK_REQUEST),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('INV-S7-14: commission rates from FeatureFlag (not hardcoded) — rates passed to calculatePayoutInsideTx', async () => {
      orderRepo.findById.mockResolvedValueOnce(
        makeOrder(OrderStatus.DELIVERED),
      );

      // Use custom DB rates
      prismaService.featureFlag = {
        findMany: vi.fn().mockResolvedValue([
          { name: 'platform_commission_percent', rolloutPercent: 3 },
          { name: 'tds_rate_percent', rolloutPercent: 2 },
          { name: 'payment_gateway_fee_percent', rolloutPercent: 1 },
        ]),
      };

      const module3: TestingModule = await Test.createTestingModule({
        providers: [
          AdminOrderService,
          { provide: AdminOrderRepository, useValue: orderRepo },
          { provide: PrismaService, useValue: prismaService },
          { provide: NotificationService, useValue: notificationService },
          { provide: AuditSafeWriterService, useValue: auditWriter },
          {
            provide: AdminPayoutService,
            useValue: { calculatePayoutInsideTx: vi.fn().mockResolvedValue(undefined) },
          },
        ],
      }).compile();
      const svc3 = module3.get(AdminOrderService);
      const payoutSvc3 = module3.get(AdminPayoutService);

      await svc3.markCompleted(ORDER_ID, ADMIN_ID, IDEM_KEY, MOCK_REQUEST);

      // Rates from FeatureFlag (rolloutPercent=3 for commission)
      expect(payoutSvc3.calculatePayoutInsideTx).toHaveBeenCalledWith(
        ORDER_ID,
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ commissionPercent: 3 }), // reads flag, not hardcoded 2
      );
    });
  });

  // ─── forceCancel ─────────────────────────────────────────────────────────

  describe('forceCancel', () => {
    it('happy path: PLACED → CANCELLED with reason', async () => {
      orderRepo.findById.mockResolvedValueOnce(makeOrder(OrderStatus.PLACED));
      await service.forceCancel(
        ORDER_ID,
        { reason: 'Fraudulent order confirmed by admin team.' },
        ADMIN_ID,
        IDEM_KEY,
        MOCK_REQUEST,
      );

      expect(orderRepo.updateStatus).toHaveBeenCalledWith(
        ORDER_ID,
        OrderStatus.PLACED,
        OrderStatus.CANCELLED,
        ADMIN_ID,
        expect.anything(),
        expect.objectContaining({
          reason: 'Fraudulent order confirmed by admin team.',
        }),
      );
    });

    it('COMPLETED order throws ORDER_TERMINAL_STATE (pre-tx)', async () => {
      orderRepo.findById.mockResolvedValueOnce(
        makeOrder(OrderStatus.COMPLETED),
      );
      await expect(
        service.forceCancel(
          ORDER_ID,
          { reason: 'Trying to cancel completed order.' },
          ADMIN_ID,
          IDEM_KEY,
          MOCK_REQUEST,
        ),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(prismaService.$transaction).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for missing order', async () => {
      orderRepo.findById.mockResolvedValueOnce(null);
      await expect(
        service.forceCancel(
          ORDER_ID,
          { reason: 'Order not found anyway.' },
          ADMIN_ID,
          IDEM_KEY,
          MOCK_REQUEST,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('INV-S7-6: force-cancel EventOutbox uses schemaVersion 5.0', async () => {
      orderRepo.findById.mockResolvedValueOnce(makeOrder(OrderStatus.PLACED));

      let capturedPayload: any;
      const tx = buildTx();
      tx.eventOutbox.create.mockImplementationOnce((args: any) => {
        capturedPayload = args.data;
        return { id: 'ev-1' };
      });
      prismaService.$transaction.mockImplementationOnce(async (fn: any) =>
        fn(tx),
      );

      await service.forceCancel(
        ORDER_ID,
        { reason: 'Admin force cancel test for schema version.' },
        ADMIN_ID,
        IDEM_KEY,
        MOCK_REQUEST,
      );

      expect(capturedPayload.schemaVersion).toBe('5.0');
      expect(capturedPayload.eventType).toBe('OrderStatusChanged');
      expect(capturedPayload.eventMonth).toBeDefined(); // INV-S7-38
    });
  });
});
