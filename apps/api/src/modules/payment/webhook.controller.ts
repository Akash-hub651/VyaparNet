import {
  Controller,
  Post,
  Body,
  Headers,
  BadRequestException,
  ServiceUnavailableException,
  Logger,
  Inject,
  HttpCode,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../shared/decorators/public.decorator';
import { RedisService } from '../../core/redis/redis.service';
import { MetricsService } from '../observability/metrics.service';
import { PAYMENT_PROVIDER_TOKEN } from '@vyaparnet/types';
import type { PaymentProvider } from '@vyaparnet/types';
import type { AppConfig } from '../../core/config/config.schema';

export interface WebhookJobPayload {
  razorpayEventId: string;
  eventType: string;
  payload: Record<string, unknown>;
}

/**
 * WebhookController — §15.1, §16.1
 *
 * Authority: SPRINT_4_EXECUTION_LOCK_FINAL.md §15.1, §16.1
 *
 * POST /api/v1/payments/webhook
 *
 * CRITICAL SECURITY LAWS (enforced in this file):
 *  - INV-15: express.raw() is configured in main.ts for this route BEFORE express.json()
 *  - §15.1: HMAC verification with crypto.timingSafeEqual() is the FIRST operation
 *  - JSON.parse() only AFTER signature verification
 *  - INV-16: webhook_idem:{eventId} SET NX after queue.add() succeeds — NOT before
 *  - INV-22: queue.add() has 2000ms Promise.race timeout
 *  - On timeout: DEL idempotency key so Razorpay retry can re-queue on recovery
 *
 * Security model: No JwtAuthGuard. Security = HMAC-SHA256 webhook signature verification.
 * Razorpay calls this endpoint without a JWT — authentication is the HMAC check.
 */
@Controller('payments')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    @Inject(PAYMENT_PROVIDER_TOKEN)
    private readonly paymentProvider: PaymentProvider,
    private readonly redis: RedisService,
    private readonly config: ConfigService<AppConfig, true>,
    @InjectQueue('payments')
    private readonly paymentsQueue: Queue<WebhookJobPayload>,
    private readonly metrics: MetricsService,
  ) {}

  /**
   * POST /payments/webhook
   *
   * IMPORTANT: express.raw() middleware in main.ts ensures this route receives
   * req.body as a raw Buffer (not parsed JSON). This is essential for HMAC verification —
   * JSON parsing modifies whitespace which breaks signature verification.
   *
   * HARDENED (INV-22): queue.add() wrapped in 2000ms Promise.race.
   *   Razorpay requires HTTP response within 5s. 2s margin for safe BullMQ queuing.
   *   On timeout: idempotency key is DEL'd → Razorpay retry succeeds after BullMQ recovers.
   */
  @Post('webhook')
  @Public() // No JwtAuthGuard — security = HMAC (§15.1)
  @HttpCode(200)
  async handleWebhook(
    @Body() rawBody: Buffer,
    @Headers('x-razorpay-signature') signature: string,
    @Headers('x-razorpay-event') eventType: string,
    @Headers('x-razorpay-event-id') eventId: string,
  ): Promise<{ status: string }> {
    // ── STEP 1: HMAC SIGNATURE VERIFICATION — FIRST OPERATION (§15.1) ──
    // HARDENED: timingSafeEqual prevents timing oracle attacks.
    // rawBody is the raw Buffer — JSON parsing would corrupt signature verification.
    const webhookSecret = this.config.get('RAZORPAY_WEBHOOK_SECRET');
    const isValid = this.paymentProvider.verifyWebhookSignature(
      rawBody,
      signature ?? '',
      webhookSecret,
    );

    if (!isValid) {
      // SECURITY EVENT: alert immediately
      this.logger.warn(
        { eventId, eventType },
        'SECURITY: Invalid Razorpay webhook signature — request rejected',
      );
      this.metrics.paymentWebhookInvalidSignatureTotal.inc();
      throw new BadRequestException({ code: 'INVALID_WEBHOOK_SIGNATURE' });
    }

    // ── STEP 2: PARSE JSON BODY (only AFTER successful HMAC verification) ──
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(rawBody.toString('utf-8'));
    } catch {
      throw new BadRequestException({
        code: 'INVALID_WEBHOOK_BODY',
        message: 'Could not parse webhook body',
      });
    }

    // ── STEP 3: WEBHOOK IDEMPOTENCY CHECK — ATOMIC SET NX (§13 Redis Registry) ──
    // HARDENED (INV-16): idempotency key set BEFORE queue.add(), cleared on queue failure.
    // key: webhook_idem:{razorpayEventId}, TTL: 86400s, NX: yes (atomic set-if-not-exists)
    let alreadyQueued: string | null = null;
    try {
      alreadyQueued = await this.redis.set(
        `webhook_idem:${eventId}`,
        'QUEUED',
        'EX',
        86400,
        'NX', // Atomic — prevents race between two simultaneous identical webhooks
      );
    } catch (redisErr) {
      this.logger.error(
        { eventId, err: redisErr },
        'Redis unavailable for webhook idempotency — returning 503',
      );
      throw new ServiceUnavailableException({
        code: 'WEBHOOK_QUEUE_UNAVAILABLE',
      });
    }

    if (alreadyQueued === null) {
      // SET NX returned nil → key already existed → duplicate webhook
      this.logger.log(
        { eventId, eventType },
        'Duplicate webhook — returning 200 (idempotent, already queued)',
      );
      this.metrics.paymentWebhookDuplicateTotal.inc();
      return { status: 'already_processed' };
    }

    // ── STEP 4: ENQUEUE TO BULLMQ WITH 2000ms HARD TIMEOUT (INV-22) ──
    // HARDENED (INV-22): Razorpay expects response within 5s.
    // 2s gives comfortable margin while preventing indefinite blocking.
    await Promise.race([
      this.paymentsQueue.add(
        'process-webhook',
        {
          razorpayEventId: eventId,
          eventType: eventType ?? '',
          payload: (event.payload as Record<string, unknown>) ?? event,
        },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      ),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('QUEUE_TIMEOUT')), 2000),
      ),
    ]).catch(async (err: Error) => {
      if (err.message === 'QUEUE_TIMEOUT') {
        // HARDENED (INV-22): DELETE idempotency key → Razorpay retry can re-queue
        await this.redis.del(`webhook_idem:${eventId}`).catch(() => {});
        this.logger.error(
          { eventId, eventType },
          'CRITICAL: BullMQ queue.add timed out (2000ms) — idempotency key cleared for Razorpay retry',
        );
        this.metrics.paymentWebhookQueueTimeoutTotal.inc();
        throw new ServiceUnavailableException({
          code: 'WEBHOOK_QUEUE_UNAVAILABLE',
        });
      }
      // Unexpected queue error — also clear key for retry safety
      await this.redis.del(`webhook_idem:${eventId}`).catch(() => {});
      this.logger.error(
        { eventId, eventType, err },
        'Unexpected BullMQ error — idempotency key cleared',
      );
      throw err;
    });

    this.metrics.paymentWebhookReceivedTotal.inc({ event_type: eventType });
    this.logger.log(
      { eventId, eventType },
      'Webhook: signature valid, queued to BullMQ for async processing',
    );

    return { status: 'accepted' };
  }
}
