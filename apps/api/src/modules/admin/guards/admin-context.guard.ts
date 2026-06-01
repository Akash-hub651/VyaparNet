import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { UserRole } from '@vyaparnet/types';

@Injectable()
export class AdminContextGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // INV-S7-1: AdminContextGuard is the ONLY guard on /admin/* routes.
    // We enforce UserRole.ADMIN directly here.
    if (!user || user.role !== UserRole.ADMIN) {
      throw new ForbiddenException({ code: 'ADMIN_ACCESS_REQUIRED' });
    }

    return true;
  }
}
