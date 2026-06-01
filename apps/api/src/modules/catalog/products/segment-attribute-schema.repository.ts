import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { RedisService } from '../../../core/redis/redis.service';
import { Segment, SegmentAttributeSchema } from '@vyaparnet/database';

@Injectable()
export class SegmentAttributeSchemaRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Retrieves the active attribute schema for a specific segment.
   * Caches the result in Redis with a 300s TTL under 'appconfig:{segment}_attr_schema'.
   */
  async findBySegment(
    segment: Segment,
  ): Promise<SegmentAttributeSchema | null> {
    const cacheKey = `appconfig:${segment}_attr_schema`;
    const cached = await this.redis.getJson<SegmentAttributeSchema>(cacheKey);
    if (cached) return cached;

    const schema = await this.prisma.segmentAttributeSchema.findFirst({
      where: { segment, isActive: true },
      orderBy: { version: 'desc' },
    });

    if (schema) {
      await this.redis.setJson(cacheKey, schema, 300);
    }

    return schema;
  }
}
