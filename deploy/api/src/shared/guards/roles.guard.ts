import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { UserRole } from '@vyaparnet/types';
import type { JwtPayload } from '../../modules/identity/auth/token.service';
import type { Request } from 'express';

/**
 * RolesGuard — enforces role-based access control.
 *
 * Applied per-controller or per-endpoint via @Roles() decorator.
 * Runs AFTER JwtAuthGuard (which attaches request.user).
 *
 * Usage: @Roles(UserRole.ADMIN) OR @Roles(UserRole.SELLER, UserRole.ADMIN)
 * Logic: user must have AT LEAST ONE of the specified roles.
 *
 * Authority: VyaparNet_Implementation_Architecture_Official_Freeze_v1.md Section 9
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No @Roles() decorator → no role restriction (auth still required via JwtAuthGuard)
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user: JwtPayload }>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Insufficient permissions.',
      });
    }

    const hasRole = requiredRoles.includes(user.role);

    if (!hasRole) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'You do not have the required role to access this resource.',
      });
    }

    return true;
  }
}
