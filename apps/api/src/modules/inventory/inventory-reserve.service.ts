import {
  Injectable,
  Logger,
  UnprocessableEntityException,
  ServiceUnavailableException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { RedisService } from '../../core/redis/redis.service';
import { InventoryLockService } from './inventory-lock.service';
import { InventoryPolicyService } from './inventory-policy.service';
import { InventoryProtectionModeService } from './inventory-protection-mode.service';
import { InventoryAbuseGuard } from './inventory-abuse-guard.service';
import { InventoryMetrics } from './inventory.metrics';
import { InventoryRepository } from './repositories/inventory.repository';
import { ReservationRepository } from './repositories/reservation.repository';
import { MovementRepository } from './repositories/movement.repository';

/**
 * Input for reserving inventory stock.
 * expiresAt MUST NOT appear here — server-computed only (§5, INV-8).
 */
export interface ReserveStockInput {
  productId: string;
  quantity: number;
  segment: string; // Segment enum value — string to avoid cross-package enum conflict
  cartId?: string;
  orderId?: string;
  orderType: 'CART' | 'ORDER' | 'RFQ';
  paymentMethod?:
    | 'ONLINE_UPI'
    | 'ONLINE_CARD'
    | 'COD'
    | 'CREDIT'
    | 'BANK_TRANSFER';
  userId: string;
  businessId?: string;
  ipAddress: string;
  idempotencyKey: string; // from Idempotency-Key header — mandatory (§20.3)
  reservationSource?: string; // 'WEB' | 'API' | 'BULK'
  isBusinessVerified?: boolean;
}

/**
 * Result returned by reserve() and cached for idempotency.
 */
export interface ReserveStockResult {
  reservationId: string;
  inventoryId: string;
  productId: string;
  quantity: number;
  expiresAt: string; // ISO 8601
  status: 'ACTIVE';
  mode: string; // 'NORMAL' | 'DEGRADED'
}

/**
 * Thrown internally when optimistic locking version check fails.
 * Triggers retry loop — NOT surfaced to client. (INV-5)
 */
class ConcurrencyException extends Error {
  constructor(inventoryId: string) {
    super(`Concurrent update detected for inventory ${inventoryId}`);
    this.name = 'ConcurrencyException';
  }
}

/**
 * InventoryReserveService — Seven-layer defense reserve critical path.
 *
 * Authority: SPRINT3_EXECUTION_LOCK_FINAL.md §11.2
 *
 * EXECUTION ORDER (NON-NEGOTIABLE — §0 INV-6, §11.2):
 *   Step 1  [Redis]:   GET inv_idem:{key}              → hit → return cached result
 *   Step 2  [Redis]:   GET inv_protect_mode            → READ_ONLY → 503
 *   Step 3  [DB+Redis]:getPolicy(segment)              → TTL computation
 *   Step 4  [DB]:      findByProductId(productId)      → inventoryId for lock key
 *   Step 5  [Redis]:   abuseGuard.check(ctx)           → 429/400 if violated
 *   Step 6  [Redis]:   lockService.withLock()          → OR skip if DEGRADED
 *   Step 7  [DB]:      executeReservationWithRetry()   → ConcurrencyException retry loop
 *   Step 8  [DB tx]:   $transaction(ReadCommitted, 5000ms)
 *                        a. findByProductIdWithLock(tx)   FOR UPDATE
 *                        b. available >= qty check        422 if insufficient
 *                        c. decrementQuantityWithVersion  WHERE version=N
 *                        d. reservationRepo.create(tx)
 *                        e. movementRepo.create(tx)       RESERVATION_HELD
 *                        f. eventOutbox InventoryReserved  dedup: inv-reserved-{id}
 *                        g. eventOutbox InventoryLowStock  dedup: inv-low-stock-{id}-YYYY-MM
 *   Step 9  [Redis]:   SETEX inv_idem:{key} ttl result → AFTER $tx commits
 *   Step 10:           metrics + structured log
 *
 * INVARIANTS:
 *   - Steps 1–5 run BEFORE any lock acquisition (INV-6, §11.2)
 *   - Steps inside $transaction are ONLY DB operations (§3.1)
 *   - Lock released in withLock() finally — AFTER $tx resolves (INV-4)
 *   - expiresAt computed server-side — NEVER from client input (INV-8, §5)
 *   - computeReservationTtl() is ONLY TTL source — no numeric literals (§12.1)
 *   - EventOutbox dedup keys are deterministic — no timestamps (§6.1, WARNING 6)
 */
@Injectable()
export class InventoryReserveService {
  private readonly logger = new Logger(InventoryReserveService.name);

  /** Redis idempotency key prefix. §8.1 */
  static readonly IDEM_KEY_PREFIX = 'inv_idem:';
  /** Display cache invalidation key prefix. §4.5 */
  static readonly STOCK_CACHE_PREFIX = 'inv_stock:';

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly lockService: InventoryLockService,
    private readonly policyService: InventoryPolicyService,
    private readonly protectionModeService: InventoryProtectionModeService,
    private readonly abuseGuard: InventoryAbuseGuard,
    private readonly metrics: InventoryMetrics,
    private readonly inventoryRepo: InventoryRepository,
    private readonly reservationRepo: ReservationRepository,
    private readonly movementRepo: MovementRepository,
  ) {}

  /**
   * Reserve inventory stock — seven-layer defense critical path.
   *
   * STEP ORDER IS NON-NEGOTIABLE. See §11.2 and INV-6.
   * Any reordering of steps is an architectural violation.
   */
  async reserve(input: ReserveStockInput): Promise<ReserveStockResult> {
    const startMs = Date.now();
    const idempKey = `${InventoryReserveService.IDEM_KEY_PREFIX}${input.idempotencyKey}`;

    // ── STEP 1: Idempotency check — MUST be the VERY FIRST await (INV-6, WARNING 5) ──
    // No lock, no DB, no policy — nothing before this.
    const cached = await this.redis
      .getJson<ReserveStockResult>(idempKey)
      .catch(() => null);
    if (cached) {
      this.metrics.idempotencyHit();
      this.logger.debug(
        { idempotencyKey: input.idempotencyKey },
        'Idempotency cache hit — returning cached result',
      );
      return cached;
    }

    // ── STEP 2: Protection mode check (after idempotency — cached results still served in READ_ONLY) ──
    const params = await this.protectionModeService.getOperationalParams();
    if (!params.allowWrites) {
      throw new ServiceUnavailableException({ code: 'INVENTORY_READ_ONLY' });
    }

    // ── STEP 3: Policy load + TTL computation ──
    const policy = await this.policyService.getPolicy(input.segment);
    const reservationTtl = this.policyService.computeReservationTtl(policy, {
      orderType: input.orderType,
      paymentMethod: input.paymentMethod,
      isBusinessVerified: input.isBusinessVerified,
    });

    // ── STEP 4: Resolve inventoryId for lock key (inventoryId NOT productId — §8.2, WARNING 2) ──
    const inventory = await this.inventoryRepo.findByProductId(input.productId);
    if (!inventory) {
      throw new UnprocessableEntityException({
        code: 'INVENTORY_NOT_FOUND',
        productId: input.productId,
      });
    }

    // ── STEP 5: Abuse guard — all 5 checks BEFORE lock acquisition (§15.1, §11.2) ──
    await this.abuseGuard.check({
      userId: input.userId,
      ipAddress: input.ipAddress,
      businessId: input.businessId,
      segment: input.segment,
      quantity: input.quantity,
      policy,
      inventoryId: inventory.id,
    });

    // ── STEPS 6–9: Lock → Retry → Transaction → Idempotency SET ──
    let result: ReserveStockResult;

    if (params.skipRedisLock) {
      // DEGRADED mode: skip Redis lock, use DB optimistic locking only (INV-9)
      this.logger.warn(
        { inventoryId: inventory.id, mode: params.mode },
        'Redis unavailable — inventory writes in degraded mode',
      );
      result = await this._executeReservationWithRetry(
        input,
        inventory,
        reservationTtl,
        params,
      );
    } else {
      // NORMAL mode: acquire lock BEFORE $transaction (INV-4)
      result = await this.lockService.withLock(inventory.id, () =>
        this._executeReservationWithRetry(
          input,
          inventory,
          reservationTtl,
          params,
        ),
      );
    }

    // ── STEP 9: Idempotency cache SET — AFTER $transaction commits, OUTSIDE $transaction ──
    // (§3, §6, WARNING 5 — SETEX must never be inside $transaction callback)
    await this.redis.setJson(idempKey, result, reservationTtl).catch(() => {
      // Failure acceptable: correctness maintained by DB. Client retry gets fresh result. (§3.3)
      this.logger.warn(
        { idempotencyKey: input.idempotencyKey },
        'Idempotency cache SET failed — non-critical',
      );
    });

    // ── STEP 10: Observability ──
    const latencyMs = Date.now() - startMs;
    this.metrics.reservationSuccess(input.segment);
    this.metrics.recordReservationLatency(latencyMs);
    this.logger.log(
      {
        productId: input.productId,
        inventoryId: inventory.id,
        qty: input.quantity,
        reservationId: result.reservationId,
        mode: params.mode,
        latencyMs,
      },
      'Stock reserved',
    );

    // Async cache invalidation — best-effort, outside $transaction (§4.5)
    this.redis
      .del(`${InventoryReserveService.STOCK_CACHE_PREFIX}${input.productId}`)
      .catch(() => {});

    return result;
  }

  /**
   * Retry loop around $transaction for optimistic locking conflicts (INV-5).
   * Exponential backoff from OperationalParams — no hardcoded delays (§12.1, WARNING 10).
   */
  private async _executeReservationWithRetry(
    input: ReserveStockInput,
    inventory: { id: string; version: number; lowStockThreshold: number },
    reservationTtl: number,
    params: { maxRetries: number; retryDelaysMs: number[]; mode: string },
  ): Promise<ReserveStockResult> {
    for (let attempt = 0; attempt <= params.maxRetries; attempt++) {
      if (attempt > 0) {
        const delayMs =
          params.retryDelaysMs[attempt - 1] ??
          params.retryDelaysMs[params.retryDelaysMs.length - 1];
        this.metrics.optimisticLockRetry(attempt);
        this.logger.warn(
          { productId: input.productId, attempt },
          'Optimistic lock conflict — retrying',
        );
        await _delay(delayMs);
      }

      try {
        return await this._executeReservationTransaction(
          input,
          inventory,
          reservationTtl,
          params.mode,
        );
      } catch (err) {
        if (err instanceof ConcurrencyException) {
          continue; // retry
        }
        throw err;
      }
    }

    throw new HttpException(
      {
        code: 'CONCURRENT_UPDATE',
        message: 'Stock is being updated — try again',
      },
      HttpStatus.CONFLICT,
    );
  }

  /**
   * The $transaction — contains ONLY DB operations. (§3.1 — zero external awaits)
   *
   * GOVERNANCE:
   *   - isolationLevel: ReadCommitted (§3.5)
   *   - timeout: 5000 (§3.4)
   *   - FOR UPDATE via findByProductIdWithLock (§3.5, INV-1)
   *   - optimistic lock: WHERE version=N, count=0 → ConcurrencyException → retry (INV-5)
   *   - expiresAt: server-side Date.now() + ttl (INV-8, §5)
   *   - EventOutbox dedup keys: deterministic (§6.1, WARNING 6)
   *
   * FORBIDDEN inside this method:
   *   redis.*, axios.*, fetch(), BullMQ.*, EventEmitter.emit()  (§3.1)
   */
  private async _executeReservationTransaction(
    input: ReserveStockInput,
    _inventoryHint: { id: string },
    reservationTtl: number,
    mode: string,
  ): Promise<ReserveStockResult> {
    return this.prisma.$transaction(
      async (tx) => {
        // ── Step 8a: FOR UPDATE — authoritative read, row-level lock ──
        const inv = await this.inventoryRepo.findByProductIdWithLock(
          input.productId,
          tx as any,
        );
        if (!inv) {
          throw new UnprocessableEntityException({
            code: 'INVENTORY_NOT_FOUND',
          });
        }

        // inv.quantity ALREADY represents available stock (it is decremented on reservation).
        // DO NOT subtract reservedQty here, otherwise we double-dip!
        const available = inv.quantity;

        // ── Step 8b: Availability check — INSIDE transaction with FOR UPDATE (INV-10) ──
        if (available < input.quantity) {
          this.metrics.oversellPrevented();
          this.logger.warn(
            {
              productId: input.productId,
              available,
              requested: input.quantity,
              userId: input.userId,
            },
            'INSUFFICIENT_STOCK — oversell prevented',
          );
          throw new UnprocessableEntityException({
            code: 'INSUFFICIENT_STOCK',
            available,
            requested: input.quantity,
          });
        }

        // ── Step 8c: Decrement with optimistic locking (INV-5) ──
        // WHERE version=N ensures no concurrent write slipped through
        const updatedCount =
          await this.inventoryRepo.decrementQuantityWithVersion(
            inv.id,
            input.quantity,
            inv.version,
            inv.lowStockThreshold,
            tx as any,
          );

        if (updatedCount === 0) {
          // Another process updated this row since our FOR UPDATE read
          // This should not normally happen (FOR UPDATE protects us), but
          // guard against it defensively per INV-5
          throw new ConcurrencyException(inv.id);
        }

        // ── Step 8d: Reservation create — expiresAt server-side (INV-8) ──
        const expiresAt = new Date(Date.now() + reservationTtl * 1000); // server time (§5.3)
        const reservation = await this.reservationRepo.create(
          {
            inventoryId: inv.id,
            quantity: input.quantity,
            cartId: input.cartId,
            orderId: input.orderId,
            expiresAt, // server-computed — NEVER from client (§5)
            reservedByUserId: input.userId,
            reservedByBusinessId: input.businessId,
            orderContext: input.orderType,
            reservationSource: input.reservationSource ?? 'WEB',
          },
          tx as any,
        );

        // ── Step 8e: Movement — RESERVATION_HELD (INV-7, INV-3) ──
        await this.movementRepo.create(
          {
            inventoryId: inv.id,
            type: 'RESERVATION_HELD',
            quantity: input.quantity,
            orderId: input.orderId,
            reason: `Reserved for ${input.orderType}`,
            createdBy: input.userId,
          },
          tx as any,
        );

        // ── Steps 8f–g: EventOutbox — deterministic dedup keys (§6.1, WARNING 6) ──
        const nowMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
        const newIsLowStock =
          inv.quantity - input.quantity <= inv.lowStockThreshold;

        // InventoryReserved event — dedup: inv-reserved-{reservationId} (§6.1)
        await tx.eventOutbox.create({
          data: {
            eventType: 'InventoryReserved',
            eventVersion: '1.0',
            schemaVersion: '4.3',
            payload: {
              reservationId: reservation.id,
              inventoryId: inv.id,
              productId: input.productId,
              quantity: input.quantity,
              expiresAt: expiresAt.toISOString(),
              userId: input.userId,
              segment: input.segment,
            },
            deduplicationKey: `inv-reserved-${reservation.id}`, // DETERMINISTIC (§6.1)
            eventMonth: nowMonth,
            status: 'PENDING',
          },
        });

        // InventoryLowStock event — emitted only when transitioning TO low stock (§11.2 Step 8h)
        // Monthly dedup prevents duplicate low-stock alerts for same product same month (§6.1)
        if (newIsLowStock && !inv.isLowStock) {
          await tx.eventOutbox.create({
            data: {
              eventType: 'InventoryLowStock',
              eventVersion: '1.0',
              schemaVersion: '4.3',
              payload: {
                inventoryId: inv.id,
                productId: input.productId,
                quantity: inv.quantity - input.quantity,
                threshold: inv.lowStockThreshold,
              },
              deduplicationKey: `inv-low-stock-${inv.id}-${nowMonth}`, // DETERMINISTIC monthly (§6.1)
              eventMonth: nowMonth,
              status: 'PENDING',
            },
          });
        }

        return {
          reservationId: reservation.id,
          inventoryId: inv.id,
          productId: input.productId,
          quantity: input.quantity,
          expiresAt: expiresAt.toISOString(),
          status: 'ACTIVE' as const,
          mode,
        };
      },
      {
        isolationLevel: 'ReadCommitted', // §3.5
        timeout: 5000, // §3.4 — 5s max; any longer = something wrong
      },
    );
  }
}

/** Pure delay utility for retry backoff. Outside of $transaction. */
function _delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
