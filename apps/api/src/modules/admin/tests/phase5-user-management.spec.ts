import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { AdminUserService } from '../services/admin-user.service';
import { AdminUserRepository } from '../repositories/admin-user.repository';
import { AdminMetricsService } from '../services/admin-metrics.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { RedisService } from '../../../core/redis/redis.service';
import { NotificationService } from '../../notification/services/notification.service';
import { BuyerLedgerRepository } from '../../trust-safety/refunds/buyer-ledger.repository';
import { AuditSafeWriterService } from '../../security/audit/audit-safe-writer.service';
import { UserRole } from '@vyaparnet/database';

const MOCK_USER = {
  id: 'user-1',
  phone: '+919876543210',
  email: 'seller@example.com',
  name: 'Test Seller',
  role: UserRole.SELLER,
  segment: 'TEXTILE',
  kycStatus: 'VERIFIED',
  isDeleted: false,
  deletedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  language: 'hi',
  isPhoneVerified: true,
  tokenVersion: 3,
  businesses: [],
  recentOrders: [],
};

const MOCK_SUSPENDED_USER = {
  ...MOCK_USER,
  isDeleted: true,
  deletedAt: '2026-06-01T00:00:00.000Z',
};

const ADMIN_ID = 'admin-1';
const IDEM_KEY = 'test-idem-key-123';
const MOCK_REQUEST = {
  ip: '127.0.0.1',
  headers: { 'user-agent': 'test-agent' },
} as any;

describe('AdminUserService — Phase 5 User Management', () => {
  let service: AdminUserService;
  let userRepo: any;
  let prismaService: any;
  let redisService: any;
  let notificationService: any;
  let auditWriter: any;
  let metrics: any;

  beforeEach(async () => {
    userRepo = {
      findMany: vi.fn().mockResolvedValue({
        data: [MOCK_USER],
        nextCursor: null,
        hasMore: false,
      }),
      findById: vi.fn().mockResolvedValue(MOCK_USER),
      suspendUser: vi.fn().mockResolvedValue(undefined),
      revokeAllSessions: vi.fn().mockResolvedValue(undefined),
      activateUser: vi.fn().mockResolvedValue(undefined),
      changeRole: vi.fn().mockResolvedValue(undefined),
    };

    prismaService = {
      $transaction: vi
        .fn()
        .mockImplementation(async (fn: (tx: any) => Promise<unknown>) =>
          fn({
            user: { update: vi.fn() },
            loginSession: { updateMany: vi.fn() },
            eventOutbox: { create: vi.fn().mockResolvedValue({ id: 'ev-1' }) },
          }),
        ),
    };

    redisService = {
      set: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1),
    };

    notificationService = {
      sendDirect: vi.fn().mockResolvedValue(undefined),
    };

    auditWriter = {
      safeWrite: vi.fn().mockResolvedValue(undefined),
    };

    metrics = {
      userSuspendedTotal: { inc: vi.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminUserService,
        { provide: AdminUserRepository, useValue: userRepo },
        { provide: PrismaService, useValue: prismaService },
        { provide: RedisService, useValue: redisService },
        { provide: NotificationService, useValue: notificationService },
        { provide: AuditSafeWriterService, useValue: auditWriter },
        {
          provide: AdminMetricsService,
          useValue: metrics,
        },
        {
          provide: BuyerLedgerRepository,
          useValue: { findManyForBuyer: vi.fn(), findLatestBalance: vi.fn() },
        },
      ],
    }).compile();

    service = module.get(AdminUserService);
  });

  // ─── GET user list ─────────────────────────────────────────────────────

  describe('getUserList', () => {
    it('returns paginated user list', async () => {
      const result = await service.getUserList({ limit: 20 });
      expect(result.data).toHaveLength(1);
    });
  });

  // ─── GET user detail ───────────────────────────────────────────────────

  describe('getUserDetail', () => {
    it('returns user detail for valid ID', async () => {
      const result = await service.getUserDetail('user-1');
      expect(result.id).toBe('user-1');
    });

    it('throws NotFoundException for missing user', async () => {
      userRepo.findById.mockResolvedValueOnce(null);
      await expect(service.getUserDetail('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── SUSPEND user ──────────────────────────────────────────────────────

  describe('suspendUser', () => {
    it('happy path: suspends an active user', async () => {
      await service.suspendUser(
        'user-1',
        { reason: 'Fraudulent activity detected on marketplace.' },
        ADMIN_ID,
        IDEM_KEY,
        MOCK_REQUEST,
      );

      expect(prismaService.$transaction).toHaveBeenCalledOnce();
      expect(userRepo.suspendUser).toHaveBeenCalledWith(
        'user-1',
        expect.anything(),
      );
      expect(userRepo.revokeAllSessions).toHaveBeenCalledWith(
        'user-1',
        'ADMIN_SUSPENSION',
        expect.anything(),
      );
      expect(auditWriter.safeWrite).toHaveBeenCalledOnce();
      expect(auditWriter.safeWrite).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: ADMIN_ID,
          action: 'STATUS_CHANGE',
          entityType: 'User',
          entityId: 'user-1',
          newValue: expect.objectContaining({ isDeleted: true }),
        }),
      );
      expect(metrics.userSuspendedTotal.inc).toHaveBeenCalledWith({
        role: UserRole.SELLER,
      });
    });

    it('INV-S7-11: FOOTGUN-5-C: throws 403 when admin suspends own account (PRE-TX)', async () => {
      await expect(
        service.suspendUser(
          ADMIN_ID,
          { reason: 'Should not work at all.' },
          ADMIN_ID,
          IDEM_KEY,
          MOCK_REQUEST,
        ),
      ).rejects.toThrow(ForbiddenException);

      // CRITICAL: $transaction MUST NOT be called (self-check is pre-tx)
      expect(prismaService.$transaction).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when user does not exist', async () => {
      userRepo.findById.mockResolvedValueOnce(null);
      await expect(
        service.suspendUser(
          'missing',
          { reason: 'test reason here' },
          ADMIN_ID,
          IDEM_KEY,
          MOCK_REQUEST,
        ),
      ).rejects.toThrow(NotFoundException);
      expect(prismaService.$transaction).not.toHaveBeenCalled();
    });

    it('throws ConflictException when user is already suspended', async () => {
      userRepo.findById.mockResolvedValueOnce(MOCK_SUSPENDED_USER);
      await expect(
        service.suspendUser(
          'user-1',
          { reason: 'test reason here' },
          ADMIN_ID,
          IDEM_KEY,
          MOCK_REQUEST,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('INV-S7-2: safeWrite() called OUTSIDE $transaction (after commit)', async () => {
      const callOrder: string[] = [];

      prismaService.$transaction.mockImplementationOnce(
        async (fn: (tx: any) => Promise<unknown>) => {
          callOrder.push('$transaction');
          return fn({
            user: { update: vi.fn() },
            loginSession: { updateMany: vi.fn() },
            eventOutbox: { create: vi.fn().mockResolvedValue({ id: 'ev-1' }) },
          });
        },
      );
      auditWriter.safeWrite.mockImplementationOnce(async () => {
        callOrder.push('safeWrite');
      });

      await service.suspendUser(
        'user-1',
        { reason: 'Testing transaction boundary carefully.' },
        ADMIN_ID,
        IDEM_KEY,
        MOCK_REQUEST,
      );

      const txIdx = callOrder.indexOf('$transaction');
      const auditIdx = callOrder.indexOf('safeWrite');
      expect(auditIdx).toBeGreaterThan(txIdx); // audit AFTER transaction commit
    });

    it('INV-S7-27: FOOTGUN-5-D: Redis seller_biz DEL called OUTSIDE $transaction', async () => {
      const callOrder: string[] = [];

      prismaService.$transaction.mockImplementationOnce(
        async (fn: (tx: any) => Promise<unknown>) => {
          callOrder.push('$transaction');
          return fn({
            user: { update: vi.fn() },
            loginSession: { updateMany: vi.fn() },
            eventOutbox: { create: vi.fn().mockResolvedValue({ id: 'ev-1' }) },
          });
        },
      );
      redisService.del.mockImplementationOnce(async () => {
        callOrder.push('redisDel');
        return 1;
      });

      await service.suspendUser(
        'user-1',
        { reason: 'Checking Redis operation ordering.' },
        ADMIN_ID,
        IDEM_KEY,
        MOCK_REQUEST,
      );

      expect(callOrder.indexOf('redisDel')).toBeGreaterThan(
        callOrder.indexOf('$transaction'),
      );
      expect(redisService.del).toHaveBeenCalledWith('seller_biz:user-1');
    });

    it('notification failure does NOT block suspension (non-fatal)', async () => {
      notificationService.sendDirect.mockRejectedValueOnce(
        new Error('SMS provider down'),
      );

      await expect(
        service.suspendUser(
          'user-1',
          { reason: 'Notification failure should not block.' },
          ADMIN_ID,
          IDEM_KEY,
          MOCK_REQUEST,
        ),
      ).resolves.not.toThrow();
    });

    it('Redis DEL failure does NOT block suspension (non-fatal)', async () => {
      redisService.del.mockRejectedValueOnce(new Error('Redis timeout'));

      await expect(
        service.suspendUser(
          'user-1',
          { reason: 'Redis failure should not block suspension.' },
          ADMIN_ID,
          IDEM_KEY,
          MOCK_REQUEST,
        ),
      ).resolves.not.toThrow();
    });

    it('idempotency key stored in Redis after commit', async () => {
      await service.suspendUser(
        'user-1',
        { reason: 'Checking idempotency key storage.' },
        ADMIN_ID,
        'my-special-idem-key',
        MOCK_REQUEST,
      );

      expect(redisService.set).toHaveBeenCalledWith(
        'admin-idem:my-special-idem-key',
        expect.stringContaining('suspended'),
        'EX',
        86400,
      );
    });
  });

  // ─── ACTIVATE user ─────────────────────────────────────────────────────

  describe('activateUser', () => {
    it('happy path: activates a suspended user', async () => {
      userRepo.findById.mockResolvedValueOnce(MOCK_SUSPENDED_USER);

      await service.activateUser('user-1', ADMIN_ID, IDEM_KEY, MOCK_REQUEST);

      expect(userRepo.activateUser).toHaveBeenCalledWith(
        'user-1',
        expect.anything(),
      );
      expect(auditWriter.safeWrite).toHaveBeenCalledWith(
        expect.objectContaining({
          newValue: { isDeleted: false },
        }),
      );
    });

    it('FOOTGUN-5-F: activateUser does NOT call suspendUser or tokenVersion change', async () => {
      userRepo.findById.mockResolvedValueOnce(MOCK_SUSPENDED_USER);

      await service.activateUser('user-1', ADMIN_ID, IDEM_KEY, MOCK_REQUEST);

      // suspendUser should NOT be called during activation
      expect(userRepo.suspendUser).not.toHaveBeenCalled();
      // activateUser called once — no tokenVersion manipulation
      expect(userRepo.activateUser).toHaveBeenCalledOnce();
    });

    it('throws ForbiddenException when admin activates own account', async () => {
      await expect(
        service.activateUser(ADMIN_ID, ADMIN_ID, IDEM_KEY, MOCK_REQUEST),
      ).rejects.toThrow(ForbiddenException);
      expect(prismaService.$transaction).not.toHaveBeenCalled();
    });

    it('throws ConflictException when user is not suspended', async () => {
      // MOCK_USER.isDeleted = false — user is active, cannot activate
      await expect(
        service.activateUser('user-1', ADMIN_ID, IDEM_KEY, MOCK_REQUEST),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ─── CHANGE ROLE ──────────────────────────────────────────────────────

  describe('changeUserRole', () => {
    it('happy path: changes user role to BUYER', async () => {
      await service.changeUserRole(
        'user-1',
        { role: 'BUYER' },
        ADMIN_ID,
        IDEM_KEY,
        MOCK_REQUEST,
      );

      expect(userRepo.changeRole).toHaveBeenCalledWith(
        'user-1',
        'BUYER',
        expect.anything(),
      );
      expect(auditWriter.safeWrite).toHaveBeenCalledWith(
        expect.objectContaining({
          oldValue: { role: UserRole.SELLER },
          newValue: { role: 'BUYER' },
        }),
      );
    });

    it('INV-S7-11: throws 403 when admin changes own role', async () => {
      await expect(
        service.changeUserRole(
          ADMIN_ID,
          { role: 'BUYER' },
          ADMIN_ID,
          IDEM_KEY,
          MOCK_REQUEST,
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(prismaService.$transaction).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when user does not exist', async () => {
      userRepo.findById.mockResolvedValueOnce(null);
      await expect(
        service.changeUserRole(
          'missing',
          { role: 'BUYER' },
          ADMIN_ID,
          IDEM_KEY,
          MOCK_REQUEST,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
