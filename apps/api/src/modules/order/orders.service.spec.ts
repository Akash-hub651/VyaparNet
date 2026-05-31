import { Test, TestingModule } from '@nestjs/testing';
import { OrdersService, CreateOrderDto } from './orders.service';
import { OrdersRepository } from './orders.repository';
import { OrderStatusHistoryRepository } from './order-status-history.repository';
import { CartRepository } from '../cart/cart.repository';
import { InventoryService } from '../inventory/inventory.service';
import { RedisService } from '../../core/redis/redis.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { PaymentService } from '../payment/payment.service';
import { MetricsService } from '../observability/metrics.service';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@vyaparnet/database';
import { describe, it, expect, beforeEach, vi, type Mocked } from 'vitest';

// ─── helpers ────────────────────────────────────────────────────────────────

function buildCart(paymentMethod = 'COD') {
  return {
    id: 'cart-001',
    userId: 'user-test-001',
    segment: 'TEXTILE',
    items: [{ id: 'ci-001', productId: 'prod-001', quantity: 2 }],
    paymentMethod,
  };
}

function buildReservation(reservationId = 'res-001') {
  return {
    reservationId,
    inventoryId: 'inv-001',
    productId: 'prod-001',
    quantity: 2,
    expiresAt: new Date().toISOString(),
    status: 'ACTIVE',
    mode: 'NORMAL',
  };
}

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('OrdersService', () => {
  let service: OrdersService;
  let redis: Mocked<RedisService>;
  let inventoryService: Mocked<InventoryService>;
  let cartRepo: Mocked<CartRepository>;
  let ordersRepo: Mocked<OrdersRepository>;
  let paymentService: Mocked<PaymentService>;
  let prisma: any;

  const userId = 'user-test-001';
  const ipAddress = '127.0.0.1';

  // Build a tx mock with tracking for call-order assertions
  function buildTxMock(overrides: Record<string, unknown> = {}) {
    return {
      order: {
        create: vi.fn().mockResolvedValue({
          id: 'order-001',
          orderNumber: 'VN-20260528-12345',
          status: overrides.orderStatus ?? 'CONFIRMED',
          version: 0,
        }),
      },
      orderItem: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
      payment: { create: vi.fn().mockResolvedValue({ id: 'pay-001' }) },
      orderStatusHistory: { create: vi.fn().mockResolvedValue({}) },
      eventOutbox: { create: vi.fn().mockResolvedValue({}) },
      cart: { update: vi.fn().mockResolvedValue({}) },
    };
  }

  beforeEach(async () => {
    redis = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue('OK'),
      eval: vi.fn().mockResolvedValue(1), // rate limit: count=1, within limit
    } as any;

    inventoryService = {
      reserve: vi.fn(),
      release: vi.fn().mockResolvedValue({ alreadyReleased: false, status: 'RELEASED', reservationId: 'res-001' }),
      releaseAllForOrder: vi.fn().mockResolvedValue([]),
      consume: vi.fn().mockResolvedValue(undefined),
      getAvailability: vi.fn(),
    } as any;

    cartRepo = {
      findActiveWithItems: vi.fn(),
      findOrCreate: vi.fn(),
      upsertItem: vi.fn(),
      updateItemQuantity: vi.fn(),
      removeItem: vi.fn(),
    } as any;

    ordersRepo = {
      findById: vi.fn(),
      findByBuyerId: vi.fn(),
      findByGatewayRef: vi.fn(),
      findByGatewayOrderId: vi.fn(),
      updateStatus: vi.fn(),
    } as any;

    paymentService = {
      initiatePayment: vi.fn().mockResolvedValue({
        paymentUrl: 'https://api.razorpay.com/v1/checkout',
        razorpayOrderId: 'order_razorpay_001',
        paymentId: 'pay-001',
      }),
      getPaymentStatus: vi.fn(),
      retryPayment: vi.fn(),
    } as any;

    prisma = {
      $transaction: vi.fn().mockImplementation(async (fn: any) => {
        const tx = buildTxMock();
        return fn(tx);
      }),
      product: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'prod-001',
            name: 'Test Product',
            slug: 'test-product',
            segment: 'TEXTILE',
            businessId: 'biz-001',
            basePrice: new Prisma.Decimal(500),
            gstPercent: new Prisma.Decimal(18),
            hsnCode: null,
            moq: 1,
          },
        ]),
      },
      address: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'addr-001',
          userId,
          name: 'Test User',
          line1: '123 Test St',
          line2: null,
          city: 'Mumbai',
          state: 'Maharashtra',
          pincode: '400001',
          country: 'India',
          isDeleted: false,
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: RedisService, useValue: redis },
        { provide: InventoryService, useValue: inventoryService },
        { provide: CartRepository, useValue: cartRepo },
        { provide: OrdersRepository, useValue: ordersRepo },
        { provide: OrderStatusHistoryRepository, useValue: {} },
        { provide: PrismaService, useValue: prisma },
        // HARDENED: PaymentService injected via forwardRef — must be in provider list
        { provide: PaymentService, useValue: paymentService },
        { provide: MetricsService, useValue: { 
          orderNumberCollisionTotal: { inc: vi.fn() }, 
          orderCheckoutSuccessTotal: { inc: vi.fn() }, 
          orderIdempotencyConflictTotal: { inc: vi.fn() }, 
          orderStuckInPlacedTotal: { set: vi.fn() }, 
          orderCancelledTotal: { inc: vi.fn() }, 
          orderCreatedTotal: { inc: vi.fn() },
          orderConfirmedTotal: { inc: vi.fn() },
          redisUnavailableTotal: { inc: vi.fn() },
          checkoutFunnelStepTotal: { inc: vi.fn() },
          cartCheckoutInitiatedTotal: { inc: vi.fn() },
          rateLimitAtomicFailureTotal: { inc: vi.fn() }
        } },
      ],
    })
      .overrideProvider(PaymentService)
      .useValue(paymentService)
      .compile();

    service = module.get<OrdersService>(OrdersService);
  });

  // ─── COD Path Tests ─────────────────────────────────────────────────────

  describe('createOrder (COD)', () => {
    const validDto: CreateOrderDto = {
      shippingAddressId: 'addr-001',
      billingAddressId: 'addr-001',
      paymentMethod: 'COD',
      segment: 'TEXTILE',
      clientIdempotencyKey: 'test-idem-key-001',
    };

    it('returns cached response on idempotency hit', async () => {
      const cachedOrder = {
        orderId: 'order-001',
        orderNumber: 'VN-20260528-12345',
        status: 'CONFIRMED',
        grandTotal: 590,
        paymentMethod: 'COD',
      };
      redis.get.mockResolvedValue(JSON.stringify(cachedOrder));

      const result = await service.createOrder(validDto, userId, ipAddress);

      expect(result).toEqual(cachedOrder);
      expect(inventoryService.reserve).not.toHaveBeenCalled();
    });

    it('throws CART_EMPTY if cart has no items', async () => {
      cartRepo.findActiveWithItems.mockResolvedValue(null);

      await expect(service.createOrder(validDto, userId, ipAddress)).rejects.toThrow(BadRequestException);
    });

    it('throws CART_EMPTY if cart exists but has 0 items', async () => {
      cartRepo.findActiveWithItems.mockResolvedValue({
        id: 'cart-001', userId, segment: 'TEXTILE', items: [],
      } as any);

      await expect(service.createOrder(validDto, userId, ipAddress)).rejects.toThrow(BadRequestException);
    });

    it('releases reservations and rethrows if inventory reserve fails', async () => {
      cartRepo.findActiveWithItems.mockResolvedValue(buildCart() as any);
      inventoryService.reserve.mockRejectedValue(new ConflictException({ code: 'INSUFFICIENT_STOCK' }));

      await expect(service.createOrder(validDto, userId, ipAddress)).rejects.toThrow();
      expect(inventoryService.release).not.toHaveBeenCalled(); // no reservations made yet
    });

    it('releases all reservations if $transaction fails (sequential, S4-W6)', async () => {
      cartRepo.findActiveWithItems.mockResolvedValue(buildCart() as any);
      inventoryService.reserve.mockResolvedValue(buildReservation() as any);
      prisma.$transaction.mockRejectedValue(new Error('DB timeout'));

      await expect(service.createOrder(validDto, userId, ipAddress)).rejects.toThrow('DB timeout');
      expect(inventoryService.release).toHaveBeenCalledWith('res-001', 'ORDER_CANCELLED', 'SYSTEM');
    });

    it('sets idempotency key AFTER $transaction commit (INV-33)', async () => {
      cartRepo.findActiveWithItems.mockResolvedValue(buildCart() as any);
      inventoryService.reserve.mockResolvedValue(buildReservation() as any);

      await service.createOrder(validDto, userId, ipAddress);

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(redis.set).toHaveBeenCalledWith(
        `order_idem:${userId}:test-idem-key-001`,
        expect.any(String),
        'EX',
        3600,
      );
    });

    it('COD: creates synthetic Payment record inside tx (INV-26)', async () => {
      cartRepo.findActiveWithItems.mockResolvedValue(buildCart() as any);
      inventoryService.reserve.mockResolvedValue(buildReservation() as any);

      let capturedTx: any;
      prisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = buildTxMock();
        capturedTx = tx;
        return fn(tx);
      });

      await service.createOrder(validDto, userId, ipAddress);

      // Payment.create MUST be called inside COD tx (INV-26)
      expect(capturedTx.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            method: 'COD',
            gateway: 'COD',
            status: 'CAPTURED',
          }),
        }),
      );
    });

    it('COD: calls consume() inside tx for each reservation (INV-11)', async () => {
      cartRepo.findActiveWithItems.mockResolvedValue(buildCart() as any);
      inventoryService.reserve.mockResolvedValue(buildReservation() as any);

      await service.createOrder(validDto, userId, ipAddress);

      // consume() MUST be called with the tx parameter — NEVER without tx (INV-11)
      expect(inventoryService.consume).toHaveBeenCalledWith('res-001', userId, expect.anything());
    });

    it('COD: order status is CONFIRMED — immediate confirmation', async () => {
      cartRepo.findActiveWithItems.mockResolvedValue(buildCart() as any);
      inventoryService.reserve.mockResolvedValue(buildReservation() as any);

      const result = await service.createOrder(validDto, userId, ipAddress);

      // COD: returned status reflects CONFIRMED (immediate)
      expect(result.status).toBe('CONFIRMED');
      expect(result.paymentUrl).toBeUndefined(); // no paymentUrl for COD
    });

    it('COD: does NOT call paymentService.initiatePayment()', async () => {
      cartRepo.findActiveWithItems.mockResolvedValue(buildCart() as any);
      inventoryService.reserve.mockResolvedValue(buildReservation() as any);

      await service.createOrder(validDto, userId, ipAddress);

      expect(paymentService.initiatePayment).not.toHaveBeenCalled();
    });
  });

  // ─── Online Payment Path Tests ──────────────────────────────────────────

  describe('createOrder (ONLINE_UPI) — Phase 5', () => {
    const onlineDto: CreateOrderDto = {
      shippingAddressId: 'addr-001',
      billingAddressId: 'addr-001',
      paymentMethod: 'ONLINE_UPI',
      segment: 'TEXTILE',
      clientIdempotencyKey: 'online-idem-key-001',
    };

    beforeEach(() => {
      // Online tx mock returns PLACED status
      prisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = buildTxMock({ orderStatus: 'PLACED' });
        return fn(tx);
      });
    });

    it('Online: order status is PLACED — NOT CONFIRMED (§3.4)', async () => {
      cartRepo.findActiveWithItems.mockResolvedValue(buildCart('ONLINE_UPI') as any);
      inventoryService.reserve.mockResolvedValue(buildReservation() as any);

      const result = await service.createOrder(onlineDto, userId, ipAddress);

      // Online order MUST be PLACED — consume() deferred to webhook (INV-11)
      expect(result.status).toBe('PLACED');
    });

    it('Online: returns paymentUrl in response (§3.4 Step 11)', async () => {
      cartRepo.findActiveWithItems.mockResolvedValue(buildCart('ONLINE_UPI') as any);
      inventoryService.reserve.mockResolvedValue(buildReservation() as any);

      const result = await service.createOrder(onlineDto, userId, ipAddress);

      expect(result.paymentUrl).toBe('https://api.razorpay.com/v1/checkout');
    });

    it('Online: does NOT call consume() inside $transaction (INV-11 — deferred to webhook)', async () => {
      cartRepo.findActiveWithItems.mockResolvedValue(buildCart('ONLINE_UPI') as any);
      inventoryService.reserve.mockResolvedValue(buildReservation() as any);

      await service.createOrder(onlineDto, userId, ipAddress);

      // consume() must NOT be called during online order creation
      expect(inventoryService.consume).not.toHaveBeenCalled();
    });

    it('Online: does NOT create Payment record inside $transaction (§3.4)', async () => {
      cartRepo.findActiveWithItems.mockResolvedValue(buildCart('ONLINE_UPI') as any);
      inventoryService.reserve.mockResolvedValue(buildReservation() as any);

      let capturedTx: any;
      prisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = buildTxMock({ orderStatus: 'PLACED' });
        capturedTx = tx;
        return fn(tx);
      });

      await service.createOrder(onlineDto, userId, ipAddress);

      // No Payment record inside order tx for online path (payment created by PaymentService)
      expect(capturedTx.payment.create).not.toHaveBeenCalled();
    });

    it('Online: calls paymentService.initiatePayment() AFTER $transaction commit (INV-12)', async () => {
      cartRepo.findActiveWithItems.mockResolvedValue(buildCart('ONLINE_UPI') as any);
      inventoryService.reserve.mockResolvedValue(buildReservation() as any);

      const callOrder: string[] = [];
      prisma.$transaction.mockImplementation(async (fn: any) => {
        callOrder.push('$transaction');
        const tx = buildTxMock({ orderStatus: 'PLACED' });
        return fn(tx);
      });
      paymentService.initiatePayment.mockImplementation(async () => {
        callOrder.push('initiatePayment');
        return { paymentUrl: 'https://api.razorpay.com/v1/checkout', razorpayOrderId: 'order_001', paymentId: 'pay-001' };
      });

      await service.createOrder(onlineDto, userId, ipAddress);

      // initiatePayment MUST come AFTER $transaction (INV-12: no HTTP inside tx)
      expect(callOrder.indexOf('$transaction')).toBeLessThan(callOrder.indexOf('initiatePayment'));
    });

    it('Online: initiatePayment() receives userId as 5th arg (INV-24)', async () => {
      cartRepo.findActiveWithItems.mockResolvedValue(buildCart('ONLINE_UPI') as any);
      inventoryService.reserve.mockResolvedValue(buildReservation() as any);

      await service.createOrder(onlineDto, userId, ipAddress);

      // 5th argument to initiatePayment MUST be userId from JWT (INV-24)
      const [, , , , passedUserId] = paymentService.initiatePayment.mock.calls[0];
      expect(passedUserId).toBe(userId);
    });

    it('Online: idempotency key uses userId as first namespace (INV-33/INV-24)', async () => {
      cartRepo.findActiveWithItems.mockResolvedValue(buildCart('ONLINE_UPI') as any);
      inventoryService.reserve.mockResolvedValue(buildReservation() as any);

      await service.createOrder(onlineDto, userId, ipAddress);

      const [redisKey] = redis.set.mock.calls[0] as [string, ...unknown[]];
      expect(redisKey).toBe(`order_idem:${userId}:online-idem-key-001`);
    });

    it('Online: if initiatePayment fails, order is still returned (resilient — buyer can retry)', async () => {
      cartRepo.findActiveWithItems.mockResolvedValue(buildCart('ONLINE_UPI') as any);
      inventoryService.reserve.mockResolvedValue(buildReservation() as any);
      paymentService.initiatePayment.mockRejectedValue(new Error('Razorpay unavailable'));

      // Must NOT throw — order is PLACED and buyer can retry via /payments/retry
      const result = await service.createOrder(onlineDto, userId, ipAddress);

      expect(result.status).toBe('PLACED');
      expect(result.paymentUrl).toBeUndefined(); // no URL when payment init failed
    });

    it('Online: idempotency key set AFTER payment initiation (INV-33)', async () => {
      cartRepo.findActiveWithItems.mockResolvedValue(buildCart('ONLINE_UPI') as any);
      inventoryService.reserve.mockResolvedValue(buildReservation() as any);

      const callOrder: string[] = [];
      paymentService.initiatePayment.mockImplementation(async () => {
        callOrder.push('initiatePayment');
        return { paymentUrl: 'https://pay.rzp.io', razorpayOrderId: 'order_001', paymentId: 'pay-001' };
      });
      redis.set.mockImplementation(async (..._args: unknown[]) => {
        callOrder.push('redisSet');
        return 'OK';
      });

      await service.createOrder(onlineDto, userId, ipAddress);

      const payIdx = callOrder.indexOf('initiatePayment');
      const setIdx = callOrder.indexOf('redisSet');
      // Redis SET must come AFTER initiatePayment (INV-33)
      expect(payIdx).toBeGreaterThanOrEqual(0);
      expect(setIdx).toBeGreaterThan(payIdx);
    });

    it('Online: releases all reservations if $transaction fails (compensation, S4-W6)', async () => {
      cartRepo.findActiveWithItems.mockResolvedValue(buildCart('ONLINE_UPI') as any);
      inventoryService.reserve.mockResolvedValue(buildReservation() as any);
      prisma.$transaction.mockRejectedValue(new Error('Online tx failed'));

      await expect(service.createOrder(onlineDto, userId, ipAddress)).rejects.toThrow('Online tx failed');

      // Sequential release (S4-W6) — not Promise.all
      expect(inventoryService.release).toHaveBeenCalledWith('res-001', 'ORDER_CANCELLED', 'SYSTEM');
      // paymentService NOT called if tx failed
      expect(paymentService.initiatePayment).not.toHaveBeenCalled();
    });
  });

  // ─── cancelOrder Tests ───────────────────────────────────────────────────

  describe('cancelOrder', () => {
    it('throws ORDER_NOT_FOUND when order does not belong to user', async () => {
      ordersRepo.findById.mockResolvedValue(null);

      await expect(service.cancelOrder('order-999', userId, 'Changed mind')).rejects.toThrow(NotFoundException);
    });

    it('throws ORDER_ALREADY_TERMINAL (422) if order is CANCELLED', async () => {
      ordersRepo.findById.mockResolvedValue({ id: 'order-1', status: 'CANCELLED' } as any);
      await expect(service.cancelOrder('order-1', userId, 'reason')).rejects.toThrow(/is in terminal state/);
    });

    it('throws ORDER_ALREADY_TERMINAL (422) if order is COMPLETED', async () => {
      ordersRepo.findById.mockResolvedValue({ id: 'order-1', status: 'COMPLETED' } as any);
      await expect(service.cancelOrder('order-1', userId, 'reason')).rejects.toThrow(/is in terminal state/);
    });

    it('cancels a PLACED order, releases inventory, and creates history + event', async () => {
      ordersRepo.findById.mockResolvedValue({ id: 'order-1', status: 'PLACED', version: 1 } as any);
      inventoryService.releaseAllForOrder.mockResolvedValue([{ reservationId: 'res-1', status: 'RELEASED', alreadyReleased: false }] as any);
      
      // Setup transaction mock behavior
      const txMock = {
        order: { update: vi.fn() },
        orderStatusHistory: { create: vi.fn() },
        eventOutbox: { create: vi.fn() },
      };
      prisma.$transaction.mockImplementation(async (cb: any) => {
        return cb(txMock);
      });

      await service.cancelOrder('order-1', userId, 'Changed mind');

      // Verify sequential release called
      expect(inventoryService.releaseAllForOrder).toHaveBeenCalledWith('order-1', 'ORDER_CANCELLED', userId);
      
      // Verify order update
      expect(txMock.order.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'order-1' },
        data: expect.objectContaining({ status: 'CANCELLED', cancellationReason: 'Changed mind' }),
      }));

      // Verify status history
      expect(txMock.orderStatusHistory.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ statusFrom: 'PLACED', statusTo: 'CANCELLED', reason: 'Changed mind' }),
      }));

      // Verify event outbox
      expect(txMock.eventOutbox.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          eventType: 'OrderCancelled',
          eventVersion: '1.0',
          schemaVersion: '4.3',
          // HARDENED (MEDIUM-2 fix): orderId alone — CANCELLED is terminal, no double-cancel possible
          // version suffix was removed because order.version is never incremented on cancellation
          deduplicationKey: 'order-cancelled-order-1',
        }),
      }));
    });
  });
});
