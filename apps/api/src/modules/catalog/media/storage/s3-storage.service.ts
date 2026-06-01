import { Injectable, Logger } from '@nestjs/common';
import { StorageService } from './storage.service.interface';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../../../core/config/config.schema';

@Injectable()
export class S3StorageService implements StorageService {
  private readonly logger = new Logger(S3StorageService.name);
  private readonly s3Client: S3Client;
  private readonly bucketName: string;

  constructor(private readonly configService: ConfigService<AppConfig>) {
    this.bucketName = this.configService.getOrThrow('AWS_S3_BUCKET');
    this.s3Client = new S3Client({
      region: this.configService.getOrThrow('AWS_REGION'),
      credentials: {
        accessKeyId: this.configService.getOrThrow('AWS_ACCESS_KEY_ID'),
        secretAccessKey: this.configService.getOrThrow('AWS_SECRET_ACCESS_KEY'),
      },
    });
  }

  async upload(file: Buffer, key: string, mimeType: string): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: file,
      ContentType: mimeType,
    });

    try {
      await this.s3Client.send(command);
      return key;
    } catch (error: any) {
      this.logger.error(`Failed to upload object to S3: ${key}`, error.stack);
      throw error;
    }
  }

  async getSignedUrl(key: string, expiresInSeconds: number): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    try {
      return await getSignedUrl(this.s3Client, command, {
        expiresIn: expiresInSeconds,
      });
    } catch (error: any) {
      this.logger.error(
        `Failed to generate signed URL for key: ${key}`,
        error.stack,
      );
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    try {
      await this.s3Client.send(command);
    } catch (error: any) {
      this.logger.error(`Failed to delete object from S3: ${key}`, error.stack);
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    const command = new HeadObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    try {
      await this.s3Client.send(command);
      return true;
    } catch (error: any) {
      if (error.name === 'NotFound') {
        return false;
      }
      this.logger.error(
        `Error checking existence of object in S3: ${key}`,
        error.stack,
      );
      throw error;
    }
  }
}
