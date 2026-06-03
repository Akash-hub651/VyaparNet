import { z } from 'zod';

// Strict monetary regex (INV-S8-43): only decimal string with max 2 decimal places
const MoneyString = z.string().regex(/^\d+(\.\d{1,2})?$/, 'Must be a valid decimal string');

export const ReturnReasonEnum = z.enum([
  'DAMAGED',
  'WRONG_ITEM',
  'QUALITY_ISSUE',
  'NOT_AS_DESCRIBED',
  'EXPIRED',
  'MISSING_PARTS',
  'OTHER',
]);

// Buyer creates a return request
export const CreateReturnDtoSchema = z.object({
  orderId: z.string().cuid(),
  itemId: z.string().cuid(),
  reason: ReturnReasonEnum,
  description: z.string().min(10).max(1000).optional(),
  images: z.array(z.string()).max(5).default([]),
  requestedRefundAmount: MoneyString,
}).strict(); // INV-S8-36: All Zod schemas use .strict()

export type CreateReturnDto = z.infer<typeof CreateReturnDtoSchema>;

// Response DTO for a return request
export const ReturnResponseDtoSchema = z.object({
  id: z.string().cuid(),
  orderId: z.string().cuid(),
  itemId: z.string().cuid(),
  sellerId: z.string().cuid().nullable().optional(),
  reason: ReturnReasonEnum,
  description: z.string().nullable().optional(),
  images: z.array(z.string()), // Will contain S3 keys, but at presentation layer will be converted to signed URLs
  status: z.string(), // ReturnStatus
  requestedRefundAmount: MoneyString,
  approvedRefundAmount: MoneyString,
  resolution: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ReturnResponseDto = z.infer<typeof ReturnResponseDtoSchema>;
