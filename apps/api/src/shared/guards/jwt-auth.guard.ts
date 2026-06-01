import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { TokenService } from '../../modules/identity/auth/token.service';
import { AuthRepository } from '../../modules/identity/auth/repositories/auth.repository';
import { setContext } from '../context/async-local-storage';
import type { JwtPayload } from '../../modules/identity/auth/token.service';

/**
 * JwtAuthGuard — global guard that validates JWT access tokens.
 *
 * Applied globally in AppModule.
 * Skipped for routes decorated with @Public().
 *
 * On success: attaches JwtPayload to request.user AND AsyncLocalStorage.
 * On failure: throws 401 UnauthorizedException.
 *
 * SECURITY: This guard caches tokenVersion in Redis. DB fallback on cache miss.
 *
 * Authority: VyaparNet_Implementation_Architecture_Official_Freeze_v1.md Section 9
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokenService: TokenService,
    private readonly authRepository: AuthRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route is marked public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user: JwtPayload }>();

    // Extract token from Authorization header
    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException({
        code: 'TOKEN_MISSING',
        message: 'Authentication token required.',
      });
    }

    // Verify token (throws if invalid/expired)
    const payload = this.tokenService.verifyAccessToken(token);

    // Verify tokenVersion via Redis Cache (Hot-path optimization)
    let tokenVersion = await this.tokenService.getCachedTokenVersion(
      payload.sub,
    );

    // Cache miss -> fallback to Database and cache it
    if (tokenVersion === null) {
      tokenVersion = await this.authRepository.findTokenVersionById(
        payload.sub,
      );
      if (tokenVersion === null) {
        throw new UnauthorizedException({
          code: 'USER_NOT_FOUND',
          message: 'User not found.',
        });
      }
      // Cache it for subsequent requests
      await this.tokenService.cacheTokenVersion(payload.sub, tokenVersion);
    }

    if (tokenVersion !== payload.tokenVersion) {
      throw new UnauthorizedException({
        code: 'TOKEN_VERSION_MISMATCH',
        message: 'Session expired. Please login again.',
      });
    }

    // Attach user to request for downstream use
    request.user = payload;

    // Also store in AsyncLocalStorage for service layer access
    setContext('userId', payload.sub);
    setContext('userRole', payload.role);
    setContext('userSegment', payload.segment);

    return true;
  }

  private extractToken(request: Request): string | null {
    const authHeader = request.headers.authorization;
    if (authHeader) {
      const [type, token] = authHeader.split(' ');
      if (type === 'Bearer' && token) {
        return token;
      }
    }

    // Fallback: Check for admin_token cookie (for Admin Panel)
    const cookieHeader = request.headers.cookie;
    if (cookieHeader) {
      const cookies = cookieHeader.split(';').reduce((acc, cookieString) => {
        const [key, value] = cookieString.split('=').map((c) => c.trim());
        if (key && value) {
          acc[key] = value;
        }
        return acc;
      }, {} as Record<string, string>);

      if (cookies['admin_token']) {
        return cookies['admin_token'];
      }
    }

    return null;
  }
}
