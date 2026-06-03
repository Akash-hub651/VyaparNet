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

    it('should create dispute atomically and hold payout (FINANCIAL INTEGRITY + INV-S8-9)', async () => {
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

      const res = await service.createDispute('buyer_1', {
        orderId: 'ord_1',
        reason: 'Item defective',
        description: 'Does not work',
      });

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.dispute.create).toHaveBeenCalled();
      // Atomic payout hold verification
      expect(prisma.sellerPayout.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            orderId: 'ord_1',
            status: { in: [PayoutStatus.PENDING, PayoutStatus.INITIATED] },
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
