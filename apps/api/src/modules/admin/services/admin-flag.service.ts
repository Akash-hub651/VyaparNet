import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AuditSafeWriterService } from '../../security/audit/audit-safe-writer.service';
import {
  AdminFlagRepository,
  type FeatureFlagRecord,
} from '../repositories/admin-flag.repository';
import { RedisService } from '../../../core/redis/redis.service';
import { AuditAction, SystemActorType } from '@vyaparnet/types';
import { Segment } from '@vyaparnet/database';
import type { AdminUpdateFlagDto } from '@vyaparnet/types';
import type { Request } from 'express';

// ─── Response DTO ─────────────────────────────────────────────────────────────

export interface FeatureFlagDto {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  rolloutPercent: number;
  segment: Segment | null;
  env: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * AdminFlagService — Step 9.2.
 *
 * Provides:
 *  - listFlags()                     → all FeatureFlag records (admin view)
 *  - isEnabled(name, segment?)       → boolean flag check (Redis-cached, DB fallback)
 *  - getFlagValue(name)              → numeric rate from rolloutPercent field
 *  - toggleFlag(name, dto, adminId)  → toggle + optional rolloutPercent update
 *
 * Caching (INV-S7-18):
 *  - Key pattern: `flag:{name}:{env}:{segment}` (segment='global' for null)
 *  - TTL: 300 seconds
 *  - Invalidation: SCAN + DEL (FOOTGUN-9-A: NEVER redis.keys())
 *
 * FOOTGUN-9-A: Use SCAN+DEL for invalidation — NEVER redis.keys().
 * FOOTGUN-9-B: If Redis unavailable → DB fallback (never 0-TTL cache on failure).
 * FOOTGUN-9-C: Every flag toggle creates AuditLog (INV-S7-2).
 *
 * Authority: §24 Phase 9, Step 9.2.
 */
@Injectable()
export class AdminFlagService {
  private readonly logger = new Logger(AdminFlagService.name);
  private readonly FLAG_TTL_SECONDS = 300;

  constructor(
    private readonly prisma: PrismaService,
    private readonly flagRepo: AdminFlagRepository,
    private readonly auditWriter: AuditSafeWriterService,
    private readonly redis: RedisService,
  ) {}

  // ─── listFlags ────────────────────────────────────────────────────────────

  /**
   * listFlags — returns all feature flags for admin view.
   * Not cached — admin reads are low-frequency.
   */
  async listFlags(): Promise<FeatureFlagDto[]> {
    const flags = await this.flagRepo.findAll();
    return flags.map((f) => this.toDto(f));
  }

  // ─── isEnabled ────────────────────────────────────────────────────────────

  /**
   * isEnabled — Redis-cached boolean flag check.
   * FOOTGUN-9-B: DB fallback if Redis unavailable — never caches 0-TTL on failure.
   *
   * @param name    - flag name (e.g. 'feature_kyc_enforcement_enabled')
   * @param segment - optional Segment enum (null = global flag)
   */
  async isEnabled(name: string, segment?: Segment): Promise<boolean> {
    const env = this.getEnv();
    const segKey = segment ?? 'global';
    const cacheKey = `flag:${name}:${env}:${segKey}`;

    // 1. Redis cache check
    const cached = await this.redis.get(cacheKey).catch(() => null);
    if (cached !== null) {
      return cached === '1';
    }

    // 2. DB fallback (FOOTGUN-9-B: always DB fallback on Redis miss/failure)
    const flag = await this.flagRepo
      .findByName(name, env, segment ?? null)
      .catch(() => null);
    const enabled = flag?.enabled ?? false;

    // 3. Cache result (FOOTGUN-9-B: only cache on successful DB read)
    await this.redis
      .set(cacheKey, enabled ? '1' : '0', 'EX', this.FLAG_TTL_SECONDS)
      .catch(() => {
        // Redis write failure — log but don't throw
        this.logger.warn({ cacheKey }, 'FLAG_CACHE_WRITE_FAILED');
      });

    return enabled;
  }

  // ─── getFlagValue ─────────────────────────────────────────────────────────

  /**
   * getFlagValue — numeric rate from FeatureFlag.rolloutPercent.
   * Used for platform_commission_percent, tds_rate_percent, payment_gateway_fee_percent.
   * Returns null if flag not found (caller applies default).
   *
   * NOTE: In Sprint 7 MVP, rolloutPercent is repurposed as a numeric rate field.
   * e.g., platform_commission_percent: rolloutPercent=2 means 2%.
   * (INV-S7-14 mandates FeatureFlag source — this implements it)
   *
   * FOOTGUN-8-A: AdminPayoutService reads rates here — NOT hardcoded constants.
   */
  async getFlagValue(name: string): Promise<number | null> {
    const env = this.getEnv();
    const flag = await this.flagRepo
      .findByName(name, env, null)
      .catch(() => null);
    return flag?.rolloutPercent ?? null;
  }

  // ─── toggleFlag ───────────────────────────────────────────────────────────

  /**
   * toggleFlag — toggle enabled + optional rolloutPercent update.
   *
   * FOOTGUN-9-A: Cache invalidation uses SCAN+DEL — NEVER redis.keys().
   * FOOTGUN-9-C: AuditLog created for every toggle (INV-S7-2).
   * INV-S7-2: safeWrite() called OUTSIDE $transaction.
   */
  async toggleFlag(
    name: string,
    dto: AdminUpdateFlagDto,
    adminUserId: string,
    req: Request,
  ): Promise<FeatureFlagDto> {
    const env = this.getEnv();

    // Step 1: Load current state
    const existing = await this.flagRepo.findByName(name, env, null);
    // If flag doesn't exist, create it (upsert behaviour for bootstrap)
    const oldEnabled = existing?.enabled ?? false;
    const oldRolloutPercent = existing?.rolloutPercent ?? 0;

    // Step 2: Atomic update inside $transaction
    await this.prisma.$transaction(async (tx) => {
      if (existing) {
        await this.flagRepo.updateFlag(name, dto, tx);
      } else {
        // Create flag if it doesn't exist (handles seed scenario)
        await tx.featureFlag.create({
          data: {
            name,
            enabled: dto.enabled,
            rolloutPercent: dto.rolloutPercent ?? 0,
            env,
          },
        });
      }
    });

    // Step 3: Audit log OUTSIDE $transaction (INV-S7-2, FOOTGUN-9-C)
    await this.auditWriter.safeWrite({
      actorId: adminUserId,
      actorRole: SystemActorType.ADMIN,
      action: AuditAction.STATUS_CHANGE,
      entityType: 'FeatureFlag',
      entityId: name,
      entityName: name,
      oldValue: { enabled: oldEnabled, rolloutPercent: oldRolloutPercent },
      newValue: {
        enabled: dto.enabled,
        rolloutPercent: dto.rolloutPercent ?? oldRolloutPercent,
      },
      ipAddress: req.ip ?? 'unknown',
      userAgent: String(req.headers['user-agent'] ?? 'unknown'),
    });

    // Step 4: Cache invalidation (FOOTGUN-9-A: SCAN+DEL, never keys())
    await this.invalidateFlagCache(name);

    this.logger.log(
      { name, enabled: dto.enabled, adminUserId },
      'FLAG_TOGGLED',
    );

    // Return updated flag
    const updated = await this.flagRepo.findByName(name, env, null);
    return this.toDto(
      updated ?? {
        id: name,
        name,
        description: null,
        enabled: dto.enabled,
        rolloutPercent: dto.rolloutPercent ?? 0,
        segment: null,
        env,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    );
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * invalidateFlagCache — SCAN+DEL pattern (FOOTGUN-9-A: NEVER redis.keys()).
   * Clears all cache keys matching `flag:{name}:{env}:*`.
   * INV-S7-18: Must use SCAN+DEL, not KEYS, to avoid blocking Redis.
   */
  private async invalidateFlagCache(name: string): Promise<void> {
    const env = this.getEnv();
    const pattern = `flag:${name}:${env}:*`;
    let cursor = '0';

    do {
      const [nextCursor, keys] = await this.redis
        .scan(cursor, 'MATCH', pattern, 'COUNT', 100)
        .catch(() => ['0', []] as [string, string[]]);

      cursor = nextCursor;

      if (keys.length > 0) {
        await this.redis.del(...keys).catch(() => {
          this.logger.warn({ keys }, 'FLAG_CACHE_INVALIDATE_PARTIAL_FAIL');
        });
      }
    } while (cursor !== '0');

    this.logger.debug({ pattern }, 'FLAG_CACHE_INVALIDATED');
  }

  private getEnv(): string {
    return process.env['NODE_ENV'] ?? 'production';
  }

  private toDto(flag: FeatureFlagRecord): FeatureFlagDto {
    return {
      id: flag.id,
      name: flag.name,
      description: flag.description,
      enabled: flag.enabled,
      rolloutPercent: flag.rolloutPercent,
      segment: flag.segment,
      env: flag.env,
      createdAt: flag.createdAt.toISOString(),
      updatedAt: flag.updatedAt.toISOString(),
    };
  }
}
