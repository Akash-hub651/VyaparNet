import { Injectable, Inject, Logger } from '@nestjs/common';
import { ImageValidatorService } from './image-validator.service';
import { MediaRepository } from './media.repository';
import {
  STORAGE_SERVICE_TOKEN,
  StorageService,
} from './storage/storage.service.interface';
import { Queue } from 'bull';
import { InjectQueue } from '@nestjs/bull';
import { Media, MediaClass, MediaType } from '@vyaparnet/database';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../../core/config/config.schema';
import { CatalogMetrics } from '../catalog-metrics.service';
import { performance } from 'perf_hooks';

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private readonly cdnBaseUrl: string;

  constructor(
    private readonly imageValidator: ImageValidatorService,
    private readonly mediaRepository: MediaRepository,
    @Inject(STORAGE_SERVICE_TOKEN)
    private readonly storageService: StorageService,
    @InjectQueue('image-processing') private readonly processingQueue: Queue,
    private readonly configService: ConfigService<AppConfig>,
    private readonly metrics: CatalogMetrics,
  ) {
    this.cdnBaseUrl = this.configService.getOrThrow('CDN_BASE_URL');
  }

  async upload(
    file: Express.Multer.File,
    userId: string,
    productId: string,
    mediaClass: MediaClass = MediaClass.PRODUCT_IMAGE,
  ): Promise<Media> {
    const startTime = performance.now();
    try {
      const buffer = file.buffer;
      const mimeType = file.mimetype;

      // 1. Validate MIME + magic bytes
      this.imageValidator.validateMimeType(buffer, mimeType);

      // 2. Validate size
      this.imageValidator.validateSize(buffer);

      // 3. Compute SHA-256
      const checksum = this.imageValidator.computeChecksum(buffer);

      // 4. Validate Dimensions (async via sharp)
      await this.imageValidator.validateDimensions(buffer);

      // 5. Check duplicate
      const existing = await this.mediaRepository.findByChecksum(
        checksum,
        userId,
      );
      if (existing) {
        this.logger.log(`Duplicate media found for checksum ${checksum}`);
        return existing;
      }

      // 6. Generate S3 key (UUID-based)
      // Key format: media/{userId}/{productId}/{crypto.randomUUID()}.{ext}
      const ext = this.getExtensionFromMimeType(mimeType);
      const key = `media/${userId}/${productId}/${randomUUID()}.${ext}`;

      // 7. Upload original to S3
      await this.storageService.upload(buffer, key, mimeType);
      const originalUrl = `${this.cdnBaseUrl}${key}`;

      // 8. Create Media record
      const media = await this.mediaRepository.create({
        type: MediaType.IMAGE,
        url: originalUrl,
        name: file.originalname,
        size: file.size,
        mimeType,
        uploadedBy: userId,
        checksum,
        mediaClass,
      });

      // 9. Enqueue image processing job
      await this.processingQueue.add(
        'process-image',
        {
          mediaId: media.id,
          s3Key: key,
          productId,
          attempt: 0,
        },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        },
      );

      this.metrics.mediaUpload('success', mediaClass);
      return media;
    } catch (error) {
      this.metrics.mediaUpload('failure', mediaClass);
      throw error;
    } finally {
      const duration = performance.now() - startTime;
      this.metrics.recordMediaUploadDuration(duration);
    }
  }

  private getExtensionFromMimeType(mimeType: string): string {
    switch (mimeType) {
      case 'image/jpeg':
        return 'jpg';
      case 'image/png':
        return 'png';
      case 'image/webp':
        return 'webp';
      default:
        return 'bin';
    }
  }
}
