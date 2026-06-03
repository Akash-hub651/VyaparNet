import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { Prisma, BuyerLedgerType, Segment } from '@vyaparnet/database';

@Injectable()
export class BuyerLedgerRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Appends a new ledger entry.
   * MUST be executed inside a $transaction for safety (INV-S8-40, INV-S8-2).
   */
  async create(
    tx: Prisma.TransactionClient,
    data: {
      buyerId: string;
      segment: Segment;
      transactionType: BuyerLedgerType;
      orderId?: string;
      amount: Prisma.Decimal;
      balance: Prisma.Decimal;
      description?: string;
      returnRequestId?: string;
      createdBy?: string;
    },
  ) {
    return tx.buyerLedger.create({
      data: {
        buyerId: data.buyerId,
        segment: data.segment,
        transactionType: data.transactionType,
        orderId: data.orderId,
        amount: data.amount,
        balance: data.balance,
        description: data.description,
        returnRequestId: data.returnRequestId,
        createdBy: data.createdBy,
      },
    });
  }

  /**
   * Retrieves the latest balance for a buyer (segment-aware if necessary, but ledger is typically cross-segment for buyer, though segment is tracked).
   * MUST be executed inside $transaction to prevent race conditions during updates.
   */
  async findLatestBalance(tx: Prisma.TransactionClient, buyerId: string): Promise<Prisma.Decimal> {
    const latest = await tx.buyerLedger.findFirst({
      where: { buyerId },
      orderBy: { createdAt: 'desc' },
      select: { balance: true },
    });
    return latest?.balance ?? new Prisma.Decimal(0);
  }

  /**
   * Finds an entry by return request ID (used for double-refund guard INV-S8-41).
   */
  async findByReturnId(returnRequestId: string) {
    return this.prisma.buyerLedger.findFirst({
      where: { returnRequestId },
    });
  }

  /**
   * Retrieves paginated ledger entries for a buyer.
   */
  async findManyForBuyer(
    buyerId: string,
    params: { page: number; limit: number; segment?: Segment },
  ) {
    const { page, limit, segment } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.BuyerLedgerWhereInput = { buyerId };
    if (segment) {
      where.segment = segment;
    }

    const [items, total] = await Promise.all([
      this.prisma.buyerLedger.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.buyerLedger.count({ where }),
    ]);

    return { items, total };
  }
}
