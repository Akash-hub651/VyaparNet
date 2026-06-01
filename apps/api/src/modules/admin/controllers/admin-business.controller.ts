import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { AdminContextGuard } from '../guards/admin-context.guard';
import { AdminIdempotencyGuard } from '../guards/admin-idempotency.guard';
import { AdminRateLimitGuard } from '../guards/admin-rate-limit.guard';
import { AdminKycService } from '../services/admin-kyc.service';
import {
  AdminBusinessListQuerySchema,
  RejectBusinessDtoSchema,
  SuspendBusinessDtoSchema,
} from '@vyaparnet/types';

/**
 * AdminBusinessesController — KYC verification workflow.
 *
 * ALL routes use @UseGuards(JwtAuthGuard, AdminContextGuard) (INV-S7-1).
 * NO RolesGuard. NO SellerContextGuard. EVER.
 *
 * State-change PATCH routes additionally use AdminIdempotencyGuard (INV-S7-7).
 * AdminRateLimitGuard is applied at class level (60 req/min per admin JWT).
 *
 * Authority: §18 Phase 3.
 */
@Controller('admin/businesses')
@UseGuards(JwtAuthGuard, AdminContextGuard, AdminRateLimitGuard)
export class AdminBusinessesController {
  constructor(private readonly kycService: AdminKycService) {}

  /**
   * GET /admin/businesses
   * Returns paginated business list with optional KYC status + segment filter.
   *
   * Response: { data: BusinessSummaryDto[], nextCursor: string | null, hasMore: boolean }
   */
  @Get()
  async getBusinesses(@Query() rawQuery: Record<string, string>) {
    const parsed = AdminBusinessListQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new UnprocessableEntityException({
        code: 'INVALID_QUERY_PARAMS',
        errors: parsed.error.issues,
      });
    }
    return this.kycService.getBusinessList(parsed.data);
  }

  /**
   * GET /admin/businesses/:id
   * Returns business detail + KYC documents + signed URLs (300s TTL, H-P1-5).
   * ALWAYS creates AuditLog if KYC docs exist (INV-S7-33).
   *
   * Response: { business: BusinessDetailDto, kycDocs: KycDocumentDto[], signedUrls: Record<docId, url> }
   */
  @Get(':id')
  async getBusinessDetail(
    @Param('id') id: string,
    @Req() req: Request & { user: { id: string } },
  ) {
    return this.kycService.getBusinessDetail(id, req.user.id, req);
  }

  /**
   * PATCH /admin/businesses/:id/verify
   * Verifies KYC: PENDING → VERIFIED.
   * Requires Idempotency-Key header (UUID, INV-S7-7).
   *
   * Response: { business: BusinessDetailDto }
   */
  @Patch(':id/verify')
  @UseGuards(AdminIdempotencyGuard)
  async verifyBusiness(
    @Param('id') id: string,
    @Req() req: Request & { user: { id: string }; idempotencyKey: string },
  ) {
    const business = await this.kycService.verifyBusiness(
      id,
      req.user.id,
      req.idempotencyKey,
      req,
    );
    return { business };
  }

  /**
   * PATCH /admin/businesses/:id/reject
   * Rejects KYC: PENDING → REJECTED.
   * Requires Idempotency-Key header + reason body (min 10 chars).
   *
   * Body: { reason: string }
   * Response: { business: BusinessDetailDto }
   */
  @Patch(':id/reject')
  @UseGuards(AdminIdempotencyGuard)
  async rejectBusiness(
    @Param('id') id: string,
    @Body() rawBody: Record<string, unknown>,
    @Req() req: Request & { user: { id: string }; idempotencyKey: string },
  ) {
    const parsed = RejectBusinessDtoSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new UnprocessableEntityException({
        code: 'INVALID_REQUEST_BODY',
        errors: parsed.error.issues,
      });
    }
    const business = await this.kycService.rejectBusiness(
      id,
      parsed.data,
      req.user.id,
      req.idempotencyKey,
      req,
    );
    return { business };
  }

  /**
   * PATCH /admin/businesses/:id/suspend
   * Suspends business: VERIFIED → SUSPENDED.
   * Requires Idempotency-Key header + reason body (min 10 chars).
   *
   * Body: { reason: string }
   * Response: { business: BusinessDetailDto }
   */
  @Patch(':id/suspend')
  @UseGuards(AdminIdempotencyGuard)
  async suspendBusiness(
    @Param('id') id: string,
    @Body() rawBody: Record<string, unknown>,
    @Req() req: Request & { user: { id: string }; idempotencyKey: string },
  ) {
    const parsed = SuspendBusinessDtoSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new UnprocessableEntityException({
        code: 'INVALID_REQUEST_BODY',
        errors: parsed.error.issues,
      });
    }
    const business = await this.kycService.suspendBusiness(
      id,
      parsed.data,
      req.user.id,
      req.idempotencyKey,
      req,
    );
    return { business };
  }

  /**
   * PATCH /admin/businesses/:id/reactivate
   * Reactivates suspended business: SUSPENDED → VERIFIED.
   * Requires Idempotency-Key header.
   *
   * Response: { business: BusinessDetailDto }
   */
  @Patch(':id/reactivate')
  @UseGuards(AdminIdempotencyGuard)
  async reactivateBusiness(
    @Param('id') id: string,
    @Req() req: Request & { user: { id: string }; idempotencyKey: string },
  ) {
    const business = await this.kycService.reactivateBusiness(
      id,
      req.user.id,
      req.idempotencyKey,
      req,
    );
    return { business };
  }
}
