import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { UnprocessableEntityException } from '@nestjs/common';
import { AdminAuditService } from '../services/admin-audit.service';
import { AdminAuditRepository } from '../repositories/admin-audit.repository';
import { AdminAuditController } from '../controllers/admin-audit.controller';
import { AdminExceptionService } from '../services/admin-exception.service';
import { AdminMetricsService } from '../services/admin-metrics.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { getQueueToken } from '@nestjs/bull';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { AdminContextGuard } from '../guards/admin-context.guard';

// ─── Test fixtures ────────────────────────────────────────────────────────────

const ADMIN_ID = 'admin-1';

const makeAuditLog = (overrides = {}) => ({
  id: 'log-1',
  actorId: ADMIN_ID,
  action: 'STATUS_CHANGE',
  entityType: 'Business',
  entityId: 'biz-1',
  entityName: 'Test Business',
  oldValue: { kycStatus: 'PENDING' },
  newValue: { kycStatus: 'VERIFIED' },
  ipAddress: '127.0.0.1',
  userAgent: 'test-agent',
  sessionId: null,
  auditMonth: '2026-06',
  createdAt: '2026-06-01T00:00:00.000Z',
  ...overrides,
});

// ─── AdminAuditService Tests ──────────────────────────────────────────────────

describe('AdminAuditService — Phase 10 Audit Log Viewer', () => {
  let service: AdminAuditService;
  let auditRepo: any;

  beforeEach(async () => {
    auditRepo = {
      findMany: vi.fn().mockResolvedValue({
        data: [makeAuditLog()],
        nextCursor: null,
        hasMore: false,
      }),
      findByEntity: vi.fn().mockResolvedValue([makeAuditLog()]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminAuditService,
        { provide: AdminAuditRepository, useValue: auditRepo },
      ],
    }).compile();

    service = module.get(AdminAuditService);
  });

  // ─── listLogs ──────────────────────────────────────────────────────────────

  describe('listLogs', () => {
    it('delegates to auditRepo.findMany with filter', async () => {
      const filter = { limit: 10 };
      const result = await service.listLogs(filter);

      expect(auditRepo.findMany).toHaveBeenCalledWith(filter);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].action).toBe('STATUS_CHANGE');
    });

    it('returns paginated response with nextCursor', async () => {
      auditRepo.findMany.mockResolvedValueOnce({
        data: [makeAuditLog({ id: 'log-2' }), makeAuditLog({ id: 'log-1' })],
        nextCursor: 'log-1',
        hasMore: true,
      });

      const result = await service.listLogs({ limit: 2 });

      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBe('log-1');
      expect(result.data).toHaveLength(2);
    });
  });

  // ─── getEntityTimeline ─────────────────────────────────────────────────────

  describe('getEntityTimeline', () => {
    it('returns chronological entity audit history', async () => {
      const result = await service.getEntityTimeline('Business', 'biz-1');

      expect(auditRepo.findByEntity).toHaveBeenCalledWith('Business', 'biz-1');
      expect(result).toHaveLength(1);
      expect(result[0].entityType).toBe('Business');
    });
  });
});

// ─── AdminAuditController Tests ───────────────────────────────────────────────

describe('AdminAuditController — Phase 10 Validation Gate', () => {
  let controller: AdminAuditController;
  let auditService: any;

  beforeEach(async () => {
    auditService = {
      listLogs: vi.fn().mockResolvedValue({
        data: [makeAuditLog()],
        nextCursor: null,
        hasMore: false,
      }),
      getEntityTimeline: vi.fn().mockResolvedValue([makeAuditLog()]),
    };

    // Override guards so unit tests don't need full auth stack
    const passGuard = { canActivate: () => true };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminAuditController],
      providers: [{ provide: AdminAuditService, useValue: auditService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(passGuard)
      .overrideGuard(AdminContextGuard)
      .useValue(passGuard)
      .compile();

    controller = module.get(AdminAuditController);
  });

  it('INV-S7-22: GET /admin/audit-logs → paginated response', async () => {
    const result = await controller.listAuditLogs({ limit: '10' });

    expect(auditService.listLogs).toHaveBeenCalledOnce();
    expect(result.data).toHaveLength(1);
  });

  it('INV-S7-22: limit=101 → 422 LIMIT_EXCEEDED', async () => {
    await expect(
      controller.listAuditLogs({ limit: '101' }),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('FOOTGUN-10-D: limit > 100 rejected even if Zod passes (belt-and-suspenders)', async () => {
    await expect(
      controller.listAuditLogs({ limit: '200' }),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('entity timeline returns chronological logs', async () => {
    const result = await controller.getEntityTimeline('Business', 'biz-1');

    expect(auditService.getEntityTimeline).toHaveBeenCalledWith(
      'Business',
      'biz-1',
    );
    expect(result).toHaveLength(1);
  });

  it('FOOTGUN-10-A: no write endpoint — only GET endpoints exist', () => {
    // AdminAuditController must NOT have POST/PATCH/DELETE that write audit logs
    const proto = Object.getOwnPropertyNames(
      Object.getPrototypeOf(controller),
    );
    // These methods must NOT exist:
    expect(proto).not.toContain('createAuditLog');
    expect(proto).not.toContain('deleteAuditLog');
    expect(proto).not.toContain('updateAuditLog');
  });
});

// ─── AdminExceptionService.getTechnicalExceptions Tests ──────────────────────

describe('AdminExceptionService.getTechnicalExceptions — Phase 10 DLQ', () => {
  let service: AdminExceptionService;
  let prismaService: any;
  let dlqQueue: any;
  let metricsService: any;

  beforeEach(async () => {
    dlqQueue = {
      getFailed: vi.fn().mockResolvedValue([
        { id: 'job-1', name: 'SendNotification', failedReason: 'Connection refused' },
        { id: 'job-2', name: 'SendNotification', failedReason: 'Timeout' },
      ]),
    };

    prismaService = {
      order: { findMany: vi.fn().mockResolvedValue([]) },
      payment: { findMany: vi.fn().mockResolvedValue([]) },
      business: { findMany: vi.fn().mockResolvedValue([]) },
    };

    metricsService = {
      exceptionCenterStuckOrders: { set: vi.fn() },
      exceptionCenterFailedPayments: { set: vi.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminExceptionService,
        { provide: PrismaService, useValue: prismaService },
        {
          provide: getQueueToken('notifications-failed'), // INV-S7-24: LOCKED name
          useValue: dlqQueue,
        },
        { provide: AdminMetricsService, useValue: metricsService },
      ],
    }).compile();

    service = module.get(AdminExceptionService);
  });

  it('INV-S7-24: DLQ reads from notifications-failed queue', async () => {
    const result = await service.getTechnicalExceptions();

    expect(dlqQueue.getFailed).toHaveBeenCalledWith(0, 100);
    expect(result.dlqDepth).toBe(2); // 2 mock failed jobs
  });

  it('openDisputes is 0 placeholder (Sprint 8 scope)', async () => {
    const result = await service.getTechnicalExceptions();

    expect(result.openDisputes).toBe(0);
  });

  it('FOOTGUN-10-B: getTechnicalExceptions returns fresh data (no caching)', async () => {
    // Call twice — should call getFailed both times (no cache)
    dlqQueue.getFailed
      .mockResolvedValueOnce([{ id: 'job-1' }])
      .mockResolvedValueOnce([{ id: 'job-1' }, { id: 'job-2' }]);

    const r1 = await service.getTechnicalExceptions();
    const r2 = await service.getTechnicalExceptions();

    expect(dlqQueue.getFailed).toHaveBeenCalledTimes(2);
    expect(r1.dlqDepth).toBe(1);
    expect(r2.dlqDepth).toBe(2); // Different result = not cached
  });

  it('DLQ fetch failure is non-fatal (returns dlqDepth=0)', async () => {
    dlqQueue.getFailed.mockRejectedValueOnce(new Error('Redis down'));

    const result = await service.getTechnicalExceptions();

    // Should NOT throw — error is caught and logged
    expect(result.dlqDepth).toBe(0);
  });
});
