import { MetricsService } from '../../observability/metrics.service';
import { Test, TestingModule } from '@nestjs/testing';
import { ReturnsService } from './returns.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { OrderStatus, ReturnStatus, Prisma } from '@vyaparnet/database';
import { vi, describe, beforeEach, it, expect } from 'vitest';

describe('ReturnsService', () => {
  let service: ReturnsService;
  let prisma: any;
  let config: any;

  beforeEach(async () => {
    prisma = {
      order: { findUnique: vi.fn() },
      returnRequest: {
        findFirst: vi.fn(),
        create: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
      },
      dispute: { findFirst: vi.fn() },
      eventOutbox: { create: vi.fn() },
      $transaction: vi.fn((cb) => cb(prisma)),
    };

    config = {
      get: vi.fn().mockReturnValue('24'),
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
        ReturnsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = module.get<ReturnsService>(ReturnsService);
  });

  describe('validateReturnTransition', () => {
    it('should pass valid transition (STATE MACHINE)', () => {
      expect(() =>
        service.validateReturnTransition(
          ReturnStatus.PENDING,
          ReturnStatus.APPROVED_FOR_PICKUP,
        ),
      ).not.toThrow();
    });

    it('should reject invalid transition (STATE MACHINE)', () => {
      expect(() =>
        service.validateReturnTransition(
          ReturnStatus.PENDING,
          ReturnStatus.QC_APPROVED,
        ),
      ).toThrow(BadRequestException);
    });
  });

  describe('validateReturnEligibility', () => {
    const mockOrder = {
      id: 'ord_1',
      buyerId: 'buyer_1',
      status: OrderStatus.DELIVERED,
      segment: 'TEXTILE',
      items: [{ id: 'item_1', sellerId: 'seller_1' }],
    };

    it('should allow valid eligibility (HAPPY PATH)', async () => {
      prisma.order.findUnique.mockResolvedValue(mockOrder);
      prisma.returnRequest.findFirst.mockResolvedValue(null);
      prisma.dispute.findFirst.mockResolvedValue(null);

      const res = await service.validateReturnEligibility(
        'ord_1',
        'item_1',
        'buyer_1',
      );
      expect(res.order.id).toBe('ord_1');
    });

    it('should reject wrong actor (OWNERSHIP BOUNDARY)', async () => {
      prisma.order.findUnique.mockResolvedValue(mockOrder);
      await expect(
        service.validateReturnEligibility('ord_1', 'item_1', 'buyer_2'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject PROCESSING order', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...mockOrder,
        status: OrderStatus.PROCESSING,
      });
      await expect(
        service.validateReturnEligibility('ord_1', 'item_1', 'buyer_1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject if active return exists', async () => {
      prisma.order.findUnique.mockResolvedValue(mockOrder);
      prisma.returnRequest.findFirst.mockResolvedValue({ id: 'ret_1' });
      await expect(
        service.validateReturnEligibility('ord_1', 'item_1', 'buyer_1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject if active dispute exists (INV-S8-39)', async () => {
      prisma.order.findUnique.mockResolvedValue(mockOrder);
      prisma.returnRequest.findFirst.mockResolvedValue(null);
      prisma.dispute.findFirst.mockResolvedValue({ id: 'disp_1' });
      await expect(
        service.validateReturnEligibility('ord_1', 'item_1', 'buyer_1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject if order not found', async () => {
      prisma.order.findUnique.mockResolvedValue(null);
      await expect(
        service.validateReturnEligibility('ord_99', 'item_1', 'buyer_1'),
      ).rejects.toThrow('Order not found');
    });

    it('should reject if item not found in order', async () => {
      prisma.order.findUnique.mockResolvedValue(mockOrder);
      await expect(
        service.validateReturnEligibility('ord_1', 'item_99', 'buyer_1'),
      ).rejects.toThrow('Item not found in order');
    });

    it('should reject if return window has expired', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...mockOrder,
        deliveredAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago (config mocked to 24)
      });
      await expect(
        service.validateReturnEligibility('ord_1', 'item_1', 'buyer_1'),
      ).rejects.toThrow('Return window has expired');
    });
  });

  describe('createReturnRequest', () => {
    it('should create return request atomically (FINANCIAL INTEGRITY)', async () => {
      vi.spyOn(service, 'validateReturnEligibility').mockResolvedValue({
        order: { id: 'ord_1', buyerId: 'buyer_1', segment: 'TEXTILE' } as any,
        item: { id: 'item_1', sellerId: 'seller_1' } as any,
      });

      const mockCreatedReturn = {
        id: 'ret_1',
        orderId: 'ord_1',
        itemId: 'item_1',
        sellerId: 'seller_1',
        reason: 'DAMAGED',
        description: 'Broken',
        status: ReturnStatus.PENDING,
        requestedRefundAmount: new Prisma.Decimal('100.50'),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prisma.returnRequest.create.mockResolvedValue(mockCreatedReturn);

      const res = await service.createReturnRequest('buyer_1', {
        orderId: 'ord_1',
        itemId: 'item_1',
        reason: 'DAMAGED',
        description: 'Broken',
        images: [],
        requestedRefundAmount: '100.50',
      });

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.returnRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            requestedRefundAmount: new Prisma.Decimal('100.50'),
          }),
        }),
      );
      expect(prisma.eventOutbox.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ schemaVersion: '8.0' }),
        }),
      );
      expect(res.id).toBe('ret_1');
      expect(res.requestedRefundAmount).toBe('100.5');
    });
  });
});
