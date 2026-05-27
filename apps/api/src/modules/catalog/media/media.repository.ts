import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { Media, MediaClass, MediaType } from '@vyaparnet/database';

@Injectable()
export class MediaRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Media | null> {
    return this.prisma.media.findUnique({
      where: { id, isDeleted: false },
    });
  }

  async findByIds(ids: string[]): Promise<Media[]> {
    return this.prisma.media.findMany({
      where: { id: { in: ids }, isDeleted: false },
    });
  }

  async findByChecksum(checksum: string, uploadedBy: string): Promise<Media | null> {
    return this.prisma.media.findFirst({
      where: {
        checksum,
        uploadedBy,
        isDeleted: false,
      },
    });
  }

  async create(data: {
    type: MediaType;
    url: string;
    name: string;
    size: number;
    mimeType: string;
    uploadedBy: string;
    checksum: string;
    mediaClass?: MediaClass;
  }): Promise<Media> {
    return this.prisma.media.create({
      data: {
        ...data,
        isProcessed: false,
      },
    });
  }

  async markProcessed(id: string, thumbnailUrl: string, mediaClass: MediaClass): Promise<Media> {
    return this.prisma.media.update({
      where: { id },
      data: {
        isProcessed: true,
        thumbnailUrl,
        mediaClass,
      },
    });
  }

  async softDelete(id: string): Promise<void> {
    await this.prisma.media.update({
      where: { id },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
      },
    });
  }

  async findOrphaned(olderThanHours: number): Promise<Media[]> {
    const threshold = new Date();
    threshold.setHours(threshold.getHours() - olderThanHours);

    return this.prisma.media.findMany({
      where: {
        isDeleted: false,
        createdAt: {
          lt: threshold,
        },
        productMedia: {
          none: {}, // Assuming relation is ProductMedia[]
        },
        variant: null, // Assuming relation is ProductVariant
      },
    });
  }
}
