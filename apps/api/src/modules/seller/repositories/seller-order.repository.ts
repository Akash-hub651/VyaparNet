import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { OrderStatus } from '@vyaparnet/database';
import { SellerOrderFilterDto, SellerOrderView, SellerOrderListResponse } from '@vyaparnet/types';

// maskBuyerId: returns BUYER-{first6ofId} (INV-S5-4)
export function maskBuyerId(buyerId: string): string {
  return `BUYER-${buyerId.slice(0, 6).toUpperCase()}`;
}

@Injectable()
export class SellerOrderRepository {
  constructor(private readonly prisma: PrismaService) {}

  // INV-S5-3: ALL methods take sellerId (Business.id) as mandatory param
  // INV-S5-1: sellerId is Business.id — NEVER User.id

  async findMany(
    sellerId: string,
    filter: SellerOrderFilterDto,
  ): Promise<SellerOrderListResponse> {
    const orders = await this.prisma.order.findMany({
      where: {
        sellerId, // MANDATORY — Business.id (INV-S5-3, INV-S5-1)
        isDeleted: false,
        ...(filter.status && { status: filter.status as OrderStatus }),
        ...(filter.cursor && { id: { lt: filter.cursor } }),
      },
      include: {
        items: {
          where: { sellerId }, // D1: filter to seller's items only (INV-S5-3)
          take: 3, // preview only (INV-S5-31)
        },
      },
      orderBy: { createdAt: 'desc' },
      take: filter.limit + 1, // cursor pattern (INV-S5-20)
    });

    const hasMore = orders.length > filter.limit;
    const items = hasMore ? orders.slice(0, filter.limit) : orders;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return {
      items: items.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        grandTotal: o.grandTotal.toString(),
        createdAt: o.createdAt.toISOString(),
        buyerCode: maskBuyerId(o.buyerId), // INV-S5-4: mask buyer identity
        itemCount: o.items.length,
        itemsPreview: o.items.map((item) => ({
          productId: item.productId,
          productName: item.productName,
          productSlug: item.productSlug,
          productImage: item.productImage ?? null,
          quantity: item.quantity,
          unitPrice: item.unitPrice.toString(),
          totalPrice: item.totalPrice.toString(),
        })),
      })),
      nextCursor,
      hasMore,
    };
  }

  async findByIdForSeller(
    orderId: string,
    sellerId: string,
  ): Promise<SellerOrderView & { confirmedAt: Date | null; buyerId: string }> {
    // BOTH filters MANDATORY (INV-S5-3) — cross-seller returns null → 404
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, sellerId, isDeleted: false },
      include: {
        items: {
          where: { sellerId }, // D1: filtered items only — NOT all order items
        },
        tracking: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!order) throw new NotFoundException({ code: 'ORDER_NOT_FOUND' });

    // statusHistory has no Prisma relation on Order model — query separately
    const statusHistory = await this.prisma.orderStatusHistory.findMany({
      where: { orderId },
      orderBy: { timestamp: 'asc' },
      select: { id: true, statusFrom: true, statusTo: true, reason: true, timestamp: true, actorRole: true },
    });

    const tracking = order.tracking[0] ?? null;

    // applies buyerCode masking (INV-S5-4) — buyerId & confirmedAt exposed internally for service use
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
      buyerCode: maskBuyerId(order.buyerId), // INV-S5-4: NEVER expose raw buyerId
      // Internal-only — stripped by service before returning to controller
      buyerId: order.buyerId,
      confirmedAt: order.confirmedAt,
      items: order.items.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        productSlug: item.productSlug,
        productImage: item.productImage ?? null,
        quantity: item.quantity,
        unitPrice: item.unitPrice.toString(),
        totalPrice: item.totalPrice.toString(),
      })),
      statusHistory: statusHistory.map((h) => ({
        id: h.id,
        statusFrom: h.statusFrom ?? null,
        statusTo: h.statusTo,
        reason: h.reason ?? null,
        timestamp: h.timestamp.toISOString(),
        actorRole: h.actorRole,
      })),
      tracking: tracking
        ? {
            carrier: (tracking as any).carrier ?? null,
            trackingNumber: tracking.trackingNumber ?? null,
            estimatedDelivery: tracking.estimatedDelivery?.toISOString() ?? null,
            dispatchProofUrl: (tracking as any).dispatchProofUrl ?? null,
          }
        : null,
    };
  }
}
