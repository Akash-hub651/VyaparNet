import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { z } from 'zod';
import { RedisService } from '../../../core/redis/redis.service';

@Injectable()
export class AdminIdempotencyGuard implements CanActivate {
  constructor(private readonly redis: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const key = request.headers['idempotency-key'];

    if (!key) {
      throw new UnprocessableEntityException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Idempotency-Key header is required for this operation',
      });
    }

    const uuidSchema = z.string().uuid();
    if (!uuidSchema.safeParse(key).success) {
      throw new UnprocessableEntityException({
        code: 'INVALID_IDEMPOTENCY_KEY',
        message: 'Idempotency-Key must be a valid UUID',
      });
    }

    const cached = await this.redis.getJson(`admin-idem:${key}`);
    if (cached) {
      // INV-S7-7: Duplicate key → 200 with original result.
      throw new HttpException(cached, 200);
    }

    // Attach key to request for the service to cache the response later
    request.idempotencyKey = key;
    return true;
  }
}
