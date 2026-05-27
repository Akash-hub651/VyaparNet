import { z } from 'zod';
import { Segment } from '../enums';

export const CategoryTreeResponseSchema = z.object({
  id: z.string().cuid(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable().optional(),
  segment: z.nativeEnum(Segment),
  parentId: z.string().cuid().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  displayOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
  filterConfig: z.any().nullable().optional(), // Using z.any() for generic JSONB filter config
});

export type CategoryTreeResponse = z.infer<typeof CategoryTreeResponseSchema> & {
  children?: CategoryTreeResponse[];
};
