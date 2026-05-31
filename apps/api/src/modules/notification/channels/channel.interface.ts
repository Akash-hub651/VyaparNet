import type { Queue } from 'bull';
import type { Logger } from '@nestjs/common';
import type { NotificationService } from '../services/notification.service';
import type { UserContactService } from '../services/user-contact.service';
import type { DeduplicationService } from '../services/deduplication.service';
import type { NotificationPreferenceService } from '../services/notification-preference.service';
import type { NotificationMetricsService } from '../services/notification-metrics.service';

// ─── NotificationJob (§5.3 Job Schema) ───────────────────────────────────────

/**
 * NotificationJob — the BullMQ job payload for the 'notifications' queue.
 *
 * AF-2 Audit Fix: `title`, `body`, `eventType`, `segment` are MANDATORY fields.
 * - title + body: pre-rendered at enqueue time so retries do NOT re-render
 *   (TemplateService is not called again per retry — saves DB reads).
 * - eventType + segment: required for Prometheus metric labels.
 * - phone/email: resolved ONCE at enqueue time — no extra DB lookup per retry.
 *
 * SECURITY (INV-S6-7): Buyer PII must NEVER appear in seller-facing job payloads.
 */
export interface NotificationJob {
  /** Delivery channel for this job */
  channel: 'sms' | 'email' | 'push';
  /** Target user ID */
  userId: string;
  /** DB Notification record ID — created before job enqueue */
  notificationId: string;
  /** Template name used for rendering (for audit/retry context) */
  templateName: string;
  /** Pre-rendered variables (sanitized by TemplateService before enqueue) */
  variables: Record<string, string>;
  /** Pre-rendered title — resolved at enqueue, not per-retry */
  title: string;
  /** Pre-rendered body — resolved at enqueue, not per-retry */
  body: string;
  /** Event type — required for metrics labels: notification_sent_total{eventType} */
  eventType: string;
  /** Segment — optional, for metrics labels: notification_sent_total{segment} */
  segment?: string;
  /** Pre-resolved phone number (SMS channel only) */
  phone?: string;
  /** Pre-resolved email address (Email channel only) */
  email?: string;
  // Push: no endpoint — WebPushService queries all active subscriptions for userId at delivery
}

// ─── Channel Interface (§14.1) ───────────────────────────────────────────────

/**
 * INotificationChannel — abstraction for all delivery channel implementations.
 *
 * Each channel is an INDEPENDENT unit (INV-S6-8):
 * - SMS failure MUST NOT block Email delivery
 * - Email failure MUST NOT block Push delivery
 * Each channel produces a separate BullMQ job.
 */
export interface INotificationChannel {
  name: 'sms' | 'email' | 'push';
  send(job: NotificationJob): Promise<void>;
}

// ─── UserContact — resolved once per event (never per channel) ───────────────

/**
 * UserContact — resolved ONCE per event in the handler, passed to createAndEnqueue.
 * Prevents N+1 DB reads when one event triggers multiple channel jobs.
 *
 * INV-S6-7: Buyer's phone/email MUST NOT appear in seller-facing notification paths.
 * INV-S6-16: null phone/email → skip + warn. Never throw.
 */
export interface UserContact {
  userId: string;
  phone: string | null;
  email: string | null;
  name: string | null;
  /** 'hi' | 'en' — determines template language selection */
  language: 'hi' | 'en';
}

// ─── HandlerContext — injected into every event handler ──────────────────────

/**
 * HandlerContext — services injected into event handlers via OutboxConsumerWorker.
 *
 * Handlers are pure functions (not NestJS providers) — they receive context instead
 * of using DI. This makes them easily unit-testable and prevents import coupling.
 *
 * INV-S6-1: context MUST NOT include any method that writes to EventOutbox.
 */
export interface HandlerContext {
  notificationService: NotificationService;
  userContactService: UserContactService;
  deduplicationService: DeduplicationService;
  preferenceService: NotificationPreferenceService;
  notificationsQueue: Queue;
  metrics: NotificationMetricsService;
  logger: Logger;
}

// ─── CreateAndEnqueue Input ───────────────────────────────────────────────────

/**
 * Input to NotificationService.createAndEnqueue().
 * Handler-facing interface — normalizes what each handler needs to pass.
 */
export interface CreateAndEnqueueInput {
  userId: string;
  contact: UserContact | null;
  templateName: string;
  variables: Record<string, string>;
  entityId: string;
  eventType: string;
  /** Channel names — e.g. ['sms', 'email', 'inApp'] */
  channels: string[];
  segment?: string;
}
