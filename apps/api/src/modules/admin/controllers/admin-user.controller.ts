import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { AdminContextGuard } from '../guards/admin-context.guard';
import { AdminIdempotencyGuard } from '../guards/admin-idempotency.guard';
import { AdminRateLimitGuard } from '../guards/admin-rate-limit.guard';
import { AdminUserService } from '../services/admin-user.service';
import {
  AdminUserListQuerySchema,
  AdminSuspendUserDtoSchema,
  AdminChangeRoleDtoSchema,
} from '@vyaparnet/types';

/**
 * AdminUsersController — User Management & Suspension workflow.
 *
 * Routes:
 *  GET  /admin/users               → paginated user list (filter by role, status, segment)
 *  GET  /admin/users/:id           → user detail + businesses + recent 10 orders
 *  PATCH /admin/users/:id/suspend  → suspend user (atomic triple — INV-S7-10)
 *  PATCH /admin/users/:id/activate → reactivate suspended user
 *  PATCH /admin/users/:id/change-role → change role (BUYER/SELLER only — INV-S7-12)
 *
 * Guard stack: JwtAuthGuard → AdminContextGuard → AdminRateLimitGuard (INV-S7-1)
 * State-change routes: + AdminIdempotencyGuard (INV-S7-7)
 *
 * Security:
 *  - Self-modification prevention enforced at service layer (INV-S7-11)
 *  - Role change rejects ADMIN/SELLER_MANAGER at Zod schema (INV-S7-12)
 *  - actorId always from JWT (INV-S7-3)
 *
 * Authority: §20 Phase 5.
 */
@Controller('admin/users')
@UseGuards(JwtAuthGuard, AdminContextGuard, AdminRateLimitGuard)
export class AdminUsersController {
  constructor(private readonly userService: AdminUserService) {}

  /**
   * GET /admin/users
   * Returns paginated user list.
   * Filters: role, kycStatus, segment, isDeleted, search, cursor, limit.
   */
  @Get()
  async getUsers(@Query() rawQuery: Record<string, string>) {
    const parsed = AdminUserListQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new UnprocessableEntityException({
        code: 'INVALID_QUERY_PARAMS',
        errors: parsed.error.issues,
      });
    }
    return this.userService.getUserList(parsed.data);
  }

  /**
   * GET /admin/users/:id
   * Returns user profile + owned businesses + recent 10 orders.
   */
  @Get(':id')
  async getUserDetail(@Param('id') id: string) {
    return this.userService.getUserDetail(id);
  }

  /**
   * PATCH /admin/users/:id/suspend
   * Suspends user: isDeleted=true + tokenVersion+=1 + sessions revoked (INV-S7-10).
   * Requires Idempotency-Key header (INV-S7-7).
   * Admin cannot suspend own account (INV-S7-11).
   *
   * Body: { reason: string } (min 10 chars)
   * Response: 200 OK on success
   */
  @Patch(':id/suspend')
  @UseGuards(AdminIdempotencyGuard)
  async suspendUser(
    @Param('id') id: string,
    @Body() rawBody: Record<string, unknown>,
    @Req() req: Request & { user: { id: string }; idempotencyKey: string },
  ) {
    const parsed = AdminSuspendUserDtoSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new UnprocessableEntityException({
        code: 'INVALID_REQUEST_BODY',
        errors: parsed.error.issues,
      });
    }
    await this.userService.suspendUser(
      id,
      parsed.data,
      req.user.id,
      req.idempotencyKey,
      req,
    );
    return { message: 'User suspended successfully', userId: id };
  }

  /**
   * PATCH /admin/users/:id/activate
   * Reactivates a suspended user: isDeleted=false (tokenVersion unchanged — FOOTGUN-5-F).
   * Requires Idempotency-Key header (INV-S7-7).
   *
   * Response: 200 OK on success
   */
  @Patch(':id/activate')
  @UseGuards(AdminIdempotencyGuard)
  async activateUser(
    @Param('id') id: string,
    @Req() req: Request & { user: { id: string }; idempotencyKey: string },
  ) {
    await this.userService.activateUser(
      id,
      req.user.id,
      req.idempotencyKey,
      req,
    );
    return { message: 'User activated successfully', userId: id };
  }

  /**
   * PATCH /admin/users/:id/change-role
   * Changes user role.
   * INV-S7-12: Only BUYER/SELLER allowed — Zod rejects ADMIN/SELLER_MANAGER.
   * Requires Idempotency-Key header (INV-S7-7).
   * Admin cannot change own role (INV-S7-11).
   *
   * Body: { role: 'BUYER' | 'SELLER' }
   * Response: 200 OK on success
   */
  @Patch(':id/change-role')
  @UseGuards(AdminIdempotencyGuard)
  async changeRole(
    @Param('id') id: string,
    @Body() rawBody: Record<string, unknown>,
    @Req() req: Request & { user: { id: string }; idempotencyKey: string },
  ) {
    const parsed = AdminChangeRoleDtoSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new UnprocessableEntityException({
        code: 'INVALID_REQUEST_BODY',
        errors: parsed.error.issues,
      });
    }
    await this.userService.changeUserRole(
      id,
      parsed.data,
      req.user.id,
      req.idempotencyKey,
      req,
    );
    return {
      message: 'User role changed successfully',
      userId: id,
      role: parsed.data.role,
    };
  }
}
