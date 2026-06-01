import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { RedisService } from '../../../core/redis/redis.service';
import { InventoryService } from '../../inventory/inventory.service';
import { CartService } from '../../cart/cart.service';
import { BuyerOrderRepository } from '../repositories/buyer-order.repository';
import { MetricsService } from '../../observability/metrics.service';
import { ReorderResultDto, ReorderWarningDto } from '@vyaparnet/types';
import { Prisma } from '@vyaparnet/database';

/**
 * BuyerReorderService — Phase 8
 *
 * Authority: SPRINT_5_EXECUTION_LOCK_FINAL.md §21
 *
 * Implements 1-tap reorder.
 * - INV-S5-12: ALWAYS uses current product.basePrice, NEVER OrderItem.unitPrice (historical).
 * - INV-S5-13: ALL skipped items MUST appear in warnings[]. No silent skips.
 * - INV-S5-25: Rate limited to 5 reorders per buyer per hour.
 * - INV-S5-27: InventoryService is the SOLE authority for stock checks.
 * - INV-S5-37: Redis down on rate limit -> 503 Service Unavailable (NEVER fail-open).
 *
 * AI-3 Fix: Removed array mutation (splice) inside for...of loop.
 *           Now uses a separate `successfullyAddedCount` counter and `failedProductIds` set.
 */
@Injectable()
export class BuyerReorderService {
  private readonly logger = new Logger(BuyerReorderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly inventoryService: InventoryService,
    private readonly cartService: CartService,
    private readonly buyerOrderRepo: BuyerOrderRepository,
    private readonly metrics: MetricsService,
  ) {}

  async reorder(orderId: string, buyerId: string): Promise<ReorderResultDto> {
    // ─────────────────────────────────────────────────────────────────
    // STEP 1: Rate limit (INV-S5-25) — 5 reorders per buyer per hour
    // ─────────────────────────────────────────────────────────────────
    // CONSERVATIVE FAIL-SAFE (INV-S5-37): If Redis is unreachable, do NOT fail-open.
    // Unlimited reorder on Redis outage = abuse vector.
    const rateLimitKey = `reorder_rate:${buyerId}`;
    try {
      // Atomic INCR + EXPIRE via Lua script (INV-21)
      const RATE_LIMIT_LUA_SCRIPT = `
        local current = redis.call('INCR', KEYS[1])
        if current == 1 then
          redis.call('EXPIRE', KEYS[1], ARGV[1])
        end
        return current
      `;

      const rateLimitResult = await this.redis.eval(
        RATE_LIMIT_LUA_SCRIPT,
        1, // numberOfKeys
        rateLimitKey, // KEYS[1]
        '3600', // ARGV[1] — TTL in seconds (1 hour)
      );

      if (Number(rateLimitResult) > 5) {
        throw new HttpException(
          { code: 'REORDER_RATE_LIMIT_EXCEEDED' },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    } catch (err) {
      if (
        err instanceof HttpException &&
        err.getStatus() === HttpStatus.TOO_MANY_REQUESTS
      ) {
        throw err; // re-throw rate limit rejection
      }

      // Redis unavailable — conservative policy: reject with 503 (INV-S5-37)
      // NEVER fail-open (allow unlimited) when rate limit cannot be verified
      this.logger.warn(
        { buyerId, error: (err as Error).message },
        'REORDER_RATE_LIMIT_REDIS_DOWN',
      );
      throw new ServiceUnavailableException({
        code: 'RATE_LIMIT_UNAVAILABLE_TRY_LATER',
      });
    }

    // ─────────────────────────────────────────────────────────────────
    // STEP 2: Load original order (with buyerId ownership check) (INV-18)
    // findByIdForBuyer throws NotFoundException if not found/not owned
    // ─────────────────────────────────────────────────────────────────
    const originalOrder = await this.buyerOrderRepo.findByIdForBuyer(
      orderId,
      buyerId,
    );

    const originalItems = await this.prisma.orderItem.findMany({
      where: { orderId },
      include: {
        product: {
          select: {
            id: true,
            basePrice: true,
            isActive: true,
            isDeleted: true,
            segment: true,
            name: true,
          },
        },
      },
    });

    const warnings: ReorderWarningDto[] = [];
    const itemsToAdd: Array<{
      productId: string;
      quantity: number;
      currentPrice: Prisma.Decimal;
    }> = [];

    // ─────────────────────────────────────────────────────────────────
    // STEP 3: Process each original item (INV-S5-12, INV-S5-13, INV-S5-27)
    // FIX-8 (SC-1): Batch inventory check — single DB query for all products.
    // Previously N sequential getAvailability() calls — now 1 getBatchAvailability() call.
    // ─────────────────────────────────────────────────────────────────
    const productIds = originalItems.map((item) => item.productId);
    const availabilityMap = await this.inventoryService.getBatchAvailability(
      productIds,
      originalOrder.segment, // Segment string from typed repo
    );
    for (const item of originalItems) {
      const product = item.product;

      // Check product availability
      if (!product || product.isDeleted || !product.isActive) {
        warnings.push({
          // INV-S5-13: NEVER silent
          type: 'PRODUCT_UNAVAILABLE',
          productId: item.productId,
          productName: item.productName,
          reason: 'Product no longer available',
        });
        continue;
      }

      // Check inventory via availabilityMap (FIX-8: O(1) lookup, no additional DB query)
      const availability = availabilityMap.get(item.productId);
      if (!availability || availability.availableQuantity < item.quantity) {
        warnings.push({
          // INV-S5-13: NEVER silent
          type: 'OUT_OF_STOCK',
          productId: item.productId,
          productName: item.productName,
          reason: `Only ${availability?.availableQuantity ?? 0} units available`,
        });
        continue;
      }

      // CURRENT price — NEVER snapshot (INV-S5-12)
      // AI Footgun Trap 1: Using item.unitPrice for cart price.
      const currentPrice = product.basePrice; // ← fresh from DB, NOT item.unitPrice
      const snapshotPrice = item.unitPrice;

      const priceDelta = currentPrice
        .minus(snapshotPrice)
        .abs()
        .div(snapshotPrice);

      if (priceDelta.greaterThan(0.1)) {
        // >10% change → warn (still add to cart)
        warnings.push({
          type: 'PRICE_CHANGED',
          productId: item.productId,
          productName: item.productName,
          priceFrom: snapshotPrice.toString(),
          priceTo: currentPrice.toString(),
        });
      }

      itemsToAdd.push({
        productId: item.productId,
        quantity: item.quantity,
        currentPrice,
      });
    }

    // ─────────────────────────────────────────────────────────────────
    // STEP 4: Add available items to NEW cart via CartService (not direct DB write)
    // AI Footgun Trap 4: Writing cart items directly to DB without CartService.
    // AI-3 Fix: Track successes with a counter instead of mutating itemsToAdd array.
    // ─────────────────────────────────────────────────────────────────
    const cart = await this.cartService.getCart(
      buyerId,
      originalOrder.segment as any, // Segment string from typed repo
    );

    let successfullyAddedCount = 0; // AI-3 Fix: replaced splice() mutation with explicit counter

    for (const itemData of itemsToAdd) {
      try {
        await this.cartService.addItem(buyerId, {
          productId: itemData.productId,
          quantity: itemData.quantity,
          segment: originalOrder.segment as any, // Segment string from typed repo
        });
        successfullyAddedCount++;
      } catch (error: any) {
        // If CartService rejects it (e.g. MOQ violation), we must record it as a warning (INV-S5-13)
        warnings.push({
          type: 'PRODUCT_UNAVAILABLE',
          productId: itemData.productId,
          productName:
            originalItems.find((i) => i.productId === itemData.productId)
              ?.productName || 'Unknown',
          reason: error.message || 'Could not add to cart',
        });
        // AI-3 Fix: no splice() — counter simply not incremented for this item
      }
    }

    // ─────────────────────────────────────────────────────────────────
    // STEP 5: Metrics
    // ─────────────────────────────────────────────────────────────────
    const outcome =
      successfullyAddedCount === 0
        ? 'zero'
        : warnings.length > 0
          ? 'partial'
          : 'success';

    this.metrics.buyerReorderTotal.inc({
      segment: originalOrder.segment,
      outcome,
    });

    return {
      cartId: cart.id,
      addedCount: successfullyAddedCount, // AI-3 Fix: accurate counter
      skippedCount: originalItems.length - successfullyAddedCount, // accurate total skips
      warnings, // INV-S5-13: ALL skipped items present here
    };
  }
}
