import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { InventoryLockService } from '../inventory-lock.service';
import { RedisService } from '../../../core/redis/redis.service';
import { InventoryMetrics } from '../inventory.metrics';

/**
 * Unit tests for InventoryLockService.
 *
 * Authority: SPRINT3_EXECUTION_LOCK_FINAL.md §27 Phase 2 Gate Requirements
 *
 * All 9 required test cases per §27 Phase 2 unit test requirements.
 * Tests use mocked Redis — real Redis concurrency tests are Phase 3 gate (C1-C8).
 */
describe('InventoryLockService', () => {
  let lockService: InventoryLockService;
  let redisMock: Record<string, ReturnType<typeof vi.fn>>;
  let metricsMock: Record<string, ReturnType<typeof vi.fn>>;

  const INVENTORY_ID = 'inv_test_001';

  beforeEach(async () => {
    redisMock = {
      set: vi.fn(),
      eval: vi.fn(),
      incr: vi.fn(),
      expire: vi.fn(),
      get: vi.fn(),
    };

    metricsMock = {
      hotProductDetected: vi.fn(),
      reservationSuccess: vi.fn(),
      reservationFailure: vi.fn(),
      idempotencyHit: vi.fn(),
      optimisticLockRetry: vi.fn(),
      oversellPrevented: vi.fn(),
      reservationReleased: vi.fn(),
      expiryProcessed: vi.fn(),
      driftDetected: vi.fn(),
      abuseViolation: vi.fn(),
      protectionModeChanged: vi.fn(),
      recordReservationLatency: vi.fn(),
      setActiveReservations: vi.fn(),
      setLowStockProducts: vi.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        InventoryLockService,
        { provide: RedisService, useValue: redisMock },
        { provide: InventoryMetrics, useValue: metricsMock },
      ],
    }).compile();

    lockService = module.get(InventoryLockService);
  });

  // ─── acquire() ───────────────────────────────────────────────

  describe('acquire()', () => {
    it('returns a lockToken string when lock is acquired', async () => {
      // SET NX returns 'OK' on success
      redisMock.set.mockResolvedValue('OK');

      const token = await lockService.acquire(INVENTORY_ID);

      expect(token).toBeTypeOf('string');
      expect(token.length).toBeGreaterThan(0);
      // Lock key must use inventoryId — NOT productId (§8.2, WARNING 2)
      expect(redisMock.set).toHaveBeenCalledWith(
        `inv_lock:${INVENTORY_ID}`,
        expect.any(String),
        'EX',
        30,
        'NX',
      );
    });

    it('throws ConflictException with INVENTORY_LOCK_UNAVAILABLE when lock is held', async () => {
      // SET NX returns null when key already exists
      redisMock.set.mockResolvedValue(null);
      redisMock.incr.mockResolvedValue(1); // first contention
      redisMock.expire.mockResolvedValue(1);

      await expect(lockService.acquire(INVENTORY_ID)).rejects.toThrow(
        ConflictException,
      );
      await expect(lockService.acquire(INVENTORY_ID)).rejects.toMatchObject({
        response: { code: 'INVENTORY_LOCK_UNAVAILABLE' },
      });
    });

    it('increments inv_hot_product:{inventoryId} on failed acquire', async () => {
      redisMock.set.mockResolvedValue(null);
      redisMock.incr.mockResolvedValue(1);
      redisMock.expire.mockResolvedValue(1);

      await expect(lockService.acquire(INVENTORY_ID)).rejects.toThrow();

      expect(redisMock.incr).toHaveBeenCalledWith(
        `inv_hot_product:${INVENTORY_ID}`,
      );
    });

    it('calls metrics.hotProductDetected when contention threshold exceeded', async () => {
      redisMock.set.mockResolvedValue(null);
      // Return count >= CONTENTION_THRESHOLD (20)
      redisMock.incr.mockResolvedValue(
        InventoryLockService.CONTENTION_THRESHOLD,
      );
      redisMock.expire.mockResolvedValue(1);

      await expect(lockService.acquire(INVENTORY_ID)).rejects.toThrow();

      expect(metricsMock.hotProductDetected).toHaveBeenCalledWith(
        INVENTORY_ID,
        InventoryLockService.CONTENTION_THRESHOLD,
      );
    });
  });

  // ─── release() ───────────────────────────────────────────────

  describe('release()', () => {
    it('releases lock successfully when token matches (Lua CAS returns 1)', async () => {
      // Lua CAS returns 1 = deleted successfully
      redisMock.eval.mockResolvedValue(1);

      await expect(
        lockService.release(INVENTORY_ID, 'valid-token'),
      ).resolves.toBeUndefined();

      // Must use eval (Lua CAS) — NEVER plain redis.del() (WARNING 3)
      expect(redisMock.eval).toHaveBeenCalled();
    });

    it('does NOT throw when token mismatch (Lua CAS returns 0) — logs warn only', async () => {
      // Lua CAS returns 0 = lock expired or taken — must NOT throw
      redisMock.eval.mockResolvedValue(0);

      // Must NOT throw — this is the correct idempotent behaviour (§8.2)
      await expect(
        lockService.release(INVENTORY_ID, 'expired-token'),
      ).resolves.toBeUndefined();
    });
  });

  // ─── withLock() ──────────────────────────────────────────────

  describe('withLock()', () => {
    it('acquires lock, calls fn(), and releases lock on success', async () => {
      redisMock.set.mockResolvedValue('OK');
      redisMock.eval.mockResolvedValue(1);

      const fn = vi.fn().mockResolvedValue('result');

      const result = await lockService.withLock(INVENTORY_ID, fn);

      expect(result).toBe('result');
      expect(fn).toHaveBeenCalledOnce();
      // Lock must be released in finally (INV-4)
      expect(redisMock.eval).toHaveBeenCalled();
    });

    it('releases lock in finally even when fn() throws (INV-4 guarantee)', async () => {
      redisMock.set.mockResolvedValue('OK');
      redisMock.eval.mockResolvedValue(1);

      const fn = vi.fn().mockRejectedValue(new Error('fn failed'));

      await expect(lockService.withLock(INVENTORY_ID, fn)).rejects.toThrow(
        'fn failed',
      );

      // Lock MUST still be released even though fn() threw (INV-4)
      expect(redisMock.eval).toHaveBeenCalled();
    });

    it('propagates ConflictException and does NOT call fn() when acquire fails', async () => {
      redisMock.set.mockResolvedValue(null); // lock unavailable
      redisMock.incr.mockResolvedValue(1);
      redisMock.expire.mockResolvedValue(1);

      const fn = vi.fn();

      await expect(lockService.withLock(INVENTORY_ID, fn)).rejects.toThrow(
        ConflictException,
      );

      // fn() must NOT be called when acquire fails
      expect(fn).not.toHaveBeenCalled();
    });
  });
});
