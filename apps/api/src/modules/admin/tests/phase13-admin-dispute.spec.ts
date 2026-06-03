import { vi, describe, it, expect, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { AdminDisputeService } from '../services/admin-dispute.service';
import { AdminDisputeRepository } from '../repositories/admin-dispute.repository';
import { AdminPayoutRepository } from '../repositories/admin-payout.repository';
import { AuditSafeWriterService } from '../../security/audit/audit-safe-writer.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { EvidenceService } from '../../trust-safety/evidence/evidence.service';
import { NotificationService } from '../../notification/services/notification.service';
import { DisputeStatus, PayoutStatus, DisputePriority } from '@vyaparnet/database';
import { AuditAction } from '@vyaparnet/types';

describe('Phase 13: Admin Dispute Management + Payout Integration', () => {
  let service: AdminDisputeService;
  let disputeRepo: jest.Mocked<AdminDisputeRepository>;
  let payoutRepo: jest.Mocked<AdminPayoutRepository>;
  let auditWriter: jest.Mocked<AuditSafeWriterService>;
  let prisma: any;

  beforeEach(async () => {
    disputeRepo = {
      findById: vi.fn(),
      updateStatus: vi.fn(),
    } as any;
    
    payoutRepo = {
      updateStatus: vi.fn(),
    } as any;

    auditWriter = {
      safeWrite: vi.fn(),
    } as any;

    prisma = {
      $transaction: vi.fn((cb) => cb(prisma)),
      sellerPayout: {
        findFirst: vi.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminDisputeService,
        { provide: AdminDisputeRepository, useValue: disputeRepo },
        { provide: AdminPayoutRepository, useValue: payoutRepo },
        { provide: AuditSafeWriterService, useValue: auditWriter },
        { provide: PrismaService, useValue: prisma },
        { provide: EvidenceService, useValue: {} },
        { provide: NotificationService, useValue: {} },
      ],
    }).compile();

    service = module.get<AdminDisputeService>(AdminDisputeService);
  });

  it('INV-S8-9: RESOLVED_BUYER cancels ON_HOLD payout atomically', async () => {
    const mockDispute = {
      id: 'dsp_123',
      orderId: 'ord_123',
      status: DisputeStatus.ESCALATED,
    };
    
    disputeRepo.findById.mockResolvedValue(mockDispute as any);
    disputeRepo.updateStatus.mockResolvedValue({ ...mockDispute, status: DisputeStatus.RESOLVED_BUYER } as any);
    prisma.sellerPayout.findFirst.mockResolvedValue({ id: 'po_123', status: PayoutStatus.ON_HOLD } as any);

    await service.resolveDispute('dsp_123', 'admin_1', 'BUYER_FAVORED', 'Refund to buyer');

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(disputeRepo.updateStatus).toHaveBeenCalledWith('dsp_123', DisputeStatus.RESOLVED_BUYER, 'admin_1', 'Refund to buyer', prisma);
    expect(payoutRepo.updateStatus).toHaveBeenCalledWith('po_123', PayoutStatus.CANCELLED, prisma);
    
    // INV-S7-2 / INV-S8-1: safeWrite OUTSIDE transaction
    expect(auditWriter.safeWrite).toHaveBeenCalledWith(expect.objectContaining({
      action: AuditAction.STATUS_CHANGE,
      newValue: { status: DisputeStatus.RESOLVED_BUYER, resolution: 'Refund to buyer' }, // INV-S8-11
    }));
  });
});
