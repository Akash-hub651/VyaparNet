import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { Segment, Prisma } from '@vyaparnet/database';

export interface SearchParams {
  tsQuery: string;
  segment: Segment;
  limit: number;
  categoryId?: string;
  minPrice?: number;
  maxPrice?: number;
  cursor?: { id: string; createdAt: Date };
}

export interface SearchResult {
  id: string;
  name: string;
  price: string; // Prisma Decimal returns as string/number depending on config, usually Decimal/string
  segment: Segment;
  rank: number;
  lastIndexedAt: Date | null;
  thumbnailUrl: string | null;
  isVerifiedSeller?: boolean;
}

export interface SearchSuggestionResponse {
  queries: string[];
  categories: string[];
  products: Array<{ id: string; name: string; thumbnailUrl: string | null }>;
}

export const SEARCH_ENGINE = Symbol('SEARCH_ENGINE');

export interface SearchEngine {
  search(params: SearchParams): Promise<SearchResult[]>;
  fuzzyFallback(
    rawQuery: string,
    segment: Segment,
    limit: number,
  ): Promise<SearchResult[]>;
  suggest(query: string, segment: Segment): Promise<SearchSuggestionResponse>;
  deindex(productId: string): Promise<void>;
  rebuildIndex(segment: Segment): Promise<void>;
}

@Injectable()
export class PostgresSearchEngine implements SearchEngine {
  private readonly logger = new Logger(PostgresSearchEngine.name);

  constructor(private readonly prisma: PrismaService) {}

  async search(params: SearchParams): Promise<SearchResult[]> {
    if (!params.tsQuery) return [];

    // CRITICAL: Uses Prisma.sql template tag ONLY. Zero string interpolation.
    // Build dynamic conditions using Prisma.sql fragments
    const conditions: Prisma.Sql[] = [];

    conditions.push(Prisma.sql`spd.segment = ${params.segment}::"Segment"`);
    conditions.push(Prisma.sql`spd."needsReindex" = false`);
    conditions.push(Prisma.sql`spd.search_vector @@ q.tsq`);

    if (params.categoryId) {
      conditions.push(Prisma.sql`spd."categoryId" = ${params.categoryId}`);
    }
    if (params.minPrice !== undefined) {
      conditions.push(Prisma.sql`spd.price >= ${params.minPrice}`);
    }
    if (params.maxPrice !== undefined) {
      conditions.push(Prisma.sql`spd.price <= ${params.maxPrice}`);
    }
    if (params.cursor) {
      conditions.push(
        Prisma.sql`(spd.created_at, spd.id) < (${params.cursor.createdAt}, ${params.cursor.id})`,
      );
    }

    const whereClause = Prisma.sql`${Prisma.join(conditions, ' AND ')}`;

    // Note: The original spec references "ProductMedia" and "Media" joining logic,
    // which requires confirming if "ProductMedia" exists.
    // For safety and strictly returning what's available without breaking Prisma raw:
    // We execute the search over SearchProductDocument
    // `SearchProductDocument` schema fields: id, productId, name, price, categoryId, segment, sellerId, viewCount, orderCount, lastIndexedAt, needsReindex.

    // We use a CTE to define the query.
    // The query returns `rank` from ts_rank.
    const query = Prisma.sql`
      WITH q AS (SELECT to_tsquery('simple', ${params.tsQuery}) AS tsq)
      SELECT
        spd.id,
        spd.name,
        spd.price,
        spd.segment,
        ts_rank(spd.search_vector, q.tsq, 1) AS rank,
        spd."lastIndexedAt" AS "lastIndexedAt",
        NULL AS "thumbnailUrl" -- Simplified for Sprint 2 Phase 6 to prevent missing table errors
      FROM "SearchProductDocument" spd
      CROSS JOIN q
      WHERE ${whereClause}
      ORDER BY rank DESC, spd."lastIndexedAt" DESC, spd.id DESC
      LIMIT ${params.limit}
    `;

    try {
      const rows = await this.prisma.$queryRaw<any[]>(query);
      if (rows.length === 0) return [];

      const productIds = rows.map((r) => r.id);
      const productDetails = await this.prisma.product.findMany({
        where: { id: { in: productIds } },
        select: {
          id: true,
          business: { select: { kycStatus: true } },
          media: {
            where: { displayOrder: 0, isDeleted: false },
            select: { media: { select: { url: true, thumbnailUrl: true } } },
            take: 1,
          },
        },
      });

      const detailsMap = new Map(productDetails.map((p) => [p.id, p]));

      return rows.map((r) => {
        const details = detailsMap.get(r.id);
        const thumb =
          details?.media?.[0]?.media?.thumbnailUrl ||
          details?.media?.[0]?.media?.url ||
          null;
        const isVerifiedSeller = details?.business?.kycStatus === 'VERIFIED';

        return {
          id: r.id,
          name: r.name,
          price: r.price.toString(),
          segment: r.segment as Segment,
          rank: Number(r.rank),
          lastIndexedAt: r.lastIndexedAt ? new Date(r.lastIndexedAt) : null,
          thumbnailUrl: thumb,
          isVerifiedSeller,
        };
      });
    } catch (e) {
      this.logger.error(`Search query failed`, e);
      return [];
    }
  }

  async fuzzyFallback(
    rawQuery: string,
    segment: Segment,
    limit: number,
  ): Promise<SearchResult[]> {
    if (!rawQuery || rawQuery.trim() === '') return [];

    const query = Prisma.sql`
      SELECT
        spd.id,
        spd.name,
        spd.price,
        spd.segment,
        similarity(spd.name, ${rawQuery}) AS rank,
        spd."lastIndexedAt" AS "lastIndexedAt",
        NULL AS "thumbnailUrl"
      FROM "SearchProductDocument" spd
      WHERE spd.segment = ${segment}::"Segment"
        AND spd."needsReindex" = false
        AND spd.name % ${rawQuery} -- pg_trgm similarity threshold
      ORDER BY rank DESC, spd."lastIndexedAt" DESC, spd.id DESC
      LIMIT ${limit}
    `;

    try {
      const rows = await this.prisma.$queryRaw<any[]>(query);
      if (rows.length === 0) return [];

      const productIds = rows.map((r) => r.id);
      const productDetails = await this.prisma.product.findMany({
        where: { id: { in: productIds } },
        select: {
          id: true,
          business: { select: { kycStatus: true } },
          media: {
            where: { displayOrder: 0, isDeleted: false },
            select: { media: { select: { url: true, thumbnailUrl: true } } },
            take: 1,
          },
        },
      });

      const detailsMap = new Map(productDetails.map((p) => [p.id, p]));

      return rows.map((r) => {
        const details = detailsMap.get(r.id);
        const thumb =
          details?.media?.[0]?.media?.thumbnailUrl ||
          details?.media?.[0]?.media?.url ||
          null;
        const isVerifiedSeller = details?.business?.kycStatus === 'VERIFIED';

        return {
          id: r.id,
          name: r.name,
          price: r.price.toString(),
          segment: r.segment as Segment,
          rank: Number(r.rank),
          lastIndexedAt: r.lastIndexedAt ? new Date(r.lastIndexedAt) : null,
          thumbnailUrl: thumb,
          isVerifiedSeller,
        };
      });
    } catch (e) {
      this.logger.error(`Fuzzy fallback search failed`, e);
      return [];
    }
  }

  async suggest(
    _query: string,
    _segment: Segment,
  ): Promise<SearchSuggestionResponse> {
    // Sprint 2 stub
    return {
      queries: [],
      categories: [],
      products: [],
    };
  }

  async deindex(productId: string): Promise<void> {
    await this.prisma.searchProductDocument.update({
      where: { productId },
      data: { needsReindex: true },
    });
  }

  async rebuildIndex(segment: Segment): Promise<void> {
    const products = await this.prisma.searchProductDocument.findMany({
      where: { segment },
      select: { productId: true },
    });

    // Enqueue full segment reindex job by writing to SearchReindexJob
    if (products.length > 0) {
      const jobs = products.map((p) => ({
        entityType: 'Product',
        entityId: p.productId,
        priority: 0,
      }));
      await this.prisma.searchReindexJob.createMany({
        data: jobs,
        skipDuplicates: true,
      });
    }
  }
}
