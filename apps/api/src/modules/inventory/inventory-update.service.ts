import {
  Injectable,
  Logger,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { RedisService } from '../../core/redis/redis.service';
import { InventoryRepository } from './repositories/inventory.repository';
import { MovementRepository } from './repositories/movement.repository';

/** Input for seller stock update. */
export interface UpdateStockInput {
  productId: string;
  newQuantity: number;
  lowStockThreshold?: number; // optional override
  reason: string; // mandatory — audit trail
  updatedBy: string; // userId of seller/admin
  businessId: string; // seller's businessId — ownership verification
  role: 'SELLER' | 'ADMIN';
}

/** Result of updateStock(). */
export interface UpdateStockResult {
  inventoryId: string;
  productId: string;
  newQuantity: number;
  previousQuantity: number;
  isLowStock: boolean;
}

/**
 * InventoryUpdateService — Seller stock quantity update with ownership enforcement.
 *
 * Authority: SPRINT3_EXECUTION_LOCK_FINAL.md §3C sub-phase definition, §26.1
 *
 * EXECUTION ORDER:
 *   Step 1: findByProductId → 404 if not found
 *   Step 2: Two-hop ownership verify → 403 if Seller A tries Seller B's inventory
 *   Step 3: Validate newQuantity >= reservedQty (cannot set below reserved — §0 INV-2)
 *   Step 4: $transaction — updateQuantityWithVersion + movement + EventOutbox
 *   Step 5: Redis display cache invalidate — best-effort (§4.5)
 *   Step 6: metrics + log
 *
 * TWO-HOP OWNERSHIP:
 *   inventory.businessId === input.businessId (seller must own the inventory record)
 *   ADMIN role bypasses ownership check (§26.1)
 */
@Injectable()
export class InventoryUpdateService {
  private readonly logger = new Logger(InventoryUpdateService.name);
  static readonly STOCK_CACHE_PREFIX = 'inv_stock:';

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly inventoryRepo: InventoryRepository,
    private readonly movementRepo: MovementRepository,
  ) {}

  async updateStock(input: UpdateStockInput): Promise<UpdateStockResult> {
    // ── Step 1: Read inventory ──
    const inventory = await this.inventoryRepo.findByProductId(input.productId);
    if (!inventory) {
      throw new NotFoundException({
        code: 'INVENTORY_NOT_FOUND',
        productId: input.productId,
      });
    }

    // ── Step 2: Two-hop ownership verify (§26.1) ──
    if (input.role !== 'ADMIN' && inventory.businessId !== input.businessId) {
      throw new ForbiddenException({
        code: 'INVENTORY_ACCESS_DENIED',
        reason: 'You do not own this inventory',
      });
    }

    // ── Step 3: Cannot set quantity below reservedQty (INV-2 — quantity never < 0 effective) ──
    if (input.newQuantity < inventory.reservedQty) {
      throw new UnprocessableEntityException({
        code: 'QUANTITY_BELOW_RESERVED',
        reservedQty: inventory.reservedQty,
        requested: input.newQuantity,
        message: 'Cannot set quantity below currently reserved amount',
      });
    }

    const lowStockThreshold =
      input.lowStockThreshold ?? inventory.lowStockThreshold;
    const previousQuantity = inventory.quantity;
    const nowMonth = new Date().toISOString().slice(0, 7);

    // ── Step 4: $transaction — DB operations ONLY (§3.1) ──
    const result = await this.prisma.$transaction(
      async (tx) => {
        const updatedCount = await this.inventoryRepo.updateQuantityWithVersion(
          inventory.id,
          input.newQuantity,
          inventory.version,
          lowStockThreshold,
          tx as any,
        );

        if (updatedCount === 0) {
          // Concurrent update — surface as UnprocessableEntity
          throw new UnprocessableEntityException({
            code: 'CONCURRENT_UPDATE',
            message: 'Inventory was updated concurrently — please retry',
          });
        }

        const newIsLowStock = input.newQuantity <= lowStockThreshold;
        const movementType =
          input.newQuantity > previousQuantity ? 'RESTOCK' : 'ADJUSTMENT';

        // Movement — APPEND-ONLY audit trail (INV-7)
        await this.movementRepo.create(
          {
            inventoryId: inventory.id,
            type: movementType as any,
            quantity: Math.abs(input.newQuantity - previousQuantity),
            reason: input.reason,
            createdBy: input.updatedBy,
          },
          tx as any,
        );

        // EventOutbox — deterministic dedup key (§6.1)
        // Key: inv-stock-updated-{inventoryId}-{version+1} — unique per mutation
        await tx.eventOutbox.create({
          data: {
            eventType: 'InventoryStockUpdated',
            eventVersion: '1.0',
            schemaVersion: '4.3',
            payload: {
              inventoryId: inventory.id,
              productId: input.productId,
              previousQuantity,
              newQuantity: input.newQuantity,
              updatedBy: input.updatedBy,
              reason: input.reason,
            },
            deduplicationKey: `inv-stock-updated-${inventory.id}-v${inventory.version + 1}`, // DETERMINISTIC (§6.1)
            eventMonth: nowMonth,
            status: 'PENDING',
          },
        });

        return {
          inventoryId: inventory.id,
          productId: input.productId,
          newQuantity: input.newQuantity,
          previousQuantity,
          isLowStock: newIsLowStock,
        };
      },
      { isolationLevel: 'ReadCommitted', timeout: 5000 },
    );

    // ── Step 5: Cache invalidate — best-effort (§4.5) ──
    await this.redis
      .del(`${InventoryUpdateService.STOCK_CACHE_PREFIX}${input.productId}`)
      .catch(() => {});

    // ── Step 6: Metrics + log ──
    this.logger.log(
      {
        productId: input.productId,
        previousQuantity,
        newQuantity: input.newQuantity,
        by: input.updatedBy,
      },
      'Stock updated',
    );

    return result;
  }
}
