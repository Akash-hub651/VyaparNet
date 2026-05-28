import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bull';
import { InjectQueue } from '@nestjs/bull';
import { InventoryService } from './inventory.service';
import { ReservationRepository } from './repositories/reservation.repository';
import { SnapshotRepository } from './repositories/snapshot.repository';
import { InventoryRepository } from './repositories/inventory.repository';
import { InventoryReconcileService } from './inventory-reconcile.service';

/**
 * InventoryProcessor — BullMQ Worker for Inventory background jobs.
 *
 * Authority: SPRINT3_EXECUTION_LOCK_FINAL.md §20.4
 */
@Processor('inventory')
export class InventoryProcessor {
  private readonly logger = new Logger(InventoryProcessor.name);

  constructor(
    private readonly inventoryService: InventoryService,
    private readonly reservationRepo: ReservationRepository,
    private readonly snapshotRepo: SnapshotRepository,
    private readonly inventoryRepo: InventoryRepository,
    private readonly reconcileService: InventoryReconcileService,
    @InjectQueue('inventory') private readonly inventoryQueue: Queue,
  ) {}

  @Process('expire-reservations')
  async handleExpireReservations(job: Job) {
    this.logger.log(`Processing expire-reservations job ${job.id}`);

    // Batch: findExpiredActive(100)
    const BATCH_SIZE = 100;
    const expiredReservations =
      await this.reservationRepo.findExpiredActive(BATCH_SIZE);

    if (expiredReservations.length === 0) {
      return { count: 0 };
    }

    let successCount = 0;
    let failCount = 0;

    // Each release in isolated try/catch — one failure MUST NOT block others
    for (const res of expiredReservations) {
      try {
        await this.inventoryService.release(res.id, 'EXPIRY', 'SYSTEM');
        successCount++;
      } catch (err) {
        this.logger.error(
          `Failed to release expired reservation ${res.id}`,
          err,
        );
        failCount++;
      }
    }

    this.logger.log(
      `Expired reservations batch complete. Released: ${successCount}, Failed: ${failCount}`,
    );

    // If batch was full, schedule immediate re-run (1s delay)
    if (expiredReservations.length === BATCH_SIZE) {
      this.logger.log(
        `Batch size reached (${BATCH_SIZE}), scheduling immediate re-run...`,
      );
      await this.inventoryQueue.add('expire-reservations', {}, { delay: 1000 });
    }

    return {
      processed: expiredReservations.length,
      success: successCount,
      failed: failCount,
    };
  }

  @Process('daily-snapshot')
  async handleDailySnapshot(job: Job) {
    this.logger.log(`Processing daily-snapshot job ${job.id}`);

    const BATCH_SIZE = 500;
    let cursor: string | undefined = undefined;
    let totalSnapshots = 0;
    const snapshotDate = new Date(); // Use same date for the entire snapshot run

    while (true) {
      // Paginated cursor batches — NEVER offset pagination
      const batch = await this.inventoryRepo.findUpdatedSince(
        new Date(0), // snapshot everything
        BATCH_SIZE,
        cursor,
      );

      if (batch.length === 0) {
        break;
      }

      const snapshotInputs = batch.map((inv) => ({
        inventoryId: inv.id,
        quantity: inv.quantity,
        reservedQty: inv.reservedQty,
        damagedQty: inv.damagedQty,
        snapshotDate,
      }));

      // createMany({ skipDuplicates: true }) — idempotent
      const result = await this.snapshotRepo.createMany(snapshotInputs);
      totalSnapshots += result.count;

      if (batch.length < BATCH_SIZE) {
        break;
      }

      // Update cursor for next batch
      cursor = batch[batch.length - 1].id;
    }

    this.logger.log(
      `Daily snapshot complete. Total snapshots created: ${totalSnapshots}`,
    );
    return { count: totalSnapshots };
  }

  @Process('incremental-reconciliation')
  async handleIncrementalReconciliation(job: Job) {
    this.logger.log(`Processing incremental-reconciliation job ${job.id}`);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const result =
      await this.reconcileService.runIncrementalReconciliation(oneHourAgo);
    this.logger.log(
      `Incremental reconciliation complete. Result: ${JSON.stringify(result)}`,
    );
    return result;
  }
}
