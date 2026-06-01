import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { RedisService } from '../../../core/redis/redis.service';

@Injectable()
export class AdminRateLimitGuard implements CanActivate {
  constructor(private readonly redis: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // We assume AdminContextGuard (or similar) runs before this, or we just fail open if no user
    if (!user || !user.id) {
      return true;
    }

    // Rate-limit by adminId (JWT identity), not IP. H-P1-3
    const adminId = user.id;
    const currentMinute = Math.floor(Date.now() / 60000);
    const key = `admin-rate:${adminId}:${currentMinute}`;
    const limit = 60; // 60 requests per minute

    const multi = this.redis.multi();
    multi.incr(key);
    multi.expire(key, 60);
    const results = await multi.exec();

    if (!results || results.length === 0) {
      return true; // Fallback open on Redis error
    }

    const currentCount = results[0][1] as number;

    if (currentCount > limit) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Admin rate limit exceeded (60 req/min)',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
