import { Injectable, Logger } from '@nestjs/common';
import { PushSubscription } from '@vyaparnet/database';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { PushSubscribeDto } from '@vyaparnet/types';

// Maximum active push subscriptions per user — prevents amplification attacks (INV-S6-22)
const MAX_PUSH_SUBSCRIPTIONS_PER_USER = 10;

/**
 * PushSubscriptionRepository — CRUD for the PushSubscription table.
 *
 * GOVERNANCE:
 * - INV-S6-9: One row per (userId, endpoint). 410 Gone → deleteByEndpoint() immediately.
 * - INV-S6-22: Max 10 active subscriptions per user. Oldest evicted INSIDE $transaction.
 *   Cap enforcement MUST occur inside the same transaction as the insert.
 */
@Injectable()
export class PushSubscriptionRepository {
  private readonly logger = new Logger(PushSubscriptionRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Upsert a push subscription for a user.
   *
   * INV-S6-22: Cap enforcement (max 10) happens INSIDE $transaction before insert.
   * If cap is reached: oldest subscription (by createdAt ASC) is deleted first.
   * Log: PUSH_SUB_CAP_EVICTION when eviction occurs.
   */
  async upsert(
    userId: string,
    dto: PushSubscribeDto,
  ): Promise<PushSubscription> {
    return this.prisma.$transaction(
      async (tx) => {
        // Check current active subscription count for this user
        const count = await tx.pushSubscription.count({
          where: { userId, isActive: true },
        });

        if (count >= MAX_PUSH_SUBSCRIPTIONS_PER_USER) {
          // INV-S6-22: Evict oldest subscription to enforce cap
          const oldest = await tx.pushSubscription.findFirst({
            where: { userId, isActive: true },
            orderBy: { createdAt: 'asc' }, // Oldest first
            select: { id: true, endpoint: true },
          });

          if (oldest) {
            await tx.pushSubscription.delete({ where: { id: oldest.id } });
            // Log eviction — endpoint truncated for security (never log full endpoint URL)
            this.logger.warn(
              { userId, evictedEndpointSuffix: oldest.endpoint.slice(-20) },
              'PUSH_SUB_CAP_EVICTION',
            );
          }
        }

        // Upsert: update keys+userAgent if endpoint already exists for this user (device re-registers)
        return tx.pushSubscription.upsert({
          where: {
            // INV-S6-9: unique constraint on (userId, endpoint)
            // Prisma generates composite unique field as userId_endpoint
            userId_endpoint: { userId, endpoint: dto.endpoint },
          },
          create: {
            userId,
            endpoint: dto.endpoint,
            p256dh: dto.keys.p256dh,
            auth: dto.keys.auth,
            userAgent: dto.userAgent ?? null,
            isActive: true,
          },
          update: {
            p256dh: dto.keys.p256dh, // Re-registration: update encryption keys
            auth: dto.keys.auth,
            userAgent: dto.userAgent ?? null,
            isActive: true,
          },
        });
      },
      { timeout: 5000 }, // INV-1: $transaction with timeout
    );
  }

  /**
   * Find all active push subscriptions for a user.
   * Called by WebPushService (Phase 7) to fan-out push to all registered devices.
   */
  async findActiveForUser(userId: string): Promise<PushSubscription[]> {
    return this.prisma.pushSubscription.findMany({
      where: { userId, isActive: true },
    });
  }

  /**
   * Delete a subscription by endpoint for a specific user.
   *
   * INV-S6-9: Called synchronously on 410 Gone response from push service.
   * Also used for voluntary unsubscribe (DELETE /notifications/push/unsubscribe).
   * userId scoping prevents cross-user deletion.
   */
  async deleteByEndpoint(userId: string, endpoint: string): Promise<void> {
    await this.prisma.pushSubscription.deleteMany({
      where: { userId, endpoint }, // userId scoped — cannot delete another user's subscription
    });
  }

  /**
   * Count active push subscriptions for a user.
   * Used by observability metrics (notification_push_subscriptions_active gauge).
   */
  async countActive(userId: string): Promise<number> {
    return this.prisma.pushSubscription.count({
      where: { userId, isActive: true },
    });
  }
}
