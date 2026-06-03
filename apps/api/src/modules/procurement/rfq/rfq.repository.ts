import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { Rfq, Quotation, Prisma, RfqStatus } from '@vyaparnet/database';

@Injectable()
export class RfqRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.RfqUncheckedCreateInput): Promise<Rfq> {
    return this.prisma.rfq.create({ data });
  }

  async findById(id: string): Promise<Rfq | null> {
    return this.prisma.rfq.findUnique({
      where: { id },
    });
  }

  async findByIdForBuyer(
    id: string,
    buyerId: string,
  ): Promise<(Rfq & { quotations: Quotation[] }) | null> {
    return this.prisma.rfq.findFirst({
      where: { id, buyerId },
      include: { quotations: true },
    });
  }

  async findManyForBuyer(buyerId: string): Promise<Rfq[]> {
    return this.prisma.rfq.findMany({
      where: { buyerId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * INV-S8-17: Seller quote scoped by sellerId (repository layer).
   * Finds RFQs matching seller's segment and products.
   */
  async findManyForSeller(segment: any, productIds: string[]): Promise<Rfq[]> {
    // We match RFQs in the seller's segment that contain at least one of the seller's productIds
    const rfqs = await this.prisma.rfq.findMany({
      where: {
        segment,
        status: RfqStatus.OPEN,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Post-filter JSON array
    return rfqs.filter((rfq) => {
      const items = rfq.items as Array<{ productId: string }>;
      return items.some((item) => productIds.includes(item.productId));
    });
  }

  async updateStatus(
    id: string,
    status: RfqStatus,
    tx?: Prisma.TransactionClient,
  ): Promise<Rfq> {
    const client = tx || this.prisma;
    return client.rfq.update({
      where: { id },
      data: {
        status,
        ...(status === RfqStatus.CLOSED || status === RfqStatus.CANCELLED
          ? { closedAt: new Date() }
          : {}),
      },
    });
  }
}
