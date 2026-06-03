import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  UseGuards,
  Req,
  Query,
  Body,
} from '@nestjs/common';
import { AdminReturnService } from '../services/admin-return.service';
import { AdminRefundService } from '../services/admin-refund.service';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../shared/pipes/zod-validation.pipe';
import {
  AdminReturnListQueryDto,
  AdminReturnListQuerySchema,
  AdminReturnQcPassDto,
  AdminReturnQcPassSchema,
  AdminReturnInitiateRefundDto,
  AdminReturnInitiateRefundSchema,
} from '@vyaparnet/types';
import { AdminIdempotencyGuard } from '../guards/admin-idempotency.guard';
import { UserRole } from '@vyaparnet/types';

@Controller('admin/returns')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminReturnsController {
  constructor(
    private readonly adminReturnService: AdminReturnService,
    private readonly adminRefundService: AdminRefundService,
  ) {}

  @Get()
  async getReturns(
    @Query(new ZodValidationPipe(AdminReturnListQuerySchema))
    query: AdminReturnListQueryDto,
  ) {
    return this.adminReturnService.listReturns(
      query.page,
      query.limit,
      query.segment,
      query.status,
    );
  }

  @Get(':id')
  async getReturnDetail(
    @Req() req: any,
    @Param('id') id: string,
  ): Promise<any> {
    return this.adminReturnService.getReturnDetail(id, req.user.id);
  }

  @Patch(':id/approve')
  @UseGuards(AdminIdempotencyGuard)
  async approveReturn(@Req() req: any, @Param('id') id: string): Promise<any> {
    return this.adminReturnService.approveReturn(id, req.user.id);
  }

  @Patch(':id/reject')
  @UseGuards(AdminIdempotencyGuard)
  async rejectReturn(@Req() req: any, @Param('id') id: string): Promise<any> {
    return this.adminReturnService.rejectReturn(id, req.user.id);
  }

  @Patch(':id/mark-received')
  @UseGuards(AdminIdempotencyGuard)
  async markReceived(@Req() req: any, @Param('id') id: string): Promise<any> {
    return this.adminReturnService.markReceived(id, req.user.id);
  }

  @Patch(':id/qc-pass')
  @UseGuards(AdminIdempotencyGuard)
  async qcPass(
    @Req() req: any,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(AdminReturnQcPassSchema))
    dto: AdminReturnQcPassDto,
  ): Promise<any> {
    return this.adminReturnService.qcPass(
      id,
      req.user.id,
      dto.approvedRefundAmount,
    );
  }

  @Patch(':id/qc-fail')
  @UseGuards(AdminIdempotencyGuard)
  async qcFail(@Req() req: any, @Param('id') id: string): Promise<any> {
    return this.adminReturnService.qcFail(id, req.user.id);
  }

  @Patch(':id/close')
  @UseGuards(AdminIdempotencyGuard)
  async closeReturn(@Req() req: any, @Param('id') id: string): Promise<any> {
    return this.adminReturnService.closeReturn(id, req.user.id);
  }

  @Post(':id/initiate-refund')
  @UseGuards(AdminIdempotencyGuard)
  async initiateRefund(
    @Req() req: any,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(AdminReturnInitiateRefundSchema))
    dto: AdminReturnInitiateRefundDto,
  ): Promise<any> {
    return this.adminRefundService.initiateRefund(
      id,
      dto.approvedRefundAmount,
      req.user.id,
    );
  }

  @Patch(':id/mark-refunded')
  @UseGuards(AdminIdempotencyGuard)
  async markRefunded(@Req() req: any, @Param('id') id: string): Promise<any> {
    return this.adminRefundService.markRefunded(id, req.user.id);
  }
}
