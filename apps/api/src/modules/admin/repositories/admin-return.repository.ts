import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import {
  ReturnRequest,
  Prisma,
  Segment,
  ReturnStatus,
} from '@vyaparnet/database';

@Injectable()
export class AdminReturnRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(
    page: number,
    limit: number,
    segment?: Segment,
    status?: ReturnStatus,
  ): Promise<{ data: ReturnRequest[]; total: number }> {
    const where: Prisma.ReturnRequestWhereInput = {};
    if (segment) where.segment = segment;
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      this.prisma.returnRequest.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          order: { select: { id: true, segment: true } },
        },
      }),
      this.prisma.returnRequest.count({ where }),
    ]);

    return { data, total };
  }

  async findById(id: string): Promise<ReturnRequest | null> {
    return this.prisma.returnRequest.findUnique({
      where: { id },
      include: {
        order: true,
      },
    });
  }

  async updateStatus(
    id: string,
    status: ReturnStatus,
    _adminId: string,
    approvedRefundAmount?: Prisma.Decimal,
    tx?: Prisma.TransactionClient,
  ): Promise<ReturnRequest> {
    const db = tx || this.prisma;
    return db.returnRequest.update({
      where: { id },
      data: {
        status,
        ...(approvedRefundAmount ? { approvedRefundAmount } : {}),
      },
    });
  }
}
