import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { RedisService } from '../../core/redis/redis.service';
import { InventoryMetrics } from './inventory.metrics';

/**
 * InventoryLockService — Redis distributed lock abstraction.
 *
 * Authority: SPRINT3_EXECUTION_LOCK_FINAL.md §11.1, §8.2, §7.2 Layer 3
 *
 * INVARIANTS (non-negotiable — §0 INV-4):
 *  - Lock key: inv_lock:{inventoryId} — NOT productId (§8.2, §7.3 rule 3)
 *  - acquire(): single atomic SET NX EX command
 *  - release(): Lua CAS script — NEVER plain redis.del()
 *  - withLock(): try-finally — lock ALWAYS released after fn() resolves
 *  - Hot detection: INCR inv_hot_product:{inventoryId} on failed acquire (§19.1)
 *
 * AI-AGENT WARNINGS (§34):
 *  - WARNING 2: Lock key uses inventoryId, not productId
 *  - WARNING 3: Release uses Lua CAS, not redis.del()
 *  - WARNING 4: Release is in finally — NEVER inside $transaction
 */
@Injectable()
export class InventoryLockService {
  private readonly logger = new Logger(InventoryLockService.name);

  /** Lock key prefix. Value: inventoryId (not productId — §8.2) */
  static readonly LOCK_KEY_PREFIX = 'inv_lock:';
  /** Hot contention tracking key prefix. §19.1 */
  static readonly HOT_KEY_PREFIX = 'inv_hot_product:';
  /** Lock TTL: 30s auto-expiry prevents deadlock on process crash. §8.1 */
  static readonly LOCK_TTL_SECONDS = 30;
  /** Contention threshold: >20 failed acquires in HOT_KEY_TTL window = HOT. §19.1 */
  static readonly CONTENTION_THRESHOLD = 20;
  /** Hot key rolling window: 5 minutes. §19.1 */
  static readonly HOT_KEY_TTL = 300;

  /**
   * Lua CAS script for atomic compare-and-delete lock release.
   * The ONLY acceptable mechanism for releasing a distributed lock. (§8.2, WARNING 3)
   * Returns 1 if deleted, 0 if token mismatch (lock expired or taken by another process).
   */
  private static readonly LUA_RELEASE_SCRIPT = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;

  constructor(
    private readonly redis: RedisService,
    private readonly metrics: InventoryMetrics,
  ) {}

  /**
   * Acquire distributed lock for an inventory record.
   *
   * Uses single atomic SET NX EX — no race condition possible. (§8.2)
   * On failure: increments contention counter, throws ConflictException.
   *
   * @param inventoryId — NOT productId. Inventory-level granularity (§8.2).
   * @returns lockToken — cryptographically random UUID; only owner can release.
   */
  async acquire(inventoryId: string): Promise<string> {
    const lockToken = crypto.randomUUID();
    const key = `${InventoryLockService.LOCK_KEY_PREFIX}${inventoryId}`;

    // Single atomic command: SET key value EX 30 NX
    const result = await this.redis.set(
      key,
      lockToken,
      'EX',
      InventoryLockService.LOCK_TTL_SECONDS,
      'NX',
    );

    if (result === null) {
      // Lock held by another process — track contention for hot-product detection (§19.1)
      await this._trackContention(inventoryId);
      throw new ConflictException({
        code: 'INVENTORY_LOCK_UNAVAILABLE',
        details: { retryAfterMs: 200 },
      });
    }

    return lockToken;
  }

  /**
   * Release distributed lock using Lua CAS.
   *
   * NEVER uses plain redis.del() — another process may have acquired the lock
   * after our TTL expired, and plain DEL would release their lock. (§8.2, WARNING 3)
   *
   * result === 0 → lock already expired or taken → LOG.warn, NOT throw.
   * This is safe: lock TTL auto-expires, correctness maintained by optimistic locking.
   */
  async release(inventoryId: string, lockToken: string): Promise<void> {
    const key = `${InventoryLockService.LOCK_KEY_PREFIX}${inventoryId}`;

    const result = (await this.redis.eval(
      InventoryLockService.LUA_RELEASE_SCRIPT,
      1,
      key,
      lockToken,
    )) as number;

    if (result === 0) {
      // Do NOT throw — lock TTL handled cleanup; correctness maintained by DB optimistic locking.
      this.logger.warn(
        { inventoryId, tokenPrefix: lockToken.slice(0, 8) },
        'Lock already expired or taken — TTL handled cleanup. Safe.',
      );
    }
  }

  /**
   * Execute fn() under distributed lock. Lock ALWAYS released in finally block.
   *
   * INVARIANT (§0 INV-4): Lock released AFTER fn() resolves (i.e., AFTER $transaction commits).
   * $transaction lives inside fn(). Lock release is the LAST operation.
   *
   * WARNING (§34 WARNING 4): release() is in finally — NEVER inside $transaction callback.
   */
  async withLock<T>(inventoryId: string, fn: () => Promise<T>): Promise<T> {
    const lockToken = await this.acquire(inventoryId);
    try {
      return await fn(); // $transaction lives inside fn()
    } finally {
      // Release AFTER fn() resolves — AFTER $transaction commits. Never before. (INV-4)
      await this.release(inventoryId, lockToken).catch((err: Error) =>
        this.logger.error(
          { inventoryId, error: err.message },
          'Lock release failed — TTL auto-expires. Correctness maintained by optimistic locking.',
        ),
      );
    }
  }

  /**
   * Track lock contention for hot-product detection. (§19.1)
   * Uses INCR (atomic). Sets TTL on first increment (rolling 5-minute window).
   */
  private async _trackContention(inventoryId: string): Promise<void> {
    const hotKey = `${InventoryLockService.HOT_KEY_PREFIX}${inventoryId}`;
    try {
      const count = await this.redis.incr(hotKey);
      if (count === 1) {
        await this.redis.expire(hotKey, InventoryLockService.HOT_KEY_TTL);
      }
      if (count >= InventoryLockService.CONTENTION_THRESHOLD) {
        this.metrics.hotProductDetected(inventoryId, count);
        this.logger.warn(
          { inventoryId, contentionCount: count },
          'HOT PRODUCT — contention spike detected',
        );
      }
    } catch (err: unknown) {
      // Contention tracking failure must not block the lock error path
      this.logger.error(
        { inventoryId, error: (err as Error).message },
        'Hot product tracking failed — non-critical',
      );
    }
  }
}
