import { Injectable } from '@nestjs/common';
import { NotificationTemplate } from '@vyaparnet/database';
import { PrismaService } from '../../../core/prisma/prisma.service';

/**
 * NotificationTemplateRepository — read-only access to NotificationTemplate table.
 *
 * Templates are seeded at startup by TemplateSeedService (INV-S6-28).
 * At runtime, only reads occur here — no updates from worker/service paths.
 */
@Injectable()
export class NotificationTemplateRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find an active template by exact name.
   * Returns null if not found or inactive — callers must handle null gracefully.
   */
  async findByName(name: string): Promise<NotificationTemplate | null> {
    return this.prisma.notificationTemplate.findFirst({
      where: { name, isActive: true },
    });
  }

  /**
   * Find all active templates.
   * Used at startup for pre-compilation (Phase 9 — TemplateService.onModuleInit).
   */
  async findAllActive(): Promise<NotificationTemplate[]> {
    return this.prisma.notificationTemplate.findMany({
      where: { isActive: true },
    });
  }
}
