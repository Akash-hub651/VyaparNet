import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import {
  Quotation,
  Prisma,
  PriceNegotiation,
  QuotationStatus,
} from '@vyaparnet/database';

@Injectable()
export class QuotationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    data: Prisma.QuotationUncheckedCreateInput,
    items: Prisma.QuotationItemCreateManyQuotationInput[],
    tx?: Prisma.TransactionClient,
  ): Promise<Quotation> {
    const client = tx || this.prisma;
    return client.quotation.create({
      data: {
        ...data,
        items: {
          createMany: {
            data: items,
          },
        },
      },
    });
  }

  async findByIdForSeller(
    id: string,
    sellerId: string,
  ): Promise<(Quotation & { negotiations: PriceNegotiation[] }) | null> {
    return this.prisma.quotation.findFirst({
      where: { id, sellerId },
      include: { negotiations: { orderBy: { createdAt: 'asc' } } },
    });
  }

  async findByIdForBuyer(
    id: string,
    buyerId: string,
  ): Promise<(Quotation & { negotiations: PriceNegotiation[] }) | null> {
    return this.prisma.quotation.findFirst({
      where: { id, buyerId },
      include: { negotiations: { orderBy: { createdAt: 'asc' } } },
    });
  }

  async addNegotiation(
    quotationId: string,
    proposedPrice: Prisma.Decimal,
    proposedBy: string,
    message?: string,
    tx?: Prisma.TransactionClient,
  ): Promise<PriceNegotiation> {
    const client = tx || this.prisma;
    return client.priceNegotiation.create({
      data: {
        quotationId,
        proposedPrice,
        proposedBy,
        message,
      },
    });
  }

  async updateStatus(
    id: string,
    status: QuotationStatus,
    tx?: Prisma.TransactionClient,
  ): Promise<Quotation> {
    const client = tx || this.prisma;
    return client.quotation.update({
      where: { id },
      data: { status },
    });
  }

  async markExpired(validUntil: Date): Promise<number> {
    const result = await this.prisma.quotation.updateMany({
      where: {
        status: { in: ['DRAFT', 'NEGOTIATING'] },
        validUntil: { lt: validUntil },
      },
      data: { status: 'EXPIRED' },
    });
    return result.count;
  }
}
