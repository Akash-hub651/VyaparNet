import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CircuitBreakerService } from '../services/circuit-breaker.service';

/**
 * CircuitBreakerService unit tests — FIX-8b.
 *
 * Tests INV-S6-21 enforcement:
 * - isOpen: reads cb:{channel}:open key
 * - recordFailure: increments counter, opens circuit at ≥5, emits cb_state=1
 * - recordSuccess: clears keys, emits cb_state=0 only if was OPEN
 * - Redis failure: isOpen → assume CLOSED (NEVER block on Redis failure)
 * - Double-failure bug (FIX-1/FIX-2): single recordFailure() increments by exactly 1
 */
describe('CircuitBreakerService', () => {
  let service: CircuitBreakerService;
  let mockRedis: {
    exists: ReturnType<typeof vi.fn>;
    incr: ReturnType<typeof vi.fn>;
    expire: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
    del: ReturnType<typeof vi.fn>;
  };
  let mockMetrics: {
    notificationCbState: { set: ReturnType<typeof vi.fn> };
  };

  beforeEach(() => {
    mockRedis = {
      exists: vi.fn(),
      incr: vi.fn(),
      expire: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
    };
    mockMetrics = {
      notificationCbState: { set: vi.fn() },
    };
    service = new CircuitBreakerService(mockRedis as any, mockMetrics as any);
  });

  afterEach(() => vi.clearAllMocks());

  // ─── isOpen ─────────────────────────────────────────────────────────────────

  describe('isOpen()', () => {
    it('returns true when cb:sms:open exists in Redis', async () => {
      mockRedis.exists.mockResolvedValue(1);
      expect(await service.isOpen('sms')).toBe(true);
      expect(mockRedis.exists).toHaveBeenCalledWith('cb:sms:open');
    });

    it('returns false when cb:email:open does not exist', async () => {
      mockRedis.exists.mockResolvedValue(0);
      expect(await service.isOpen('email')).toBe(false);
    });

    it('returns false (CLOSED) on Redis failure — INV-S6-21: never block on Redis failure', async () => {
      mockRedis.exists.mockRejectedValue(new Error('Redis ECONNRESET'));
      expect(await service.isOpen('sms')).toBe(false);
    });
  });

  // ─── recordFailure ───────────────────────────────────────────────────────────

  describe('recordFailure()', () => {
    it('increments failure counter on each call', async () => {
      mockRedis.incr.mockResolvedValue(1);
      await service.recordFailure('sms');
      expect(mockRedis.incr).toHaveBeenCalledWith('cb:sms:failures');
    });

    it('sets 60s expire on the first failure (count === 1)', async () => {
      mockRedis.incr.mockResolvedValue(1);
      await service.recordFailure('sms');
      expect(mockRedis.expire).toHaveBeenCalledWith('cb:sms:failures', 60);
    });

    it('does NOT set expire when count > 1 (window already set)', async () => {
      mockRedis.incr.mockResolvedValue(3);
      await service.recordFailure('sms');
      expect(mockRedis.expire).not.toHaveBeenCalled();
    });

    it('opens circuit and emits cb_state=1 when count reaches 5 — INV-S6-21', async () => {
      mockRedis.incr.mockResolvedValue(5);
      await service.recordFailure('sms');
      expect(mockRedis.set).toHaveBeenCalledWith('cb:sms:open', '1', 'EX', 120);
      expect(mockMetrics.notificationCbState.set).toHaveBeenCalledWith(
        { channel: 'sms' },
        1,
      );
    });

    it('does NOT open circuit at count 4 — threshold is exactly 5', async () => {
      mockRedis.incr.mockResolvedValue(4);
      await service.recordFailure('sms');
      expect(mockRedis.set).not.toHaveBeenCalled();
      expect(mockMetrics.notificationCbState.set).not.toHaveBeenCalled();
    });

    it('opens circuit at count 6 (>=5 check, not ===5)', async () => {
      mockRedis.incr.mockResolvedValue(6);
      await service.recordFailure('email');
      expect(mockRedis.set).toHaveBeenCalledWith(
        'cb:email:open',
        '1',
        'EX',
        120,
      );
    });

    it('swallows Redis failures silently — never throws', async () => {
      mockRedis.incr.mockRejectedValue(new Error('Redis timeout'));
      await expect(service.recordFailure('sms')).resolves.toBeUndefined();
    });

    // FIX-1/FIX-2 regression: single call = single increment
    it('increments failure counter exactly once per call — FIX-1/FIX-2 regression', async () => {
      mockRedis.incr.mockResolvedValue(3);
      await service.recordFailure('sms');
      expect(mockRedis.incr).toHaveBeenCalledTimes(1);
    });
  });

  // ─── recordSuccess ───────────────────────────────────────────────────────────

  describe('recordSuccess()', () => {
    it('deletes both failures and open keys on success', async () => {
      mockRedis.exists.mockResolvedValue(0); // was not open
      await service.recordSuccess('sms');
      expect(mockRedis.del).toHaveBeenCalledWith(
        'cb:sms:failures',
        'cb:sms:open',
      );
    });

    it('emits cb_state=0 when circuit was previously OPEN', async () => {
      mockRedis.exists.mockResolvedValue(1); // was open
      mockRedis.del.mockResolvedValue(2);
      await service.recordSuccess('email');
      expect(mockMetrics.notificationCbState.set).toHaveBeenCalledWith(
        { channel: 'email' },
        0,
      );
    });

    it('does NOT emit cb_state=0 when circuit was already CLOSED', async () => {
      mockRedis.exists.mockResolvedValue(0); // was not open
      await service.recordSuccess('email');
      expect(mockMetrics.notificationCbState.set).not.toHaveBeenCalled();
    });

    it('swallows Redis failures silently — never throws', async () => {
      mockRedis.exists.mockRejectedValue(new Error('Redis down'));
      await expect(service.recordSuccess('sms')).resolves.toBeUndefined();
    });
  });
});
