import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { RedisService } from '../../../core/redis/redis.service';
import { MetricsService } from '../../observability/metrics.service';
import { KycStatus } from '@vyaparnet/database';

@Injectable()
export class SellerContextGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly metrics: MetricsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const userId = req.user.id; // from JwtAuthGuard — already verified

    const cacheKey = `seller_biz:${userId}`;
    let business: any = null;

    // Cache read — with bypass on failure (INV-S5-15 philosophy applied to guard)
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        business = JSON.parse(cached);
      }
    } catch {
      // Redis down — proceed to DB
    }

    if (!business) {
      this.metrics.sellerContextGuardCacheMissTotal.inc();
      business = await this.prisma.business.findFirst({
        where: { ownerId: userId, isDeleted: false },
        select: { id: true, segment: true, kycStatus: true, name: true },
      });

      if (business) {
        try {
          const jitteredTtl = 60 + Math.floor(Math.random() * 15);
          await this.redis.set(cacheKey, JSON.stringify(business), 'EX', jitteredTtl);
        } catch {
          /* silent */
        }
      }
    }

    if (!business) {
      throw new ForbiddenException({ code: 'BUSINESS_NOT_FOUND' });
    }
    if (business.kycStatus === KycStatus.SUSPENDED) {
      throw new ForbiddenException({ code: 'BUSINESS_SUSPENDED' });
    }

    // Attach to request — used by all seller controllers and repositories
    req.seller = {
      businessId: business.id,
      segment: business.segment,
      businessName: business.name,
    };

    return true;
  }
}
