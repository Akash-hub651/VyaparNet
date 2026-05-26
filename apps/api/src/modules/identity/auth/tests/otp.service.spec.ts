import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { OtpService } from '../otp.service';
import { RedisService } from '../../../../core/redis/redis.service';

describe('OtpService', () => {
  let otpService: OtpService;
  let redisMock: Record<string, any>;

  beforeEach(async () => {
    redisMock = {
      get: vi.fn(),
      setex: vi.fn(),
      del: vi.fn(),
      incr: vi.fn(),
      expire: vi.fn(),
      ttl: vi.fn(),
      exists: vi.fn(),
      pipeline: vi.fn(() => ({
        setex: vi.fn().mockReturnThis(),
        incr: vi.fn().mockReturnThis(),
        expire: vi.fn().mockReturnThis(),
        del: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([[null, 1]]),
      })),
    };

    const module = await Test.createTestingModule({
      providers: [OtpService, { provide: RedisService, useValue: redisMock }],
    }).compile();

    otpService = module.get(OtpService);
  });

  // ─── Generation ───────────────────────────────────────────
  describe('generateOtp()', () => {
    it('generates a 6-digit string', () => {
      for (let i = 0; i < 100; i++) {
        const otp = otpService.generateOtp();
        expect(otp).toMatch(/^[0-9]{6}$/);
        expect(parseInt(otp)).toBeGreaterThanOrEqual(100000);
        expect(parseInt(otp)).toBeLessThanOrEqual(999999);
      }
    });

    it('generates different OTPs on successive calls (probabilistic)', () => {
      const otps = new Set(
        Array.from({ length: 20 }, () => otpService.generateOtp()),
      );
      expect(otps.size).toBeGreaterThan(1); // Should not all be the same
    });
  });

  // ─── Verification ─────────────────────────────────────────
  describe('verifyOtp()', () => {
    it('succeeds with correct OTP', async () => {
      const phone = '+919876543210';
      const otp = '123456';
      const payload = {
        otp,
        phone,
        createdAt: new Date().toISOString(),
        requestIpHash: 'abc',
      };

      vi.mocked(redisMock.ttl as ReturnType<typeof vi.fn>).mockResolvedValue(
        -1,
      ); // no lockout
      vi.mocked(redisMock.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        JSON.stringify(payload),
      );

      const result = await otpService.verifyOtp(phone, otp);
      expect(result.otp).toBe(otp);
      expect(result.phone).toBe(phone);
    });

    it('throws OTP_EXPIRED when Redis key does not exist', async () => {
      vi.mocked(redisMock.ttl as ReturnType<typeof vi.fn>).mockResolvedValue(
        -1,
      );
      vi.mocked(redisMock.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        null,
      );

      await expect(
        otpService.verifyOtp('+919876543210', '123456'),
      ).rejects.toThrow();
    });

    it('throws OTP_INVALID with incorrect OTP', async () => {
      const phone = '+919876543210';
      const payload = {
        otp: '999999',
        phone,
        createdAt: new Date().toISOString(),
        requestIpHash: 'abc',
      };

      vi.mocked(redisMock.ttl as ReturnType<typeof vi.fn>).mockResolvedValue(
        -1,
      );
      vi.mocked(redisMock.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        JSON.stringify(payload),
      );

      const pipelineResult = [[null, 1]]; // fail count = 1
      const pipeline = {
        incr: vi.fn().mockReturnThis(),
        expire: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue(pipelineResult),
      };
      vi.mocked(redisMock.pipeline as ReturnType<typeof vi.fn>).mockReturnValue(
        pipeline as any,
      );
      vi.mocked(redisMock.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        null,
      ); // failCount

      await expect(otpService.verifyOtp(phone, '111111')).rejects.toThrow();
    });

    it('throws ACCOUNT_LOCKED when lockout key exists', async () => {
      vi.mocked(redisMock.ttl as ReturnType<typeof vi.fn>).mockResolvedValue(
        850,
      ); // locked

      await expect(
        otpService.verifyOtp('+919876543210', '123456'),
      ).rejects.toThrow();
    });
  });

  // ─── Rate Limiting ─────────────────────────────────────────
  describe('checkAndEnforceSendRateLimits()', () => {
    it('throws RATE_LIMIT_PHONE when phone limit exceeded', async () => {
      vi.mocked(redisMock.ttl as ReturnType<typeof vi.fn>).mockResolvedValue(
        -1,
      ); // no lockout
      vi.mocked(redisMock.exists as ReturnType<typeof vi.fn>).mockResolvedValue(
        0,
      ); // no cooldown
      vi.mocked(redisMock.get as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce('3') // phone send count = 3 (at limit)
        .mockResolvedValueOnce('0'); // IP send count

      await expect(
        otpService.checkAndEnforceSendRateLimits('+919876543210', '1.2.3.4'),
      ).rejects.toThrow();
    });

    it('passes when limits not exceeded', async () => {
      vi.mocked(redisMock.ttl as ReturnType<typeof vi.fn>).mockResolvedValue(
        -1,
      );
      vi.mocked(redisMock.exists as ReturnType<typeof vi.fn>).mockResolvedValue(
        0,
      );
      vi.mocked(redisMock.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        null,
      );

      await expect(
        otpService.checkAndEnforceSendRateLimits('+919876543210', '1.2.3.4'),
      ).resolves.toBeUndefined();
    });
  });

  // ─── Phone Masking ─────────────────────────────────────────
  describe('maskPhone()', () => {
    it('masks middle digits of phone number', () => {
      const masked = otpService.maskPhone('+919876543210');
      expect(masked).toBe('+91XXXXXX3210');
      expect(masked).not.toContain('9876');
    });
  });
});
