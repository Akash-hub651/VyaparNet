import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { Prisma, Order, OrderItem, OrderStatus } from '@vyaparnet/database';

@Injectable()
export class OrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(orderId: string, buyerId: string): Promise<(Order & { items: OrderItem[] }) | null> {
    // INV-18: always filter by buyerId — no unfenced reads
    return this.prisma.order.findFirst({
      where: { id: orderId, buyerId, isDeleted: false },
      include: { items: true },
    });
  }

  async findByBuyerId(buyerId: string, segment?: string): Promise<Order[]> {
    // INV-18: segment isolation enforced
    return this.prisma.order.findMany({
      where: {
        buyerId,
        isDeleted: false,
        ...(segment ? { segment: segment as any } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByGatewayRef(gatewayRef: string): Promise<Order | null> {
    // Look up order via payment.gatewayRef (Razorpay order ID)
    const payment = await this.prisma.payment.findFirst({
      where: { gatewayRef },
      select: { orderId: true },
    });
    if (!payment) return null;
    return this.prisma.order.findFirst({
      where: { id: payment.orderId, isDeleted: false },
    });
  }

  async updateStatus(
    orderId: string,
    status: OrderStatus,
    additionalData: Partial<Pick<Order, 'cancelledAt' | 'confirmedAt' | 'paymentFailedAt' | 'cancellationReason'>>,
    tx: Prisma.TransactionClient,
  ): Promise<Order> {
    return tx.order.update({
      where: { id: orderId },
      data: { status, ...additionalData },
    });
  }
}
