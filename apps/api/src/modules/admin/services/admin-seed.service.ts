import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AuditSafeWriterService } from '../../security/audit/audit-safe-writer.service';
import {
  AuditAction,
  SystemActorType,
} from '@vyaparnet/types';
import { UserRole, Segment } from '@vyaparnet/database';

/**
 * Default FeatureFlag seeds (INV-S7-14, Step 9.4b).
 *
 * Format: { name, enabled, rolloutPercent, description }
 *  - platform_commission_percent: 2%
 *  - tds_rate_percent:           1%
 *  - payment_gateway_fee_percent: 2%
 *  - feature_kyc_enforcement_enabled: false (dev), true (prod)
 */
const DEFAULT_FLAGS = [
  {
    name: 'platform_commission_percent',
    description: 'Platform commission rate (%). Stored in rolloutPercent field.',
    enabled: true,
    rolloutPercent: 2,
  },
  {
    name: 'tds_rate_percent',
    description: 'TDS rate (%). Stored in rolloutPercent field.',
    enabled: true,
    rolloutPercent: 1,
  },
  {
    name: 'payment_gateway_fee_percent',
    description: 'Payment gateway fee rate (%). Stored in rolloutPercent field.',
    enabled: true,
    rolloutPercent: 2,
  },
  {
    name: 'feature_kyc_enforcement_enabled',
    description: 'Enforce KYC before seller can list products.',
    enabled: false, // false in dev, manually set to true in prod
    rolloutPercent: 0,
  },
];

/**
 * AdminSeedService — Step 9.4.
 *
 * Implements OnModuleInit to run bootstrap on startup:
 *  1. Admin user bootstrap (H-P1-6): creates initial ADMIN user from env vars
 *     ONLY if no User with role=ADMIN exists in DB.
 *     Required env vars: ADMIN_BOOTSTRAP_PHONE, ADMIN_BOOTSTRAP_PASSWORD
 *     Guards: zero-count check, env var check.
 *
 *  2. FeatureFlag seeds (Step 9.4b): creates default FeatureFlags via upsert
 *     (safe to re-run — idempotent).
 *
 * H-P1-6 Bootstrap invariants:
 *  - Only runs if UserRole.ADMIN count = 0 in DB
 *  - ADMIN_BOOTSTRAP_PHONE and ADMIN_BOOTSTRAP_PASSWORD MUST be set
 *  - Creates AuditLog entry for the bootstrap action
 *  - Never creates a second admin automatically
 *  - Password is bcrypt-hashed before storage
 *
 * Authority: §24 Phase 9, Step 9.4; §24 Step 9.4b.
 */
@Injectable()
export class AdminSeedService implements OnModuleInit {
  private readonly logger = new Logger(AdminSeedService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditWriter: AuditSafeWriterService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedAdminUser();
    await this.seedDefaultFeatureFlags();
  }

  // ─── Admin Bootstrap (H-P1-6) ────────────────────────────────────────────

  /**
   * seedAdminUser — creates initial ADMIN user from env vars.
   * Only runs if UserRole.ADMIN count = 0 in DB.
   * Idempotent — safe to call on every restart.
   */
  private async seedAdminUser(): Promise<void> {
    const phone = process.env['ADMIN_BOOTSTRAP_PHONE'];
    const password = process.env['ADMIN_BOOTSTRAP_PASSWORD'];

    // Guard: env vars must be set
    if (!phone || !password) {
      this.logger.debug(
        'ADMIN_BOOTSTRAP_PHONE or ADMIN_BOOTSTRAP_PASSWORD not set — skipping admin bootstrap',
      );
      return;
    }

    // Guard: only runs if no ADMIN exists
    const adminCount = await this.prisma.user.count({
      where: { role: UserRole.ADMIN },
    });

    if (adminCount > 0) {
      this.logger.debug(
        { adminCount },
        'Admin user already exists — skipping bootstrap',
      );
      return;
    }

    this.logger.log(
      { phone },
      'ADMIN_BOOTSTRAP: Creating initial admin user',
    );

    // Hash password
    const hashedPassword = await argon2.hash(password, {
      type: argon2.argon2id,
    });

    // Create admin user — requires Segment (use TEXTILE as platform default)
    const adminUser = await this.prisma.user.create({
      data: {
        phone,
        email: process.env['ADMIN_BOOTSTRAP_EMAIL'] ?? 'admin@vyaparnet.in',
        password: hashedPassword,
        name: 'Platform Admin',
        role: UserRole.ADMIN,
        segment: Segment.TEXTILE, // platform default segment
        isPhoneVerified: true,
      },
    });

    // Audit log (H-P1-6: creates audit entry for bootstrap action)
    await this.auditWriter.safeWrite({
      actorId: adminUser.id,
      actorRole: SystemActorType.SYSTEM,
      action: AuditAction.CREATE,
      entityType: 'User',
      entityId: adminUser.id,
      entityName: 'ADMIN_BOOTSTRAP',
      newValue: { phone, role: UserRole.ADMIN },
    });

    this.logger.log(
      { adminUserId: adminUser.id, phone },
      'ADMIN_BOOTSTRAP: Admin user created successfully',
    );
  }

  // ─── FeatureFlag Seeds (Step 9.4b) ────────────────────────────────────────

  /**
   * seedDefaultFeatureFlags — upserts default FeatureFlag records.
   * Idempotent — uses upsert so safe to re-run on every restart.
   * Only creates/updates if the flag doesn't exist yet.
   */
  private async seedDefaultFeatureFlags(): Promise<void> {
    const env = process.env['NODE_ENV'] ?? 'production';

    // In production, KYC enforcement is enabled
    const isProduction = env === 'production';

    for (const flag of DEFAULT_FLAGS) {
      const flagEnabled =
        flag.name === 'feature_kyc_enforcement_enabled'
          ? isProduction  // true in prod, false in dev
          : flag.enabled;

      await this.prisma.featureFlag.upsert({
        where: { name: flag.name },
        update: {}, // Never overwrite existing values — admin controls these
        create: {
          name: flag.name,
          description: flag.description,
          enabled: flagEnabled,
          rolloutPercent: flag.rolloutPercent,
          env,
        },
      });

      this.logger.debug(
        { name: flag.name, env, enabled: flagEnabled },
        'FEATURE_FLAG_SEEDED',
      );
    }

    this.logger.log(
      { flagCount: DEFAULT_FLAGS.length, env },
      'DEFAULT_FEATURE_FLAGS_SEEDED',
    );
  }
}
