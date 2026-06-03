import { Controller, Post, Get, Param, UseGuards, Req } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { AdminContextGuard } from '../guards/admin-context.guard';
import { AdminRateLimitGuard } from '../guards/admin-rate-limit.guard';
import { AdminIdempotencyGuard } from '../guards/admin-idempotency.guard';
import {
  AdminInvoiceService,
  TaxInvoiceDto,
} from '../services/admin-invoice.service';

/**
 * AdminInvoicesController — Tax Invoice endpoints for Sprint 7 Phase 7.
 *
 * Routes:
 *  POST /admin/invoices/generate/:orderId → generate (or return existing) invoice
 *  GET  /admin/invoices/:orderId          → get invoice with signed S3 URL
 *
 * FOOTGUN-7-D: POST is the ONLY trigger for invoice generation. No auto-gen on COMPLETED.
 * FOOTGUN-7-C: pdfUrl in response is signed URL generated at response time (not stored URL).
 * INV-S7-17: Only this endpoint triggers generation.
 *
 * Guard stack: JwtAuthGuard → AdminContextGuard → AdminRateLimitGuard
 * POST route: + AdminIdempotencyGuard (INV-S7-7)
 *
 * Authority: §22 Phase 7, Step 7.4.
 */
@Controller('admin/invoices')
@UseGuards(JwtAuthGuard, AdminContextGuard, AdminRateLimitGuard)
export class AdminInvoicesController {
  constructor(private readonly invoiceService: AdminInvoiceService) {}

  /**
   * POST /admin/invoices/generate/:orderId
   * Generates a tax invoice for a COMPLETED order.
   * Idempotent — returns existing invoice if already generated.
   * INV-S7-16: < 2000ms → 200 TaxInvoiceDto; ≥ 2000ms → 202 { invoiceId, status: 'GENERATING' }
   * FOOTGUN-7-D: Manual admin trigger ONLY.
   */
  @Post('generate/:orderId')
  @UseGuards(AdminIdempotencyGuard)
  async generateInvoice(
    @Param('orderId') orderId: string,
    @Req() req: Request & { user: { id: string } },
  ): Promise<TaxInvoiceDto | { invoiceId: string; status: 'GENERATING' }> {
    return this.invoiceService.generateInvoice(orderId, req.user.id);
  }

  /**
   * GET /admin/invoices/:orderId
   * Returns invoice with freshly-generated signed S3 URL (5 min TTL — INV-S7-9).
   * FOOTGUN-7-C: pdfSignedUrl is generated at response time — never stored in DB.
   */
  @Get(':orderId')
  async getInvoice(@Param('orderId') orderId: string): Promise<TaxInvoiceDto> {
    return this.invoiceService.getInvoice(orderId);
  }
}
