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
  CreateRfqDto,
  CreateRfqSchema,
  NegotiatePriceDto,
  NegotiatePriceSchema,
  RfqConvertDto,
  RfqConvertSchema,
} from '@vyaparnet/types';
import { ZodValidationPipe } from '../../../shared/pipes/zod-validation.pipe';
import { Rfq, Quotation, PriceNegotiation } from '@vyaparnet/database';

@Controller('buyer/rfq')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('BUYER')
export class BuyerRfqController {
  constructor(private readonly rfqService: RfqService) {}

  @Post()
  async createRfq(
    @Req() req: any,
    @Body(new ZodValidationPipe(CreateRfqSchema)) dto: CreateRfqDto,
  ): Promise<Rfq> {
    return this.rfqService.createRfq(req.user.id, dto);
  }

  @Get()
  async listRfqs(@Req() req: any): Promise<Rfq[]> {
    return this.rfqService.getBuyerRfqs(req.user.id);
  }

  @Get(':id')
  async getRfqDetails(
    @Req() req: any,
    @Param('id') id: string,
  ): Promise<Rfq & { quotations: Quotation[] }> {
    return this.rfqService.getBuyerRfqDetails(id, req.user.id);
  }

  @Post(':id/accept/:quotationId')
  async acceptQuotation(
    @Req() req: any,
    @Param('id') rfqId: string,
    @Param('quotationId') quotationId: string,
  ): Promise<Quotation> {
    return this.rfqService.acceptQuotation(rfqId, quotationId, req.user.id);
  }

  @Post(':id/convert/:quotationId')
  async convertToOrder(
    @Req() req: any,
    @Param('id') rfqId: string,
    @Param('quotationId') quotationId: string,
    @Body(new ZodValidationPipe(RfqConvertSchema)) dto: RfqConvertDto,
  ): Promise<any> {
    return this.rfqService.convertToOrder(
      rfqId,
      quotationId,
      req.user.id,
      dto,
      req.ip,
    );
  }

  @Post(':id/negotiate/:quotationId')
  async negotiatePrice(
    @Req() req: any,
    @Param('id') _rfqId: string,
    @Param('quotationId') quotationId: string,
    @Body(new ZodValidationPipe(NegotiatePriceSchema)) dto: NegotiatePriceDto,
  ): Promise<PriceNegotiation> {
    return this.rfqService.negotiatePrice(
      quotationId,
      req.user.id,
      'BUYER',
      dto,
    );
  }
}
