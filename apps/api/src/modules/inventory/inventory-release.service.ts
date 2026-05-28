import {
  Injectable,
  Logger,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { RedisService } from '../../core/redis/redis.service';
import { InventoryMetrics } from './inventory.metrics';
import { InventoryRepository } from './repositories/inventory.repository';
import { ReservationRepository } from './repositories/reservation.repository';
import type { InventoryMovementType } from '@vyaparnet/database';

/** Input for releasing a reservation. */
export interface ReleaseStockInput {
  reservationId: string;
  reason: ReleaseReason;
  userId: string; // For ownership validation
  role: 'BUYER' | 'SELLER' | 'ADMIN' | 'SYSTEM'; // SYSTEM = expiry worker
  issuedByUserId?: string;
}

/** All valid release reasons — drives EventOutbox event type + Movement type. */
export type ReleaseReason =
  | 'CART_ABANDONED'
  | 'ORDER_CANCELLED'
  | 'EXPIRY'
  | 'SELLER_OVERRIDE'
  | 'ADMIN_OVERRIDE';

/** Result of release() — NEVER throws for terminal states. (§20.2) */
export interface ReleaseStockResult {
  reservationId: string;
  alreadyReleased: boolean; // true = terminal state, caller may log/ignore
  status: string; // EXPIRED | RELEASED | CANCELLED
}

/** Terminal reservation states — release is a no-op. (§20.2) */
const TERMINAL_STATES = new Set([
  'EXPIRED',
  'RELEASED',
  'CANCELLED',
  'CONSUMED',
]);

/** Max attempts to increment stock on release. After MAX, log CRITICAL. (§20.2) */
const MAX_INCREMENT_ATTEMPTS = 5;
const INCREMENT_RETRY_DELAYS_MS = [100, 200, 400, 800, 1600];

/**
 * InventoryReleaseService — idempotent stock release with retried increment.
 *
 * Authority: SPRINT3_EXECUTION_LOCK_FINAL.md §20.2, §6.1
 *
 * EXECUTION ORDER (§20.2):
 *   Step 1: findById(reservationId) → 404 if not found
 *   Step 2: Terminal state check → { alreadyReleased: true } — NEVER throw (§20.2)
 *   Step 3: Ownership check → 403 if unauthorized (§26.1)
 *   Step 4: updateMany WHERE status='ACTIVE' → idempotent (§20.2)
 *   Step 5: count === 0 → concurrent release won → safe, continue
 *   Step 6: incrementQuantityWithVersion() → retry MAX_INCREMENT_ATTEMPTS times
 *           → all attempts fail → CRITICAL log — NEVER throw (§20.2, INV-9)
 *   Step 7: movementRepo.create() — NOT inside $transaction (compensation path §20.2)
 *   Step 8: EventOutbox create() — dedup: inv-released-{reservationId} (§6.1)
 *   Step 9: Redis display cache invalidate → best-effort
 *   Step 10: metrics + log
 *
 * WHY NOT $TRANSACTION:
 *   Release is a compensation path (§20.2). The reservation status update and
 *   inventory increment are separate steps. If the increment fails, it is safe to
 *   retry the increment independently — the reservation is already released (step 4).
 *   Bundling into one $transaction would require the lock again, creating deadlock risk.
 */
@Injectable()
export class InventoryReleaseService {
  private readonly logger = new Logger(InventoryReleaseService.name);

  static readonly STOCK_CACHE_PREFIX = 'inv_stock:';

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly metrics: InventoryMetrics,
    private readonly inventoryRepo: InventoryRepository,
    private readonly reservationRepo: ReservationRepository,
  ) {}

  /**
   * Release a reservation — idempotent, never throws for terminal states.
   *
   * INVARIANT (§20.2): Terminal states ALWAYS return { alreadyReleased: true }.
   * INVARIANT (§20.2): Increment failure after all retries → CRITICAL log, return result.
   * INVARIANT (§20.2): EventOutbox dedup key prevents duplicate events on retry.
   */
  async release(input: ReleaseStockInput): Promise<ReleaseStockResult> {
    // ── Step 1: Find reservation — 404 if missing ──
    const reservation = await this.reservationRepo.findById(
      input.reservationId,
    );
    if (!reservation) {
      throw new NotFoundException({
        code: 'RESERVATION_NOT_FOUND',
        reservationId: input.reservationId,
      });
    }

    // ── Step 2: Terminal state guard — NEVER throw, NEVER retry (§20.2) ──
    if (TERMINAL_STATES.has(reservation.status)) {
      this.logger.log(
        {
          reservationId: input.reservationId,
          status: reservation.status,
          reason: input.reason,
        },
        'Release on terminal state — alreadyReleased=true',
      );
      return {
        reservationId: input.reservationId,
        alreadyReleased: true,
        status: reservation.status,
      };
    }

    // ── Step 3: Ownership check (§26.1) ──
    this._assertReleaseAuthorized(reservation, input);

    // ── Step 4: Mark reservation as released — idempotent updateMany (§20.2) ──
    const newStatus = _mapReasonToStatus(input.reason);
    const count = await this.reservationRepo.release(
      input.reservationId,
      newStatus,
    );

    // ── Step 5: count === 0 → concurrent release won → safe (§20.2) ──
    if (count === 0) {
      this.logger.log(
        { reservationId: input.reservationId },
        'Concurrent release detected — other process completed first. Safe.',
      );
      return {
        reservationId: input.reservationId,
        alreadyReleased: true,
        status: newStatus,
      };
    }

    // ── Step 6: Increment inventory with retry loop (§20.2) ──
    // NOT inside $transaction — compensation path, independent retry. (§20.2)
    const inventory = await this._findInventoryById(reservation.inventoryId);

    if (inventory) {
      await this._incrementWithRetry(
        inventory,
        reservation.quantity,
        input.reason,
      );
    } else {
      // Inventory deleted — log CRITICAL but don't fail release (§20.2)
      this.logger.error(
        {
          inventoryId: reservation.inventoryId,
          reservationId: input.reservationId,
        },
        'CRITICAL: Inventory record not found during release — quantity NOT restored',
      );
    }

    // ── Step 7: Append-only movement record (INV-7, INV-3) ──
    // NOT inside $transaction — compensation path (§20.2)
    if (inventory) {
      const movementType = _mapReasonToMovementType(
        input.reason,
      ) as InventoryMovementType;
      await this.prisma.inventoryMovement
        .create({
          data: {
            inventoryId: reservation.inventoryId,
            type: movementType,
            quantity: reservation.quantity,
            orderId: reservation.orderId ?? undefined,
            reason: input.reason,
            createdBy: input.userId,
          },
        })
        .catch((err: Error) => {
          // Movement failure must NOT block release return (§20.2 — release is committed in step 4)
          this.logger.error(
            { reservationId: input.reservationId, error: err.message },
            'Movement create failed after release — non-blocking',
          );
        });
    }

    // ── Step 8: EventOutbox — dedup: inv-released-{reservationId} (§6.1) ──
    const nowMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    await this.prisma.eventOutbox
      .create({
        data: {
          eventType: 'InventoryReleased',
          eventVersion: '1.0',
          schemaVersion: '4.3',
          payload: {
            reservationId: input.reservationId,
            inventoryId: reservation.inventoryId,
            quantity: reservation.quantity,
            reason: input.reason,
            releasedBy: input.userId,
            status: newStatus,
          },
          deduplicationKey: `inv-released-${input.reservationId}`, // DETERMINISTIC (§6.1)
          eventMonth: nowMonth,
          status: 'PENDING',
        },
      })
      .catch((err: Error) => {
        // Duplicate dedup key = already published — safe to ignore
        if (err.message.includes('Unique constraint')) {
          this.logger.debug(
            { reservationId: input.reservationId },
            'EventOutbox dedup hit — already published',
          );
          return;
        }
        this.logger.error(
          { reservationId: input.reservationId, error: err.message },
          'EventOutbox create failed during release — non-blocking',
        );
      });

    // ── Step 9: Cache invalidate — best-effort ──
    if (inventory) {
      await this.redis
        .del(
          `${InventoryReleaseService.STOCK_CACHE_PREFIX}${inventory.productId}`,
        )
        .catch(() => {});
    }

    // ── Step 10: Metrics + log ──
    this.metrics.reservationReleased(input.reason);
    this.logger.log(
      {
        reservationId: input.reservationId,
        reason: input.reason,
        qty: reservation.quantity,
      },
      'Stock released',
    );

    return {
      reservationId: input.reservationId,
      alreadyReleased: false,
      status: newStatus,
    };
  }

  /**
   * Increment inventory with exponential backoff retry.
   * After MAX_INCREMENT_ATTEMPTS: CRITICAL log — NEVER throw (§20.2, INV-9).
   */
  private async _incrementWithRetry(
    inventory: {
      id: string;
      version: number;
      lowStockThreshold: number;
      productId: string;
    },
    quantity: number,
    reason: string,
  ): Promise<void> {
    // Re-read inventory version just before increment to get latest version
    let current = inventory;

    for (let attempt = 0; attempt < MAX_INCREMENT_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        const delayMs =
          INCREMENT_RETRY_DELAYS_MS[attempt - 1] ??
          INCREMENT_RETRY_DELAYS_MS[INCREMENT_RETRY_DELAYS_MS.length - 1];
        await _delay(delayMs);
        // Re-read to get latest version after each retry
        const fresh = await this._findInventoryById(current.id);
        if (!fresh) break;
        current = fresh;
      }

      const updatedCount = await this.inventoryRepo
        .incrementQuantityWithVersion(
          current.id,
          quantity,
          current.version,
          current.lowStockThreshold,
          this.prisma as any,
        )
        .catch(() => 0);

      if (updatedCount > 0) {
        return; // success
      }
    }

    // All retries failed — CRITICAL log, DO NOT throw (§20.2)
    this.logger.error(
      {
        inventoryId: inventory.id,
        productId: inventory.productId,
        quantity,
        reason,
        attempts: MAX_INCREMENT_ATTEMPTS,
      },
      'CRITICAL: Failed to restore stock after all retry attempts — manual reconciliation required',
    );
    this.metrics.driftDetected(inventory.id, true);
  }

  /**
   * Find inventory by its id (direct id lookup).
   */
  private async _findInventoryById(inventoryId: string) {
    return this.prisma.inventory.findUnique({ where: { id: inventoryId } });
  }

  /**
   * Assert that the caller is authorized to release this reservation.
   * RBAC rules from §26.1:
   *   - BUYER: can only release their own CART reservations
   *   - SELLER/ADMIN/SYSTEM: can release any reservation
   *   - Buyer cannot release ORDER or other-user reservations
   */
  private _assertReleaseAuthorized(
    reservation: {
      reservedByUserId: string | null;
      orderContext: string | null;
      inventory: { businessId: string };
    },
    input: ReleaseStockInput,
  ): void {
    if (input.role === 'ADMIN' || input.role === 'SYSTEM') return;

    if (input.role === 'SELLER') {
      // Seller can only release reservations for their own inventory
      if (input.issuedByUserId && reservation.inventory.businessId !== input.issuedByUserId) {
        throw new ForbiddenException({
          code: 'RELEASE_UNAUTHORIZED',
          reason: 'Not your inventory',
        });
      }
    }

    if (input.role === 'BUYER') {
      if (reservation.reservedByUserId !== input.userId) {
        throw new ForbiddenException({
          code: 'RELEASE_UNAUTHORIZED',
          reason: 'Not your reservation',
        });
      }
      // Buyer cannot release ORDER reservations — only CART
      if (reservation.orderContext === 'ORDER') {
        throw new ForbiddenException({
          code: 'RELEASE_UNAUTHORIZED',
          reason: 'Cannot release ORDER reservation',
        });
      }
    }
  }
}

// ── Pure mapping functions ─────────────────────────────────────────────────

function _mapReasonToStatus(
  reason: ReleaseReason,
): 'EXPIRED' | 'RELEASED' | 'CANCELLED' {
  switch (reason) {
    case 'EXPIRY':
      return 'EXPIRED';
    case 'ORDER_CANCELLED':
      return 'CANCELLED';
    default:
      return 'RELEASED';
  }
}

function _mapReasonToMovementType(reason: string): string {
  switch (reason) {
    case 'ORDER_CANCELLED':
    case 'PAYMENT_FAILED':
    case 'MANUAL_RELEASE':
      return 'RESERVATION_RELEASED';
    case 'CART_EXPIRED':
    case 'CART_ABANDONED':
      return 'RESERVATION_RELEASED';
    default:
      return 'RESERVATION_RELEASED';
  }
}

function _delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
