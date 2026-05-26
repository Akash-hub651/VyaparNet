import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { GlobalExceptionFilter } from '../src/shared/filters/global-exception.filter';
import { RequestIdInterceptor } from '../src/shared/interceptors/request-id.interceptor';

/**
 * Health endpoint integration tests.
 *
 * Sprint 0 first test:
 * - /health → 200 with correct shape
 * - /health/ready → 200 when DB + Redis healthy
 * - /health/ready → 503 when DB is unavailable
 *
 * Authority: VyaparNet_Deployment_Runtime_Architecture_v1.md Section 12.2
 */
describe('Health Endpoints', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/ready'] });
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalInterceptors(new RequestIdInterceptor());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /health', () => {
    it('returns 200 with status ok', async () => {
      const response = await request(app.getHttpServer())
        .get('/health')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'ok',
        timestamp: expect.any(String),
        uptime: expect.any(Number),
      });
    });

    it('includes X-Request-Id in response headers', async () => {
      const response = await request(app.getHttpServer())
        .get('/health')
        .expect(200);

      expect(response.headers['x-request-id']).toBeDefined();
      expect(typeof response.headers['x-request-id']).toBe('string');
    });

    it('reflects provided X-Request-Id header', async () => {
      const testRequestId = 'test-request-id-12345';
      const response = await request(app.getHttpServer())
        .get('/health')
        .set('X-Request-Id', testRequestId)
        .expect(200);

      expect(response.headers['x-request-id']).toBe(testRequestId);
    });
  });

  describe('GET /health/ready', () => {
    it('returns 200 when database and redis are connected', async () => {
      const response = await request(app.getHttpServer())
        .get('/health/ready')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'ready',
        timestamp: expect.any(String),
        checks: {
          database: 'healthy',
          redis: 'healthy',
        },
      });
    });

    it('returns 503 with standard error envelope when a dependency is unhealthy', async () => {
      // Create isolated module with a broken PrismaService
      const { PrismaService } =
        await import('../src/core/prisma/prisma.service');
      const brokenModule: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      })
        .overrideProvider(PrismaService)
        .useValue({
          $queryRaw: async () => {
            throw new Error('DB connection refused');
          },
        })
        .compile();

      const brokenApp = brokenModule.createNestApplication();
      brokenApp.setGlobalPrefix('api/v1', {
        exclude: ['health', 'health/ready'],
      });
      brokenApp.useGlobalFilters(new GlobalExceptionFilter());
      brokenApp.useGlobalInterceptors(new RequestIdInterceptor());
      await brokenApp.init();

      const response = await request(brokenApp.getHttpServer())
        .get('/health/ready')
        .expect(503);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: expect.any(String),
          details: {
            checks: {
              database: 'unhealthy',
            },
          },
        },
        requestId: expect.any(String),
      });

      await brokenApp.close();
    });
  });

  describe('Error response format', () => {
    it('returns standard error envelope for 404', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/nonexistent-route')
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: expect.any(String),
          message: expect.any(String),
        },
        requestId: expect.any(String),
      });
    });
  });
});
