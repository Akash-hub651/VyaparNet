/**
 * Admin Business DTO Schemas — Phase 1
 *
 * Governs:
 * - AdminBusinessListQuerySchema: query params for GET /admin/businesses
 * - VerifyBusinessDto: body for PATCH /admin/businesses/:id/verify
 * - RejectBusinessDto: body for PATCH /admin/businesses/:id/reject
 * - SuspendBusinessDto: body for PATCH /admin/businesses/:id/suspend
 *
 * Invariants:
 * - INV-S7-25: DTO schemas are NEVER in apps/api (always packages/types)
 * - FOOTGUN-1-D: NEVER import from @vyaparnet/database
 */
import { z } from 'zod';

export const AdminBusinessListQuerySchema = z
  .object({
    kycStatus: z
      .enum(['UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED'])
      .optional(),
    segment: z.enum(['TEXTILE', 'SPARE_PARTS']).optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().optional(), // business name partial match
  })
  .strict();

export type AdminBusinessListQuery = z.infer<typeof AdminBusinessListQuerySchema>;

export const VerifyBusinessDtoSchema = z
  .object({})
  .strict();

export type VerifyBusinessDto = z.infer<typeof VerifyBusinessDtoSchema>;

export const RejectBusinessDtoSchema = z
  .object({
    reason: z
      .string()
      .min(10, { message: 'Rejection reason must be at least 10 characters' })
      .max(1000),
  })
  .strict();

export type RejectBusinessDto = z.infer<typeof RejectBusinessDtoSchema>;

export const SuspendBusinessDtoSchema = z
  .object({
    reason: z
      .string()
      .min(10, { message: 'Suspension reason must be at least 10 characters' })
      .max(1000),
  })
  .strict();

export type SuspendBusinessDto = z.infer<typeof SuspendBusinessDtoSchema>;

export const ReactivateBusinessDtoSchema = z.object({}).strict();
export type ReactivateBusinessDto = z.infer<typeof ReactivateBusinessDtoSchema>;
