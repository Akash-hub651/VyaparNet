/**
 * Admin User DTO Schemas — Phase 1
 *
 * Governs:
 * - AdminUserListQuerySchema: query params for GET /admin/users
 * - AdminSuspendUserDtoSchema: body for PATCH /admin/users/:id/suspend
 * - AdminActivateUserDtoSchema: body for PATCH /admin/users/:id/activate
 * - AdminChangeRoleDtoSchema: body for PATCH /admin/users/:id/change-role
 *
 * Invariants:
 * - INV-S7-12: AdminChangeRoleDto MUST reject ADMIN and SELLER_MANAGER as targets.
 *              MUST use z.enum(['BUYER', 'SELLER']) — NOT z.string().
 *              This is the security control — enum constraint prevents role escalation.
 * - FOOTGUN-1-C: z.string() for role is FORBIDDEN. Use z.enum(['BUYER', 'SELLER']) ONLY.
 * - FOOTGUN-1-D: NEVER import from @vyaparnet/database
 */
import { z } from 'zod';

export const AdminUserListQuerySchema = z
  .object({
    // INV-S7-12: UserRole values as string literals (no Prisma enum import)
    role: z.enum(['BUYER', 'SELLER', 'ADMIN', 'SELLER_MANAGER']).optional(),
    kycStatus: z
      .enum(['UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED'])
      .optional(),
    segment: z.enum(['TEXTILE', 'SPARE_PARTS']).optional(),
    isDeleted: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().optional(), // name/email partial match
  })
  .strict();

export type AdminUserListQuery = z.infer<typeof AdminUserListQuerySchema>;

export const AdminSuspendUserDtoSchema = z
  .object({
    reason: z
      .string()
      .min(10, { message: 'Suspension reason must be at least 10 characters' })
      .max(1000),
  })
  .strict();

export type AdminSuspendUserDto = z.infer<typeof AdminSuspendUserDtoSchema>;

export const AdminActivateUserDtoSchema = z.object({}).strict();
export type AdminActivateUserDto = z.infer<typeof AdminActivateUserDtoSchema>;

// INV-S7-12: CRITICAL SECURITY CONTROL — ADMIN and SELLER_MANAGER are FORBIDDEN targets.
// This enum constraint prevents privilege escalation via the change-role API.
// NEVER change to z.string() — that would allow assigning ADMIN role via API.
export const AdminChangeRoleDtoSchema = z
  .object({
    role: z.enum(['BUYER', 'SELLER']),
  })
  .strict();

export type AdminChangeRoleDto = z.infer<typeof AdminChangeRoleDtoSchema>;
