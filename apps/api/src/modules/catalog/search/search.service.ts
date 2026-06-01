import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SearchNormalizerService } from './search-normalizer.service';
import { SearchCacheService } from './search-cache.service';
import {
  SEARCH_ENGINE,
  SearchEngine,
  SearchResult,
  SearchSuggestionResponse,
} from './postgres-search.engine';
import { Segment } from '@vyaparnet/database';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { CatalogMetrics } from '../catalog-metrics.service';
import { performance } from 'perf_hooks';

export interface SearchProductsDto {
  q: string;
  segment: Segment;
  limit?: number;
  categoryId?: string;
  minPrice?: number;
  maxPrice?: number;
  cursor?: { id: string; createdAt: Date };
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly normalizer: SearchNormalizerService,
    private readonly cacheService: SearchCacheService,
    @Inject(SEARCH_ENGINE) private readonly searchEngine: SearchEngine,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly metrics: CatalogMetrics,
  ) {}

  async searchProducts(
    dto: SearchProductsDto,
    _userId?: string,
    scope: 'buyer' | 'admin' = 'buyer',
  ) {
    const startTime = performance.now();
    try {
      const limit = dto.limit || 20;

      // 1. Normalize Query
      const normalized = this.normalizer.normalizeAndBuildTsQuery(dto.q);

      // 2. Build Cache Key
      const filters = {
        categoryId: dto.categoryId,
        minPrice: dto.minPrice,
        maxPrice: dto.maxPrice,
        limit,
        cursor: dto.cursor,
      };

      const cacheKey = this.cacheService.buildKey(
        scope,
        dto.segment,
        normalized,
        filters,
      );

      // 3. Check Cache
      const cached =
        await this.cacheService.getSearchResults<SearchResult>(cacheKey);
      if (cached) {
        this.logger.debug(`Cache hit for query: ${dto.q}`);
        this.metrics.searchCacheHit(dto.segment, scope);
        return {
          results: cached,
          nextCursor: this.encodeCursor(cached),
          fromCache: true,
          fallbackUsed: false,
        };
      }

      this.metrics.searchQuery(dto.segment, 'postgres');

      let results: SearchResult[] = [];
      let fallbackUsed = false;

      // 5. DB Search
      if (normalized) {
        results = await this.searchEngine.search({
          tsQuery: normalized,
          segment: dto.segment,
          limit,
          categoryId: dto.categoryId,
          minPrice: dto.minPrice,
          maxPrice: dto.maxPrice,
          cursor: dto.cursor,
        });
      }

      // 7. Fuzzy Fallback
      if (results.length === 0 && dto.q) {
        fallbackUsed = true;
        this.metrics.searchFallback(dto.segment);
        results = await this.searchEngine.fuzzyFallback(
          dto.q,
          dto.segment,
          limit,
        );
      }

      if (results.length === 0) {
        this.metrics.searchZeroResults(dto.segment);
      }

      // Apply Segment-Aware Boosting
      results = await this.applySegmentBoosting(dto.segment, results);

      // 8. Determine Next Cursor
      const nextCursor = this.encodeCursor(results);

      // 9. Cache Results
      await this.cacheService.setSearchResults(cacheKey, results, 60);

      // 10. Log Analytics (Fire-and-Forget, simulated for Sprint 2)
      this.logSearchAnalytics(dto.q, dto.segment, results.length);

      return {
        results,
        nextCursor,
        fallbackUsed,
        fromCache: false,
      };
    } finally {
      const duration = performance.now() - startTime;
      this.metrics.recordSearchQueryDuration(dto.segment, duration);
    }
  }

  async getSuggestions(
    query: string,
    segment: Segment,
  ): Promise<SearchSuggestionResponse> {
    return this.searchEngine.suggest(query, segment);
  }

  private encodeCursor(results: SearchResult[]): string | null {
    if (results.length === 0) return null;
    const last = results[results.length - 1];
    if (!last.lastIndexedAt) return null;

    // Basic base64 cursor encoding
    const cursorObj = { id: last.id, createdAt: last.lastIndexedAt };
    return Buffer.from(JSON.stringify(cursorObj)).toString('base64');
  }

  private async applySegmentBoosting(
    segment: Segment,
    results: SearchResult[],
  ): Promise<SearchResult[]> {
    const configRow = await this.prisma.appConfig.findUnique({
      where: { key: `search_config_${segment}` },
    });
    const configStr = configRow?.value;
    if (!configStr) return results;

    try {
      const config = JSON.parse(configStr);
      const boosts = config.rankingBoosts || {};

      const hasImagesBoost = boosts.hasImages || 1.0;
      const verifiedBoost = boosts.isVerifiedSeller || 1.0;

      return results
        .map((r) => {
          let finalRank = r.rank;
          if (r.thumbnailUrl) {
            finalRank *= hasImagesBoost;
          }
          if (r.isVerifiedSeller) {
            finalRank *= verifiedBoost;
          }
          return { ...r, rank: finalRank };
        })
        .sort((a, b) => b.rank - a.rank);
    } catch (e) {
      this.logger.error(
        `Failed to parse segment boosting config for ${segment}`,
        e,
      );
      return results;
    }
  }

  private logSearchAnalytics(
    query: string,
    segment: Segment,
    resultCount: number,
  ) {
    // Fire and forget analytics logging
    // AppConfig sample rate can limit noise.
    const sampleRate =
      this.configService.get<number>('SEARCH_ANALYTICS_SAMPLE_RATE') || 0.1;
    if (Math.random() < sampleRate) {
      this.logger.debug(
        `[Analytics] Search logged: "${query}" in ${segment} yielded ${resultCount} results.`,
      );
    }
  }
}
