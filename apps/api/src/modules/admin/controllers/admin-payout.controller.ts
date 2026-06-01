import {
  Controller,
  Get,
  Patch,
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
} from '@vyaparnet/types';

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
}
