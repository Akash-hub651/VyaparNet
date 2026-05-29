import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { RedisService } from '../../core/redis/redis.service';
import { InventoryService } from '../inventory/inventory.service';
import { CartRepository } from '../cart/cart.repository';
import { OrdersRepository } from './orders.repository';
import { OrderStatusHistoryRepository } from './order-status-history.repository';
import {
  validateTransition,
  assertNotTerminal,
  formatYearMonth,
  generateOrderNumber,
  isPrismaUniqueConstraintError,
} from './order-state-machine';
import { Prisma, OrderStatus, Order } from '@vyaparnet/database';
import { PaymentService } from '../payment/payment.service';
import { MetricsService } from '../observability/metrics.service';

export interface CreateOrderDto {
  cartId?: string;
  shippingAddressId: string;
  billingAddressId: string;
  paymentMethod: 'COD' | 'ONLINE_UPI' | 'ONLINE_CARD';
  segment: string;
  clientIdempotencyKey: string; // from Idempotency-Key header
}

export interface OrderResponseDto {
  orderId: string;
  orderNumber: string;
  status: string;
  grandTotal: number;
  paymentMethod: string;
  paymentUrl?: string; // Only present for ONLINE_* orders — Razorpay checkout URL (§3.4, Phase 5)
}

/** DI token to avoid circular import — injected via forwardRef */
export const PAYMENT_SERVICE_TOKEN = 'PAYMENT_SERVICE';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly inventoryService: InventoryService,
    private readonly cartRepo: CartRepository,
    private readonly ordersRepo: OrdersRepository,
    private readonly statusHistoryRepo: OrderStatusHistoryRepository,
    // HARDENED (§8.3, Phase 5): forwardRef breaks circular dependency OrderModule ↔ PaymentModule.
    // PaymentService.initiatePayment() is called AFTER order $transaction commits (§3.4).
    // NEVER called inside $transaction (INV-12: no HTTP inside tx).
    @Inject(forwardRef(() => PaymentService))
    private readonly paymentService: PaymentService,
    private readonly metrics: MetricsService,
  ) {}

  async createOrder(dto: CreateOrderDto, userId: string, ipAddress: string): Promise<OrderResponseDto> {
    // ── STEP 1: IDEMPOTENCY CHECK (INV-33: userId from JWT always first) ──
    // HARDENED (INV-33): key format MUST be order_idem:{userId}:{clientKey}
    const idempotencyKey = `order_idem:${userId}:${dto.clientIdempotencyKey}`;
    const cached = await this.redis.get(idempotencyKey);
    if (cached) {
      this.logger.log({ userId, idempotencyKey }, 'Order idempotency hit — returning cached response');
      return JSON.parse(cached);
    }

    // ── STEP 2: CHECKOUT RATE LIMIT (checkout_rate:{userId} — INV-21) ──
    await this.checkCheckoutRate(userId);

    // ── STEP 3: LOAD CART ──
    const cart = await this.cartRepo.findActiveWithItems(userId, dto.segment as any);
    if (!cart || cart.items.length === 0) {
      throw new BadRequestException({ code: 'CART_EMPTY', message: 'Cart is empty or not found' });
    }

    // ── STEP 4: PRE-VALIDATION — products & availability (parallel reads) ──
    const productIds = cart.items.map((i) => i.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      include: {
        inventory: { select: { id: true, quantity: true, reservedQty: true, damagedQty: true, businessId: true } },
      },
    });

    if (products.length !== productIds.length) {
      throw new BadRequestException({ code: 'PRODUCT_NOT_FOUND', message: 'One or more products not found' });
    }

    const productMap = new Map(products.map((p) => [p.id, p]));

    for (const item of cart.items) {
      const product = productMap.get(item.productId);
      if (!product) throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND' });
      if (product.segment !== cart.segment) {
        throw new BadRequestException({ code: 'SEGMENT_MISMATCH' });
      }
    }

    // ── STEP 5: PRICE SNAPSHOT — live from Inventory (INV-14: never from cart or client) ──
    // NOTE: Inventory.price is not in schema v4.3 — use Product.basePrice as live price authority
    let subtotal = new Prisma.Decimal(0);
    let taxAmount = new Prisma.Decimal(0);

    const orderItemData = cart.items.map((item) => {
      const product = productMap.get(item.productId)!;
      const unitPrice = product.basePrice; // INV-14: live DB price, NOT CartItem.unitPrice
      const gstPercent = product.gstPercent ?? new Prisma.Decimal(0);
      const lineTotal = unitPrice.mul(item.quantity);
      const gstAmount = lineTotal.mul(gstPercent).div(100);
      subtotal = subtotal.add(lineTotal);
      taxAmount = taxAmount.add(gstAmount);

      return {
        productId: item.productId,
        // HARDENED (INV-29): sellerId MUST be populated from Product.businessId
        sellerId: product.businessId,
        productName: product.name,
        productSlug: product.slug,
        quantity: item.quantity,
        unitPrice,
        totalPrice: lineTotal,
        discountAmount: new Prisma.Decimal(0),
        hsnCode: product.hsnCode ?? null,
        gstPercent,
        gstAmount,
      };
    });

    const grandTotal = subtotal.add(taxAmount);

    // ── STEP 6: ADDRESS SNAPSHOT ──
    const shippingAddress = await this.prisma.address.findFirst({
      where: { id: dto.shippingAddressId, userId, isDeleted: false },
    });
    if (!shippingAddress) {
      throw new BadRequestException({ code: 'ADDRESS_NOT_FOUND', message: 'Shipping address not found' });
    }
    const billingAddress = dto.billingAddressId === dto.shippingAddressId
      ? shippingAddress
      : await this.prisma.address.findFirst({ where: { id: dto.billingAddressId, userId, isDeleted: false } });
    if (!billingAddress) {
      throw new BadRequestException({ code: 'ADDRESS_NOT_FOUND', message: 'Billing address not found' });
    }

    const addressSnapshot = {
      name: shippingAddress.name,
      line1: shippingAddress.line1,
      line2: shippingAddress.line2,
      city: shippingAddress.city,
      state: shippingAddress.state,
      pincode: shippingAddress.pincode,
      country: shippingAddress.country,
    };

    // Derive primary sellerId from first item (multi-seller: Sprint 5)
    const primarySellerId = orderItemData[0]!.sellerId;

    // ── STEP 7: RESERVE — SEQUENTIAL (not parallel, per §7.1 Step 7 / S4-W6) ──
    const reservations: Array<{ id: string; productId: string }> = [];
    try {
      for (const item of cart.items) {
        // HARDENED: reserve() MUST be called OUTSIDE $transaction (§3.1)
        const result = await this.inventoryService.reserve({
          productId: item.productId,
          quantity: item.quantity,
          segment: cart.segment,
          orderId: undefined, // orderId not known yet
          orderType: 'ORDER',
          userId,
          ipAddress,
          idempotencyKey: `reserve-${dto.clientIdempotencyKey}-${item.productId}`,
          paymentMethod: dto.paymentMethod as any,
        });
        reservations.push({ id: result.reservationId, productId: item.productId });
      }
    } catch (err) {
      // Compensation: release all reservations made so far — SEQUENTIAL (S4-W6)
      for (const res of reservations) {
        try {
          await this.inventoryService.release(res.id, 'ORDER_CANCELLED', 'SYSTEM');
        } catch (releaseErr) {
          this.logger.error({ reservationId: res.id, err: releaseErr }, 'CRITICAL: Failed to release reservation during pre-tx compensation');
        }
      }
      throw err;
    }

    // ── STEP 8: ATOMIC $TRANSACTION — branched by paymentMethod ── (INV-11, §3.3/§3.4)
    // CRITICAL LAW (INV-11): consume() timing differs by payment method:
    //   COD:    consume() INSIDE order creation $transaction (immediate confirmation)
    //   Online: consume() DEFERRED to webhook processor $transaction (PLACED → CONFIRMED via webhook)
    // CRITICAL LAW (INV-12): No Razorpay SDK call inside $transaction — EVER
    const isOnline = dto.paymentMethod !== 'COD';
    let createdOrder: Order;
    try {
      createdOrder = await this.prisma.$transaction(
        async (tx) => {
          // HARDENED (INV-25): orderNumber collision retry — up to 3 attempts INSIDE same tx
          let order!: Order;
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              order = await tx.order.create({
                data: {
                  orderNumber: generateOrderNumber(),
                  segment: cart.segment as any,
                  // HARDENED (§3.4): Online → PLACED (consume deferred); COD → CONFIRMED (immediate)
                  status: isOnline ? ('PLACED' as OrderStatus) : ('CONFIRMED' as OrderStatus),
                  buyerId: userId,
                  sellerId: primarySellerId,
                  cartId: cart.id,
                  shippingAddressSnapshot: addressSnapshot,
                  billingAddressSnapshot: addressSnapshot,
                  subtotal,
                  taxAmount,
                  shippingCost: new Prisma.Decimal(0),
                  discount: new Prisma.Decimal(0),
                  grandTotal,
                  placedAt: new Date(),
                  // HARDENED (§3.4): confirmedAt ONLY for COD; Online: null until webhook confirms
                  confirmedAt: isOnline ? undefined : new Date(),
                  orderMonth: formatYearMonth(new Date()),
                },
              });
              break; // success
            } catch (err) {
              if (isPrismaUniqueConstraintError(err, 'orderNumber') && attempt < 2) {
                this.logger.warn({ attempt }, 'Order number collision — retrying within tx');
                this.metrics.orderNumberCollisionTotal.inc();
                continue;
              }
              throw err;
            }
          }

          // HARDENED (INV-29): sellerId MUST be populated on every createMany() call
          await tx.orderItem.createMany({
            data: orderItemData.map((item) => ({
              orderId: order.id,
              productId: item.productId,
              sellerId: item.sellerId, // HARDENED (INV-29)
              productName: item.productName,
              productSlug: item.productSlug,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              totalPrice: item.totalPrice,
              discount: item.discountAmount,
              hsnCode: item.hsnCode,
              gstPercent: item.gstPercent,
              gstAmount: item.gstAmount,
            })),
          });

          if (!isOnline) {
            // ── COD PATH: synthetic payment + consume() inside tx (INV-26, INV-11) ──
            // HARDENED (INV-26): MANDATORY synthetic COD Payment record inside $transaction
            await tx.payment.create({
              data: {
                orderId: order.id,
                amount: grandTotal,
                method: 'COD' as any,
                gateway: 'COD',
                status: 'CAPTURED' as any,
                capturedAt: new Date(),
                idempotencyKey: `cod-${order.id}`, // deterministic — INV-26
                gatewayRef: `cod-${order.id}`,     // synthetic but unique — INV-26
                // gatewayPaymentId: null for COD (INV-30 — no real gateway payment ID)
              },
            });

            // HARDENED (INV-11): consume() receives tx — NEVER opens own $transaction
            for (const reservation of reservations) {
              await this.inventoryService.consume(reservation.id, userId, tx);
            }
          }
          // ── ONLINE PATH: NO payment.create(), NO consume() inside tx (§3.4) ──
          // Inventory remains RESERVED (ACTIVE) until webhook confirms capture.
          // consume() will be called by PaymentWebhookProcessorWorker inside its own $transaction.

          // HARDENED (INV-13): OrderStatusHistory — APPEND-ONLY — no update/delete ever
          const historyMonth = formatYearMonth(new Date());
          await tx.orderStatusHistory.create({
            data: {
              orderId: order.id,
              statusFrom: null,
              statusTo: 'PLACED',
              actorId: userId,
              actorRole: 'USER' as any, // maps buyer action to SystemActorType
              timestamp: new Date(),
              historyMonth,
            },
          });

          if (!isOnline) {
            // COD: add PLACED → CONFIRMED transition record immediately
            await tx.orderStatusHistory.create({
              data: {
                orderId: order.id,
                statusFrom: 'PLACED',
                statusTo: 'CONFIRMED',
                actorId: userId,
                actorRole: 'USER' as any, // COD auto-confirm
                reason: 'COD',
                timestamp: new Date(),
                historyMonth,
              },
            });
          }

          // HARDENED (INV-20): eventVersion + schemaVersion MANDATORY on all EventOutbox records
          const eventMonth = formatYearMonth(new Date());
          const orderCreatedPayload = {
            orderId: order.id,
            orderNumber: order.orderNumber,
            buyerId: userId,
            segment: cart.segment,
            items: orderItemData.map((i) => ({
              productId: i.productId,
              productName: i.productName,
              quantity: i.quantity,
              unitPrice: i.unitPrice.toNumber(),
              totalPrice: i.totalPrice.toNumber(),
              hsnCode: i.hsnCode,
              gstPercent: i.gstPercent.toNumber(),
            })),
            subtotal: subtotal.toNumber(),
            taxAmount: taxAmount.toNumber(),
            grandTotal: grandTotal.toNumber(),
            paymentMethod: dto.paymentMethod,
            shippingAddress: addressSnapshot,
            placedAt: new Date().toISOString(),
            orderMonth: eventMonth,
          };

          await tx.eventOutbox.create({
            data: {
              eventType: 'OrderCreated',
              eventVersion: '1.0',   // HARDENED (INV-20)
              schemaVersion: '4.3',  // HARDENED (INV-20)
              payload: orderCreatedPayload,
              deduplicationKey: `order-created-${order.id}`, // HARDENED (INV-17): deterministic
              eventMonth,
              status: 'PENDING',
            },
          });

          if (!isOnline) {
            // COD: emit OrderConfirmed synchronously (immediate confirmation)
            await tx.eventOutbox.create({
              data: {
                eventType: 'OrderConfirmed',
                eventVersion: '1.0',   // HARDENED (INV-20)
                schemaVersion: '4.3',  // HARDENED (INV-20)
                payload: {
                  orderId: order.id,
                  paymentMethod: dto.paymentMethod,
                  confirmedAt: new Date().toISOString(),
                  grandTotal: grandTotal.toNumber(),
                },
                deduplicationKey: `order-confirmed-${order.id}`, // HARDENED (INV-17): deterministic
                eventMonth,
                status: 'PENDING',
              },
            });
          }
          // ONLINE: OrderConfirmed is emitted by PaymentWebhookProcessorWorker after capture confirmation

          // Mark cart as CHECKED_OUT inside the same atomic tx
          await tx.cart.update({
            where: { id: cart.id },
            data: { status: 'CHECKED_OUT' },
          });

          return order;
        },
        { timeout: 10000, isolationLevel: 'ReadCommitted' }, // §3.2
      );
    } catch (txErr) {
      // Compensation: release ALL reservations — SEQUENTIAL (S4-W6)
      // HARDENED: Sequential for...of — never Promise.all (avoids DB contention storm, S4-W6)
      this.logger.error({ userId, paymentMethod: dto.paymentMethod, err: txErr }, 'Order $transaction failed — releasing all reservations');
      for (const res of reservations) {
        try {
          await this.inventoryService.release(res.id, 'ORDER_CANCELLED', 'SYSTEM');
        } catch (releaseErr) {
          this.logger.error(
            { reservationId: res.id, err: releaseErr },
            'CRITICAL: Failed to release reservation during post-tx compensation — inventory may drift',
          );
        }
      }
      throw txErr;
    }

    // ── STEP 9: REDIS IDEMPOTENCY SET — AFTER $transaction.commit() (INV-33) ──
    // HARDENED: NEVER inside $transaction, NEVER before commit
    const baseResponse: OrderResponseDto = {
      orderId: createdOrder.id,
      orderNumber: createdOrder.orderNumber,
      status: createdOrder.status,
      grandTotal: grandTotal.toNumber(),
      paymentMethod: dto.paymentMethod,
    };

    if (!isOnline) {
      // COD: response is complete — set idempotency key and return
      await this.redis.set(idempotencyKey, JSON.stringify(baseResponse), 'EX', 3600).catch((err) => {
        // Non-fatal: log but don't fail the order — buyer already has their order
        this.logger.warn({ idempotencyKey, err }, 'Failed to set COD order idempotency key in Redis — degraded mode');
        this.metrics.redisUnavailableTotal.inc({ component: 'order_idempotency_set' });
      });
      this.logger.log({ orderId: createdOrder.id, userId, paymentMethod: 'COD' }, 'COD order created and confirmed');
      this.metrics.orderCreatedTotal.inc({ payment_method: dto.paymentMethod, segment: dto.segment });
      this.metrics.orderConfirmedTotal.inc({ payment_method: dto.paymentMethod });
      return baseResponse;
    }

    // ── STEP 10 (Online only): INITIATE PAYMENT — OUTSIDE $transaction (INV-12) ──
    // CRITICAL (INV-12): Razorpay HTTP call NEVER inside $transaction.
    // CRITICAL (INV-24): userId from JWT passed as 5th argument — mandatory for idempotency namespace.
    // The idempotency key for the payment is derived from the order idempotency key (deterministic).
    const paymentIdempotencyKey = `${dto.clientIdempotencyKey}-payment`;
    let paymentUrl: string | undefined;
    try {
      const paymentResult = await this.paymentService.initiatePayment(
        createdOrder.id,
        grandTotal.toNumber(), // Server-derived amount — INV-14: never from client
        dto.paymentMethod,
        paymentIdempotencyKey,
        userId, // HARDENED (INV-24): userId from JWT — ALWAYS first namespace component
      );
      paymentUrl = paymentResult.paymentUrl;

      this.logger.log(
        { orderId: createdOrder.id, paymentId: paymentResult.paymentId, method: dto.paymentMethod },
        'Online order created — payment initiated',
      );
    } catch (paymentErr) {
      // HARDENED: Payment initiation failure does NOT roll back the order.
      // The order is in PLACED state with ACTIVE reservations.
      // Buyer can retry via POST /payments/retry within the 30-min window (INV-23).
      // PaymentReconciliationWorker (Phase 6) catches any stuck PLACED orders.
      this.logger.error(
        { orderId: createdOrder.id, userId, err: paymentErr },
        'CRITICAL: Payment initiation failed after order creation — order is PLACED with active reservations. Buyer should use /payments/retry.',
      );
      // Do NOT throw — return the order so buyer can see it and retry
    }

    // ── STEP 11 (Online only): REDIS IDEMPOTENCY SET — after payment initiation attempt ──
    // HARDENED (INV-33): SET AFTER all writes succeed — even if payment initiation failed,
    // we cache the order response so idempotent retries return the existing order
    const onlineResponse: OrderResponseDto = {
      ...baseResponse,
      paymentUrl, // undefined if payment initiation failed — buyer must retry
    };
    await this.redis.set(idempotencyKey, JSON.stringify(onlineResponse), 'EX', 3600).catch((err) => {
      this.logger.warn({ idempotencyKey, err }, 'Failed to set online order idempotency key in Redis — degraded mode');
      this.metrics.redisUnavailableTotal.inc({ component: 'order_idempotency_set' });
    });

    this.logger.log(
      { orderId: createdOrder.id, userId, paymentMethod: dto.paymentMethod, hasPaymentUrl: !!paymentUrl },
      'Online order created in PLACED state',
    );

    this.metrics.orderCreatedTotal.inc({ payment_method: dto.paymentMethod, segment: dto.segment });


    return onlineResponse;
  }

  async getOrder(orderId: string, userId: string): Promise<Order & { items: any[] }> {
    const order = await this.ordersRepo.findById(orderId, userId);
    if (!order) throw new NotFoundException({ code: 'ORDER_NOT_FOUND' });
    return order;
  }

  async getOrderHistory(orderId: string, userId: string) {
    // Verify ownership before exposing status history (INV-18)
    const order = await this.ordersRepo.findById(orderId, userId);
    if (!order) throw new NotFoundException({ code: 'ORDER_NOT_FOUND' });
    return this.statusHistoryRepo.findByOrderId(orderId);
  }

  async cancelOrder(orderId: string, userId: string, reason: string): Promise<void> {
    const order = await this.ordersRepo.findById(orderId, userId);
    if (!order) throw new NotFoundException({ code: 'ORDER_NOT_FOUND' });

    // HARDENED: validate state machine transition
    assertNotTerminal(order);
    validateTransition(order.status as OrderStatus, 'CANCELLED');

    // Release reservations OUTSIDE $transaction — sequential, idempotent (§7.3)
    await this.inventoryService.releaseAllForOrder(orderId, 'ORDER_CANCELLED', userId);

    const historyMonth = formatYearMonth(new Date());
    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: { status: 'CANCELLED', cancelledAt: new Date(), cancellationReason: reason },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          statusFrom: order.status as OrderStatus,
          statusTo: 'CANCELLED',
          actorId: userId,
          actorRole: 'USER' as any, // SystemActorType — buyer cancel maps to USER
          reason,
          timestamp: new Date(),
          historyMonth,
        },
      });
      const eventMonth = formatYearMonth(new Date());
      await tx.eventOutbox.create({
        data: {
          eventType: 'OrderCancelled',
          eventVersion: '1.0', // HARDENED (INV-20)
          schemaVersion: '4.3', // HARDENED (INV-20)
          payload: { orderId, reason, cancelledAt: new Date().toISOString() },
          deduplicationKey: `order-cancelled-${orderId}`, // HARDENED (INV-17): orderId sufficient — CANCELLED is terminal, no double-cancel possible
          eventMonth,
          status: 'PENDING',
        },
      });
    });

    this.logger.log({ orderId, userId, reason }, 'Order cancelled');
    // HARDENED (§19.1): Emit metric for Prometheus scraping
    this.metrics.orderCancelledTotal.inc({ reason, actor: 'USER' });
  }

  // HARDENED (INV-21): checkout_rate:{userId} — atomic Lua INCR+EXPIRE
  private async checkCheckoutRate(userId: string): Promise<void> {
    const key = `checkout_rate:${userId}`;
    const limit = 5;
    const windowSeconds = 3600;

    const script = `
      local current = redis.call('INCR', KEYS[1])
      if current == 1 then
        redis.call('EXPIRE', KEYS[1], ARGV[1])
      end
      return current
    `;

    let count: number;
    try {
      count = (await this.redis.eval(script, 1, key, windowSeconds)) as number;
    } catch (err) {
      // Redis degraded: skip rate limit but log metric (§4.3)
      this.logger.warn({ userId, err }, 'Redis unavailable for checkout rate limit — allowing request');
      this.metrics.redisUnavailableTotal.inc({ component: 'checkout_rate_limit' });
      return;
    }

    if (count > limit) {
      this.logger.warn({ userId, count }, 'Checkout rate limit exceeded');
      throw new ConflictException({ code: 'CHECKOUT_RATE_LIMIT_EXCEEDED', message: 'Too many checkout attempts' });
    }
  }
}
