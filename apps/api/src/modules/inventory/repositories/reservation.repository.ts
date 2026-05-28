import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type {
  InventoryReservation,
  ReservationStatus,
} from '@vyaparnet/database';

/** Tx client type for $transaction callbacks. §3.3 */
type PrismaTx = Omit<
  PrismaService,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/** Input for creating a new reservation. All fields match §9.3 schema. */
export interface CreateReservationInput {
  inventoryId: string;
  quantity: number;
  cartId?: string;
  orderId?: string;
  expiresAt: Date; // server-computed — NEVER from client input (§5)
  reservedByUserId?: string;
  reservedByBusinessId?: string;
  orderContext?: string;
  reservationSource?: string;
}

/**
 * ReservationRepository — single source of Prisma access for InventoryReservation model.
 *
 * Authority: SPRINT3_EXECUTION_LOCK_FINAL.md §33.4, §20.2, §13
 *
 * INVARIANTS:
 *  - create() always called inside $transaction with tx (INV-3)
 *  - release() uses updateMany WHERE status='ACTIVE' — idempotent, no-throw on count=0 (§20.2)
 *  - findExpiredActive() uses expiresAt index (idx_invres_active_expiry) via explicit where
 *  - All findMany() have explicit take and orderBy — NO unbounded queries (§33.4 RULE 6)
 */
@Injectable()
export class ReservationRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new reservation inside a $transaction.
   *
   * MUST be called with tx — part of the atomic mutation bundle (INV-3):
   *   inventory decrement + reservation create + movement create + EventOutbox create
   *
   * expiresAt MUST be server-computed before this call. (§5, INV-8)
   *
   * @param tx — Prisma transaction client. MANDATORY.
   */
  async create(
    input: CreateReservationInput,
    tx: PrismaTx,
  ): Promise<InventoryReservation> {
    return tx.inventoryReservation.create({
      data: {
        inventoryId: input.inventoryId,
        quantity: input.quantity,
        cartId: input.cartId,
        orderId: input.orderId,
        expiresAt: input.expiresAt, // server-computed (§5)
        status: 'ACTIVE',
        reservedByUserId: input.reservedByUserId,
        reservedByBusinessId: input.reservedByBusinessId,
        orderContext: input.orderContext ?? 'CART',
        reservationSource: input.reservationSource ?? 'WEB',
      },
    });
  }

  /**
   * Release a reservation — transitions ACTIVE → target status.
   *
   * Uses updateMany WHERE status='ACTIVE' — idempotent. (§20.2)
   * count === 0 → concurrent release won → SAFE, caller continues without error.
   *
   * NOT inside $transaction: release is called after increment (compensation path).
   * This is intentional — release without lock, then increment with retry. (§20.2)
   *
   * @returns count of updated rows (0 = already released by concurrent process)
   */
  async release(
    reservationId: string,
    newStatus: ReservationStatus,
  ): Promise<number> {
    const result = await this.prisma.inventoryReservation.updateMany({
      where: {
        id: reservationId,
        status: 'ACTIVE', // Idempotent: only update if still ACTIVE
      },
      data: { status: newStatus },
    });
    return result.count;
  }

  /**
   * Find a single reservation by ID (for state check in release flow). (§20.2)
   */
  async findById(reservationId: string) {
    return this.prisma.inventoryReservation.findUnique({
      where: { id: reservationId },
      include: { inventory: { select: { businessId: true } } },
    });
  }

  /**
   * Find expired ACTIVE reservations for expiry worker. (§20.4)
   *
   * WHERE status='ACTIVE' AND expiresAt < NOW() — uses idx_invres_active_expiry. (§9.5)
   * Explicit take — NO unbounded queries. (§33.4 RULE 6)
   */
  async findExpiredActive(batchSize: number): Promise<InventoryReservation[]> {
    return this.prisma.inventoryReservation.findMany({
      where: {
        status: 'ACTIVE',
        expiresAt: { lt: new Date() }, // new Date() = API server time (§5.3)
      },
      take: batchSize,
      orderBy: { expiresAt: 'asc' }, // Process oldest-expired first
    });
  }

  /**
   * Count active reservations for a user (anti-hoarding check). (§15.1)
   * Uses reservedByUserId index (idx_invres_user_segment via compound filter).
   */
  async countActiveByUserId(userId: string): Promise<number> {
    return this.prisma.inventoryReservation.count({
      where: {
        reservedByUserId: userId,
        status: 'ACTIVE',
      },
    });
  }

  /**
   * Find all active reservations for an order (for bulk release). (§18.3)
   * Bounded by orderId, ordered for deterministic processing. (§33.4 RULE 6)
   */
  async findActiveByOrderId(orderId: string): Promise<InventoryReservation[]> {
    return this.prisma.inventoryReservation.findMany({
      where: { orderId, status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
      take: 1000, // Bounded — no order has >1000 line items in practice
    });
  }

  /**
   * Consume a reservation inside an external $transaction (Sprint 4 saga). (§18.3)
   *
   * MUST be called with the tx from OrderService — does NOT open its own $transaction.
   * This is the critical Sprint 4 coupling rule. (§18.3, §18.4)
   *
   * @param tx — Prisma transaction client FROM ORDERSERVICE. MANDATORY.
   */
  async consume(
    reservationId: string,
    tx: PrismaTx,
  ): Promise<InventoryReservation | null> {
    const result = await tx.inventoryReservation.updateMany({
      where: {
        id: reservationId,
        status: 'ACTIVE',
      },
      data: { status: 'CONSUMED' },
    });
    if (result.count === 0) return null;
    return tx.inventoryReservation.findUnique({ where: { id: reservationId } });
  }
}
