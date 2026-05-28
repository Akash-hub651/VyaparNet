import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { RedisService } from '../../core/redis/redis.service';
import { SegmentInventoryPolicyRepository } from './repositories/segment-inventory-policy.repository';

/**
 * Context object passed to computeReservationTtl.
 * Drives dynamic TTL calculation — no numeric TTL literals allowed outside here. (§12.1)
 */
export interface ReservationTtlContext {
  orderType: 'CART' | 'ORDER' | 'RFQ';
  paymentMethod?:
    | 'ONLINE_UPI'
    | 'ONLINE_CARD'
    | 'COD'
    | 'CREDIT'
    | 'BANK_TRANSFER';
  isBusinessVerified?: boolean;
}

/**
 * Typed SegmentInventoryPolicy shape returned from DB/cache.
 * Matches §9.1 schema exactly.
 */
export interface SegmentInventoryPolicyDto {
  id: string;
  segment: string;
  maxReservationTtlSeconds: number;
  maxReservationsPerUser: number;
  maxReservationQtyPerRequest: number;
  reservationVelocityLimitPerHour: number;
  allowBackorder: boolean;
  allowVirtualStock: boolean;
  lowStockThresholdPercent: number;
  isActive: boolean;
}

/**
 * InventoryPolicyService — SegmentInventoryPolicy cache-aside + dynamic TTL computation.
 *
 * Authority: SPRINT3_EXECUTION_LOCK_FINAL.md §12.1, §12.2
 *
 * INVARIANTS:
 *  - computeReservationTtl() is the ONLY TTL source — no numeric literals in business logic.
 *  - getPolicy() uses cache-aside (inv_policy:{segment}, 300s TTL).
 *  - Missing policy → InternalServerErrorException (seed data missing — ops issue).
 *
 * AI-AGENT WARNINGS (§34):
 *  - WARNING 10: No hardcoded TTL values — all from computeReservationTtl()
 */
@Injectable()
export class InventoryPolicyService {
  private readonly logger = new Logger(InventoryPolicyService.name);

  /** Redis key prefix for segment policy cache. §8.1 */
  static readonly POLICY_KEY_PREFIX = 'inv_policy:';
  /** Policy cache TTL: 5 minutes. §8.1 */
  static readonly POLICY_CACHE_TTL = 300;

  constructor(
    private readonly redis: RedisService,
    private readonly policyRepo: SegmentInventoryPolicyRepository,
  ) {}

  /**
   * Get segment inventory policy via cache-aside pattern.
   *
   * Cache key: inv_policy:{segment} — TTL 300s. (§12.2, §8.1)
   * DB miss (no seed row) → InternalServerErrorException.
   * Redis errors are swallowed — falls back to DB. Never throws for Redis issues.
   *
   * @throws InternalServerErrorException if policy not seeded in DB
   */
  async getPolicy(segment: string): Promise<SegmentInventoryPolicyDto> {
    const cacheKey = `${InventoryPolicyService.POLICY_KEY_PREFIX}${segment}`;

    // Step 1: Redis cache read (display acceleration)
    const cached = await this.redis
      .getJson<SegmentInventoryPolicyDto>(cacheKey)
      .catch(() => null);
    if (cached) {
      this.logger.debug({ segment }, 'Policy cache hit');
      return cached;
    }

    // Step 2: DB authoritative read
    const policy = await this.policyRepo.findBySegment(segment);

    if (!policy) {
      // Seed data missing — this is an ops/infrastructure issue, not a client error
      this.logger.error(
        { segment },
        'SegmentInventoryPolicy not found — seed data missing',
      );
      throw new InternalServerErrorException({
        code: 'SEGMENT_POLICY_NOT_CONFIGURED',
        message: `SegmentInventoryPolicy for segment '${segment}' is not seeded.`,
      });
    }

    // Step 3: Cache for 300s (§12.2)
    await this.redis
      .setJson(cacheKey, policy, InventoryPolicyService.POLICY_CACHE_TTL)
      .catch(() => {
        this.logger.warn(
          { segment },
          'Policy cache set failed — using DB result directly',
        );
      });

    return policy;
  }

  /**
   * Invalidate policy cache (called on admin policy update).
   * Next getPolicy() call will rebuild from DB. (§12.2)
   */
  async invalidatePolicyCache(segment: string): Promise<void> {
    const cacheKey = `${InventoryPolicyService.POLICY_KEY_PREFIX}${segment}`;
    await this.redis.del(cacheKey).catch(() => {});
    this.logger.log({ segment }, 'Policy cache invalidated');
  }

  /**
   * Compute reservation TTL from policy + context.
   *
   * THIS IS THE ONLY TTL SOURCE IN THE ENTIRE INVENTORY MODULE. (§12.1, §7.3 rule 12)
   * No other code may use numeric TTL literals for inventory reservations.
   *
   * Floor: 300 seconds (5 minutes) — always enforced regardless of modifiers.
   * Ceiling: policy.maxReservationTtlSeconds — segment-defined upper bound.
   *
   * @returns TTL in seconds
   */
  computeReservationTtl(
    policy: SegmentInventoryPolicyDto,
    context: ReservationTtlContext,
  ): number {
    // Base TTL from segment policy — never hardcoded
    let ttl = policy.maxReservationTtlSeconds;

    // Order type modifiers (§12.1)
    if (context.orderType === 'CART') ttl = Math.min(ttl, 900); // Cart: max 15 min
    if (context.orderType === 'ORDER') ttl = Math.min(ttl, 1800); // Checkout: max 30 min
    if (context.orderType === 'RFQ') ttl = Math.min(ttl, 86400); // RFQ: up to 24h

    // Payment method modifiers (§12.1)
    if (context.paymentMethod === 'COD') ttl = Math.min(ttl, 900);
    if (context.paymentMethod === 'CREDIT')
      ttl = Math.min(ttl, policy.maxReservationTtlSeconds);

    // Trust modifiers — Verified B2B RFQ gets extended window (§12.1)
    if (context.isBusinessVerified && context.orderType === 'RFQ') {
      ttl = Math.min(ttl * 2, 172800); // Verified B2B RFQ: up to 48h
    }

    // Floor: 5 minutes minimum — always enforced (§12.1)
    return Math.max(ttl, 300);
  }
}
