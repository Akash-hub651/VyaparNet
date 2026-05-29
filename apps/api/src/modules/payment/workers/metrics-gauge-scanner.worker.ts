import { Processor, Process, InjectQueue } from '@nestjs/bull';
import { Logger, OnModuleInit } from '@nestjs/common';
import { Job, Queue } from 'bull';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { MetricsService } from '../../observability/metrics.service';

/**
 * MetricsGaugeScannerWorker — OPTIONAL-3
 *
 * Authority: SPRINT_4_EXECUTION_LOCK_FINAL.md §19.1 + Audit OPTIONAL-3
 *
 * Runs every 2 minutes to update two gauges that were registered in
 * metrics.providers.ts but never populated:
 *
 *   1. order_stuck_in_placed_total — counts Orders in PLACED state for >30 min.
 *      A non-zero value indicates a potential webhook delivery failure or
 *      a payment flow that never transitioned the order out of PLACED.
 *      Used to trigger PagerDuty / alerting via Prometheus alerting rules.
 *
 *   2. bullmq_payment_dlq_size — counts failed jobs in the payments queue.
 *      BullMQ failed jobs (removeOnFail: false scenarios) indicate unrecoverable
 *      processing failures. Operations team must investigate these immediately.
 *
 * GOVERNANCE:
 *   - This worker is a READ-ONLY observer — no state mutations.
 *   - Runs on the existing 'payments' queue (no new queue needed).
 *   - Uses stable jobId to prevent duplicate crons on restart (§14.3).
 */
@Processor('payments')
export class MetricsGaugeScannerWorker implements OnModuleInit {
  private readonly logger = new Logger(MetricsGaugeScannerWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('payments') private readonly paymentsQueue: Queue,
    private readonly metrics: MetricsService,
  ) {}

  async onModuleInit() {
    // HARDENED (§14.3): Stable jobId prevents duplicate crons on API restart
    await this.paymentsQueue.add(
      'metrics-gauge-scan',
      {},
      {
        repeat: { cron: '*/2 * * * *' },
        jobId: 'metrics-gauge-scan-cron', // Stable JobId — no duplicates on restart
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
    this.logger.log('Registered metrics-gauge-scan cron job');
  }

  @Process('metrics-gauge-scan')
  async handle(_job: Job): Promise<void> {
    try {
      await Promise.all([
        this.updateStuckOrdersGauge(),
        this.updateDlqSizeGauge(),
      ]);
    } catch (err) {
      // Non-fatal — metric update failure must never impact business operations
      this.logger.warn({ err }, 'metrics-gauge-scan encountered an error — gauges may be stale');
    }
  }

  /**
   * OPTIONAL-3a: Count orders stuck in PLACED state for >30 minutes.
   *
   * PLACED + age > 30min means no payment event was received for the order.
   * Possible causes:
   *   - Razorpay webhook delivery failure (reconciliation worker handles this)
   *   - COD order not transitioned to CONFIRMED (missing business logic)
   *   - Queue processing backlog causing webhook processor stall
   *
   * A non-zero gauge should trigger an alert to investigate reconciliation.
   */
  private async updateStuckOrdersGauge(): Promise<void> {
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

    const count = await this.prisma.order.count({
      where: {
        status: 'PLACED',
        createdAt: { lt: thirtyMinutesAgo },
        isDeleted: false,
      },
    });

    this.metrics.orderStuckInPlacedTotal.set(count);

    if (count > 0) {
      this.logger.warn(
        { stuckOrderCount: count },
        `HARDENED (OPTIONAL-3): ${count} order(s) stuck in PLACED state for >30min — check reconciliation worker and webhook delivery`,
      );
    }
  }

  /**
   * OPTIONAL-3b: Count failed jobs in the payments BullMQ queue (DLQ size).
   *
   * Failed jobs indicate payment webhook processing failures that exhausted
   * all BullMQ retries. These represent orders whose status may not have been
   * updated correctly. Operations team must investigate and replay or manually
   * resolve each failed job.
   *
   * BullMQ `removeOnFail: 500` means up to 500 failed jobs are retained.
   * This gauge shows the current count of retained failed jobs.
   */
  private async updateDlqSizeGauge(): Promise<void> {
    const failedCount = await this.paymentsQueue.getFailedCount();

    this.metrics.bullmqPaymentDlqSize.set(failedCount);

    if (failedCount > 0) {
      this.logger.warn(
        { failedJobCount: failedCount },
        `HARDENED (OPTIONAL-3): ${failedCount} failed job(s) in payments queue DLQ — investigate and replay if needed`,
      );
    }
  }
}
