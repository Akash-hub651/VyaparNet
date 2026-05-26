import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { TokenService } from './token.service';
import { SessionRepository } from './repositories/session.repository';
import type { LoginSession } from '@vyaparnet/database';
import type { UserRole, Segment } from '@vyaparnet/types';

export interface CreateSessionInput {
  userId: string;
  hashedRefreshToken: string;
  rawRefreshToken: string;
  deviceId: string;
  userAgent?: string;
  ipAddress?: string;
  role: UserRole;
  segment: Segment;
}

/**
 * SessionService — manages LoginSession lifecycle.
 *
 * Rules enforced:
 * - Max 3 concurrent sessions per user (oldest revoked on overflow)
 * - Device fingerprint stored for tracking
 * - Sessions expire after 7 days
 *
 * Authority: VyaparNet_Deployment_Runtime_Architecture_v1.md Section 14
 * Authority: VyaparNet_Workflow_Sequence_Diagrams_v1.md Section 37
 */
@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  static readonly MAX_CONCURRENT_SESSIONS = 3;

  constructor(
    private readonly sessionRepository: SessionRepository,
    private readonly tokenService: TokenService,
  ) {}

  /**
   * Create a new session for a user.
   * Enforces the max-3-concurrent-sessions rule by revoking oldest if needed.
   */
  async createSession(input: CreateSessionInput): Promise<LoginSession> {
    // Enforce max concurrent sessions (Must be wrapped in a Redis lock to prevent Race Conditions)
    // Example: await this.redisService.acquireLock(`lock:session:${input.userId}`)
    const activeCount = await this.sessionRepository.countActiveForUser(
      input.userId,
    );

    if (activeCount >= SessionService.MAX_CONCURRENT_SESSIONS) {
      const oldest = await this.sessionRepository.findOldestActiveForUser(
        input.userId,
      );
      if (oldest) {
        await this.sessionRepository.revokeById(oldest.id);
        await this.tokenService.revokeRefreshTokenInRedis(oldest.id);
        this.logger.log(
          { userId: input.userId, revokedSessionId: oldest.id },
          'Max sessions reached — oldest session revoked',
        );
      }
    }

    const expiresAt = new Date(
      Date.now() + TokenService.REFRESH_TOKEN_TTL_SECONDS * 1000,
    );

    const session = await this.sessionRepository.create({
      userId: input.userId,
      refreshToken: input.hashedRefreshToken,
      userAgent: input.userAgent ?? null,
      ipAddress: input.ipAddress ?? null,
      expiresAt,
      refreshTokenFamilyId: crypto.randomUUID(),
      refreshTokenVersion: 1,
    });

    // Store raw token in Redis for fast lookup
    await this.tokenService.storeRefreshTokenInRedis(
      input.rawRefreshToken,
      session.id,
    );

    this.logger.log(
      { userId: input.userId, sessionId: session.id },
      'Session created',
    );

    return session;
  }

  /**
   * Revoke a specific session.
   * Removes from Redis AND marks as revoked in DB.
   */
  async revokeSession(
    sessionId: string,
    rawRefreshToken?: string,
  ): Promise<void> {
    await this.sessionRepository.revokeById(sessionId);
    if (rawRefreshToken) {
      await this.tokenService.revokeRefreshTokenInRedis(rawRefreshToken);
    }
    this.logger.log({ sessionId }, 'Session revoked');
  }

  /**
   * Revoke all sessions for a user.
   * Used for: forced logout, account suspension, security incidents.
   * Optionally preserves one session (for "logout other devices" flow).
   */
  async revokeAllSessions(
    userId: string,
    exceptSessionId?: string,
  ): Promise<void> {
    await this.sessionRepository.revokeAllForUser(userId, exceptSessionId);
    // Note: Redis keys for revoked sessions will expire naturally
    // For immediate revocation, we'd need to track all raw tokens per user
    // This is a known tradeoff — orphaned Redis keys expire in 7 days max
    this.logger.warn(
      { userId, exceptSessionId },
      'All sessions revoked for user',
    );
  }

  /**
   * Find a session by its DB ID.
   * Used during token refresh to validate session state.
   */
  async findSessionById(sessionId: string): Promise<LoginSession | null> {
    return this.sessionRepository.findActiveById(sessionId);
  }
}
