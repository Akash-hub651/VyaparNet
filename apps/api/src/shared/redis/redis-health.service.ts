import { Injectable } from '@nestjs/common';
import { RedisService } from '../../core/redis/redis.service';

@Injectable()
export class RedisHealthService {
  constructor(private readonly redis: RedisService) {}

  async isHealthy(): Promise<boolean> {
    try {
      const result = await this.redis.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }
}
