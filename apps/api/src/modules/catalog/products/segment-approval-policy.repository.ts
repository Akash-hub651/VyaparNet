import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { RedisService } from '../../../core/redis/redis.service';
import { Segment, SegmentApprovalPolicy } from '@vyaparnet/database';

@Injectable()
export class SegmentApprovalPolicyRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Retrieves the approval policy for a specific segment.
   * Caches the result in Redis with a 300s TTL under 'segment_approval_policy:{segment}'.
   */
  async findBySegment(segment: Segment): Promise<SegmentApprovalPolicy | null> {
    const cacheKey = `segment_approval_policy:${segment}`;
    const cached = await this.redis.getJson<SegmentApprovalPolicy>(cacheKey);
    if (cached) return cached;

    const policy = await this.prisma.segmentApprovalPolicy.findUnique({
      where: { segment },
    });

    if (policy) {
      await this.redis.setJson(cacheKey, policy, 300);
    }

    return policy;
  }
}
