import { z } from 'zod';
import { Segment } from '../enums';
import { TextileProductSchema } from './schemas/textile-product.schema';
import { SparePartsProductSchema } from './schemas/spare-parts-product.schema';

export class SegmentProductSchemaRegistry {
  private schemas: Map<Segment, z.ZodTypeAny> = new Map();

  constructor() {
    this.register(Segment.TEXTILE, TextileProductSchema);
    this.register(Segment.SPARE_PARTS, SparePartsProductSchema);
  }

  register(segment: Segment, schema: z.ZodTypeAny): void {
    this.schemas.set(segment, schema);
  }

  get(segment: Segment): z.ZodTypeAny {
    const schema = this.schemas.get(segment);
    if (!schema) {
      throw new Error(`No schema registered for segment: ${segment}`);
    }
    return schema;
  }
}
