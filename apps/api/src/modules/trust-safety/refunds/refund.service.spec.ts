import { Test, TestingModule } from '@nestjs/testing';
import { RefundService } from './refund.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { BuyerLedgerRepository } from './buyer-ledger.repository';
import { MetricsService } from '../../observability/metrics.service';
import { Prisma, ReturnStatus, PaymentStatus } from '@vyaparnet/database';
import { UnprocessableEntityException } from '@nestjs/common';
import { vi, describe, beforeEach, it, expect } from 'vitest';

describe('RefundService', () => {
  let service: RefundService;
  let prisma: any;
  let buyerLedgerRepo: any;
  let metricsService: any;

  beforeEach(async () => {
    prisma = {
      returnRequest: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      payment: {
        findFirst: vi.fn(),
        update: vi.fn(),
      },
      eventOutbox: { create: vi.fn() },
      $transaction: vi.fn((cb) => cb(prisma)),
    };

    buyerLedgerRepo = {
      findByReturnId: vi.fn(),
      findLatestBalance: vi.fn(),
      create: vi.fn(),
    };

    metricsService = {
      refundInitiatedTotal: { inc: vi.fn() },
      refundAmountTotal: { set: vi.fn() },
      buyerLedgerEntriesTotal: { inc: vi.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefundService,
        { provide: PrismaService, useValue: prisma },
        { provide: BuyerLedgerRepository, useValue: buyerLedgerRepo },
        { provide: MetricsService, useValue: metricsService },
      ],
    }).compile();

    service = module.get<RefundService>(RefundService);
  });

  describe('initiateRefund', () => {
    const mockReturn = {
      id: 'ret_1',
      orderId: 'ord_1',
      status: ReturnStatus.QC_APPROVED,
      requestedRefundAmount: new Prisma.Decimal('100.00'),
      order: {
        buyerId: 'buyer_1',
        segment: 'TEXTILE',
      },
    };

    it('should reject if existing ledger entry is found (Double-Refund Guard INV-S8-41)', async () => {
      prisma.returnRequest.findUnique.mockResolvedValue(mockReturn);
      buyerLedgerRepo.findByReturnId.mockResolvedValue({ id: 'ledger_1' });

      await expect(
        service.initiateRefund('ret_1', '100.00', 'actor_1'),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(buyerLedgerRepo.findByReturnId).toHaveBeenCalledWith('ret_1');
    });

    it('should reject if approved amount > requested amount (INV-S8-37)', async () => {
      prisma.returnRequest.findUnique.mockResolvedValue(mockReturn);
      buyerLedgerRepo.findByReturnId.mockResolvedValue(null);

      await expect(
        service.initiateRefund('ret_1', '105.00', 'actor_1'),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('should successfully initiate refund and calculate balance inside transaction (INV-S8-40)', async () => {
      prisma.returnRequest.findUnique.mockResolvedValue(mockReturn);
      buyerLedgerRepo.findByReturnId.mockResolvedValue(null);
      buyerLedgerRepo.findLatestBalance.mockResolvedValue(
        new Prisma.Decimal('50.00'),
      );
      prisma.returnRequest.update.mockResolvedValue({
        ...mockReturn,
        status: ReturnStatus.REFUND_INITIATED,
      });
      prisma.payment.findFirst.mockResolvedValue({
        id: 'pay_1',
        status: 'CAPTURED',
      });
      buyerLedgerRepo.create.mockResolvedValue({ id: 'ledger_1' });

      const result = await service.initiateRefund('ret_1', '100.00', 'actor_1');

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(buyerLedgerRepo.findLatestBalance).toHaveBeenCalledWith(
        prisma,
        'buyer_1',
      );
      expect(buyerLedgerRepo.create).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({
          amount: new Prisma.Decimal('100.00'),
          balance: new Prisma.Decimal('150.00'), // 50 + 100
        }),
      );
      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'pay_1' },
        data: { status: PaymentStatus.REFUND_INITIATED },
      });
      expect(metricsService.refundInitiatedTotal.inc).toHaveBeenCalled();
      expect(result.ledgerEntry.id).toBe('ledger_1');
    });
  });
});
