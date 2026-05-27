import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { AppConfig } from '../config/config.schema';

/**
 * RedisService — singleton ioredis client for the API.
 *
 * Used for:
 * - OTP storage (Sprint 1)
 * - Session storage (Sprint 1)
 * - Rate limiting (Sprint 1)
 * - Cache (Sprint 2+)
 * - BullMQ queue backend (registered separately in BullMQModule)
 * - Distributed locks (Sprint 3)
 * - Feature flag cache (Sprint 7)
 *
 * Authority: LOCKED_DECISIONS.md (Redis, ioredis)
 */
@Injectable()
export class RedisService
  extends Redis
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(RedisService.name);

  constructor(configService: ConfigService<AppConfig, true>) {
    super({
      host: configService.get('REDIS_HOST'),
      port: configService.get('REDIS_PORT'),
      password: configService.get('REDIS_PASSWORD') || undefined,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
      retryStrategy(times) {
        return Math.min(times * 100, 3000);
      },
      reconnectOnError(err) {
        const targetError = 'READONLY';
        if (err.message.slice(0, targetError.length) === targetError) {
          return true;
        }
        return false;
      },
    });

    this.on('error', (err: Error) => {
      this.logger.error('Redis connection error', err.message);
    });

    this.on('ready', () => {
      this.logger.log('Redis connected and ready.');
    });

    this.on('reconnecting', () => {
      this.logger.warn('Redis reconnecting...');
    });
  }

  async onModuleInit(): Promise<void> {
    this.logger.log('Connecting to Redis...');
    await this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Disconnecting from Redis...');
    await this.quit();
    this.logger.log('Redis disconnected.');
  }

  /**
   * Convenience method: Set a key with TTL in seconds.
   * Standard pattern for all cache operations.
   */
  async setWithTtl(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<void> {
    await this.setex(key, ttlSeconds, value);
  }

  /**
   * Convenience method: Get a JSON-serialized value.
   */
  async getJson<T>(key: string): Promise<T | null> {
    const value = await this.get(key);
    if (!value) return null;
    return JSON.parse(value) as T;
  }

  /**
   * Convenience method: Set a JSON-serializable value with TTL.
   */
  async setJson<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    await this.setex(key, ttlSeconds, JSON.stringify(value));
  }
}
