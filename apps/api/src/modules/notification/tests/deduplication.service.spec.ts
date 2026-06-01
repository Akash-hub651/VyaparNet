import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DeduplicationService } from '../services/deduplication.service';

/**
 * DeduplicationService unit tests — FIX-8a.
 *
 * Tests all governance rules from INV-S6-6 and INV-S6-11:
 * - Deterministic key format
 * - isDuplicate returns true only when key exists
 * - setProcessed stores with correct TTL
 * - Redis failure → assume NOT duplicate (safe degraded mode)
 * - isLowStockRateLimited / setLowStockRateLimit 24h TTL
 */
describe('DeduplicationService', () => {
  let service: DeduplicationService;
  let mockRedis: {
    exists: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockRedis = {
      exists: vi.fn(),
      set: vi.fn(),
    };
    service = new DeduplicationService(mockRedis as any);
  });

  afterEach(() => vi.clearAllMocks());

  // ─── isDuplicate ────────────────────────────────────────────────────────────

  describe('isDuplicate()', () => {
    it('returns true when Redis exists returns 1', async () => {
      mockRedis.exists.mockResolvedValue(1);
      const result = await service.isDuplicate(
        'notif:user-1:OrderCreated:order-1',
      );
      expect(result).toBe(true);
    });

    it('returns false when Redis exists returns 0', async () => {
      mockRedis.exists.mockResolvedValue(0);
      const result = await service.isDuplicate(
        'notif:user-1:OrderCreated:order-1',
      );
      expect(result).toBe(false);
    });

    it('returns false (NOT duplicate) on Redis failure — INV-S6-6 safe degraded mode', async () => {
      // Safe degraded mode: possible duplicate < missed notification
      mockRedis.exists.mockRejectedValue(new Error('Redis ECONNRESET'));
      const result = await service.isDuplicate(
        'notif:user-1:OrderCreated:order-1',
      );
      expect(result).toBe(false);
    });

    it('passes the exact key string to Redis.exists() — key format must be deterministic', async () => {
      mockRedis.exists.mockResolvedValue(0);
      const key = 'notif:user-abc:PaymentFailed:order-xyz';
      await service.isDuplicate(key);
      expect(mockRedis.exists).toHaveBeenCalledWith(key);
    });
  });

  // ─── setProcessed ───────────────────────────────────────────────────────────

  describe('setProcessed()', () => {
    it('stores key with provided TTL', async () => {
      mockRedis.set.mockResolvedValue('OK');
      await service.setProcessed('notif:user-1:OrderCreated:order-1', 300);
      expect(mockRedis.set).toHaveBeenCalledWith(
        'notif:user-1:OrderCreated:order-1',
        '1',
        'EX',
        300,
      );
    });

    it('stores low-stock key with 86400s TTL (24h) — INV-S6-11', async () => {
      mockRedis.set.mockResolvedValue('OK');
      await service.setProcessed('notif:lowstock:prod-1:biz-1', 86400);
      expect(mockRedis.set).toHaveBeenCalledWith(
        'notif:lowstock:prod-1:biz-1',
        '1',
        'EX',
        86400,
      );
    });

    it('swallows Redis failure — never throws on set failure', async () => {
      mockRedis.set.mockRejectedValue(new Error('Redis write timeout'));
      // Must not throw
      await expect(
        service.setProcessed('notif:user-1:OrderCreated:order-1', 300),
      ).resolves.toBeUndefined();
    });
  });

  // ─── isLowStockRateLimited ─────────────────────────────────────────────────

  describe('isLowStockRateLimited()', () => {
    it('returns true when lowstock key exists for (productId, businessId)', async () => {
      mockRedis.exists.mockResolvedValue(1);
      const result = await service.isLowStockRateLimited('prod-1', 'biz-1');
      expect(result).toBe(true);
      expect(mockRedis.exists).toHaveBeenCalledWith(
        'notif:lowstock:prod-1:biz-1',
      );
    });

    it('returns false when no rate limit key exists', async () => {
      mockRedis.exists.mockResolvedValue(0);
      const result = await service.isLowStockRateLimited('prod-1', 'biz-1');
      expect(result).toBe(false);
    });

    it('returns false (not rate-limited) on Redis failure — delivery preferred over suppression', async () => {
      mockRedis.exists.mockRejectedValue(new Error('Redis unavailable'));
      const result = await service.isLowStockRateLimited('prod-1', 'biz-1');
      expect(result).toBe(false);
    });
  });

  // ─── setLowStockRateLimit ──────────────────────────────────────────────────

  describe('setLowStockRateLimit()', () => {
    it('sets the lowstock rate-limit key with 86400s (24h) TTL — INV-S6-11', async () => {
      mockRedis.set.mockResolvedValue('OK');
      await service.setLowStockRateLimit('prod-1', 'biz-1');
      expect(mockRedis.set).toHaveBeenCalledWith(
        'notif:lowstock:prod-1:biz-1',
        '1',
        'EX',
        86400,
      );
    });

    it('uses separate keys for different (productId, businessId) pairs — INV-S6-25 isolation', async () => {
      mockRedis.set.mockResolvedValue('OK');
      await service.setLowStockRateLimit('prod-A', 'biz-1');
      await service.setLowStockRateLimit('prod-A', 'biz-2');
      expect(mockRedis.set).toHaveBeenNthCalledWith(
        1,
        'notif:lowstock:prod-A:biz-1',
        '1',
        'EX',
        86400,
      );
      expect(mockRedis.set).toHaveBeenNthCalledWith(
        2,
        'notif:lowstock:prod-A:biz-2',
        '1',
        'EX',
        86400,
      );
    });
  });
});
