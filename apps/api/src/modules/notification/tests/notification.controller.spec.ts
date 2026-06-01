import { vi, describe, it, expect, beforeEach } from 'vitest';
import { NotificationController } from '../notification.controller';

/**
 * NotificationController unit tests — FIX-8d.
 *
 * Tests all 7 routes and their governance invariants:
 * - INV-S6-18: userId always from req.user.id (JWT), NEVER from body/query
 * - INV-S6-24: Cursor pagination for getNotifications
 * - Cross-user isolation: markRead/markAllRead scoped to own userId
 * - Preferences: getPreferences/updatePreferences delegates to service
 * - Push: subscribe/unsubscribe/vapid-public-key routes
 */
describe('NotificationController', () => {
  let controller: NotificationController;

  // ── Mock request helper ────────────────────────────────────────────────────
  const mockReq = (userId = 'user-abc') => ({ user: { id: userId } });

  // ── Mocks ──────────────────────────────────────────────────────────────────
  const mockNotificationService = {
    getNotifications: vi
      .fn()
      .mockResolvedValue({ items: [], nextCursor: null, hasMore: false }),
    getUnreadCount: vi.fn().mockResolvedValue(5),
  };
  const mockNotificationRepository = {
    markRead: vi.fn().mockResolvedValue(undefined),
    markAllRead: vi.fn().mockResolvedValue(undefined),
  };
  const mockPushSubscriptionRepository = {
    upsert: vi.fn().mockResolvedValue({ id: 'sub-1' }),
    deleteByEndpoint: vi.fn().mockResolvedValue(undefined),
  };
  const mockPreferenceService = {
    getPreferences: vi
      .fn()
      .mockResolvedValue({ sms: {}, email: {}, push: {}, inApp: {} }),
    updatePreferences: vi
      .fn()
      .mockResolvedValue({ sms: {}, email: {}, push: {}, inApp: {} }),
  };
  const mockConfig = {
    get: vi.fn().mockReturnValue('test-vapid-public-key'),
  };
  const mockRedis = {
    del: vi.fn().mockResolvedValue(1),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new NotificationController(
      mockNotificationService as any,
      mockNotificationRepository as any,
      mockPushSubscriptionRepository as any,
      mockPreferenceService as any,
      mockConfig as any,
      mockRedis as any,
    );
  });

  // ─── GET /notifications ────────────────────────────────────────────────────

  describe('getNotifications()', () => {
    it('extracts userId from req.user.id — INV-S6-18', async () => {
      const req = mockReq('user-123');
      await controller.getNotifications(req, { limit: 20 });
      expect(mockNotificationService.getNotifications).toHaveBeenCalledWith(
        'user-123',
        expect.any(Object),
      );
    });

    it('passes query params to service unchanged', async () => {
      const req = mockReq();
      const query = { limit: 10, cursor: 'cur-abc', isRead: false } as any;
      await controller.getNotifications(req, query);
      expect(mockNotificationService.getNotifications).toHaveBeenCalledWith(
        'user-abc',
        query,
      );
    });

    it('returns service response directly', async () => {
      const expected = {
        items: [{ id: 'n1' }],
        nextCursor: 'c1',
        hasMore: true,
      };
      mockNotificationService.getNotifications.mockResolvedValue(expected);
      const result = await controller.getNotifications(mockReq(), {} as any);
      expect(result).toBe(expected);
    });
  });

  // ─── GET /notifications/unread-count ──────────────────────────────────────

  describe('getUnreadCount()', () => {
    it('returns count wrapped in success envelope', async () => {
      mockNotificationService.getUnreadCount.mockResolvedValue(7);
      const result = await controller.getUnreadCount(mockReq('user-xyz'));
      expect(result).toEqual({ success: true, data: { count: 7 } });
    });

    it('uses userId from JWT — INV-S6-18', async () => {
      await controller.getUnreadCount(mockReq('jwt-user'));
      expect(mockNotificationService.getUnreadCount).toHaveBeenCalledWith(
        'jwt-user',
      );
    });
  });

  // ─── PATCH /notifications/read-all ────────────────────────────────────────

  describe('markAllRead()', () => {
    it('marks all read for requesting user only — INV-S6-18', async () => {
      await controller.markAllRead(mockReq('user-abc'));
      expect(mockNotificationRepository.markAllRead).toHaveBeenCalledWith(
        'user-abc',
      );
    });

    it('invalidates unread-count cache key for the user', async () => {
      await controller.markAllRead(mockReq('user-abc'));
      expect(mockRedis.del).toHaveBeenCalledWith('notif:unread-count:user-abc');
    });

    it('returns { success: true }', async () => {
      const result = await controller.markAllRead(mockReq());
      expect(result).toEqual({ success: true });
    });
  });

  // ─── PATCH /notifications/:id/read ────────────────────────────────────────

  describe('markRead()', () => {
    it('passes notificationId + userId to repository — ownership enforced at DB level', async () => {
      await controller.markRead(mockReq('user-abc'), 'notif-123');
      expect(mockNotificationRepository.markRead).toHaveBeenCalledWith(
        'notif-123',
        'user-abc',
      );
    });

    it('invalidates unread-count cache after marking read', async () => {
      await controller.markRead(mockReq('user-abc'), 'notif-999');
      expect(mockRedis.del).toHaveBeenCalledWith('notif:unread-count:user-abc');
    });

    it('returns { success: true }', async () => {
      const result = await controller.markRead(mockReq(), 'any-id');
      expect(result).toEqual({ success: true });
    });

    it('cross-user mark attempt: userId from JWT prevents other user mutation — INV-S6-18', async () => {
      // If attacker sends PATCH /notifications/victim-notif-id/read with their own JWT
      // → repository.markRead('victim-notif-id', 'attacker-user-id')
      // → Prisma updateMany WHERE id=victim-notif-id AND userId=attacker-user-id → 0 rows affected
      await controller.markRead(mockReq('attacker-user-id'), 'victim-notif-id');
      expect(mockNotificationRepository.markRead).toHaveBeenCalledWith(
        'victim-notif-id',
        'attacker-user-id', // correct — DB silently ignores ownership mismatch
      );
    });
  });

  // ─── GET /notifications/preferences ───────────────────────────────────────

  describe('getPreferences()', () => {
    it('fetches preferences for JWT user — INV-S6-18', async () => {
      await controller.getPreferences(mockReq('pref-user'));
      expect(mockPreferenceService.getPreferences).toHaveBeenCalledWith(
        'pref-user',
      );
    });

    it('returns preferences wrapped in success envelope', async () => {
      const prefs = {
        sms: { orderUpdates: true },
        email: {},
        push: {},
        inApp: {},
      };
      mockPreferenceService.getPreferences.mockResolvedValue(prefs);
      const result = await controller.getPreferences(mockReq());
      expect(result).toEqual({ success: true, data: prefs });
    });
  });

  // ─── PUT /notifications/preferences ───────────────────────────────────────

  describe('updatePreferences()', () => {
    const validPrefs = {
      sms: {
        orderUpdates: true,
        paymentUpdates: true,
        scorecard: true,
        lowStock: true,
      },
      email: {
        orderUpdates: true,
        paymentUpdates: true,
        scorecard: false,
        lowStock: false,
      },
      push: {
        orderUpdates: true,
        paymentUpdates: true,
        scorecard: false,
        lowStock: false,
      },
      inApp: {
        orderUpdates: true,
        paymentUpdates: true,
        scorecard: true,
        lowStock: true,
      },
    };

    it('persists preferences via service for JWT user', async () => {
      await controller.updatePreferences(mockReq('pref-user'), validPrefs);
      expect(mockPreferenceService.updatePreferences).toHaveBeenCalledWith(
        'pref-user',
        validPrefs,
      );
    });

    it('returns updated preferences in success envelope', async () => {
      mockPreferenceService.updatePreferences.mockResolvedValue(validPrefs);
      const result = await controller.updatePreferences(mockReq(), validPrefs);
      expect(result).toEqual({ success: true, data: validPrefs });
    });
  });

  // ─── POST /notifications/push/subscribe ────────────────────────────────────

  describe('subscribe()', () => {
    const subscribeDto = {
      endpoint: 'https://push.example.com/123',
      keys: { p256dh: 'p256-key', auth: 'auth-key' },
    };

    it('upserts subscription scoped to JWT user — INV-S6-22', async () => {
      await controller.subscribe(mockReq('push-user'), subscribeDto);
      expect(mockPushSubscriptionRepository.upsert).toHaveBeenCalledWith(
        'push-user',
        subscribeDto,
      );
    });

    it('returns { success: true }', async () => {
      const result = await controller.subscribe(mockReq(), subscribeDto);
      expect(result).toEqual({ success: true });
    });
  });

  // ─── DELETE /notifications/push/unsubscribe ─────────────────────────────────

  describe('unsubscribe()', () => {
    it('deletes subscription by endpoint scoped to JWT user — INV-S6-29', async () => {
      const body = { endpoint: 'https://push.example.com/456' };
      await controller.unsubscribe(mockReq('push-user'), body);
      expect(
        mockPushSubscriptionRepository.deleteByEndpoint,
      ).toHaveBeenCalledWith('push-user', 'https://push.example.com/456');
    });

    it('returns { success: true }', async () => {
      const result = await controller.unsubscribe(mockReq(), {
        endpoint: 'ep',
      });
      expect(result).toEqual({ success: true });
    });
  });

  // ─── GET /notifications/push/vapid-public-key ──────────────────────────────

  describe('getVapidPublicKey()', () => {
    it('returns VAPID public key from config — never private key', async () => {
      mockConfig.get.mockReturnValue('BPublicVapidKeyHere');
      const result = await controller.getVapidPublicKey();
      expect(result).toEqual({
        success: true,
        data: { publicKey: 'BPublicVapidKeyHere' },
      });
      expect(mockConfig.get).toHaveBeenCalledWith('VAPID_PUBLIC_KEY');
    });
  });
});
