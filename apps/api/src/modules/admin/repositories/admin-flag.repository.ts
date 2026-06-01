import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { Segment } from '@vyaparnet/database';

export interface FeatureFlagRecord {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  rolloutPercent: number;
  segment: Segment | null;
  env: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * AdminFlagRepository — Step 9.1.
 *
 * Provides:
 *  - findAll()                     → all FeatureFlag records
 *  - findByName(name, env, seg?)   → single flag lookup (cache-miss path)
 *  - updateFlag(name, updates, tx) → toggle enabled + optional rolloutPercent update
 *
 * FeatureFlag.name is @@unique — used as primary lookup key.
 * @@index([name, env, segment]) supports Redis cache key `flag:{name}:{env}:{segment}` (INV-S7-18).
 *
 * Authority: §24 Phase 9, Step 9.1.
 */
@Injectable()
export class AdminFlagRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * findAll — returns all feature flags (no pagination — flags are O(10s) in number).
   * Ordered by name for stable display.
   */
  async findAll(): Promise<FeatureFlagRecord[]> {
    return this.prisma.featureFlag.findMany({
      orderBy: { name: 'asc' },
    });
  }

  /**
   * findByName — single flag lookup by name + env + optional segment.
   * Called on Redis cache miss (AdminFlagService.isEnabled/getFlagValue).
   *
   * @param name    - flag name (e.g. 'platform_commission_percent')
   * @param env     - environment (e.g. 'production', 'development')
   * @param segment - Segment enum value or null for global flags
   */
  async findByName(
    name: string,
    env: string,
    segment: Segment | null,
  ): Promise<FeatureFlagRecord | null> {
    return this.prisma.featureFlag.findFirst({
      where: {
        name,
        env,
        ...(segment !== null ? { segment } : { segment: null }),
      },
    });
  }

  /**
   * updateFlag — toggle enabled and optionally update rolloutPercent.
   * Called INSIDE the service's $transaction (with AuditLog write outside).
   *
   * @param name    - flag name (@@unique)
   * @param updates - { enabled, rolloutPercent? }
   * @param tx      - transaction client (from caller's $transaction)
   */
  async updateFlag(
    name: string,
    updates: { enabled: boolean; rolloutPercent?: number },
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
  ): Promise<void> {
    await tx.featureFlag.update({
      where: { name },
      data: {
        enabled: updates.enabled,
        ...(updates.rolloutPercent !== undefined
          ? { rolloutPercent: updates.rolloutPercent }
          : {}),
      },
    });
  }
}
