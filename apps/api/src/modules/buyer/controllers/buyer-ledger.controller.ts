import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { UserRole } from '@vyaparnet/types';
import { BuyerLedgerService } from '../services/buyer-ledger.service';
import { ZodValidationPipe } from '../../../shared/pipes/zod-validation.pipe';
import {
  BuyerLedgerListQuerySchema,
  BuyerLedgerListQueryDto,
} from '@vyaparnet/types';

@Controller('buyer/ledger')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.BUYER)
export class BuyerLedgerController {
  constructor(private readonly ledgerService: BuyerLedgerService) {}

  @Get()
  async getMyLedger(
    @Req() req: any,
    @Query(new ZodValidationPipe(BuyerLedgerListQuerySchema))
    query: BuyerLedgerListQueryDto,
  ): Promise<any> {
    return this.ledgerService.getLedger(
      req.user.id,
      query.page,
      query.limit,
      query.segment,
    );
  }
}
