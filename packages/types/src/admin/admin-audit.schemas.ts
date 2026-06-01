import { z } from 'zod';

/**
 * @vyaparnet/types — Admin Audit Log & Exception Center Schemas
 * Sprint 7 Phase 10: Audit Log Viewer & Exception Center
 *
 * Authority: §25 PHASE 10: AUDIT LOG VIEWER & EXCEPTION CENTER
 * INV-S7-22: GET /admin/audit-logs MUST be cursor-paginated, max limit 100.
 * INV-S7-23: No update/delete schemas — audit logs are APPEND-ONLY.
 * INV-S7-24: DLQ queue name LOCKED as 'notifications-failed'.
 * FOOTGUN-1-D: NEVER import from @vyaparnet/database here.
 */

// ─── Audit Log Query ──────────────────────────────────────────────────────────

/**
 * AuditLogListQuerySchema — cursor-paginated audit log filter.
 * INV-S7-22: max limit=100 enforced here at DTO level.
 */
export const AuditLogListQuerySchema = z
  .object({
    cursor: z.string().optional(),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(100, { message: 'limit must be ≤ 100' })
      .default(20),
    entityType: z.string().optional(),
    entityId: z.string().optional(),
    actorId: z.string().optional(),
    action: z.string().optional(),
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional(),
  })
  .strict();

export type AdminAuditLogListQuery = z.infer<typeof AuditLogListQuerySchema>;

// ─── Audit Log DTOs ───────────────────────────────────────────────────────────

export interface AuditLogDto {
  id: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  entityName: string | null;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  sessionId: string | null;
  auditMonth: string;
  createdAt: string;
}

export interface AuditLogListResponse {
  data: AuditLogDto[];
  nextCursor: string | null;
  hasMore: boolean;
}

// ─── DLQ Retry ────────────────────────────────────────────────────────────────

/**
 * DlqRetrySchema — POST /admin/exceptions/dlq/:jobId/retry body.
 * No body fields required — jobId from path param.
 * Schema ensures unknown keys rejected.
 */
export const DlqRetrySchema = z.object({}).strict();

export type DlqRetryDto = z.infer<typeof DlqRetrySchema>;

// ─── Technical Exception DTOs ─────────────────────────────────────────────────

export interface TechnicalExceptionDto {
  dlqDepth: number;
  openDisputes: number; // Placeholder for Sprint 8
}
