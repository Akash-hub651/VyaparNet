import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { z } from 'zod';
import { EventStatus } from '@vyaparnet/database';
import {
  OrderCreatedPayloadSchema,
  OrderStatusChangedPayloadSchema,
  PaymentReceivedPayloadSchema,
  PaymentFailedPayloadSchema,
  SupplierScoreUpdatedPayloadSchema,
  StockLowPayloadSchema,
} from '@vyaparnet/types';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { RedisService } from '../../../core/redis/redis.service';
import { NotificationService } from '../services/notification.service';
import { UserContactService } from '../services/user-contact.service';
import { DeduplicationService } from '../services/deduplication.service';
import { NotificationPreferenceService } from '../services/notification-preference.service';
import { NotificationMetricsService } from '../services/notification-metrics.service';
import { OUTBOX_EVENT_NOTIFICATION_MAP } from '../constants/outbox-event-map.constant';
import type { HandlerContext } from '../channels/channel.interface';

/** Shape of rows returned from EventOutbox query (minimal select) */
interface OutboxEventRow {
  id: string;
  eventType: string;
  payload: unknown;
  schemaVersion: string;
  createdAt: Date;
}

/**
 * OutboxConsumerWorker — polls EventOutbox every 5 seconds and routes events
 * to notification handlers.
 *
 * GOVERNANCE:
 * - INV-S6-1: PURE CONSUMER. This worker NEVER writes to EventOutbox. Only reads + status updates.
 * - INV-S6-2: EventOutbox marked COMPLETED only AFTER handler + BullMQ enqueue succeeds.
 * - INV-S6-3: All payloads validated via safeParse() BEFORE any handler is called.
 * - INV-S6-17: Redis lock + idempotency key prevent duplicate processing on concurrent pods.
 * - INV-S6-26: isPolling guard prevents overlap. Reset in FINALLY block — never only catch.
 * - INV-S6-27: validatePayload() returns { success: false } for unknown event types.
 *
 * Pattern: setInterval (every 5000ms) — consistent with EventOutboxProcessor and search-reindex.worker.ts
 * NOTE: @nestjs/schedule is NOT used — project uses setInterval/OnModuleInit pattern.
 *
 * Processing sequence (MUST maintain this order):
 *   STEP 1: Acquire Redis lock (NX, TTL=30s) — prevent concurrent pod processing
 *   STEP 2: Idempotency check — skip if already processed
 *   STEP 3: Get handler from OUTBOX_EVENT_NOTIFICATION_MAP — skip unknown eventTypes
 *   STEP 4: Validate payload via safeParse() — mark FAILED on invalid
 *   STEP 5: Route to handler (handler does enqueue + dedup)
 *   STEP 6: Mark COMPLETED + set idempotency key (ONLY after success — INV-S6-2)
 */
@Injectable()
export class OutboxConsumerWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxConsumerWorker.name);
  /** INV-S6-26: Cron overlap guard — reset in finally, NEVER only in catch */
  private isPolling = false;
  /** setInterval timer handle for graceful shutdown */
  private timer!: NodeJS.Timeout;
  /**
   * FIX-5/FIX-7: Poll iteration counter.
   * - notification_queue_depth observed every poll (every 5s, cheap Redis call).
   * - notification_push_subscriptions_active observed every 12th poll (~60s, DB aggregate).
   */
  private pollCount = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @InjectQueue('notifications') private readonly notificationsQueue: Queue,
    private readonly notificationService: NotificationService,
    private readonly userContactService: UserContactService,
    private readonly deduplicationService: DeduplicationService,
    private readonly notificationPreferenceService: NotificationPreferenceService,
    private readonly metrics: NotificationMetricsService,
  ) {}

  /** Start polling on module init — every 5 seconds (matching EventOutboxProcessor pattern) */
  onModuleInit(): void {
    this.logger.log(
      'Starting NotificationOutboxConsumerWorker (5s interval)...',
    );
    this.timer = setInterval(() => void this.pollEventOutbox(), 5000);
  }

  /** Graceful shutdown — clears interval to prevent memory leak on app destroy */
  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.logger.log('NotificationOutboxConsumerWorker stopped.');
    }
  }

  /**
   * pollEventOutbox — called every 5 seconds by setInterval.
   *
   * INV-S6-26: isPolling guard prevents overlap when a poll takes > 5 seconds.
   * FOOTGUN-3-G avoidance: isPolling = false in FINALLY block, not just catch.
   */
  async pollEventOutbox(): Promise<void> {
    // INV-S6-26: Skip if previous poll still running
    if (this.isPolling) {
      this.logger.debug('OUTBOX_POLL_SKIPPED_OVERLAP');
      return;
    }

    this.isPolling = true;
    this.pollCount++;
    try {
      const events = await this.fetchPendingEvents();
      if (events.length === 0) return;

      this.logger.debug({ count: events.length }, 'OUTBOX_POLL_BATCH');

      // FIX-5: Observe notification_queue_depth on every poll (BullMQ waiting jobs).
      // getJobCounts() is a Redis call — lightweight, safe every 5s.
      await this.observeQueueDepth();

      // FIX-7: Observe notification_push_subscriptions_active every 12th poll (~60s).
      // DB aggregate is more expensive — rate-limited to avoid unnecessary DB load.
      if (this.pollCount % 12 === 0) {
        await this.observePushSubscriptionCount();
      }

      // FOOTGUN-3-E avoidance: each event in its own try/catch inside processEvent()
      for (const event of events) {
        await this.processEvent(event);
      }
    } finally {
      // INV-S6-26: ALWAYS release in finally — even if unexpected exception occurs
      // FOOTGUN-3-G avoidance: NOT in catch only
      this.isPolling = false;
    }
  }

  /**
   * processEvent — full 6-step processing sequence for a single EventOutbox row.
   */
  private async processEvent(event: OutboxEventRow): Promise<void> {
    const { id: eventId, eventType } = event;

    // STEP 1: Acquire Redis lock to prevent concurrent pod processing (INV-S6-17)
    let lockAcquired: string | null = null;
    try {
      lockAcquired = await this.redis.set(
        `outbox-consumer-lock:${eventId}`,
        '1',
        'EX',
        30, // 30s TTL — long enough for processing, short enough to self-heal
        'NX',
      );
    } catch {
      // Redis failure: skip this event — next poll will retry
      this.logger.warn({ eventId }, 'OUTBOX_LOCK_REDIS_UNAVAILABLE');
      return;
    }

    if (!lockAcquired) {
      this.logger.debug({ eventId }, 'OUTBOX_LOCK_NOT_ACQUIRED');
      return; // Another pod holds the lock
    }

    try {
      // STEP 2: Idempotency check (INV-S6-17)
      let alreadyProcessed = false;
      try {
        const exists = await this.redis.exists(`outbox-processed:${eventId}`);
        alreadyProcessed = exists === 1;
      } catch {
        // Redis failure: assume NOT processed — safe degraded mode
        this.logger.warn({ eventId }, 'OUTBOX_IDEMPOTENCY_REDIS_UNAVAILABLE');
      }

      if (alreadyProcessed) {
        await this.markEventCompleted(eventId);
        return;
      }

      // STEP 3: Get handler (INV-S6-12: Record lookup, not switch/case)
      const handler = OUTBOX_EVENT_NOTIFICATION_MAP[eventType];
      if (!handler) {
        // INV-S6-13: OrderConfirmed, OrderCancelled NOT in map — silently skipped
        // FOOTGUN-3-A avoidance: no OrderConfirmed handler registered
        this.logger.warn({ eventId, eventType }, 'OUTBOX_NO_HANDLER');
        await this.markEventCompleted(eventId);
        return;
      }

      // STEP 4: Validate payload (INV-S6-3: safeParse, NEVER parse)
      const payloadResult = this.validatePayload(eventType, event.payload);
      if (!payloadResult.success) {
        this.logger.error(
          {
            eventId,
            eventType,
            errors: payloadResult.error?.issues ?? payloadResult.error,
          },
          'OUTBOX_PAYLOAD_INVALID',
        );
        await this.markEventFailed(eventId, 'INVALID_PAYLOAD');
        this.metrics.notificationOutboxFailedTotal.inc({
          reason: 'invalid_payload',
        });
        return;
      }

      // STEP 5: Route to handler
      await handler(payloadResult.data, this.buildContext());
      this.metrics.notificationOutboxConsumedTotal.inc({ eventType });

      // STEP 6 — ONLY AFTER SUCCESS: Mark completed + set idempotency key (INV-S6-2)
      // FOOTGUN-3-C avoidance: COMPLETED is set HERE, not before handler runs
      await Promise.all([
        this.markEventCompleted(eventId),
        this.safeSetIdempotencyKey(eventId),
      ]);
    } catch (err) {
      // FOOTGUN-3-E: error logged + event marked failed — does NOT rethrow
      this.logger.error(
        { eventId, eventType, error: (err as Error).message },
        'OUTBOX_PROCESS_ERROR',
      );
      await this.markEventFailed(eventId, (err as Error).message);
    }
  }

  /**
   * validatePayload — validates EventOutbox payload against the correct Zod schema.
   *
   * INV-S6-3: Uses safeParse() — NEVER parse().
   * INV-S6-27: Unknown eventType (no schema) → { success: false }.
   */
  private validatePayload(
    eventType: string,
    payload: unknown,
    // IMPROVEMENT: Zod v4 uses SafeParseResult (util type), not SafeParseReturnType.
    // ReturnType<...> inferred from schema.safeParse makes this version-agnostic.
  ): ReturnType<z.ZodTypeAny['safeParse']> {
    const schemaMap: Record<string, z.ZodTypeAny> = {
      OrderCreated: OrderCreatedPayloadSchema,
      OrderStatusChanged: OrderStatusChangedPayloadSchema,
      PaymentReceived: PaymentReceivedPayloadSchema,
      PaymentFailed: PaymentFailedPayloadSchema,
      SupplierScoreUpdated: SupplierScoreUpdatedPayloadSchema,
      StockLow: StockLowPayloadSchema,
    };

    const schema = schemaMap[eventType];
    // INV-S6-27: Unknown eventType → always fail. STEP 3 already guards this — defense in depth.
    if (!schema) {
      // IMPROVEMENT: Avoid ZodError constructor (API changed in Zod v4).
      // Double-cast via unknown to satisfy type system while returning failure shape.
      const failureResult = {
        success: false as const,
        error: new z.ZodError([
          {
            code: 'custom',
            path: [],
            message: `No schema registered for eventType: ${eventType}`,
          },
        ]),
      };
      return failureResult;
    }

    return schema.safeParse(payload);
  }

  /** Build HandlerContext from injected services */
  private buildContext(): HandlerContext {
    return {
      notificationService: this.notificationService,
      userContactService: this.userContactService,
      deduplicationService: this.deduplicationService,
      preferenceService: this.notificationPreferenceService,
      notificationsQueue: this.notificationsQueue,
      metrics: this.metrics,
      logger: this.logger,
    };
  }

  /**
   * fetchPendingEvents — FIFO batch of EventOutbox rows for notification eventTypes only.
   * Batch cap: 50 — prevents memory pressure at high event volumes.
   */
  private async fetchPendingEvents(): Promise<OutboxEventRow[]> {
    return this.prisma.eventOutbox.findMany({
      where: {
        status: EventStatus.PENDING,
        eventType: { in: Object.keys(OUTBOX_EVENT_NOTIFICATION_MAP) },
      },
      orderBy: { createdAt: 'asc' }, // FIFO
      take: 50,
      select: {
        id: true,
        eventType: true,
        payload: true,
        schemaVersion: true,
        createdAt: true,
      },
    });
  }

  /** Mark COMPLETED — only called after handler succeeds (INV-S6-2) */
  private async markEventCompleted(eventId: string): Promise<void> {
    await this.prisma.eventOutbox.update({
      where: { id: eventId },
      data: { status: EventStatus.COMPLETED, processedAt: new Date() },
    });
  }

  /** Mark FAILED — called on invalid payload or handler exception */
  private async markEventFailed(eventId: string, error: string): Promise<void> {
    await this.prisma.eventOutbox.update({
      where: { id: eventId },
      data: {
        status: EventStatus.FAILED,
        lastError: error.slice(0, 500),
      },
    });
  }

  /** Set Redis idempotency key (24h TTL) — swallow Redis failures */
  private async safeSetIdempotencyKey(eventId: string): Promise<void> {
    try {
      await this.redis.set(`outbox-processed:${eventId}`, '1', 'EX', 86400);
    } catch {
      this.logger.warn({ eventId }, 'OUTBOX_IDEMPOTENCY_KEY_SET_FAILED');
    }
  }

  /**
   * FIX-5: Observe notification_queue_depth gauge.
   * Uses BullMQ getJobCounts() — returns waiting + active job counts from Redis.
   * Swallows errors so a BullMQ unavailability never crashes the poll cycle.
   */
  private async observeQueueDepth(): Promise<void> {
    try {
      const counts = await this.notificationsQueue.getJobCounts();
      const depth = (counts.waiting ?? 0) + (counts.active ?? 0);
      this.metrics.notificationQueueDepth.set(depth);
    } catch {
      // Swallow — metrics failure must NEVER interrupt event processing
    }
  }

  /**
   * FIX-7: Observe notification_push_subscriptions_active gauge.
   * Uses Prisma aggregate count over PushSubscription table — rate-limited to every ~60s
   * via the pollCount modulo check in pollEventOutbox().
   * Swallows errors so a DB issue never crashes the poll cycle.
   */
  private async observePushSubscriptionCount(): Promise<void> {
    try {
      const count = await this.prisma.pushSubscription.count({
        where: { isActive: true },
      });
      this.metrics.notificationPushSubscriptionsActive.set(count);
    } catch {
      // Swallow — metrics failure must NEVER interrupt event processing
    }
  }
}
