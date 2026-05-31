import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Headers,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { PaymentService } from './payment.service';

import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { Roles } from '../../shared/decorators/roles.decorator';
import { ZodValidationPipe } from '../../shared/pipes/zod-validation.pipe';
import { InitiatePaymentSchema, PaymentRetrySchema } from '@vyaparnet/types';
import type { InitiatePaymentDto, PaymentRetryDto } from '@vyaparnet/types';
import { UserRole } from '@vyaparnet/database';

/**
 * PaymentController — §21.3 Payment APIs
 *
 * Authority: SPRINT_4_EXECUTION_LOCK_FINAL.md §21.3
 *
 * Routes:
 *   POST   /api/v1/payments/initiate           — Initiate payment (online path)
 *   GET    /api/v1/payments/:orderId/status     — Get payment status for order
 *   POST   /api/v1/payments/retry              — Retry failed payment
 *
 * HARDENED: Idempotency-Key header required for mutating endpoints (§7.4, INV-33).
 * HARDENED (OPTIONAL-4): @Roles(BUYER) restricts all routes to buyer role only.
 *   Sellers and Admins MUST NOT be able to initiate/retry payments on behalf of buyers.
 */
@Roles(UserRole.BUYER)
@Controller('payments')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  /**
   * POST /payments/initiate
   *
   * HARDENED (INV-33): Idempotency-Key header REQUIRED — returns 400 if absent.
   * userId from JWT provides namespace isolation (INV-24).
   * Amount is derived server-side from order.grandTotal — never from client body.
   */
  @Post('initiate')
  @HttpCode(HttpStatus.OK)
  async initiatePayment(
    @CurrentUser('id') userId: string,
    @Body(new ZodValidationPipe(InitiatePaymentSchema)) body: InitiatePaymentDto,
    @Headers('idempotency-key') idempotencyKey: string,
    @Headers('x-reauth-token') reauthToken: string | undefined,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Idempotency-Key header is required',
      });
    }

    // Amount = 0 tells PaymentService to derive from order.grandTotal (server-side)
    return this.paymentService.initiatePayment(
      body.orderId,
      0, // Server derives real amount from order (no client-provided price — §14 INV)
      body.paymentMethod,
      idempotencyKey,
      userId,
      reauthToken,
    );
  }

  /**
   * GET /payments/:orderId/status
   *
   * Returns payment status for a given order.
   * HARDENED (INV-18): ownership enforced via service → ordersRepo (includes buyerId filter).
   */
  @Get(':orderId/status')
  async getPaymentStatus(
    @CurrentUser('id') userId: string,
    @Param('orderId') orderId: string,
  ): Promise<Record<string, unknown>> {
    return this.paymentService.getPaymentStatus(orderId, userId) as unknown as Record<string, unknown>;
  }

  @Get(':orderId/retry-status')
  async getRetryStatus(
    @CurrentUser('id') userId: string,
    @Param('orderId') orderId: string,
  ) {
    return this.paymentService.getRetryStatus(orderId, userId);
  }

  /**
   * POST /payments/retry
   *
   * Retry payment for PAYMENT_FAILED order within 30-min window.
   * HARDENED (INV-23): Dual-authority retry window check in service.
   * HARDENED (INV-24): userId from JWT passed to initiatePayment() as 5th argument.
   * HARDENED (MEDIUM-3): Idempotency-Key header accepted. If provided by client, it
   *   is passed directly to initiatePayment() preventing double-tap concurrent retries.
   *   If absent, the service generates a deterministic internal key as fallback.
   */
  @Post('retry')
  @HttpCode(HttpStatus.OK)
  async retryPayment(
    @CurrentUser('id') userId: string,
    @Body(new ZodValidationPipe(PaymentRetrySchema)) body: PaymentRetryDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.paymentService.retryPayment(
      body.orderId,
      userId,
      body.paymentMethod,
      idempotencyKey, // HARDENED (MEDIUM-3): client key passed to override internal key if present
    );
  }
}
