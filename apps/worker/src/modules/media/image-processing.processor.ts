import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../core/config/config.schema';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';

interface ProcessImageJobData {
  mediaId: string;
  s3Key: string;
  productId: string;
  attempt: number;
}

@Processor('image-processing', {
  concurrency: 5,
})
export class ImageProcessingProcessor extends WorkerHost {
  private readonly logger = new Logger(ImageProcessingProcessor.name);
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly cdnBaseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<AppConfig>,
  ) {
    super();
    this.bucketName = this.configService.getOrThrow('AWS_S3_BUCKET');
    this.cdnBaseUrl = this.configService.getOrThrow('CDN_BASE_URL');
    this.s3Client = new S3Client({
      region: this.configService.getOrThrow('AWS_REGION'),
      credentials: {
        accessKeyId: this.configService.getOrThrow('AWS_ACCESS_KEY_ID'),
        secretAccessKey: this.configService.getOrThrow('AWS_SECRET_ACCESS_KEY'),
      },
    });
  }

  async process(job: Job<ProcessImageJobData, void, string>): Promise<void> {
    const { mediaId, s3Key, attempt } = job.data;
    this.logger.log(`Processing media ${mediaId} (Attempt ${attempt})`);

    try {
      // 1. Download from S3
      const getCommand = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
      });
      const s3Item = await this.s3Client.send(getCommand);
      
      if (!s3Item.Body) {
        throw new Error('S3 object body is empty');
      }
      
      const buffer = Buffer.from(await s3Item.Body.transformToByteArray());

      // Use lower quality settings on attempt 2+
      const quality = attempt > 0 ? 60 : 80;

      // 2. Generate variants via sharp
      // thumb (200x200 crop), medium (400x400 fit), large (800x800 fit) — all WebP
      const baseKey = s3Key.substring(0, s3Key.lastIndexOf('.'));
      
      const variants = [
        { name: 'thumb', buffer: await sharp(buffer).resize(200, 200, { fit: 'cover' }).webp({ quality }).toBuffer() },
        { name: 'medium', buffer: await sharp(buffer).resize(400, 400, { fit: 'inside' }).webp({ quality }).toBuffer() },
        { name: 'large', buffer: await sharp(buffer).resize(800, 800, { fit: 'inside' }).webp({ quality }).toBuffer() },
      ];

      // 3. Upload variants
      const mediumKey = `${baseKey}-medium.webp`;

      for (const variant of variants) {
        const variantKey = `${baseKey}-${variant.name}.webp`;
        await this.s3Client.send(new PutObjectCommand({
          Bucket: this.bucketName,
          Key: variantKey,
          Body: variant.buffer,
          ContentType: 'image/webp',
        }));
      }

      // 4. Update Media
      await this.prisma.media.update({
        where: { id: mediaId },
        data: {
          isProcessed: true,
          thumbnailUrl: `${this.cdnBaseUrl}${mediumKey}`,
        },
      });

      // 5. CacheInvalidationEvent for product cache (Future Phase placeholder)
      this.logger.log(`Successfully processed media ${mediaId}`);
      this.logger.log('[Metrics] media_processing_total{status="success"}');
    } catch (error: any) {
      this.logger.error(`Error processing media ${mediaId}: ${error.message}`, error.stack);
      this.logger.log('[Metrics] media_processing_total{status="failure"}');
      
      const maxAttempts = job.opts.attempts || 1;
      if (job.attemptsMade < maxAttempts) {
        job.updateData({ ...job.data, attempt: job.data.attempt + 1 });
      } else {
        // Dead letter event creation
        await this.prisma.deadLetterEvent.create({
          data: {
            originalId: mediaId,
            eventType: 'ImageProcessing_Failed',
            payload: job.data as any,
            error: error.message || String(error),
          }
        });
      }
      throw error;
    }
  }
}
