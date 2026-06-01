import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { SellerScorecardService } from '../services/seller-scorecard.service';
import { SellerContextGuard } from '../guards/seller-context.guard';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { UserRole } from '@vyaparnet/database';

/**
 * SellerScorecardController
 *
 * Authority: SPRINT_5_EXECUTION_LOCK_FINAL.md §8.1 / §20
 * Route: GET /seller/scorecard
 *
 * FIX-3: Spec §8.1 mandates GET /seller/scorecard (NOT /seller/dashboard/scorecard).
 * Separated from SellerDashboardController to match the spec's API route table exactly.
 *
 * Returns pre-computed SellerScore from DB.
 * Computation happens in SellerScorecardWorker cron (6-hourly) — this endpoint is READ-ONLY.
 */
@Controller('seller/scorecard')
@UseGuards(JwtAuthGuard, RolesGuard, SellerContextGuard) // INV-S5-2: SellerContextGuard mandatory
@Roles(UserRole.SELLER) // INV-S5-21: SELLER role required
export class SellerScorecardController {
  constructor(
    private readonly sellerScorecardService: SellerScorecardService,
  ) {}

  /**
   * GET /seller/scorecard
   * Returns the seller's composite score, metric breakdown, scoreTrend, and Hinglish narrative.
   * Returns eligible: false with "Naya Seller" message if < 5 completed orders (INV-S5-28).
   */
  @Get()
  async getScorecard(@Req() req: any) {
    const { businessId } = req.seller;
    return this.sellerScorecardService.getScorecard(businessId);
  }
}
