/**
 * Admin Feature Flag DTO Schemas — Phase 1
 *
 * Governs:
 * - AdminUpdateFlagDtoSchema: body for PATCH /admin/flags/:name
 *
 * Invariants:
 * - INV-S7-18: flag:{name}:{env}:{segment} cache keys, TTL=300s, SCAN+DEL invalidation
 * - FOOTGUN-1-D: NEVER import from @vyaparnet/database
 */
import { z } from 'zod';

// PATCH /admin/flags/:name — toggle flag and optionally update rollout percent
export const AdminUpdateFlagDtoSchema = z
  .object({
    enabled: z.boolean(),
    rolloutPercent: z.number().int().min(0).max(100).optional(),
  })
  .strict();

export type AdminUpdateFlagDto = z.infer<typeof AdminUpdateFlagDtoSchema>;
