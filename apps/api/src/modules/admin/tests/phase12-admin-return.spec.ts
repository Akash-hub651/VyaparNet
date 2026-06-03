import { Test, TestingModule } from '@nestjs/testing';
import { AdminReturnService } from '../services/admin-return.service';
import { AdminReturnRepository } from '../repositories/admin-return.repository';
import { AuditSafeWriterService } from '../../security/audit/audit-safe-writer.service';
import { EvidenceService } from '../../trust-safety/evidence/evidence.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { ReturnStatus, Prisma } from '@vyaparnet/database';
import { UnprocessableEntityException, NotFoundException } from '@nestjs/common';
import { vi, describe, beforeEach, it, expect } from 'vitest';

describe('AdminReturnService', () => {
  let service: AdminReturnService;
  let repository: any;
  let auditSafeWriter: any;
  let evidenceService: any;
  let prisma: any;

  beforeEach(async () => {
    repository = {
      findById: vi.fn(),
      updateStatus: vi.fn(),
    };
    auditSafeWriter = {
      safeWrite: vi.fn().mockResolvedValue(undefined),
    };
    evidenceService = {
      getEvidenceUrl: vi.fn().mockResolvedValue('signed-url'),
    };
    prisma = {
      $transaction: vi.fn((cb) => cb(prisma)),
      inventoryMovement: {
        create: vi.fn(),
      },
      orderItem: {
        findUnique: vi.fn(),
      },
      inventory: {
        findUnique: vi.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminReturnService,
        { provide: AdminReturnRepository, useValue: repository },
        { provide: AuditSafeWriterService, useValue: auditSafeWriter },
        { provide: EvidenceService, useValue: evidenceService },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<AdminReturnService>(AdminReturnService);
  });

  describe('approveReturn', () => {
    it('should transition PENDING -> APPROVED_FOR_PICKUP and audit', async () => {
      repository.findById.mockResolvedValue({ status: ReturnStatus.PENDING, id: 'ret_1' });
      repository.updateStatus.mockResolvedValue({ id: 'ret_1', status: ReturnStatus.APPROVED_FOR_PICKUP });

      await service.approveReturn('ret_1', 'admin_1');

      expect(repository.updateStatus).toHaveBeenCalledWith('ret_1', ReturnStatus.APPROVED_FOR_PICKUP, 'admin_1');
      expect(auditSafeWriter.safeWrite).toHaveBeenCalled();
    });

    it('should reject invalid transition', async () => {
      repository.findById.mockResolvedValue({ status: ReturnStatus.QC_REJECTED, id: 'ret_1' });
      await expect(service.approveReturn('ret_1', 'admin_1')).rejects.toThrow(UnprocessableEntityException);
    });
  });

  describe('markReceived', () => {
    it('should transition APPROVED_FOR_PICKUP -> RECEIVED_AT_QC and create InventoryMovement', async () => {
      repository.findById.mockResolvedValue({ status: ReturnStatus.APPROVED_FOR_PICKUP, id: 'ret_1', itemId: 'item_1' });
      repository.updateStatus.mockResolvedValue({ id: 'ret_1', status: ReturnStatus.RECEIVED_AT_QC });
      
      prisma.orderItem.findUnique.mockResolvedValue({ productId: 'prod_1', quantity: 2 });
      prisma.inventory.findUnique.mockResolvedValue({ id: 'inv_1' });

      await service.markReceived('ret_1', 'admin_1');

      expect(repository.updateStatus).toHaveBeenCalled();
      expect(prisma.inventoryMovement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          inventoryId: 'inv_1',
          type: 'RETURN_RECEIVED',
          quantity: 2,
        })
      });
      expect(auditSafeWriter.safeWrite).toHaveBeenCalled();
    });
  });

  describe('qcPass (Financial Integrity INV-S8-37)', () => {
    it('should approve refund if amount <= requested', async () => {
      repository.findById.mockResolvedValue({
        id: 'ret_1',
        status: ReturnStatus.RECEIVED_AT_QC,
        requestedRefundAmount: new Prisma.Decimal('100.00'),
      });
      repository.updateStatus.mockResolvedValue({ id: 'ret_1', status: ReturnStatus.QC_APPROVED });

      await service.qcPass('ret_1', 'admin_1', '100.00');

      expect(repository.updateStatus).toHaveBeenCalledWith(
        'ret_1',
        ReturnStatus.QC_APPROVED,
        'admin_1',
        expect.any(Prisma.Decimal),
      );
      expect(auditSafeWriter.safeWrite).toHaveBeenCalled();
    });

    it('should reject if approved amount > requested amount', async () => {
      repository.findById.mockResolvedValue({
        id: 'ret_1',
        status: ReturnStatus.RECEIVED_AT_QC,
        requestedRefundAmount: new Prisma.Decimal('100.00'),
      });

      await expect(service.qcPass('ret_1', 'admin_1', '150.00')).rejects.toThrow('Approved amount cannot exceed requested amount');
    });
  });
});
