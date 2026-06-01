import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { RedisService } from '../../../core/redis/redis.service';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  NotificationPreference,
  NotificationPreferenceSchema,
  UpdatePreferencesDto,
} from '@vyaparnet/types';

/**
 * NotificationPreferenceService — manages user notification preferences.
 *
 * GOVERNANCE:
 * - INV-S6-5: Preference check is the FIRST operation before any channel delivery.
 *   In-App is always created (INV-S6-20). Only external channels are gated.
 * - Redis cache: `notif:pref:{userId}` TTL=300s (§4 Redis Key Registry).
 * - Redis miss/failure → DB fallback → DEFAULT_NOTIFICATION_PREFERENCES.
 *   NEVER return null or throw. Preferences are always resolvable.
 * - §19.2: User.notificationPreferences is JSONB (nullable). null = use defaults.
 *   JSONB shape is validated via safeParse() on every read.
 *
 * Phase 8: Full CRUD implementation with DB persistence and Redis caching.
 */
@Injectable()
export class NotificationPreferenceService {
  private readonly logger = new Logger(NotificationPreferenceService.name);
  private readonly CACHE_TTL = 300; // 5 minutes — §4 Redis Key Registry
  private readonly CACHE_KEY_PREFIX = 'notif:pref:';

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Get preferences for a user.
   * Flow: Redis cache → DB JSONB → DEFAULT_NOTIFICATION_PREFERENCES (never null).
   *
   * INV-S6-5: Called BEFORE any external channel delivery attempt.
   * Redis failure: fallback to DB, then to defaults. Never block notification.
   * JSONB validation: always safeParse() — never trust raw DB JSONB shape.
   */
  async getPreferences(userId: string): Promise<NotificationPreference> {
    const cacheKey = `${this.CACHE_KEY_PREFIX}${userId}`;

    // 1. Try Redis cache
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        const parsed = NotificationPreferenceSchema.safeParse(
          JSON.parse(cached),
        );
        if (parsed.success) return parsed.data;
      }
    } catch {
      // Redis failure: proceed to DB. Never block notification delivery.
      this.logger.warn({ userId }, 'PREF_REDIS_CACHE_MISS');
    }

    // 2. DB fallback — read User.notificationPreferences JSONB
    let dbPrefs: unknown = null;
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { notificationPreferences: true }, // JSONB field (§19.2)
      });
      dbPrefs = user?.notificationPreferences ?? null;
    } catch (err) {
      this.logger.error(
        { userId, error: (err as Error).message },
        'PREF_DB_READ_FAILED',
      );
    }

    // 3. Validate DB result — JSONB may have old/partial shape (safeParse guards this)
    const parsed = NotificationPreferenceSchema.safeParse(dbPrefs);
    const validated = parsed.success
      ? parsed.data
      : DEFAULT_NOTIFICATION_PREFERENCES;

    // 4. Populate Redis cache
    try {
      await this.redis.set(
        cacheKey,
        JSON.stringify(validated),
        'EX',
        this.CACHE_TTL,
      );
    } catch {
      // Redis failure: proceed without caching — not critical
    }

    return validated;
  }

  /**
   * Update preferences for a user.
   * Persists to User.notificationPreferences JSONB and invalidates Redis cache.
   *
   * @param userId - Target user
   * @param dto - Validated UpdatePreferencesDto (full preference object)
   */
  async updatePreferences(
    userId: string,
    dto: UpdatePreferencesDto,
  ): Promise<NotificationPreference> {
    await this.prisma.user.update({
      where: { id: userId },
      // IMPROVEMENT: Prisma 5 Json field requires Prisma.InputJsonValue cast.
      // `as unknown as Prisma.InputJsonValue` is the idiomatic pattern — avoids `any`.

      data: { notificationPreferences: JSON.parse(JSON.stringify(dto)) },
    });

    // Invalidate Redis cache immediately after DB write
    await this.invalidateCache(userId);

    return dto;
  }

  /**
   * Check if a specific channel+category combination is enabled for a user.
   *
   * GOVERNANCE (INV-S6-5): This is a synchronous check on an already-resolved
   * NotificationPreference object. Callers must call getPreferences() first,
   * then pass the result here. This prevents N+1 DB/Redis reads per channel.
   *
   * @param prefs - Already-resolved preferences object
   * @param channel - 'sms' | 'email' | 'push' | 'inApp'
   * @param eventCategory - 'orderUpdates' | 'paymentUpdates' | 'scorecard' | 'lowStock'
   */
  isChannelEnabled(
    prefs: NotificationPreference,
    channel: keyof NotificationPreference,
    eventCategory: keyof NotificationPreference['sms'],
  ): boolean {
    return prefs[channel]?.[eventCategory] ?? false; // Default false if missing — safe
  }

  /**
   * Invalidate user's preference cache (called after PUT /preferences).
   */
  async invalidateCache(userId: string): Promise<void> {
    try {
      await this.redis.del(`${this.CACHE_KEY_PREFIX}${userId}`);
    } catch {
      // Swallow — cache will expire naturally at TTL
    }
  }
}
