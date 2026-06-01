import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type {
  AdminAuditLogListQuery,
  AuditLogDto,
  AuditLogListResponse,
} from '@vyaparnet/types';

/**
 * AdminAuditRepository — READ-ONLY audit log access for admin endpoints.
 *
 * FOOTGUN-10-A: This repository intentionally has NO create(), update(),
 * delete(), or upsert() methods. AuditLog is APPEND-ONLY.
 * All writes go through AuditSafeWriterService → AuditRepository.
 *
 * INV-S7-22: findMany() is cursor-paginated, max 100 records per call.
 * INV-S7-23: Immutability enforced by method absence.
 *
 * Authority: §25 Phase 10 Step 10.1.
 */
@Injectable()
export class AdminAuditRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ─── findMany (cursor-paginated) ─────────────────────────────────────────

  /**
   * INV-S7-22: Cursor-paginated. max limit=100 (enforced by Zod schema + repo).
   * Filters: entityType, entityId, actorId, action, dateFrom, dateTo.
   */
  async findMany(
    filter: AdminAuditLogListQuery,
  ): Promise<AuditLogListResponse> {
    const limit = Math.min(filter.limit ?? 20, 100); // Belt-and-suspenders cap

    const where = {
      ...(filter.entityType ? { entityType: filter.entityType } : {}),
      ...(filter.entityId ? { entityId: filter.entityId } : {}),
      ...(filter.actorId ? { actorId: filter.actorId } : {}),
      ...(filter.action ? { action: filter.action as any } : {}),
      ...(filter.dateFrom || filter.dateTo
        ? {
            createdAt: {
              ...(filter.dateFrom ? { gte: new Date(filter.dateFrom) } : {}),
              ...(filter.dateTo ? { lte: new Date(filter.dateTo) } : {}),
            },
          }
        : {}),
    };

    const logs = await this.prisma.auditLog.findMany({
      where: {
        ...where,
        ...(filter.cursor ? { id: { lt: filter.cursor } } : {}),
      },
      orderBy: { id: 'desc' }, // Newest first (cursor = id for CUID ordering)
      take: limit + 1, // Fetch one extra to determine hasMore
    });

    const hasMore = logs.length > limit;
    const data = hasMore ? logs.slice(0, limit) : logs;
    const nextCursor = hasMore ? (data[data.length - 1]?.id ?? null) : null;

    return {
      data: data.map(this.toDto),
      nextCursor,
      hasMore,
    };
  }

  // ─── findByEntity (entity timeline) ──────────────────────────────────────

  /**
   * GET /admin/audit-logs/timeline/:entityType/:entityId
   * Returns chronological audit history for a single entity.
   * Capped at 200 to prevent unbounded scans (index: idx_al_entity_date).
   */
  async findByEntity(
    entityType: string,
    entityId: string,
  ): Promise<AuditLogDto[]> {
    const logs = await this.prisma.auditLog.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: 'asc' }, // Chronological — oldest first for timeline
      take: 200, // Bounded (INV-S7-22 spirit: no unbounded queries)
    });

    return logs.map(this.toDto);
  }

  // ─── Private mapping ──────────────────────────────────────────────────────

  private toDto(log: {
    id: string;
    actorId: string;
    action: string;
    entityType: string;
    entityId: string;
    entityName: string | null;
    oldValue: unknown;
    newValue: unknown;
    ipAddress: string | null;
    userAgent: string | null;
    sessionId: string | null;
    auditMonth: string;
    createdAt: Date;
  }): AuditLogDto {
    return {
      id: log.id,
      actorId: log.actorId,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      entityName: log.entityName,
      oldValue: log.oldValue as Record<string, unknown> | null,
      newValue: log.newValue as Record<string, unknown> | null,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      sessionId: log.sessionId,
      auditMonth: log.auditMonth,
      createdAt: log.createdAt.toISOString(),
    };
  }
}
