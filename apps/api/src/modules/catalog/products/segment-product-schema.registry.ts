import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { Segment } from '@vyaparnet/database';
import { TextileProductSchema, SparePartsProductSchema } from '@vyaparnet/types';

@Injectable()
export class SegmentProductSchemaRegistry {
  private readonly logger = new Logger(SegmentProductSchemaRegistry.name);
  private readonly registry: Map<Segment, z.ZodSchema> = new Map();

  constructor() {
    this.register(Segment.TEXTILE, TextileProductSchema);
    this.register(Segment.SPARE_PARTS, SparePartsProductSchema);
  }

  /**
   * Registers a Zod schema for a specific segment.
   */
  public register(segment: Segment, schema: z.ZodSchema): void {
    if (this.registry.has(segment)) {
      this.logger.warn(`Overwriting existing schema for segment: ${segment}`);
    }
    this.registry.set(segment, schema);
    this.logger.log(`Registered product schema for segment: ${segment}`);
  }

  /**
   * Retrieves the Zod schema for a specific segment.
   * Throws an error if no schema is found, ensuring tight segment coupling.
   */
  public getSchema(segment: Segment): z.ZodSchema {
    const schema = this.registry.get(segment);
    if (!schema) {
      throw new Error(`No product schema registered for segment: ${segment}`);
    }
    return schema;
  }
}
