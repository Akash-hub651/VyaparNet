import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { RedisService } from '../../../core/redis/redis.service';
import { Business } from '@vyaparnet/database';

@Injectable()
export class BusinessQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Retrieves the business owned by a specific user.
   * Required by CatalogModule (Sprint 2 Phase 5/7).
   */
  async findByOwnerId(userId: string): Promise<Business | null> {
    return this.prisma.business.findFirst({
      where: {
        ownerId: userId,
        isDeleted: false,
      },
    });
  }

  /**
   * Invalidates the business cache for a user.
   * Required by Sprint 2 Phase 7.
   */
  async invalidateCache(userId: string): Promise<void> {
    const cacheKey = `seller_business:${userId}`;
    await this.redis.del(cacheKey);
  }
}

