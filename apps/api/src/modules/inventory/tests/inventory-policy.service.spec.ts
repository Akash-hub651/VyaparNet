import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { InternalServerErrorException } from '@nestjs/common';
import { InventoryPolicyService } from '../inventory-policy.service';
import { RedisService } from '../../../core/redis/redis.service';
import { SegmentInventoryPolicyRepository } from '../repositories/segment-inventory-policy.repository';
import type {
  SegmentInventoryPolicyDto,
  ReservationTtlContext,
} from '../inventory-policy.service';
import { Segment } from '@vyaparnet/types';

/**
 * Unit tests for InventoryPolicyService.
 *
 * Authority: SPRINT3_EXECUTION_LOCK_FINAL.md §27 Phase 2 Gate Requirements (7 tests)
 */
describe('InventoryPolicyService', () => {
  let policyService: InventoryPolicyService;
  let redisMock: Record<string, ReturnType<typeof vi.fn>>;
  let policyRepoMock: Record<string, ReturnType<typeof vi.fn>>;

  const MOCK_TEXTILE_POLICY: SegmentInventoryPolicyDto = {
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

  beforeEach(async () => {
    redisMock = {
      get: vi.fn(),
      getJson: vi.fn(),
      setJson: vi.fn(),
      setex: vi.fn(),
      del: vi.fn(),
    };

    policyRepoMock = {
      findBySegment: vi.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        InventoryPolicyService,
        { provide: RedisService, useValue: redisMock },
        { provide: SegmentInventoryPolicyRepository, useValue: policyRepoMock },
      ],
    }).compile();

    policyService = module.get(InventoryPolicyService);
  });

  // ─── computeReservationTtl() ─────────────────────────────────

  describe('computeReservationTtl()', () => {
    it('CART context returns TTL <= 900 (max 15 min for cart)', () => {
      const ctx: ReservationTtlContext = { orderType: 'CART' };
      const ttl = policyService.computeReservationTtl(MOCK_TEXTILE_POLICY, ctx);
      expect(ttl).toBeLessThanOrEqual(900);
    });

    it('ORDER context returns TTL <= 1800 (max 30 min for checkout)', () => {
      // Policy with high maxTtl — ORDER cap should still apply
      const highTtlPolicy = {
        ...MOCK_TEXTILE_POLICY,
        maxReservationTtlSeconds: 9999,
      };
      const ctx: ReservationTtlContext = { orderType: 'ORDER' };
      const ttl = policyService.computeReservationTtl(highTtlPolicy, ctx);
      expect(ttl).toBeLessThanOrEqual(1800);
    });

    it('RFQ context returns TTL <= 86400 (max 24h for RFQ)', () => {
      const rfqPolicy = {
        ...MOCK_TEXTILE_POLICY,
        maxReservationTtlSeconds: 86400,
      };
      const ctx: ReservationTtlContext = { orderType: 'RFQ' };
      const ttl = policyService.computeReservationTtl(rfqPolicy, ctx);
      expect(ttl).toBeLessThanOrEqual(86400);
    });

    it('always returns at least 300s (5-minute floor — §12.1)', () => {
      // Force a very low base TTL — floor must still hold
      const lowTtlPolicy = {
        ...MOCK_TEXTILE_POLICY,
        maxReservationTtlSeconds: 100,
      };
      const ctx: ReservationTtlContext = { orderType: 'CART' };
      const ttl = policyService.computeReservationTtl(lowTtlPolicy, ctx);
      expect(ttl).toBeGreaterThanOrEqual(300);
    });
  });

  // ─── getPolicy() ─────────────────────────────────────────────

  describe('getPolicy()', () => {
    it('returns cached policy from Redis on cache hit (no DB call)', async () => {
      redisMock.getJson.mockResolvedValue(MOCK_TEXTILE_POLICY);

      const result = await policyService.getPolicy(Segment.TEXTILE);

      expect(result).toEqual(MOCK_TEXTILE_POLICY);
      expect(policyRepoMock.findBySegment).not.toHaveBeenCalled();
    });

    it('fetches from DB on cache miss, then sets Redis cache with 300s TTL', async () => {
      redisMock.getJson.mockResolvedValue(null); // cache miss
      redisMock.setJson.mockResolvedValue('OK');
      policyRepoMock.findBySegment.mockResolvedValue(MOCK_TEXTILE_POLICY);

      const result = await policyService.getPolicy(Segment.TEXTILE);

      expect(result).toEqual(MOCK_TEXTILE_POLICY);
      expect(policyRepoMock.findBySegment).toHaveBeenCalledWith(
        Segment.TEXTILE,
      );
      expect(redisMock.setJson).toHaveBeenCalledWith(
        `inv_policy:${Segment.TEXTILE}`,
        MOCK_TEXTILE_POLICY,
        300,
      );
    });

    it('throws InternalServerErrorException when policy not in DB (seed data missing)', async () => {
      redisMock.getJson.mockResolvedValue(null);
      policyRepoMock.findBySegment.mockResolvedValue(null); // not seeded

      await expect(policyService.getPolicy(Segment.TEXTILE)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });
});
