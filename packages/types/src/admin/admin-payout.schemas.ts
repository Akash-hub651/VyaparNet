/**
 * Admin Payout DTO Schemas — Phase 1
 *
 * Governs:
 * - AdminPayoutListQuerySchema: query params for GET /admin/payouts
 * - InitiatePayoutDtoSchema: body for PATCH /admin/payouts/:id/initiate
 *
 * Invariants:
 * - INV-S7-14: Payout rate calculation must use FeatureFlag values (enforced in service layer)
 * - INV-S7-15: SellerPayout has @@index([orderId]) only — NEVER @@unique
 * - FOOTGUN-1-D: NEVER import from @vyaparnet/database
 */
import { z } from 'zod';

export const AdminPayoutListQuerySchema = z
  .object({
    status: z.enum(['PENDING', 'INITIATED', 'TRANSFERRED', 'FAILED']).optional(),
    sellerId: z.string().optional(), // User.id of seller
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export type AdminPayoutListQuery = z.infer<typeof AdminPayoutListQuerySchema>;

// PATCH /admin/payouts/:id/initiate — marks payout as INITIATED
export const InitiatePayoutDtoSchema = z.object({}).strict();
export type InitiatePayoutDto = z.infer<typeof InitiatePayoutDtoSchema>;
