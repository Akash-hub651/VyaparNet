import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { Segment, Prisma } from '@vyaparnet/database';
import { InventoryService } from '../../inventory/inventory.service';

export interface SellerKpiRaw {
  ordersToday: number;
  revenueToday: string;
  pendingOrderCount: number;
  lowStockProductCount: number;
}

/**
 * SellerKpiRepository — computes all four KPI values for the seller dashboard.
 *
 * INVARIANTS:
 *  - INV-S5-14: every query includes WHERE sellerId = businessId AND segment = segment
 *  - INV-S5-27: low-stock count MUST be obtained via InventoryService — NEVER via the raw inventory table directly
 *  - INV-S5-33: segment isolation mandatory on all queries
 */
@Injectable()
export class SellerKpiRepository {
  constructor(
    private readonly prisma: PrismaService,
    /**
     * INV-S5-27: InventoryService is the sole authority for inventory reads.
     * Direct database inventory queries from seller/buyer modules are FORBIDDEN.
     */
    private readonly inventoryService: InventoryService,
  ) {}

  async computeKpis(
    businessId: string,
    segment: Segment,
  ): Promise<SellerKpiRaw> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 4 independent queries — each hits its own index cleanly
    const [ordersToday, revenueToday, pendingCount, lowStockCount] =
      await Promise.all([
        this.prisma.order.count({
          where: {
            sellerId: businessId, // MANDATORY (INV-S5-14)
            segment,              // MANDATORY (INV-S5-33)
            createdAt: { gte: today },
            isDeleted: false,
          },
        }),
        this.prisma.order.aggregate({
          where: {
            sellerId: businessId, // MANDATORY (INV-S5-14)
            segment,
            createdAt: { gte: today },
            status: { notIn: ['CANCELLED', 'PAYMENT_FAILED'] },
            isDeleted: false,
          },
          _sum: { grandTotal: true },
        }),
        this.prisma.order.count({
          where: {
            sellerId: businessId, // MANDATORY (INV-S5-14)
            segment,
            status: { in: ['PLACED', 'CONFIRMED', 'PROCESSING'] },
            isDeleted: false,
          },
        }),
        // INV-S5-27: MUST use InventoryService — NEVER direct inventory table access.
        // InventoryModule is the sole authority for Inventory table access.
        this.inventoryService.countLowStock(businessId, segment),
      ]);

    return {
      ordersToday,
      revenueToday: (revenueToday._sum.grandTotal ?? new Prisma.Decimal(0)).toString(),
      pendingOrderCount: pendingCount,
      lowStockProductCount: lowStockCount,
    };
  }
}
