import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { QuotationRepository } from '../rfq/quotation.repository';
import { AuditSafeWriterService } from '../../security/audit/audit-safe-writer.service';
import { SystemActorType } from '@vyaparnet/types';

@Processor('quote-expiry')
export class QuoteExpiryWorker {
  private readonly logger = new Logger(QuoteExpiryWorker.name);

  constructor(
    private readonly quotationRepo: QuotationRepository,
    private readonly auditSafeWriter: AuditSafeWriterService,
  ) {}

  @Process()
  async process(job: Job<any>): Promise<any> {
    this.logger.log({ jobId: job.id }, 'QuoteExpiryWorker started processing');

    try {
      const count = await this.quotationRepo.markExpired(new Date());
      this.logger.log({ expiredCount: count }, 'Expired quotes marked');

      if (count > 0) {
        // this.metrics.quoteExpiredTotal?.inc(count);
        // We log one system event for the batch to save space, but in a real system we might log each if we load the IDs first.
        await this.auditSafeWriter.safeWrite({
          action: 'QUOTATION_EXPIRED' as any,
          actorId: 'SYSTEM',
          entityId: 'BATCH',
          entityType: 'QUOTATION',
          newValue: { count },
          actorRole: SystemActorType.SYSTEM,
        });
      }
      return { expiredCount: count };
    } catch (err) {
      this.logger.error({ err }, 'QuoteExpiryWorker failed');
      throw err;
    }
  }
}
