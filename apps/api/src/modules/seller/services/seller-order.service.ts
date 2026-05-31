import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { RedisService } from '../../../core/redis/redis.service';
import { MetricsService } from '../../observability/metrics.service';
import { SellerOrderRepository } from '../repositories/seller-order.repository';
import { OrderStatus } from '@vyaparnet/database';
import {
  validateSellerTransition,
  STATUS_TIMESTAMP_FIELD_MAP,
  formatYearMonth,
} from '../../order/order-state-machine';
import { SellerOrderFilterDto, SellerOrderView, SellerOrderListResponse, TransitionStatusDto } from '@vyaparnet/types';

export interface SellerContext {
  businessId: string;
  segment: string;
}

@Injectable()
export class SellerOrderService {
  private readonly logger = new Logger(SellerOrderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly metrics: MetricsService,
    private readonly sellerOrderRepo: SellerOrderRepository,
  ) {}

  async getOrders(
    seller: SellerContext,
    filter: SellerOrderFilterDto,
  ): Promise<SellerOrderListResponse> {
    return this.sellerOrderRepo.findMany(seller.businessId, filter);
  }

  async getOrder(orderId: string, seller: SellerContext): Promise<SellerOrderView> {
    const order = await this.sellerOrderRepo.findByIdForSeller(orderId, seller.businessId);
    // Strip internal-only fields from response (INV-S5-4)
    const { buyerId: _buyerId, confirmedAt: _confirmedAt, ...safeView } = order;
    return safeView;
  }

  async transitionStatus(
    orderId: string,
    seller: SellerContext,
    dto: TransitionStatusDto,
  ): Promise<SellerOrderView> {
    // STEP 1: trackingNumber validation BEFORE everything (INV-S5-5)
    if (dto.toStatus === 'SHIPPED') {
      if (!dto.trackingNumber?.trim()) {
        throw new UnprocessableEntityException({ code: 'TRACKING_NUMBER_REQUIRED', message: 'Tracking number is required when transitioning to SHIPPED' });
      }
    }

    // STEP 2: State machine validation BEFORE $transaction (INV-S5-32)
    // findByIdForSeller enforces sellerId ownership (INV-S5-3) — returns 404 if cross-seller
    const order = await this.sellerOrderRepo.findByIdForSeller(orderId, seller.businessId);
    validateSellerTransition(order.status as any, dto.toStatus as any); // throws 422 on invalid

    // STEP 3: Idempotency check BEFORE $transaction (INV-6) — OUTSIDE transaction
    const idemKey = `status-transition:${orderId}:${dto.toStatus}:${dto.idempotencyKey}`;
    let isNew: string | null;
    try {
      isNew = await this.redis.set(idemKey, '1', 'EX', 86400, 'NX');
    } catch {
      // Redis down — skip idempotency check and proceed (Redis is never correctness authority — INV-8)
      // Log warning so ops team is aware
      this.logger.warn({ orderId, idemKey }, 'IDEMPOTENCY_REDIS_UNAVAILABLE');
      isNew = 'OK'; // treat as new — Redis down cannot block business operation
    }
    if (isNew === null) {
      // Already processed — return current state without duplicate writes (INV-6)
      const current = await this.sellerOrderRepo.findByIdForSeller(orderId, seller.businessId);
      const { buyerId: _b, confirmedAt: _c, ...safeView } = current;
      return safeView;
    }

    // STEP 4: Atomic transition inside $transaction (INV-S5-8, INV-S5-39)
    // AUDIT-S5-3: Use STATUS_TIMESTAMP_FIELD_MAP — NOT STATUS_TIMESTAMP_MAP
    const timestampField = STATUS_TIMESTAMP_FIELD_MAP[dto.toStatus as OrderStatus];

    await this.prisma.$transaction(async (tx) => {
      // 1. Update order status + timestamp
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: dto.toStatus as any,
          ...(timestampField && { [timestampField]: new Date() }),
        },
      });

      // 1b. Create OrderTracking record for SHIPPED
      if (dto.toStatus === 'SHIPPED') {
        await tx.orderTracking.create({
          data: {
            orderId,
            status: 'SHIPPED',
            trackingNumber: dto.trackingNumber ?? null,
            estimatedDelivery: dto.estimatedDelivery ? new Date(dto.estimatedDelivery) : null,
          },
        });
      }

      // 2. Append status history (INV-13: APPEND-ONLY)
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          statusFrom: order.status as any,
          statusTo: dto.toStatus as any,
          actorId: seller.businessId,       // Business.id (INV-S5-1)
          actorRole: 'SELLER' as any,        // INV-S5-22: SystemActorType.SELLER — DB enum extended in Sprint 5 migration
          reason: dto.reason ?? null,
          historyMonth: formatYearMonth(new Date()),
          timestamp: new Date(),
        },
      });

      // 3. EventOutbox (INV-S5-8: inside $transaction — atomic)
      await tx.eventOutbox.create({
        data: {
          eventType: 'OrderStatusChanged',
          eventVersion: '1.0',              // INV-20
          schemaVersion: '5.0',             // INV-S5-23
          deduplicationKey: `order-status-changed-${orderId}-${dto.toStatus}`, // INV-17: deterministic
          payload: {
            orderId,
            orderNumber: order.orderNumber,
            buyerId: order.buyerId,         // Internal — not exposed to seller response
            sellerId: seller.businessId,
            segment: seller.segment,
            statusFrom: order.status,
            statusTo: dto.toStatus,
            actorId: seller.businessId,
            actorRole: 'SELLER',
            timestamp: new Date().toISOString(),
            ...(dto.toStatus === 'SHIPPED' && { trackingNumber: dto.trackingNumber }),
            // R1: estimatedDelivery in SHIPPED payload — Sprint 6 NotificationWorker uses this
            // for "your order shipped — estimated delivery: {date}" without extra DB lookup
            ...(dto.toStatus === 'SHIPPED' && dto.estimatedDelivery && { estimatedDelivery: dto.estimatedDelivery }),
          },
          eventMonth: formatYearMonth(new Date()),
          status: 'PENDING',
        },
      });
    }, { timeout: 5000 }); // INV-S5-39: mandatory timeout

    // STEP 5: Metrics + cache invalidation AFTER $transaction (INV-S5-29)
    this.metrics.orderStatusTransitionTotal.inc({
      from: order.status,
      to: dto.toStatus,
      actor: 'SELLER',
    });

    if (dto.toStatus === 'SHIPPED' && order.confirmedAt) {
      const dispatchHours = (Date.now() - order.confirmedAt.getTime()) / 3600000;
      this.metrics.sellerDispatchTimeHours.observe({ segment: seller.segment }, dispatchHours);
    }

    // KPI cache invalidation AFTER tx commits — OUTSIDE transaction (INV-S5-29)
    const today = new Date().toISOString().slice(0, 10);
    await this.redis.del(`kpi:${seller.businessId}:${seller.segment}:${today}`).catch(() => {});

    this.logger.log({
      event: 'ORDER_STATUS_TRANSITION',
      orderId,
      sellerId: seller.businessId,
      statusFrom: order.status,
      statusTo: dto.toStatus,
      trackingNumber: dto.trackingNumber ?? null,
      durationFromConfirmedMs: order.confirmedAt ? (Date.now() - order.confirmedAt.getTime()) : null,
      segment: seller.segment,
    });

    const updated = await this.sellerOrderRepo.findByIdForSeller(orderId, seller.businessId);
    const { buyerId: _b, confirmedAt: _c, ...safeView } = updated;
    return safeView;
  }
}
