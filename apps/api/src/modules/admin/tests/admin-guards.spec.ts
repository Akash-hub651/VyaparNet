import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdminContextGuard } from '../guards/admin-context.guard';
import { AdminIdempotencyGuard } from '../guards/admin-idempotency.guard';
import { AdminRateLimitGuard } from '../guards/admin-rate-limit.guard';
import {
  ForbiddenException,
  UnprocessableEntityException,
  HttpException,
} from '@nestjs/common';
import { UserRole } from '@vyaparnet/types';

describe('AdminContextGuard (INV-S7-1)', () => {
  let guard: AdminContextGuard;

  beforeEach(() => {
    guard = new AdminContextGuard();
  });

  const mockContext = (user: unknown) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    }) as any;

  it('allows access for ADMIN role', () => {
    const context = mockContext({ id: 'admin1', role: UserRole.ADMIN });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('throws ForbiddenException for BUYER role', () => {
    const context = mockContext({ id: 'buyer1', role: UserRole.BUYER });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException for SELLER role', () => {
    const context = mockContext({ id: 'seller1', role: UserRole.SELLER });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException if no user in request', () => {
    const context = mockContext(undefined);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});

describe('AdminIdempotencyGuard (INV-S7-7)', () => {
  let guard: AdminIdempotencyGuard;
  let redisService: unknown;

  beforeEach(() => {
    redisService = {
      getJson: vi.fn(),
    };
    guard = new AdminIdempotencyGuard(redisService);
  });

  const mockContext = (headers: unknown) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ headers }),
      }),
    }) as any;

  it('throws UnprocessableEntityException if missing Idempotency-Key header', async () => {
    const context = mockContext({});
    await expect(guard.canActivate(context)).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it('throws UnprocessableEntityException if Idempotency-Key is not UUID', async () => {
    const context = mockContext({ 'idempotency-key': 'not-a-uuid' });
    await expect(guard.canActivate(context)).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it('allows access and attaches key to request if valid UUID and no cache', async () => {
    const uuid = '123e4567-e89b-12d3-a456-426614174000';
    const request = { headers: { 'idempotency-key': uuid } };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as any;

    redisService.getJson.mockResolvedValueOnce(null);

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
    expect((request as any).idempotencyKey).toBe(uuid);
  });

  it('throws HttpException with 200 status and cached payload if cache hit', async () => {
    const uuid = '123e4567-e89b-12d3-a456-426614174000';
    const context = mockContext({ 'idempotency-key': uuid });

    const cachedResponse = { id: 'cached-123' };
    redisService.getJson.mockResolvedValueOnce(cachedResponse);

    try {
      await guard.canActivate(context);
      expect.fail('Should have thrown HttpException');
    } catch (e: unknown) {
      expect(e).toBeInstanceOf(HttpException);
      expect(e.getStatus()).toBe(200);
      expect(e.getResponse()).toEqual(cachedResponse);
    }
  });
});

describe('AdminRateLimitGuard (H-P1-3)', () => {
  let guard: AdminRateLimitGuard;
  let redisService: unknown;

  beforeEach(() => {
    redisService = {
      multi: vi.fn().mockReturnValue({
        incr: vi.fn(),
        expire: vi.fn(),
        exec: vi.fn(),
      }),
    };
    guard = new AdminRateLimitGuard(redisService);
  });

  const mockContext = (user: unknown) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    }) as any;

  it('allows access if under limit (e.g. 5 requests)', async () => {
    const context = mockContext({ id: 'admin1', role: UserRole.ADMIN });
    redisService.multi().exec.mockResolvedValueOnce([
      [null, 5],
      [null, 1],
    ]);

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('throws HttpException (429) if over limit (e.g. 61 requests)', async () => {
    const context = mockContext({ id: 'admin1', role: UserRole.ADMIN });
    redisService.multi().exec.mockResolvedValueOnce([
      [null, 61],
      [null, 1],
    ]);

    try {
      await guard.canActivate(context);
      expect.fail('Should have thrown HttpException');
    } catch (e: unknown) {
      expect(e).toBeInstanceOf(HttpException);
      expect(e.getStatus()).toBe(429); // TOO_MANY_REQUESTS
    }
  });

  it('falls back open if no user (should be blocked by ContextGuard anyway)', async () => {
    const context = mockContext(undefined);
    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('falls back open on Redis error', async () => {
    const context = mockContext({ id: 'admin1', role: UserRole.ADMIN });
    redisService.multi().exec.mockResolvedValueOnce(null);

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });
});
