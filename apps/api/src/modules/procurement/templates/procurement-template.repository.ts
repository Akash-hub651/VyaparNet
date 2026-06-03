import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { ProcurementTemplate, Prisma } from '@vyaparnet/database';

@Injectable()
export class ProcurementTemplateRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    data: Prisma.ProcurementTemplateUncheckedCreateInput,
  ): Promise<ProcurementTemplate> {
    return this.prisma.procurementTemplate.create({ data });
  }

  async findManyForBuyer(buyerId: string): Promise<ProcurementTemplate[]> {
    return this.prisma.procurementTemplate.findMany({
      where: { buyerId, isDeleted: false },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByIdForBuyer(
    id: string,
    buyerId: string,
  ): Promise<ProcurementTemplate | null> {
    return this.prisma.procurementTemplate.findFirst({
      where: { id, buyerId, isDeleted: false },
    });
  }

  async update(
    id: string,
    data: Prisma.ProcurementTemplateUpdateInput,
  ): Promise<ProcurementTemplate> {
    return this.prisma.procurementTemplate.update({
      where: { id },
      data,
    });
  }

  async softDelete(id: string): Promise<ProcurementTemplate> {
    return this.prisma.procurementTemplate.update({
      where: { id },
      data: { isDeleted: true },
    });
  }
}
