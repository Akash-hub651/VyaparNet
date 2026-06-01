import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { ProductStatus, Prisma } from '@vyaparnet/database';
import type { AdminProductListQuery } from '@vyaparnet/types';

// ─── DTO shapes returned to callers ─────────────────────────────────────────

export interface ProductSummaryDto {
  id: string;
  name: string;
  slug: string;
  segment: string;
  status: ProductStatus;
  businessId: string;
  businessName: string;
  sellerUserId: string; // Business.ownerId
  categoryId: string;
  basePrice: string;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductDetailDto extends ProductSummaryDto {
  description: string | null;
  mrp: string | null;
  moq: number;
  unit: string;
  hsnCode: string | null;
  gstPercent: string | null;
  tags: string[];
}

export interface ProductListResponse {
  data: ProductSummaryDto[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * AdminProductRepository — cross-domain admin reads on Product via direct Prisma (INV-S7-26).
 *
 * NEVER imports domain module repositories (ProductsRepository, etc.).
 * All data access is via PrismaService directly.
 * resolves sellerUserId = Business.ownerId (not Business.id which is businessId).
 *
 * Authority: §19 Phase 4.
 */
@Injectable()
export class AdminProductRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Paginated product list — cursor-based (by Product.id desc).
   * Default filter: PENDING_APPROVAL (the admin approval queue).
   */
  async findMany(filter: AdminProductListQuery): Promise<ProductListResponse> {
    const products = await this.prisma.product.findMany({
      where: {
        isDeleted: false,
        ...(filter.status && { status: filter.status as ProductStatus }),
        ...(filter.segment && { segment: filter.segment as any }),
        ...(filter.businessId && { businessId: filter.businessId }),
        ...(filter.search && {
          name: { contains: filter.search, mode: 'insensitive' as const },
        }),
        ...(filter.cursor && { id: { lt: filter.cursor } }),
      },
      include: {
        business: {
          select: { id: true, name: true, ownerId: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: filter.limit + 1, // cursor over-fetch
    });

    const hasMore = products.length > filter.limit;
    const items = hasMore ? products.slice(0, filter.limit) : products;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return {
      data: items.map((p) => this.toSummaryDto(p)),
      nextCursor,
      hasMore,
    };
  }

  /**
   * Find product by ID — includes Business info for sellerUserId resolution.
   * Returns null if not found or soft-deleted.
   */
  async findById(id: string): Promise<ProductDetailDto | null> {
    const product = await this.prisma.product.findFirst({
      where: { id, isDeleted: false },
      include: {
        business: {
          select: { id: true, name: true, ownerId: true },
        },
      },
    });

    if (!product) return null;

    return {
      ...this.toSummaryDto(product),
      description: product.description ?? null,
      mrp: product.mrp?.toString() ?? null,
      moq: product.moq,
      unit: product.unit,
      hsnCode: product.hsnCode ?? null,
      gstPercent: product.gstPercent?.toString() ?? null,
      tags: product.tags,
    };
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private toSummaryDto(
    product: Prisma.ProductGetPayload<{
      include: {
        business: { select: { id: true; name: true; ownerId: true } };
      };
    }>,
  ): ProductSummaryDto {
    return {
      id: product.id,
      name: product.name,
      slug: product.slug,
      segment: product.segment,
      status: product.status,
      businessId: product.businessId,
      businessName: product.business.name,
      sellerUserId: product.business.ownerId, // Business.ownerId = User.id of seller
      categoryId: product.categoryId,
      basePrice: product.basePrice.toString(),
      approvedBy: product.approvedBy ?? null,
      approvedAt: product.approvedAt?.toISOString() ?? null,
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
    };
  }
}
