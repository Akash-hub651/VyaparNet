import { vi, describe, it, expect, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { RefundService } from '../../trust-safety/refunds/refund.service';
import { BuyerLedgerRepository } from '../../trust-safety/refunds/buyer-ledger.repository';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { UnprocessableEntityException } from '@nestjs/common';
import { ReturnStatus, Prisma } from '@vyaparnet/database';

describe('Phase 4: Refund + BuyerLedger Integration', () => {
  let refundService: RefundService;
  let buyerLedgerRepo: BuyerLedgerRepository;
  let prisma: any;

  beforeEach(async () => {
    buyerLedgerRepo = {
      create: vi.fn().mockResolvedValue({ id: 'mock-ledger-id' }),
      findLatestBalance: vi.fn().mockResolvedValue(new Prisma.Decimal(100)),
      findByReturnId: vi.fn().mockResolvedValue(null),
    } as any;

    prisma = {
      $transaction: vi.fn((cb) => cb(prisma)),
      returnRequest: {
        findUnique: vi.fn(),
        update: vi.fn().mockResolvedValue({ id: 'ret-1', status: ReturnStatus.REFUND_INITIATED }),
      },
      payment: {
        findFirst: vi.fn().mockResolvedValue({ id: 'pay-1', amount: new Prisma.Decimal(100) }),
        update: vi.fn(),
      },
      eventOutbox: {
        create: vi.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefundService,
        { provide: BuyerLedgerRepository, useValue: buyerLedgerRepo },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    refundService = module.get<RefundService>(RefundService);
  });

  describe('INV-S8-40: BuyerLedger balance MUST be read INSIDE $transaction', () => {
    it('should read latest balance during initiateRefund inside transaction', async () => {
      prisma.returnRequest.findUnique.mockResolvedValue({
        id: 'ret-1',
        status: ReturnStatus.QC_APPROVED,
        requestedRefundAmount: new Prisma.Decimal(100),
        orderId: 'ord-1',
        order: { buyerId: 'buyer-1', segment: 'TEXTILE' },
      });

      await refundService.initiateRefund('ret-1', '100', 'actor-1');

      // Assert balance is read inside transaction block
      expect(buyerLedgerRepo.findLatestBalance).toHaveBeenCalledWith(prisma, 'buyer-1');
      expect(buyerLedgerRepo.create).toHaveBeenCalled();
    });
  });

  describe('INV-S8-41: Double-refund guard', () => {
    it('should reject initiateRefund if ledger entry already exists', async () => {
      prisma.returnRequest.findUnique.mockResolvedValue({
        id: 'ret-1',
        status: ReturnStatus.QC_APPROVED,
        requestedRefundAmount: new Prisma.Decimal(100),
        orderId: 'ord-1',
        order: { buyerId: 'buyer-1', segment: 'TEXTILE' },
      });

      buyerLedgerRepo.findByReturnId = vi.fn().mockResolvedValue({ id: 'ledger-1' });

      await expect(refundService.initiateRefund('ret-1', '100', 'actor-1')).rejects.toThrow(UnprocessableEntityException);
    });
  });

  describe('INV-S8-37: Approved amount > Requested amount', () => {
    it('should reject initiateRefund if approved amount exceeds requested', async () => {
      prisma.returnRequest.findUnique.mockResolvedValue({
        id: 'ret-1',
        status: ReturnStatus.QC_APPROVED,
        requestedRefundAmount: new Prisma.Decimal(100),
        orderId: 'ord-1',
        order: { buyerId: 'buyer-1', segment: 'TEXTILE' },
      });

      await expect(refundService.initiateRefund('ret-1', '150', 'actor-1')).rejects.toThrow(UnprocessableEntityException);
    });
  });

  describe('State Machine & INV-S8-14/15/16: EventOutbox', () => {
    it('should reject initiateRefund if status is not QC_APPROVED', async () => {
      prisma.returnRequest.findUnique.mockResolvedValue({
        id: 'ret-1',
        status: ReturnStatus.RECEIVED_AT_QC,
        requestedRefundAmount: new Prisma.Decimal(100),
      });

      await expect(refundService.initiateRefund('ret-1', '100', 'actor-1')).rejects.toThrow(UnprocessableEntityException);
    });

    it('should emit outbox event during initiateRefund', async () => {
      prisma.returnRequest.findUnique.mockResolvedValue({
        id: 'ret-1',
        status: ReturnStatus.QC_APPROVED,
        requestedRefundAmount: new Prisma.Decimal(100),
        orderId: 'ord-1',
        order: { buyerId: 'buyer-1', segment: 'TEXTILE' },
      });

      buyerLedgerRepo.create = vi.fn().mockResolvedValue({ id: 'ledger-2' });

      await refundService.initiateRefund('ret-1', '100', 'actor-1');

      expect(prisma.eventOutbox.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          eventType: 'RefundInitiated',
          schemaVersion: '8.0',
        })
      }));
    });
  });
});
