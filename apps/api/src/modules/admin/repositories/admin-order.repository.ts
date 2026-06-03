import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { OrderStatus, SystemActorType, type Prisma } from '@vyaparnet/database';
import { formatYearMonth } from '../../order/order-state-machine';
import type { AdminOrderListQuery } from '@vyaparnet/types';

// ─── DTO shapes returned to callers ─────────────────────────────────────────

export interface OrderSummaryDto {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  segment: string;
  grandTotal: string;
  subtotal: string;
  // FOOTGUN-6-E: NO buyer PII in list (buyerId only — no phone/email)
  buyerId: string;
  sellerId: string; // Business.id
  sellerName: string;
  orderMonth: string;
  placedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderBuyerDto {
  id: string;
  phone: string; // PII — only in detail endpoint
  email: string | null;
  name: string | null;
}

export interface OrderStatusHistoryItemDto {
  id: string;
  statusFrom: string | null;
  statusTo: string;
  reason: string | null;
  actorId: string;
  actorRole: SystemActorType;
  timestamp: string;
}

export interface OrderDetailDto extends OrderSummaryDto {
  buyer: OrderBuyerDto; // PII — only in detail endpoint (FOOTGUN-6-E)
  taxAmount: string;
  shippingCost: string;
  discount: string;
  cancellationReason: string | null;
  statusHistory: OrderStatusHistoryItemDto[];
  shippingAddressSnapshot: Record<string, unknown>; // GST inter-state determination
}

export interface OrderListResponse {
  data: OrderSummaryDto[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * AdminOrderRepository — cross-domain admin reads/writes on Order via direct Prisma (INV-S7-26).
 *
 * FOOTGUN-6-E: Buyer PII (phone, email) ONLY in findById — NEVER in findMany.
 * FOOTGUN-6-F: No seller scope restriction — admin sees ALL orders.
 * FOOTGUN-6-B: updateStatus() MUST also append OrderStatusHistory.
 * FOOTGUN-6-C: actorRole MUST be SystemActorType.ADMIN in history writes (INV-S7-37).
 *
 * Authority: §21 Phase 6.
 */
@Injectable()
export class AdminOrderRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Paginated order list — cursor-based (by Order.createdAt desc).
   * FOOTGUN-6-E: Returns OrderSummaryDto — NO buyer PII (phone/email).
   * FOOTGUN-6-F: Admin sees ALL orders — sellerId filter is optional, not a scope restriction.
   */
  async findMany(filter: AdminOrderListQuery): Promise<OrderListResponse> {
    const orders = await this.prisma.order.findMany({
      where: {
        isDeleted: false,
        ...(filter.status && { status: filter.status as OrderStatus }),
        ...(filter.segment && { segment: filter.segment }),
        ...(filter.buyerId && { buyerId: filter.buyerId }), // FOOTGUN-6-F: filter, NOT scope
        ...(filter.sellerId && { sellerId: filter.sellerId }), // filter, NOT scope restriction
        ...(filter.dateFrom && {
          createdAt: { gte: new Date(filter.dateFrom) },
        }),
        ...(filter.dateTo && {
          createdAt: { lte: new Date(filter.dateTo) },
        }),
        ...(filter.cursor && { id: { lt: filter.cursor } }),
      },
      include: {
        seller: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: filter.limit + 1,
    });

    const hasMore = orders.length > filter.limit;
    const items = hasMore ? orders.slice(0, filter.limit) : orders;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return {
      data: items.map((o) => this.toSummaryDto(o)),
      nextCursor,
      hasMore,
    };
  }

  /**
   * Order detail — includes buyer PII + status history.
   * FOOTGUN-6-E: Buyer PII (phone, email) ONLY here — never in list.
   * Returns null if not found or soft-deleted.
   */
  async findById(id: string): Promise<OrderDetailDto | null> {
    const order = await this.prisma.order.findFirst({
      where: { id, isDeleted: false },
      include: {
        buyer: {
          select: { id: true, phone: true, email: true, name: true },
        },
        seller: {
          select: { id: true, name: true },
        },
      },
    });

    if (!order) return null;

    // Fetch status history separately (no FK relation on Order model)
    const history = await this.prisma.orderStatusHistory.findMany({
      where: { orderId: id },
      orderBy: { timestamp: 'asc' },
    });

    return {
      ...this.toSummaryDto(order),
      buyer: {
        id: order.buyer.id,
        phone: order.buyer.phone,
        email: order.buyer.email ?? null,
        name: order.buyer.name ?? null,
      },
      taxAmount: order.taxAmount.toString(),
      shippingCost: order.shippingCost.toString(),
      discount: order.discount.toString(),
      cancellationReason: order.cancellationReason ?? null,
      shippingAddressSnapshot: (order.shippingAddressSnapshot ?? {}) as Record<
        string,
        unknown
      >,
      statusHistory: history.map((h) => ({
        id: h.id,
        statusFrom: h.statusFrom ?? null,
        statusTo: h.statusTo,
        reason: h.reason ?? null,
        actorId: h.actorId,
        actorRole: h.actorRole,
        timestamp: h.timestamp.toISOString(),
      })),
    };
  }

  /**
   * updateStatus — atomically updates Order.status + appends OrderStatusHistory.
   * MUST be called inside a $transaction (INV-S7-35 for COMPLETED case).
   * FOOTGUN-6-B: OrderStatusHistory append is MANDATORY.
   * FOOTGUN-6-C: actorRole MUST be SystemActorType.ADMIN (INV-S7-37).
   */
  async updateStatus(
    orderId: string,
    fromStatus: OrderStatus,
    toStatus: OrderStatus,
    actorId: string,
    tx: Prisma.TransactionClient,
    options: {
      reason?: string;
      ipAddress?: string;
      userAgent?: string;
      cancellationReason?: string;
    } = {},
  ): Promise<void> {
    await tx.order.update({
      where: { id: orderId },
      data: {
        status: toStatus,
        ...(toStatus === OrderStatus.DELIVERED && { deliveredAt: new Date() }),
        ...(toStatus === OrderStatus.COMPLETED && { completedAt: new Date() }),
        ...(toStatus === OrderStatus.CANCELLED && {
          cancelledAt: new Date(),
          cancellationReason: options.cancellationReason ?? options.reason,
        }),
      },
    });

    // FOOTGUN-6-B: ALWAYS append to OrderStatusHistory
    // FOOTGUN-6-C: actorRole MUST be ADMIN (INV-S7-37)
    await tx.orderStatusHistory.create({
      data: {
        orderId,
        statusFrom: fromStatus,
        statusTo: toStatus,
        reason: options.reason,
        actorId,
        actorRole: SystemActorType.ADMIN, // INV-S7-37: NEVER 'SELLER' for admin actions
        ipAddress: options.ipAddress,
        userAgent: options.userAgent,
        historyMonth: formatYearMonth(new Date()), // Required — no default
      },
    });
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private toSummaryDto(
    order: Prisma.OrderGetPayload<{
      include: { seller: { select: { id: true; name: true } } };
    }>,
  ): OrderSummaryDto {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      segment: order.segment,
      grandTotal: order.grandTotal.toString(),
      subtotal: order.subtotal.toString(),
      buyerId: order.buyerId, // NO PII — id only
      sellerId: order.sellerId,
      sellerName: order.seller.name,
      orderMonth: order.orderMonth,
      placedAt: order.placedAt?.toISOString() ?? null,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
    };
  }
}
