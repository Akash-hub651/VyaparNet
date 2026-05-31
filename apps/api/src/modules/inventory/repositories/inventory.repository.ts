import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { Prisma } from '@vyaparnet/database';
import type { Inventory } from '@vyaparnet/database';

/** Tx client type for $transaction callbacks. §3.3 */
type PrismaTx = Omit<
  PrismaService,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/**
 * InventoryRepository — single source of Prisma access for Inventory model.
 *
 * Authority: SPRINT3_EXECUTION_LOCK_FINAL.md §33.4, §11.2
 *
 * INVARIANTS:
 *  - Only place with Prisma access for Inventory table. (§33.4 RULE 1)
 *  - findByProductIdWithLock() MUST receive tx — FOR UPDATE outside tx is a no-op. (§33.4 RULE 5)
 *  - decrementQuantityWithVersion() uses WHERE version=N (optimistic locking — INV-5)
 *  - All findMany() have explicit take and orderBy — NO unbounded queries. (§33.4 RULE 6)
 *  - ALL DB mutations check affected row count — 0 rows → ConcurrencyException. (INV-5)
 *
 * AI-AGENT WARNINGS (§34):
 *  - WARNING 12: Every repo call inside $transaction MUST include the tx argument
 *  - WARNING 2:  Lock key uses inventoryId not productId (upheld at service layer)
 */
@Injectable()
export class InventoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find inventory by productId (read path — no lock).
   * NEVER use for reservation decisions — use findByProductIdWithLock() for mutations. (§4.1)
   */
  async findByProductId(productId: string): Promise<Inventory | null> {
    return this.prisma.inventory.findFirst({
      where: { productId },
    });
  }

  /**
   * Find inventory by productId with SELECT FOR UPDATE row-level lock.
   *
   * MUST be called inside $transaction with tx. FOR UPDATE outside tx is a no-op. (§33.4 RULE 5)
   * This is the authoritative read for ALL stock mutation paths. (§0 INV-1, §11.2 Step 8a)
   *
   * @param tx — Prisma transaction client from $transaction callback. MANDATORY.
   */
  async findByProductIdWithLock(
    productId: string,
    tx: PrismaTx,
  ): Promise<Inventory | null> {
    // SELECT FOR UPDATE — row-level lock on this specific Inventory record.
    // Prevents concurrent reads during mutation within the transaction window. (§3.5, INV-1)
    const results = await tx.$queryRaw<Inventory[]>(
      Prisma.sql`
        SELECT * FROM "Inventory"
        WHERE "productId" = ${productId}
        LIMIT 1
        FOR UPDATE
      `,
    );
    return results[0] ?? null;
  }

  /**
   * Find inventory by inventoryId with SELECT FOR UPDATE row-level lock.
   * Alternative to productId lookup when inventoryId is already known.
   *
   * @param tx — Prisma transaction client. MANDATORY. (§33.4 RULE 5)
   */
  async findByIdWithLock(
    inventoryId: string,
    tx: PrismaTx,
  ): Promise<Inventory | null> {
    const results = await tx.$queryRaw<Inventory[]>(
      Prisma.sql`
        SELECT * FROM "Inventory"
        WHERE "id" = ${inventoryId}
        LIMIT 1
        FOR UPDATE
      `,
    );
    return results[0] ?? null;
  }

  /**
   * Decrement inventory quantity with optimistic locking version check. (INV-5)
   *
   * Uses WHERE version = N — if another process already mutated this row,
   * Prisma will return count=0, triggering retry at service layer. (§11.2 Step 8c)
   *
   * Also updates: reservedQty, isLowStock flag, updatedAt, version+1.
   * MUST be called inside $transaction with tx. (§0 INV-3)
   *
   * @returns updated row count (0 = ConcurrencyException → caller MUST retry)
   */
  async decrementQuantityWithVersion(
    id: string,
    qty: number,
    version: number,
    lowStockThreshold: number,
    tx: PrismaTx,
  ): Promise<number> {
    // version check is MANDATORY — §0 INV-5
    // quantity >= qty guard prevents negative quantity — §0 INV-2
    const result = await tx.$executeRaw(
      Prisma.sql`
        UPDATE "Inventory"
        SET
          quantity = quantity - ${qty},
          "reservedQty" = "reservedQty" + ${qty},
          "isLowStock" = CASE WHEN (quantity - ${qty}) <= ${lowStockThreshold} THEN true ELSE false END,
          version = version + 1,
          "updatedAt" = NOW()
        WHERE id = ${id}
          AND version = ${version}
          AND quantity >= ${qty}
      `,
    );
    return result;
  }

  /**
   * Increment inventory quantity after reservation release. (§20.2)
   *
   * Also decrements reservedQty and updates isLowStock flag.
   * Uses WHERE version = N (optimistic locking). (INV-5)
   * MUST be called inside $transaction with tx. (INV-3)
   *
   * @returns updated row count (0 = concurrent mutation, caller handles per §20.2)
   */
  async incrementQuantityWithVersion(
    id: string,
    qty: number,
    version: number,
    lowStockThreshold: number,
    tx: PrismaTx,
  ): Promise<number> {
    const result = await tx.$executeRaw(
      Prisma.sql`
        UPDATE "Inventory"
        SET
          quantity = quantity + ${qty},
          "reservedQty" = GREATEST("reservedQty" - ${qty}, 0),
          "isLowStock" = CASE WHEN (quantity + ${qty}) <= ${lowStockThreshold} THEN true ELSE false END,
          version = version + 1,
          "updatedAt" = NOW()
        WHERE id = ${id}
          AND version = ${version}
      `,
    );
    return result;
  }

  /**
   * Direct quantity update (seller PATCH /inventory/:productId).
   * Also updates lowStockThreshold if provided.
   * Uses optimistic locking (version check). (INV-5)
   * MUST be called inside $transaction with tx. (INV-3)
   */
  async updateQuantityWithVersion(
    id: string,
    newQuantity: number,
    version: number,
    lowStockThreshold: number,
    tx: PrismaTx,
  ): Promise<number> {
    const result = await tx.$executeRaw(
      Prisma.sql`
        UPDATE "Inventory"
        SET
          quantity = ${newQuantity},
          "lowStockThreshold" = ${lowStockThreshold},
          "isLowStock" = CASE WHEN ${newQuantity} <= ${lowStockThreshold} THEN true ELSE false END,
          version = version + 1,
          "updatedAt" = NOW()
        WHERE id = ${id}
          AND version = ${version}
      `,
    );
    return result;
  }

  /**
   * Paginated inventory list for seller dashboard.
   * Explicit take and orderBy — NO unbounded queries. (§33.4 RULE 6)
   */
  async findMany(params: {
    businessId: string;
    take: number;
    cursor?: string;
    lowStockOnly?: boolean;
  }): Promise<Inventory[]> {
    return this.prisma.inventory.findMany({
      where: {
        businessId: params.businessId,
        ...(params.lowStockOnly ? { isLowStock: true } : {}),
      },
      take: params.take,
      skip: params.cursor ? 1 : 0,
      ...(params.cursor ? { cursor: { id: params.cursor } } : {}),
      orderBy: [{ isLowStock: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  /**
   * Count low-stock inventory items for a business.
   * Used by SellerKpiService via InventoryService facade (INV-S5-27).
   *
   * @param businessId - Business.id (NOT User.id) — INV-S5-1
   * @param segment    - Segment isolation filter — INV-S5-33
   */
  async countLowStock(
    businessId: string,
    segment: string,
  ): Promise<number> {
    return this.prisma.inventory.count({
      where: {
        businessId,  // MANDATORY: segment isolation (INV-S5-14, INV-S5-33)
        segment: segment as any,
        isLowStock: true,
      },
    });
  }

  /**
   * Find inventory records updated since a given checkpoint.
   * Used by incremental reconciliation. (§16.1)
   * Explicit take and orderBy. (§33.4 RULE 6)
   */
  async findUpdatedSince(
    checkpoint: Date,
    batchSize: number,
    cursor?: string,
  ): Promise<Inventory[]> {
    return this.prisma.inventory.findMany({
      where: {
        updatedAt: { gt: checkpoint },
      },
      take: batchSize,
      skip: cursor ? 1 : 0,
      ...(cursor ? { cursor: { id: cursor } } : {}),
      orderBy: { updatedAt: 'asc' },
    });
  }

  /**
   * FIX-8 (SC-1): Batch find inventory rows by productIds array.
   *
   * Single IN() query — O(1) DB round trips regardless of item count.
   * Called ONLY by InventoryQueryService.getBatchAvailability().
   * NOT used for reservation decisions (§0 INV-1).
   */
  async findManyByProductIds(productIds: string[]): Promise<Inventory[]> {
    if (productIds.length === 0) return [];
    return this.prisma.inventory.findMany({
      where: {
        productId: { in: productIds }, // IN() clause — single query for all products
      },
      orderBy: { updatedAt: 'desc' },
    });
  }
}

