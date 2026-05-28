import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Headers,
  Ip,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { ZodValidationPipe } from '../../shared/pipes/zod-validation.pipe';
import { Public } from '../../shared/decorators/public.decorator';
import { Roles } from '../../shared/decorators/roles.decorator';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { InventoryService } from './inventory.service';
import { InventoryQueryService } from './inventory-query.service';
import { InventoryUpdateService } from './inventory-update.service';
import {
  ReserveInventorySchema,
  ReleaseInventorySchema,
  UpdateInventorySchema,
  InventoryListQuerySchema,
} from './dto/inventory.dto';
import type {
  ReserveInventoryDto,
  ReleaseInventoryDto,
  UpdateInventoryDto,
  InventoryListQueryDto,
} from './dto/inventory.dto';
import type { JwtPayload } from '../identity/auth/token.service';

/**
 * InventoryController — HTTP Routes for Phase 4.
 *
 * Authority: SPRINT3_EXECUTION_LOCK_FINAL.md §20.3
 *
 * RBAC Rules (§20.3):
 * - GET /inventory/:productId → @Public()
 * - GET /inventory/seller → @Roles(SELLER, SELLER_MANAGER)
 * - PATCH /inventory/:productId → @Roles(SELLER, SELLER_MANAGER)
 * - POST /inventory/reserve → @Roles(BUYER, SELLER_MANAGER, ADMIN)
 * - POST /inventory/release → @Roles(SELLER_MANAGER, ADMIN)
 * - GET /inventory/:productId/movements → @Roles(SELLER, SELLER_MANAGER)
 */
@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly queryService: InventoryQueryService,
    private readonly updateService: InventoryUpdateService,
  ) {}

  @Public()
  @Get(':productId')
  async getAvailability(@Param('productId') productId: string) {
    // segment is derived from the Inventory record in DB — NOT a client input (§4.1)
    return this.inventoryService.getAvailability(productId, '');
  }

  @Roles('SELLER', 'SELLER_MANAGER')
  @Get('seller/list')
  async listInventory(
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(InventoryListQuerySchema))
    query: InventoryListQueryDto,
  ) {
    // Assuming businessId is attached to user payload or fetched otherwise.
    // For this boilerplate we assume user.businessId is available or fallback to user.sub
    const businessId = (user as any).businessId || user.sub;

    return this.queryService.listInventory({
      businessId,
      take: query.limit,
      cursor: query.cursor,
      lowStockOnly: query.lowStockOnly,
    });
  }

  @Roles('SELLER', 'SELLER_MANAGER')
  @Patch(':productId')
  async updateStock(
    @Param('productId') productId: string,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(UpdateInventorySchema)) dto: UpdateInventoryDto,
  ) {
    const businessId = (user as any).businessId || user.sub;

    return this.updateService.updateStock({
      productId,
      newQuantity: dto.quantity,
      lowStockThreshold: dto.lowStockThreshold,
      reason: dto.reason,
      updatedBy: user.sub,
      businessId,
      role: 'SELLER',
    });
  }

  @Roles('BUYER', 'SELLER_MANAGER', 'ADMIN')
  @Post('reserve')
  @HttpCode(HttpStatus.OK)
  async reserve(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(ReserveInventorySchema))
    dto: ReserveInventoryDto,
    @Headers('idempotency-key') idempotencyKey: string,
    @Ip() ip: string,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
    }

    const ipHash = createHash('sha256')
      .update(ip ?? 'unknown')
      .digest('hex');

    return this.inventoryService.reserve({
      ...dto,
      idempotencyKey,
      ipAddress: ipHash,
      userId: user.sub,
    });
  }

  @Roles('SELLER_MANAGER', 'ADMIN')
  @Post('release')
  @HttpCode(HttpStatus.OK)
  async release(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(ReleaseInventorySchema))
    dto: ReleaseInventoryDto,
  ) {
    const businessId = (user as any).businessId || user.sub;
    return this.inventoryService.release(
      dto.reservationId,
      dto.reason as any,
      user.sub,
      user.role,
      businessId
    );
  }

  @Roles('SELLER', 'SELLER_MANAGER')
  @Get(':productId/movements')
  async getMovements(
    @Param('productId') productId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    // Note: getMovementHistory expects inventoryId, not productId.
    // So we first fetch inventory to get ID.
    const inventory = await this.queryService.getAvailability(productId);

    return this.queryService.getMovementHistory({
      inventoryId: inventory.inventoryId,
      take: limit ? parseInt(limit, 10) : 20,
      cursor,
    });
  }
}
