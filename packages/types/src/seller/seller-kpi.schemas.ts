import { z } from 'zod';

export const SellerKpiSchema = z.object({
  ordersToday: z.number().int().nonnegative(),
  revenueToday: z.string(), // Decimal as string, e.g. "12000.50"
  pendingOrderCount: z.number().int().nonnegative(),
  lowStockProductCount: z.number().int().nonnegative(),
  cachedAt: z.string().datetime().nullable(),
  isCacheBypass: z.boolean(),
}).strict();

export type SellerKpiDto = z.infer<typeof SellerKpiSchema>;

export const SellerKpiResponseSchema = z.object({
  success: z.boolean(),
  data: SellerKpiSchema,
}).strict();

export type SellerKpiResponseDto = z.infer<typeof SellerKpiResponseSchema>;
