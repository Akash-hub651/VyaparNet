import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { AdminContextGuard } from '../guards/admin-context.guard';
import { AdminRateLimitGuard } from '../guards/admin-rate-limit.guard';
import { AdminIdempotencyGuard } from '../guards/admin-idempotency.guard';
import { AdminPayoutService } from '../services/admin-payout.service';
import { ZodValidationPipe } from '../../../shared/pipes/zod-validation.pipe';
import {
  AdminPayoutListQuerySchema,
  type AdminPayoutListQuery,
  AdminPayoutReverseDto,
  AdminPayoutReverseSchema,
} from '@vyaparnet/types';
import { PayoutListItem } from '../repositories/admin-payout.repository';

/**
 * AdminPayoutsController — Seller Payout Management (Sprint 7 Phase 8).
 *
 * Routes:
 *  GET   /admin/payouts          → paginated payout list (filter by status/sellerId)
 *  GET   /admin/payouts/:id      → payout detail
 *  PATCH /admin/payouts/:id/initiate → mark payout INITIATED (PENDING → INITIATED only)
 *
 * FOOTGUN-8-B: PATCH initiate route — status update is atomic in $transaction (in service).
 * Guard stack: JwtAuthGuard → AdminContextGuard → AdminRateLimitGuard
 * PATCH: + AdminIdempotencyGuard (INV-S7-7).
 *
 * Authority: §23 Phase 8, Step 8.3.
 */
@Controller('admin/payouts')
@UseGuards(JwtAuthGuard, AdminContextGuard, AdminRateLimitGuard)
export class AdminPayoutsController {
  constructor(private readonly payoutService: AdminPayoutService) {}

  /**
   * GET /admin/payouts
   * Returns paginated list of seller payouts.
   * Optional filters: status, sellerId (User.id), cursor, limit.
   */
  @Get()
  async getPayoutList(
    @Query(new ZodValidationPipe(AdminPayoutListQuerySchema))
    query: AdminPayoutListQuery,
  ) {
    return this.payoutService.getPayoutList(query);
  }

  /**
   * GET /admin/payouts/:id
   * Returns single payout detail. 404 if not found.
   */
  @Get(':id')
  async getPayoutDetail(@Param('id') id: string) {
    return this.payoutService.getPayoutDetail(id);
  }

  /**
   * PATCH /admin/payouts/:id/initiate
   * Transitions payout PENDING → INITIATED.
   * 422 if payout is not PENDING.
   * AdminIdempotencyGuard: Idempotency-Key header required (INV-S7-7).
   */
  @Patch(':id/initiate')
  @UseGuards(AdminIdempotencyGuard)
  async initiatePayout(
    @Param('id') id: string,
    @Req() req: Request & { user: { id: string } },
  ) {
    return this.payoutService.initiatePayout(id, req.user.id, req);
  }

  @Post(':id/hold')
  @UseGuards(AdminIdempotencyGuard)
  async holdPayout(
    @Req() req: any,
    @Param('id') id: string,
  ): Promise<PayoutListItem> {
    return this.payoutService.hold(id, req.user.id, req);
  }

  @Post(':id/release-hold')
  @UseGuards(AdminIdempotencyGuard)
  async releaseHoldPayout(
    @Req() req: any,
    @Param('id') id: string,
  ): Promise<PayoutListItem> {
    return this.payoutService.releaseHold(id, req.user.id, req);
  }

  @Patch(':id/cancel')
  @UseGuards(AdminIdempotencyGuard)
  async cancelPayout(
    @Req() req: any,
    @Param('id') id: string,
  ): Promise<PayoutListItem> {
    return this.payoutService.cancel(id, req.user.id, req);
  }

  @Patch(':id/reverse')
  @UseGuards(AdminIdempotencyGuard)
  async reversePayout(
    @Req() req: any,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(AdminPayoutReverseSchema))
    dto: AdminPayoutReverseDto,
  ): Promise<PayoutListItem> {
    return this.payoutService.reverse(id, req.user.id, req, dto.reversalReason);
  }
}
