import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { NotificationJob, INotificationChannel } from './channel.interface';
import { CircuitBreakerService } from '../services/circuit-breaker.service';
import { NotificationMetricsService } from '../services/notification-metrics.service';

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface IEmailService {
  send(to: string, subject: string, htmlBody: string): Promise<EmailResult>;
}

export const EMAIL_SERVICE = Symbol('EMAIL_SERVICE');

/**
 * ResendEmailService — implements IEmailService for Resend API.
 * Follows Phase 5 specification. Error responses are mapped to EmailResult.
 */
@Injectable()
export class ResendEmailService implements IEmailService {
  private readonly resend: Resend;
  private readonly fromAddress: string;

  constructor(config: ConfigService) {
    this.resend = new Resend(config.get('RESEND_API_KEY'));
    this.fromAddress =
      config.get('EMAIL_FROM_ADDRESS') || 'noreply@vyaparnet.com';
  }

  async send(
    to: string,
    subject: string,
    htmlBody: string,
  ): Promise<EmailResult> {
    try {
      const { data, error } = await this.resend.emails.send({
        from: this.fromAddress,
        to: [to],
        subject,
        html: htmlBody,
      });
      if (error) return { success: false, error: error.message };
      return { success: true, messageId: data?.id };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}

// INV-S6-23: HTML-entity-escape all user-controlled variables before HTML injection
// TemplateService.sanitize() strips dangerous chars for SMS/plain-text context.
// htmlEscape() is a SEPARATE function for HTML context — applied to title, body, CTA text.
export function htmlEscape(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// Template renders to HTML with VyaparNet branding
// Mobile-first, Hinglish subject, plain text fallback
export function buildEmailHtml(
  title: string,
  body: string,
  ctaUrl?: string,
  ctaText?: string,
): string {
  // INV-S6-23: Escape ALL user-controlled values before injection into HTML
  const safeTitle = htmlEscape(title);
  const safeBody = htmlEscape(body);
  // ctaUrl: validate against allowlist of internal paths (not injected from user input directly)
  // ctaText: escape if user-provided
  const safeCtaText = ctaText ? htmlEscape(ctaText) : 'View Details';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle}</title>
</head>
<body style="font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden;">
    <div style="background: #6C3CF7; padding: 20px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 24px;">VyaparNet</h1>
    </div>
    <div style="padding: 24px;">
      <h2 style="color: #1a1a1a; margin-bottom: 12px;">${safeTitle}</h2>
      <p style="color: #555; line-height: 1.6;">${safeBody}</p>
      ${ctaUrl ? `<a href="${ctaUrl}" style="display:inline-block;background:#6C3CF7;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;margin-top:16px;">${safeCtaText}</a>` : ''}
    </div>
    <div style="padding: 16px 24px; border-top: 1px solid #eee; font-size: 12px; color: #999;">
      <p>VyaparNet &mdash; Aapka B2B Marketplace</p>
      <p><!-- Unsubscribe: use notification preferences at /notifications/preferences --></p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * EmailChannel — implements INotificationChannel for email delivery.
 *
 * GOVERNANCE:
 * - INV-S6-16: null email = skip + warn, never throw
 * - INV-S6-21: CircuitBreakerService MUST wrap delivery attempt
 * - INV-S6-23: htmlEscape() MUST be applied via buildEmailHtml()
 */
@Injectable()
export class EmailChannel implements INotificationChannel {
  name = 'email' as const;
  private readonly logger = new Logger(EmailChannel.name);

  constructor(
    @Inject(EMAIL_SERVICE) private readonly emailService: IEmailService,
    private readonly circuitBreakerService: CircuitBreakerService,
    private readonly metrics: NotificationMetricsService,
  ) {}

  async send(job: NotificationJob): Promise<void> {
    if (!job.email) {
      // INV-S6-16: null email = skip + warn, never throw
      this.logger.warn({ userId: job.userId }, 'EMAIL_SKIPPED_NO_EMAIL');
      return;
    }

    // INV-S6-21: Circuit Breaker wrapping
    if (await this.circuitBreakerService.isOpen('email')) {
      this.logger.warn(
        { userId: job.userId },
        'CIRCUIT_BREAKER_OPEN_EMAIL_SKIPPED',
      );
      this.metrics.notificationFailedTotal.inc({
        channel: 'email',
        reason: 'circuit_open',
        eventType: job.eventType ?? 'unknown',
      });
      return; // Do NOT throw. Do NOT trigger retry. Silent skip.
    }

    // Pre-process HTML — htmlEscape is done inside buildEmailHtml
    const htmlBody = buildEmailHtml(
      job.title,
      job.body,
      job.variables?.ctaUrl,
      job.variables?.ctaText,
    );

    try {
      const result = await this.emailService.send(
        job.email,
        job.title,
        htmlBody,
      );
      if (!result.success) {
        // FIX-2: Do NOT call recordFailure() here — the catch block below already does.
        // Calling it twice halved the effective circuit threshold (3 calls instead of 5).
        throw new Error(`Email delivery failed: ${result.error}`);
      }
      await this.circuitBreakerService.recordSuccess('email');
      this.metrics.notificationSentTotal.inc({
        channel: 'email',
        eventType: job.eventType ?? 'unknown',
        segment: job.segment ?? 'default',
      });
    } catch (err) {
      // FIX-2: Single recordFailure() — always increments exactly once per failed attempt
      await this.circuitBreakerService.recordFailure('email');
      throw err; // Re-throw for BullMQ retry
    }
  }
}
