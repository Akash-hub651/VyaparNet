import { Injectable, Logger } from '@nestjs/common';
import { AdminAuditRepository } from '../repositories/admin-audit.repository';
import type {
  AdminAuditLogListQuery,
  AuditLogListResponse,
  AuditLogDto,
} from '@vyaparnet/types';

/**
 * AdminAuditService — Audit Log Viewer (Phase 10).
 *
 * Delegates entirely to AdminAuditRepository (READ-ONLY).
 * No business logic beyond delegation and logging.
 *
 * FOOTGUN-10-A: NO write operations in this service.
 * FOOTGUN-10-D: listLogs() always cursor-paginated, max 100 (enforced in repo + schema).
 * INV-S7-34: Audit log reads are NOT cached — always fresh from DB.
 *
 * Authority: §25 Phase 10 Step 10.2.
 */
@Injectable()
export class AdminAuditService {
  private readonly logger = new Logger(AdminAuditService.name);

  constructor(private readonly auditRepo: AdminAuditRepository) {}

  // ─── listLogs ─────────────────────────────────────────────────────────────

  /**
   * GET /admin/audit-logs
   * Cursor-paginated audit log viewer.
   * INV-S7-22: max limit 100.
   * FOOTGUN-10-D: Never unbounded.
   */
  async listLogs(
    filter: AdminAuditLogListQuery,
  ): Promise<AuditLogListResponse> {
    this.logger.log(
      {
        entityType: filter.entityType,
        entityId: filter.entityId,
        actorId: filter.actorId,
        limit: filter.limit,
      },
      'ADMIN_AUDIT_LOG_LIST',
    );

    return this.auditRepo.findMany(filter);
  }

  // ─── getEntityTimeline ────────────────────────────────────────────────────

  /**
   * GET /admin/audit-logs/timeline/:entityType/:entityId
   * Chronological audit timeline for a single entity.
   * Used by admin to see full history of a Business, Order, Product, etc.
   */
  async getEntityTimeline(
    entityType: string,
    entityId: string,
  ): Promise<AuditLogDto[]> {
    this.logger.log({ entityType, entityId }, 'ADMIN_AUDIT_ENTITY_TIMELINE');

    return this.auditRepo.findByEntity(entityType, entityId);
  }
}
