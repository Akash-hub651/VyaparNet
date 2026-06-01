import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { SellerKpiService } from '../services/seller-kpi.service';
import { SellerContextGuard } from '../guards/seller-context.guard';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { UserRole } from '@vyaparnet/database';

/**
 * SellerDashboardController
 *
 * Authority: SPRINT_5_EXECUTION_LOCK_FINAL.md §16 / §8.1
 * Route base: /seller/dashboard
 *
 * FIX-3: Scorecard moved to SellerScorecardController at GET /seller/scorecard
 * to match spec §8.1 API route table. This controller retains dashboard-specific routes only.
 */
@Controller('seller/dashboard')
@UseGuards(JwtAuthGuard, RolesGuard, SellerContextGuard) // INV-S5-2: SellerContextGuard mandatory
@Roles(UserRole.SELLER) // INV-S5-21: SELLER role required
export class SellerDashboardController {
  constructor(private readonly sellerKpiService: SellerKpiService) {}

  /**
   * GET /seller/dashboard/kpis
   * Returns KPI snapshot: ordersToday, revenueToday, pendingOrders, lowStock.
   * Redis-cached with 60–75s jitter TTL (INV-S5-36).
   * Falls back to DB if Redis is unavailable (INV-S5-15).
   */
  @Get('kpis')
  async getKpis(@Req() req: any) {
    const { businessId, segment } = req.seller;
    return this.sellerKpiService.getKpis(businessId, segment);
  }
}
