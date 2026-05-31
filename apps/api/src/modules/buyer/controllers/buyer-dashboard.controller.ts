import { Controller, UseGuards } from '@nestjs/common';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { UserRole } from '@vyaparnet/database';

/**
 * BuyerDashboardController
 *
 * Authority: SPRINT_5_EXECUTION_LOCK_FINAL.md §7.1 (Module Structure)
 *
 * FIX-5 (M-1 / FR-2): This file was required by §7.1 but absent in the original
 * implementation. Sprint 5 buyer dashboard routes (order list, order detail, cancel,
 * reorder) are all handled by BuyerOrdersController per §15 acceptance criteria.
 *
 * This controller serves as the structural placeholder per §7.1 and is the
 * correct extension point for Sprint 6 buyer-specific dashboard aggregations
 * (e.g., GET /buyer/dashboard/summary — total spend, active orders count).
 *
 * Sprint 6 NOTE: Add @Get('summary') with BuyerDashboardService here.
 * Do NOT add order management routes here — those belong in BuyerOrdersController.
 */
@Controller('buyer/dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.BUYER)
export class BuyerDashboardController {
  // Sprint 5: No additional routes beyond BuyerOrdersController.
  // This class satisfies §7.1 file structure requirement.
  //
  // Sprint 6 placeholder:
  //
  // @Get('summary')
  // async getSummary(@Req() req: any) {
  //   return this.buyerDashboardService.getSummary(req.user.id);
  // }
}
