import { Processor, Process, InjectQueue } from '@nestjs/bull';
import { Logger, OnModuleInit, Inject } from '@nestjs/common';
import { Job, Queue } from 'bull';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { PAYMENT_PROVIDER_TOKEN } from '@vyaparnet/types';
import type { PaymentProvider } from '@vyaparnet/types';
import { MetricsService } from '../../observability/metrics.service';

/**
 * PaymentReconciliationWorker — §17.1, §16.2
 *
 * Authority: SPRINT_4_EXECUTION_LOCK_FINAL.md §16.2
 *
 * Runs every 5 minutes.
 * Queries PENDING payments > 10 min old, polls Razorpay API, and
 * synthesizes webhook events if missed.
 *
 * HARDENED (OPTIONAL-1): paymentReconciliationRunTotal, paymentReconciliationMissedTotal,
 *   and paymentReconciliationLatencyMs are now populated on every run.
 *   Previously these metrics were registered but never incremented — Prometheus dashboards
 *   showed 0 for all reconciliation metrics, hiding operational blind spots.
 */
@Processor('payments')
export class PaymentReconciliationWorker implements OnModuleInit {
  private readonly logger = new Logger(PaymentReconciliationWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('payments') private readonly paymentsQueue: Queue,
    @Inject(PAYMENT_PROVIDER_TOKEN)
    private readonly paymentProvider: PaymentProvider,
    private readonly metrics: MetricsService,
  ) {}

  async onModuleInit() {
    // HARDENED (§14.3): Stable jobId prevents duplicate crons on API restart
    await this.paymentsQueue.add(
      'payment-reconciliation',
      {},
      {
        repeat: { cron: '*/5 * * * *' },
        jobId: 'payment-reconciliation-cron', // Stable JobId Verification
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
    this.logger.log('Registered payment-reconciliation cron job');
  }

  @Process('payment-reconciliation')
  async handle(_job: Job): Promise<void> {
    const startMs = Date.now();

    // HARDENED (OPTIONAL-1): Increment run counter at the start of every execution
    this.metrics.paymentReconciliationRunTotal.inc();

    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

    const pendingPayments = await this.prisma.payment.findMany({
      where: {
        status: 'PENDING',
        createdAt: { lt: tenMinutesAgo },
        gatewayRef: { not: null },
      },
      select: {
        id: true,
        orderId: true,
        gatewayRef: true,
        createdAt: true,
      },
    });

    if (pendingPayments.length === 0) {
      // HARDENED (OPTIONAL-1): Record latency even on empty runs for baseline tracking
      this.metrics.paymentReconciliationLatencyMs.observe(Date.now() - startMs);
      return;
    }

    this.logger.log(
      `Found ${pendingPayments.length} pending payments for reconciliation`,
    );

    let reconciliationMissedCount = 0;

    for (const payment of pendingPayments) {
      if (!payment.gatewayRef) continue;

      try {
        const status = await this.paymentProvider.getPaymentStatus(
          payment.gatewayRef,
        );
        const ageMs = Date.now() - payment.createdAt.getTime();
        const ageMins = ageMs / (1000 * 60);

        if (status.status === 'CAPTURED') {
          // Synthesize captured webhook
          await this.paymentsQueue.add('process-webhook', {
            razorpayEventId: `sync-cap-${payment.id}`,
            eventType: 'payment.captured',
            payload: {
              payment: {
                entity: {
                  order_id: payment.gatewayRef,
                  amount: undefined,
                  id: 'sync-captured',
                },
              },
            },
          });
          reconciliationMissedCount++;
          // HARDENED (OPTIONAL-1): Track each missed webhook detection
          this.metrics.paymentReconciliationMissedTotal.inc();
          this.logger.warn(
            { paymentId: payment.id, gatewayRef: payment.gatewayRef },
            'Missed webhook detected — synthesized payment.captured',
          );
        } else if (status.status === 'FAILED') {
          // Synthesize failed webhook
          await this.paymentsQueue.add('process-webhook', {
            razorpayEventId: `sync-fail-${payment.id}`,
            eventType: 'payment.failed',
            payload: {
              payment: {
                entity: {
                  order_id: payment.gatewayRef,
                  error_description: status.failedReason,
                },
              },
            },
          });
          reconciliationMissedCount++;
          // HARDENED (OPTIONAL-1): Track each missed webhook detection
          this.metrics.paymentReconciliationMissedTotal.inc();
          this.logger.warn(
            { paymentId: payment.id, gatewayRef: payment.gatewayRef },
            'Missed webhook detected — synthesized payment.failed',
          );
        } else if (status.status === 'PENDING' && ageMins > 30) {
          // Force failed (Razorpay UPI max wait time is ~30 min)
          await this.paymentsQueue.add('process-webhook', {
            razorpayEventId: `sync-timeout-${payment.id}`,
            eventType: 'payment.failed',
            payload: {
              payment: {
                entity: {
                  order_id: payment.gatewayRef,
                  error_description:
                    'Payment timed out (reconciliation force fail)',
                },
              },
            },
          });
          reconciliationMissedCount++;
          // HARDENED (OPTIONAL-1): Track each force-failed timeout
          this.metrics.paymentReconciliationMissedTotal.inc();
          this.logger.warn(
            { paymentId: payment.id, gatewayRef: payment.gatewayRef, ageMins },
            'Payment pending >30min — synthesized payment.failed timeout',
          );
        }
      } catch (err) {
        this.logger.error(
          { paymentId: payment.id, gatewayRef: payment.gatewayRef, err },
          'Failed to reconcile payment status from provider',
        );
      }
    }

    // HARDENED (OPTIONAL-1): Record latency histogram for this run
    this.metrics.paymentReconciliationLatencyMs.observe(Date.now() - startMs);

    if (reconciliationMissedCount > 10) {
      this.logger.error(
        { reconciliationMissedCount },
        'CRITICAL: High number of missed webhooks detected in a single run. Check Razorpay webhook delivery.',
      );
    }
  }
}
