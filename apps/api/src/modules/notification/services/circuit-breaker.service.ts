import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../../core/redis/redis.service';
import { NotificationMetricsService } from './notification-metrics.service';

/**
 * CircuitBreakerService — implements INV-S6-21.
 * Prevents retry storms by opening a circuit after 5 consecutive failures
 * within a 60-second sliding window.
 *
 * FIX-10: Now emits notification_circuit_breaker_state{channel} gauge on every
 * open/close transition for real-time Grafana visibility.
 *   1 = OPEN  (delivery blocked — provider outage)
 *   0 = CLOSED (delivery allowed — healthy)
 *
 * Redis failure mode: assume CLOSED. Never block delivery on Redis unavailability.
 */
@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);

  constructor(
    private readonly redis: RedisService,
    // FIX-10: Metrics service injected to emit cb_state gauge on transitions
    private readonly metrics: NotificationMetricsService,
  ) {}

  /**
   * Returns true if circuit is OPEN (do NOT deliver).
   * Redis unavailable → assume CLOSED (INV-S6-21: never block on Redis failure).
   */
  async isOpen(channel: 'sms' | 'email'): Promise<boolean> {
    try {
      const open = await this.redis.exists(`cb:${channel}:open`);
      return open === 1;
    } catch {
      // INV-S6-21: Redis unavailable = assume CLOSED. NEVER assume OPEN on Redis failure.
      this.logger.warn({ channel }, 'CB_REDIS_UNAVAILABLE_ASSUME_CLOSED');
      return false;
    }
  }

  /**
   * Called on EACH delivery failure.
   * Opens the circuit after 5 failures within 60s sliding window.
   * FIX-10: Emits cb_state=1 gauge when circuit opens.
   */
  async recordFailure(channel: 'sms' | 'email'): Promise<void> {
    try {
      const key = `cb:${channel}:failures`;
      const count = await this.redis.incr(key);
      if (count === 1) await this.redis.expire(key, 60); // 60s sliding window (§4)
      if (count >= 5) {
        await this.redis.set(`cb:${channel}:open`, '1', 'EX', 120); // 120s cooldown
        this.logger.warn(
          { channel, failureCount: count },
          'CIRCUIT_BREAKER_OPENED',
        );
        // FIX-10: Emit cb_state=1 (OPEN) so Grafana alert can fire immediately
        this.metrics.notificationCbState.set({ channel }, 1);
      }
    } catch {
      // Redis failure: swallow — circuit tracking is best-effort observability
    }
  }

  /**
   * Called on EACH delivery success.
   * Resets failure counter and clears open state.
   * FIX-10: Emits cb_state=0 gauge when circuit closes after recovery.
   */
  async recordSuccess(channel: 'sms' | 'email'): Promise<void> {
    try {
      const wasOpen = await this.redis.exists(`cb:${channel}:open`);
      await this.redis.del(`cb:${channel}:failures`, `cb:${channel}:open`);
      if (wasOpen === 1) {
        this.logger.log({ channel }, 'CIRCUIT_BREAKER_CLOSED');
        // FIX-10: Emit cb_state=0 (CLOSED) on recovery
        this.metrics.notificationCbState.set({ channel }, 0);
      }
    } catch {
      // swallow
    }
  }
}
