import { Injectable } from '@nestjs/common';
import { RedisService } from '../../../core/redis/redis.service';
import { Segment } from '@vyaparnet/database';
import { createHash } from 'crypto';

@Injectable()
export class SearchCacheService {
  constructor(private readonly redis: RedisService) {}

  /**
   * Builds a scope-safe cache key.
   * REASON scope in key: Admin cross-segment results must NEVER be served from buyer cache.
   */
  buildKey(
    scope: 'buyer' | 'admin',
    segment: Segment,
    normalizedQuery: string,
    filters: Record<string, any>,
  ): string {
    // Sort filters to ensure consistent hashing regardless of key order
    const sortedFilters = Object.keys(filters)
      .sort()
      .reduce((acc, key) => {
        acc[key] = filters[key];
        return acc;
      }, {} as Record<string, any>);

    const hashPayload = normalizedQuery + JSON.stringify(sortedFilters);
    const hash = createHash('sha256').update(hashPayload).digest('hex');

    return `search:v1:${scope}:${segment}:${hash}`;
  }

  async getSearchResults<T>(key: string): Promise<T[] | null> {
    return this.redis.getJson<T[]>(key);
  }

  async setSearchResults<T>(key: string, results: T[], ttlSeconds = 60): Promise<void> {
    await this.redis.setJson(key, results, ttlSeconds);
  }
}
