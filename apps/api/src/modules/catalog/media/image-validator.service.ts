import { Injectable, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import sharp from 'sharp';

@Injectable()
export class ImageValidatorService {
  private readonly MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
  private readonly MIN_DIMENSIONS = { width: 100, height: 100 };

  private readonly ALLOWED_MIME_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
  ]);

  validateSize(buffer: Buffer): void {
    if (buffer.length > this.MAX_SIZE_BYTES) {
      throw new BadRequestException('FILE_TOO_LARGE');
    }
  }

  validateMimeType(buffer: Buffer, declaredMimeType: string): void {
    if (!this.ALLOWED_MIME_TYPES.has(declaredMimeType)) {
      throw new BadRequestException('INVALID_FILE_TYPE');
    }

    if (!this.checkMagicBytes(buffer, declaredMimeType)) {
      throw new BadRequestException(
        'INVALID_FILE_TYPE: MIME spoofing detected',
      );
    }
  }

  computeChecksum(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  async validateDimensions(buffer: Buffer): Promise<void> {
    try {
      const metadata = await sharp(buffer).metadata();
      if (
        !metadata.width ||
        !metadata.height ||
        metadata.width < this.MIN_DIMENSIONS.width ||
        metadata.height < this.MIN_DIMENSIONS.height
      ) {
        throw new BadRequestException('IMAGE_DIMENSIONS_TOO_SMALL');
      }
    } catch (error: any) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('INVALID_IMAGE_FILE');
    }
  }

  private checkMagicBytes(buffer: Buffer, mimeType: string): boolean {
    if (buffer.length < 12) return false;

    // JPEG: FF D8 FF
    if (mimeType === 'image/jpeg') {
      return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    }

    // PNG: 89 50 4E 47
    if (mimeType === 'image/png') {
      return (
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47
      );
    }

    // WebP: 52 49 46 46 (RIFF) ... 57 45 42 50 (WEBP)
    if (mimeType === 'image/webp') {
      const isRiff =
        buffer[0] === 0x52 &&
        buffer[1] === 0x49 &&
        buffer[2] === 0x46 &&
        buffer[3] === 0x46;
      const isWebp =
        buffer[8] === 0x57 &&
        buffer[9] === 0x45 &&
        buffer[10] === 0x42 &&
        buffer[11] === 0x50;
      return isRiff && isWebp;
    }

    return false;
  }
}
