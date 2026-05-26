import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { JwtPayload } from '../../modules/identity/auth/token.service';

/**
 * @CurrentUser() — extracts the authenticated user from request context.
 *
 * Usage: @CurrentUser() user: JwtPayload
 *
 * Returns the full JWT payload attached by JwtAuthGuard.
 * Available only on routes NOT decorated with @Public().
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { user: JwtPayload }>();
    return request.user;
  },
);
