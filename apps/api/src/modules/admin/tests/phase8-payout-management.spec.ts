import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AdminPayoutService } from '../services/admin-payout.service';
import { AdminPayoutRepository } from '../repositories/admin-payout.repository';
import { AdminMetricsService } from '../services/admin-metrics.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AuditSafeWriterService } from '../../security/audit/audit-safe-writer.service';
import { PayoutStatus } from '@vyaparnet/database';

const ADMIN_ID = 'admin-1';
const PAYOUT_ID = 'payout-1';
const ORDER_ID = 'order-completed-1';
const SELLER_USER_ID = 'seller-user-1';
const MOCK_REQUEST = {
  ip: '127.0.0.1',
  headers: { 'user-agent': 'test-agent' },
} as any;

const makePayout = (status: PayoutStatus = PayoutStatus.PENDING) => ({
  id: PAYOUT_ID,
  orderId: ORDER_ID,
  sellerId: SELLER_USER_ID, // User.id — H-P0-3
  sellerName: 'Test Seller',
  grossAmount: '5000.00',
  platformFee: '100.00',   // 2%
  paymentGatewayFee: '100.00', // 2%
  tdsAmount: '48.00',     // 1% of net
  netPayout: '4752.00',
  status,
  utrNumber: null,
  transferDate: null,
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
});

describe('AdminPayoutService — Phase 8 Seller Payout Management', () => {
  let service: AdminPayoutService;
  let payoutRepo: any;
  let prismaService: any;
  let auditWriter: any;
  let metricsService: any;

  beforeEach(async () => {
    payoutRepo = {
      findMany: vi.fn().mockResolvedValue({
        data: [makePayout()],
        nextCursor: null,
        hasMore: false,
      }),
      findById: vi.fn().mockResolvedValue(makePayout()),
      initiateById: vi.fn().mockResolvedValue(undefined),
    };

    prismaService = {
      $transaction: vi
        .fn()
        .mockImplementation(async (fn: (tx: any) => Promise<unknown>) =>
          fn({}),
        ),
    };

    auditWriter = { safeWrite: vi.fn().mockResolvedValue(undefined) };
    
    metricsService = {
      payoutInitiatedTotal: { inc: vi.fn() },
      payoutAmountInitiatedInr: { inc: vi.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminPayoutService,
        { provide: AdminPayoutRepository, useValue: payoutRepo },
        { provide: PrismaService, useValue: prismaService },
        { provide: AuditSafeWriterService, useValue: auditWriter },
        { provide: AdminMetricsService, useValue: metricsService },
      ],
    }).compile();

    service = module.get(AdminPayoutService);
  });

  // ─── getPayoutList ────────────────────────────────────────────────────────

  describe('getPayoutList', () => {
    it('delegates to AdminPayoutRepository.findMany()', async () => {
      const result = await service.getPayoutList({ limit: 20 });

      expect(payoutRepo.findMany).toHaveBeenCalledWith({ limit: 20 });
      expect(result.data).toHaveLength(1);
      expect(result.data[0].sellerId).toBe(SELLER_USER_ID); // H-P0-3: User.id
    });

    it('passes filter to repo (status + sellerId)', async () => {
      await service.getPayoutList({
        limit: 10,
        status: 'PENDING',
        sellerId: SELLER_USER_ID,
      });

      expect(payoutRepo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'PENDING', sellerId: SELLER_USER_ID }),
      );
    });
  });

  // ─── getPayoutDetail ──────────────────────────────────────────────────────

  describe('getPayoutDetail', () => {
    it('returns payout detail', async () => {
      const result = await service.getPayoutDetail(PAYOUT_ID);
      expect(result.id).toBe(PAYOUT_ID);
      expect(result.status).toBe(PayoutStatus.PENDING);
    });

    it('throws NotFoundException for missing payout', async () => {
      payoutRepo.findById.mockResolvedValueOnce(null);
      await expect(service.getPayoutDetail('missing')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── initiatePayout ───────────────────────────────────────────────────────

  describe('initiatePayout', () => {
    it('happy path: PENDING → INITIATED atomically with audit outside tx', async () => {
      // Setup: findById returns PENDING on first call (check), then INITIATED (post-update)
      payoutRepo.findById
        .mockResolvedValueOnce(makePayout(PayoutStatus.PENDING)) // pre-tx check
        .mockResolvedValueOnce(makePayout(PayoutStatus.INITIATED)); // post-update return

      await service.initiatePayout(PAYOUT_ID, ADMIN_ID, MOCK_REQUEST);

      // FOOTGUN-8-B: initiateById called INSIDE $transaction
      expect(prismaService.$transaction).toHaveBeenCalledOnce();
      expect(payoutRepo.initiateById).toHaveBeenCalledWith(PAYOUT_ID, expect.anything());

      // INV-S7-2: safeWrite OUTSIDE $transaction
      expect(auditWriter.safeWrite).toHaveBeenCalledOnce();
    });

    it('INV-S7-2: safeWrite() called AFTER $transaction resolves', async () => {
      const callOrder: string[] = [];

      payoutRepo.findById
        .mockResolvedValueOnce(makePayout(PayoutStatus.PENDING))
        .mockResolvedValueOnce(makePayout(PayoutStatus.INITIATED));

      prismaService.$transaction.mockImplementationOnce(async (fn: any) => {
        callOrder.push('$transaction');
        return fn({});
      });
      auditWriter.safeWrite.mockImplementationOnce(async () => {
        callOrder.push('safeWrite');
      });

      await service.initiatePayout(PAYOUT_ID, ADMIN_ID, MOCK_REQUEST);

      expect(callOrder.indexOf('safeWrite')).toBeGreaterThan(
        callOrder.indexOf('$transaction'),
      );
    });

    it('throws UnprocessableEntityException for non-PENDING payout', async () => {
      payoutRepo.findById.mockResolvedValueOnce(makePayout(PayoutStatus.INITIATED));

      await expect(
        service.initiatePayout(PAYOUT_ID, ADMIN_ID, MOCK_REQUEST),
      ).rejects.toThrow(UnprocessableEntityException);

      // $transaction MUST NOT be called
      expect(prismaService.$transaction).not.toHaveBeenCalled();
    });

    it('throws UnprocessableEntityException for TRANSFERRED payout', async () => {
      payoutRepo.findById.mockResolvedValueOnce(makePayout(PayoutStatus.TRANSFERRED));

      await expect(
        service.initiatePayout(PAYOUT_ID, ADMIN_ID, MOCK_REQUEST),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('throws NotFoundException for missing payout', async () => {
      payoutRepo.findById.mockResolvedValueOnce(null);

      await expect(
        service.initiatePayout('missing', ADMIN_ID, MOCK_REQUEST),
      ).rejects.toThrow(NotFoundException);
    });

    it('audit log contains correct old/new status', async () => {
      payoutRepo.findById
        .mockResolvedValueOnce(makePayout(PayoutStatus.PENDING))
        .mockResolvedValueOnce(makePayout(PayoutStatus.INITIATED));

      await service.initiatePayout(PAYOUT_ID, ADMIN_ID, MOCK_REQUEST);

      expect(auditWriter.safeWrite).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: ADMIN_ID,
          entityType: 'SellerPayout',
          entityId: PAYOUT_ID,
          oldValue: { status: PayoutStatus.PENDING },
          newValue: { status: PayoutStatus.INITIATED },
        }),
      );
    });
  });

  // ─── FOOTGUN-8-B: Atomic status update ────────────────────────────────────

  describe('FOOTGUN-8-B: SellerPayout.status update atomic with $transaction', () => {
    it('initiateById is called INSIDE $transaction (not outside)', async () => {
      payoutRepo.findById
        .mockResolvedValueOnce(makePayout(PayoutStatus.PENDING))
        .mockResolvedValueOnce(makePayout(PayoutStatus.INITIATED));

      let initiateCalledInsideTx = false;
      prismaService.$transaction.mockImplementationOnce(async (fn: any) => {
        payoutRepo.initiateById.mockImplementationOnce(async () => {
          initiateCalledInsideTx = true;
        });
        return fn({});
      });

      await service.initiatePayout(PAYOUT_ID, ADMIN_ID, MOCK_REQUEST);

      expect(initiateCalledInsideTx).toBe(true);
    });
  });
});
