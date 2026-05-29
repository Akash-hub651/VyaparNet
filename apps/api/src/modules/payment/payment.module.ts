import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { RedisModule } from '../../core/redis/redis.module';
import { OrderModule } from '../order/order.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PaymentController } from './payment.controller';
import { WebhookController } from './webhook.controller';
import { PaymentService } from './payment.service';
import { PaymentRepository } from './payment.repository';
import { RazorpayPaymentProvider } from './providers/razorpay.provider';
import { PaymentWebhookProcessorWorker } from './workers/payment-webhook-processor.worker';
import { PaymentReconciliationWorker } from './workers/payment-reconciliation.worker';
import { PaymentRetryExpiryWorker } from './workers/payment-retry-expiry.worker';
import { MetricsGaugeScannerWorker } from './workers/metrics-gauge-scanner.worker';
import { PAYMENT_PROVIDER_TOKEN } from '@vyaparnet/types';

/**
 * PaymentModule — §11.2 Module Dependency Rules
 *
 * Authority: SPRINT_4_EXECUTION_LOCK_FINAL.md §11.2
 *
 * OWNS: Payment table (PaymentRepository)
 * IMPORTS: forwardRef(OrderModule) — to update order status and read order data
 * EXPORTS: PaymentService — consumed by OrderModule for COD payment creation reference
 *
 * PROVIDER INJECTION:
 *   PAYMENT_PROVIDER_TOKEN → RazorpayPaymentProvider
 *   This DI token pattern ensures Razorpay SDK is ONLY imported in razorpay.provider.ts
 *   All other services inject the interface via the token — no Razorpay import leak.
 *
 * BULLMQ:
 *   'payments' queue: PaymentWebhookProcessorWorker processes webhooks
 *   Retry policy: 3 attempts, exponential backoff 2s/4s/8s (§14.4)
 *   On failure (DLQ): alert ops — unprocessed webhook = unconfirmed order
 */
@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    RedisModule,
    BullModule.registerQueue({
      name: 'payments',
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    }),
    // HARDENED: forwardRef prevents circular dependency (PaymentModule ↔ OrderModule)
    forwardRef(() => OrderModule),
    // InventoryModule — for consume() and releaseAllForOrder() in webhook processor
    InventoryModule,
  ],
  controllers: [
    PaymentController,
    WebhookController,
  ],
  providers: [
    PaymentService,
    PaymentRepository,
    // HARDENED: PAYMENT_PROVIDER_TOKEN DI pattern — Razorpay import ISOLATED to razorpay.provider.ts
    {
      provide: PAYMENT_PROVIDER_TOKEN,
      useClass: RazorpayPaymentProvider,
    },
    // BullMQ Workers
    PaymentWebhookProcessorWorker,
    PaymentReconciliationWorker,
    PaymentRetryExpiryWorker,
    // HARDENED (OPTIONAL-3): Metrics gauge scanner — populates orderStuckInPlacedTotal
    // and bullmqPaymentDlqSize gauges every 2 minutes (previously registered but never updated)
    MetricsGaugeScannerWorker,
  ],
  exports: [PaymentService],
})
export class PaymentModule {}
