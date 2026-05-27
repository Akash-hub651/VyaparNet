import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ConfigModule } from './core/config/config.module';
import { PrismaModule } from './core/prisma/prisma.module';
import { RedisModule } from './core/redis/redis.module';
import { BullMQModule } from './core/bullmq/bullmq.module';
import { LoggerModule } from './core/logger/logger.module';
import { HealthModule } from './core/health/health.module';
import { IdentityModule } from './modules/identity/identity.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { JwtAuthGuard } from './shared/guards/jwt-auth.guard';
import { RolesGuard } from './shared/guards/roles.guard';
import { PermissionsGuard } from './shared/guards/permissions.guard';

/**
 * AppModule — Root NestJS module.
 *
 * Guard application order (CRITICAL):
 * 1. ThrottlerGuard (rate limiting — runs first, before auth)
 * 2. JwtAuthGuard (authentication — global)
 * 3. RolesGuard (role authorization — per-endpoint)
 * 4. PermissionsGuard (permission authorization — per-endpoint)
 *
 * Authority: VyaparNet_Implementation_Architecture_Official_Freeze_v1.md Section 2
 */
@Module({
  imports: [
    ConfigModule, // Must be first — validates env vars
    LoggerModule, // Must be second — enables logging
    ThrottlerModule.forRoot([
      {
        name: 'global',
        ttl: 60000, // 1 minute window
        limit: 100, // 100 requests per minute per IP
      },
    ]),
    PrismaModule, // Global DB client
    RedisModule, // Global cache/session client
    BullMQModule, // Queue registration
    HealthModule, // Health check endpoints

    // ─── Sprint 1 ──────────────────────────────────────────
    IdentityModule, // Authentication + User management

    // ─── Sprint 2+ ─────────────────────────────────────────
    CatalogModule,       // Sprint 2
    // InventoryModule,     // Sprint 3
    // OrderModule,         // Sprint 4
    // PaymentModule,       // Sprint 4
    // NotificationModule,  // Sprint 6
    // AuditModule,         // Sprint 7
    // AdminModule,         // Sprint 7
    // ProcurementModule,   // Sprint 8
  ],
  providers: [
    // Global guards — applied in order
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
