import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { RfqService } from './rfq.service';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { Roles } from '../../../shared/decorators/roles.decorator';
import {
  CreateQuotationDto,
  CreateQuotationSchema,
  NegotiatePriceDto,
  NegotiatePriceSchema,
} from '@vyaparnet/types';
import { ZodValidationPipe } from '../../../shared/pipes/zod-validation.pipe';
import { Rfq, Quotation, PriceNegotiation } from '@vyaparnet/database';

@Controller('seller/rfq')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SELLER')
export class SellerRfqController {
  constructor(private readonly rfqService: RfqService) {}

  @Get()
  async getMatchingRfqs(@Req() req: any): Promise<Rfq[]> {
    return this.rfqService.getSellerRfqs(req.user.id);
  }

  @Post(':id/quote')
  async submitQuotation(
    @Req() req: any,
    @Param('id') rfqId: string,
    @Body(new ZodValidationPipe(CreateQuotationSchema)) dto: CreateQuotationDto,
  ): Promise<Quotation> {
    return this.rfqService.submitQuotation(rfqId, req.user.id, dto);
  }

  @Post(':id/counter/:quotationId')
  async counterOffer(
    @Req() req: any,
    @Param('id') _rfqId: string,
    @Param('quotationId') quotationId: string,
    @Body(new ZodValidationPipe(NegotiatePriceSchema)) dto: NegotiatePriceDto,
  ): Promise<PriceNegotiation> {
    return this.rfqService.negotiatePrice(
      quotationId,
      req.user.id,
      'SELLER',
      dto,
    );
  }
}
