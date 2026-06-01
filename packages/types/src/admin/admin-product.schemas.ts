/**
 * Admin Product DTO Schemas — Phase 1
 *
 * Governs:
 * - AdminProductListQuerySchema: query params for GET /admin/products
 * - ApproveProductDtoSchema: body for PATCH /admin/products/:id/approve
 * - RejectProductDtoSchema: body for PATCH /admin/products/:id/reject
 * - BulkApproveDtoSchema: body for POST /admin/products/bulk-approve (INV-S7-20: max 100)
 *
 * Invariants:
 * - INV-S7-20: BulkApproveDto MUST reject arrays > 100 items
 * - FOOTGUN-1-D: NEVER import from @vyaparnet/database
 */
import { z } from 'zod';

export const AdminProductListQuerySchema = z
  .object({
    status: z
      .enum([
        'DRAFT',
        'PENDING_APPROVAL',
        'ACTIVE',
        'INACTIVE',
        'REJECTED',
        'ARCHIVED',
      ])
      .optional(),
    segment: z.enum(['TEXTILE', 'SPARE_PARTS']).optional(),
    businessId: z.string().optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().optional(), // product name partial match
  })
  .strict();

export type AdminProductListQuery = z.infer<typeof AdminProductListQuerySchema>;

export const ApproveProductDtoSchema = z.object({}).strict();
export type ApproveProductDto = z.infer<typeof ApproveProductDtoSchema>;

export const RejectProductDtoSchema = z
  .object({
    reason: z
      .string()
      .min(10, { message: 'Rejection reason must be at least 10 characters' })
      .max(1000),
  })
  .strict();

export type RejectProductDto = z.infer<typeof RejectProductDtoSchema>;

// INV-S7-20: Batch MUST be capped at 100. Larger batches → 422.
export const BulkApproveDtoSchema = z
  .object({
    productIds: z
      .array(z.string().min(1))
      .min(1)
      .max(100, {
        message: 'Batch size exceeds maximum of 100 products',
      }),
  })
  .strict();

export type BulkApproveDto = z.infer<typeof BulkApproveDtoSchema>;
