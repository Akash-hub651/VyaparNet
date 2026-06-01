import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { AdminContextGuard } from '../guards/admin-context.guard';
import { AdminIdempotencyGuard } from '../guards/admin-idempotency.guard';
import { AdminRateLimitGuard } from '../guards/admin-rate-limit.guard';
import { AdminOrderService } from '../services/admin-order.service';
import { AdminExceptionService } from '../services/admin-exception.service';
import {
  AdminOrderListQuerySchema,
  AdminCancelDtoSchema,
} from '@vyaparnet/types';

/**
 * AdminOrdersController — Order Management workflow for Sprint 7 Phase 6.
 *
 * Routes:
 *  GET  /admin/orders               → ALL orders across all sellers (FOOTGUN-6-F)
 *  GET  /admin/orders/exceptions    → stuck orders, failed payments, suspended sellers
 *  GET  /admin/orders/:id           → order detail with buyer PII + history (FOOTGUN-6-E)
 *  PATCH /admin/orders/:id/deliver  → SHIPPED → DELIVERED
 *  PATCH /admin/orders/:id/complete → DELIVERED → COMPLETED (with SellerPayout)
 *  PATCH /admin/orders/:id/force-cancel → any non-terminal → CANCELLED
 *
 * Guard stack: JwtAuthGuard → AdminContextGuard → AdminRateLimitGuard (INV-S7-1)
 * State-change routes: + AdminIdempotencyGuard (INV-S7-7)
 *
 * FOOTGUN-6-E: Buyer PII only in GET /admin/orders/:id — never in list.
 * FOOTGUN-6-A: Service uses validateAdminTransition() — never validateSellerTransition().
 *
 * Authority: §21 Phase 6.
 */
@Controller('admin/orders')
@UseGuards(JwtAuthGuard, AdminContextGuard, AdminRateLimitGuard)
export class AdminOrdersController {
  constructor(
    private readonly orderService: AdminOrderService,
    private readonly exceptionService: AdminExceptionService,
  ) {}

  /**
   * GET /admin/orders
   * Returns paginated order list for ALL sellers (admin has no scope restriction).
   * FOOTGUN-6-E: Returns OrderSummaryDto — no buyer PII (phone/email).
   * FOOTGUN-6-F: buyerId/sellerId are FILTERS — not scope restrictions.
   */
  @Get()
  async getOrders(@Query() rawQuery: Record<string, string>) {
    const parsed = AdminOrderListQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new UnprocessableEntityException({
        code: 'INVALID_QUERY_PARAMS',
        errors: parsed.error.issues,
      });
    }
    return this.orderService.getOrderList(parsed.data);
  }

  /**
   * GET /admin/orders/exceptions
   * Returns exception center data: stuck orders, failed payments, suspended sellers w/ active orders.
   * INV-S7-34: NOT cached — computed fresh on each request.
   *
   * NOTE: Must be declared BEFORE `:id` route to avoid route collision.
   */
  @Get('exceptions')
  async getExceptions() {
    return this.exceptionService.getBusinessExceptions();
  }

  /**
   * GET /admin/orders/:id
   * Returns full order detail including buyer PII + status history.
   * FOOTGUN-6-E: Buyer PII (phone, email) returned HERE only.
   */
  @Get(':id')
  async getOrderDetail(
    @Param('id') id: string,
    @Req() req: Request & { user: { id: string } },
  ) {
    return this.orderService.getOrderDetail(id, req.user.id, req);
  }

  /**
   * PATCH /admin/orders/:id/deliver
   * Marks order DELIVERED: SHIPPED → DELIVERED (INV-S7-13).
   * Requires Idempotency-Key header (INV-S7-7).
   * Body: {} (empty — no input required)
   */
  @Patch(':id/deliver')
  @UseGuards(AdminIdempotencyGuard)
  async markDelivered(
    @Param('id') id: string,
    @Req() req: Request & { user: { id: string }; idempotencyKey: string },
  ) {
    await this.orderService.markDelivered(
      id,
      req.user.id,
      req.idempotencyKey,
      req,
    );
    return { message: 'Order marked as delivered', orderId: id };
  }

  /**
   * PATCH /admin/orders/:id/complete
   * Marks order COMPLETED: DELIVERED → COMPLETED.
   * Creates SellerPayout + PlatformCommission inside $transaction (INV-S7-35).
   * Requires Idempotency-Key header (INV-S7-7).
   * Body: {} (empty — no input required)
   */
  @Patch(':id/complete')
  @UseGuards(AdminIdempotencyGuard)
  async markCompleted(
    @Param('id') id: string,
    @Req() req: Request & { user: { id: string }; idempotencyKey: string },
  ) {
    await this.orderService.markCompleted(
      id,
      req.user.id,
      req.idempotencyKey,
      req,
    );
    return { message: 'Order marked as completed', orderId: id };
  }

  /**
   * PATCH /admin/orders/:id/force-cancel
   * Force-cancels any non-terminal order.
   * Body: { reason: string } (min 10 chars — required for CANCELLED).
   * Requires Idempotency-Key header (INV-S7-7).
   * Missing reason → 422 CANCELLATION_REASON_REQUIRED (from validateAdminTransition).
   */
  @Patch(':id/force-cancel')
  @UseGuards(AdminIdempotencyGuard)
  async forceCancel(
    @Param('id') id: string,
    @Body() rawBody: Record<string, unknown>,
    @Req() req: Request & { user: { id: string }; idempotencyKey: string },
  ) {
    const parsed = AdminCancelDtoSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new UnprocessableEntityException({
        code: 'INVALID_REQUEST_BODY',
        errors: parsed.error.issues,
      });
    }
    await this.orderService.forceCancel(
      id,
      parsed.data,
      req.user.id,
      req.idempotencyKey,
      req,
    );
    return { message: 'Order force-cancelled', orderId: id };
  }
}
