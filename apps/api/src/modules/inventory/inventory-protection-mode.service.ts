import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../core/redis/redis.service';
import { InventoryMetrics } from './inventory.metrics';

/** Protection mode states. §14.1 */
export type ProtectionMode = 'NORMAL' | 'DEGRADED' | 'READ_ONLY';

/**
 * Operational parameters per mode. §14.1
 * Drives all retry/delay/lock decisions in reserve() path.
 */
export interface OperationalParams {
  mode: ProtectionMode;
  skipRedisLock: boolean;
  maxRetries: number;
  retryDelaysMs: number[];
  allowWrites: boolean;
}

/**
 * InventoryProtectionModeService — NORMAL / DEGRADED / READ_ONLY state machine.
 *
 * Authority: SPRINT3_EXECUTION_LOCK_FINAL.md §14.1, §8.1, §8.3
 *
 * States & Transitions:
 *  NORMAL → DEGRADED: Auto, when Redis failures exceed threshold (50 in 60s)
 *  DEGRADED → NORMAL: Ops-cleared failure counter
 *  NORMAL/DEGRADED → READ_ONLY: Manual operator action only
 *  READ_ONLY → NORMAL: Ops explicit clear — NEVER automatic
 *
 * INVARIANT (§0 INV-9): DEGRADED mode maintains correctness — only reduces throughput.
 *  - skipRedisLock=true: uses DB optimistic locking only (maxRetries=5)
 *  - allowWrites=true: inventory writes still proceed
 *  READ_ONLY: skipRedisLock=true, allowWrites=false — all reserve() → 503
 */
@Injectable()
export class InventoryProtectionModeService {
  private readonly logger = new Logger(InventoryProtectionModeService.name);

  /** Redis key for protection mode persistence. No TTL — persistent until ops clears. §8.1 */
  static readonly PROTECT_MODE_KEY = 'inv_protect_mode';
  /** Redis key for failure counter used in auto-DEGRADED detection */
  static readonly FAILURE_COUNTER_KEY = 'inv_redis_failure_count';
  /** Threshold: >50 Redis failures in 60s → auto-transition to DEGRADED. §8.3 */
  static readonly FAILURE_THRESHOLD = 50;
  /** Failure counter TTL window: 60 seconds rolling. §8.3 */
  static readonly FAILURE_WINDOW_TTL = 60;

  private static readonly OPERATIONAL_PARAMS: Record<
    ProtectionMode,
    OperationalParams
  > = {
    NORMAL: {
      mode: 'NORMAL',
      skipRedisLock: false,
      maxRetries: 3,
      retryDelaysMs: [100, 200, 400],
      allowWrites: true,
    },
    DEGRADED: {
      mode: 'DEGRADED',
      skipRedisLock: true,
      maxRetries: 5,
      retryDelaysMs: [200, 400, 800, 1600, 3200],
      allowWrites: true,
    },
    READ_ONLY: {
      mode: 'READ_ONLY',
      skipRedisLock: true,
      maxRetries: 0,
      retryDelaysMs: [],
      allowWrites: false,
    },
  };

  constructor(
    private readonly redis: RedisService,
    private readonly metrics: InventoryMetrics,
  ) {}

  /**
   * Get current operational parameters.
   * Falls back to NORMAL if Redis unavailable — allows recovery from full Redis outage.
   */
  async getOperationalParams(): Promise<OperationalParams> {
    try {
      const raw = await this.redis.get(
        InventoryProtectionModeService.PROTECT_MODE_KEY,
      );
      const mode = (raw as ProtectionMode | null) ?? 'NORMAL';
      // Validate stored value is a known mode
      if (!['NORMAL', 'DEGRADED', 'READ_ONLY'].includes(mode)) {
        this.logger.error(
          { stored: raw },
          'Invalid protection mode in Redis — defaulting to NORMAL',
        );
        return InventoryProtectionModeService.OPERATIONAL_PARAMS['NORMAL'];
      }
      return InventoryProtectionModeService.OPERATIONAL_PARAMS[mode];
    } catch {
      // Redis down — cannot read mode — default to DEGRADED to allow optimistic locking writes
      this.logger.error(
        'Cannot read protection mode from Redis — defaulting to DEGRADED',
      );
      return InventoryProtectionModeService.OPERATIONAL_PARAMS['DEGRADED'];
    }
  }

  /**
   * Get current raw mode string without full param expansion.
   */
  async getCurrentMode(): Promise<ProtectionMode> {
    try {
      const raw = await this.redis.get(
        InventoryProtectionModeService.PROTECT_MODE_KEY,
      );
      return (raw as ProtectionMode | null) ?? 'NORMAL';
    } catch {
      return 'NORMAL';
    }
  }

  /**
   * Report a Redis failure and auto-transition to DEGRADED if threshold exceeded.
   * Called by InventoryLockService and any service that interacts with Redis.
   * §8.3
   */
  async reportRedisFailure(): Promise<void> {
    try {
      // Use a separate DB-independent counter for failure tracking.
      // Ironically this also uses Redis — but we catch errors.
      // The intent: if Redis is intermittently failing (not fully down),
      // the counter accumulates. If Redis is fully down, this throws and we log only.
      const key = InventoryProtectionModeService.FAILURE_COUNTER_KEY;
      const count = await this.redis.incr(key);
      if (count === 1) {
        await this.redis.expire(
          key,
          InventoryProtectionModeService.FAILURE_WINDOW_TTL,
        );
      }
      if (count > InventoryProtectionModeService.FAILURE_THRESHOLD) {
        await this._transitionTo('DEGRADED');
      }
    } catch {
      // Redis is fully down — log CRITICAL, cannot auto-transition
      this.logger.error(
        'Redis unavailable — inventory writes in degraded mode (manual mode detection only)',
      );
    }
  }

  /**
   * Manually set protection mode. Operator use only (READ_ONLY transitions).
   * Auto transitions use reportRedisFailure() instead.
   */
  async setMode(mode: ProtectionMode): Promise<void> {
    await this._transitionTo(mode);
  }

  /**
   * Clear READ_ONLY mode → NORMAL. Explicit ops action. (§14.1 — NEVER automatic)
   */
  async clearReadOnlyMode(): Promise<void> {
    await this._transitionTo('NORMAL');
  }

  private async _transitionTo(newMode: ProtectionMode): Promise<void> {
    const currentMode = await this.getCurrentMode();
    if (currentMode === newMode) return;

    await this.redis.set(
      InventoryProtectionModeService.PROTECT_MODE_KEY,
      newMode,
    );
    this.metrics.protectionModeChanged(newMode);
    this.logger.warn(
      { from: currentMode, to: newMode },
      `Protection mode transition: ${currentMode} → ${newMode}`,
    );
  }
}
