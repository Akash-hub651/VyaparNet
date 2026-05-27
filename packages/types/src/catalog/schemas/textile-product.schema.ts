import { z } from 'zod';
import { BaseProductSchema } from '../product.schemas';
import { Segment } from '../../enums';

export const TextileProductSchema = BaseProductSchema.extend({
  segment: z.literal(Segment.TEXTILE),
  segmentAttributes: z.object({
    fabricComposition: z.string().min(1, 'Fabric composition is required'),
    gsm: z.number().positive().optional(),
    width: z.number().positive().optional(),
    weave: z.string().optional(),
    finish: z.string().optional(),
  }).passthrough(),
});

export type TextileProductDto = z.infer<typeof TextileProductSchema>;
