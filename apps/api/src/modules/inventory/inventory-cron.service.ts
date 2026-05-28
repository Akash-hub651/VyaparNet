import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

/**
 * InventoryCronService — Registers recurring background workers.
 *
 * Authority: SPRINT3_EXECUTION_LOCK_FINAL.md §22
 *
 * CRITICAL INVARIANTS:
 * - stable jobId prevents cron duplication on API restart (§34 Warning 9).
 * - Each API restart without stable jobId = another duplicate cron schedule.
 */
@Injectable()
export class InventoryCronService implements OnModuleInit {
  private readonly logger = new Logger(InventoryCronService.name);

  constructor(
    @InjectQueue('inventory')
    private readonly inventoryQueue: Queue,
  ) {}

  async onModuleInit() {
    this.logger.log('Registering inventory cron jobs...');

    await this.inventoryQueue.add(
      'expire-reservations',
      {},
      {
        repeat: { cron: '*/5 * * * *' },
        jobId: 'expire-reservations-cron', // STABLE — mandatory
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { count: 10 },
        removeOnFail: { count: 100 },
      },
    );

    await this.inventoryQueue.add(
      'daily-snapshot',
      {},
      {
        repeat: { cron: '0 2 * * *' },
        jobId: 'daily-snapshot-cron', // STABLE — mandatory
        attempts: 1,
        removeOnComplete: { count: 5 },
      },
    );

    await this.inventoryQueue.add(
      'incremental-reconciliation',
      {},
      {
        repeat: { cron: '0 * * * *' },
        jobId: 'incremental-reconciliation-cron', // STABLE — mandatory
        attempts: 2,
        backoff: { type: 'fixed', delay: 30000 },
        removeOnComplete: { count: 24 },
        removeOnFail: { count: 48 },
      },
    );

    this.logger.log('Inventory cron jobs registered successfully.');
  }
}
