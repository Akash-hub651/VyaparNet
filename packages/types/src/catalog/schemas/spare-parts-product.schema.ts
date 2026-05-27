import { z } from 'zod';
import { BaseProductSchema } from '../product.schemas';
import { Segment } from '../../enums';

export const SparePartsProductSchema = BaseProductSchema.extend({
  segment: z.literal(Segment.SPARE_PARTS),
  segmentAttributes: z.object({
    partNumber: z.string().min(1, 'Part number is required'),
    vehicleCompatibility: z.array(z.string()).optional(),
    oemCode: z.string().optional(),
    brandName: z.string().optional(),
  }).passthrough(),
});

export type SparePartsProductDto = z.infer<typeof SparePartsProductSchema>;
