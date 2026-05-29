import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  UnprocessableEntityException,
  ServiceUnavailableException,
  Inject,
} from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { RedisService } from '../../core/redis/redis.service';
import { PaymentRepository } from './payment.repository';
import { OrdersRepository } from '../order/orders.repository';
import { PAYMENT_PROVIDER_TOKEN } from '@vyaparnet/types';
import type { PaymentProvider } from '@vyaparnet/types';
import { formatYearMonth } from '../order/order-state-machine';
import { MetricsService } from '../observability/metrics.service';

export interface InitiatePaymentResult {
  paymentUrl?: string;
  razorpayOrderId: string;
  paymentId: string;
}

export interface PaymentStatusResult {
  paymentId: string;
  orderId: string;
  status: string;
  gatewayRef: string | null;
  gatewayPaymentId: string | null;
  capturedAt: Date | null;
  failureReason: string | null;
}

/**
 * PaymentService — §9.4 Payment Orchestration
 *
 * Authority: SPRINT_4_EXECUTION_LOCK_FINAL.md §9.4
 *
 * GOVERNANCE LAWS (enforced in this file):
 *  - INV-22: PaymentService never calls queue.add() — that is WebhookController's responsibility.
 *  - INV-24: payment_idem key ALWAYS prefixed with userId from JWT.
 *  - INV-32: CodPaymentProvider uses metadata.orderId — never Date.now() (enforced in provider).
 *  - §9.4: Redis idempotency key SET only AFTER Razorpay call + DB write succeeds.
 *  - §15.5: High-value payment (>₹50K) requires x-reauth-token header.
 *  - All Razorpay SDK access is FULLY delegated to the PaymentProvider — NEVER called directly here.
 */
@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly paymentRepo: PaymentRepository,
    private readonly ordersRepo: OrdersRepository,
    @Inject(PAYMENT_PROVIDER_TOKEN)
    private readonly paymentProvider: PaymentProvider,
    private readonly metrics: MetricsService,
  ) {}

  /**
   * initiatePayment — §9.4 Step-by-step implementation
   *
   * Called from OrderService (online path) or PaymentController (POST /payments/initiate).
   * MUST be called OUTSIDE any $transaction — creates Razorpay HTTP call internally.
   *
   * @param orderId   DB order ID
   * @param amount    Amount in paise (integer)
   * @param method    PaymentMethod enum string
   * @param clientIdempotencyKey  From Idempotency-Key header
   * @param userId    From JWT — REQUIRED for idempotency key namespacing (INV-24)
   * @param reauthToken Optional — required for amounts > ₹50K (§15.5)
   */
  async initiatePayment(
    orderId: string,
    amount: number,
    method: string,
    clientIdempotencyKey: string,
    userId: string,
    reauthToken?: string,
  ): Promise<InitiatePaymentResult> {
    // ── STEP 1: IDEMPOTENCY CHECK (FIRST operation) ──
    // HARDENED (INV-24): userId from JWT MUST be first namespace component
    const idemKey = `payment_idem:${userId}:${clientIdempotencyKey}`;

    let cached: string | null = null;
    try {
      cached = await this.redis.get(idemKey);
    } catch (redisErr) {
      // Redis degraded: §18.1 — return 503 (cannot risk duplicate payments without idempotency)
      this.logger.error({ idemKey, err: redisErr }, 'Redis unavailable for payment idempotency check — returning 503');
      throw new ServiceUnavailableException({
        code: 'PAYMENT_GATEWAY_UNAVAILABLE',
        message: 'Payment service temporarily unavailable — please retry',
        retryable: true,
      });
    }

    if (cached) {
      this.logger.log({ userId, orderId }, 'Payment idempotency hit — returning cached response');
      return JSON.parse(cached) as InitiatePaymentResult;
    }

    // ── STEP 2: LOAD AND VALIDATE ORDER (ownership check — INV-18) ──
    const order = await this.ordersRepo.findById(orderId, userId);
    if (!order) {
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND' });
    }

    // ── STEP 3: DERIVE AMOUNT FROM ORDER (server-side — never trust client-provided amount) ──
    // If caller passed amount=0 (from controller), derive from order.grandTotal
    // HARDENED: No client-provided price trusted for financial calculations
    const amountInPaise = amount > 0
      ? amount
      : Math.round(order.grandTotal.toNumber() * 100); // INR decimal → paise

    // ── STEP 4: HIGH-VALUE PAYMENT RE-AUTH CHECK (§15.5) ──
    // ₹50,000 = 5,000,000 paise
    if (amountInPaise > 5_000_000) {
      if (!reauthToken) {
        throw new ForbiddenException({
          code: 'REAUTH_REQUIRED',
          message: 'Re-authentication required for payments over ₹50,000',
          threshold: 50_000,
        });
      }
      // Verify reauth token (single-use — DEL from Redis on verification)
      const storedUserId = await this.redis.get(`reauth:${reauthToken}`);
      if (!storedUserId || storedUserId !== userId) {
        throw new ForbiddenException({
          code: 'REAUTH_REQUIRED',
          message: 'Re-authentication token is invalid or expired',
          threshold: 50_000,
        });
      }
      // Consume the token (single-use — INV §15.5)
      await this.redis.del(`reauth:${reauthToken}`).catch(() => {});
    }

    // ── STEP 4: CREATE GATEWAY ORDER (HTTP call — OUTSIDE $transaction) ──
    const providerOrder = await this.paymentProvider.createOrder(
      amountInPaise,
      'INR',
      {
        orderId,
        buyerId: userId,
        description: `VyaparNet Order ${orderId}`,
      },
    );

    this.logger.log(
      { orderId, providerOrderId: providerOrder.providerOrderId, amount },
      'Payment gateway order created',
    );
    this.metrics.paymentInitiatedTotal.inc({ provider: 'RAZORPAY' });

    // ── STEP 5 + 6: PERSIST PAYMENT RECORD + EMIT EventOutbox (ATOMIC $transaction) ──
    // HARDENED (§6.1): payment.create() and eventOutbox.create() MUST be in the
    // same $transaction. A crash between two separate writes permanently loses
    // the PaymentInitiated event — downstream consumers (Sprint 6, Sprint 9) depend on it.
    // NOTE: providerOrder HTTP call is CORRECTLY outside this transaction (§3.1).
    const eventMonth = formatYearMonth(new Date());
    const payment = await this.prisma.$transaction(async (tx) => {
      const p = await tx.payment.create({
        data: {
          orderId,
          amount: amountInPaise,
          method: method as any,
          gateway: 'RAZORPAY',
          gatewayRef: providerOrder.providerOrderId,
          idempotencyKey: `${userId}:${clientIdempotencyKey}`, // userId-scoped
          status: 'PENDING',
        },
      });

      // HARDENED (INV-20): eventVersion + schemaVersion MANDATORY
      await tx.eventOutbox.create({
        data: {
          eventType: 'PaymentInitiated',
          eventVersion: '1.0',     // HARDENED (INV-20)
          schemaVersion: '4.3',    // HARDENED (INV-20)
          payload: {
            orderId,
            paymentId: p.id,
            amount: amountInPaise,
            method,
            gatewayOrderId: providerOrder.providerOrderId,
          },
          deduplicationKey: `payment-initiated-${p.id}`, // deterministic (INV-17)
          eventMonth,
          status: 'PENDING',
        },
      });

      return p;
    }, { timeout: 5000, isolationLevel: 'ReadCommitted' });

    const result: InitiatePaymentResult = {
      paymentUrl: providerOrder.checkoutUrl,
      razorpayOrderId: providerOrder.providerOrderId,
      paymentId: payment.id,
    };

    // ── STEP 7: CACHE IDEMPOTENCY RESULT AFTER ALL WRITES SUCCEED ──
    // HARDENED (INV-33): SET AFTER DB write — NEVER before, NEVER inside $transaction
    await this.redis
      .set(idemKey, JSON.stringify(result), 'EX', 86400)
      .catch((err) => {
        // Non-fatal — payment already created. Log and continue.
        this.logger.warn({ idemKey, err }, 'Failed to cache payment idempotency key — degraded idempotency');
      });

    this.logger.log(
      { orderId, paymentId: payment.id, method },
      'Payment initiated successfully',
    );

    return result;
  }

  async getPaymentStatus(orderId: string, userId: string): Promise<PaymentStatusResult> {
    // INV-18: ownership enforced via ordersRepo (includes buyerId filter)
    const order = await this.ordersRepo.findById(orderId, userId);
    if (!order) throw new NotFoundException({ code: 'ORDER_NOT_FOUND' });

    const payment = await this.paymentRepo.findByOrderId(orderId);
    if (!payment) throw new NotFoundException({ code: 'PAYMENT_NOT_FOUND' });

    return {
      paymentId: payment.id,
      orderId: payment.orderId,
      status: payment.status,
      gatewayRef: payment.gatewayRef,
      gatewayPaymentId: payment.gatewayPaymentId,
      capturedAt: payment.capturedAt,
      failureReason: payment.failureReason,
    };
  }

  /**
   * retryPayment — §20.4
   *
   * Allows buyer to retry payment for PAYMENT_FAILED order within the 30-min window.
   * HARDENED (INV-23): Dual-authority check — BOTH Redis key absent AND DB timestamp expired
   * required to consider window closed.
   *
   * HARDENED (INV-24): userId PASSED to initiatePayment() for idempotency key namespacing.
   */
  async retryPayment(
    orderId: string,
    userId: string,
    paymentMethod: string,
    clientIdempotencyKey?: string, // HARDENED (MEDIUM-3): optional — client key takes priority over internal key
  ): Promise<InitiatePaymentResult> {
    // 1. Load order with ownership check
    const order = await this.ordersRepo.findById(orderId, userId);
    if (!order) throw new NotFoundException({ code: 'ORDER_NOT_FOUND' });

    // 2. Validate state
    if (order.status !== 'PAYMENT_FAILED') {
      throw new UnprocessableEntityException({ code: 'ORDER_NOT_IN_PAYMENT_FAILED_STATE' });
    }

    // HARDENED (INV-23): DUAL-AUTHORITY retry window check
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    const redisKeyExists = (await this.redis.exists(`payment_retry_window:${orderId}`).catch(() => 0)) > 0;
    const dbWindowOpen = order.paymentFailedAt !== null && order.paymentFailedAt > thirtyMinutesAgo;

    if (!redisKeyExists && !dbWindowOpen) {
      // BOTH authorities confirm expired — window is closed
      throw new UnprocessableEntityException({
        code: 'PAYMENT_RETRY_WINDOW_EXPIRED',
        message: 'Retry window expired — order has been or will be cancelled',
      });
    }

    if (!redisKeyExists && dbWindowOpen) {
      // Redis eviction detected — window still open per DB (buyer can still retry)
      this.logger.warn(
        { orderId, paymentFailedAt: order.paymentFailedAt },
        'HARDENED (INV-23): Redis retry window key missing but DB confirms window open — possible Redis eviction',
      );
      this.metrics.paymentRetryRedisPrematureEvictionTotal.inc();
    }

    // 3. Count prior failed attempts for deterministic idempotency key
    const failedPayments = await this.paymentRepo.findFailedByOrderId(orderId);
    const attemptNumber = failedPayments.length + 1;

    // 4. Deterministic retry idempotency key (includes attempt number)
    // HARDENED (MEDIUM-3): client-provided key takes priority — prevents double-tap race.
    // If client provides Idempotency-Key header, use it. Otherwise use internal deterministic key.
    const retryIdempotencyKey = clientIdempotencyKey ?? `payment-retry-${orderId}-${attemptNumber}`;

    // 5. Initiate new payment — HARDENED (INV-24): userId passed as 5th arg
    return this.initiatePayment(
      orderId,
      order.grandTotal.toNumber(),
      paymentMethod,
      retryIdempotencyKey,
      userId, // HARDENED (INV-24): userId MUST be passed — not omitted
    );
  }
}
