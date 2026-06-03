import { Injectable, Logger } from '@nestjs/common';
import { IStorageProvider } from '../interfaces/storage-provider.interface';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class S3StorageProvider implements IStorageProvider {
  private readonly logger = new Logger(S3StorageProvider.name);
  private readonly s3Client: S3Client;
  private readonly bucketName: string;

  constructor(private readonly configService: ConfigService) {
    const region = this.configService.get('AWS_REGION') || 'ap-south-1';
    this.bucketName =
      this.configService.get('AWS_S3_EVIDENCE_BUCKET') ||
      'vyaparnet-evidence-bucket';

    this.s3Client = new S3Client({
      region,
      // If credentials aren't provided in config, it falls back to environment variables which is standard AWS behavior
      credentials: {
        accessKeyId:
          this.configService.get('AWS_ACCESS_KEY_ID') ||
          process.env.AWS_ACCESS_KEY_ID ||
          '',
        secretAccessKey:
          this.configService.get('AWS_SECRET_ACCESS_KEY') ||
          process.env.AWS_SECRET_ACCESS_KEY ||
          '',
      },
    });
  }

  async uploadFile(
    key: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    });

    await this.s3Client.send(command);
    this.logger.log(`Successfully uploaded ${key} to S3`);
    return key;
  }

  async getSignedUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    return getSignedUrl(this.s3Client, command, {
      expiresIn: expiresInSeconds,
    });
  }
}
