import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { RedisService } from '../../core/redis/redis.service';
import { InventoryRepository } from './repositories/inventory.repository';
import { ReservationRepository } from './repositories/reservation.repository';
import { MovementRepository } from './repositories/movement.repository';
import type { Inventory } from '@vyaparnet/database';

/**
 * Cached stock availability shape — display only (§4.1).
 * NEVER used for reservation decisions — DB-only for correctness.
 */
export interface StockAvailabilityDto {
  inventoryId: string;
  productId: string;
  quantity: number;
  reservedQty: number;
  damagedQty: number;
  availableQty: number; // quantity - reservedQty - damagedQty
  isLowStock: boolean;
  lowStockThreshold: number;
  updatedAt: string; // ISO 8601
  fromCache: boolean; // true = display cache, false = DB read
}

/** Paginated movement history. */
export interface MovementHistoryDto {
  items: {
    id: string;
    type: string;
    quantity: number;
    orderId?: string | null;
    reason?: string | null;
    createdAt: string;
  }[];
  nextCursor: string | null;
}

/** Paginated reservation list. */
export interface ReservationListDto {
  items: {
    id: string;
    quantity: number;
    status: string;
    expiresAt: string;
    orderContext: string;
  }[];
  nextCursor: string | null;
}

/**
 * InventoryQueryService — display-path read operations with cache-aside.
 *
 * Authority: SPRINT3_EXECUTION_LOCK_FINAL.md §3D sub-phase, §4.1–§4.5
 *
 * INVARIANT (§4.1): inv_stock cache is DISPLAY OPTIMIZATION ONLY.
 * It is NEVER used for reservation correctness decisions.
 * reserve() and updateStock() must NEVER read inv_stock cache.
 *
 * Redis key: inv_stock:{productId} — TTL 30s (§8.1)
 *
 * AI-AGENT WARNING (§34 WARNING 11):
 *   getAvailability() result MUST NOT influence reserve() decisions.
 *   Any code path from this service to InventoryReserveService is FORBIDDEN.
 */
@Injectable()
export class InventoryQueryService {
  private readonly logger = new Logger(InventoryQueryService.name);

  /** Cache TTL: 30 seconds — display staleness acceptable (§8.1) */
  static readonly STOCK_CACHE_TTL = 30;
  static readonly STOCK_CACHE_PREFIX = 'inv_stock:';

  constructor(
    private readonly redis: RedisService,
    private readonly inventoryRepo: InventoryRepository,
    private readonly reservationRepo: ReservationRepository,
    private readonly movementRepo: MovementRepository,
  ) {}

  /**
   * Get stock availability for display — cache-aside (§4.1).
   *
   * Cache: inv_stock:{productId} → TTL 30s.
   * Redis failure: silently falls back to DB (§4.4 degraded mode).
   *
   * INVARIANT: This result MUST NOT be used to make reservation decisions.
   * ALL reservation decisions use DB transactional state ONLY (§0 INV-1).
   *
   * @throws NotFoundException if product has no inventory record
   */
  async getAvailability(productId: string): Promise<StockAvailabilityDto> {
    const cacheKey = `${InventoryQueryService.STOCK_CACHE_PREFIX}${productId}`;

    // ── Cache read (display acceleration) ──
    const cached = await this.redis
      .getJson<StockAvailabilityDto>(cacheKey)
      .catch(() => null);
    if (cached) {
      this.logger.debug({ productId }, 'Stock cache hit');
      return { ...cached, fromCache: true };
    }

    // ── DB authoritative read ──
    const inventory = await this.inventoryRepo.findByProductId(productId);
    if (!inventory) {
      throw new NotFoundException({ code: 'INVENTORY_NOT_FOUND', productId });
    }

    const dto = this._mapToAvailabilityDto(inventory, false);

    // ── Cache write — best-effort (§4.4) ──
    await this.redis
      .setJson(cacheKey, dto, InventoryQueryService.STOCK_CACHE_TTL)
      .catch(() => {
        this.logger.debug(
          { productId },
          'Stock cache set failed — non-critical',
        );
      });

    return dto;
  }

  /**
   * Paginated inventory list for seller dashboard.
   * Uses DB — bounded by policy (max 50/page). (§33.4 RULE 6)
   */
  async listInventory(params: {
    businessId: string;
    take?: number;
    cursor?: string;
    lowStockOnly?: boolean;
  }): Promise<{ items: StockAvailabilityDto[]; nextCursor: string | null }> {
    const take = Math.min(params.take ?? 20, 50); // Bounded max 50
    const items = await this.inventoryRepo.findMany({
      businessId: params.businessId,
      take: take + 1, // +1 to detect next page
      cursor: params.cursor,
      lowStockOnly: params.lowStockOnly,
    });

    const hasNext = items.length > take;
    const page = hasNext ? items.slice(0, take) : items;
    const nextCursor = hasNext ? (page[page.length - 1]?.id ?? null) : null;

    return {
      items: page.map((inv) => this._mapToAvailabilityDto(inv, false)),
      nextCursor,
    };
  }

  /**
   * Count low-stock inventory items for a seller's business (KPI use case).
   *
   * Called by InventoryService.countLowStock() — the sole export path.
   * Direct Prisma access from seller module is FORBIDDEN (INV-S5-27).
   *
   * @param businessId - Business.id (NOT User.id) — INV-S5-1
   * @param segment    - Segment isolation — INV-S5-33
   */
  async countLowStock(businessId: string, segment: string): Promise<number> {
    return this.inventoryRepo.countLowStock(businessId, segment);
  }

  /**
   * FIX-8 (SC-1): Batch availability lookup — single DB query for multiple products.
   *
   * Called by InventoryService.getBatchAvailability() to eliminate N+1 in BuyerReorderService.
   * Returns raw StockAvailabilityDto[] — caller maps to productId keyed Map.
   *
   * NOTE: Does NOT use Redis cache (cache would need N round-trips anyway).
   * DB read is a single IN() query — efficient even for 50-item reorders.
   */
  async getBatchAvailability(productIds: string[]): Promise<StockAvailabilityDto[]> {
    if (productIds.length === 0) return [];

    // Single DB query with IN() clause — no N+1 (FIX-8)
    const inventoryRows = await this.inventoryRepo.findManyByProductIds(productIds);
    return inventoryRows.map((inv) => this._mapToAvailabilityDto(inv, false));
  }


  /**
   * Paginated movement history for an inventory record. (§33.4 RULE 6)
   * Bounded — no unbounded queries.
   */
  async getMovementHistory(params: {
    inventoryId: string;
    take?: number;
    cursor?: string;
  }): Promise<MovementHistoryDto> {
    const take = Math.min(params.take ?? 20, 100);
    const movements = await this.movementRepo.findMany({
      inventoryId: params.inventoryId,
      take: take + 1,
      cursor: params.cursor,
    });

    const hasNext = movements.length > take;
    const page = hasNext ? movements.slice(0, take) : movements;
    const nextCursor = hasNext ? (page[page.length - 1]?.id ?? null) : null;

    return {
      items: page.map((m) => ({
        id: m.id,
        type: m.type,
        quantity: m.quantity,
        orderId: m.orderId,
        reason: m.reason,
        createdAt: m.createdAt.toISOString(),
      })),
      nextCursor,
    };
  }

  /**
   * Active reservations for a user (display path — not for quota enforcement). (§15.1)
   * Bounded — max 50.
   */
  async getActiveReservations(params: {
    userId: string;
    orderId?: string;
    take?: number;
  }): Promise<ReservationListDto> {
    const take = Math.min(params.take ?? 20, 50);
    let items: any[];

    if (params.orderId) {
      items = await this.reservationRepo.findActiveByOrderId(params.orderId);
    } else {
      // Direct count for user display
      const count = await this.reservationRepo.countActiveByUserId(
        params.userId,
      );
      this.metrics_setActiveReservations(count);
      // Return empty list — caller uses count for display
      return { items: [], nextCursor: null };
    }

    const page = items.slice(0, take);
    return {
      items: page.map((r) => ({
        id: r.id,
        quantity: r.quantity,
        status: r.status,
        expiresAt: r.expiresAt.toISOString(),
        orderContext: r.orderContext,
      })),
      nextCursor: null,
    };
  }

  private _mapToAvailabilityDto(
    inventory: Inventory,
    fromCache: boolean,
  ): StockAvailabilityDto {
    const availableQty = Math.max(
      0,
      inventory.quantity - inventory.reservedQty - inventory.damagedQty,
    );
    return {
      inventoryId: inventory.id,
      productId: inventory.productId,
      quantity: inventory.quantity,
      reservedQty: inventory.reservedQty,
      damagedQty: inventory.damagedQty,
      availableQty,
      isLowStock: inventory.isLowStock,
      lowStockThreshold: inventory.lowStockThreshold,
      updatedAt: inventory.updatedAt.toISOString(),
      fromCache,
    };
  }

  // Lazy metrics proxy — avoids circular injection
  private metrics_setActiveReservations(_count: number): void {
    // Phase 8: inject InventoryMetrics.setActiveReservations(count)
  }
}
