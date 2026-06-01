import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  UnprocessableEntityException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { MetricsService } from '../../observability/metrics.service';
import {
  S3Service,
  ALLOWED_DISPATCH_PROOF_MIME_TYPES,
  MAX_DISPATCH_PROOF_SIZE_BYTES,
} from '../../s3/s3.service';
import { DispatchProofConfirmDto } from '@vyaparnet/types';
import { SellerContext } from './seller-order.service';

// Statuses that allow dispatch proof upload — cannot upload for unshipped orders
const DISPATCH_PROOF_ALLOWED_STATUSES = [
  'SHIPPED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
] as const;

@Injectable()
export class SellerDispatchProofService {
  private readonly logger = new Logger(SellerDispatchProofService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly metrics: MetricsService,
  ) {}

  /**
   * Step 1: Generate pre-signed PUT URL for direct S3 upload.
   * S3 key prefix is always server-controlled (INV-S5-26, INV-S5-11).
   * S3 call is OUTSIDE $transaction (transaction boundary rule §4).
   */
  async generateUploadUrl(
    orderId: string,
    seller: SellerContext,
  ): Promise<{ uploadUrl: string; s3Key: string; expiresAt: string }> {
    // Verify order ownership (sellerId filter — INV-S5-3) — returns 404 for cross-seller
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, sellerId: seller.businessId, isDeleted: false },
      select: { id: true, status: true },
    });

    if (!order) {
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND' });
    }

    // Order MUST be in SHIPPED+ status for dispatch proof upload
    if (!DISPATCH_PROOF_ALLOWED_STATUSES.includes(order.status as any)) {
      throw new UnprocessableEntityException({
        code: 'ORDER_NOT_SHIPPED_YET',
        message: `Order must be in SHIPPED, OUT_FOR_DELIVERY, or DELIVERED status. Current: ${order.status}`,
      });
    }

    try {
      // S3 call OUTSIDE $transaction (transaction boundary rule §4)
      const result = await this.s3.generateDispatchProofUploadUrl(
        seller.businessId,
        orderId,
      );
      this.logger.log(
        { orderId, sellerId: seller.businessId, s3Key: result.s3Key },
        'DISPATCH_PROOF_UPLOAD_URL_GENERATED',
      );
      return result;
    } catch (err: unknown) {
      this.logger.error(
        { orderId, error: (err as Error).message },
        'DISPATCH_PROOF_URL_GENERATION_FAILED',
      );
      this.metrics.dispatchProofUploadTotal.inc({
        outcome: 'url_generation_failed',
      });
      throw new ServiceUnavailableException({ code: 'S3_SERVICE_UNAVAILABLE' });
    }
  }

  /**
   * Step 3: Confirm dispatch proof after client uploaded to S3.
   * MANDATORY sequence (INV-S5-10, INV-S5-11, INV-S5-35):
   * 1. Validate s3Key prefix ownership
   * 2. HEAD S3 — file must exist
   * 3. Validate MIME type
   * 4. Write to DB (upsert OrderTracking via updateMany+create for idempotency)
   * 5. NO EventOutbox (INV-S5-9)
   * 6. NO OrderStatusHistory (INV-S5-9)
   */
  async confirmDispatchProof(
    orderId: string,
    seller: SellerContext,
    dto: DispatchProofConfirmDto,
  ): Promise<{ dispatchProofUrl: string }> {
    // SECURITY CHECK 1: s3Key MUST start with dispatch-proofs/{businessId}/ (INV-S5-11)
    // Reject cross-seller keys — prevents a seller from confirming another seller's upload
    const expectedPrefix = `dispatch-proofs/${seller.businessId}/`;
    if (!dto.s3Key.startsWith(expectedPrefix)) {
      this.metrics.dispatchProofUploadTotal.inc({
        outcome: 'ownership_violation',
      });
      throw new ForbiddenException({
        code: 'S3_KEY_OWNERSHIP_VIOLATION',
        message: 'The provided s3Key does not belong to your business',
      });
    }

    // SECURITY CHECK 2: Verify order ownership — cross-seller returns 404 (INV-S5-3)
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, sellerId: seller.businessId, isDeleted: false },
      select: { id: true, status: true },
    });
    if (!order) {
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND' });
    }

    // STEP 2: S3 HEAD verification BEFORE any DB write (INV-S5-10)
    // S3 call OUTSIDE $transaction (transaction boundary rule §4)
    let headResult: Awaited<ReturnType<S3Service['headObject']>>;
    try {
      headResult = await this.s3.headObject(dto.s3Key);
    } catch (err: unknown) {
      this.logger.error(
        { orderId, s3Key: dto.s3Key, error: (err as Error).message },
        'DISPATCH_PROOF_HEAD_FAILED',
      );
      this.metrics.dispatchProofUploadTotal.inc({ outcome: 's3_unavailable' });
      throw new ServiceUnavailableException({ code: 'S3_SERVICE_UNAVAILABLE' });
    }

    // File must exist in S3 — null returned when file not found (INV-S5-10)
    if (!headResult) {
      this.metrics.dispatchProofUploadTotal.inc({ outcome: 'file_not_found' });
      throw new UnprocessableEntityException({
        code: 'FILE_NOT_FOUND_IN_S3',
        message:
          'The file has not been uploaded to S3 yet. Upload first, then confirm.',
      });
    }

    // STEP 3: MIME validation (INV-S5-35)
    // EXPLICIT list — NOT 'image/*' wildcard (AI Footgun check)
    const contentType = headResult.contentType ?? '';
    const isAllowedMime = (
      ALLOWED_DISPATCH_PROOF_MIME_TYPES as readonly string[]
    ).includes(contentType);
    if (!isAllowedMime) {
      this.metrics.dispatchProofUploadTotal.inc({ outcome: 'invalid_mime' });
      throw new UnprocessableEntityException({
        code: 'INVALID_FILE_TYPE',
        message: `File type '${contentType}' is not allowed. Allowed types: ${ALLOWED_DISPATCH_PROOF_MIME_TYPES.join(', ')}`,
      });
    }

    // STEP 3b: File size enforcement — FIX-4 (FR-4)
    // S3 signed PUT URL cannot enforce content-length-range without s3-presigned-post.
    // Server-side enforcement here: reject files > 5MB BEFORE writing to DB.
    // The file exists in S3 but is never recorded — ops can clean orphan keys via lifecycle policy.
    const contentLength = headResult.contentLength ?? 0;
    if (contentLength > MAX_DISPATCH_PROOF_SIZE_BYTES) {
      this.metrics.dispatchProofUploadTotal.inc({ outcome: 'file_too_large' });
      throw new UnprocessableEntityException({
        code: 'FILE_TOO_LARGE',
        message: `File size ${contentLength} bytes exceeds the 5MB maximum allowed for dispatch proofs`,
        maxSizeBytes: MAX_DISPATCH_PROOF_SIZE_BYTES,
        actualSizeBytes: contentLength,
      });
    }

    // STEP 4: Write dispatch proof URL to DB — idempotent pattern
    // OrderTracking has NO unique constraint on orderId → cannot use prisma upsert
    // Pattern: update the latest SHIPPED tracking row if exists, else create
    // (INV-S5-9: NO EventOutbox, NO OrderStatusHistory)
    const dispatchProofUrl = `${dto.s3Key}`; // store the s3Key as the URL — CDN resolves it

    const existingTracking = await this.prisma.orderTracking.findFirst({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    if (existingTracking) {
      await this.prisma.orderTracking.update({
        where: { id: existingTracking.id },
        data: {
          dispatchProofUrl,
          dispatchProofAt: new Date(), // INV-9: server-computed timestamp
          status: 'DISPATCHED',
        },
      });
    } else {
      await this.prisma.orderTracking.create({
        data: {
          orderId,
          status: 'DISPATCHED',
          dispatchProofUrl,
          dispatchProofAt: new Date(),
        },
      });
    }

    // STEP 5: Increment success metric
    this.metrics.dispatchProofUploadTotal.inc({ outcome: 'success' });
    this.logger.log(
      { orderId, sellerId: seller.businessId, s3Key: dto.s3Key },
      'DISPATCH_PROOF_CONFIRMED',
    );

    return { dispatchProofUrl };
    // INV-S5-9: NO EventOutbox created here
    // INV-S5-9: NO OrderStatusHistory created here
  }
}
