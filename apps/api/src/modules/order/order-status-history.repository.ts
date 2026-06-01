import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import {
  Prisma,
  OrderStatusHistory,
  OrderStatus,
  SystemActorType,
} from '@vyaparnet/database';

// APPEND-ONLY: This repository has no update() or delete() methods by design.
// See Sprint 4 INV-13. Violating this destroys audit trail integrity.
//
// FIX-10: actorRole now uses SystemActorType enum directly (INV-S5-22).
// Sprint 5 migration (20260530100000) added SELLER and BUYER to the DB enum.
// All valid values: USER | ADMIN | SYSTEM | CRON | WORKFLOW | SELLER | BUYER

@Injectable()
export class OrderStatusHistoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    data: {
      orderId: string;
      statusFrom: OrderStatus | null;
      statusTo: OrderStatus;
      actorId: string;
      actorRole: SystemActorType; // FIX-10: Fully typed — no 'string' fallback (INV-S5-22)
      reason?: string;
      historyMonth: string;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<OrderStatusHistory> {
    const client = tx ?? this.prisma;
    return client.orderStatusHistory.create({
      data: {
        ...data,
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
