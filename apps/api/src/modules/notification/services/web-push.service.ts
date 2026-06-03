import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import { PushSubscriptionRepository } from '../repositories/push-subscription.repository';
import { PushSubscription } from '@vyaparnet/database';

/**
 * WebPushService — implements VAPID push notifications.
 *
 * GOVERNANCE:
 * - INV-S6-9: 410 Gone = stale subscription → deleted immediately.
 * - Best-effort: failures do NOT throw, to avoid retry storms (no DLQ).
 */
@Injectable()
export class WebPushService {
  private readonly logger = new Logger(WebPushService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly pushSubscriptionRepository: PushSubscriptionRepository,
  ) {
    const pubKey = this.config.get('VAPID_PUBLIC_KEY');
    const privKey = this.config.get('VAPID_PRIVATE_KEY');
    if (pubKey && privKey) {
      try {
        webpush.setVapidDetails(
          `mailto:${this.config.get('VAPID_EMAIL') || 'support@vyaparnet.com'}`,
          pubKey,
          privKey,
        );
      } catch (err: any) {
        this.logger.error('Failed to set VAPID details for Web Push', err);
      }
    } else {
      this.logger.warn(
        'VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY not set — Web Push notifications disabled',
      );
    }
  }

  async sendToUser(
    userId: string,
    title: string,
    body: string,
    url?: string,
  ): Promise<void> {
    const subscriptions =
      await this.pushSubscriptionRepository.findActiveForUser(userId);
    if (subscriptions.length === 0) return;

    const payload = JSON.stringify({
      title,
      body,
      url,
      icon: '/icons/icon-192.png',
    });

    // Send to all devices (multi-device support)
    await Promise.allSettled(
      subscriptions.map((sub) => this.sendToSubscription(sub, payload)),
    );
  }

  private async sendToSubscription(
    sub: PushSubscription,
    payload: string,
  ): Promise<void> {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        payload,
        { TTL: 3600 },
      );
    } catch (err: any) {
      if (err.statusCode === 410) {
        // INV-S6-9: 410 Gone = stale subscription, delete immediately
        await this.pushSubscriptionRepository.deleteByEndpoint(
          sub.userId,
          sub.endpoint,
        );
        this.logger.warn(
          { userId: sub.userId, endpoint: sub.endpoint.slice(-20) },
          'PUSH_SUBSCRIPTION_DELETED_STALE',
        );
      } else {
        // Other errors: log and swallow (push is best-effort)
        this.logger.warn(
          { error: err instanceof Error ? err.message : String(err) },
          'PUSH_DELIVERY_FAILED',
        );
      }
    }
  }
}
