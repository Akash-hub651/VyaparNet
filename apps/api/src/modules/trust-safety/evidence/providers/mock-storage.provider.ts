import { Injectable, Logger } from '@nestjs/common';
import { IStorageProvider } from '../interfaces/storage-provider.interface';

@Injectable()
export class MockStorageProvider implements IStorageProvider {
  private readonly logger = new Logger(MockStorageProvider.name);

  async uploadFile(
    key: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<string> {
    this.logger.debug(
      `[MOCK] Uploading file of size ${buffer.length} bytes to key ${key} with MIME ${mimeType}`,
    );
    return key;
  }

  async getSignedUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    this.logger.debug(
      `[MOCK] Generating signed URL for key ${key}, expires in ${expiresInSeconds}s`,
    );
    // Return a fake mock URL for local development/testing
    return `https://mock-storage.local/${key}?sig=mock&expires=${Date.now() + expiresInSeconds * 1000}`;
  }
}
