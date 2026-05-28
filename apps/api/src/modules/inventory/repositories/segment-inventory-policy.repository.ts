import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type { SegmentInventoryPolicyDto } from '../inventory-policy.service';

/**
 * SegmentInventoryPolicyRepository — read-only access to SegmentInventoryPolicy table.
 *
 * Authority: SPRINT3_EXECUTION_LOCK_FINAL.md §9.1, §12.2, §33.4
 *
 * INVARIANTS:
 *  - Read-only by design — policies are seeded, not created by application code.
 *  - findBySegment() returns null if not seeded — caller handles as InternalServerError.
 *  - All operations are non-transactional reads (no $transaction needed).
 *
 * NOTE: Policy writes (admin updates) are out-of-scope for Sprint 3 application code.
 * Seeds are the only write path.
 */
@Injectable()
export class SegmentInventoryPolicyRepository {
  private readonly logger = new Logger(SegmentInventoryPolicyRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find policy for a segment.
   * Returns null if not seeded — InventoryPolicyService handles as InternalServerError. (§12.2)
   */
  async findBySegment(
    segment: string,
  ): Promise<SegmentInventoryPolicyDto | null> {
    const row = await this.prisma.segmentInventoryPolicy.findUnique({
      where: { segment: segment as any }, // cast: segment is valid enum string at runtime
    });

    if (!row) {
      this.logger.warn(
        { segment },
        'SegmentInventoryPolicy not found for segment',
      );
      return null;
    }

    return {
      id: row.id,
      segment: row.segment,
      maxReservationTtlSeconds: row.maxReservationTtlSeconds,
      maxReservationsPerUser: row.maxReservationsPerUser,
      maxReservationQtyPerRequest: row.maxReservationQtyPerRequest,
      reservationVelocityLimitPerHour: row.reservationVelocityLimitPerHour,
      allowBackorder: row.allowBackorder,
      allowVirtualStock: row.allowVirtualStock,
      lowStockThresholdPercent: row.lowStockThresholdPercent,
      isActive: row.isActive,
    };
  }

  /**
   * Find all policies (admin listing — bounded). (§33.4 RULE 6)
   */
  async findAll(): Promise<SegmentInventoryPolicyDto[]> {
    const rows = await this.prisma.segmentInventoryPolicy.findMany({
      take: 50, // Bounded — small table
      orderBy: { segment: 'asc' },
    });

    return rows.map((row) => ({
      id: row.id,
      segment: row.segment,
      maxReservationTtlSeconds: row.maxReservationTtlSeconds,
      maxReservationsPerUser: row.maxReservationsPerUser,
      maxReservationQtyPerRequest: row.maxReservationQtyPerRequest,
      reservationVelocityLimitPerHour: row.reservationVelocityLimitPerHour,
      allowBackorder: row.allowBackorder,
      allowVirtualStock: row.allowVirtualStock,
      lowStockThresholdPercent: row.lowStockThresholdPercent,
      isActive: row.isActive,
    }));
  }
}
