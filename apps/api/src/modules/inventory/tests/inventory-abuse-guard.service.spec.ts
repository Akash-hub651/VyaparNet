import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { InventoryAbuseGuard } from '../inventory-abuse-guard.service';
import { RedisService } from '../../../core/redis/redis.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { InventoryMetrics } from '../inventory.metrics';
import type { AbuseCheckContext } from '../inventory-abuse-guard.service';
import type { SegmentInventoryPolicyDto } from '../inventory-policy.service';

/**
 * Unit tests for InventoryAbuseGuard.
 *
 * Authority: SPRINT3_EXECUTION_LOCK_FINAL.md §27 Phase 2 Gate Requirements (6 tests)
 * All velocity checks must use Redis INCR — verified via mock expectations. (§15.2)
 */
describe('InventoryAbuseGuard', () => {
  let abuseGuard: InventoryAbuseGuard;
  let redisMock: Record<string, ReturnType<typeof vi.fn>>;
  let prismaMock: Record<string, any>;
  let metricsMock: Record<string, ReturnType<typeof vi.fn>>;

  const MOCK_POLICY: SegmentInventoryPolicyDto = {
    id: 'pol_001',
    segment: 'TEXTILE',
    maxReservationTtlSeconds: 900,
    maxReservationsPerUser: 5,
    maxReservationQtyPerRequest: 500,
    reservationVelocityLimitPerHour: 50,
    allowBackorder: false,
    allowVirtualStock: false,
    lowStockThresholdPercent: 20,
    isActive: true,
  };

  const BASE_CTX: AbuseCheckContext = {
    userId: 'user_001',
    ipAddress: '1.2.3.4',
    businessId: 'biz_001',
    segment: 'TEXTILE',
    quantity: 10,
    policy: MOCK_POLICY,
    inventoryId: 'inv_001',
  };

  beforeEach(async () => {
    redisMock = {
      incr: vi.fn().mockResolvedValue(1),
      expire: vi.fn().mockResolvedValue(1),
    };

    prismaMock = {
      inventoryReservation: {
        count: vi.fn().mockResolvedValue(0), // Default: under limit
      },
    };

    metricsMock = {
      abuseViolation: vi.fn(),
      hotProductDetected: vi.fn(),
      reservationSuccess: vi.fn(),
      reservationFailure: vi.fn(),
      idempotencyHit: vi.fn(),
      optimisticLockRetry: vi.fn(),
      oversellPrevented: vi.fn(),
      reservationReleased: vi.fn(),
      expiryProcessed: vi.fn(),
      driftDetected: vi.fn(),
      protectionModeChanged: vi.fn(),
      recordReservationLatency: vi.fn(),
      setActiveReservations: vi.fn(),
      setLowStockProducts: vi.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        InventoryAbuseGuard,
        { provide: RedisService, useValue: redisMock },
        { provide: PrismaService, useValue: prismaMock },
        { provide: InventoryMetrics, useValue: metricsMock },
      ],
    }).compile();

    abuseGuard = module.get(InventoryAbuseGuard);
  });

  // ─── check() ─────────────────────────────────────────────────

  describe('check()', () => {
    it('passes without throwing when all limits are within bounds', async () => {
      redisMock.incr.mockResolvedValue(1); // count=1, well below limits
      prismaMock.inventoryReservation.count.mockResolvedValue(0);

      await expect(abuseGuard.check(BASE_CTX)).resolves.toBeUndefined();
    });

    it('throws 429 RESERVATION_LIMIT_EXCEEDED when active reservation count >= maxReservationsPerUser', async () => {
      prismaMock.inventoryReservation.count.mockResolvedValue(
        MOCK_POLICY.maxReservationsPerUser, // exactly at limit
      );
      redisMock.incr.mockResolvedValue(1);

      const promise = abuseGuard.check(BASE_CTX);
      await expect(promise).rejects.toMatchObject({
        response: { code: 'RESERVATION_LIMIT_EXCEEDED' },
        status: 429,
      });
    });

    it('throws 429 RESERVATION_VELOCITY_EXCEEDED when user velocity > limit', async () => {
      prismaMock.inventoryReservation.count.mockResolvedValue(0);
      redisMock.incr
        .mockResolvedValueOnce(MOCK_POLICY.reservationVelocityLimitPerHour + 1) // user velocity over limit
        .mockResolvedValue(1); // others fine

      // Call once — store promise, assert both on same rejection
      const promise = abuseGuard.check(BASE_CTX);
      await expect(promise).rejects.toMatchObject({
        response: { code: 'RESERVATION_VELOCITY_EXCEEDED' },
        status: 429,
      });
    });

    it('throws 429 IP_RATE_LIMIT_EXCEEDED when IP velocity > 200/hour', async () => {
      prismaMock.inventoryReservation.count.mockResolvedValue(0);
      redisMock.incr
        .mockResolvedValueOnce(1) // user velocity ok
        .mockResolvedValueOnce(201) // IP velocity over 200 limit
        .mockResolvedValue(1); // others fine

      const promise = abuseGuard.check(BASE_CTX);
      await expect(promise).rejects.toMatchObject({
        response: { code: 'IP_RATE_LIMIT_EXCEEDED' },
        status: 429,
      });
    });

    it('throws 429 BUSINESS_VELOCITY_EXCEEDED when business velocity > limit * 3', async () => {
      prismaMock.inventoryReservation.count.mockResolvedValue(0);
      const bizLimit = MOCK_POLICY.reservationVelocityLimitPerHour * 3;
      redisMock.incr
        .mockResolvedValueOnce(1) // user velocity ok
        .mockResolvedValueOnce(1) // IP velocity ok
        .mockResolvedValueOnce(bizLimit + 1) // business velocity over limit
        .mockResolvedValue(1);

      const promise = abuseGuard.check(BASE_CTX);
      await expect(promise).rejects.toMatchObject({
        response: { code: 'BUSINESS_VELOCITY_EXCEEDED' },
        status: 429,
      });
    });

    it('throws 400 QUANTITY_LIMIT_EXCEEDED when quantity > maxReservationQtyPerRequest', async () => {
      prismaMock.inventoryReservation.count.mockResolvedValue(0);
      redisMock.incr.mockResolvedValue(1);

      const overLimitCtx: AbuseCheckContext = {
        ...BASE_CTX,
        quantity: MOCK_POLICY.maxReservationQtyPerRequest + 1,
      };

      const promise = abuseGuard.check(overLimitCtx);
      await expect(promise).rejects.toMatchObject({
        response: { code: 'QUANTITY_LIMIT_EXCEEDED' },
      });
    });
  });
});
