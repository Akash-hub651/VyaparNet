import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AdminTicketService } from '../services/admin-ticket.service';
import { AdminTicketRepository } from '../repositories/admin-ticket.repository';
import { AdminTicketsController } from '../controllers/admin-ticket.controller';
import { AuditSafeWriterService } from '../../security/audit/audit-safe-writer.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { AdminContextGuard } from '../guards/admin-context.guard';
import { AdminIdempotencyGuard } from '../guards/admin-idempotency.guard';

const ADMIN_ID = 'admin-1';
const MOCK_REQUEST = {
  user: { id: ADMIN_ID },
  ip: '127.0.0.1',
  headers: { 'user-agent': 'test-agent' },
} as any;

const makeTicket = (overrides = {}) => ({
  id: 'ticket-1',
  subject: 'Test Subject',
  status: 'OPEN',
  priority: 'MEDIUM',
  assignedTo: null,
  firstResponseAt: null,
  createdAt: new Date('2026-06-01T10:00:00.000Z'),
  ...overrides,
});

describe('AdminTicketService — Phase 11', () => {
  let service: AdminTicketService;
  let repo: any;
  let prisma: any;
  let auditWriter: any;

  beforeEach(async () => {
    repo = {
      findMany: vi.fn().mockResolvedValue({ data: [makeTicket()], nextCursor: null, hasMore: false }),
      findById: vi.fn().mockResolvedValue(makeTicket()),
      assign: vi.fn().mockResolvedValue(makeTicket({ status: 'IN_PROGRESS', assignedTo: ADMIN_ID })),
      resolve: vi.fn().mockResolvedValue(makeTicket({ status: 'RESOLVED' })),
      escalate: vi.fn().mockResolvedValue(makeTicket({ status: 'ESCALATED', priority: 'CRITICAL' })),
    };

    prisma = {
      $transaction: vi.fn((cb) => cb(prisma)),
    };

    auditWriter = {
      safeWrite: vi.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminTicketService,
        { provide: AdminTicketRepository, useValue: repo },
        { provide: PrismaService, useValue: prisma },
        { provide: AuditSafeWriterService, useValue: auditWriter },
      ],
    }).compile();

    service = module.get(AdminTicketService);
  });

  describe('getTicketDetail', () => {
    it('computes slaBreachedAt dynamically', async () => {
      const result = await service.getTicketDetail('ticket-1');
      // createdAt + 24 hours
      const expectedSla = new Date(result.createdAt.getTime() + 24 * 60 * 60 * 1000);
      expect(result.slaBreachedAt).toEqual(expectedSla);
    });

    it('throws NotFoundException if missing', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.getTicketDetail('invalid')).rejects.toThrow(NotFoundException);
    });
  });

  describe('assignTicket', () => {
    it('FOOTGUN-11-B: creates AuditLog on assignment', async () => {
      await service.assignTicket('ticket-1', ADMIN_ID, MOCK_REQUEST);
      expect(auditWriter.safeWrite).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'STATUS_CHANGE',
          entityType: 'SupportTicket',
          newValue: expect.objectContaining({ assignedTo: ADMIN_ID }),
        })
      );
    });
  });

  describe('resolveTicket', () => {
    it('updates status and creates AuditLog', async () => {
      await service.resolveTicket('ticket-1', { resolutionNote: 'Done' }, ADMIN_ID, MOCK_REQUEST);
      expect(repo.resolve).toHaveBeenCalledWith('ticket-1', 'Done', prisma);
      expect(auditWriter.safeWrite).toHaveBeenCalled();
    });
  });

  describe('escalateTicket', () => {
    it('updates status and creates AuditLog', async () => {
      await service.escalateTicket('ticket-1', { escalationReason: 'Important' }, ADMIN_ID, MOCK_REQUEST);
      expect(repo.escalate).toHaveBeenCalledWith('ticket-1', 'Important', prisma);
      expect(auditWriter.safeWrite).toHaveBeenCalled();
    });
  });
});

describe('AdminTicketsController — Phase 11', () => {
  let controller: AdminTicketsController;
  let service: any;

  beforeEach(async () => {
    service = {
      listTickets: vi.fn(),
      getTicketDetail: vi.fn(),
      assignTicket: vi.fn(),
      resolveTicket: vi.fn(),
      escalateTicket: vi.fn(),
    };

    const passGuard = { canActivate: () => true };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminTicketsController],
      providers: [{ provide: AdminTicketService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(passGuard)
      .overrideGuard(AdminContextGuard)
      .useValue(passGuard)
      .overrideGuard(AdminIdempotencyGuard)
      .useValue(passGuard)
      .compile();

    controller = module.get(AdminTicketsController);
  });

  it('assign defaults to caller ID if body is empty', async () => {
    await controller.assignTicket('ticket-1', {}, MOCK_REQUEST);
    expect(service.assignTicket).toHaveBeenCalledWith('ticket-1', ADMIN_ID, MOCK_REQUEST);
  });

  it('assign uses body adminUserId if provided', async () => {
    await controller.assignTicket('ticket-1', { adminUserId: 'other-admin' }, MOCK_REQUEST);
    expect(service.assignTicket).toHaveBeenCalledWith('ticket-1', 'other-admin', MOCK_REQUEST);
  });

  it('FOOTGUN-11-A: reply endpoint is NOT present', () => {
    const proto = Object.getOwnPropertyNames(Object.getPrototypeOf(controller));
    expect(proto).not.toContain('replyTicket');
    expect(proto).not.toContain('addReply');
  });
});
