import { z } from 'zod';
import { Segment } from '../enums';

export const ProductSearchSchema = z.object({
  q: z.string().min(1),
  segment: z.nativeEnum(Segment),
  limit: z.number().int().min(1).max(100).default(20),
  categoryId: z.string().cuid().optional(),
  minPrice: z.number().nonnegative().optional(),
  maxPrice: z.number().positive().optional(),
  cursorId: z.string().cuid().optional(),
  cursorCreatedAt: z.string().datetime().optional(),
});

export const ProductListQuerySchema = z.object({
  segment: z.nativeEnum(Segment),
  limit: z.number().int().min(1).max(100).default(20),
  categoryId: z.string().cuid().optional(),
  cursorId: z.string().cuid().optional(),
  cursorCreatedAt: z.string().datetime().optional(),
});

export type ProductSearchDto = z.infer<typeof ProductSearchSchema>;
export type ProductListQueryDto = z.infer<typeof ProductListQuerySchema>;
