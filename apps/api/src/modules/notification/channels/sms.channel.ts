import { Injectable, Logger, Inject } from '@nestjs/common';
import { NotificationJob, INotificationChannel } from './channel.interface';
import { CircuitBreakerService } from '../services/circuit-breaker.service';
import { NotificationMetricsService } from '../services/notification-metrics.service';
import {
  SMS_SERVICE,
  SmsService,
} from '../../identity/auth/sms.service.interface';

// §17.3 SMS body constraints
const SMS_BODY_MAX_CHARS = 160;

/**
 * Validates and sanitizes the SMS body according to §17.3 rules.
 *
 * - Strips HTML tags
 * - Replaces newlines with spaces
 * - Checks for unreplaced template variables
 * - Truncates at 155 chars + "..." if needed
 */
export function sanitizeSmsBody(body: string): string {
  // Replace newlines with spaces
  let sanitized = body.replace(/\n/g, ' ');

  // Strip HTML tags (simple regex for MVP, sufficient for our known templates)
  sanitized = sanitized.replace(/<[^>]*>?/gm, '');

  // Ensure no unreplaced variables (e.g., {{variableName}})
  if (/\{\{[^}]+\}\}/.test(sanitized)) {
    // We replace them with an empty string or generic text to prevent sending literal '{{val}}'
    sanitized = sanitized.replace(/\{\{[^}]+\}\}/g, '');
  }

  // Trim excess spaces
  sanitized = sanitized.replace(/\s+/g, ' ').trim();

  // Truncate at 155 chars + "..." if needed
  if (sanitized.length > SMS_BODY_MAX_CHARS) {
    sanitized = sanitized.substring(0, SMS_BODY_MAX_CHARS - 3) + '...';
  }

  return sanitized;
}

/**
 * SmsChannel — implements INotificationChannel for SMS delivery.
 *
 * GOVERNANCE:
 * - INV-S6-16: null phone = skip + warn, never throw
 * - INV-S6-21: CircuitBreakerService MUST wrap delivery attempt
 */
@Injectable()
export class SmsChannel implements INotificationChannel {
  name = 'sms' as const;
  private readonly logger = new Logger(SmsChannel.name);

  constructor(
    @Inject(SMS_SERVICE) private readonly smsService: SmsService,
    private readonly circuitBreakerService: CircuitBreakerService,
    private readonly metrics: NotificationMetricsService,
  ) {}

  async send(job: NotificationJob): Promise<void> {
    if (!job.phone) {
      // INV-S6-16: null phone = skip + warn, never throw
      this.logger.warn({ userId: job.userId }, 'SMS_SKIPPED_NO_PHONE');
      return;
    }

    // Circuit Breaker integration (INV-S6-21)
    if (await this.circuitBreakerService.isOpen('sms')) {
      this.logger.warn(
        { userId: job.userId },
        'CIRCUIT_BREAKER_OPEN_SMS_SKIPPED',
      );
      if (this.metrics.notificationFailedTotal) {
        this.metrics.notificationFailedTotal.inc({
          channel: 'sms',
          reason: 'circuit_open',
          eventType: job.eventType ?? 'unknown',
        });
      }
      return; // Do NOT throw. Do NOT trigger retry. Silent skip.
    }

    // Apply strict sanitization per §17.3
    const safeBody = sanitizeSmsBody(job.body);

    try {
      const result = await this.smsService.sendTransactional(
        job.phone,
        safeBody,
      );
      if (!result.success) {
        // FIX-1: Do NOT call recordFailure() here — the catch block below already does.
        // Calling it twice halved the effective circuit threshold (3 calls instead of 5).
        throw new Error(`SMS delivery failed: ${result.error}`);
      }
      await this.circuitBreakerService.recordSuccess('sms');

      if (this.metrics.notificationSentTotal) {
        this.metrics.notificationSentTotal.inc({
          channel: 'sms',
          eventType: job.eventType ?? 'unknown',
          segment: job.segment ?? 'default',
        });
      }
    } catch (err) {
      // FIX-1: Single recordFailure() — always increments exactly once per failed attempt
      await this.circuitBreakerService.recordFailure('sms');
      throw err; // Re-throw for BullMQ retry (intentional)
    }
  }
}
