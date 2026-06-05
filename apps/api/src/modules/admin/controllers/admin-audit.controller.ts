import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  UnprocessableEntityException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { AdminContextGuard } from '../guards/admin-context.guard';
import { AdminAuditService } from '../services/admin-audit.service';
import {
  AuditLogListQuerySchema,
  type AuditLogListResponse,
  type AuditLogDto,
} from '@vyaparnet/types';

/**
 * AdminAuditController — Audit Log Viewer endpoints (Phase 10).
 *
 * INV-S7-1: @UseGuards(JwtAuthGuard, AdminContextGuard) — NO RolesGuard.
 * INV-S7-22: GET /admin/audit-logs is cursor-paginated, max limit 100.
 * FOOTGUN-10-A: NO write endpoints (update/delete) exist here.
 * FOOTGUN-10-D: limit > 100 → 422 (enforced by Zod schema validation).
 *
 * Authority: §25 Phase 10 Step 10.2.
 */
@UseGuards(JwtAuthGuard, AdminContextGuard) // INV-S7-1
@Controller('admin/audit-logs')
export class AdminAuditController {
  constructor(private readonly auditService: AdminAuditService) {}

  // ─── GET /admin/audit-logs ────────────────────────────────────────────────

  /**
   * Paginated audit log viewer.
   * INV-S7-22: cursor-paginated, max 100.
   * FOOTGUN-10-D: limit > 100 → 422 via Zod schema.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async listAuditLogs(
    @Query() rawQuery: Record<string, unknown>,
  ): Promise<AuditLogListResponse> {
    const result = AuditLogListQuerySchema.safeParse(rawQuery);
    if (!result.success) {
      throw new UnprocessableEntityException({
        code: 'VALIDATION_ERROR',
        errors: result.error.issues,
      });
    }

    const query = result.data;

    // Belt-and-suspenders: reject limit > 100 (also enforced by Zod max)
    if ((query.limit ?? 20) > 100) {
      throw new UnprocessableEntityException({
        code: 'LIMIT_EXCEEDED',
        message: 'limit must be ≤ 100',
        max: 100,
      });
    }

    return this.auditService.listLogs(query);
  }

  // ─── GET /admin/audit-logs/timeline/:entityType/:entityId ─────────────────

  /**
   * Entity audit timeline — chronological history of a single entity.
   * Example: GET /admin/audit-logs/timeline/Business/biz-123
   */
  @Get('timeline/:entityType/:entityId')
  @HttpCode(HttpStatus.OK)
  async getEntityTimeline(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
  ): Promise<AuditLogDto[]> {
    return this.auditService.getEntityTimeline(entityType, entityId);
  }
}
