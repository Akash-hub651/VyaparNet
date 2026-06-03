import { Test, TestingModule } from '@nestjs/testing';
import { BuyerLedgerRepository } from './buyer-ledger.repository';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { Prisma, BuyerLedgerType, Segment } from '@vyaparnet/database';
import { vi, describe, beforeEach, it, expect } from 'vitest';

describe('BuyerLedgerRepository', () => {
  let repo: BuyerLedgerRepository;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      buyerLedger: {
        create: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BuyerLedgerRepository,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    repo = module.get<BuyerLedgerRepository>(BuyerLedgerRepository);
  });

  it('should enforce append-only by lacking update and delete methods', () => {
    expect((repo as any).update).toBeUndefined();
    expect((repo as any).delete).toBeUndefined();
  });

  describe('create', () => {
    it('should create a ledger entry using Prisma.Decimal', async () => {
      const mockEntry = {
        id: 'ledger_1',
        buyerId: 'buyer_1',
        segment: Segment.TEXTILE,
        transactionType: BuyerLedgerType.REFUND,
        amount: new Prisma.Decimal('100.00'),
        balance: new Prisma.Decimal('100.00'),
        description: 'Test',
        orderId: 'ord_1',
      };
      
      const tx = prisma;
      tx.buyerLedger.create.mockResolvedValue(mockEntry);

      const res = await repo.create(tx, {
        buyerId: 'buyer_1',
        segment: Segment.TEXTILE,
        transactionType: BuyerLedgerType.REFUND,
        amount: new Prisma.Decimal('100.00'),
        balance: new Prisma.Decimal('100.00'),
        description: 'Test',
        orderId: 'ord_1',
      });

      expect(tx.buyerLedger.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            amount: new Prisma.Decimal('100.00'),
            balance: new Prisma.Decimal('100.00'),
          }),
        }),
      );
      expect(res.id).toBe('ledger_1');
    });
  });

  describe('findLatestBalance', () => {
    it('should return 0 if no previous entries', async () => {
      prisma.buyerLedger.findFirst.mockResolvedValue(null);
      const balance = await repo.findLatestBalance(prisma, 'buyer_1');
      expect(balance.equals(new Prisma.Decimal(0))).toBe(true);
    });

    it('should return previous balance as Decimal', async () => {
      prisma.buyerLedger.findFirst.mockResolvedValue({
        balance: new Prisma.Decimal('150.50'),
      });
      const balance = await repo.findLatestBalance(prisma, 'buyer_1');
      expect(balance.equals(new Prisma.Decimal('150.50'))).toBe(true);
    });
  });
});
