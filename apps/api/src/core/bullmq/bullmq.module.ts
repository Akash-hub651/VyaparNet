import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/config.schema';

/**
 * BullMQ Module — registers all queues for the VyaparNet API.
 *
 * Queue priority order (per runtime architecture):
 * 1. payments (Critical)
 * 2. inventory (Critical)
 * 3. orders (High)
 * 5. notifications (Medium)
 * 7. search-reindex (Low)
 * 8. analytics (Low)
 *
 * Workers are NOT registered here in Sprint 0.
 * Workers are added in their respective domain modules (Sprint 3+).
 *
 * Authority: VyaparNet_Implementation_Architecture_Official_Freeze_v1.md Section 7
 * Authority: VyaparNet_Deployment_Runtime_Architecture_v1.md Section 10
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        connection: {
          host: config.get('REDIS_HOST'),
          port: config.get('REDIS_PORT'),
          password: config.get('REDIS_PASSWORD') || undefined,
        },
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          removeOnComplete: { count: 1000, age: 24 * 3600 },
          removeOnFail: { count: 5000, age: 7 * 24 * 3600 },
        },
      }),
      inject: [ConfigService],
    }),

    // Queue registrations — no workers yet (Sprint 0)
    // Workers are added in domain modules starting Sprint 3
    BullModule.registerQueue(
      { name: 'payments' }, // Critical priority — Sprint 4
      { name: 'inventory' }, // Critical priority — Sprint 3
      { name: 'orders' }, // High priority — Sprint 4
      { name: 'notifications' }, // Medium priority — Sprint 6
      { name: 'search-reindex' }, // Low priority — Sprint 2
      { name: 'analytics' }, // Low priority — Sprint 4
      { name: 'dead-letter' }, // DLQ — Sprint 3
    ),
  ],
  exports: [BullModule],
})
export class BullMQModule {}
