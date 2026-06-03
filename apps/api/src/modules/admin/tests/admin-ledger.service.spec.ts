import { Test, TestingModule } from '@nestjs/testing';
import { AdminLedgerService } from '../services/admin-ledger.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AuditSafeWriterService } from '../../security/audit/audit-safe-writer.service';
import { BuyerLedgerType, Prisma, Segment } from '@vyaparnet/database';
import { NotFoundException } from '@nestjs/common';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('AdminLedgerService', () => {
  let service: AdminLedgerService;
  let prisma: any;
  let auditWriter: any;

  beforeEach(async () => {
    prisma = {
      user: { findUnique: vi.fn() },
      buyerLedger: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
      },
      $transaction: vi.fn(async (cb) => cb(prisma)),
    };
    auditWriter = { safeWrite: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminLedgerService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditSafeWriterService, useValue: auditWriter },
      ],
    }).compile();

    service = module.get<AdminLedgerService>(AdminLedgerService);
  });

  describe('getBuyerLedger', () => {
    it('should throw NotFound if buyer does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.getBuyerLedger('buyer_1', 'admin_1', 1, 10),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return entries and audit the action', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'buyer_1' });
      prisma.buyerLedger.findMany.mockResolvedValue([{ id: '1' }]);
      prisma.buyerLedger.findFirst.mockResolvedValue({
        balance: new Prisma.Decimal('100.50'),
      });

      const res = await service.getBuyerLedger('buyer_1', 'admin_1', 1, 10);
      expect(res.entries.length).toBe(1);
      // Prisma.Decimal.toString() drops trailing zeros: '100.50' → '100.5'
      expect(res.currentBalance).toBe('100.5');
      expect(auditWriter.safeWrite).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'UPDATE',
          newValue: { action: 'LEDGER_VIEWED', buyerId: 'buyer_1' },
        }),
      );
    });
  });

  describe('applyCorrection', () => {
    it('should throw NotFound if buyer does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.applyCorrection('buyer_1', '10.0', 'desc', 'TEXTILE' as Segment, 'admin_1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should apply correction inside transaction and audit (INV-S8-40)', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'buyer_1' });
      prisma.buyerLedger.findFirst.mockResolvedValue({
        balance: new Prisma.Decimal('100.50'),
      });
      prisma.buyerLedger.create.mockResolvedValue({ id: 'adj_1' });

      const res = await service.applyCorrection('buyer_1', '50.00', 'desc', 'TEXTILE' as Segment, 'admin_1');
      
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.buyerLedger.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            transactionType: BuyerLedgerType.ADJUSTMENT,
            amount: new Prisma.Decimal('50.00'),
            balance: new Prisma.Decimal('150.50'),
          }),
        }),
      );
      expect(auditWriter.safeWrite).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'UPDATE',
          newValue: { action: 'LEDGER_CORRECTION', amount: '50.00', description: 'desc' },
        }),
      );
      expect(res.id).toBe('adj_1');
    });
  });
});
