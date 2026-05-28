import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { Prisma } from '@vyaparnet/database';
import { InventoryMetrics } from './inventory.metrics';
import { SnapshotRepository } from './repositories/snapshot.repository';

/**
 * Result of a single inventory reconciliation batch.
 */
export interface ReconciliationResult {
  processedCount: number;
  driftCount: number;
  criticalDriftCount: number;
  nextCheckpoint: Date | null; // null = no more pages (reconciliation complete)
}

/**
 * Drift record for a single inventory item.
 */
interface InventoryDriftRecord {
  inventoryId: string;
  productId: string;
  snapshotQuantity: number;
  liveQuantity: number;
  drift: number; // liveQuantity - snapshotQuantity
  isCritical: boolean; // |drift| > CRITICAL_DRIFT_THRESHOLD
}

/**
 * Shape of raw row from $queryRaw — strongly typed per §3.6.
 */
interface InventorySnapshotRaw {
  id: string;
  inventoryId: string;
  quantity: number;
  reservedQty: number;
  damagedQty: number;
  snapshotDate: Date;
}

/**
 * InventoryReconcileService — checkpoint-based drift detection.
 *
 * Authority: SPRINT3_EXECUTION_LOCK_FINAL.md §16.1, §3E sub-phase
 *
 * INVARIANTS:
 *   - Checkpoint-based: processes only records updated since last checkpoint. (§16.1)
 *   - Uses cursor pagination (NOT offset — §33.4 WARNING 13)
 *   - Drift detected → alert ONLY — NEVER auto-correct inventory (§16.1 Snapshot Authority)
 *   - Snapshots are written here — separate from business transactions (§7.3 rule 11)
 *   - $queryRaw is STRONGLY TYPED — no untyped any[] returns (§3.6)
 *   - Drift scoring per §16.1: critical if |drift| > CRITICAL_DRIFT_THRESHOLD
 *
 * DRIFT SCORING (§16.1):
 *   - |drift| > 0 → detected, log WARN
 *   - |drift| > CRITICAL_DRIFT_THRESHOLD → detected, log ERROR, metrics.driftDetected(id, true)
 *   - NEVER auto-correct — only alert (§16.1 Snapshot Authority Governance)
 */
@Injectable()
export class InventoryReconcileService {
  private readonly logger = new Logger(InventoryReconcileService.name);

  /** Batch size per reconciliation pass. (§16.1) */
  static readonly BATCH_SIZE = 100;
  /** Drift threshold: >10 units deviation = CRITICAL. (§16.1) */
  static readonly CRITICAL_DRIFT_THRESHOLD = 10;

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: InventoryMetrics,
    private readonly snapshotRepo: SnapshotRepository,
  ) {}

  /**
   * Run incremental reconciliation from a checkpoint.
   *
   * Processes BATCH_SIZE records updated since `checkpoint`.
   * Returns nextCheckpoint (the updatedAt of the last processed record).
   * Caller (cron worker) persists nextCheckpoint and calls again until nextCheckpoint === null.
   *
   * FORBIDDEN: offset-based pagination — uses cursor (updatedAt asc, id asc). (WARNING 13)
   * FORBIDDEN: auto-correct any drift — alert only (§16.1)
   */
  async runIncrementalReconciliation(
    checkpoint: Date,
    cursorId?: string,
  ): Promise<ReconciliationResult> {
    const batch = await this.inventoryRepo_findUpdatedSince(
      checkpoint,
      cursorId,
    );

    if (batch.length === 0) {
      return {
        processedCount: 0,
        driftCount: 0,
        criticalDriftCount: 0,
        nextCheckpoint: null,
      };
    }

    const inventoryIds = batch.map((r) => r.id);
    const snapshotDate = new Date(); // Server time for snapshot (§5.3)

    // Fetch latest snapshots for all IDs in batch — strongly typed $queryRaw (§3.6)
    const latestSnapshots = await this._fetchLatestSnapshots(inventoryIds);
    const snapshotByInventoryId = new Map<string, InventorySnapshotRaw>(
      latestSnapshots.map((s) => [s.inventoryId, s]),
    );

    const driftRecords: InventoryDriftRecord[] = [];
    const snapshotInputs: {
      inventoryId: string;
      quantity: number;
      reservedQty: number;
      damagedQty: number;
      snapshotDate: Date;
    }[] = [];

    for (const inv of batch) {
      // Always write a snapshot (append-only — §0 INV-7)
      snapshotInputs.push({
        inventoryId: inv.id,
        quantity: inv.quantity,
        reservedQty: inv.reservedQty,
        damagedQty: inv.damagedQty,
        snapshotDate,
      });

      // Drift detection vs previous snapshot
      const prev = snapshotByInventoryId.get(inv.id);
      if (prev) {
        const drift = inv.quantity - prev.quantity;
        if (Math.abs(drift) > 0) {
          const isCritical =
            Math.abs(drift) >
            InventoryReconcileService.CRITICAL_DRIFT_THRESHOLD;
          driftRecords.push({
            inventoryId: inv.id,
            productId: inv.productId,
            snapshotQuantity: prev.quantity,
            liveQuantity: inv.quantity,
            drift,
            isCritical,
          });
        }
      }
    }

    // Batch write snapshots — idempotent createMany with skipDuplicates (§20.4)
    if (snapshotInputs.length > 0) {
      await this.snapshotRepo.createMany(snapshotInputs);
    }

    // Alert on drifts — NEVER auto-correct (§16.1)
    let criticalDriftCount = 0;
    for (const drift of driftRecords) {
      if (drift.isCritical) {
        criticalDriftCount++;
        this.logger.error(
          {
            inventoryId: drift.inventoryId,
            productId: drift.productId,
            drift: drift.drift,
            snapshotQuantity: drift.snapshotQuantity,
            liveQuantity: drift.liveQuantity,
          },
          'CRITICAL INVENTORY DRIFT — manual reconciliation required',
        );
        this.metrics.driftDetected(drift.inventoryId, true);
      } else {
        this.logger.warn(
          {
            inventoryId: drift.inventoryId,
            productId: drift.productId,
            drift: drift.drift,
          },
          'Inventory drift detected',
        );
        this.metrics.driftDetected(drift.inventoryId, false);
      }
    }

    // Compute next checkpoint from last processed record
    const lastRecord = batch[batch.length - 1];
    const nextCheckpoint =
      batch.length >= InventoryReconcileService.BATCH_SIZE
        ? lastRecord.updatedAt
        : null;

    this.logger.log(
      {
        processed: batch.length,
        driftCount: driftRecords.length,
        criticalDriftCount,
        nextCheckpoint: nextCheckpoint?.toISOString() ?? 'COMPLETE',
      },
      'Incremental reconciliation batch complete',
    );

    return {
      processedCount: batch.length,
      driftCount: driftRecords.length,
      criticalDriftCount,
      nextCheckpoint,
    };
  }

  /**
   * Cursor-based inventory fetch — NOT offset-based (WARNING 13).
   * Orders by updatedAt ASC, id ASC for stable pagination.
   * Uses idx_inv_updated_at index (§9.5).
   */
  private async inventoryRepo_findUpdatedSince(
    checkpoint: Date,
    cursorId?: string,
  ): Promise<
    {
      id: string;
      productId: string;
      quantity: number;
      reservedQty: number;
      damagedQty: number;
      updatedAt: Date;
    }[]
  > {
    // Strongly typed $queryRaw — no any[] (§3.6)
    if (cursorId) {
      return this.prisma.$queryRaw<
        {
          id: string;
          productId: string;
          quantity: number;
          reservedQty: number;
          damagedQty: number;
          updatedAt: Date;
        }[]
      >(
        Prisma.sql`
          SELECT id, "productId", quantity, "reservedQty", "damagedQty", "updatedAt"
          FROM "Inventory"
          WHERE "updatedAt" > ${checkpoint}
            AND id > ${cursorId}
          ORDER BY "updatedAt" ASC, id ASC
          LIMIT ${InventoryReconcileService.BATCH_SIZE}
        `,
      );
    }
    return this.prisma.$queryRaw<
      {
        id: string;
        productId: string;
        quantity: number;
        reservedQty: number;
        damagedQty: number;
        updatedAt: Date;
      }[]
    >(
      Prisma.sql`
        SELECT id, "productId", quantity, "reservedQty", "damagedQty", "updatedAt"
        FROM "Inventory"
        WHERE "updatedAt" > ${checkpoint}
        ORDER BY "updatedAt" ASC, id ASC
        LIMIT ${InventoryReconcileService.BATCH_SIZE}
      `,
    );
  }

  /**
   * Fetch latest snapshot per inventoryId — strongly typed $queryRaw (§3.6).
   * Uses DISTINCT ON (inventoryId) ORDER BY snapshotDate DESC for single-query fetch.
   */
  private async _fetchLatestSnapshots(
    inventoryIds: string[],
  ): Promise<InventorySnapshotRaw[]> {
    if (inventoryIds.length === 0) return [];
    return this.prisma.$queryRaw<InventorySnapshotRaw[]>(
      Prisma.sql`
        SELECT DISTINCT ON ("inventoryId")
          id, "inventoryId", quantity, "reservedQty", "damagedQty", "snapshotDate"
        FROM "InventorySnapshot"
        WHERE "inventoryId" = ANY(${inventoryIds}::text[])
        ORDER BY "inventoryId", "snapshotDate" DESC
      `,
    );
  }
}
