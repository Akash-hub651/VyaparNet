import { Injectable } from '@nestjs/common';
import {
  NotificationChannel,
  NotificationType,
  Prisma,
} from '@vyaparnet/database';
import { NotificationDto, NotificationListQuery } from '@vyaparnet/types';
import { PrismaService } from '../../../core/prisma/prisma.service';

// ─── Internal Types ────────────────────────────────────────────────────────────

/**
 * Data shape for creating a new Notification record.
 * Consumers must NOT set userId, notificationMonth, or isRead — these are
 * set by the repository to enforce INV-S6-4 and INV-S6-30.
 */
export interface CreateNotificationData {
  type: NotificationType;
  title: string;
  body: string;
  channels: NotificationChannel[];
  metadata?: Record<string, unknown> | null;
}

/** Raw Prisma row shape returned by findMany select */
interface RawNotificationRow {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  isRead: boolean;
  readAt: Date | null;
  createdAt: Date;
  metadata: unknown;
}

// ─── Repository ─────────────────────────────────────────────────────────────

/**
 * NotificationRepository — SOLE data access layer for the Notification table.
 *
 * GOVERNANCE:
 * - INV-S6-4: userId is MANDATORY on EVERY method. Unscoped queries are a P0 security violation.
 * - INV-S6-18: No method may query notifications without a `where: { userId }` clause.
 * - INV-S6-24: Cursor-based pagination uses notification `id` (CUID), NOT `createdAt`.
 *   CUIDs are monotonically sortable and globally unique. createdAt can collide at ms precision.
 * - INV-S6-30: notificationMonth MUST be UTC: `new Date().toISOString().slice(0, 7)`.
 *   An IST server at 00:01 on the 1st computes the wrong month in UTC — wrong partition key.
 */
@Injectable()
export class NotificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a Notification record for a user.
   *
   * INV-S6-4: userId passed explicitly — never derived from context.
   * INV-S6-30: notificationMonth computed in UTC to prevent timezone-drift partition errors.
   */
  async create(
    userId: string,
    data: CreateNotificationData,
  ): Promise<{ id: string }> {
    // INV-S6-30: UTC partition key — prevents IST timezone drift creating wrong monthly buckets
    const notificationMonth = new Date().toISOString().slice(0, 7); // 'YYYY-MM' UTC

    return this.prisma.notification.create({
      data: {
        userId, // INV-S6-4: always explicit
        type: data.type,
        title: data.title,
        body: data.body,
        channels: data.channels,
        // Prisma requires explicit cast for nullable JSON fields.
        // Pattern from product-events.service.ts: `as unknown as Prisma.InputJsonValue`
        metadata:
          data.metadata !== undefined && data.metadata !== null
            ? (data.metadata as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        notificationMonth, // INV-S6-30: UTC partition key
        isRead: false,
      },
      select: { id: true },
    });
  }

  /**
   * Paginated notification list for a single user.
   *
   * INV-S6-18: `where: { userId }` is MANDATORY — prevents cross-user data access.
   * INV-S6-24: Cursor = notification `id` (CUID). orderBy: { id: 'desc' }.
   *   Using createdAt as cursor would break on simultaneous inserts (same ms timestamp).
   */
  async findManyForUser(
    userId: string,
    query: NotificationListQuery,
  ): Promise<{
    items: NotificationDto[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    const limit = query.limit ?? 20;

    const rows = await this.prisma.notification.findMany({
      where: {
        userId, // INV-S6-18: userId MANDATORY — no unscoped queries ever
        isDeleted: false,
        ...(query.isRead !== undefined && { isRead: query.isRead }),
        // INV-S6-24: cursor is notification `id` (CUID), NOT createdAt
        // CUIDs are k-sortable (monotonically increasing), making them safe as cursors.
        ...(query.cursor && { id: { lt: query.cursor } }),
      },
      orderBy: { id: 'desc' }, // INV-S6-24: sort by CUID (monotonic), not createdAt
      take: limit + 1, // Fetch one extra to detect hasMore
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        isRead: true,
        readAt: true,
        createdAt: true,
        metadata: true,
      },
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    // INV-S6-24: nextCursor is the last item's `id` (CUID), NOT createdAt
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return {
      items: items.map((row) => this.toDto(row as RawNotificationRow)),
      nextCursor,
      hasMore,
    };
  }

  /**
   * Mark a single notification as read — ownership enforced at query level.
   *
   * INV-S6-18: `updateMany` with `{ id, userId }` — prevents cross-user mark-read.
   * FOOTGUN-2-C avoidance: uses updateMany (1 atomic query) NOT findUnique + update (2 queries).
   */
  async markRead(notificationId: string, userId: string): Promise<void> {
    // INV-S6-18: userId in where clause makes this atomic + ownership-safe
    await this.prisma.notification.updateMany({
      where: { id: notificationId, userId }, // userId MANDATORY — cross-user mark = P0
      data: { isRead: true, readAt: new Date() },
    });
  }

  /**
   * Mark ALL unread notifications for a user as read.
   * INV-S6-18: scoped to userId exclusively.
   */
  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false, isDeleted: false }, // INV-S6-18
      data: { isRead: true, readAt: new Date() },
    });
  }

  /**
   * Count unread notifications — capped at 100 for badge display.
   *
   * Capping prevents full-table scans when a user has thousands of unread notifications.
   * Badge display only needs to know if count > 99; exact number beyond that is UX noise.
   */
  async countUnread(userId: string): Promise<number> {
    const result = await this.prisma.notification.count({
      where: { userId, isRead: false, isDeleted: false }, // INV-S6-18
    });
    return Math.min(result, 100); // Cap at 100 — prevents full-table scan for badge
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  /** Maps raw Prisma row to the public DTO shape */
  private toDto(row: RawNotificationRow): NotificationDto {
    return {
      id: row.id,
      type: row.type as NotificationDto['type'],
      title: row.title,
      body: row.body,
      isRead: row.isRead,
      readAt: row.readAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      metadata: (row.metadata as Record<string, unknown>) ?? null,
    };
  }
}
