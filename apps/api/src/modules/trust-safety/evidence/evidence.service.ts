import { Injectable, Inject, BadRequestException, Logger } from '@nestjs/common';
import { STORAGE_PROVIDER, IStorageProvider } from './interfaces/storage-provider.interface';
import { randomUUID } from 'crypto';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB (INV-S8-30)

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

@Injectable()
export class EvidenceService {
  private readonly logger = new Logger(EvidenceService.name);

  constructor(
    @Inject(STORAGE_PROVIDER) private readonly storageProvider: IStorageProvider,
  ) {}

  /**
   * Uploads evidence, enforcing size and magic bytes (INV-S8-13, INV-S8-30)
   * Returns the S3 key.
   */
  async uploadEvidence(
    entityType: 'return' | 'dispute' | 'ticket',
    entityId: string,
    fileBuffer: Buffer,
    originalFilename: string,
  ): Promise<string> {
    this.logger.debug(`Uploading evidence for ${entityType} ${entityId} (filename: ${originalFilename})`);
    // 1. Enforce size limit BEFORE processing (INV-S8-30)
    if (fileBuffer.length > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException('File size exceeds 5MB limit');
    }

    // 2. Enforce magic bytes (INV-S8-13)
    let fileType: any;
    try {
      // Dynamic import to handle ESM package 'file-type' in CJS environments
      const { fileTypeFromBuffer } = await eval('import("file-type")');
      fileType = await fileTypeFromBuffer(fileBuffer);
    } catch (err) {
      this.logger.error('Failed to load file-type module or parse buffer', err);
      throw new BadRequestException('Could not determine file type securely');
    }

    if (!fileType) {
      throw new BadRequestException('Unknown file signature');
    }

    if (!ALLOWED_MIME_TYPES.has(fileType.mime)) {
      throw new BadRequestException(`File type ${fileType.mime} is not allowed for evidence`);
    }

    // 3. Generate deterministic S3 keys without storing signed URLs in DB (INV-S8-4)
    // Format: evidence/{return|dispute}/{entityId}/{uuid}.{ext}
    const ext = fileType.ext;
    const fileId = randomUUID();
    const key = `evidence/${entityType}/${entityId}/${fileId}.${ext}`;

    // 4. Upload via Storage Provider
    await this.storageProvider.uploadFile(key, fileBuffer, fileType.mime);

    // Return ONLY the key. The DB will store the key.
    return key;
  }

  /**
   * Generates a signed URL for reading the evidence file.
   * Signed URLs are generated on-the-fly and never stored (INV-S8-4).
   */
  async getEvidenceUrl(key: string): Promise<string> {
    // Generate a 1-hour signed URL
    return this.storageProvider.getSignedUrl(key, 3600);
  }
}
