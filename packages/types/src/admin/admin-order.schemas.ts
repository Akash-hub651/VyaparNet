/**
 * Admin Order DTO Schemas — Phase 1
 *
 * Governs:
 * - AdminOrderListQuerySchema: query params for GET /admin/orders
 * - AdminDeliverDtoSchema: body for PATCH /admin/orders/:id/deliver
 * - AdminCancelDtoSchema: body for PATCH /admin/orders/:id/force-cancel
 * - AdminCompleteDtoSchema: body for PATCH /admin/orders/:id/complete
 *
 * Invariants:
 * - INV-S7-13: validateAdminTransition() is called in the service layer before any state change
 * - FOOTGUN-1-D: NEVER import from @vyaparnet/database
 */
import { z } from 'zod';

export const AdminOrderListQuerySchema = z
  .object({
    status: z
      .enum([
        'DRAFT',
        'PENDING_PAYMENT',
        'PAYMENT_FAILED',
        'PROCESSING',
        'CONFIRMED',
        'READY_TO_SHIP',
        'SHIPPED',
        'OUT_FOR_DELIVERY',
        'DELIVERED',
        'COMPLETED',
        'CANCELLED',
        'RETURN_REQUESTED',
        'RETURN_APPROVED',
        'RETURN_REJECTED',
        'RETURN_COMPLETED',
        'REFUNDED',
        'DISPUTED',
      ])
      .optional(),
    segment: z.enum(['TEXTILE', 'SPARE_PARTS']).optional(),
    buyerId: z.string().optional(),
    sellerId: z.string().optional(), // Business.id
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export type AdminOrderListQuery = z.infer<typeof AdminOrderListQuerySchema>;

// PATCH /admin/orders/:id/deliver — SHIPPED → DELIVERED (INV-S7-13)
export const AdminDeliverDtoSchema = z.object({}).strict();
export type AdminDeliverDto = z.infer<typeof AdminDeliverDtoSchema>;

// PATCH /admin/orders/:id/complete — DELIVERED → COMPLETED (INV-S7-13)
export const AdminCompleteDtoSchema = z.object({}).strict();
export type AdminCompleteDto = z.infer<typeof AdminCompleteDtoSchema>;

// PATCH /admin/orders/:id/force-cancel — any non-terminal → CANCELLED (INV-S7-13)
export const AdminCancelDtoSchema = z
  .object({
    reason: z
      .string()
      .min(10, { message: 'Cancellation reason must be at least 10 characters' })
      .max(1000),
  })
  .strict();

export type AdminCancelDto = z.infer<typeof AdminCancelDtoSchema>;
