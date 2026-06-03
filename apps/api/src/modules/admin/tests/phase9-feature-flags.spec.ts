import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { AdminFlagService } from '../services/admin-flag.service';
import { AdminFlagRepository } from '../repositories/admin-flag.repository';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AuditSafeWriterService } from '../../security/audit/audit-safe-writer.service';
import { RedisService } from '../../../core/redis/redis.service';
import { Segment } from '@vyaparnet/database';

const FLAG_NAME = 'platform_commission_percent';
const ADMIN_ID = 'admin-1';
const ENV = 'test';
const MOCK_REQUEST = {
  ip: '127.0.0.1',
  headers: { 'user-agent': 'test-agent' },
} as any;

const makeFlag = (overrides = {}) => ({
  id: 'flag-1',
  name: FLAG_NAME,
  description: 'Platform commission rate',
  enabled: true,
  rolloutPercent: 2,
  segment: null,
  env: ENV,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('AdminFlagService — Phase 9 Feature Flag Management', () => {
  let service: AdminFlagService;
  let flagRepo: unknown;
  let prismaService: unknown;
  let auditWriter: unknown;
  let redis: unknown;

  beforeEach(async () => {
    // Mock process.env.NODE_ENV
    process.env['NODE_ENV'] = ENV;

    flagRepo = {
      findAll: vi.fn().mockResolvedValue([makeFlag()]),
      findByName: vi.fn().mockResolvedValue(makeFlag()),
      updateFlag: vi.fn().mockResolvedValue(undefined),
    };

    prismaService = {
      $transaction: vi
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({}),
        ),
      featureFlag: {
        create: vi.fn().mockResolvedValue(makeFlag()),
      },
    };

    auditWriter = { safeWrite: vi.fn().mockResolvedValue(undefined) };

    redis = {
      get: vi.fn().mockResolvedValue(null), // Default: cache miss
      set: vi.fn().mockResolvedValue('OK'),
      scan: vi.fn().mockResolvedValue(['0', []]), // Default: no keys to delete
      del: vi.fn().mockResolvedValue(1),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminFlagService,
        { provide: AdminFlagRepository, useValue: flagRepo },
        { provide: PrismaService, useValue: prismaService },
        { provide: AuditSafeWriterService, useValue: auditWriter },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    service = module.get(AdminFlagService);
  });

  // ─── listFlags ────────────────────────────────────────────────────────────

  describe('listFlags', () => {
    it('returns all flags from repo', async () => {
      const result = await service.listFlags();

      expect(flagRepo.findAll).toHaveBeenCalledOnce();
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe(FLAG_NAME);
      expect(result[0].rolloutPercent).toBe(2);
    });
  });

  // ─── isEnabled — Redis cache ──────────────────────────────────────────────

  describe('isEnabled (FOOTGUN-9-B: Redis cache + DB fallback)', () => {
    it('returns cached value from Redis when available', async () => {
      redis.get.mockResolvedValueOnce('1'); // Cache hit: enabled=true

      const result = await service.isEnabled(FLAG_NAME);

      expect(result).toBe(true);
      // DB should NOT be called on cache hit
      expect(flagRepo.findByName).not.toHaveBeenCalled();
    });

    it('falls back to DB on Redis miss and caches result', async () => {
      redis.get.mockResolvedValueOnce(null); // Cache miss
      flagRepo.findByName.mockResolvedValueOnce(makeFlag({ enabled: true }));

      const result = await service.isEnabled(FLAG_NAME);

      expect(result).toBe(true);
      expect(flagRepo.findByName).toHaveBeenCalledWith(FLAG_NAME, ENV, null);
      // Result should be cached in Redis
      expect(redis.set).toHaveBeenCalledWith(
        `flag:${FLAG_NAME}:${ENV}:global`,
        '1',
        'EX',
        300,
      );
    });

    it('FOOTGUN-9-B: returns false (not throws) when flag not in DB', async () => {
      redis.get.mockResolvedValueOnce(null);
      flagRepo.findByName.mockResolvedValueOnce(null); // Flag doesn't exist

      const result = await service.isEnabled('nonexistent_flag');

      expect(result).toBe(false); // Default false — not throws
    });

    it('FOOTGUN-9-B: DB fallback on Redis failure — still returns value', async () => {
      redis.get.mockRejectedValueOnce(new Error('Redis down'));
      flagRepo.findByName.mockResolvedValueOnce(makeFlag({ enabled: false }));

      const result = await service.isEnabled(FLAG_NAME);

      expect(result).toBe(false); // DB fallback works
    });

    it('uses segment-specific cache key when segment provided', async () => {
      redis.get.mockResolvedValueOnce('0'); // Cache hit: disabled for segment

      const result = await service.isEnabled(FLAG_NAME, Segment.TEXTILE);

      const expectedKey = `flag:${FLAG_NAME}:${ENV}:TEXTILE`;
      expect(redis.get).toHaveBeenCalledWith(expectedKey);
      expect(result).toBe(false);
    });
  });

  // ─── getFlagValue ─────────────────────────────────────────────────────────

  describe('getFlagValue', () => {
    it('returns rolloutPercent as numeric value', async () => {
      flagRepo.findByName.mockResolvedValueOnce(
        makeFlag({ rolloutPercent: 2 }),
      );

      const result = await service.getFlagValue(FLAG_NAME);

      expect(result).toBe(2);
    });

    it('returns null when flag not found', async () => {
      flagRepo.findByName.mockResolvedValueOnce(null);

      const result = await service.getFlagValue('nonexistent');

      expect(result).toBeNull();
    });
  });

  // ─── toggleFlag ───────────────────────────────────────────────────────────

  describe('toggleFlag', () => {
    it('happy path: toggles flag + creates audit log + invalidates cache', async () => {
      await service.toggleFlag(
        FLAG_NAME,
        { enabled: false },
        ADMIN_ID,
        MOCK_REQUEST,
      );

      // updateFlag called inside $transaction
      expect(prismaService.$transaction).toHaveBeenCalledOnce();
      expect(flagRepo.updateFlag).toHaveBeenCalledWith(
        FLAG_NAME,
        { enabled: false },
        expect.anything(),
      );

      // FOOTGUN-9-C: AuditLog created on every toggle
      expect(auditWriter.safeWrite).toHaveBeenCalledOnce();
      expect(auditWriter.safeWrite).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'STATUS_CHANGE',
          entityType: 'FeatureFlag',
          entityId: FLAG_NAME,
          oldValue: expect.objectContaining({ enabled: true }),
          newValue: expect.objectContaining({ enabled: false }),
        }),
      );
    });

    it('FOOTGUN-9-C: AuditLog called OUTSIDE $transaction', async () => {
      const callOrder: string[] = [];

      prismaService.$transaction.mockImplementationOnce(async (fn: unknown) => {
        callOrder.push('$transaction');
        return fn({});
      });
      auditWriter.safeWrite.mockImplementationOnce(async () => {
        callOrder.push('safeWrite');
      });

      await service.toggleFlag(
        FLAG_NAME,
        { enabled: false },
        ADMIN_ID,
        MOCK_REQUEST,
      );

      expect(callOrder.indexOf('safeWrite')).toBeGreaterThan(
        callOrder.indexOf('$transaction'),
      );
    });

    it('FOOTGUN-9-A: cache invalidation uses SCAN+DEL — scan is called', async () => {
      await service.toggleFlag(
        FLAG_NAME,
        { enabled: false },
        ADMIN_ID,
        MOCK_REQUEST,
      );

      // FOOTGUN-9-A: SCAN must be used, not KEYS
      expect(redis.scan).toHaveBeenCalledWith(
        '0',
        'MATCH',
        `flag:${FLAG_NAME}:${ENV}:*`,
        'COUNT',
        100,
      );
    });

    it('FOOTGUN-9-A: DEL called when SCAN returns keys', async () => {
      redis.scan.mockResolvedValueOnce([
        '0',
        [`flag:${FLAG_NAME}:${ENV}:global`, `flag:${FLAG_NAME}:${ENV}:TEXTILE`],
      ]);

      await service.toggleFlag(
        FLAG_NAME,
        { enabled: false },
        ADMIN_ID,
        MOCK_REQUEST,
      );

      expect(redis.del).toHaveBeenCalledWith(
        `flag:${FLAG_NAME}:${ENV}:global`,
        `flag:${FLAG_NAME}:${ENV}:TEXTILE`,
      );
    });

    it('updates rolloutPercent when provided', async () => {
      await service.toggleFlag(
        FLAG_NAME,
        { enabled: true, rolloutPercent: 5 },
        ADMIN_ID,
        MOCK_REQUEST,
      );

      expect(flagRepo.updateFlag).toHaveBeenCalledWith(
        FLAG_NAME,
        { enabled: true, rolloutPercent: 5 },
        expect.anything(),
      );
    });
  });
});
