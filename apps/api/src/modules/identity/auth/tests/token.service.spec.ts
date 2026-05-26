import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { TokenService } from '../token.service';
import { RedisService } from '../../../../core/redis/redis.service';
import { ConfigService } from '@nestjs/config';
import { UserRole, Segment } from '@vyaparnet/types';

describe('TokenService', () => {
  let tokenService: TokenService;

  const jwtServiceMock = {
    sign: vi.fn().mockReturnValue('mock.jwt.token'),
    verify: vi.fn().mockReturnValue({
      sub: 'user-123',
      role: UserRole.BUYER,
      segment: Segment.SPARE_PARTS,
      jti: 'jti-123',
    }),
  };

  const redisMock = {
    setex: vi.fn().mockResolvedValue('OK'),
    get: vi.fn().mockResolvedValue('session-id'),
    del: vi.fn().mockResolvedValue(1),
  };

  const configMock = {
    get: vi.fn().mockReturnValue('test-secret-value'),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        TokenService,
        { provide: JwtService, useValue: jwtServiceMock },
        { provide: RedisService, useValue: redisMock },
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();

    tokenService = module.get(TokenService);
  });

  describe('generateAccessToken()', () => {
    it('calls jwtService.sign with correct params', () => {
      const token = tokenService.generateAccessToken({
        sub: 'user-123',
        role: UserRole.BUYER,
        segment: Segment.SPARE_PARTS,
        tokenVersion: 1,
      });
      expect(jwtServiceMock.sign).toHaveBeenCalled();
      expect(token).toBe('mock.jwt.token');
    });
  });

  describe('verifyAccessToken()', () => {
    it('returns payload for valid token', () => {
      const payload = tokenService.verifyAccessToken('valid.token');
      expect(payload.sub).toBe('user-123');
      expect(payload.role).toBe(UserRole.BUYER);
    });

    it('throws UnauthorizedException for invalid token', () => {
      vi.mocked(jwtServiceMock.verify).mockImplementationOnce(() => {
        throw new Error('invalid signature');
      });
      expect(() => tokenService.verifyAccessToken('bad.token')).toThrow();
    });
  });

  describe('generateRawRefreshToken()', () => {
    it('generates a UUID-format string', () => {
      const token = tokenService.generateRawRefreshToken();
      expect(token).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    it('generates different tokens on each call', () => {
      const tokens = new Set(
        Array.from({ length: 10 }, () =>
          tokenService.generateRawRefreshToken(),
        ),
      );
      expect(tokens.size).toBe(10);
    });
  });

  describe('hashRefreshToken()', () => {
    it('returns an argon2 hash string', async () => {
      const hash = await tokenService.hashRefreshToken('my-raw-token');
      expect(hash).toMatch(/^\$argon2id\$/);
      expect(hash).not.toBe('my-raw-token');
    });

    it('generates different hashes for same input (salt)', async () => {
      const hash1 = await tokenService.hashRefreshToken('same-input');
      const hash2 = await tokenService.hashRefreshToken('same-input');
      expect(hash1).not.toBe(hash2); // argon2 uses salt
    });
  });

  describe('storeRefreshTokenInRedis()', () => {
    it('calls redis.setex with correct TTL', async () => {
      await tokenService.storeRefreshTokenInRedis('raw-token', 'session-id');
      expect(redisMock.setex).toHaveBeenCalledWith(
        expect.stringContaining('raw-token'),
        TokenService.REFRESH_TOKEN_TTL_SECONDS,
        'session-id',
      );
    });
  });
});
