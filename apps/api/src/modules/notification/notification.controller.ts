import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@vyaparnet/database';
import {
  NotificationListQuerySchema,
  NotificationListQuery,
} from '@vyaparnet/types';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { Roles } from '../../shared/decorators/roles.decorator';
import { ZodValidationPipe } from '../../shared/pipes/zod-validation.pipe';
import { NotificationService } from './services/notification.service';
import { NotificationRepository } from './repositories/notification.repository';
import { PushSubscriptionRepository } from './repositories/push-subscription.repository';
import { RedisService } from '../../core/redis/redis.service';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../shared/decorators/public.decorator';
import {
  PushSubscribeDto,
  PushSubscribeSchema,
  PushUnsubscribeDto,
  PushUnsubscribeSchema,
} from '@vyaparnet/types';
import { Post, Delete, Body, Put } from '@nestjs/common';
import { NotificationPreferenceService } from './services/notification-preference.service';
import {
  UpdatePreferencesDto,
  UpdatePreferencesSchema,
} from '@vyaparnet/types';

/**
 * NotificationController — Phase 4 In-App Notification APIs.
 *
 * GOVERNANCE:
 * - INV-S6-18: NO SellerContextGuard on any /notifications/* route. Notifications are user-scoped.
 * - userId is extracted from req.user.id (JWT) — NEVER trusted from body or query.
 */
@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.BUYER, UserRole.SELLER)
// NO SellerContextGuard — notifications are user-scoped (INV-S6-18)
// FOOTGUN-4-A avoidance: DO NOT use SellerContextGuard here.
export class NotificationController {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly notificationRepository: NotificationRepository,
    private readonly pushSubscriptionRepository: PushSubscriptionRepository,
    private readonly notificationPreferenceService: NotificationPreferenceService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Get paginated notifications for the authenticated user.
   *
   * INV-S6-24: Cursor pagination is used internally.
   * FOOTGUN-4-B avoidance: Scoped to req.user.id.
   */
  @Get()
  async getNotifications(
    @Req() req: any,
    @Query(new ZodValidationPipe(NotificationListQuerySchema))
    query: NotificationListQuery,
  ) {
    const userId = req.user.id; // JWT — never trust body
    return this.notificationService.getNotifications(userId, query);
  }

  /**
   * Get unread notification count.
   */
  @Get('unread-count')
  async getUnreadCount(@Req() req: any) {
    const userId = req.user.id;
    return {
      success: true,
      data: { count: await this.notificationService.getUnreadCount(userId) },
    };
  }

  /**
   * Mark all unread notifications as read.
   */
  @Patch('read-all')
  async markAllRead(@Req() req: any) {
    const userId = req.user.id;
    await this.notificationRepository.markAllRead(userId);
    // Invalidate count cache. Failures swallowed gracefully.
    await this.redis.del(`notif:unread-count:${userId}`).catch(() => {});
    return { success: true };
  }

  /**
   * Mark a specific notification as read.
   *
   * Ownership is checked at the query level by requiring `userId` in the update condition.
   */
  @Patch(':id/read')
  async markRead(@Req() req: any, @Param('id') notificationId: string) {
    const userId = req.user.id;
    // INV-S6-18: updateMany with userId filter prevents cross-user mark-read
    await this.notificationRepository.markRead(notificationId, userId);
    // Invalidate count cache. Failures swallowed gracefully.
    await this.redis.del(`notif:unread-count:${userId}`).catch(() => {});
    return { success: true };
  }

  // ─── Phase 8: Notification Preferences ──────────────────────────────────────────────

  /**
   * Get notification preferences for the authenticated user.
   * Returns DEFAULT_NOTIFICATION_PREFERENCES if none explicitly set.
   *
   * INV-S6-5: Preference check is first in the notification delivery path.
   */
  @Get('preferences')
  async getPreferences(@Req() req: any) {
    const userId = req.user.id; // JWT — never trust body
    const prefs =
      await this.notificationPreferenceService.getPreferences(userId);
    return { success: true, data: prefs };
  }

  /**
   * Update notification preferences for the authenticated user.
   * Persists to User.notificationPreferences JSONB and invalidates Redis cache.
   *
   * FOOTGUN-8-C avoidance: UpdatePreferencesSchema Zod validation applied — no raw JSON into DB.
   */
  @Put('preferences')
  async updatePreferences(
    @Req() req: any,
    @Body(new ZodValidationPipe(UpdatePreferencesSchema))
    dto: UpdatePreferencesDto,
  ) {
    const userId = req.user.id; // JWT — never trust body
    const updated = await this.notificationPreferenceService.updatePreferences(
      userId,
      dto,
    );
    return { success: true, data: updated };
  }

  // ─── Phase 7: Push Subscription Management ───────────────────────────────────────────

  @Post('push/subscribe')
  async subscribe(
    @Req() req: any,
    @Body(new ZodValidationPipe(PushSubscribeSchema)) dto: PushSubscribeDto,
  ) {
    const userId = req.user.id;
    // INV-S6-22: Cap enforcement is inside repository.upsert()
    await this.pushSubscriptionRepository.upsert(userId, dto);
    return { success: true };
  }

  @Delete('push/unsubscribe')
  async unsubscribe(
    @Req() req: any,
    // INV-S6-29: Zod validation REQUIRED on unsubscribe body
    @Body(new ZodValidationPipe(PushUnsubscribeSchema))
    body: PushUnsubscribeDto,
  ) {
    const userId = req.user.id;
    await this.pushSubscriptionRepository.deleteByEndpoint(
      userId,
      body.endpoint,
    );
    return { success: true };
  }

  @Get('push/vapid-public-key')
  @Public() // VAPID public key is public
  async getVapidPublicKey() {
    return {
      success: true,
      data: { publicKey: this.config.get('VAPID_PUBLIC_KEY') },
    };
  }
}
