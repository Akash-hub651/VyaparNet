import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { RedisModule } from '../../core/redis/redis.module';
import { NotificationModule } from '../notification/notification.module';

// Domain Services
import { ReturnsService } from './returns/returns.service';
import { DisputesService } from './disputes/disputes.service';

// Evidence / Storage
import { EvidenceService } from './evidence/evidence.service';
import { STORAGE_PROVIDER } from './evidence/interfaces/storage-provider.interface';
import { S3StorageProvider } from './evidence/providers/s3-storage.provider';
import { MockStorageProvider } from './evidence/providers/mock-storage.provider';

// Workers
import { ReturnSlaWorker } from './workers/return-sla.worker';
import { DisputeSlaWorker } from './workers/dispute-sla.worker';

// Controllers
import { ReturnsController } from './returns/returns.controller';
import { DisputesController } from './disputes/disputes.controller';
import { BuyerLedgerRepository } from './refunds/buyer-ledger.repository';
import { RefundService } from './refunds/refund.service';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    RedisModule,
    NotificationModule,
    // Sprint 8: Queues are registered per-domain module
    BullModule.registerQueue({ name: 'return-sla' }),
    BullModule.registerQueue({ name: 'dispute-sla' }),
    BullModule.registerQueue({ name: 'scorecard' }), // Trigger scorecard updates (Sprint 8)
  ],
  controllers: [ReturnsController, DisputesController],
  providers: [
    ReturnsService,
    DisputesService,
    EvidenceService,
    ReturnSlaWorker,
    DisputeSlaWorker,
    BuyerLedgerRepository,
    RefundService,
    {
      provide: STORAGE_PROVIDER,
      useFactory: (configService: ConfigService) => {
        const useMock = configService.get('USE_MOCK_STORAGE') === 'true';
        return useMock
          ? new MockStorageProvider()
          : new S3StorageProvider(configService);
      },
      inject: [ConfigService],
    },
  ],
  exports: [
    ReturnsService,
    DisputesService,
    EvidenceService,
    BuyerLedgerRepository,
    RefundService,
  ],
})
export class TrustSafetyModule {}
