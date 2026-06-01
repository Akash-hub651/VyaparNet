import {
  Injectable,
  Logger,
  HttpException,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { RedisService } from '../../core/redis/redis.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { InventoryMetrics } from './inventory.metrics';
import type { SegmentInventoryPolicyDto } from './inventory-policy.service';

/**
 * Context passed to InventoryAbuseGuard.check().
 * Assembled by InventoryReserveService before any lock or DB access. (§15.1)
 */
export interface AbuseCheckContext {
  userId: string;
  ipAddress: string; // raw IP — hashed to SHA-256 before use; NEVER stored (§15.3)
  businessId?: string;
  segment: string;
  quantity: number;
  policy: SegmentInventoryPolicyDto;
  inventoryId: string;
}

/**
 * InventoryAbuseGuard — Five concurrent checks for velocity and hoarding protection.
 *
 * Authority: SPRINT3_EXECUTION_LOCK_FINAL.md §15.1–§15.3
 *
 * Checks (run in parallel via Promise.all):
 *  1. checkUserReservationCount — anti-hoarding DB count (§15.3)
 *  2. checkUserVelocity         — Redis INCR, 1-hour rolling window (§15.2)
 *  3. checkIpVelocity           — Redis INCR, SHA-256 ipHash, NEVER raw IP (§15.3)
 *  4. checkBusinessVelocity     — Redis INCR (only if businessId present) (§15.3)
 *  5. checkQuantityLimit        — pure function, no I/O (§15.3)
 *
 * INVARIANTS:
 *  - ALL velocity checks use redis.incr() — NEVER get+set (§15.2, WARNING 14)
 *  - ipHash = SHA-256(rawIP) — raw IP never stored, logged, or persisted (§15.3)
 *  - All thresholds from SegmentInventoryPolicy — NEVER hardcoded (§15.3)
 */
@Injectable()
export class InventoryAbuseGuard {
  private readonly logger = new Logger(InventoryAbuseGuard.name);

  /** IP velocity limit: 200 requests/hour/IP. §15.3 (not from policy — global limit) */
  private static readonly IP_VELOCITY_LIMIT = 200;
  /** Business velocity multiplier: 3x user limit. §15.3 */
  private static readonly BUSINESS_VELOCITY_MULTIPLIER = 3;
  /** Velocity counter TTL: 1-hour rolling window. §8.1 */
  private static readonly VELOCITY_TTL = 3600;

  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    private readonly metrics: InventoryMetrics,
  ) {}

  /**
   * Run all 5 abuse checks concurrently.
   * Fails fast on any violation — Promise.all rejects on first failure.
   *
   * Called at Step 5 in reserve() execution flow — BEFORE lock acquisition. (§11.2)
   */
  async check(ctx: AbuseCheckContext): Promise<void> {
    await Promise.all([
      this.checkUserReservationCount(ctx),
      this.checkUserVelocity(ctx),
      this.checkIpVelocity(ctx),
      ctx.businessId ? this.checkBusinessVelocity(ctx) : Promise.resolve(),
      this.checkQuantityLimit(ctx),
    ]);
  }

  /**
   * Check 1: Anti-hoarding — count active reservations for this user.
   * DB count query — cannot be cached (must be real-time). (§15.1)
   * Threshold: policy.maxReservationsPerUser — from SegmentInventoryPolicy.
   */
  private async checkUserReservationCount(
    ctx: AbuseCheckContext,
  ): Promise<void> {
    const count = await this.prisma.inventoryReservation.count({
      where: {
        reservedByUserId: ctx.userId,
        status: 'ACTIVE',
      },
    });

    if (count >= ctx.policy.maxReservationsPerUser) {
      this.metrics.abuseViolation('reservation_limit', ctx.segment);
      this.logger.warn(
        {
          userId: ctx.userId,
          count,
          limit: ctx.policy.maxReservationsPerUser,
          segment: ctx.segment,
        },
        'Inventory abuse violation: reservation limit exceeded',
      );
      throw new HttpException(
        {
          code: 'RESERVATION_LIMIT_EXCEEDED',
          activeCount: count,
          limit: ctx.policy.maxReservationsPerUser,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /**
   * Check 2: User velocity — atomic INCR, 1-hour rolling window.
   * FORBIDDEN: get+set pattern (§15.2, WARNING 14). Must use INCR.
   */
  private async checkUserVelocity(ctx: AbuseCheckContext): Promise<void> {
    const key = `inv_velocity:${ctx.userId}:${ctx.segment}`;

    try {
      // INCR is atomic — cannot be raced. (§15.2)
      const count = await this.redis.incr(key);
      if (count === 1) {
        await this.redis.expire(key, InventoryAbuseGuard.VELOCITY_TTL);
      }

      if (count > ctx.policy.reservationVelocityLimitPerHour) {
        this.metrics.abuseViolation('user_velocity', ctx.segment);
        this.logger.warn(
          {
            userId: ctx.userId,
            count,
            limit: ctx.policy.reservationVelocityLimitPerHour,
            segment: ctx.segment,
          },
          'Inventory abuse violation: user velocity exceeded',
        );
        throw new HttpException(
          {
            code: 'RESERVATION_VELOCITY_EXCEEDED',
            count,
            limit: ctx.policy.reservationVelocityLimitPerHour,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      this.logger.error(
        'Redis error during user velocity check — allowing request in degraded mode',
        err.message,
      );
    }
  }

  /**
   * Check 3: IP velocity — atomic INCR with SHA-256 hashed IP.
   * Raw IP NEVER stored, logged, or persisted. (§15.3, §8.1)
   */
  private async checkIpVelocity(ctx: AbuseCheckContext): Promise<void> {
    // SHA-256 hash — irreversible. Raw IP discarded after hashing.
    const ipHash = createHash('sha256')
      .update(ctx.ipAddress ?? 'unknown')
      .digest('hex');
    const key = `inv_velocity_ip:${ipHash}`;

    try {
      const count = await this.redis.incr(key);
      if (count === 1) {
        await this.redis.expire(key, InventoryAbuseGuard.VELOCITY_TTL);
      }

      if (count > InventoryAbuseGuard.IP_VELOCITY_LIMIT) {
        this.metrics.abuseViolation('ip_rate_limit', ctx.segment);
        // Log ipHash — NEVER the raw IP (§15.3)
        this.logger.warn(
          {
            ipHash,
            count,
            limit: InventoryAbuseGuard.IP_VELOCITY_LIMIT,
            segment: ctx.segment,
          },
          'Inventory abuse violation: IP rate limit exceeded',
        );
        throw new HttpException(
          {
            code: 'IP_RATE_LIMIT_EXCEEDED',
            count,
            limit: InventoryAbuseGuard.IP_VELOCITY_LIMIT,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      this.logger.error(
        'Redis error during IP velocity check — allowing request in degraded mode',
        err.message,
      );
    }
  }

  /**
   * Check 4: Business velocity — atomic INCR.
   * Threshold: policy.reservationVelocityLimitPerHour * 3 (business has higher allowance).
   * Only runs if businessId is present. (§15.1)
   */
  private async checkBusinessVelocity(ctx: AbuseCheckContext): Promise<void> {
    if (!ctx.businessId) return;
    const key = `inv_velocity_biz:${ctx.businessId}`;
    const limit =
      ctx.policy.reservationVelocityLimitPerHour *
      InventoryAbuseGuard.BUSINESS_VELOCITY_MULTIPLIER;

    try {
      const count = await this.redis.incr(key);
      if (count === 1) {
        await this.redis.expire(key, InventoryAbuseGuard.VELOCITY_TTL);
      }

      if (count > limit) {
        this.metrics.abuseViolation('business_velocity', ctx.segment);
        this.logger.warn(
          { businessId: ctx.businessId, count, limit, segment: ctx.segment },
          'Inventory abuse violation: business velocity exceeded',
        );
        throw new HttpException(
          { code: 'BUSINESS_VELOCITY_EXCEEDED', count, limit },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      this.logger.error(
        'Redis error during business velocity check — allowing request in degraded mode',
        err.message,
      );
    }
  }

  /**
   * Check 5: Quantity limit — pure synchronous check, no I/O.
   * Threshold: policy.maxReservationQtyPerRequest — from SegmentInventoryPolicy.
   */
  private checkQuantityLimit(ctx: AbuseCheckContext): Promise<void> {
    if (ctx.quantity > ctx.policy.maxReservationQtyPerRequest) {
      this.metrics.abuseViolation('quantity_limit', ctx.segment);
      this.logger.warn(
        {
          quantity: ctx.quantity,
          limit: ctx.policy.maxReservationQtyPerRequest,
          segment: ctx.segment,
        },
        'Inventory abuse violation: quantity limit exceeded',
      );
      throw new BadRequestException({
        code: 'QUANTITY_LIMIT_EXCEEDED',
        requested: ctx.quantity,
        limit: ctx.policy.maxReservationQtyPerRequest,
      });
    }
    return Promise.resolve();
  }
}
