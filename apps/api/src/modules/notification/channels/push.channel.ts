import { Injectable, Logger } from '@nestjs/common';
import { NotificationJob, INotificationChannel } from './channel.interface';
import { WebPushService } from '../services/web-push.service';
import { NotificationMetricsService } from '../services/notification-metrics.service';

/**
 * PushChannel — implements INotificationChannel for Web Push delivery.
 *
 * GOVERNANCE:
 * - Push is best-effort. It MUST NOT throw errors up to BullMQ.
 * - Errors are caught, logged, and swallowed to prevent retry storms.
 */
@Injectable()
export class PushChannel implements INotificationChannel {
  name = 'push' as const;
  private readonly logger = new Logger(PushChannel.name);

  constructor(
    private readonly webPushService: WebPushService,
    private readonly metrics: NotificationMetricsService,
  ) {}

  async send(job: NotificationJob): Promise<void> {
    try {
      // url mapping assumes it's provided in variables.ctaUrl if present
      const url = job.variables?.ctaUrl;

      await this.webPushService.sendToUser(
        job.userId,
        job.title,
        job.body,
        url,
      );

      if (this.metrics.notificationSentTotal) {
        this.metrics.notificationSentTotal.inc({
          channel: 'push',
          eventType: job.eventType ?? 'unknown',
          segment: job.segment ?? 'default',
        });
      }
    } catch (err) {
      // Catch and swallow all errors for Push Channel (best-effort)
      this.logger.warn(
        {
          userId: job.userId,
          error: err instanceof Error ? err.message : String(err),
        },
        'PUSH_CHANNEL_FAILED',
      );

      if (this.metrics.notificationFailedTotal) {
        this.metrics.notificationFailedTotal.inc({
          channel: 'push',
          reason: 'delivery_error',
          eventType: job.eventType ?? 'unknown',
        });
      }
    }
  }
}
