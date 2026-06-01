import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { KycStatus } from '@vyaparnet/database';
import type { AdminBusinessListQuery } from '@vyaparnet/types';

// ─── DTO shapes returned to callers ─────────────────────────────────────────

export interface BusinessSummaryDto {
  id: string;
  name: string;
  slug: string;
  segment: string;
  kycStatus: KycStatus;
  ownerId: string;
  ownerPhone: string | null;
  ownerEmail: string | null;
  trustScore: number;
  createdAt: string;
  updatedAt: string;
}

export interface KycDocumentDto {
  id: string;
  businessId: string | null;
  userId: string | null;
  type: string;
  url: string; // S3 key — NEVER the signed URL (INV-S7-8)
  status: KycStatus;
  verifiedBy: string | null;
  verifiedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
}

export interface BusinessDetailDto {
  id: string;
  name: string;
  displayName: string | null;
  slug: string;
  segment: string;
  kycStatus: KycStatus;
  gstNumber: string | null;
  panNumber: string | null;
  ownerId: string;
  ownerName: string | null;
  ownerPhone: string | null;
  ownerEmail: string | null;
  trustScore: number;
  establishedYear: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface BusinessListResponse {
  data: BusinessSummaryDto[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * AdminBusinessRepository — cross-domain admin reads via DIRECT Prisma (INV-S7-26).
 *
 * NEVER import domain module repositories here.
 * NEVER import OrderModule, SellerModule, or any other domain module.
 * All data access is via PrismaService directly.
 *
 * Authority: §18 Phase 3, INV-S7-26.
 */
@Injectable()
export class AdminBusinessRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Paginated business list — cursor-based (by Business.id desc).
   * Cross-segment admin view — no segment restriction on admin role (INV-S7-1).
   */
  async findMany(
    filter: AdminBusinessListQuery,
  ): Promise<BusinessListResponse> {
    const businesses = await this.prisma.business.findMany({
      where: {
        isDeleted: false,
        ...(filter.kycStatus && { kycStatus: filter.kycStatus }),
        ...(filter.segment && { segment: filter.segment as any }),
        ...(filter.search && {
          name: { contains: filter.search, mode: 'insensitive' },
        }),
        ...(filter.cursor && { id: { lt: filter.cursor } }),
      },
      include: {
        owner: {
          select: { id: true, phone: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: filter.limit + 1, // cursor over-fetch
    });

    const hasMore = businesses.length > filter.limit;
    const items = hasMore ? businesses.slice(0, filter.limit) : businesses;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return {
      data: items.map((b) => ({
        id: b.id,
        name: b.name,
        slug: b.slug,
        segment: b.segment,
        kycStatus: b.kycStatus,
        ownerId: b.ownerId,
        ownerPhone: b.owner.phone ?? null,
        ownerEmail: b.owner.email ?? null,
        trustScore: b.trustScore,
        createdAt: b.createdAt.toISOString(),
        updatedAt: b.updatedAt.toISOString(),
      })),
      nextCursor,
      hasMore,
    };
  }

  /**
   * Find business by ID — includes owner contact for audit logging.
   * Returns null if not found or soft-deleted.
   */
  async findById(id: string): Promise<BusinessDetailDto | null> {
    const business = await this.prisma.business.findFirst({
      where: { id, isDeleted: false },
      include: {
        owner: {
          select: { id: true, phone: true, email: true, name: true },
        },
      },
    });

    if (!business) return null;

    return {
      id: business.id,
      name: business.name,
      displayName: business.displayName ?? null,
      slug: business.slug,
      segment: business.segment,
      kycStatus: business.kycStatus,
      gstNumber: business.gstNumber ?? null,
      panNumber: business.panNumber ?? null,
      ownerId: business.ownerId,
      ownerName: (business.owner as any).name ?? null,
      ownerPhone: business.owner.phone ?? null,
      ownerEmail: business.owner.email ?? null,
      trustScore: business.trustScore,
      establishedYear: business.establishedYear ?? null,
      createdAt: business.createdAt.toISOString(),
      updatedAt: business.updatedAt.toISOString(),
    };
  }

  /**
   * Find all KYC documents for a business.
   * Returns S3 keys ONLY — NEVER signed URLs (INV-S7-8).
   */
  async findKycDocuments(businessId: string): Promise<KycDocumentDto[]> {
    const docs = await this.prisma.kycDocument.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
    });

    return docs.map((doc) => ({
      id: doc.id,
      businessId: doc.businessId ?? null,
      userId: doc.userId ?? null,
      type: doc.type,
      url: doc.url, // S3 key only — signed URL generated in service layer
      status: doc.status,
      verifiedBy: doc.verifiedBy ?? null,
      verifiedAt: doc.verifiedAt?.toISOString() ?? null,
      rejectionReason: doc.rejectionReason ?? null,
      createdAt: doc.createdAt.toISOString(),
    }));
  }
}
