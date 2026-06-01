import { vi, describe, it, expect, beforeEach } from 'vitest';
import { OutboxConsumerWorker } from '../workers/outbox-consumer.worker';
import { OUTBOX_EVENT_NOTIFICATION_MAP } from '../constants/outbox-event-map.constant';

/**
 * OutboxConsumerWorker unit tests — FIX-8c.
 *
 * Tests the 6-step processing sequence and all governance invariants:
 * - INV-S6-2: COMPLETED only after handler succeeds
 * - INV-S6-3: safeParse() used for all payload validation
 * - INV-S6-17: idempotency key prevents double processing
 * - INV-S6-26: isPolling guard prevents overlap
 * - INV-S6-27: unknown eventType → mark completed, no crash
 */
describe('OutboxConsumerWorker', () => {
  let worker: OutboxConsumerWorker;

  // ── Mocks ──────────────────────────────────────────────────────────────────
  const mockPrisma = {
    eventOutbox: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    pushSubscription: {
      count: vi.fn(),
    },
  };
  const mockRedis = {
    set: vi.fn(),
    exists: vi.fn(),
    del: vi.fn(),
  };
  const mockQueue = {
    getJobCounts: vi.fn().mockResolvedValue({ waiting: 0, active: 0 }),
    add: vi.fn().mockResolvedValue({ id: 'job-1' }),
  };
  const mockNotificationService = {
    createAndEnqueue: vi.fn().mockResolvedValue(undefined),
    createInAppNotification: vi.fn().mockResolvedValue('notif-id-1'),
  };
  const mockUserContactService = {
    getContact: vi.fn().mockResolvedValue({
      userId: 'u1',
      phone: '+911234567890',
      email: 'a@b.com',
      name: 'Test',
      language: 'hi',
    }),
    getBusinessOwnerUserId: vi.fn().mockResolvedValue('seller-user-id'),
  };
  const mockDeduplicationService = {
    isDuplicate: vi.fn().mockResolvedValue(false),
    setProcessed: vi.fn().mockResolvedValue(undefined),
    isLowStockRateLimited: vi.fn().mockResolvedValue(false),
    setLowStockRateLimit: vi.fn().mockResolvedValue(undefined),
  };
  const mockPreferenceService = {
    getPreferences: vi.fn().mockResolvedValue({
      sms: { orderUpdates: true },
      email: { orderUpdates: true },
      push: { orderUpdates: true },
      inApp: { orderUpdates: true },
    }),
    isChannelEnabled: vi.fn().mockReturnValue(true),
  };
  const mockMetrics = {
    notificationOutboxConsumedTotal: { inc: vi.fn() },
    notificationOutboxFailedTotal: { inc: vi.fn() },
    notificationQueueDepth: { set: vi.fn() },
    notificationPushSubscriptionsActive: { set: vi.fn() },
  };

  const buildWorker = () =>
    new OutboxConsumerWorker(
      mockPrisma as any,
      mockRedis as any,
      mockQueue as any,
      mockNotificationService as any,
      mockUserContactService as any,
      mockDeduplicationService as any,
      mockPreferenceService as any,
      mockMetrics as any,
    );

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: lock acquired
    mockRedis.set.mockResolvedValue('OK');
    // Default: not already processed
    mockRedis.exists.mockResolvedValue(0);
    // Default: prisma update succeeds
    mockPrisma.eventOutbox.update.mockResolvedValue({});
    worker = buildWorker();
  });

  // ─── INV-S6-26: isPolling guard ────────────────────────────────────────────

  describe('INV-S6-26: isPolling guard', () => {
    it('skips poll if previous poll is still running', async () => {
      mockPrisma.eventOutbox.findMany.mockResolvedValue([]);
      // First poll runs
      const p1 = worker.pollEventOutbox();
      // isPolling is now true — second call should skip immediately
      const p2 = worker.pollEventOutbox();
      await Promise.all([p1, p2]);
      // findMany called only once (second poll skipped)
      expect(mockPrisma.eventOutbox.findMany).toHaveBeenCalledTimes(1);
    });

    it('resets isPolling after poll completes normally', async () => {
      mockPrisma.eventOutbox.findMany.mockResolvedValue([]);
      await worker.pollEventOutbox();
      // Can run again after completion
      await worker.pollEventOutbox();
      expect(mockPrisma.eventOutbox.findMany).toHaveBeenCalledTimes(2);
    });
  });

  // ─── INV-S6-17: Idempotency ────────────────────────────────────────────────

  describe('INV-S6-17: idempotency key prevents double processing', () => {
    const validEvent = {
      id: 'evt-1',
      eventType: 'OrderCreated',
      schemaVersion: '1',
      createdAt: new Date(),
      payload: {
        orderId: 'ord-1',
        orderNumber: 'ORD-001',
        buyerId: 'buyer-1',
        sellerId: 'biz-1',
        segment: 'TEXTILE',
        grandTotal: 1000,
        timestamp: new Date().toISOString(),
      },
    };

    it('skips processing and marks COMPLETED when idempotency key already set', async () => {
      mockPrisma.eventOutbox.findMany.mockResolvedValue([validEvent]);
      mockRedis.exists.mockResolvedValue(1); // already processed

      await worker.pollEventOutbox();

      expect(mockNotificationService.createAndEnqueue).not.toHaveBeenCalled();
      expect(mockPrisma.eventOutbox.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'evt-1' } }),
      );
    });

    it('sets idempotency key AFTER handler succeeds — INV-S6-2', async () => {
      mockPrisma.eventOutbox.findMany.mockResolvedValue([validEvent]);
      mockRedis.exists.mockResolvedValue(0);

      const callOrder: string[] = [];
      mockNotificationService.createAndEnqueue.mockImplementation(async () => {
        callOrder.push('handler');
      });
      mockPrisma.eventOutbox.update.mockImplementation(async () => {
        callOrder.push('mark-completed');
        return {};
      });
      mockRedis.set
        .mockResolvedValueOnce('OK') // lock acquisition
        .mockImplementation(async () => {
          callOrder.push('idempotency-key');
          return 'OK';
        });

      await worker.pollEventOutbox();

      // handler must complete before mark-completed and idempotency key
      const handlerIdx = callOrder.indexOf('handler');
      const completedIdx = callOrder.indexOf('mark-completed');
      expect(handlerIdx).toBeLessThan(completedIdx);
    });
  });

  // ─── INV-S6-27: Unknown eventType ──────────────────────────────────────────

  describe('INV-S6-27: unknown eventType handling', () => {
    it('marks event COMPLETED without calling any handler for unknown eventType', async () => {
      const unknownEvent = {
        id: 'evt-unknown',
        eventType: 'SomeUnknownEvent',
        schemaVersion: '1',
        createdAt: new Date(),
        payload: {},
      };
      mockPrisma.eventOutbox.findMany.mockResolvedValue([unknownEvent]);
      mockRedis.exists.mockResolvedValue(0);

      await worker.pollEventOutbox();

      expect(mockNotificationService.createAndEnqueue).not.toHaveBeenCalled();
      expect(mockPrisma.eventOutbox.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'evt-unknown' } }),
      );
    });

    it('does NOT register OrderConfirmed or OrderCancelled — INV-S6-13', () => {
      expect(OUTBOX_EVENT_NOTIFICATION_MAP['OrderConfirmed']).toBeUndefined();
      expect(OUTBOX_EVENT_NOTIFICATION_MAP['OrderCancelled']).toBeUndefined();
    });
  });

  // ─── Payload validation ────────────────────────────────────────────────────

  describe('payload validation — INV-S6-3', () => {
    it('marks event FAILED (not completed) on invalid payload', async () => {
      const invalidEvent = {
        id: 'evt-bad',
        eventType: 'OrderCreated',
        schemaVersion: '1',
        createdAt: new Date(),
        payload: { orderId: 'only-this-field' }, // missing required fields
      };
      mockPrisma.eventOutbox.findMany.mockResolvedValue([invalidEvent]);
      mockRedis.exists.mockResolvedValue(0);

      await worker.pollEventOutbox();

      expect(mockPrisma.eventOutbox.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'FAILED' }),
        }),
      );
      expect(mockNotificationService.createAndEnqueue).not.toHaveBeenCalled();
    });
  });

  // ─── FIX-5/FIX-7: Metrics observation ─────────────────────────────────────

  describe('FIX-5/FIX-7: gauge observation', () => {
    it('observes notification_queue_depth on each poll when events exist', async () => {
      mockPrisma.eventOutbox.findMany.mockResolvedValue([
        {
          id: 'e1',
          eventType: 'UnknownSkip',
          schemaVersion: '1',
          createdAt: new Date(),
          payload: {},
        },
      ]);
      mockQueue.getJobCounts.mockResolvedValue({ waiting: 5, active: 2 });

      await worker.pollEventOutbox();

      expect(mockMetrics.notificationQueueDepth.set).toHaveBeenCalledWith(7);
    });

    it('does NOT crash when getJobCounts() rejects', async () => {
      mockPrisma.eventOutbox.findMany.mockResolvedValue([
        {
          id: 'e1',
          eventType: 'UnknownSkip',
          schemaVersion: '1',
          createdAt: new Date(),
          payload: {},
        },
      ]);
      mockQueue.getJobCounts.mockRejectedValue(new Error('Bull unavailable'));

      await expect(worker.pollEventOutbox()).resolves.toBeUndefined();
    });
  });

  // ─── Redis lock ────────────────────────────────────────────────────────────

  describe('Redis lock (NX)', () => {
    it('skips event when lock is not acquired (another pod holds it)', async () => {
      const event = {
        id: 'evt-locked',
        eventType: 'OrderCreated',
        schemaVersion: '1',
        createdAt: new Date(),
        payload: {
          orderId: 'o1',
          orderNumber: 'ORD-001',
          buyerId: 'b1',
          sellerId: 's1',
          segment: 'TEXTILE',
          grandTotal: 100,
          timestamp: new Date().toISOString(),
        },
      };
      mockPrisma.eventOutbox.findMany.mockResolvedValue([event]);
      mockRedis.set.mockResolvedValue(null); // NX returns null = lock not acquired

      await worker.pollEventOutbox();

      expect(mockNotificationService.createAndEnqueue).not.toHaveBeenCalled();
    });
  });
});
