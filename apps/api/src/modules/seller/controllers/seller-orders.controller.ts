import { Controller, Get, Patch, Post, Param, Query, Body, Req, UseGuards } from '@nestjs/common';
import { SellerOrderService } from '../services/seller-order.service';
import { SellerDispatchProofService } from '../services/seller-dispatch-proof.service';
import { SellerContextGuard } from '../guards/seller-context.guard';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { UserRole } from '@vyaparnet/database';
import { ZodValidationPipe } from '../../../shared/pipes/zod-validation.pipe';
import {
  TransitionStatusSchema,
  TransitionStatusDto,
  SellerOrderFilterSchema,
  SellerOrderFilterDto,
  DispatchProofConfirmSchema,
  DispatchProofConfirmDto,
} from '@vyaparnet/types';

@Controller('seller/orders')
@UseGuards(JwtAuthGuard, RolesGuard, SellerContextGuard) // INV-S5-2: SellerContextGuard on EVERY seller route class
@Roles(UserRole.SELLER)                                   // INV-S5-21: SELLER role required
export class SellerOrdersController {
  constructor(
    private readonly sellerOrderService: SellerOrderService,
    private readonly sellerDispatchProofService: SellerDispatchProofService,
  ) {}

  // ─── Order List & Detail ────────────────────────────────────────────────────

  @Get()
  async getOrders(
    @Req() req: any,
    @Query(new ZodValidationPipe(SellerOrderFilterSchema)) filter: SellerOrderFilterDto,
  ) {
    // req.seller.businessId enforces cross-seller isolation (INV-S5-3)
    return this.sellerOrderService.getOrders(req.seller, filter);
  }

  @Get(':id')
  async getOrder(
    @Req() req: any,
    @Param('id') orderId: string,
  ) {
    // Cross-seller access returns 404 ORDER_NOT_FOUND — not 403 (security: don't reveal existence)
    return this.sellerOrderService.getOrder(orderId, req.seller);
  }

  // ─── Status Transition ──────────────────────────────────────────────────────

  @Patch(':id/status')
  async transitionStatus(
    @Req() req: any,
    @Param('id') orderId: string,
    @Body(new ZodValidationPipe(TransitionStatusSchema)) dto: TransitionStatusDto,
  ) {
    return this.sellerOrderService.transitionStatus(orderId, req.seller, dto);
  }

  // ─── Dispatch Proof Workflow ─────────────────────────────────────────────────

  /**
   * Step 1: Get pre-signed S3 URL for direct client-side upload.
   * Server controls the s3Key prefix — prevents cross-seller abuse (INV-S5-26).
   * Order MUST be in SHIPPED/OUT_FOR_DELIVERY/DELIVERED status.
   * S3 URL generation is OUTSIDE $transaction (transaction boundary rule §4).
   */
  @Post(':id/dispatch-proof/upload-url')
  async getDispatchProofUploadUrl(
    @Req() req: any,
    @Param('id') orderId: string,
  ) {
    return this.sellerDispatchProofService.generateUploadUrl(orderId, req.seller);
  }

  /**
   * Step 3: Confirm dispatch proof after client uploaded to S3.
   * Validates s3Key ownership prefix (INV-S5-11).
   * Calls S3 HEAD to verify file exists (INV-S5-10).
   * Validates MIME type against explicit allowed list (INV-S5-35).
   * Writes dispatchProofUrl to OrderTracking — idempotent.
   * NO EventOutbox, NO OrderStatusHistory (INV-S5-9).
   */
  @Post(':id/dispatch-proof/confirm')
  async confirmDispatchProof(
    @Req() req: any,
    @Param('id') orderId: string,
    @Body(new ZodValidationPipe(DispatchProofConfirmSchema)) dto: DispatchProofConfirmDto,
  ) {
    return this.sellerDispatchProofService.confirmDispatchProof(orderId, req.seller, dto);
  }
}
