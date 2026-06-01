import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { Product, Segment, Prisma } from '@vyaparnet/database';

@Injectable()
export class ProductsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Finds a product by ID, ensuring it belongs to the specified segment and is not deleted.
   * Includes category, business summary, and product media ordered by displayOrder.
   */
  async findById(id: string, segment?: Segment): Promise<Product | null> {
    return this.prisma.product.findFirst({
      where: {
        id,
        isDeleted: false,
        ...(segment ? { segment } : {}),
      },
      include: {
        category: true,
        business: {
          select: { id: true, name: true, displayName: true, trustScore: true },
        },
        media: {
          orderBy: { displayOrder: 'asc' },
          include: { media: true },
        },
      },
    });
  }

  /**
   * Finds products owned by a specific seller business using keyset pagination.
   */
  async findBySellerId(
    businessId: string,
    cursorId?: string,
    cursorDate?: Date,
    limit: number = 20,
  ): Promise<Product[]> {
    return this.prisma.product.findMany({
      where: {
        businessId,
        isDeleted: false,
        ...(cursorId && cursorDate
          ? {
              OR: [
                { createdAt: { lt: cursorDate } },
                { createdAt: cursorDate, id: { lt: cursorId } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      include: {
        category: true,
        media: {
          orderBy: { displayOrder: 'asc' },
          include: { media: true },
        },
      },
    });
  }

  /**
   * Finds products pending approval for admin dashboard.
   */
  async findPendingApproval(
    segment?: Segment,
    cursorId?: string,
    cursorDate?: Date,
    limit: number = 20,
  ): Promise<Product[]> {
    return this.prisma.product.findMany({
      where: {
        status: 'PENDING_APPROVAL',
        isDeleted: false,
        ...(segment ? { segment } : {}),
        ...(cursorId && cursorDate
          ? {
              OR: [
                { createdAt: { lt: cursorDate } },
                { createdAt: cursorDate, id: { lt: cursorId } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      include: {
        business: {
          select: { id: true, name: true, trustScore: true },
        },
      },
    });
  }

  /**
   * Updates a product using optimistic locking.
   * Throws P2025 on version mismatch implicitly by Prisma if not found.
   */
  async update(
    id: string,
    currentVersion: number,
    data: Omit<Prisma.ProductUpdateInput, 'version'>,
    tx?: Prisma.TransactionClient,
  ): Promise<Product> {
    const client = tx || this.prisma;
    return client.product.update({
      where: { id, version: currentVersion },
      data: {
        ...data,
        version: { increment: 1 },
      },
    });
  }

  /**
   * Creates a new product.
   */
  async create(
    data: Prisma.ProductCreateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<Product> {
    const client = tx || this.prisma;
    return client.product.create({ data });
  }

  /**
   * Soft deletes a product.
   */
  async softDelete(
    id: string,
    currentVersion: number,
    tx?: Prisma.TransactionClient,
  ): Promise<Product> {
    const client = tx || this.prisma;
    return client.product.update({
      where: { id, version: currentVersion },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        version: { increment: 1 },
      },
    });
  }
}
