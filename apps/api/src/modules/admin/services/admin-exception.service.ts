import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { OrderStatus, PaymentStatus } from '@vyaparnet/database';
import type { TechnicalExceptionDto } from '@vyaparnet/types';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AdminMetricsService } from './admin-metrics.service';

// ─── Exception DTOs ──────────────────────────────────────────────────────────

export interface StuckOrderDto {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  segment: string;
  sellerId: string;
  sellerName: string;
  updatedAt: string;
  stuckForMs: number; // milliseconds since last update
}

export interface FailedPaymentDto {
  id: string;
  orderId: string;
  orderNumber: string;
  paymentMethod: string;
  amount: string;
  failedAt: string;
}

export interface SuspendedSellerActiveOrderDto {
  businessId: string;
  businessName: string;
  ownerId: string;
  activeOrderCount: number;
}

export interface BusinessExceptionsDto {
  stuckOrders: StuckOrderDto[];
  failedPayments: FailedPaymentDto[];
  suspendedSellersWithActiveOrders: SuspendedSellerActiveOrderDto[];
  generatedAt: string;
}

/**
 * AdminExceptionService — Exception Center for Sprint 7 Phase 6.
 *
 * Returns:
 *  - Stuck orders: status=PROCESSING AND updatedAt < now() - 24h
 *  - Failed payments: Payment.status=FAILED AND no successful retry
 *  - Suspended sellers with active orders
 *
 * INV-S7-34: Exception center data is NOT cached in Redis.
 *            Computed fresh on every request.
 *
 * Authority: §21 Phase 6, Step 6.5.
 */
@Injectable()
export class AdminExceptionService {
  private readonly logger = new Logger(AdminExceptionService.name);

  // Threshold: orders stuck for more than this duration are flagged
  private readonly STUCK_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('notifications-failed') // FOOTGUN-10-C: name LOCKED (INV-S7-24)
    private readonly notificationsFailedQueue: Queue,
    private readonly metrics: AdminMetricsService,
  ) {}

  /**
   * getBusinessExceptions — computes exception center data fresh (INV-S7-34: no cache).
   * Runs 3 parallel DB queries for performance.
   */
  async getBusinessExceptions(): Promise<BusinessExceptionsDto> {
    const stuckCutoff = new Date(Date.now() - this.STUCK_THRESHOLD_MS);

    const [stuckOrders, failedPayments, suspendedSellers] = await Promise.all([
      this.getStuckOrders(stuckCutoff),
      this.getFailedPayments(),
      this.getSuspendedSellersWithActiveOrders(),
    ]);

    this.logger.log(
      {
        stuckOrderCount: stuckOrders.length,
        failedPaymentCount: failedPayments.length,
        suspendedSellerCount: suspendedSellers.length,
      },
      'ADMIN_EXCEPTION_CENTER_QUERIED',
    );

    // Update Prometheus gauges
    this.metrics.exceptionCenterStuckOrders.set(stuckOrders.length);
    this.metrics.exceptionCenterFailedPayments.set(failedPayments.length);

    return {
      stuckOrders,
      failedPayments,
      suspendedSellersWithActiveOrders: suspendedSellers,
      generatedAt: new Date().toISOString(),
    };
  }

  // ─── Private query helpers ────────────────────────────────────────────────

  /**
   * Stuck orders: status=PROCESSING AND updatedAt < cutoff (>24h ago).
   * Capped at 100 to prevent oversized responses.
   */
  private async getStuckOrders(stuckCutoff: Date): Promise<StuckOrderDto[]> {
    const orders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.PROCESSING,
        updatedAt: { lt: stuckCutoff },
        isDeleted: false,
      },
      include: {
        seller: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: 'asc' }, // oldest stuck first
      take: 100,
    });

    const now = Date.now();
    return orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      segment: o.segment,
      sellerId: o.sellerId,
      sellerName: o.seller.name,
      updatedAt: o.updatedAt.toISOString(),
      stuckForMs: now - o.updatedAt.getTime(),
    }));
  }

  /**
   * Failed payments: Payment.status=FAILED with no subsequent CAPTURED payment on same order.
   * Capped at 100.
   */
  private async getFailedPayments(): Promise<FailedPaymentDto[]> {
    // Find orders with FAILED payments where no CAPTURED payment exists
    const failedPayments = await this.prisma.payment.findMany({
      where: {
        status: PaymentStatus.FAILED,
        order: {
          isDeleted: false,
          // No successful retry = no CAPTURED payment on this order
          payments: {
            none: {
              status: {
                in: [PaymentStatus.CAPTURED, PaymentStatus.PARTIALLY_CAPTURED],
              },
            },
          },
        },
      },
      include: {
        order: { select: { id: true, orderNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return failedPayments.map((p) => ({
      id: p.id,
      orderId: p.order.id,
      orderNumber: p.order.orderNumber,
      paymentMethod: p.method, // Payment.method (not paymentMethod)
      amount: p.amount.toString(),
      failedAt: p.createdAt.toISOString(),
    }));
  }

  /**
   * Suspended sellers (User.isDeleted=true, role=SELLER) with active (non-terminal) orders.
   * Returns business-level data — groups active orders per seller.
   * Capped at 50.
   */
  private async getSuspendedSellersWithActiveOrders(): Promise<
    SuspendedSellerActiveOrderDto[]
  > {
    // Find businesses whose owner is suspended AND have active orders
    const businesses = await this.prisma.business.findMany({
      where: {
        isDeleted: false,
        owner: { isDeleted: true }, // Suspended seller
        orders: {
          some: {
            isDeleted: false,
            status: {
              notIn: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
            },
          },
        },
      },
      include: {
        _count: {
          select: {
            orders: {
              where: {
                isDeleted: false,
                status: {
                  notIn: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
                },
              },
            },
          },
        },
      },
      take: 50,
    });

    return businesses.map((b) => ({
      businessId: b.id,
      businessName: b.name,
      ownerId: b.ownerId,
      activeOrderCount: b._count.orders,
    }));
  }
  /**
   * getTechnicalExceptions — Phase 10 Step 10.3.
   *
   * Reads DLQ depth from 'notifications-failed' queue (INV-S7-24: LOCKED name).
   * FOOTGUN-10-B: NOT cached in Redis — computed fresh every request.
   * FOOTGUN-10-C: Queue name is LOCKED as 'notifications-failed' — never aliased.
   */
  async getTechnicalExceptions(): Promise<TechnicalExceptionDto> {
    let dlqDepth = 0;

    try {
      const failedJobs = await this.notificationsFailedQueue.getFailed(0, 100);
      dlqDepth = failedJobs.length;
    } catch (err) {
      const error = err as Error;
      this.logger.error({ err: error.message }, 'ADMIN_DLQ_DEPTH_FETCH_FAILED');
    }

    this.logger.log({ dlqDepth }, 'ADMIN_TECHNICAL_EXCEPTIONS_QUERIED');

    return {
      dlqDepth,
      openDisputes: 0, // Sprint 8: AdminDisputeRepository.countOpen() fills this
      returnSlaBreaches: 0, // Sprint 8: BullMQ return-sla worker increments Redis counter
      disputeSlaBreaches: 0, // Sprint 8: BullMQ dispute-sla worker increments Redis counter
    };
  }
}
