import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { AdminContextGuard } from '../guards/admin-context.guard';
import { AdminIdempotencyGuard } from '../guards/admin-idempotency.guard';
import { AdminRateLimitGuard } from '../guards/admin-rate-limit.guard';
import { AdminProductService } from '../services/admin-product.service';
import {
  AdminProductListQuerySchema,
  RejectProductDtoSchema,
  BulkApproveDtoSchema,
} from '@vyaparnet/types';

/**
 * AdminProductsController — Product approval workflow.
 *
 * Routes:
 *  GET  /admin/products               → paginated product list (filter by status)
 *  GET  /admin/products/:id           → product detail
 *  PATCH /admin/products/:id/approve  → PENDING_APPROVAL → ACTIVE (INV-S7-21)
 *  PATCH /admin/products/:id/reject   → PENDING_APPROVAL → REJECTED
 *  POST  /admin/products/bulk-approve → batch approve (cap 100 — INV-S7-20)
 *
 * Guard stack: JwtAuthGuard → AdminContextGuard → AdminRateLimitGuard (INV-S7-1)
 * State-change routes: + AdminIdempotencyGuard (INV-S7-7)
 *
 * Authority: §19 Phase 4.
 */
@Controller('admin/products')
@UseGuards(JwtAuthGuard, AdminContextGuard, AdminRateLimitGuard)
export class AdminProductsController {
  constructor(private readonly productService: AdminProductService) {}

  /**
   * GET /admin/products
   * Returns paginated product list.
   * Default filter: no status filter (returns all). Use ?status=PENDING_APPROVAL for approval queue.
   */
  @Get()
  async getProducts(@Query() rawQuery: Record<string, string>) {
    const parsed = AdminProductListQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new UnprocessableEntityException({
        code: 'INVALID_QUERY_PARAMS',
        errors: parsed.error.issues,
      });
    }
    return this.productService.getProductList(parsed.data);
  }

  /**
   * GET /admin/products/:id
   * Returns product detail with business info.
   * NOTE: bulk-approve POST must be declared BEFORE :id GET to prevent
   * NestJS routing treating 'bulk-approve' as a product ID.
   */
  @Get(':id')
  async getProductDetail(@Param('id') id: string) {
    return this.productService.getProductDetail(id);
  }

  /**
   * PATCH /admin/products/:id/approve
   * Approves product: PENDING_APPROVAL → ACTIVE.
   * Requires Idempotency-Key header (INV-S7-7).
   * approvedBy is always from req.user.id (INV-S7-3, FOOTGUN-4-C).
   *
   * Response: { product: ProductDetailDto }
   */
  @Patch(':id/approve')
  @UseGuards(AdminIdempotencyGuard)
  async approveProduct(
    @Param('id') id: string,
    @Req() req: Request & { user: { id: string }; idempotencyKey: string },
  ) {
    const product = await this.productService.approveProduct(
      id,
      req.user.id,
      req.idempotencyKey,
      req,
    );
    return { product };
  }

  /**
   * PATCH /admin/products/:id/reject
   * Rejects product: PENDING_APPROVAL → REJECTED.
   * Requires Idempotency-Key header + reason body (min 10 chars).
   *
   * Body: { reason: string }
   * Response: { product: ProductDetailDto }
   */
  @Patch(':id/reject')
  @UseGuards(AdminIdempotencyGuard)
  async rejectProduct(
    @Param('id') id: string,
    @Body() rawBody: Record<string, unknown>,
    @Req() req: Request & { user: { id: string }; idempotencyKey: string },
  ) {
    const parsed = RejectProductDtoSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new UnprocessableEntityException({
        code: 'INVALID_REQUEST_BODY',
        errors: parsed.error.issues,
      });
    }
    const product = await this.productService.rejectProduct(
      id,
      parsed.data,
      req.user.id,
      req.idempotencyKey,
      req,
    );
    return { product };
  }

  /**
   * POST /admin/products/bulk-approve
   * Batch approve — capped at 100 (INV-S7-20).
   * Partial success is expected — each product approval is independent (FOOTGUN-4-D).
   * Requires Idempotency-Key header.
   *
   * Body: { productIds: string[] }   (max 100)
   * Response: { approved: string[], failed: { productId, reason }[], total: number }
   */
  @Post('bulk-approve')
  @UseGuards(AdminIdempotencyGuard)
  async bulkApprove(
    @Body() rawBody: Record<string, unknown>,
    @Req() req: Request & { user: { id: string }; idempotencyKey: string },
  ) {
    const parsed = BulkApproveDtoSchema.safeParse(rawBody);
    if (!parsed.success) {
      // Surface batch-size-exceeded as a specific code
      const isBatchTooLarge = parsed.error.issues.some((i) =>
        i.message.includes('Batch size exceeds'),
      );
      if (isBatchTooLarge) {
        throw new UnprocessableEntityException({
          code: 'BATCH_SIZE_EXCEEDED',
          max: 100,
        });
      }
      throw new UnprocessableEntityException({
        code: 'INVALID_REQUEST_BODY',
        errors: parsed.error.issues,
      });
    }
    return this.productService.bulkApproveProducts(
      parsed.data,
      req.user.id,
      req.idempotencyKey,
      req,
    );
  }
}
