import { Injectable, Logger } from '@nestjs/common';
import { Process, Processor, OnQueueFailed } from '@nestjs/bull';
import { Job } from 'bull';
import { SmsChannel } from '../channels/sms.channel';
import { EmailChannel } from '../channels/email.channel';
import { WebPushService } from '../services/web-push.service';
import { NotificationMetricsService } from '../services/notification-metrics.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type { NotificationJob } from '../channels/channel.interface';

/**
 * NotificationWorker — BullMQ processor for the 'notifications' queue.
 *
 * GOVERNANCE:
 * - INV-S6-8: Each job name = one channel. SMS failure ≠ Email blocked.
 * - Push delivery: MUST catch all errors, log as WARN, NOT rethrow. (INV-S6-best-effort)
 *   Push is best-effort — no retry, no DLQ entry.
 * - SMS/Email: errors ARE thrown so BullMQ can retry (3 attempts, fixed 5s backoff).
 * - DLQ: after 3 failed attempts, BullMQ auto-moves job to 'notifications-failed'
 *   queue (AF-3: LOCKED queue name — never 'dead-letter' or any other name).
 * - @OnQueueFailed(): ONLY logs + increments DLQ metric. NEVER rethrows.
 */
@Processor('notifications')
@Injectable()
export class NotificationWorker {
  private readonly logger = new Logger(NotificationWorker.name);

  constructor(
    private readonly smsChannel: SmsChannel,
    private readonly emailChannel: EmailChannel,
    private readonly webPushService: WebPushService,
    private readonly metrics: NotificationMetricsService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * SMS delivery processor — 5 concurrent workers.
   * Errors are thrown → BullMQ retries (3 attempts, fixed 5s backoff).
   * On exhaustion → job moves to 'notifications-failed' DLQ.
   */
  @Process({ name: 'deliver-sms', concurrency: 5 })
  async deliverSms(job: Job<NotificationJob>): Promise<void> {
    await this.deliverWithMetrics('sms', job.data, () =>
      this.smsChannel.send(job.data),
    );
  }

  /**
   * Email delivery processor — 3 concurrent workers.
   * Errors are thrown → BullMQ retries (3 attempts, fixed 5s backoff).
   * On exhaustion → job moves to 'notifications-failed' DLQ.
   */
  @Process({ name: 'deliver-email', concurrency: 3 })
  async deliverEmail(job: Job<NotificationJob>): Promise<void> {
    await this.deliverWithMetrics('email', job.data, () =>
      this.emailChannel.send(job.data),
    );
  }

  /**
   * Push delivery processor — 5 concurrent workers.
   *
   * GOVERNANCE — FOOTGUN-10-A AVOIDANCE:
   * Push is BEST-EFFORT. Errors MUST be swallowed (logged as WARN only).
   * NEVER rethrow here — that would trigger BullMQ retry and potentially DLQ,
   * bloating the DLQ with un-actionable push failures.
   * Push: 1 attempt max; no DLQ entry.
   */
  @Process({ name: 'deliver-push', concurrency: 5 })
  async deliverPush(job: Job<NotificationJob>): Promise<void> {
    try {
      await this.webPushService.sendToUser(
        job.data.userId,
        job.data.title,
        job.data.body,
      );
      this.metrics.notificationSentTotal.inc({
        channel: 'push',
        eventType: job.data.eventType ?? 'unknown',
      });
      // Update status to SENT on successful push delivery
      if (job.data.notificationId) {
        await this.prisma.notification.update({
          where: { id: job.data.notificationId },
          data: { status: 'SENT' }, // NotificationDeliveryStatus.SENT
        }).catch(() => {}); // fire and forget
      }
    } catch (err) {
      // FOOTGUN-10-A avoidance: Push = best-effort. Log WARN, do NOT rethrow.
      // Rethrowing = BullMQ retry = eventual DLQ = DLQ bloat with un-actionable failures.
      this.logger.warn(
        { error: (err as Error).message },
        'PUSH_DELIVERY_FAILED_SILENCED',
      );
      this.metrics.notificationFailedTotal.inc({
        channel: 'push',
        reason: 'delivery_error',
        eventType: job.data.eventType ?? 'unknown',
      });
    }
  }

  /**
   * Job failed event handler — called by BullMQ after ALL retry attempts are exhausted.
   *
   * GOVERNANCE — FOOTGUN-10-B AVOIDANCE:
   * MUST NOT rethrow. This handler is observability-only:
   *   1. Log structured error
   *   2. Increment DLQ metric
   * BullMQ auto-moves the job to 'notifications-failed' queue — no manual action needed.
   */
  @OnQueueFailed()
  async onJobFailed(job: Job<NotificationJob>, err: Error): Promise<void> {
    this.logger.error(
      {
        jobId: job.id,
        channel: job.data?.channel,
        userId: job.data?.userId,
        eventType: job.data?.eventType,
        attempt: job.attemptsMade,
        error: err.message,
      },
      'NOTIFICATION_JOB_FAILED',
    );

    // INV-S6-21: after 3 attempts the job lands in DLQ — track size
    if (job.attemptsMade >= 3) {
      this.metrics.notificationDlqSize.inc();
      this.logger.error(
        { jobId: job.id, channel: job.data?.channel },
        'NOTIFICATION_DLQ',
      );
      
      // Update status to FAILED on DLQ placement
      if (job.data?.notificationId) {
        this.prisma.notification.update({
          where: { id: job.data.notificationId },
          data: { status: 'FAILED' }, // NotificationDeliveryStatus.FAILED
        }).catch((e) => {
          this.logger.error('Failed to mark Notification FAILED on DLQ', e);
        });
      }
    }
  }

  /**
   * Wraps channel delivery with Prometheus metrics instrumentation.
   *
   * - On success: increments notificationSentTotal
   * - On failure: increments notificationFailedTotal, RETHROWS for BullMQ retry
   * - Always: observes notificationOutboxToDeliveryMs latency
   *
   * NOTE: Re-throw is INTENTIONAL for SMS/Email. BullMQ needs the throw to trigger retry.
   * Push delivery does NOT use this method (see deliverPush).
   */
  private async deliverWithMetrics(
    channel: string,
    data: NotificationJob,
    deliverFn: () => Promise<void>,
  ): Promise<void> {
    const start = Date.now();
    try {
      await deliverFn();
      this.metrics.notificationSentTotal.inc({
        channel,
        eventType: data.eventType ?? 'unknown',
        segment: data.segment,
      });
      // Update status to SENT on successful delivery
      if (data.notificationId) {
        await this.prisma.notification.update({
          where: { id: data.notificationId },
          data: { status: 'SENT' }, // NotificationDeliveryStatus.SENT
        }).catch(() => {});
      }
    } catch (err) {
      this.metrics.notificationFailedTotal.inc({
        channel,
        reason: 'provider_error',
        eventType: data.eventType ?? 'unknown',
      });
      throw err; // Re-throw for BullMQ retry (intentional — INV-S6-21)
    } finally {
      // Always observe latency, even on failure (for P99 alerting)
      this.metrics.notificationOutboxToDeliveryMs.observe(Date.now() - start);
    }
  }
}
