import { MetricsService } from '../../observability/metrics.service';
import { Test, TestingModule } from '@nestjs/testing';
import { DisputesService } from './disputes.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { OrderStatus, DisputeStatus, PayoutStatus } from '@vyaparnet/database';
import { vi, describe, beforeEach, it, expect } from 'vitest';

describe('DisputesService', () => {
  let service: DisputesService;
  let prisma: any;
  let config: any;

  beforeEach(async () => {
    prisma = {
      order: { findUnique: vi.fn() },
      returnRequest: { findFirst: vi.fn() },
      dispute: {
        findFirst: vi.fn(),
        create: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        count: vi.fn(), // INV-S8-7: max 3 disputes per orderId
      },

      sellerPayout: { updateMany: vi.fn() },
      eventOutbox: { create: vi.fn() },
      $transaction: vi.fn((cb) => cb(prisma)),
    };

    config = {
      get: vi.fn().mockReturnValue('48'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: MetricsService,
          useValue: {
            rfqCreatedTotal: { inc: vi.fn() },
            quoteSubmittedTotal: { inc: vi.fn() },
            quoteAcceptedTotal: { inc: vi.fn() },
            quoteConvertedToOrderTotal: { inc: vi.fn() },
            returnRequestsTotal: { inc: vi.fn() },
            returnRefundAmountTotal: { inc: vi.fn() },
            disputeOpenedTotal: { inc: vi.fn() },
            disputeResolvedTotal: { inc: vi.fn() },
            disputeResolutionTimeSeconds: { observe: vi.fn() },
            refundInitiatedTotal: { inc: vi.fn() },
            refundAmountTotal: { set: vi.fn() },
            buyerLedgerEntriesTotal: { inc: vi.fn() },
          },
        },
        DisputesService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = module.get<DisputesService>(DisputesService);
  });

  describe('validateDisputeTransition', () => {
    it('should pass valid transition (STATE MACHINE)', () => {
      expect(() =>
        service.validateDisputeTransition(
          DisputeStatus.OPEN,
          DisputeStatus.UNDER_REVIEW,
        ),
      ).not.toThrow();
    });

    it('should reject invalid transition (STATE MACHINE)', () => {
      expect(() =>
        service.validateDisputeTransition(
          DisputeStatus.OPEN,
          DisputeStatus.ESCALATED,
        ),
      ).toThrow(BadRequestException);
    });
  });

  describe('createDispute', () => {
    const mockOrder = {
      id: 'ord_1',
      buyerId: 'buyer_1',
      status: OrderStatus.DELIVERED,
      segment: 'TEXTILE',
    };

    it('should create dispute atomically and hold PENDING payout only (OBS-DSR8-2 + INV-S8-9)', async () => {
      prisma.order.findUnique.mockResolvedValue(mockOrder);
      prisma.returnRequest.findFirst.mockResolvedValue(null);
      prisma.dispute.findFirst.mockResolvedValue(null);

      const mockCreatedDispute = {
        id: 'disp_1',
        orderId: 'ord_1',
        raisedBy: 'buyer_1',
        reason: 'Item defective',
        description: 'Does not work',
        status: DisputeStatus.OPEN,
        priority: 'MEDIUM',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prisma.dispute.create.mockResolvedValue(mockCreatedDispute);
      // INV-S8-7: 0 prior disputes — under the limit of 3
      prisma.dispute.count.mockResolvedValue(0);

      const res = await service.createDispute('buyer_1', {
        orderId: 'ord_1',
        reason: 'Item defective',
        description: 'Does not work',
      });

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.dispute.create).toHaveBeenCalled();

      // OBS-DSR8-2: D-PAY-2 — Only PENDING payouts auto-held.
      // INITIATED payouts (seller received bank transfer) must NOT be held.
      expect(prisma.sellerPayout.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            orderId: 'ord_1',
            status: PayoutStatus.PENDING, // OBS-DSR8-2: direct equality — NOT { in: [PENDING, INITIATED] }
          }),
          data: expect.objectContaining({ status: PayoutStatus.ON_HOLD }),
        }),
      );
      expect(prisma.eventOutbox.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ schemaVersion: '8.0' }),
        }),
      );
      expect(res.id).toBe('disp_1');
    });

    // OBS-DSR8-2 REGRESSION: INITIATED payouts must NOT be included in the hold filter
    it('OBS-DSR8-2: INITIATED payout must NOT be auto-held on dispute creation (D-PAY-2)', async () => {
      prisma.order.findUnique.mockResolvedValue(mockOrder);
      prisma.returnRequest.findFirst.mockResolvedValue(null);
      prisma.dispute.findFirst.mockResolvedValue(null);
      prisma.dispute.count.mockResolvedValue(0);
      prisma.dispute.create.mockResolvedValue({
        id: 'disp_99', orderId: 'ord_1', raisedBy: 'buyer_1',
        reason: 'Test', description: 'Test', status: DisputeStatus.OPEN,
        priority: 'MEDIUM', createdAt: new Date(), updatedAt: new Date(),
      });

      await service.createDispute('buyer_1', { orderId: 'ord_1', reason: 'Test', description: 'Test' });

      const payoutCall = prisma.sellerPayout.updateMany.mock.calls[0][0];
      // Status filter must be PENDING directly — not an { in: [...] } object
      expect(payoutCall.where.status).toBe(PayoutStatus.PENDING);
      // INITIATED must NOT appear in any filter
      const s = payoutCall.where.status;
      if (typeof s === 'object' && s !== null && 'in' in s) {
        expect(s.in).not.toContain(PayoutStatus.INITIATED);
      }
    });

    it('should reject wrong actor (OWNERSHIP BOUNDARY)', async () => {
      prisma.order.findUnique.mockResolvedValue(mockOrder);
      await expect(
        service.createDispute('buyer_2', { orderId: 'ord_1', reason: 'a' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject if active return exists (INV-S8-39 mutual exclusion)', async () => {
      prisma.order.findUnique.mockResolvedValue(mockOrder);
      prisma.returnRequest.findFirst.mockResolvedValue({ id: 'ret_1' });
      await expect(
        service.createDispute('buyer_1', { orderId: 'ord_1', reason: 'a' }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
