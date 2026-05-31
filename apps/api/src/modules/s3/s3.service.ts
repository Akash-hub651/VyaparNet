import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { AppConfig } from '../../core/config/config.schema';

// Allowed MIME types for dispatch proof (INV-S5-35) — explicit list, NOT 'image/*' wildcard
export const ALLOWED_DISPATCH_PROOF_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

export type AllowedMimeType = typeof ALLOWED_DISPATCH_PROOF_MIME_TYPES[number];

/**
 * FIX-4 (FR-4): Maximum allowed dispatch proof file size.
 *
 * The signed PUT URL cannot enforce content-length-range natively without
 * @aws-sdk/s3-presigned-post (multipart form upload). Instead we enforce:
 *  1. URL metadata includes maxSizeBytes so client displays error before upload.
 *  2. confirmDispatchProof() reads ContentLength from HeadObject and rejects
 *     files exceeding MAX_DISPATCH_PROOF_SIZE_BYTES BEFORE writing to DB.
 *
 * This two-layer approach gives equivalent protection without additional packages.
 * Overage penalty: S3 stores the file, but confirm step rejects it and it is never
 * recorded in DB. A future S3 lifecycle policy can clean orphan keys.
 */
export const MAX_DISPATCH_PROOF_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export interface DispatchProofUploadUrlResult {
  uploadUrl: string;
  s3Key: string;
  expiresAt: string;         // ISO8601
  maxSizeBytes: number;      // FIX-4: client hint — reject before uploading if > 5MB
  allowedTypes: readonly string[]; // client hint — show accepted file types in UI
}

export interface S3HeadResult {
  contentType: string | undefined;
  contentLength: number | undefined;
}

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
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

  /**
   * Generate a pre-signed PUT URL for dispatch proof upload (INV-S5-26).
   *
   * Security guarantees:
   *  - s3Key prefix is ALWAYS server-controlled: dispatch-proofs/{businessId}/
   *    Client NEVER chooses the key prefix — prevents cross-seller abuse (INV-S5-11).
   *  - Response includes maxSizeBytes + allowedTypes for client-side pre-validation (FIX-4).
   *  - Server-side size enforcement happens at confirmDispatchProof() via HeadObject (FIX-4).
   *
   * Note: PutObjectCommand signed URLs cannot enforce content-length-range without
   * @aws-sdk/s3-presigned-post. We use server-side confirm-step validation instead.
   */
  async generateDispatchProofUploadUrl(
    businessId: string,
    orderId: string,
  ): Promise<DispatchProofUploadUrlResult> {
    // S3 key is server-controlled — seller cannot influence prefix (INV-S5-26, INV-S5-11)
    const timestamp = Date.now();
    const s3Key = `dispatch-proofs/${businessId}/${orderId}/${timestamp}_proof`;

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: s3Key,
    });

    // URL expires in 5 minutes (300 seconds) — per spec
    const uploadUrl = await getSignedUrl(this.s3Client, command, { expiresIn: 300 });
    const expiresAt = new Date(Date.now() + 300_000).toISOString();

    return {
      uploadUrl,
      s3Key,
      expiresAt,
      maxSizeBytes: MAX_DISPATCH_PROOF_SIZE_BYTES,  // FIX-4: client hint
      allowedTypes: ALLOWED_DISPATCH_PROOF_MIME_TYPES, // FIX-4: client hint
    };
  }

  /**
   * HEAD request to verify file exists in S3 and get Content-Type + Content-Length (INV-S5-10).
   *
   * MUST be called BEFORE any DB write on dispatch proof confirm.
   * Returns null if file does not exist.
   *
   * contentLength is used by SellerDispatchProofService to enforce 5MB max (FIX-4).
   */
  async headObject(s3Key: string): Promise<S3HeadResult | null> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
      });
      const result = await this.s3Client.send(command);
      return {
        contentType: result.ContentType,
        contentLength: result.ContentLength,
      };
    } catch (err: unknown) {
      // NoSuchKey or NotFound → file doesn't exist
      if (
        err instanceof Error &&
        (err.name === 'NoSuchKey' || err.name === 'NotFound' || (err as any).$metadata?.httpStatusCode === 404)
      ) {
        return null;
      }
      // S3 connectivity failure — re-throw to caller
      this.logger.error({ s3Key, error: (err as Error).message }, 'S3_HEAD_OBJECT_FAILED');
      throw err;
    }
  }
}
