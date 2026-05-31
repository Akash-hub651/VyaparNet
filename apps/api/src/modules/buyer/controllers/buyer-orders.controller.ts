import { Controller, Get, Delete, Param, Query, Body, UseGuards, Post } from '@nestjs/common';
import { BuyerOrderService } from '../services/buyer-order.service';
import { BuyerReorderService } from '../services/buyer-reorder.service';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { CurrentUser } from '../../../shared/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { UserRole } from '@vyaparnet/database';
import { ZodValidationPipe } from '../../../shared/pipes/zod-validation.pipe';
import { BuyerOrderFilterSchema, BuyerCancelOrderSchema, BuyerOrderFilter, BuyerCancelOrderDto } from '@vyaparnet/types';

@Controller('buyer/orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.BUYER)
export class BuyerOrdersController {
  constructor(
    private readonly buyerOrderService: BuyerOrderService,
    private readonly buyerReorderService: BuyerReorderService,
  ) {}

  @Get()
  async getOrders(
    @CurrentUser('id') buyerId: string,
    @Query(new ZodValidationPipe(BuyerOrderFilterSchema)) filter: BuyerOrderFilter,
  ) {
    return this.buyerOrderService.getOrders(buyerId, filter);
  }

  @Get(':id')
  async getOrder(
    @CurrentUser('id') buyerId: string,
    @Param('id') orderId: string,
  ): Promise<any> {
    return this.buyerOrderService.getOrder(orderId, buyerId);
  }

  @Delete(':id')
  async cancelOrder(
    @CurrentUser('id') buyerId: string,
    @Param('id') orderId: string,
    @Body(new ZodValidationPipe(BuyerCancelOrderSchema)) body: BuyerCancelOrderDto,
  ): Promise<any> {
    return this.buyerOrderService.cancelOrder(orderId, buyerId, body.reason);
  }

  @Post(':id/reorder')
  async reorder(
    @CurrentUser('id') buyerId: string,
    @Param('id') orderId: string,
  ) {
    return this.buyerReorderService.reorder(orderId, buyerId);
  }
}
