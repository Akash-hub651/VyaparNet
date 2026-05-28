import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { Segment } from '@vyaparnet/database';

export interface ProductCreatedPayload {
  aggregateId: string;
  aggregateType: string;
  productId: string;
  segment: Segment;
  status: string;
}

@Injectable()
export class InventoryEventConsumer {
  private readonly logger = new Logger(InventoryEventConsumer.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Idempotently consumer for ProductCreated outbox event.
   * Initializes inventory record with quantity=0 if it does not already exist.
   *
   * Authority: SPRINT3_EXECUTION_LOCK_FINAL.md §27 Phase 6
   */
  async handleProductCreated(payload: ProductCreatedPayload): Promise<void> {
    const { productId, segment } = payload;
    this.logger.log(`Received ProductCreated event for product: ${productId}`);

    if (!productId) {
      this.logger.warn('ProductCreated event missing productId. Skipping.');
      return;
    }

    try {
      // ── Step 1: Idempotency check ──
      const existing = await this.prisma.inventory.findUnique({
        where: { productId },
      });

      if (existing) {
        this.logger.log(
          `Inventory record already exists for product ${productId}. Skipping initialization.`,
        );
        return;
      }

      // ── Step 2: Load product to get businessId (sellerId) ──
      const product = await this.prisma.product.findUnique({
        where: { id: productId },
        select: { businessId: true },
      });

      if (!product) {
        this.logger.error(
          `Product record ${productId} not found in database. Cannot initialize inventory.`,
        );
        return;
      }

      // ── Step 3: Create inventory record with quantity=0 ──
      await this.prisma.inventory.create({
        data: {
          productId,
          businessId: product.businessId,
          segment,
          quantity: 0,
          reservedQty: 0,
          damagedQty: 0,
          incomingQty: 0,
          lowStockThreshold: 10,
          isLowStock: false,
        },
      });

      this.logger.log(
        `Successfully initialized inventory (qty=0) for product ${productId} under business ${product.businessId}.`,
      );
    } catch (error) {
      this.logger.error(
        `Error processing ProductCreated event for product ${productId}`,
        error,
      );
      throw error; // Let the caller/processor catch it for retries/DLQ
    }
  }
}
