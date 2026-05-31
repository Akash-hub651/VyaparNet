import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../../core/redis/redis.service';

/**
 * DeduplicationService — Redis-backed deduplication for notifications.
 *
 * GOVERNANCE:
 * - INV-S6-6: Dedup key MUST be deterministic: `notif:{userId}:{eventType}:{entityId}`.
 *   NEVER use Date.now() or randomUUID() in the key — non-deterministic keys break idempotency.
 * - INV-S6-25: Buyer + Seller dedup keys in handleOrderCreated are ALWAYS separate.
 * - Redis failure: on any Redis error → log warn + return false (assume NOT duplicate).
 *   This is the safe degraded mode: possible duplicate is acceptable vs. missed notification.
 *
 * Key format documented in §4 Redis Key Registry:
 *   notif:{userId}:{eventType}:{entityId}  TTL=300s  (5 minutes)
 *   notif:lowstock:{productId}:{businessId} TTL=86400s (24 hours)
 */
@Injectable()
export class DeduplicationService {
  private readonly logger = new Logger(DeduplicationService.name);

  constructor(private readonly redis: RedisService) {}

  /**
   * Check if this (userId, eventType, entityId) combination has already been processed.
   *
   * INV-S6-6: Key must be deterministic — no timestamp, no random component.
   * Redis failure → returns false (assume NOT duplicate, proceed with notification).
   *
   * @param key - Full dedup key in format `notif:{userId}:{eventType}:{entityId}`
   * @returns true if already processed (skip notification), false if should proceed
   */
  async isDuplicate(key: string): Promise<boolean> {
    try {
      const exists = await this.redis.exists(key);
      return exists === 1;
    } catch (err) {
      // Redis failure: safe degraded mode — assume NOT a duplicate
      // Rationale: possible duplicate notification < missed notification at scale
      this.logger.warn({ key, error: (err as Error).message }, 'DEDUP_REDIS_UNAVAILABLE_ASSUME_NOT_DUPLICATE');
      return false;
    }
  }

  /**
   * Mark a (userId, eventType, entityId) combination as processed.
   *
   * MUST be called AFTER successful job enqueue — never before (INV-S6-6).
   * Redis failure: swallow silently — worst case is a duplicate notification, not data loss.
   *
   * @param key - Full dedup key (same format as isDuplicate)
   * @param ttlSeconds - Time-to-live: 300 for notifications, 86400 for low-stock rate-limit
   */
  async setProcessed(key: string, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.set(key, '1', 'EX', ttlSeconds);
    } catch (err) {
      // Swallow Redis failure — not critical path
      this.logger.warn({ key, error: (err as Error).message }, 'DEDUP_SET_REDIS_UNAVAILABLE');
    }
  }

  /**
   * Check low-stock rate limit for a specific (productId, businessId) pair.
   *
   * INV-S6-11: Max 1 SMS per (productId, businessId) per 24 hours.
   * Key format: `notif:lowstock:{productId}:{businessId}`  TTL=86400s
   *
   * @returns true if rate limit is active (skip SMS), false if allowed to send
   */
  async isLowStockRateLimited(productId: string, businessId: string): Promise<boolean> {
    const key = `notif:lowstock:${productId}:${businessId}`;
    return this.isDuplicate(key);
  }

  /**
   * Set the low-stock rate limit for a (productId, businessId) pair.
   * Called AFTER successfully enqueuing the SMS job.
   */
  async setLowStockRateLimit(productId: string, businessId: string): Promise<void> {
    const key = `notif:lowstock:${productId}:${businessId}`;
    await this.setProcessed(key, 86400); // 24 hours — INV-S6-11
  }
}
