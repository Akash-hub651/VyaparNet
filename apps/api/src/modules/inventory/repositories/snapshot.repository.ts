// APPEND-ONLY: This repository has no update or delete methods by design.
// Inventory snapshot history is an immutable audit log.
//
// Authority: SPRINT3_EXECUTION_LOCK_FINAL.md §0 INV-7, §33.4 RULE 3, §16.1
//
// ANY agent adding update() or delete() to this file has violated INV-7.
// InventorySnapshot is observability/reconciliation infrastructure — never mutated.
//
// AUTHORITY WARNING: Snapshots are NEVER used to auto-correct inventory state.
// They are forensic/observability only. (§16.1 Snapshot Authority Governance)

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type { InventorySnapshot } from '@vyaparnet/database';

/** Input for a single snapshot record. */
export interface CreateSnapshotInput {
  inventoryId: string;
  quantity: number;
  reservedQty: number;
  damagedQty: number;
  snapshotDate: Date;
}

/**
 * SnapshotRepository — APPEND-ONLY repository for InventorySnapshot audit records.
 *
 * Authority: SPRINT3_EXECUTION_LOCK_FINAL.md §0 INV-7, §16.1, §33.4 RULE 3
 *
 * INVARIANTS (violation = architectural invalidity):
 *  - ZERO update() or delete() methods — ever. (INV-7)
 *  - createMany() uses skipDuplicates — idempotent (safe for re-run). (§20.4)
 *  - Written ONLY by cron workers — NEVER inline with business transactions. (§7.3 rule 11)
 *  - All findMany() have explicit take and orderBy — NO unbounded queries. (§33.4 RULE 6)
 *  - Snapshots are NEVER used to override live inventory quantity. (§16.1)
 *
 * WARNING (§13 offset pagination): NEVER use skip: N for cursor iteration.
 * All batch processing uses cursor-based pagination. (WARNING 13)
 */
@Injectable()
export class SnapshotRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Batch-create snapshots. skipDuplicates=true → idempotent re-runs. (§20.4)
   *
   * Called ONLY by InventorySnapshotWorker — never in business transaction. (§7.3 rule 11)
   * Creates multiple records in one DB round trip.
   */
  async createMany(inputs: CreateSnapshotInput[]): Promise<{ count: number }> {
    const data = inputs.map((input) => ({
      inventoryId: input.inventoryId,
      quantity: input.quantity,
      reservedQty: input.reservedQty,
      damagedQty: input.damagedQty,
      snapshotDate: input.snapshotDate,
    }));

    return this.prisma.inventorySnapshot.createMany({
      data,
      skipDuplicates: true, // idempotent — safe for re-run (§20.4)
    });
  }

  /**
   * Find snapshots for a specific inventory record.
   * Bounded by take, ordered DESC by snapshotDate. (§33.4 RULE 6)
   * Uses idx_invsnap_inv_date (§9.5).
   */
  async findMany(params: {
    inventoryId: string;
    take: number;
    cursor?: string;
  }): Promise<InventorySnapshot[]> {
    return this.prisma.inventorySnapshot.findMany({
      where: { inventoryId: params.inventoryId },
      take: params.take,
      skip: params.cursor ? 1 : 0,
      ...(params.cursor ? { cursor: { id: params.cursor } } : {}),
      orderBy: { snapshotDate: 'desc' },
    });
  }

  /**
   * Find latest snapshot for an inventory record (for drift detection). (§16.1)
   */
  async findLatest(inventoryId: string): Promise<InventorySnapshot | null> {
    const results = await this.prisma.inventorySnapshot.findMany({
      where: { inventoryId },
      take: 1,
      orderBy: { snapshotDate: 'desc' },
    });
    return results[0] ?? null;
  }
}
