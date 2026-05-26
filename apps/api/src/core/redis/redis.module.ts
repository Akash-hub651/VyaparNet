import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';
import { RedisHealthService } from '../../shared/redis/redis-health.service';

@Global()
@Module({
  providers: [RedisService, RedisHealthService],
  exports: [RedisService, RedisHealthService],
})
export class RedisModule {}
