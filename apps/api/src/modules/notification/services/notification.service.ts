import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { NotificationChannel, NotificationType } from '@vyaparnet/database';
import { NotificationRepository } from '../repositories/notification.repository';
import { RedisService } from '../../../core/redis/redis.service';
import { TemplateService } from './template.service';
import { NotificationPreferenceService } from './notification-preference.service';
import { UserContactService } from './user-contact.service';
import { NotificationTemplateRepository } from '../repositories/notification-template.repository';
import type { CreateAndEnqueueInput, NotificationJob } from '../channels/channel.interface';
import type { NotificationListQuery } from '@vyaparnet/types';

/**
 * NotificationService — orchestrates In-App notification creation + BullMQ job enqueue.
 *
 * GOVERNANCE:
 * - INV-S6-20: In-App notification is created SYNCHRONOUSLY (direct DB write, not via BullMQ).
 *   It is the channel of last resort — must be created even if all external channels fail.
 * - INV-S6-1: This service MUST NOT write to EventOutbox. EVER.
 * - INV-S6-5: Preference check is FIRST operation — IN THIS SERVICE (Phase 8 wiring).
 *   In-App is unconditional; SMS/Email/Push are gated by user preferences.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly notificationRepository: NotificationRepository,
    private readonly notificationTemplateRepository: NotificationTemplateRepository,
    private readonly redis: RedisService,
    private readonly templateService: TemplateService,
    private readonly preferenceService: NotificationPreferenceService,
    private readonly userContactService: UserContactService,
    @InjectQueue('notifications') private readonly notificationsQueue: Queue,
  ) {}

  /**
   * createAndEnqueue — main entry point for notification delivery.
   *
   * Phase 8 upgrade: Preference-gated channel dispatch (INV-S6-5).
   * In-App is always created (INV-S6-20). SMS/Email/Push are gated by preferences.
   *
   * INV-S6-20: In-App created SYNCHRONOUSLY before any external channel job is enqueued.
   * INV-S6-1: Zero EventOutbox writes.
   * INV-S6-5: getPreferences() is called FIRST before any channel decision.
   *
   * @param input - Notification request from handler
   */
  async createAndEnqueue(input: CreateAndEnqueueInput): Promise<void> {
    const { userId, contact, templateName, variables, entityId, eventType, channels, segment } = input;

    // INV-S6-5: Preference check is FIRST operation
    const prefs = await this.preferenceService.getPreferences(userId);

    // Resolve event category for preference gate
    const category = this.resolveEventCategory(eventType);

    // FIX-3: Default is 'hi' per spec §UX.4 (VyaparNet is Hindi-first for B2B sellers/buyers)
    // Ternary checks for explicit 'en' — everything else (null, undefined, 'hi') maps to 'hi'
    const language: 'hi' | 'en' = (contact?.language === 'en') ? 'en' : 'hi';

    // §22.2: Resolve deep link for this template + entityId (frontend navigation route)
    const deepLink = this.resolveDeepLink(templateName, entityId);

    // INV-S6-20: In-App is ALWAYS created SYNCHRONOUSLY regardless of preferences
    const type = this.resolveNotificationType(eventType);
    const notificationId = await this.createInAppNotification(
      userId, templateName, language, variables, type, entityId, deepLink,
    );

    this.logger.debug({ userId, eventType, templateName }, 'NOTIFICATION_INAPP_CREATED');

    // Build channel jobs — each independently gated by preference (INV-S6-8)
    const jobs: NotificationJob[] = [];

    // Render title + body once at enqueue time (retries reuse pre-rendered values)
    // Phase 9: getTemplate() is now synchronous (O(1) cache lookup — no DB per send)
    const template = this.templateService.getTemplate(templateName, language);
    const title = this.templateService.render(template.title, variables);
    const body = this.templateService.render(template.body, variables);

    if (channels.includes('sms') && this.preferenceService.isChannelEnabled(prefs, 'sms', category)) {
      // INV-S6-16: null phone → skip + warn, never throw
      if (contact?.phone) {
        jobs.push({ channel: 'sms', userId, notificationId, templateName, variables, title, body, eventType, segment, phone: contact.phone });
      } else {
        this.logger.warn({ userId, eventType }, 'SMS_JOB_SKIPPED_NO_PHONE');
      }
    }

    if (channels.includes('email') && this.preferenceService.isChannelEnabled(prefs, 'email', category)) {
      // INV-S6-16: null email → skip + warn, never throw
      if (contact?.email) {
        jobs.push({ channel: 'email', userId, notificationId, templateName, variables, title, body, eventType, segment, email: contact.email });
      } else {
        this.logger.warn({ userId, eventType }, 'EMAIL_JOB_SKIPPED_NO_EMAIL');
      }
    }

    if (channels.includes('push') && this.preferenceService.isChannelEnabled(prefs, 'push', category)) {
      // Push: no endpoint pre-resolution — WebPushService queries DB at delivery time
      jobs.push({ channel: 'push', userId, notificationId, templateName, variables, title, body, eventType, segment });
    }

    // INV-S6-8: Independent enqueue — SMS failure ≠ Email blocked
    await Promise.allSettled(
      jobs.map(job => this.notificationsQueue.add(`deliver-${job.channel}`, job, {
        attempts: job.channel === 'push' ? 1 : 3,
        backoff: { type: 'fixed', delay: 5000 },
      }))
    );
  }

  /**
   * Directly triggers a notification outside the EventOutbox consumer path.
   * Used by AdminModule (Sprint 7) for KYC/suspension/system notifications.
   * Respects user notification preferences.
   * Always creates In-App. SMS/Email/Push per preference.
   *
   * @param userId       - Target user's ID (User.id — not Business.id)
   * @param templateName - Notification template name (must exist in NotificationTemplate table)
   * @param variables    - Template variable map ({ businessName: '...', orderNumber: '...', etc. })
   */
  async sendDirect(
    userId: string,
    templateName: string,
    variables: Record<string, string>,
  ): Promise<void> {
    // 1. Resolve user contact
    const contact = await this.userContactService.getContact(userId);

    // 2. Determine channels from template definition
    const template = await this.notificationTemplateRepository.findByName(templateName);
    if (!template) {
      this.logger.error({ templateName, userId }, 'SEND_DIRECT_TEMPLATE_NOT_FOUND');
      return; // Graceful — never throw to caller
    }

    // 3. (Category resolution omitted as createAndEnqueue resolves it internally)

    // 4. Delegate to createAndEnqueue — same preference + channel pipeline
    await this.createAndEnqueue({
      userId,
      contact,
      templateName,
      variables,
      entityId: userId, // For dedup: userId as entityId (admin events are per-user)
      eventType: `Direct_${templateName}`,
      channels: template.channels.map(c => c.toLowerCase()) as ('sms' | 'email' | 'push' | 'inApp')[],
    });
  }

  /**
   * Phase 4: Synchronous In-App Notification Creation.
   *
   * §22.2 Phase 11: metadata now includes entityId + deepLink for frontend navigation.
   * Worker uses job.data.body directly (pre-rendered at enqueue — not re-rendered per retry).
   *
   * INV-S6-20: This is SYNCHRONOUS — created before any BullMQ job is enqueued.
   */
  async createInAppNotification(
    userId: string,
    templateName: string,
    language: 'hi' | 'en',
    variables: Record<string, string>,
    type: NotificationType,
    entityId?: string,
    deepLink?: string,
  ): Promise<string> {
    // INV-S6-20: In-App is synchronous
    // Phase 9: getTemplate() is synchronous (O(1) Map lookup after onModuleInit)
    const template = this.templateService.getTemplate(templateName, language);
    const title = this.templateService.render(template.title, variables);
    const body = this.templateService.render(template.body, variables);

    const { id } = await this.notificationRepository.create(userId, {
      type,
      title,
      body,
      channels: [NotificationChannel.IN_APP],
      // §22.2: entityId + deepLink in metadata for frontend notification panel navigation
      metadata: {
        templateName,
        variables,
        ...(entityId !== undefined && { entityId }),
        ...(deepLink !== undefined && { deepLink }),
      },
    });

    // Invalidate unread count cache
    await this.redis.del(`notif:unread-count:${userId}`).catch(() => {});

    return id; // Return notificationId for BullMQ job reference
  }

  /**
   * Get paginated notifications for user.
   */
  async getNotifications(userId: string, query: NotificationListQuery) {
    return this.notificationRepository.findManyForUser(userId, query);
  }

  /**
   * Get unread count for user, hitting Redis cache if available.
   */
  async getUnreadCount(userId: string): Promise<number> {
    const cacheKey = `notif:unread-count:${userId}`;
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached !== null) return parseInt(cached, 10);
    } catch {
      // Redis fail — swallow and fall through to DB
    }

    const count = await this.notificationRepository.countUnread(userId);
    
    try {
      // FIX-4: TTL = 30s per §4 Redis Key Registry (was incorrectly set to 300s)
      await this.redis.set(cacheKey, count.toString(), 'EX', 30);
    } catch {
      // Redis fail — swallow
    }
    
    return count;
  }

  /**
   * Map eventType string to NotificationType enum.
   * Used when creating In-App notification records.
   */
  private resolveNotificationType(eventType: string): NotificationType {
    if (eventType.startsWith('Order')) return NotificationType.ORDER;
    if (eventType.startsWith('Payment')) return NotificationType.PAYMENT;
    if (eventType.startsWith('Stock') || eventType.startsWith('Inventory')) {
      return NotificationType.INVENTORY;
    }
    if (eventType.startsWith('Supplier') || eventType.startsWith('Score')) {
      return NotificationType.SYSTEM;
    }
    return NotificationType.SYSTEM;
  }

  /**
   * Map eventType to preference category key.
   * Used by INV-S6-5 preference gate before channel dispatch.
   */
  private resolveEventCategory(
    eventType: string,
  ): 'orderUpdates' | 'paymentUpdates' | 'scorecard' | 'lowStock' {
    if (eventType.startsWith('Order')) return 'orderUpdates';
    if (eventType.startsWith('Payment')) return 'paymentUpdates';
    if (eventType.startsWith('Supplier') || eventType.startsWith('Score')) return 'scorecard';
    if (eventType.startsWith('Stock') || eventType.startsWith('Inventory')) return 'lowStock';
    return 'orderUpdates'; // Safe default — orderUpdates is ON for all channels by default
  }

  /**
   * §22.2 Phase 11: Resolve the frontend deep link for a notification.
   *
   * Maps the template name to a frontend route, substituting {entityId} with the actual id.
   * Returns undefined for unmapped templates — frontend falls back to notification list.
   *
   * Deep link table (from §22.2):
   *   OrderCreated_BUYER    → /buyer/orders/{orderId}
   *   OrderShipped_BUYER    → /buyer/orders/{orderId}
   *   PaymentFailed_BUYER   → /buyer/orders/{orderId}/payment-retry
   *   OrderCreated_SELLER   → /seller/orders/{orderId}
   *   ScoreDropped_SELLER   → /seller/scorecard
   *   StockLow_SELLER       → /seller/inventory
   */
  private resolveDeepLink(templateName: string, entityId?: string): string | undefined {
    // IMPROVEMENT: using explicit object lookup (O(1)) rather than switch/case for extensibility
    const DEEP_LINK_MAP: Record<string, string> = {
      'OrderCreated_BUYER_hi':    `/buyer/orders/${entityId ?? ''}`,
      'OrderCreated_BUYER_en':    `/buyer/orders/${entityId ?? ''}`,
      'OrderConfirmed_BUYER_hi':  `/buyer/orders/${entityId ?? ''}`,
      'OrderShipped_BUYER_hi':    `/buyer/orders/${entityId ?? ''}`,
      'OrderShipped_BUYER_en':    `/buyer/orders/${entityId ?? ''}`,
      'OrderProcessing_BUYER_hi': `/buyer/orders/${entityId ?? ''}`,
      'OrderOutForDelivery_BUYER_hi': `/buyer/orders/${entityId ?? ''}`,
      'OrderDelivered_BUYER_hi':  `/buyer/orders/${entityId ?? ''}`,
      'PaymentReceived_BUYER_hi': `/buyer/orders/${entityId ?? ''}`,
      'PaymentFailed_BUYER_hi':   `/buyer/orders/${entityId ?? ''}/payment-retry`,
      'PaymentFailed_BUYER_en':   `/buyer/orders/${entityId ?? ''}/payment-retry`,
      'OrderCreated_SELLER_hi':   `/seller/orders/${entityId ?? ''}`,
      'ScoreImproved_SELLER_hi':  '/seller/scorecard',
      'ScoreDropped_SELLER_hi':   '/seller/scorecard',
      'StockLow_SELLER_hi':       '/seller/inventory',
    };

    return DEEP_LINK_MAP[templateName]; // undefined = no deep link for this template
  }
}

