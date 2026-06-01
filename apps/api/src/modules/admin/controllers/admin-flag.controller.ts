import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { AdminContextGuard } from '../guards/admin-context.guard';
import { AdminRateLimitGuard } from '../guards/admin-rate-limit.guard';
import { AdminIdempotencyGuard } from '../guards/admin-idempotency.guard';
import { AdminFlagService, type FeatureFlagDto } from '../services/admin-flag.service';
import { ZodValidationPipe } from '../../../shared/pipes/zod-validation.pipe';
import {
  AdminUpdateFlagDtoSchema,
  type AdminUpdateFlagDto,
} from '@vyaparnet/types';

/**
 * AdminFlagsController — Feature Flag Management (Sprint 7 Phase 9).
 *
 * Routes:
 *  GET   /admin/flags      → list all feature flags
 *  PATCH /admin/flags/:name → toggle flag + optional rollout percent update
 *
 * FOOTGUN-9-C: PATCH creates AuditLog on every toggle (in service).
 * Guard stack: JwtAuthGuard → AdminContextGuard → AdminRateLimitGuard
 * PATCH: + AdminIdempotencyGuard (INV-S7-7).
 *
 * Authority: §24 Phase 9, Step 9.3.
 */
@Controller('admin/flags')
@UseGuards(JwtAuthGuard, AdminContextGuard, AdminRateLimitGuard)
export class AdminFlagsController {
  constructor(private readonly flagService: AdminFlagService) {}

  /**
   * GET /admin/flags
   * Returns all FeatureFlag records for admin management.
   */
  @Get()
  async listFlags(): Promise<FeatureFlagDto[]> {
    return this.flagService.listFlags();
  }

  /**
   * PATCH /admin/flags/:name
   * Toggle flag enabled state + optional rolloutPercent update.
   * FOOTGUN-9-C: AuditLog created on every toggle (in service).
   * INV-S7-18: Cache invalidation via SCAN+DEL after toggle.
   */
  @Patch(':name')
  @UseGuards(AdminIdempotencyGuard)
  async toggleFlag(
    @Param('name') name: string,
    @Body(new ZodValidationPipe(AdminUpdateFlagDtoSchema))
    dto: AdminUpdateFlagDto,
    @Req() req: Request & { user: { id: string } },
  ): Promise<FeatureFlagDto> {
    return this.flagService.toggleFlag(name, dto, req.user.id, req);
  }
}
