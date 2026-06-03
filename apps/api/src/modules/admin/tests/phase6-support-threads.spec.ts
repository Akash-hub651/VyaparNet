import { Test, TestingModule } from '@nestjs/testing';
import { AdminTicketService } from '../services/admin-ticket.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AdminTicketRepository } from '../repositories/admin-ticket.repository';
import { AuditSafeWriterService } from '../../security/audit/audit-safe-writer.service';
import { NotificationService } from '../../notification/services/notification.service';
import { EvidenceService } from '../../trust-safety/evidence/evidence.service';
import { NotFoundException } from '@nestjs/common';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('Phase 6: Support Ticket Threads - Admin', () => {
  let service: AdminTicketService;
  let ticketRepo: any;
  let notificationService: any;
  let auditWriter: any;
  let evidenceService: any;
  let prisma: any;

  beforeEach(async () => {
    ticketRepo = {
      findById: vi.fn(),
      getMessages: vi.fn(),
      addMessage: vi.fn(),
      linkDispute: vi.fn(),
    };

    notificationService = {
      sendDirect: vi.fn(),
    };

    evidenceService = {
      uploadEvidence: vi.fn(),
    };

    auditWriter = {
      safeWrite: vi.fn(),
    };

    prisma = {
      dispute: { findUnique: vi.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminTicketService,
        { provide: AdminTicketRepository, useValue: ticketRepo },
        { provide: NotificationService, useValue: notificationService },
        { provide: EvidenceService, useValue: evidenceService },
        { provide: AuditSafeWriterService, useValue: auditWriter },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<AdminTicketService>(AdminTicketService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('replyToTicket', () => {
    it('should throw NotFoundException if ticket not found', async () => {
      ticketRepo.findById.mockResolvedValue(null);
      await expect(service.replyToTicket('t1', { message: 'hello', clientMessageId: '123' }, 'a1')).rejects.toThrow(NotFoundException);
    });

    it('should add message and send direct notification (D-TKT-2)', async () => {
      ticketRepo.findById.mockResolvedValue({ id: 't1', userId: 'buyer1' });
      ticketRepo.addMessage.mockResolvedValue({ id: 'm1' });
      evidenceService.uploadEvidence.mockResolvedValue('s3://bucket/test.jpg');

      const dto = { message: 'hello', clientMessageId: '123' };
      const files: any[] = [{ buffer: Buffer.from('test'), originalname: 'test.jpg' }];
      const result = await service.replyToTicket('t1', dto, 'a1', files);

      expect(evidenceService.uploadEvidence).toHaveBeenCalledWith('ticket', 't1', expect.any(Buffer), 'test.jpg');
      expect(ticketRepo.addMessage).toHaveBeenCalledWith('t1', 'a1', 'ADMIN', 'hello', ['s3://bucket/test.jpg'], '123');
      expect(notificationService.sendDirect).toHaveBeenCalledWith('buyer1', 'SupportTicketReplyReceived', { ticketId: 't1', messageId: 'm1' });
      expect(result).toEqual({ id: 'm1' });
    });
  });

  describe('linkDispute', () => {
    it('should link dispute and write audit log', async () => {
      ticketRepo.findById.mockResolvedValue({ id: 't1', subject: 'Subject', disputeId: null });
      prisma.dispute.findUnique.mockResolvedValue({ id: 'd1' });
      ticketRepo.linkDispute.mockResolvedValue({ id: 't1', disputeId: 'd1' });

      await service.linkDispute('t1', { disputeId: 'd1' }, 'a1', { ip: '127.0.0.1', headers: {} } as any);

      expect(ticketRepo.linkDispute).toHaveBeenCalledWith('t1', 'd1');
      expect(auditWriter.safeWrite).toHaveBeenCalledWith(expect.objectContaining({
        action: 'TICKET_DISPUTE_LINKED',
        entityId: 't1',
        newValue: { disputeId: 'd1' },
      }));
    });
  });
});
