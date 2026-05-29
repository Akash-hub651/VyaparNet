import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { Prisma, OrderStatusHistory, OrderStatus } from '@vyaparnet/database';

// APPEND-ONLY: This repository has no update() or delete() methods by design.
// See Sprint 4 INV-13. Violating this destroys audit trail integrity.
@Injectable()
export class OrderStatusHistoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    data: {
      orderId: string;
      statusFrom: OrderStatus | null;
      statusTo: OrderStatus;
      actorId: string;
      actorRole: string; // SystemActorType — USER | ADMIN | SYSTEM | CRON | WORKFLOW
      reason?: string;
      historyMonth: string;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<OrderStatusHistory> {
    const client = tx ?? this.prisma;
    return client.orderStatusHistory.create({
      data: {
        ...data,
        actorRole: data.actorRole as any, // SystemActorType: USER|ADMIN|SYSTEM|CRON|WORKFLOW
        timestamp: new Date(),
      },
    });
  }

  async findByOrderId(orderId: string): Promise<OrderStatusHistory[]> {
    return this.prisma.orderStatusHistory.findMany({
      where: { orderId },
      orderBy: { timestamp: 'asc' },
    });
  }
}
