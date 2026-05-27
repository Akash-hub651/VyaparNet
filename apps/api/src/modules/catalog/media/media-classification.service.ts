import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { Segment, MediaClass } from '@vyaparnet/database';

export interface SchemaConfigPayload {
  requiredMedia?: Array<{ class: MediaClass; min: number; max: number }>;
}

export class MediaRequirementException extends BadRequestException {
  constructor(message: string) {
    super(message);
  }
}

@Injectable()
export class MediaClassificationService {
  constructor(private readonly prisma: PrismaService) {}

  async validateForSegment(mediaIds: string[], segment: Segment): Promise<void> {
    // Phase 4 lays out SegmentAttributeSchema, but Phase 3 relies on it for media checks.
    // We fetch the schema for the segment.
    const schemaConfig = await this.prisma.segmentAttributeSchema.findFirst({
      where: { segment, isActive: true },
      orderBy: { version: 'desc' },
    });

    if (!schemaConfig || !schemaConfig.schema) {
      // Fallback or just allow if no strict schema defined yet
      return;
    }

    const schema = schemaConfig.schema as unknown as SchemaConfigPayload;
    const requiredMedia = schema.requiredMedia;

    if (!requiredMedia || !Array.isArray(requiredMedia)) {
      return; // No strict media requirements
    }

    // Fetch the actual media types from the DB
    const uploadedMedia = await this.prisma.media.findMany({
      where: { id: { in: mediaIds }, isDeleted: false },
      select: { mediaClass: true },
    });

    // Count by class
    const counts = uploadedMedia.reduce((acc, curr) => {
      acc[curr.mediaClass] = (acc[curr.mediaClass] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Validate against constraints
    for (const req of requiredMedia) {
      const actualCount = counts[req.class] || 0;
      if (actualCount < req.min) {
        throw new MediaRequirementException(
          `Segment ${segment} requires at least ${req.min} media of class ${req.class}. Found: ${actualCount}`,
        );
      }
      if (req.max && actualCount > req.max) {
        throw new MediaRequirementException(
          `Segment ${segment} allows at most ${req.max} media of class ${req.class}. Found: ${actualCount}`,
        );
      }
    }
  }
}
