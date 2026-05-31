import { z } from 'zod';

export const ReorderWarningSchema = z.object({
  type: z.enum(['OUT_OF_STOCK', 'PRODUCT_UNAVAILABLE', 'PRICE_CHANGED']),
  productId: z.string(),
  productName: z.string(),
  priceFrom: z.string().optional(),
  priceTo: z.string().optional(),
  reason: z.string().optional(),
}).strict();

export type ReorderWarningDto = z.infer<typeof ReorderWarningSchema>;

export const ReorderResultSchema = z.object({
  cartId: z.string(),
  addedCount: z.number().int().nonnegative(),
  skippedCount: z.number().int().nonnegative(),
  warnings: z.array(ReorderWarningSchema),
}).strict();

export type ReorderResultDto = z.infer<typeof ReorderResultSchema>;
