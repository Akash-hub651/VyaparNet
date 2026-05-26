import {
  Injectable,
  BadRequestException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { RedisService } from '../../../core/redis/redis.service';

/**
 * OtpService — manages OTP generation, storage, verification,
 * rate limiting, and account lockout.
 *
 * Security properties:
 * - OTP generated with crypto.randomInt (CSPRNG)
 * - OTP stored in Redis ONLY (never in DB)
 * - Rate limited: 3 sends per 5min per phone, 50 sends per 5min per IP
 * - Lockout: 5 failed verifications → 15min block
 * - Constant-time comparison via crypto.timingSafeEqual
 *
 * Authority: VyaparNet_Workflow_Sequence_Diagrams_v1.md Section 1.1
 */

// ─── Redis Key Builders ───────────────────────────────────────
export const OtpKeys = {
  otp: (phone: string) => `otp:${phone}`,
  sendCount: (phone: string) => `otp_send:${phone}`,
  sendCountIp: (hashedIp: string) => `otp_send:ip:${hashedIp}`,
  failCount: (phone: string) => `otp_fail:${phone}`,
  resendCooldown: (phone: string) => `otp_resend_cooldown:${phone}`,
  lock: (phone: string) => `otp_lock:${phone}`,
} as const;

export interface OtpPayload {
  otp: string;
  phone: string;
  createdAt: string;
  requestIpHash: string;
}

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  // Rate limit constants (from VyaparNet_Deployment_Runtime_Architecture_v1.md Section 14)
  private static readonly OTP_TTL_SECONDS = 300; // 5 min
  private static readonly MAX_SENDS_PER_PHONE = 3; // per 5 min
  private static readonly MAX_SENDS_PER_IP = 5; // per 5 min
  private static readonly MAX_FAILS_BEFORE_LOCK = 5; // per 10 min
  private static readonly FAIL_WINDOW_SECONDS = 600; // 10 min
  private static readonly LOCK_TTL_SECONDS = 900; // 15 min
  private static readonly RESEND_COOLDOWN_SECONDS = 30; // 30 sec

  constructor(private readonly redis: RedisService) {}

  /**
   * Generate a cryptographically secure 6-digit OTP.
   * Uses crypto.randomInt for CSPRNG — NOT Math.random.
   */
  generateOtp(): string {
    return crypto.randomInt(100000, 1000000).toString().padStart(6, '0');
  }

  /**
   * Hash an IP address for privacy-preserving storage.
   * We never store raw IPs in Redis keys.
   */
  hashIp(ip: string): string {
    return crypto
      .createHash('sha256')
      .update(ip + 'vyaparnet-ip-salt')
      .digest('hex')
      .slice(0, 32);
  }

  /**
   * Mask a phone number for logging.
   * Example: +919876543210 → +91XXXXXX3210
   */
  maskPhone(phone: string): string {
    return phone.slice(0, 3) + 'XXXXXX' + phone.slice(-4);
  }

  /**
   * Check if phone is locked out.
   * @returns lockout remaining TTL in seconds, or 0 if not locked
   */
  async getLockoutTtl(phone: string): Promise<number> {
    const ttl = await this.redis.ttl(OtpKeys.lock(phone));
    return ttl > 0 ? ttl : 0;
  }

  /**
   * Enforce rate limits before sending OTP.
   * Throws TooManyRequestsException if any limit is exceeded.
   */
  async checkAndEnforceSendRateLimits(
    phone: string,
    ip: string,
  ): Promise<void> {
    const hashedIp = this.hashIp(ip);

    // Check lockout
    const lockTtl = await this.getLockoutTtl(phone);
    if (lockTtl > 0) {
      throw new HttpException(
        {
          code: 'ACCOUNT_LOCKED',
          message: `Account temporarily locked. Retry after ${Math.ceil(lockTtl / 60)} minutes.`,
          details: { retryAfterSeconds: lockTtl },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Check resend cooldown
    const cooldownExists = await this.redis.exists(
      OtpKeys.resendCooldown(phone),
    );
    if (cooldownExists) {
      const cooldownTtl = await this.redis.ttl(OtpKeys.resendCooldown(phone));
      throw new HttpException(
        {
          code: 'RESEND_COOLDOWN',
          message: `Wait ${cooldownTtl} seconds before requesting another OTP.`,
          details: { retryAfterSeconds: cooldownTtl },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Check per-phone send rate
    const phoneSendCount = await this.redis.get(OtpKeys.sendCount(phone));
    if (
      phoneSendCount &&
      parseInt(phoneSendCount) >= OtpService.MAX_SENDS_PER_PHONE
    ) {
      throw new HttpException(
        {
          code: 'RATE_LIMIT_PHONE',
          message: 'Too many OTP requests. Try again in 5 minutes.',
          details: { retryAfterSeconds: OtpService.OTP_TTL_SECONDS },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Check per-IP send rate
    const ipSendCount = await this.redis.get(OtpKeys.sendCountIp(hashedIp));
    if (ipSendCount && parseInt(ipSendCount) >= OtpService.MAX_SENDS_PER_IP) {
      throw new HttpException(
        {
          code: 'RATE_LIMIT_IP',
          message: 'Too many requests from this location.',
          details: { retryAfterSeconds: OtpService.OTP_TTL_SECONDS },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /**
   * Store OTP in Redis and increment rate limit counters.
   */
  async storeOtpAndIncrementCounters(
    phone: string,
    otp: string,
    ip: string,
  ): Promise<void> {
    const hashedIp = this.hashIp(ip);
    const payload: OtpPayload = {
      otp,
      phone,
      createdAt: new Date().toISOString(),
      requestIpHash: hashedIp,
    };

    // Use Redis pipeline for atomic operations
    const pipeline = this.redis.pipeline();
    pipeline.setex(
      OtpKeys.otp(phone),
      OtpService.OTP_TTL_SECONDS,
      JSON.stringify(payload),
    );
    pipeline.incr(OtpKeys.sendCount(phone));
    pipeline.expire(OtpKeys.sendCount(phone), OtpService.OTP_TTL_SECONDS);
    pipeline.incr(OtpKeys.sendCountIp(hashedIp));
    pipeline.expire(OtpKeys.sendCountIp(hashedIp), OtpService.OTP_TTL_SECONDS);
    pipeline.setex(
      OtpKeys.resendCooldown(phone),
      OtpService.RESEND_COOLDOWN_SECONDS,
      '1',
    );
    await pipeline.exec();

    this.logger.log(
      { phone: this.maskPhone(phone), ipHash: hashedIp.slice(0, 8) },
      'OTP stored in Redis',
    );
  }

  /**
   * Verify an OTP submitted by the user.
   *
   * Returns the stored OtpPayload on success.
   * Throws on failure (increments fail counter, triggers lockout if needed).
   *
   * SECURITY: Uses constant-time comparison to prevent timing attacks.
   */
  async verifyOtp(phone: string, submittedOtp: string): Promise<OtpPayload> {
    // Check lockout first
    const lockTtl = await this.getLockoutTtl(phone);
    if (lockTtl > 0) {
      throw new HttpException(
        {
          code: 'ACCOUNT_LOCKED',
          message: `Account locked. Retry after ${Math.ceil(lockTtl / 60)} minutes.`,
          details: { retryAfterSeconds: lockTtl },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Get stored OTP
    const storedRaw = await this.redis.get(OtpKeys.otp(phone));
    if (!storedRaw) {
      await this.handleVerifyFailure(phone);
      throw new BadRequestException({
        code: 'OTP_EXPIRED',
        message: 'OTP expired or not found. Please request a new OTP.',
      });
    }

    const payload: OtpPayload = JSON.parse(storedRaw) as OtpPayload;

    // Constant-time comparison (prevents timing attacks)
    const storedBuffer = Buffer.from(payload.otp, 'utf8');
    const submittedBuffer = Buffer.from(
      submittedOtp.padEnd(payload.otp.length, ' ').slice(0, payload.otp.length),
      'utf8',
    );

    if (
      storedBuffer.length !== submittedBuffer.length ||
      !crypto.timingSafeEqual(storedBuffer, submittedBuffer)
    ) {
      await this.handleVerifyFailure(phone);
      const failCount = await this.redis.get(OtpKeys.failCount(phone));
      const remaining = Math.max(
        0,
        OtpService.MAX_FAILS_BEFORE_LOCK - parseInt(failCount ?? '0'),
      );
      throw new BadRequestException({
        code: 'OTP_INVALID',
        message: `Incorrect OTP. ${remaining} attempt(s) remaining.`,
        details: { attemptsRemaining: remaining },
      });
    }

    // Success: clean up OTP and fail counter
    const pipeline = this.redis.pipeline();
    pipeline.del(OtpKeys.otp(phone));
    pipeline.del(OtpKeys.failCount(phone));
    await pipeline.exec();

    this.logger.log(
      { phone: this.maskPhone(phone) },
      'OTP verified successfully',
    );
    return payload;
  }

  /**
   * Handle OTP verification failure.
   * Increments fail counter. Triggers lockout if threshold reached.
   * Returns whether lockout was triggered.
   */
  async handleVerifyFailure(phone: string): Promise<boolean> {
    const pipeline = this.redis.pipeline();
    pipeline.incr(OtpKeys.failCount(phone));
    pipeline.expire(OtpKeys.failCount(phone), OtpService.FAIL_WINDOW_SECONDS);
    const results = await pipeline.exec();

    const failCount = (results?.[0]?.[1] as number) ?? 0;

    if (failCount >= OtpService.MAX_FAILS_BEFORE_LOCK) {
      await this.redis.setex(
        OtpKeys.lock(phone),
        OtpService.LOCK_TTL_SECONDS,
        Date.now().toString(),
      );
      this.logger.warn(
        { phone: this.maskPhone(phone), failCount },
        'OTP lockout triggered',
      );
      return true; // lockout triggered
    }

    return false;
  }

  /**
   * Cleanup: delete OTP and all rate limit keys for a phone.
   * Called after successful verification AND after lockout recovery.
   */
  async cleanupAfterSuccess(phone: string): Promise<void> {
    const pipeline = this.redis.pipeline();
    pipeline.del(OtpKeys.otp(phone));
    pipeline.del(OtpKeys.failCount(phone));
    pipeline.del(OtpKeys.sendCount(phone));
    pipeline.del(OtpKeys.resendCooldown(phone));
    await pipeline.exec();
  }
}
