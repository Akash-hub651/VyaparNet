import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../../core/redis/redis.service';
import { MetricsService } from '../../observability/metrics.service';
import { SellerKpiRepository } from '../repositories/seller-kpi.repository';
import { Segment } from '@vyaparnet/database';
import { SellerKpiDto } from '@vyaparnet/types';

@Injectable()
export class SellerKpiService {
  private readonly logger = new Logger(SellerKpiService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly metrics: MetricsService,
    private readonly sellerKpiRepo: SellerKpiRepository,
  ) {}

  async getKpis(businessId: string, segment: Segment): Promise<SellerKpiDto> {
    const today = new Date().toISOString().slice(0, 10);
    const cacheKey = `kpi:${businessId}:${segment}:${today}`;

    // Cache read with bypass on failure (INV-S5-15)
    let redisError = false;
    try {
      const raw = await this.redis.get(cacheKey);
      if (raw) {
        // Cache HIT — served from Redis, no bypass
        return { ...(JSON.parse(raw) as SellerKpiDto), isCacheBypass: false };
      }
    } catch (redisErr) {
      redisError = true;
      this.logger.warn({
        event: 'KPI_REDIS_BYPASS',
        sellerId: businessId,
        error: (redisErr as Error).message,
        segment,
      });
      this.metrics.kpiRedisBypassTotal.inc({ segment }); // observability (INV-S5-15)
    }

    // Cache MISS or Redis error — DB fallback (INV-S5-14: all queries scoped to businessId)
    const startTime = performance.now();
    const kpis = await this.sellerKpiRepo.computeKpis(businessId, segment);
    this.metrics.sellerKpiQueryLatencyMs.observe(performance.now() - startTime);

    // Populate cache with JITTER TTL to prevent thundering herd (INV-S5-36)
    // FORBIDDEN: flat EX 60 TTL — causes stampede when many sellers expire simultaneously
    // REQUIRED: 60 + random(0..15) — staggers expiry across seller population
    if (!redisError) {
      const jitteredTtl = 60 + Math.floor(Math.random() * 15); // 60–75 seconds
      try {
        const cachedPayload: Omit<SellerKpiDto, 'isCacheBypass'> = {
          ...kpis,
          cachedAt: new Date().toISOString(),
        };
        await this.redis.set(cacheKey, JSON.stringify(cachedPayload), 'EX', jitteredTtl);
      } catch {
        /* silent — Redis still down, DB result returned */
      }
    }

    // isCacheBypass = true whenever served from DB (Redis miss OR Redis error)
    return { ...kpis, cachedAt: null, isCacheBypass: true };
  }
}
