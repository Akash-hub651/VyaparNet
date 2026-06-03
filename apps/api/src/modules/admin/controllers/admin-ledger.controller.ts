import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
// INV-S7-1: AdminContextGuard is the ONLY role-enforcement guard on /admin/* routes.
// FOOTGUN-2-A: NO RolesGuard, NO SellerContextGuard — AdminContextGuard is exclusive.
import { AdminContextGuard } from '../guards/admin-context.guard';
import { AdminRateLimitGuard } from '../guards/admin-rate-limit.guard';
import { AdminLedgerService } from '../services/admin-ledger.service';
import { AdminIdempotencyGuard } from '../guards/admin-idempotency.guard';
import { ZodValidationPipe } from '../../../shared/pipes/zod-validation.pipe';
import {
  AdminLedgerCorrectionSchema,
  AdminLedgerCorrectionDto,
} from '@vyaparnet/types';

@Controller('admin/buyers')
// Guard stack: JwtAuthGuard → AdminContextGuard → AdminRateLimitGuard (INV-S7-1)
@UseGuards(JwtAuthGuard, AdminContextGuard, AdminRateLimitGuard)
export class AdminLedgerController {
  constructor(private readonly adminLedgerService: AdminLedgerService) {}

  /**
   * GET /admin/buyers/:id/ledger
   * Retrieve paginated BuyerLedger entries for a buyer.
   * INV-S8-2: Read-only — no mutations here.
   * INV-S8-11: Admin buyer ledger visibility.
   */
  @Get(':id/ledger')
  async getBuyerLedger(
    @Param('id') buyerId: string,
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<any> {
    const p = page ? parseInt(page, 10) : 1;
    const l = limit ? parseInt(limit, 10) : 10;
    return this.adminLedgerService.getBuyerLedger(buyerId, req.user.id, p, l);
  }

  /**
   * POST /admin/buyers/:id/ledger/correction
   * Apply an admin correction/adjustment entry to the buyer ledger.
   * INV-S8-2: Only creates new entries — no updates or deletes (append-only).
   * INV-S7-7: Idempotency-Key header required on all admin PATCH/POST.
   */
  @Post(':id/ledger/correction')
  @UseGuards(AdminIdempotencyGuard)
  async applyLedgerCorrection(
    @Param('id') buyerId: string,
    @Req() req: any,
    @Body(new ZodValidationPipe(AdminLedgerCorrectionSchema))
    dto: AdminLedgerCorrectionDto,
  ): Promise<any> {
    return this.adminLedgerService.applyCorrection(
      buyerId,
      dto.amount,
      dto.description,
      dto.segment,
      req.user.id,
    );
  }
}
