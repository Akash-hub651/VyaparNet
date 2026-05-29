import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Headers,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { OrdersService, CreateOrderDto as ServiceCreateOrderDto } from './orders.service';

import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { Roles } from '../../shared/decorators/roles.decorator';
import { ZodValidationPipe } from '../../shared/pipes/zod-validation.pipe';
import { UserRole } from '@vyaparnet/database';
import { z } from 'zod';

const CreateOrderSchema = z.object({
  shippingAddressId: z.string().cuid(),
  billingAddressId: z.string().cuid(),
  paymentMethod: z.enum(['COD', 'ONLINE_UPI', 'ONLINE_CARD']),
  segment: z.string().min(1),
});

type CreateOrderBody = z.infer<typeof CreateOrderSchema>;

const CancelOrderSchema = z.object({
  reason: z.string().min(1).max(500),
});

/**
 * OrdersController — §21.1 Order APIs
 *
 * HARDENED (OPTIONAL-4): @Roles(BUYER) restricts all routes to BUYER role only.
 *   SELLER and ADMIN users MUST NOT be able to create, cancel, or view orders
 *   through the buyer-facing order API.
 *   Data ownership is additionally enforced at repository layer (buyerId filter).
 */
@Roles(UserRole.BUYER)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createOrder(
    @CurrentUser('id') userId: string,
    @Body(new ZodValidationPipe(CreateOrderSchema)) body: CreateOrderBody,
    @Headers('idempotency-key') idempotencyKey: string,
    @Req() req: Request,
  ) {
    if (!idempotencyKey) {
      throw { statusCode: 400, message: 'Idempotency-Key header is required', code: 'IDEMPOTENCY_KEY_REQUIRED' };
    }

    const ipAddress =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
      req.socket.remoteAddress ??
      '0.0.0.0';

    const dto: ServiceCreateOrderDto = {
      ...body,
      clientIdempotencyKey: idempotencyKey,
    };

    return this.ordersService.createOrder(dto, userId, ipAddress);
  }

  @Get(':orderId')
  async getOrder(
    @CurrentUser('id') userId: string,
    @Param('orderId') orderId: string,
  ): Promise<Record<string, unknown>> {
    return this.ordersService.getOrder(orderId, userId) as any;
  }

  /**
   * GET /orders/:orderId/history
   *
   * Returns the append-only status transition history for an order.
   * HARDENED (INV-18): ownership enforced via service → ordersRepo (includes buyerId filter).
   * HARDENED (INV-13): OrderStatusHistory is append-only — no update/delete ever.
   */
  @Get(':orderId/history')
  async getOrderHistory(
    @CurrentUser('id') userId: string,
    @Param('orderId') orderId: string,
  ): Promise<Record<string, unknown>[]> {
    return this.ordersService.getOrderHistory(orderId, userId) as any;
  }

  @Post(':orderId/cancel')
  @HttpCode(HttpStatus.OK)
  async cancelOrder(
    @CurrentUser('id') userId: string,
    @Param('orderId') orderId: string,
    @Body(new ZodValidationPipe(CancelOrderSchema)) body: { reason: string },
  ) {
    await this.ordersService.cancelOrder(orderId, userId, body.reason);
  }
}
