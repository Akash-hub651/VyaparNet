import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../core/prisma/prisma.service';
// Removed unused AuditLog import
import type { AuditAction, SystemActorType } from '@vyaparnet/types';

export interface CreateAuditLogInput {
  actorId: string;
  actorRole?: SystemActorType;
  action: AuditAction;
  entityType: string;
  entityId: string;
  entityName?: string;
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
}

/**
 * AuditRepository — APPEND-ONLY audit log operations.
 *
 * SECURITY CRITICAL:
 * This repository intentionally DOES NOT expose:
 * - update() methods
 * - delete() methods
 * - upsert() methods
 *
 * Audit logs are immutable by design.
 * All admin reads are in AdminAuditController (Sprint 7).
 *
 * Authority: VyaparNet_Implementation_Architecture_Official_Freeze_v1.md — immutable audit logs
 */
@Injectable()
export class AuditRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create an immutable audit log entry.
   *
   * CRITICAL: auditMonth must be set to YYYY-MM format.
   * This is the partition key for the AuditLog table.
   */
  async create(
    input: CreateAuditLogInput,
    tx?: import('@vyaparnet/database').Prisma.TransactionClient,
  ): Promise<void> {
    const now = new Date();
    const auditMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const client = tx ?? this.prisma;

    await client.auditLog.create({
      data: {
        actorId: input.actorId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        entityName: input.entityName ?? undefined,
        oldValue: input.oldValue ? (input.oldValue as object) : undefined,
        newValue: input.newValue ? (input.newValue as object) : undefined,
        ipAddress: input.ipAddress ?? undefined,
        userAgent: input.userAgent ?? undefined,
        sessionId: input.sessionId ?? undefined,
        auditMonth,
      },
    });
  }

  // ─── READ METHODS (Admin only — Sprint 7) ──────────────────
  // findByEntityId() — Sprint 7
  // findByActorId() — Sprint 7
  // Note: No update/delete methods will ever be added here.
}
