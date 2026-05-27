import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { MediaRepository } from './media.repository';
import { ImageValidatorService } from './image-validator.service';
import { MediaClassificationService } from './media-classification.service';
import { S3StorageService } from './storage/s3-storage.service';
import { STORAGE_SERVICE_TOKEN } from './storage/storage.service.interface';
import { CatalogMetricsModule } from '../catalog-metrics.module';
import { IdentityModule } from '../../identity/identity.module';

@Module({
  imports: [
    CatalogMetricsModule,
    IdentityModule,
    BullModule.registerQueue({
      name: 'image-processing',
    }),
  ],
  controllers: [MediaController],
  providers: [
    MediaService,
    MediaRepository,
    ImageValidatorService,
    MediaClassificationService,
    {
      provide: STORAGE_SERVICE_TOKEN,
      useClass: S3StorageService,
    },
  ],
  exports: [MediaService, MediaClassificationService, MediaRepository],
})
export class MediaModule {}

