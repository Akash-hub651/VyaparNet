import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { InventoryService } from '../../inventory/inventory.service';
import { SellerContextGuard } from '../guards/seller-context.guard';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { UserRole } from '@vyaparnet/database';
import { ZodValidationPipe } from '../../../shared/pipes/zod-validation.pipe';
import { InventoryListQuerySchema, InventoryListQuery } from '@vyaparnet/types';

@Controller('seller/inventory')
@UseGuards(JwtAuthGuard, RolesGuard, SellerContextGuard) // INV-S5-2: SellerContextGuard on EVERY seller controller class
@Roles(UserRole.SELLER)                                  // INV-S5-21: SELLER role required
export class SellerInventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  /**
   * GET /seller/inventory
   * Paginated inventory list for seller dashboard.
   * Accesses inventory via the InventoryService facade only (INV-S5-27).
   */
  @Get()
  async getInventory(
    @Req() req: any,
    @Query(new ZodValidationPipe(InventoryListQuerySchema)) query: InventoryListQuery,
  ) {
    const { businessId } = req.seller; // Enforces seller context isolation (INV-S5-3 / INV-S5-33)
    return this.inventoryService.listInventory({
      businessId,
      take: query.limit,
      cursor: query.cursor,
      lowStockOnly: query.lowStockOnly,
    });
  }
}
