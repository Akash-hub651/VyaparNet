import { z } from 'zod';
export const BaseProductSchema = z.object({
  name: z.string().min(3).max(255),
  description: z.string().optional(),
  basePrice: z.number().positive(),
  mrp: z.number().positive().optional(),
  moq: z.number().int().min(1).default(1),
  unit: z.string(),
  categoryId: z.string().cuid(),
  hsnCode: z.string().optional(),
  gstPercent: z.number().min(0).max(100).optional(),
  tags: z.array(z.string()).default([]),
  mediaIds: z.array(z.string().cuid()).default([]),
  segmentAttributes: z.record(z.string(), z.any()).default({}),
});

export type BaseProductDto = z.infer<typeof BaseProductSchema>;
