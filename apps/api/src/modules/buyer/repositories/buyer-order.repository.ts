import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { OrderStatus } from '@vyaparnet/database';

// ─── Typed interfaces for buyer responses ─────────────────────────────────────
// AI-2 Fix: Repository returns strongly-typed shape, NOT raw Prisma entity.
// Raw entity exposes internal Decimal/Date fields; these interfaces expose clean primitives.
// ──────────────────────────────────────────────────────────────────────────────

export interface BuyerOrderItemShape {
  id: string;
  productId: string;
  productName: string;
  productSlug: string;
  productImage: string | null;
  quantity: number;
  unitPrice: string; // Decimal serialized to string
  totalPrice: string; // Decimal serialized to string
}

export interface BuyerOrderTrackingShape {
  carrier: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null; // FIX-2: mapped from OrderTracking.carrierUrl (INV-S5 FU-1)
  estimatedDelivery: string | null; // ISO8601
  dispatchProofUrl: string | null;
}

export interface BuyerOrderStatusHistoryShape {
  id: string;
  statusFrom: string | null;
  statusTo: string;
  actorRole: string;
  reason: string | null;
  timestamp: string; // ISO8601
}

export interface BuyerOrderListItem {
  id: string;
  orderNumber: string;
  segment: string;
  status: string;
  grandTotal: string;
  subtotal: string;
  taxAmount: string;
  shippingCost: string;
  discount: string;
  createdAt: string;
  items: BuyerOrderItemShape[];
  payments: { status: string; method: string }[];
}

export interface BuyerOrderListResult {
  orders: BuyerOrderListItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface BuyerOrderDetailShape {
  id: string;
  orderNumber: string;
  segment: string;
  status: string;
  grandTotal: string;
  subtotal: string;
  taxAmount: string;
  shippingCost: string;
  discount: string;
  createdAt: string;
  confirmedAt: string | null; // Exposed internally for service grace-window check (INV-S5-24)
  sellerId: string; // Exposed internally for reorder/cancel cross-checks
  items: BuyerOrderItemShape[];
  statusHistory: BuyerOrderStatusHistoryShape[];
  tracking: BuyerOrderTrackingShape | null;
}

// ─── Mapper helpers ────────────────────────────────────────────────────────────

function mapOrderItem(item: any): BuyerOrderItemShape {
  return {
    id: item.id,
    productId: item.productId,
    productName: item.productName,
    productSlug: item.productSlug,
    productImage: item.productImage ?? null,
    quantity: item.quantity,
    unitPrice: item.unitPrice.toString(),
    totalPrice: item.totalPrice.toString(),
  };
}

function mapTracking(t: any): BuyerOrderTrackingShape {
  return {
    carrier: t.carrier ?? null,
    trackingNumber: t.trackingNumber ?? null,
    trackingUrl: t.carrierUrl ?? null, // FIX-2: OrderTracking.carrierUrl → trackingUrl (INV-S5 FU-1)
    estimatedDelivery: t.estimatedDelivery?.toISOString() ?? null,
    dispatchProofUrl: t.dispatchProofUrl ?? null,
  };
}

function mapStatusHistory(h: any): BuyerOrderStatusHistoryShape {
  return {
    id: h.id,
    statusFrom: h.statusFrom ?? null,
    statusTo: h.statusTo,
    actorRole: h.actorRole,
    reason: h.reason ?? null,
    timestamp: h.timestamp.toISOString(),
  };
}

function mapOrderToListItem(o: any): BuyerOrderListItem {
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    segment: o.segment,
    status: o.status,
    grandTotal: o.grandTotal.toString(),
    subtotal: o.subtotal.toString(),
    taxAmount: o.taxAmount.toString(),
    shippingCost: o.shippingCost.toString(),
    discount: o.discount.toString(),
    createdAt: o.createdAt.toISOString(),
    items: (o.items ?? []).map(mapOrderItem),
    payments: (o.payments ?? []).map((p: any) => ({
      status: p.status,
      method: p.method,
    })),
  };
}

// ─── Repository ───────────────────────────────────────────────────────────────

@Injectable()
export class BuyerOrderRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cursor-paginated list of buyer's own orders (INV-S5-20, INV-18).
   * Returns typed BuyerOrderListResult — NOT raw Prisma entities (AI-2 fix).
   */
  async findManyForBuyer(
    buyerId: string,
    filter: {
      status?: OrderStatus;
      cursor?: string; // orderId
      limit: number;
    },
  ): Promise<BuyerOrderListResult> {
    const rows = await this.prisma.order.findMany({
      where: {
        buyerId, // MANDATORY ownership filter (INV-18)
        isDeleted: false,
        ...(filter.status && { status: filter.status }),
        ...(filter.cursor && { id: { lt: filter.cursor } }),
      },
      include: {
        items: { take: 3 }, // preview only — no N+1 (INV-S5-31)
        payments: { select: { status: true, method: true }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
      take: filter.limit + 1, // fetch +1 to determine hasMore
    });

    const hasMore = rows.length > filter.limit;
    if (hasMore) rows.pop();

    return {
      orders: rows.map(mapOrderToListItem),
      nextCursor: hasMore ? (rows[rows.length - 1]?.id ?? null) : null,
      hasMore,
    };
  }

  /**
   * Full order detail with status history + tracking timeline.
   * Returns typed BuyerOrderDetailShape — NOT raw Prisma entity (AI-2 fix).
   * FIX-2: trackingUrl correctly mapped from OrderTracking.carrierUrl.
   */
  async findByIdForBuyer(
    orderId: string,
    buyerId: string,
  ): Promise<BuyerOrderDetailShape> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, buyerId, isDeleted: false }, // buyerId filter mandatory (INV-18)
      include: {
        items: true, // full items on detail view (INV-S5-31)
        tracking: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!order) {
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND' });
    }

    // Fetch status history separately — avoids massive include on every detail view (INV-S5-31)
    const statusHistory = await this.prisma.orderStatusHistory.findMany({
      where: { orderId },
      orderBy: { timestamp: 'asc' },
      select: {
        id: true,
        statusFrom: true,
        statusTo: true,
        actorRole: true,
        reason: true,
        timestamp: true,
      },
    });

    const trackingRow = order.tracking[0] ?? null;

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      segment: order.segment,
      status: order.status,
      grandTotal: order.grandTotal.toString(),
      subtotal: order.subtotal.toString(),
      taxAmount: order.taxAmount.toString(),
      shippingCost: order.shippingCost.toString(),
      discount: order.discount.toString(),
      createdAt: order.createdAt.toISOString(),
      confirmedAt: order.confirmedAt?.toISOString() ?? null, // For grace-window check (INV-S5-24)
      sellerId: order.sellerId, // For service-level cross-checks
      items: order.items.map(mapOrderItem),
      statusHistory: statusHistory.map(mapStatusHistory),
      tracking: trackingRow ? mapTracking(trackingRow) : null,
    };
  }
}
