import { Module } from '@nestjs/common';
import { ConfigModule } from './core/config/config.module';
import { PrismaModule } from './core/prisma/prisma.module';
import { RedisModule } from './core/redis/redis.module';
import { BullMQModule } from './core/bullmq/bullmq.module';
import { LoggerModule } from './core/logger/logger.module';
import { HealthModule } from './core/health/health.module';

/**
 * AppModule — Root NestJS module for VyaparNet API.
 *
 * Module import order matters:
 * 1. ConfigModule (first — validates env vars at startup)
 * 2. LoggerModule (second — enables logging for all subsequent modules)
 * 3. PrismaModule (database — needed by domain modules)
 * 4. RedisModule (cache/queue backend — needed by BullMQ + domain modules)
 * 5. BullMQModule (queues — needed by domain workers)
 * 6. HealthModule (always last infrastructure module — needs all above)
 *
 * Domain modules (modules/) are added from Sprint 1 onward.
 * DO NOT add domain modules here in Sprint 0.
 *
 * Authority: VyaparNet_Implementation_Architecture_Official_Freeze_v1.md Section 2
 */
@Module({
  imports: [
    ConfigModule, // Must be first
    LoggerModule, // Must be second
    PrismaModule, // Global — provides PrismaService to all modules
    RedisModule, // Global — provides RedisService to all modules
    BullMQModule, // Registers all queues
    HealthModule, // Health check endpoints
    // ─── Domain modules added Sprint 1+ ───
    // IdentityModule,    // Sprint 1
    // CatalogModule,     // Sprint 2
    // InventoryModule,   // Sprint 3
    // OrderModule,       // Sprint 4
    // PaymentModule,     // Sprint 4
    // NotificationModule,// Sprint 6
    // AuditModule,       // Sprint 7
    // AdminModule,       // Sprint 7
    // ProcurementModule, // Sprint 8
    // TrustSafetyModule, // Sprint 8
  ],
})
export class AppModule {}
