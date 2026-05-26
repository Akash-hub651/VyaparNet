import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { RolePermissions } from '@vyaparnet/types';
import type { Permission } from '@vyaparnet/types';
import type { JwtPayload } from '../../modules/identity/auth/token.service';
import type { Request } from 'express';

/**
 * PermissionsGuard — enforces fine-grained permission-based access control.
 *
 * Applied per-endpoint via @RequirePermissions() decorator.
 * Runs AFTER JwtAuthGuard and (optionally) RolesGuard.
 *
 * Usage: @RequirePermissions(Permission.PRODUCT_CREATE)
 * Logic: user's role must have ALL specified permissions.
 *
 * Permissions are defined in RolePermissions map (@vyaparnet/types).
 * This guard is stateless — no DB query.
 *
 * Authority: VyaparNet_Implementation_Architecture_Official_Freeze_v1.md Section 9
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user: JwtPayload }>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Authentication required.',
      });
    }

    const userPermissions = RolePermissions[user.role] ?? [];
    const hasAllPermissions = requiredPermissions.every((p) =>
      userPermissions.includes(p),
    );

    if (!hasAllPermissions) {
      const missing = requiredPermissions.filter(
        (p) => !userPermissions.includes(p),
      );
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: `Missing permissions: ${missing.join(', ')}`,
      });
    }

    return true;
  }
}
