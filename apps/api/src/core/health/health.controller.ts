import {
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

/**
 * Health Check Controller
 *
 * GET /health  — Liveness check (is the process alive?)
 * GET /health/ready — Readiness check (can it serve traffic?)
 *   Checks: PostgreSQL connection, Redis connection
 *
 * Used by:
 * - Docker health checks
 * - Load balancer health checks (ALB/Nginx)
 * - Kubernetes liveness/readiness probes (Phase 2)
 *
 * Authority: VyaparNet_Deployment_Runtime_Architecture_v1.md Section 12.2
 */
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Liveness check.
   * Returns 200 if the process is running.
   * Never fails unless the process itself is dead.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  health(): { status: string; timestamp: string; uptime: number } {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
    };
  }

  /**
   * Readiness check.
   * Returns 200 only if all dependencies are healthy.
   * Returns 503 if any dependency is unhealthy.
   * Used by load balancer to route traffic.
   */
  @Get('ready')
  async ready(): Promise<{
    status: string;
    timestamp: string;
    checks: { database: string; redis: string };
  }> {
    const checks = {
      database: 'healthy',
      redis: 'healthy',
    };

    // Check PostgreSQL
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      checks.database = 'unhealthy';
    }

    // Check Redis
    try {
      const pong = await this.redis.ping();
      if (pong !== 'PONG') {
        checks.redis = 'unhealthy';
      }
    } catch {
      checks.redis = 'unhealthy';
    }

    const allHealthy = Object.values(checks).every((v) => v === 'healthy');

    if (!allHealthy) {
      // Throw HttpException so GlobalExceptionFilter correctly returns 503.
      // Authority: VyaparNet_Deployment_Runtime_Architecture_v1.md Section 12.2
      throw new HttpException(
        {
          code: 'SERVICE_UNAVAILABLE',
          message: 'One or more dependencies are unhealthy',
          details: { checks },
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    return {
      status: 'ready',
      timestamp: new Date().toISOString(),
      checks,
    };
  }
}
