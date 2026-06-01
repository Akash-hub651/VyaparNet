import { Injectable, Logger } from '@nestjs/common';
import {
  InventoryReserveService,
  ReserveStockResult,
} from './inventory-reserve.service';
import {
  InventoryReleaseService,
  ReleaseStockResult,
  ReleaseReason,
} from './inventory-release.service';
import { InventoryQueryService } from './inventory-query.service';
import { ReservationRepository } from './repositories/reservation.repository';
import { ReserveStockInput } from './inventory-reserve.service';
import { InventoryAvailabilityResponse } from './dto/inventory.dto';
import { Prisma } from '@vyaparnet/database';

/**
 * InventoryServicePublicInterface exactly as defined in §18.3.
 */
export interface InventoryServicePublicInterface {
  reserve(input: ReserveStockInput): Promise<ReserveStockResult>;
  release(
    reservationId: string,
    reason: ReleaseReason,
    actorId: string,
    role?: string,
    issuedByUserId?: string,
  ): Promise<ReleaseStockResult>;
  releaseAllForOrder(
    orderId: string,
    reason: ReleaseReason,
    actorId: string,
  ): Promise<ReleaseStockResult[]>;
  consume(
    reservationId: string,
    actorId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void>;
  getAvailability(
    productId: string,
    segment: string,
  ): Promise<InventoryAvailabilityResponse>;
  /**
   * Count low-stock items for a seller's business (KPI dashboard use).
   * This is the ONLY permitted path — INV-S5-27 forbids direct Inventory
   * queries from the seller/buyer modules.
   */
  countLowStock(businessId: string, segment: string): Promise<number>;
  /**
   * Paginated inventory list for seller dashboard.
   */
  listInventory(params: {
    businessId: string;
    take?: number;
    cursor?: string;
    lowStockOnly?: boolean;
  }): Promise<{ items: any[]; nextCursor: string | null }>;
  /**
   * FIX-8 (SC-1): Batch availability check for N+1 elimination in BuyerReorderService.
   * Instead of N sequential getAvailability() calls, fetches all stocks in one DB query.
   * Returns a Map<productId, InventoryAvailabilityResponse> for O(1) lookup per item.
   *
   * INV-S5-27: This is the ONLY permitted path for batch inventory queries from buyer module.
   */
  getBatchAvailability(
    productIds: string[],
    segment: string,
  ): Promise<Map<string, InventoryAvailabilityResponse>>;
}

/**
 * InventoryService — Public Facade for InventoryModule.
 *
 * Authority: SPRINT3_EXECUTION_LOCK_FINAL.md §18.3
 *
 * INVARIANTS:
 * - This is the ONLY service exported from InventoryModule.
 * - Repositories are NEVER exported.
 * - This acts as a thin delegation layer to the Phase 3 sub-services.
 * - consume() MUST use the passed transaction from OrderService and NOT open its own.
 */
@Injectable()
export class InventoryService implements InventoryServicePublicInterface {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    private readonly reserveService: InventoryReserveService,
    private readonly releaseService: InventoryReleaseService,
    private readonly queryService: InventoryQueryService,
    private readonly reservationRepo: ReservationRepository,
  ) {}

  async reserve(input: ReserveStockInput): Promise<ReserveStockResult> {
    return this.reserveService.reserve(input);
  }

  async release(
    reservationId: string,
    reason: ReleaseReason,
    actorId: string,
    role: string = 'SYSTEM',
    issuedByUserId?: string,
  ): Promise<ReleaseStockResult> {
    return this.releaseService.release({
      reservationId,
      reason,
      userId: actorId,
      role: role as any,
      issuedByUserId,
    });
  }

  async releaseAllForOrder(
    orderId: string,
    reason: ReleaseReason,
    actorId: string,
  ): Promise<ReleaseStockResult[]> {
    // Find all active reservations for this order
    const reservations =
      await this.reservationRepo.findActiveByOrderId(orderId);

    // HARDENED (S4-W6): Sequential for...of — NEVER Promise.all.
    // Concurrent releases on the same Inventory row cause optimistic-lock
    // contention storms and deadlock amplification under multi-item carts.
    // Each release increments Inventory.quantity with a version check —
    // running them concurrently means ALL but one will fail and retry,
    // creating cascading DB round-trips under failure paths.
    const results: ReleaseStockResult[] = [];
    for (const res of reservations) {
      const result = await this.releaseService.release({
        reservationId: res.id,
        reason,
        userId: actorId,
        role: 'SYSTEM',
      });
      results.push(result);
    }

    return results;
  }

  /**
   * Consume a reservation.
   * MUST be called WITHIN the payment capture $transaction (passing tx).
   * MUST NOT open its own $transaction.
   *
   * Steps (§18.3):
   *   1. reservationRepo.consume(reservationId, tx) → transitions ACTIVE → CONSUMED
   *   2. Decrement Inventory.reservedQty by reservation.quantity (INV-3)
   *      Without this, reservedQty permanently inflates causing display drift.
   *   3. Log result — do NOT throw on count=0 (idempotency per §20.2)
   */
  async consume(
    reservationId: string,
    actorId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    // Step 1: Delegate to repo — uses passed tx, does NOT open own $transaction (§18.3)
    const reservation = await this.reservationRepo.consume(
      reservationId,
      tx as any,
    );

    if (!reservation) {
      // count=0 → already consumed or expired — idempotent, do NOT throw (§20.2)
      this.logger.warn(
        { reservationId, actorId },
        'consume() called but reservation not ACTIVE or not found — idempotent no-op',
      );
      return;
    }

    // Step 2: Decrement reservedQty on Inventory (INV-3, §18.3)
    // reservedQty was incremented during reserve() — MUST be decremented on consume.
    // Without this decrement, reservedQty inflates permanently, causing display drift.
    await tx.inventory.updateMany({
      where: { id: reservation.inventoryId },
      data: { reservedQty: { decrement: reservation.quantity } },
    });

    this.logger.log(
      { reservationId, actorId, qty: reservation.quantity },
      'Reservation consumed',
    );
  }

  async getAvailability(
    productId: string,
    _segment: string,
  ): Promise<InventoryAvailabilityResponse> {
    const data = await this.queryService.getAvailability(productId);
    return {
      productId: data.productId,
      availableQuantity: data.availableQty,
      isLowStock: data.isLowStock,
      lastUpdated: data.updatedAt,
    };
  }

  /**
   * Count low-stock inventory items for a seller's KPI dashboard.
   *
   * Delegates to InventoryQueryService — the ONLY permitted path for
   * cross-module inventory count access. (INV-S5-27)
   *
   * @param businessId - Business.id (NOT User.id) — INV-S5-1
   * @param segment    - Segment isolation — INV-S5-33
   */
  async countLowStock(businessId: string, segment: string): Promise<number> {
    return this.queryService.countLowStock(businessId, segment);
  }

  /**
   * Paginated inventory list for seller dashboard.
   */
  async listInventory(params: {
    businessId: string;
    take?: number;
    cursor?: string;
    lowStockOnly?: boolean;
  }) {
    return this.queryService.listInventory(params);
  }

  /**
   * FIX-8 (SC-1): Batch availability check — eliminates N+1 in BuyerReorderService.
   *
   * Fetches availability for multiple products in a SINGLE DB query.
   * Returns Map<productId, InventoryAvailabilityResponse> for O(1) lookup.
   *
   * Authority: INV-S5-27 — InventoryService is the SOLE inventory authority.
   * Called by BuyerReorderService.reorder() instead of N sequential getAvailability() calls.
   */
  async getBatchAvailability(
    productIds: string[],
    _segment: string,
  ): Promise<Map<string, InventoryAvailabilityResponse>> {
    if (productIds.length === 0) {
      return new Map();
    }
    // Single DB query for all productIds (INV-S5-27)
    const inventoryRows =
      await this.queryService.getBatchAvailability(productIds);
    const result = new Map<string, InventoryAvailabilityResponse>();
    for (const row of inventoryRows) {
      result.set(row.productId, {
        productId: row.productId,
        availableQuantity: row.availableQty,
        isLowStock: row.isLowStock,
        lastUpdated: row.updatedAt,
      });
    }
    // Ensure missing productIds default to 0 availability (product not in inventory)
    for (const productId of productIds) {
      if (!result.has(productId)) {
        result.set(productId, {
          productId,
          availableQuantity: 0,
          isLowStock: true,
          lastUpdated: new Date().toISOString(), // FIX: ISO string per InventoryAvailabilityResponse type
        });
      }
    }
    return result;
  }
}
