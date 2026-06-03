import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { Dispute, DisputeStatus, DisputePriority, Segment, Prisma } from '@vyaparnet/database';

@Injectable()
export class AdminDisputeRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(
    page: number,
    limit: number,
    segment?: Segment,
    status?: DisputeStatus,
    priority?: DisputePriority,
  ): Promise<{ data: Dispute[]; total: number }> {
    const where: Prisma.DisputeWhereInput = {};
    if (segment) {
      where.order = { segment };
    }
    if (status) {
      where.status = status;
    }
    if (priority) {
      where.priority = priority;
    }

    const [data, total] = await Promise.all([
      this.prisma.dispute.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [
          { priority: 'desc' },
          { createdAt: 'asc' },
        ],
        include: {
          order: { select: { segment: true } },
        },
      }),
      this.prisma.dispute.count({ where }),
    ]);

    return { data, total };
  }

  async findById(id: string): Promise<Dispute & { order: { segment: Segment } } | null> {
    return this.prisma.dispute.findUnique({
      where: { id },
      include: {
        order: { select: { segment: true } },
      },
    });
  }

  async updateStatus(
    id: string,
    status: DisputeStatus,
    _adminId: string,
    resolution?: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Dispute> {
    const client = tx ?? this.prisma;
    
    const data: Prisma.DisputeUpdateInput = { status };
    if (resolution) {
      data.resolution = resolution;
      data.resolvedAt = new Date();
    }
    
    return client.dispute.update({
      where: { id },
      data,
    });
  }

  async countOpen(): Promise<number> {
    return this.prisma.dispute.count({
      where: {
        status: {
          in: [DisputeStatus.OPEN, DisputeStatus.UNDER_REVIEW, DisputeStatus.ESCALATED],
        },
      },
    });
  }
}
