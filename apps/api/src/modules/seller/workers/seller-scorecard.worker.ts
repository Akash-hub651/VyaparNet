import { Processor, Process, InjectQueue } from '@nestjs/bull';
import { Logger, OnModuleInit } from '@nestjs/common';
import { Job, Queue } from 'bull';
import { SellerScorecardService } from '../services/seller-scorecard.service';

/**
 * SellerScorecardWorker — Phase 7
 *
 * Authority: SPRINT_5_EXECUTION_LOCK_FINAL.md §20
 *
 * BullMQ cron that runs every 6 hours to compute seller scorecards.
 *
 * Key invariants enforced here:
 * - INV-S5-19: Stable jobId 'seller-scorecard-cron' — prevents duplicate jobs on API restart.
 *              Without a stable jobId, every restart adds another cron entry in Redis.
 *              BullMQ deduplicates by jobId — same jobId = no duplicate.
 * - INV-S5-40: SUSPENDED businesses skipped (enforced in SellerScorecardService).
 * - BullMQ down: API still starts — onModuleInit queue.add() failure is caught and logged.
 *
 * TRANSACTION BOUNDARY: Worker calls SellerScorecardService which has NO $transaction
 * for the EventOutbox create — SupplierScoreUpdated is OUTSIDE the score upsert
 * (§4 boundary rule: EventOutbox for cron jobs is outside DB transaction).
 */
@Processor('scorecard')
export class SellerScorecardWorker implements OnModuleInit {
  private readonly logger = new Logger(SellerScorecardWorker.name);

  constructor(
    private readonly sellerScorecardService: SellerScorecardService,
    @InjectQueue('scorecard') private readonly scorecardQueue: Queue,
  ) {}

  /**
   * Register the 6-hour repeating cron on module init.
   * INV-S5-19: jobId MUST be 'seller-scorecard-cron' — stable, deterministic string.
   * If this value changes, existing crons are NOT removed → duplicate jobs accumulate.
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.scorecardQueue.add(
        'compute-scorecards',
        {},
        {
          repeat: { cron: '0 */6 * * *' }, // every 6 hours at :00
          jobId: 'seller-scorecard-cron', // INV-S5-19: stable jobId — NO duplicates on restart
          removeOnComplete: true,
          removeOnFail: true,
        },
      );
      this.logger.log('Registered seller-scorecard-cron job (every 6 hours)');
    } catch (err) {
      // BullMQ down → API still starts; scorecard cron failure is isolated (§12 degraded mode)
      this.logger.error(
        { error: (err as Error).message },
        'Failed to register seller-scorecard-cron — BullMQ may be unavailable',
      );
    }
  }

  /**
   * Handles the 'compute-scorecards' job.
   * All scoring logic is delegated to SellerScorecardService.
   * Per-business failures are isolated inside the service (try/catch per business loop).
   */
  @Process('compute-scorecards')
  async handle(_job: Job): Promise<void> {
    this.logger.log('seller-scorecard-cron triggered — starting computation');
    await this.sellerScorecardService.runFullScorecardComputation();
    this.logger.log('seller-scorecard-cron finished');
  }

  @Process('increment-return-rate')
  async handleReturnRate(job: Job<{ businessId: string; segment: any }>): Promise<void> {
    this.logger.log({ businessId: job.data.businessId }, 'Processing increment-return-rate');
    await this.sellerScorecardService.incrementReturnRate(job.data.businessId, job.data.segment);
  }

  @Process('increment-dispute-rate')
  async handleDisputeRate(job: Job<{ businessId: string; segment: any }>): Promise<void> {
    this.logger.log({ businessId: job.data.businessId }, 'Processing increment-dispute-rate');
    await this.sellerScorecardService.incrementDisputeRate(job.data.businessId, job.data.segment);
  }
}
