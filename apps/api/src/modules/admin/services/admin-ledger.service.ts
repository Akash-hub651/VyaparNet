import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AuditSafeWriterService } from '../../security/audit/audit-safe-writer.service';
import { BuyerLedgerType, Prisma, Segment } from '@vyaparnet/database';

@Injectable()
export class AdminLedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditSafeWriter: AuditSafeWriterService,
  ) {}

  async getBuyerLedger(buyerId: string, adminId: string, page = 1, limit = 10) {
    const user = await this.prisma.user.findUnique({ where: { id: buyerId } });
    if (!user) throw new NotFoundException('Buyer not found');

    const entries = await this.prisma.buyerLedger.findMany({
      where: { buyerId },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const latest = await this.prisma.buyerLedger.findFirst({
      where: { buyerId },
      orderBy: { createdAt: 'desc' },
    });

    const currentBalance = latest ? latest.balance.toString() : '0.00';

    // Audit Log (INV-S8-*)
    await this.auditSafeWriter.safeWrite({
      entityType: 'BUYER',
      entityId: buyerId,
      action: 'UPDATE' as any,
      actorId: adminId,
      newValue: { action: 'LEDGER_VIEWED', buyerId },
    });

    return {
      entries,
      currentBalance,
    };
  }

  async applyCorrection(
    buyerId: string,
    amount: string,
    description: string,
    segment: Segment,
    adminId: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: buyerId } });
    if (!user) throw new NotFoundException('Buyer not found');

    const result = await this.prisma.$transaction(async (tx) => {
      // Fetch latest inside tx (INV-S8-40)
      const latest = await tx.buyerLedger.findFirst({
        where: { buyerId },
        orderBy: { createdAt: 'desc' },
      });

      const currentBalance = latest ? latest.balance : new Prisma.Decimal(0);
      const adjustmentAmount = new Prisma.Decimal(amount);
      const newBalance = currentBalance.add(adjustmentAmount);

      const entry = await tx.buyerLedger.create({
        data: {
          buyerId,
          segment,
          transactionType: BuyerLedgerType.ADJUSTMENT,
          amount: adjustmentAmount,
          balance: newBalance,
          description,
        },
      });

      return entry;
    });

    await this.auditSafeWriter.safeWrite({
      entityType: 'BUYER',
      entityId: buyerId,
      action: 'UPDATE' as any,
      actorId: adminId,
      newValue: { action: 'LEDGER_CORRECTION', amount, description },
    });

    return result;
  }
}
