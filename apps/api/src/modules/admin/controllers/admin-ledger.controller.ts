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
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { UserRole } from '@vyaparnet/types';
import { AdminLedgerService } from '../services/admin-ledger.service';
import { Segment } from '@vyaparnet/database';
import { AdminIdempotencyGuard } from '../guards/admin-idempotency.guard';

@Controller('admin/buyers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminLedgerController {
  constructor(private readonly adminLedgerService: AdminLedgerService) {}

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

  @Post(':id/ledger/correction')
  @UseGuards(AdminIdempotencyGuard)
  async applyLedgerCorrection(
    @Param('id') buyerId: string,
    @Req() req: any,
    @Body()
    body: {
      amount: string;
      description: string;
      segment: string;
    },
  ): Promise<any> {
    return this.adminLedgerService.applyCorrection(
      buyerId,
      body.amount,
      body.description,
      body.segment as Segment,
      req.user.id,
    );
  }
}
