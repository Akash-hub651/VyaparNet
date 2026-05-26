import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import * as argon2 from 'argon2';
import { RedisService } from '../../../core/redis/redis.service';
import type { UserRole, Segment } from '@vyaparnet/types';

/**
 * JWT Payload — minimal claims stored in access token.
 * NEVER include sensitive data (PII, full user object, etc.).
 *
 * Authority: VyaparNet_Implementation_Architecture_Official_Freeze_v1.md Section 9
 */
export interface JwtPayload {
  sub: string; // userId (CUID)
  role: UserRole; // User role for RBAC
  segment: Segment; // User segment for isolation
  tokenVersion: number; // For instant session invalidation
  jti: string; // JWT ID (unique per token)
  iat?: number; // Issued at (added by JwtService)
  exp?: number; // Expiry (added by JwtService)
}

/**
 * Session identity after token refresh lookup.
 */
export interface SessionContext {
  sessionId: string;
  userId: string;
  role: UserRole;
  segment: Segment;
}

// ─── Redis key builders for sessions ─────────────────────────
export const SessionKeys = {
  raw: (rawToken: string) => `session:raw:${rawToken}`,
} as const;

@Injectable()
export class TokenService {
  // TTL constants (from VyaparNet_Deployment_Runtime_Architecture_v1.md Section 14)
  static readonly ACCESS_TOKEN_TTL_SECONDS = 900; // 15 min
  static readonly REFRESH_TOKEN_TTL_SECONDS = 604800; // 7 days

  constructor(
    private readonly jwtService: JwtService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Generate a JWT access token with minimal claims.
   * Signed with HS256. TTL: 15 minutes.
   */
  generateAccessToken(
    payload: Omit<JwtPayload, 'jti' | 'iat' | 'exp'>,
  ): string {
    const jti = crypto.randomUUID();
    return this.jwtService.sign(
      { ...payload, jti },
      { expiresIn: TokenService.ACCESS_TOKEN_TTL_SECONDS },
    );
  }

  /**
   * Verify a JWT access token.
   * Returns the payload or throws UnauthorizedException.
   *
   * SECURITY: Verification is stateless — no DB query.
   * Token validity is checked via signature + expiry only.
   */
  verifyAccessToken(token: string): JwtPayload {
    try {
      return this.jwtService.verify<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException({
        code: 'TOKEN_INVALID',
        message: 'Access token is invalid or expired.',
      });
    }
  }

  /**
   * Generate a cryptographically secure refresh token UUID.
   * NOT a JWT — a random UUID stored in Redis.
   */
  generateRawRefreshToken(): string {
    return crypto.randomUUID();
  }

  /**
   * Hash a raw refresh token using argon2id.
   * The hash is stored in LoginSession DB for audit trail.
   * The raw token is stored in Redis for fast lookup.
   *
   * Authority: LOCKED_DECISIONS.md — Argon2id mandatory
   */
  async hashRefreshToken(rawToken: string): Promise<string> {
    return argon2.hash(rawToken, {
      type: argon2.argon2id,
      memoryCost: 65536, // 64 MB
      timeCost: 3,
      parallelism: 4,
    });
  }

  /**
   * Store raw refresh token in Redis with session ID as value.
   * Used for fast O(1) lookup during token refresh.
   */
  async storeRefreshTokenInRedis(
    rawToken: string,
    sessionId: string,
  ): Promise<void> {
    await this.redis.setex(
      SessionKeys.raw(rawToken),
      TokenService.REFRESH_TOKEN_TTL_SECONDS,
      sessionId,
    );
  }

  /**
   * Look up session ID from raw refresh token.
   * Returns null if token not found (expired or revoked).
   */
  async getSessionIdFromRefreshToken(rawToken: string): Promise<string | null> {
    return this.redis.get(SessionKeys.raw(rawToken));
  }

  /**
   * Revoke a refresh token by deleting it from Redis.
   */
  async revokeRefreshTokenInRedis(rawToken: string): Promise<void> {
    await this.redis.del(SessionKeys.raw(rawToken));
  }

  /**
   * Generate a complete token pair (access + refresh).
   * Used on OTP verify success and on token refresh.
   */
  async generateTokenPair(
    jwtPayload: Omit<JwtPayload, 'jti' | 'iat' | 'exp'>,
  ): Promise<{
    accessToken: string;
    rawRefreshToken: string;
    hashedRefreshToken: string;
  }> {
    const accessToken = this.generateAccessToken(jwtPayload);
    const rawRefreshToken = this.generateRawRefreshToken();
    const hashedRefreshToken = await this.hashRefreshToken(rawRefreshToken);

    return { accessToken, rawRefreshToken, hashedRefreshToken };
  }
}
