import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  UseGuards,
  Req,
  Query,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
// INV-S7-1: AdminContextGuard is the ONLY role-enforcement guard on /admin/* routes.
// FOOTGUN-2-A: NO RolesGuard, NO SellerContextGuard — AdminContextGuard is exclusive.
import { AdminContextGuard } from '../guards/admin-context.guard';
import { AdminRateLimitGuard } from '../guards/admin-rate-limit.guard';
import { ZodValidationPipe } from '../../../shared/pipes/zod-validation.pipe';
import {
  AdminDisputeListQuerySchema,
  AdminDisputeListQueryDto,
  AdminDisputeResolveSchema,
  AdminDisputeResolveDto,
} from '@vyaparnet/types';
import { AdminIdempotencyGuard } from '../guards/admin-idempotency.guard';
import { AdminDisputeService } from '../services/admin-dispute.service';

@Controller('admin/disputes')
// Guard stack: JwtAuthGuard → AdminContextGuard → AdminRateLimitGuard (INV-S7-1)
@UseGuards(JwtAuthGuard, AdminContextGuard, AdminRateLimitGuard)
export class AdminDisputesController {
  constructor(private readonly disputeService: AdminDisputeService) {}

  @Get()
  async listDisputes(
    @Query(new ZodValidationPipe(AdminDisputeListQuerySchema))
    query: AdminDisputeListQueryDto,
  ): Promise<any> {
    return this.disputeService.listDisputes(
      query.page,
      query.limit,
      query.segment,
      query.status,
      query.priority,
    );
  }

  @Get(':id')
  async getDisputeDetail(
    @Req() req: any,
    @Param('id') id: string,
  ): Promise<any> {
    return this.disputeService.getDisputeDetail(id, req.user.id);
  }

  @Patch(':id/under-review')
  @UseGuards(AdminIdempotencyGuard)
  async underReview(@Req() req: any, @Param('id') id: string): Promise<any> {
    return this.disputeService.underReview(id, req.user.id);
  }

  @Patch(':id/escalate')
  @UseGuards(AdminIdempotencyGuard)
  async escalate(@Req() req: any, @Param('id') id: string): Promise<any> {
    return this.disputeService.escalate(id, req.user.id);
  }

  @Patch(':id/resolve')
  @UseGuards(AdminIdempotencyGuard)
  async resolveDispute(
    @Req() req: any,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(AdminDisputeResolveSchema))
    dto: AdminDisputeResolveDto,
  ): Promise<any> {
    return this.disputeService.resolveDispute(
      id,
      req.user.id,
      dto.resolutionOutcome,
      dto.resolutionText,
    );
  }

  @Patch(':id/close')
  @UseGuards(AdminIdempotencyGuard)
  async closeDispute(@Req() req: any, @Param('id') id: string): Promise<any> {
    return this.disputeService.closeDispute(id, req.user.id);
  }
}
