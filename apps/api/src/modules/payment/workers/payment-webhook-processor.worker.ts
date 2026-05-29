import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { RedisService } from '../../../core/redis/redis.service';
import { PaymentRepository } from '../payment.repository';
import { OrdersRepository } from '../../order/orders.repository';
import { InventoryService } from '../../inventory/inventory.service';
import { formatYearMonth } from '../../order/order-state-machine';
import type { WebhookJobPayload } from '../webhook.controller';
import { MetricsService } from '../../observability/metrics.service';

interface RazorpayPaymentPayload {
  payment?: {
    entity?: {
      id?: string;
      order_id?: string;
      amount?: number;
      error_description?: string;
    };
  };
  order?: {
    entity?: {
      id?: string;
      receipt?: string;
    };
  };
}

/**
 * PaymentWebhookProcessorWorker — §14.5
 *
 * Authority: SPRINT_4_EXECUTION_LOCK_FINAL.md §14.5, §16.1
 *
 * Processes BullMQ jobs queued by WebhookController.
 * Handles: payment.captured, payment.failed
 *
 * GOVERNANCE LAWS:
 *  - INV-19: INSIDE $transaction: ASSERT order.status === 'PLACED' before consume()
 *  - INV-11: consume() receives tx parameter — NEVER opens own $transaction
 *  - INV-20: eventVersion + schemaVersion on every eventOutbox.create()
 *  - INV-30: Payment.gatewayPaymentId unique index enforces exactly-once capture
 *  - INV-31: handlePaymentFailed MUST fetch payment record BEFORE $transaction
 *  - Worker-level idempotency: check webhook_idem_result:{eventId} at job start
 *  - release() OUTSIDE $transaction (compensation — §7.3)
 *  - consume() INSIDE $transaction (via tx parameter)
 *  - Redis webhook_idem_result SET AFTER $transaction commit
 */
@Processor('payments')
export class PaymentWebhookProcessorWorker {
  private readonly logger = new Logger(PaymentWebhookProcessorWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly paymentRepo: PaymentRepository,
    private readonly ordersRepo: OrdersRepository,
    private readonly inventoryService: InventoryService,
    private readonly metrics: MetricsService,
  ) {}

  @Process('process-webhook')
  async handle(job: Job<WebhookJobPayload>): Promise<void> {
    const endTimer = this.metrics.bullmqPaymentWebhookWorkerLatencyMs.startTimer();
    const { razorpayEventId, eventType, payload } = job.data;

    // ── STEP 1: WORKER-LEVEL IDEMPOTENCY CHECK ──
    // Guards against BullMQ retrying an already-processed job (§14.5)
    let alreadyProcessed: string | null = null;
    try {
      alreadyProcessed = await this.redis.get(`webhook_idem_result:${razorpayEventId}`);
    } catch (redisErr) {
      this.logger.warn({ razorpayEventId, err: redisErr }, 'Redis unavailable for webhook_idem_result check — proceeding without idempotency guard');
    }

    if (alreadyProcessed) {
      this.logger.log(
        { razorpayEventId, eventType },
        'Webhook already processed — skipping (worker-level idempotency guard)',
      );
      endTimer();
      return;
    }

    // ── STEP 2: DISPATCH BY EVENT TYPE ──
    if (eventType === 'payment.captured') {
      await this.handlePaymentCaptured(payload as RazorpayPaymentPayload);
    } else if (eventType === 'payment.failed') {
      await this.handlePaymentFailed(payload as RazorpayPaymentPayload);
    } else {
      this.logger.log({ razorpayEventId, eventType }, 'Unhandled webhook event type — skipping');
      return;
    }

    // ── STEP 3: CACHE PROCESSING RESULT (AFTER $transaction commit) ──
    await this.redis
      .set(
        `webhook_idem_result:${razorpayEventId}`,
        JSON.stringify({ status: 'PROCESSED' }),
        'EX',
        86400,
      )
      .catch((err) => {
        // Non-fatal: idempotency degraded but payment is confirmed
        this.logger.warn({ razorpayEventId, err }, 'Failed to cache webhook_idem_result — degraded idempotency');
      });
      
    endTimer();
  }

  /**
   * handlePaymentCaptured — §14.5 captured path
   *
   * HARDENED (INV-19): INSIDE $transaction, asserts order.status === 'PLACED'.
   * This is the double-consume guard: if two concurrent jobs process the same webhook,
   * the first committing $transaction wins. The second sees 'CONFIRMED' and aborts safely.
   */
  private async handlePaymentCaptured(payload: RazorpayPaymentPayload): Promise<void> {
    const razorpayOrderId = payload.payment?.entity?.order_id ?? payload.order?.entity?.id;
    const razorpayPaymentId = payload.payment?.entity?.id;
    const capturedAmount = payload.payment?.entity?.amount;

    if (!razorpayOrderId) {
      throw new Error('handlePaymentCaptured: missing razorpayOrderId in webhook payload');
    }

    // Load order via gatewayRef (payment.gatewayRef = razorpay order_xxxxx)
    const order = await this.ordersRepo.findByGatewayRef(razorpayOrderId);
    if (!order) {
      throw new Error(`handlePaymentCaptured: Order not found for razorpayOrderId: ${razorpayOrderId}`);
    }

    // HARDENED (INV-31 pattern for captured): Fetch payment BEFORE $transaction
    const payment = await this.paymentRepo.findPendingByOrderId(order.id);
    if (!payment) {
      throw new Error(`handlePaymentCaptured: No PENDING payment found for orderId: ${order.id}`);
    }

    // Load active reservations BEFORE $transaction
    const reservations = await this.prisma.inventoryReservation.findMany({
      where: { orderId: order.id, status: 'ACTIVE' },
      select: { id: true },
    });

    // ── SINGLE $TRANSACTION: consume + confirm + emit ──
    // HARDENED: All DB writes in one atomic unit. Redis forbidden inside.
    await this.prisma.$transaction(async (tx) => {
      // ── HARDENED (INV-19): DOUBLE-CONSUME GUARD ──
      // Read current order status INSIDE $transaction — cannot rely on pre-tx load.
      // Two concurrent jobs: first commits → order.status = 'CONFIRMED'.
      // Second sees 'CONFIRMED' → exits early (no double-consume).
      const currentOrder = await tx.order.findFirst({
        where: { id: order.id },
        select: { status: true },
      });

      if (currentOrder?.status !== 'PLACED') {
        // metric: webhook_double_consume_prevented_total (ALERT if > 0)
        this.metrics.webhookDoubleConsumePreventedTotal.inc();
        this.logger.warn(
          { orderId: order.id, currentStatus: currentOrder?.status, razorpayOrderId },
          'HARDENED (INV-19): Order not in PLACED state — duplicate webhook job aborted (double-consume guard)',
        );
        return; // Idempotent exit
      }

      // ── Update payment with gatewayPaymentId ──
      // HARDENED (INV-30): gatewayPaymentId unique index enforces exactly-once capture at DB level
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: 'CAPTURED',
          capturedAt: new Date(),
          gatewayPaymentId: razorpayPaymentId ?? null, // HARDENED (INV-30)
          gatewayRef: razorpayOrderId,
        },
      });

      // ── consume() all reservations — passes tx (INV-11) ──
      // HARDENED (INV-11): consume receives tx — NEVER opens own $transaction
      for (const reservation of reservations) {
        await this.inventoryService.consume(reservation.id, 'SYSTEM', tx);
      }

      // ── Confirm order ──
      await tx.order.update({
        where: { id: order.id },
        data: { status: 'CONFIRMED', confirmedAt: new Date() },
      });

      // ── Append status history ──
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          statusFrom: 'PLACED',
          statusTo: 'CONFIRMED',
          actorId: 'SYSTEM',
          actorRole: 'SYSTEM' as any,
          reason: 'Payment captured via Razorpay webhook',
          timestamp: new Date(),
          historyMonth: formatYearMonth(new Date()),
        },
      });

      const eventMonth = formatYearMonth(new Date());

      // ── HARDENED (INV-20): PaymentReceived event ──
      await tx.eventOutbox.create({
        data: {
          eventType: 'PaymentReceived',
          eventVersion: '1.0',       // MANDATORY (INV-20)
          schemaVersion: '4.3',      // MANDATORY (INV-20)
          payload: {
            orderId: order.id,
            paymentId: payment.id,
            amount: capturedAmount ?? payment.amount,
            gatewayPaymentId: razorpayPaymentId ?? null,
            method: payment.method,
            capturedAt: new Date().toISOString(),
          },
          deduplicationKey: `payment-received-${payment.id}`, // deterministic (INV-17)
          eventMonth,
          status: 'PENDING',
        },
      });

      // ── HARDENED (INV-20): OrderConfirmed event ──
      await tx.eventOutbox.create({
        data: {
          eventType: 'OrderConfirmed',
          eventVersion: '1.0',       // MANDATORY (INV-20)
          schemaVersion: '4.3',      // MANDATORY (INV-20)
          payload: {
            orderId: order.id,
            orderNumber: (order as any).orderNumber,
            confirmedAt: new Date().toISOString(),
            paymentMethod: payment.method,
            paymentId: payment.id,
          },
          deduplicationKey: `order-confirmed-${order.id}`, // deterministic (INV-17)
          eventMonth,
          status: 'PENDING',
        },
      });
    }, { timeout: 10000, isolationLevel: 'ReadCommitted' });

    this.logger.log(
      { orderId: order.id, paymentId: payment.id },
      'Payment captured — order CONFIRMED, inventory consumed',
    );
    this.metrics.paymentSuccessTotal.inc({ provider: 'RAZORPAY' });
  }

  /**
   * handlePaymentFailed — §14.5 failed path
   *
   * HARDENED (INV-31): Payment record fetched BEFORE $transaction.
   * Earlier version had `payment` variable used inside tx without fetching it first — caused ReferenceError.
   *
   * release() called OUTSIDE $transaction — compensation is idempotent (§7.3).
   * $transaction only for DB state updates + EventOutbox.
   */
  private async handlePaymentFailed(payload: RazorpayPaymentPayload): Promise<void> {
    const razorpayOrderId = payload.payment?.entity?.order_id ?? payload.order?.entity?.id;
    const errorDescription = payload.payment?.entity?.error_description ?? 'Payment failed';

    if (!razorpayOrderId) {
      throw new Error('handlePaymentFailed: missing razorpayOrderId in webhook payload');
    }

    const order = await this.ordersRepo.findByGatewayRef(razorpayOrderId);
    if (!order) {
      throw new Error(`handlePaymentFailed: Order not found for razorpayOrderId: ${razorpayOrderId}`);
    }

    // HARDENED (INV-31): MUST fetch payment BEFORE $transaction
    // Bug in earlier versions: payment variable used inside tx without being fetched
    const payment = await this.paymentRepo.findPendingByOrderId(order.id);
    if (!payment) {
      throw new Error(`handlePaymentFailed: No PENDING payment found for orderId: ${order.id}`);
    }

    // ── INVENTORY RELEASE — OUTSIDE $transaction (§7.3, sequential, idempotent) ──
    // HARDENED: Sequential for...of — never Promise.all (avoids DB contention storm, S4-W6)
    // ReleaseReason 'ORDER_CANCELLED' is used because PAYMENT_FAILED causes order cancellation
    const results = await this.inventoryService.releaseAllForOrder(
      order.id,
      'ORDER_CANCELLED', // HARDENED: valid ReleaseReason — PAYMENT_FAILED maps to ORDER_CANCELLED
      'SYSTEM',
    );

    const failed = results.filter((r) => !r.alreadyReleased && r.status !== 'RELEASED' && r.status !== 'EXPIRED' && r.status !== 'CANCELLED').length;
    const released = results.length - failed;

    if (failed > 0) {
      this.logger.error(
        { orderId: order.id, released, failed },
        'CRITICAL: Some inventory releases failed during payment failure compensation — manual intervention required',
      );
    }

    // ── $TRANSACTION: update payment + order + status history + EventOutbox ──
    await this.prisma.$transaction(async (tx) => {
      // Update payment status — payment fetched BEFORE tx (INV-31)
      await tx.payment.update({
        where: { id: payment.id }, // HARDENED (INV-31): payment.id from pre-tx fetch
        data: {
          status: 'FAILED',
          failedAt: new Date(),
          failureReason: errorDescription,
        },
      });

      // Update order to PAYMENT_FAILED — HARDENED (INV-23): set paymentFailedAt (dual authority)
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: 'PAYMENT_FAILED',
          paymentFailedAt: new Date(), // HARDENED (INV-23): DB timestamp = primary authority for retry window
        },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          statusFrom: 'PLACED',
          statusTo: 'PAYMENT_FAILED',
          actorId: 'SYSTEM',
          actorRole: 'SYSTEM' as any,
          reason: errorDescription,
          timestamp: new Date(),
          historyMonth: formatYearMonth(new Date()),
        },
      });

      const eventMonth = formatYearMonth(new Date());

      // ── HARDENED (INV-20): PaymentFailed event ──
      await tx.eventOutbox.create({
        data: {
          eventType: 'PaymentFailed',
          eventVersion: '1.0',     // MANDATORY (INV-20)
          schemaVersion: '4.3',    // MANDATORY (INV-20)
          payload: {
            orderId: order.id,
            paymentId: payment.id,
            reason: errorDescription,
            failedAt: new Date().toISOString(),
          },
          deduplicationKey: `payment-failed-${payment.id}`, // deterministic (INV-17)
          eventMonth,
          status: 'PENDING',
        },
      });
    }, { timeout: 10000, isolationLevel: 'ReadCommitted' });

    // ── SET RETRY WINDOW (secondary authority — INV-23) ──
    // HARDENED (INV-23): Redis is SECONDARY authority. DB paymentFailedAt is PRIMARY.
    // Redis eviction handled in PaymentRetryExpiryWorker (dual-authority check).
    await this.redis
      .set(`payment_retry_window:${order.id}`, new Date().toISOString(), 'EX', 1800)
      .catch((err) => {
        this.logger.warn({ orderId: order.id, err }, 'Failed to set payment_retry_window Redis key — DB paymentFailedAt is the primary authority (INV-23)');
      });

    this.logger.warn(
      { orderId: order.id, paymentId: payment.id, reason: errorDescription },
      'Payment failed — inventory released, order PAYMENT_FAILED, retry window set',
    );
    this.metrics.paymentFailedTotal.inc({ provider: 'RAZORPAY', reason: errorDescription });
  }
}
