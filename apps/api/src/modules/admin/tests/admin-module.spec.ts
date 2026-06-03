import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { RedisService } from '../../../core/redis/redis.service';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { UserRole } from '@vyaparnet/types';
import { AdminBusinessesController } from '../controllers/admin-business.controller';
import { AdminContextGuard } from '../guards/admin-context.guard';
import { AdminIdempotencyGuard } from '../guards/admin-idempotency.guard';
import { AdminRateLimitGuard } from '../guards/admin-rate-limit.guard';
import { AdminKycService } from '../services/admin-kyc.service';

/**
 * Phase 2 + Phase 3 validation gate — AdminModule integration.
 *
 * Tests guard behavior (AdminContextGuard, AdminIdempotencyGuard, AdminRateLimitGuard).
 * AdminKycService is mocked — we test the HTTP layer, not business logic.
 */
describe('AdminModule Integration — Guard Validation Gate', () => {
  let app: INestApplication;
  let redisService: unknown;
  let mockUser: unknown;
  let mockKycService: unknown;

  beforeEach(async () => {
    // Default to a valid admin user
    mockUser = { id: 'admin-123', role: UserRole.ADMIN };

    redisService = {
      getJson: vi.fn(),
      multi: vi.fn().mockReturnValue({
        incr: vi.fn().mockReturnThis(),
        expire: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([
          [null, 1],
          [null, 1],
        ]), // count = 1 (under rate limit)
      }),
    };

    // Mock AdminKycService — we test guards, not business logic
    mockKycService = {
      getBusinessList: vi
        .fn()
        .mockResolvedValue({ data: [], nextCursor: null, hasMore: false }),
      getBusinessDetail: vi
        .fn()
        .mockResolvedValue({ business: {}, kycDocs: [], signedUrls: {} }),
      verifyBusiness: vi
        .fn()
        .mockResolvedValue({ id: 'biz-1', kycStatus: 'VERIFIED' }),
      rejectBusiness: vi
        .fn()
        .mockResolvedValue({ id: 'biz-1', kycStatus: 'REJECTED' }),
      suspendBusiness: vi
        .fn()
        .mockResolvedValue({ id: 'biz-1', kycStatus: 'SUSPENDED' }),
      reactivateBusiness: vi
        .fn()
        .mockResolvedValue({ id: 'biz-1', kycStatus: 'VERIFIED' }),
    };

    // Override JwtAuthGuard to return our mockUser
    const mockJwtAuthGuard = {
      canActivate: vi.fn((context) => {
        if (mockUser) {
          const req = context.switchToHttp().getRequest();
          req.user = mockUser;
          return true;
        }
        return false;
      }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AdminBusinessesController],
      providers: [
        AdminContextGuard,
        AdminIdempotencyGuard,
        AdminRateLimitGuard,
        { provide: RedisService, useValue: redisService },
        { provide: AdminKycService, useValue: mockKycService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockJwtAuthGuard)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /admin/businesses → 403 without admin JWT (AdminContextGuard working)', async () => {
    // Set user to BUYER
    mockUser = { id: 'buyer-123', role: UserRole.BUYER };

    const response = await request(app.getHttpServer()).get(
      '/admin/businesses',
    );
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('ADMIN_ACCESS_REQUIRED');
  });

  it('GET /admin/businesses → 200 with admin JWT', async () => {
    // User is ADMIN by default in beforeEach
    const response = await request(app.getHttpServer()).get(
      '/admin/businesses',
    );
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('data');
  });

  it('PATCH /admin/businesses/:id/verify without Idempotency-Key → 422', async () => {
    const response = await request(app.getHttpServer()).patch(
      '/admin/businesses/biz-1/verify',
    );
    expect(response.status).toBe(422);
    expect(response.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('PATCH /admin/businesses/:id/verify with invalid UUID Idempotency-Key → 422', async () => {
    const response = await request(app.getHttpServer())
      .patch('/admin/businesses/biz-1/verify')
      .set('Idempotency-Key', 'invalid-key');
    expect(response.status).toBe(422);
    expect(response.body.code).toBe('INVALID_IDEMPOTENCY_KEY');
  });

  it('PATCH /admin/businesses/:id/verify with valid Idempotency-Key → 200', async () => {
    const validUuid = '123e4567-e89b-12d3-a456-426614174000';
    redisService.getJson.mockResolvedValueOnce(null); // No cache

    const response = await request(app.getHttpServer())
      .patch('/admin/businesses/biz-1/verify')
      .set('Idempotency-Key', validUuid);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('business');
  });

  it('H-P1-3: 60 requests in 60s from same JWT → 429 (rate limit is PER ADMIN)', async () => {
    // Mock the redis multi exec to return 61 requests
    redisService.multi.mockReturnValueOnce({
      incr: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([
        [null, 61],
        [null, 1],
      ]), // count = 61
    });

    const response = await request(app.getHttpServer()).get(
      '/admin/businesses',
    );
    expect(response.status).toBe(429); // TOO_MANY_REQUESTS
    expect(response.body.message).toContain('60 req/min');
  });
});
