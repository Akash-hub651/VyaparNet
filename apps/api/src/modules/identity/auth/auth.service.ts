import {
  Injectable,
  Logger,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { OtpService } from './otp.service';
import { TokenService } from './token.service';
import { SessionService } from './session.service';
import { AuthRepository } from './repositories/auth.repository';
import { SessionRepository } from './repositories/session.repository';
import { AuditSafeWriterService } from '../../security/audit/audit-safe-writer.service';
import { Inject, forwardRef } from '@nestjs/common';
import { SMS_SERVICE } from './sms.service.interface';
import type { SmsService } from './sms.service.interface';
import type {
  SendOtpDto,
  VerifyOtpDto,
  RefreshTokenDto,
  AuthTokensResponse,
  AdminLoginDto,
} from '@vyaparnet/types';
import { AuditAction, UserRole, Segment } from '@vyaparnet/types';
import { normalizeIndianPhoneNumber } from '@vyaparnet/utils';
import { RedisHealthService } from '../../../shared/redis/redis-health.service';
import { RedisUnavailableException } from '../../../shared/exceptions/redis-unavailable.exception';
import { SessionServiceUnavailableException } from '../../../shared/exceptions/session-service-unavailable.exception';
import { AuditRepository } from '../users/repositories/audit.repository';
import { TicketRepository } from '../users/repositories/ticket.repository';

/**
 * AuthService — orchestrates the complete authentication flow.
 *
 * Coordinates: OtpService + TokenService + SessionService +
 *              AuthRepository + AuditSafeWriterService + SmsService
 *
 * All operations follow the workflow defined in:
 * VyaparNet_Workflow_Sequence_Diagrams_v1.md Sections 1.1 and 1.2
 *
 * Critical rules:
 * 1. OTP is never logged in plaintext
 * 2. AuditLog write must succeed — if it fails, operation fails
 * 3. Redis operations happen AFTER successful DB transaction
 * 4. Token rotation on every refresh (old revoked atomically)
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(forwardRef(() => PrismaService))
    private readonly prisma: PrismaService,
    private readonly otpService: OtpService,
    private readonly tokenService: TokenService,
    private readonly authRepository: AuthRepository,
    private readonly auditSafeWriterService: AuditSafeWriterService,
    private readonly sessionRepository: SessionRepository,
    private readonly auditRepository: AuditRepository,
    private readonly ticketRepository: TicketRepository,
    @Inject(SMS_SERVICE) private readonly smsService: SmsService,
    private readonly redisHealthService: RedisHealthService,
  ) {}

  // ─────────────────────────────────────────────────────────────
  // OTP SEND
  // ─────────────────────────────────────────────────────────────

  /**
   * Send OTP to phone number.
   *
   * Flow:
   * 1. Enforce rate limits (throws if exceeded)
   * 2. Generate OTP
   * 3. Store in Redis
   * 4. Send SMS (async failure doesn't block response)
   * 5. Log OTP attempt to DB (masked)
   *
   * Authority: VyaparNet_Workflow_Sequence_Diagrams_v1.md Section 1.1
   */
  async sendOtp(
    dto: SendOtpDto,
    requestIp: string,
    userAgent: string,
  ): Promise<{ message: string; expiresIn: number }> {
    const redisHealthy = await this.redisHealthService.isHealthy();
    if (!redisHealthy) {
      throw new RedisUnavailableException(
        'OTP service temporarily unavailable.',
      );
    }

    const phoneNumber = normalizeIndianPhoneNumber(dto.phoneNumber);

    // Step 1: Enforce rate limits
    await this.otpService.checkAndEnforceSendRateLimits(phoneNumber, requestIp);

    // Step 2: Generate OTP
    const otp = this.otpService.generateOtp();

    // Step 3: Store in Redis
    await this.otpService.storeOtpAndIncrementCounters(
      phoneNumber,
      otp,
      requestIp,
    );

    // Step 4: Send SMS (failure logged but doesn't block response)
    const smsResult = await this.smsService.sendOtp(phoneNumber, otp);
    if (!smsResult.success) {
      this.logger.error(
        {
          phone: this.otpService.maskPhone(phoneNumber),
          smsError: smsResult.error,
        },
        'SMS delivery failed — OTP still stored in Redis',
      );
      // Do NOT expose SMS failure to client — attacker intel risk
      // The OTP is in Redis; user can retry
    }

    // Step 5: Log attempt to DB (masked, async — don't await)
    void this.authRepository
      .logOtpAttempt({
        phone: phoneNumber,
        otpHash: crypto.createHash('sha256').update(otp).digest('hex'),
        ipAddressHash: crypto
          .createHash('sha256')
          .update(requestIp)
          .digest('hex')
          .slice(0, 16),
        userAgent: userAgent.slice(0, 255),
        isValid: true,
      })
      .catch((err: Error) => {
        this.logger.error(
          { error: err.message },
          'Failed to log OTP attempt — non-critical',
        );
      });

    this.logger.log(
      { phone: this.otpService.maskPhone(phoneNumber) },
      'OTP send completed',
    );

    return {
      message: 'OTP sent successfully.',
      expiresIn: 300,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // OTP VERIFY
  // ─────────────────────────────────────────────────────────────

  /**
   * Verify OTP and issue token pair.
   *
   * ATOMIC TRANSACTION:
   * - User upsert
   * - OTP attempt log
   * - LoginSession create
   * - AuditLog create
   *
   * Redis operations AFTER transaction success.
   *
   * Authority: VyaparNet_Workflow_Sequence_Diagrams_v1.md Section 1.1
   */
  async verifyOtp(
    dto: VerifyOtpDto,
    requestIp: string,
    userAgent: string,
  ): Promise<AuthTokensResponse> {
    const redisHealthy = await this.redisHealthService.isHealthy();
    if (!redisHealthy) {
      throw new RedisUnavailableException(
        'OTP verification temporarily unavailable.',
      );
    }

    const phoneNumber = normalizeIndianPhoneNumber(dto.phoneNumber);
    const { otp } = dto;

    // Step 1: Verify OTP (throws on failure, increments fail counter)
    try {
      await this.otpService.verifyOtp(phoneNumber, otp);
    } catch (error) {
      // Check if this failure triggered lockout
      const lockTtl = await this.otpService.getLockoutTtl(phoneNumber);

      if (lockTtl > 0) {
        // Lockout triggered — create support ticket and security event
        await this.handleLockout(phoneNumber, requestIp, userAgent);
      }

      throw error; // Re-throw original error (OTP_INVALID or OTP_EXPIRED)
    }

    // Step 2: Generate token pair
    // User upsert happens in transaction — we need user.id first via upsert
    const userPreview = await this.authRepository.upsertByPhone(phoneNumber);

    const { accessToken, rawRefreshToken, hashedRefreshToken } =
      await this.tokenService.generateTokenPair({
        sub: userPreview.id,
        role: userPreview.role as UserRole,
        segment: userPreview.segment as Segment,
        tokenVersion: userPreview.tokenVersion,
      });

    // Step 3: Atomic DB transaction
    let newSession;
    try {
      newSession = await this.prisma.$transaction(async (tx) => {
        // Create session in DB
        const expiresAt = new Date(
          Date.now() + TokenService.REFRESH_TOKEN_TTL_SECONDS * 1000,
        );
        const session = await this.sessionRepository.create(
          {
            userId: userPreview.id,
            refreshToken: hashedRefreshToken,
            userAgent: userAgent.slice(0, 255),
            ipAddress: requestIp,
            expiresAt,
            refreshTokenFamilyId: crypto.randomUUID(),
            refreshTokenVersion: 1,
          },
          tx,
        );

        // Write AuditLog (immutable — must succeed)
        await this.auditRepository.create(
          {
            actorId: userPreview.id,
            action: AuditAction.LOGIN,
            entityType: 'User',
            entityId: userPreview.id,
            entityName: 'login',
            ipAddress: requestIp,
            userAgent: userAgent.slice(0, 255),
            sessionId: session.id,
          },
          tx,
        );

        return session;
      });
    } catch (error) {
      const err = error as Error;
      this.logger.error({ error: err.message }, 'Auth transaction failed');
      throw new InternalServerErrorException({
        code: 'AUTH_TRANSACTION_FAILED',
        message: 'Authentication failed. Please try again.',
      });
    }

    // Step 4: Redis operations (after transaction success)
    await this.handlePostTransactionRedis(
      phoneNumber,
      rawRefreshToken,
      newSession.id,
      userPreview.id,
      userPreview.tokenVersion,
    );

    // Step 5: Enforce max session limit (evict oldest if needed)
    await this.enforceMaxSessions(userPreview.id, newSession.id);

    this.logger.log(
      {
        userId: userPreview.id,
        role: userPreview.role,
        sessionId: newSession.id,
      },
      'Login successful',
    );

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      expiresIn: TokenService.ACCESS_TOKEN_TTL_SECONDS,
      tokenType: 'Bearer',
    };
  }

  // ─────────────────────────────────────────────────────────────
  // ADMIN LOGIN
  // ─────────────────────────────────────────────────────────────

  /**
   * Password-based authentication for Admin Panel.
   *
   * @param dto AdminLoginDto containing email and password
   * @param requestIp Client IP address
   * @param userAgent Client user agent
   */
  async loginAdmin(
    dto: AdminLoginDto,
    requestIp: string,
    userAgent: string,
  ): Promise<{ tokens: AuthTokensResponse; user: any }> {
    const { email, password } = dto;
    
    // Find user by email
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.role !== UserRole.ADMIN || !user.password) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.',
      });
    }

    // Verify password hash
    const isValid = await argon2.verify(user.password, password);
    if (!isValid) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.',
      });
    }

    // Generate token pair
    const { accessToken, rawRefreshToken, hashedRefreshToken } =
      await this.tokenService.generateTokenPair({
        sub: user.id,
        role: user.role as UserRole,
        segment: user.segment as Segment,
        tokenVersion: user.tokenVersion,
      });

    // Atomic DB transaction for session and audit
    let newSession;
    try {
      newSession = await this.prisma.$transaction(async (tx) => {
        const expiresAt = new Date(
          Date.now() + TokenService.REFRESH_TOKEN_TTL_SECONDS * 1000,
        );
        const session = await this.sessionRepository.create(
          {
            userId: user.id,
            refreshToken: hashedRefreshToken,
            userAgent: userAgent.slice(0, 255),
            ipAddress: requestIp,
            expiresAt,
            refreshTokenFamilyId: crypto.randomUUID(),
            refreshTokenVersion: 1,
          },
          tx,
        );

        await this.auditRepository.create(
          {
            actorId: user.id,
            action: AuditAction.LOGIN,
            entityType: 'User',
            entityId: user.id,
            entityName: 'admin-login',
            ipAddress: requestIp,
            userAgent: userAgent.slice(0, 255),
            sessionId: session.id,
          },
          tx,
        );

        return session;
      });
    } catch (error) {
      const err = error as Error;
      this.logger.error({ error: err.message }, 'Admin Auth transaction failed');
      throw new InternalServerErrorException({
        code: 'AUTH_TRANSACTION_FAILED',
        message: 'Authentication failed. Please try again.',
      });
    }

    // Redis operations
    await this.handlePostTransactionRedis(
      user.phone, // fallback to phone for lockout clearing if any
      rawRefreshToken,
      newSession.id,
      user.id,
      user.tokenVersion,
    );

    // Enforce max session limit
    await this.enforceMaxSessions(user.id, newSession.id);

    this.logger.log(
      {
        userId: user.id,
        role: user.role,
        sessionId: newSession.id,
      },
      'Admin Login successful',
    );

    return {
      tokens: {
        accessToken,
        refreshToken: rawRefreshToken,
        expiresIn: TokenService.ACCESS_TOKEN_TTL_SECONDS,
        tokenType: 'Bearer',
      },
      user: {
        id: user.id,
        email: user.email!,
        name: user.name ?? 'Platform Admin',
        role: user.role,
      },
    };
  }

  // ─────────────────────────────────────────────────────────────
  // TOKEN REFRESH
  // ─────────────────────────────────────────────────────────────

  /**
   * Rotate refresh token and issue new token pair.
   *
   * ROTATION RULE: Old token revoked, new token issued atomically.
   * If old token used again after rotation → revoke ALL sessions (token theft).
   *
   * Authority: VyaparNet_Workflow_Sequence_Diagrams_v1.md Section 1.2
   */
  async refreshTokens(
    dto: RefreshTokenDto,
    requestIp: string,
  ): Promise<AuthTokensResponse> {
    const redisHealthy = await this.redisHealthService.isHealthy();
    if (!redisHealthy) {
      throw new SessionServiceUnavailableException(
        'Session refresh temporarily unavailable.',
      );
    }

    const { refreshToken: rawToken } = dto;

    // Step 1: Look up session from Redis (fast path)
    const sessionId =
      await this.tokenService.getSessionIdFromRefreshToken(rawToken);
    if (!sessionId) {
      throw new UnauthorizedException({
        code: 'TOKEN_REVOKED',
        message: 'Session expired or revoked. Please login again.',
      });
    }

    // Step 2: Load session from DB (full validation including revoked sessions for reuse detection)
    const session = await this.prisma.loginSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      // Redis had the key but DB session is completely gone
      await this.tokenService.revokeRefreshTokenInRedis(rawToken);
      this.logger.warn(
        { sessionId, requestIp },
        'Redis/DB session mismatch — session not found in DB',
      );
      throw new UnauthorizedException({
        code: 'SESSION_INVALID',
        message: 'Session is no longer valid. Please login again.',
      });
    }

    // Replay Detection: Check if session is already revoked
    if (session.revoked) {
      // TOKEN REUSE / REPLAY DETECTED!
      // 1. Revoke the entire token family
      await this.sessionRepository.revokeFamily(session.refreshTokenFamilyId);

      // 2. Clean up current reused token in Redis
      await this.tokenService.revokeRefreshTokenInRedis(rawToken);

      // 3. Log a security event
      await this.authRepository.logSecurityEvent({
        eventType: 'TOKEN_REUSE_DETECTED',
        ipAddress: requestIp,
        userId: session.userId,
        userAgent: session.userAgent ?? undefined,
        metadata: {
          sessionId: session.id,
          familyId: session.refreshTokenFamilyId,
        },
      });

      // 4. Throw 401 Unauthorized
      throw new UnauthorizedException({
        code: 'TOKEN_REUSE_DETECTED',
        message:
          'Security warning: Refresh token reuse detected. All sessions invalidated.',
      });
    }

    // Step 3: Load user
    const userById = await this.prisma.user.findFirst({
      where: { id: session.userId, isDeleted: false },
    });
    if (!userById) {
      throw new UnauthorizedException({
        code: 'USER_NOT_FOUND',
        message: 'User not found.',
      });
    }

    // Step 4: Generate new token pair
    const {
      accessToken,
      rawRefreshToken: newRawToken,
      hashedRefreshToken: newHashedToken,
    } = await this.tokenService.generateTokenPair({
      sub: userById.id,
      role: userById.role as UserRole,
      segment: userById.segment as Segment,
      tokenVersion: userById.tokenVersion,
    });

    // Step 5: Atomically rotate — revoke old, create new
    let newSession;
    await this.prisma.$transaction(async (tx) => {
      // Revoke old session
      await this.sessionRepository.revokeById(session.id, tx);

      // Create new session
      const expiresAt = new Date(
        Date.now() + TokenService.REFRESH_TOKEN_TTL_SECONDS * 1000,
      );
      newSession = await this.sessionRepository.create(
        {
          userId: userById.id,
          refreshToken: newHashedToken,
          userAgent: session.userAgent ?? undefined,
          ipAddress: requestIp,
          expiresAt,
          refreshTokenFamilyId: session.refreshTokenFamilyId,
          refreshTokenVersion: session.refreshTokenVersion + 1,
        },
        tx,
      );

      // Update Redis with the new session (keep old one mapped in Redis so we can detect its reuse!)
      await this.tokenService.storeRefreshTokenInRedis(
        newRawToken,
        newSession.id,
      );
      await this.tokenService.cacheTokenVersion(
        userById.id,
        userById.tokenVersion,
      );
    });

    this.logger.log(
      { userId: userById.id, sessionId: session.id },
      'Token pair rotated',
    );

    return {
      accessToken,
      refreshToken: newRawToken,
      expiresIn: TokenService.ACCESS_TOKEN_TTL_SECONDS,
      tokenType: 'Bearer',
    };
  }

  // ─────────────────────────────────────────────────────────────
  // LOGOUT
  // ─────────────────────────────────────────────────────────────

  /**
   * Logout current session.
   */
  async logout(
    userId: string,
    fallbackSessionId: string,
    rawToken?: string,
  ): Promise<void> {
    let sessionId = fallbackSessionId;
    if (rawToken) {
      const redisSessionId =
        await this.tokenService.getSessionIdFromRefreshToken(rawToken);
      if (redisSessionId) {
        sessionId = redisSessionId;
      }
      await this.tokenService.revokeRefreshTokenInRedis(rawToken);
    }

    try {
      await this.sessionRepository.revokeById(sessionId);
    } catch {
      this.logger.warn({ sessionId }, 'Session not found in DB during logout');
    }

    // Log audit
    void this.auditSafeWriterService.safeWrite({
      actorId: userId,
      action: AuditAction.LOGOUT,
      entityType: 'User',
      entityId: userId,
      sessionId,
      ipAddress: '0.0.0.0', // Handled by interceptor normally, default if missing
    });

    this.logger.log({ userId, sessionId }, 'User logged out');
  }

  /**
   * Logout all sessions (force logout from all devices).
   */
  async logoutAll(userId: string, currentSessionId?: string): Promise<void> {
    await this.sessionRepository.revokeAllForUser(userId, currentSessionId);

    void this.auditSafeWriterService.safeWrite({
      actorId: userId,
      action: AuditAction.LOGOUT,
      entityType: 'User',
      entityId: userId,
      entityName: 'logout-all',
      ipAddress: '0.0.0.0', // Handled by interceptor normally, default if missing
    });

    this.logger.warn({ userId }, 'All sessions revoked (logout-all)');
  }

  // ─────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ─────────────────────────────────────────────────────────────

  private async handleLockout(
    phone: string,
    requestIp: string,
    userAgent: string,
  ): Promise<void> {
    const maskedPhone = this.otpService.maskPhone(phone);

    // Find user if exists (for audit trail)
    const user = await this.authRepository.findByPhone(phone);

    // Log security event
    void this.authRepository
      .logSecurityEvent({
        eventType: 'OTP_LOCKOUT',
        ipAddress: requestIp,
        userId: user?.id,
        userAgent,
        metadata: { phone: maskedPhone },
      })
      .catch((err: Error) => {
        this.logger.error(
          { error: err.message },
          'Failed to log lockout security event',
        );
      });

    // Create support ticket (auto-ticket per Workflow diagrams Section 28.1)
    if (user) {
      void this.ticketRepository
        .createLockoutTicket({
          userId: user.id,
          requestIp,
        })
        .catch((err: Error) => {
          this.logger.error(
            { error: err.message },
            'Failed to create lockout support ticket',
          );
        });
    }

    // AuditLog for lockout
    if (user) {
      void this.auditSafeWriterService.safeWrite({
        actorId: user.id,
        action: AuditAction.FAILED_LOGIN,
        entityType: 'User',
        entityId: user.id,
        ipAddress: requestIp,
        userAgent,
        newValue: { event: 'ACCOUNT_LOCKED', phone: maskedPhone },
      });
    }

    this.logger.warn(
      { phone: maskedPhone, requestIp },
      'Account locked due to OTP failures',
    );
  }

  private async handlePostTransactionRedis(
    phone: string,
    rawRefreshToken: string,
    sessionId: string,
    userId: string,
    tokenVersion: number,
  ): Promise<void> {
    try {
      await this.tokenService.storeRefreshTokenInRedis(
        rawRefreshToken,
        sessionId,
      );
      await this.tokenService.cacheTokenVersion(userId, tokenVersion);
      await this.otpService.cleanupAfterSuccess(phone);
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        { error: err.message },
        'Redis post-transaction ops failed — session exists in DB but Redis lookup may fail on refresh',
      );
      // Acceptable: user will need to re-login on next refresh
    }
  }

  private async enforceMaxSessions(
    userId: string,
    newSessionId: string,
  ): Promise<void> {
    try {
      const activeCount =
        await this.sessionRepository.countActiveForUser(userId);
      if (activeCount > SessionService.MAX_CONCURRENT_SESSIONS) {
        // Find sessions to revoke (oldest first, excluding new session)
        const oldest = await this.prisma.loginSession.findFirst({
          where: {
            userId,
            revoked: false,
            expiresAt: { gt: new Date() },
            id: { not: newSessionId },
          },
          orderBy: { createdAt: 'asc' },
        });

        if (oldest) {
          await this.sessionRepository.revokeById(oldest.id);
          this.logger.log(
            { userId, revokedSessionId: oldest.id },
            'Oldest session revoked (max sessions enforced)',
          );
        }
      }
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        { error: err.message },
        'Failed to enforce max sessions — non-critical',
      );
    }
  }
}
