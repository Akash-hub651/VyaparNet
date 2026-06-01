import { Processor, Process, InjectQueue } from '@nestjs/bull';
import { Logger, OnModuleInit } from '@nestjs/common';
import { Job, Queue } from 'bull';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { formatYearMonth } from '../../order/order-state-machine';

/**
 * CartCleanupWorker — §10.4
 *
 * Authority: SPRINT_4_EXECUTION_LOCK_FINAL.md §10.4
 *
 * Runs daily. Soft-deletes carts with updatedAt < 30 days ago AND status = ACTIVE.
 * Creates CartAbandoned EventOutbox event for each cleaned cart.
 */
@Processor('orders')
export class CartCleanupWorker implements OnModuleInit {
  private readonly logger = new Logger(CartCleanupWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('orders') private readonly ordersQueue: Queue,
  ) {}

  async onModuleInit() {
    // HARDENED (§14.3): Stable jobId prevents duplicate crons on API restart
    await this.ordersQueue.add(
      'cart-cleanup',
      {},
      {
        repeat: { cron: '0 2 * * *' }, // Daily at 2AM
        jobId: 'cart-cleanup-cron', // Stable JobId Verification
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
    this.logger.log('Registered cart-cleanup cron job');
  }

  @Process('cart-cleanup')
  async handle(_job: Job): Promise<void> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const abandonedCarts = await this.prisma.cart.findMany({
      where: { status: 'ACTIVE', updatedAt: { lt: thirtyDaysAgo } },
      include: { items: true },
    });

    if (abandonedCarts.length === 0) return;

    this.logger.log(
      `Found ${abandonedCarts.length} abandoned carts for cleanup`,
    );

    for (const cart of abandonedCarts) {
      try {
        await this.prisma.$transaction(
          async (tx) => {
            await tx.cart.update({
              where: { id: cart.id },
              data: { status: 'ABANDONED' },
            });

            // HARDENED (INV-20): eventVersion + schemaVersion MANDATORY
            await tx.eventOutbox.create({
              data: {
                eventType: 'CartAbandoned',
                eventVersion: '1.0', // MANDATORY (INV-20)
                schemaVersion: '4.3', // MANDATORY (INV-20)
                payload: {
                  cartId: cart.id,
                  userId: cart.userId,
                  segment: cart.segment,
                  itemCount: cart.items.length,
                },
                deduplicationKey: `cart-abandoned-${cart.id}`,
                eventMonth: formatYearMonth(new Date()),
                status: 'PENDING',
              },
            });
          },
          { timeout: 5000, isolationLevel: 'ReadCommitted' },
        );
      } catch (err) {
        this.logger.error(
          { cartId: cart.id, err },
          'Failed to process cart cleanup for cart',
        );
      }
    }
  }
}
