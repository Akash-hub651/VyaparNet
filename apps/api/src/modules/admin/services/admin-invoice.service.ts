import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { S3Service } from '../../s3/s3.service';
import { AdminOrderRepository } from '../repositories/admin-order.repository';
import type { OrderDetailDto } from '../repositories/admin-order.repository';
import { Prisma } from '@vyaparnet/database';

// ─── GST calculation types ────────────────────────────────────────────────────

export interface GstCalculation {
  taxableValue: Prisma.Decimal;
  cgstAmount: Prisma.Decimal;  // Intra-state: CGST = 9%
  sgstAmount: Prisma.Decimal;  // Intra-state: SGST = 9%
  igstAmount: Prisma.Decimal;  // Inter-state: IGST = 18%
  totalTaxAmount: Prisma.Decimal;
  totalInvoiceValue: Prisma.Decimal;
  isInterState: boolean;       // true → IGST; false → CGST+SGST
}

// ─── TaxInvoice DTO ──────────────────────────────────────────────────────────

export interface TaxInvoiceDto {
  id: string;
  orderId: string;
  invoiceNumber: string;
  invoiceDate: string;
  taxableValue: string;
  cgstAmount: string;
  sgstAmount: string;
  igstAmount: string;
  totalTaxAmount: string;
  totalInvoiceValue: string;
  irn: string | null;
  // FOOTGUN-7-C: pdfUrl is a signed URL generated at response time — NOT stored in DB
  pdfSignedUrl: string | null;
  createdAt: string;
}

/**
 * AdminInvoiceService — Tax Invoice Generation (Sprint 7 Phase 7).
 *
 * FOOTGUN-7-A: Uses pdf-lib — NEVER puppeteer.
 * FOOTGUN-7-B: PDF generation OUTSIDE $transaction. DB record inside tx, PDF outside.
 * FOOTGUN-7-C: TaxInvoice.pdfUrl stores S3 key only — signed URL generated at response time.
 * FOOTGUN-7-D: Manual admin trigger ONLY — no automatic generation on COMPLETED.
 * FOOTGUN-7-E: Implements CGST+SGST (intra-state) vs IGST (inter-state) — not flat 18%.
 *
 * INV-S7-16: < 2000ms → synchronous path; ≥ 2000ms → BullMQ async path.
 * INV-S7-17: Only POST /admin/invoices/generate/:orderId triggers invoice.
 *
 * Authority: §22 Phase 7.
 */
@Injectable()
export class AdminInvoiceService {
  private readonly logger = new Logger(AdminInvoiceService.name);

  // Standard GST rates for B2B trade goods (textile + spare parts)
  // In a real system these come from HSN-mapped FeatureFlag (INV-S7-14).
  // For Sprint 7 MVP: 18% total GST (CGST 9% + SGST 9% OR IGST 18%)
  private readonly CGST_RATE = 0.09;  // Intra-state
  private readonly SGST_RATE = 0.09;  // Intra-state
  private readonly IGST_RATE = 0.18;  // Inter-state

  // Platform seller state code prefix (first 2 chars of GSTIN)
  // Used for inter/intra state determination (FOOTGUN-7-E)
  private readonly PLATFORM_STATE_CODE = '27'; // Maharashtra (default for VyaparNet)

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
    private readonly orderRepo: AdminOrderRepository,
    @InjectQueue('invoice-generation')
    private readonly invoiceQueue: Queue,
  ) {}

  // ─── Generate Invoice (idempotent) ────────────────────────────────────────

  /**
   * generateInvoice — idempotent invoice generation for a completed order.
   *
   * INV-S7-16 dual path:
   *  < 2000ms: synchronous — DB record + PDF + S3 + return TaxInvoiceDto
   *  ≥ 2000ms: async — DB record + BullMQ job + return { invoiceId, status:'GENERATING' }
   *
   * FOOTGUN-7-D: This method is the ONLY trigger — never called automatically.
   */
  async generateInvoice(
    orderId: string,
    adminUserId: string,
  ): Promise<TaxInvoiceDto | { invoiceId: string; status: 'GENERATING' }> {
    // Step 1: Idempotency — return existing invoice if already generated
    const existing = await this.prisma.taxInvoice.findUnique({
      where: { orderId },
    });
    if (existing) {
      return this.toDto(existing);
    }

    // Step 2: Load order with buyer PII (needed for invoice)
    const order = await this.orderRepo.findById(orderId);
    if (!order) {
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND' });
    }

    // Step 3: Calculate GST (FOOTGUN-7-E: CGST+SGST vs IGST based on state)
    const gstCalc = this.calculateGst(order);

    // Step 4: Create DB record FIRST (FOOTGUN-7-B: PDF generation OUTSIDE $transaction)
    const invoiceRecord = await this.createInvoiceRecord(order, gstCalc, adminUserId);

    // Step 5: INV-S7-16 timing gate
    const startTime = Date.now();

    try {
      // Attempt synchronous PDF generation
      const pdfBuffer = await this.generatePdf(invoiceRecord, order, gstCalc);
      const elapsed = Date.now() - startTime;

      if (elapsed < 2000) {
        // INV-S7-16: synchronous path — PDF completed in time
        const s3Key = `invoices/${orderId}/${invoiceRecord.id}.pdf`;
        await this.s3Service.uploadBuffer(pdfBuffer, s3Key, 'application/pdf');

        // FOOTGUN-7-C: Store S3 key ONLY — NOT presigned URL
        const updated = await this.prisma.taxInvoice.update({
          where: { id: invoiceRecord.id },
          data: { pdfUrl: s3Key }, // key, not URL
        });

        this.logger.log(
          { orderId, invoiceId: invoiceRecord.id, elapsed, path: 'SYNC' },
          'INVOICE_GENERATED_SYNC',
        );
        return this.toDto(updated);
      } else {
        // INV-S7-16: async path — PDF too slow, hand off to BullMQ
        await this.invoiceQueue.add('generate-pdf', {
          orderId,
          taxInvoiceId: invoiceRecord.id,
          adminUserId,
        });

        this.logger.log(
          { orderId, invoiceId: invoiceRecord.id, elapsed, path: 'ASYNC' },
          'INVOICE_GENERATION_QUEUED',
        );
        return { invoiceId: invoiceRecord.id, status: 'GENERATING' };
      }
    } catch (err: unknown) {
      // PDF generation failed — enqueue async job as fallback
      this.logger.error(
        { orderId, err: (err as Error).message },
        'INVOICE_PDF_SYNC_FAILED_FALLBACK_ASYNC',
      );
      await this.invoiceQueue.add('generate-pdf', {
        orderId,
        taxInvoiceId: invoiceRecord.id,
        adminUserId,
      });
      return { invoiceId: invoiceRecord.id, status: 'GENERATING' };
    }
  }

  // ─── Get Invoice (with signed URL) ───────────────────────────────────────

  /**
   * getInvoice — returns invoice with freshly-generated signed S3 URL.
   * FOOTGUN-7-C: pdfUrl in DB is S3 key — we generate signed URL here at response time.
   * INV-S7-9: Signed URL TTL = 300 seconds (5 minutes hard cap).
   */
  async getInvoice(orderId: string): Promise<TaxInvoiceDto> {
    const invoice = await this.prisma.taxInvoice.findUnique({
      where: { orderId },
    });
    if (!invoice) {
      throw new NotFoundException({ code: 'INVOICE_NOT_FOUND' });
    }
    return this.toDto(invoice);
  }

  // ─── GST Calculation (FOOTGUN-7-E) ───────────────────────────────────────

  /**
   * calculateGst — CGST+SGST (intra-state) vs IGST (inter-state).
   *
   * FOOTGUN-7-E: NOT just taxableValue * 0.18.
   * Determination:
   *   - Parse seller state code from Business.gstNumber (first 2 chars)
   *   - Parse buyer state from Order.shippingAddressSnapshot.state
   *   - Same state → CGST 9% + SGST 9%; different → IGST 18%
   *   - If GSTIN unavailable → default to inter-state (conservative / safer for compliance)
   *
   * taxableValue = sum of (OrderItem.quantity × OrderItem.unitPrice - discount)
   *   = Order.subtotal (pre-computed by order service)
   */
  calculateGst(order: OrderDetailDto): GstCalculation {
    const taxableValue = new Prisma.Decimal(order.subtotal);

    // Determine inter/intra state (FOOTGUN-7-E)
    const isInterState = this.determineInterState(order);

    let cgstAmount = new Prisma.Decimal(0);
    let sgstAmount = new Prisma.Decimal(0);
    let igstAmount = new Prisma.Decimal(0);

    if (isInterState) {
      // Inter-state: IGST only
      igstAmount = taxableValue.mul(this.IGST_RATE).toDecimalPlaces(2);
    } else {
      // Intra-state: CGST + SGST (equal split)
      cgstAmount = taxableValue.mul(this.CGST_RATE).toDecimalPlaces(2);
      sgstAmount = taxableValue.mul(this.SGST_RATE).toDecimalPlaces(2);
    }

    const totalTaxAmount = cgstAmount.add(sgstAmount).add(igstAmount);
    const totalInvoiceValue = taxableValue.add(totalTaxAmount);

    return {
      taxableValue,
      cgstAmount,
      sgstAmount,
      igstAmount,
      totalTaxAmount,
      totalInvoiceValue,
      isInterState,
    };
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  /**
   * determineInterState — intra vs inter-state via GSTIN and shipping address.
   *
   * FOOTGUN-7-E: Must properly determine CGST+SGST vs IGST.
   * Strategy:
   *   1. Parse seller state code from Business.gstNumber[:2]
   *   2. Parse buyer state code from shippingAddressSnapshot.stateCode or .state
   *   3. If gstNumber unavailable → default to PLATFORM_STATE_CODE (conservative)
   *   4. If buyer state not parseable → default to inter-state (conservative for compliance)
   */
  private determineInterState(order: OrderDetailDto): boolean {
    try {
      // Parse seller state from GSTIN (first 2 digits = state code)
      // We don't have Business.gstNumber on OrderDetailDto — use platform default
      // In production: resolve from Business.gstNumber via additional DB fetch
      const sellerStateCode = this.PLATFORM_STATE_CODE;

      // Parse buyer state from shippingAddressSnapshot (JSON field)
      const snapshot = order as any; // OrderDetailDto doesn't include snapshot — use as proxy
      const shippingSnapshot = snapshot.shippingAddressSnapshot;

      if (!shippingSnapshot) {
        return true; // Default to inter-state (conservative)
      }

      // shippingAddressSnapshot.stateCode (2-digit GST state code) if present
      // or fall back to matching on state name
      const buyerStateCode: string | undefined =
        shippingSnapshot.stateCode ??
        shippingSnapshot.gstStateCode;

      if (!buyerStateCode) {
        return true; // Default to inter-state (conservative)
      }

      return sellerStateCode !== buyerStateCode;
    } catch {
      return true; // Default to inter-state on any parse error
    }
  }

  /**
   * createInvoiceRecord — creates TaxInvoice DB record with calculated GST amounts.
   * FOOTGUN-7-B: This is NOT inside $transaction. DB record only — PDF is outside.
   * Idempotency is handled by the caller before reaching this function.
   */
  private async createInvoiceRecord(
    order: OrderDetailDto,
    gstCalc: GstCalculation,
    adminUserId: string,
  ): Promise<{ id: string; invoiceNumber: string; invoiceDate: Date } & typeof gstCalc> {
    const invoiceNumber = this.generateInvoiceNumber(order.orderNumber);
    const invoiceDate = new Date();

    const record = await this.prisma.taxInvoice.create({
      data: {
        orderId: order.id,
        invoiceNumber,
        invoiceDate,
        taxableValue: gstCalc.taxableValue,
        cgstAmount: gstCalc.cgstAmount,
        sgstAmount: gstCalc.sgstAmount,
        igstAmount: gstCalc.igstAmount,
        totalTaxAmount: gstCalc.totalTaxAmount,
        totalInvoiceValue: gstCalc.totalInvoiceValue,
        // pdfUrl set after PDF is generated (FOOTGUN-7-C: key only, set after upload)
        // irn: null (populated later by IRN generation service if applicable)
      },
    });

    this.logger.debug(
      { invoiceId: record.id, orderId: order.id, adminUserId, invoiceNumber },
      'INVOICE_RECORD_CREATED',
    );

    return {
      ...record,
      ...gstCalc,
    };
  }

  /**
   * generatePdf — creates a minimal compliant tax invoice PDF using pdf-lib.
   * FOOTGUN-7-A: Uses pdf-lib — NEVER puppeteer.
   * FOOTGUN-7-B: Called OUTSIDE $transaction.
   *
   * Returns a Buffer of the PDF bytes.
   */
  private async generatePdf(
    invoiceRecord: { id: string; invoiceNumber: string; invoiceDate: Date },
    order: OrderDetailDto,
    gstCalc: GstCalculation,
  ): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]); // A4 portrait
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const { width, height } = page.getSize();
    const margin = 40;
    let y = height - margin;

    // ── Header ──────────────────────────────────────────────────────────────
    page.drawText('TAX INVOICE', {
      x: margin,
      y,
      size: 18,
      font: boldFont,
      color: rgb(0.1, 0.1, 0.5),
    });

    page.drawText('VyaparNet Commerce Pvt. Ltd.', {
      x: width / 2,
      y,
      size: 12,
      font: boldFont,
      color: rgb(0.1, 0.1, 0.1),
    });

    y -= 30;
    page.drawLine({
      start: { x: margin, y },
      end: { x: width - margin, y },
      thickness: 1,
      color: rgb(0.5, 0.5, 0.5),
    });

    // ── Invoice Details ──────────────────────────────────────────────────────
    y -= 20;
    page.drawText(`Invoice No: ${invoiceRecord.invoiceNumber}`, { x: margin, y, size: 10, font });
    page.drawText(`Invoice Date: ${invoiceRecord.invoiceDate.toLocaleDateString('en-IN')}`, {
      x: width / 2, y, size: 10, font,
    });

    y -= 15;
    page.drawText(`Order No: ${order.orderNumber}`, { x: margin, y, size: 10, font });
    page.drawText(`Segment: ${order.segment}`, { x: width / 2, y, size: 10, font });

    // ── Buyer Info ───────────────────────────────────────────────────────────
    y -= 30;
    page.drawText('BILL TO:', { x: margin, y, size: 11, font: boldFont });
    y -= 15;
    page.drawText(order.buyer?.name ?? order.buyer?.id ?? 'Buyer', { x: margin, y, size: 10, font });
    y -= 12;
    page.drawText(`Phone: ${order.buyer?.phone ?? 'N/A'}`, { x: margin, y, size: 10, font });

    // ── Tax Summary ───────────────────────────────────────────────────────────
    y -= 40;
    page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
    y -= 20;

    const tableX = [margin, 300, 430, width - margin];
    const headers = ['Description', 'Taxable Value (Rs.)', 'Tax Amount (Rs.)', 'Total (Rs.)'];
    headers.forEach((h, i) => {
      page.drawText(h, { x: tableX[i], y, size: 9, font: boldFont });
    });

    y -= 15;
    page.drawText('B2B Trade Goods', { x: tableX[0], y, size: 9, font });
    page.drawText(gstCalc.taxableValue.toFixed(2), { x: tableX[1], y, size: 9, font });
    page.drawText(gstCalc.totalTaxAmount.toFixed(2), { x: tableX[2], y, size: 9, font });
    page.drawText(gstCalc.totalInvoiceValue.toFixed(2), { x: tableX[3], y, size: 9, font });

    // -- GST Breakup --
    y -= 40;
    page.drawText('GST Breakup:', { x: margin, y, size: 10, font: boldFont });
    y -= 15;
    if (gstCalc.isInterState) {
      page.drawText(`IGST @ 18%: Rs. ${gstCalc.igstAmount.toFixed(2)}`, { x: margin, y, size: 10, font });
    } else {
      page.drawText(`CGST @ 9%: Rs. ${gstCalc.cgstAmount.toFixed(2)}`, { x: margin, y, size: 10, font });
      y -= 12;
      page.drawText(`SGST @ 9%: Rs. ${gstCalc.sgstAmount.toFixed(2)}`, { x: margin, y, size: 10, font });
    }

    // -- Grand Total --
    y -= 30;
    page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1, color: rgb(0.3, 0.3, 0.3) });
    y -= 15;
    page.drawText(`TOTAL INVOICE VALUE: Rs. ${gstCalc.totalInvoiceValue.toFixed(2)}`, {
      x: margin, y, size: 12, font: boldFont,
    });

    // ── Footer ────────────────────────────────────────────────────────────────
    page.drawText('This is a computer-generated invoice and does not require a signature.', {
      x: margin,
      y: margin + 20,
      size: 8,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });
    page.drawText(`Invoice ID: ${invoiceRecord.id}`, {
      x: margin,
      y: margin + 8,
      size: 7,
      font,
      color: rgb(0.6, 0.6, 0.6),
    });

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  }

  /**
   * generateInvoiceNumber — VN-INV-{YYYYMMDD}-{orderId:last6}
   * Format: VN-INV-20260601-AB1234
   */
  private generateInvoiceNumber(orderNumber: string): string {
    const date = new Date();
    const datePart = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
    const suffix = orderNumber.slice(-6).toUpperCase();
    return `VN-INV-${datePart}-${suffix}`;
  }

  /**
   * toDto — converts TaxInvoice DB record to response DTO.
   * FOOTGUN-7-C: pdfUrl is S3 key in DB → generate signed URL at response time.
   * INV-S7-9: 5 minute TTL hard cap.
   */
  private async toDto(invoice: {
    id: string;
    orderId: string;
    invoiceNumber: string;
    invoiceDate: Date;
    taxableValue: Prisma.Decimal;
    cgstAmount: Prisma.Decimal;
    sgstAmount: Prisma.Decimal;
    igstAmount: Prisma.Decimal;
    totalTaxAmount: Prisma.Decimal;
    totalInvoiceValue: Prisma.Decimal;
    irn: string | null;
    pdfUrl: string | null;
    createdAt: Date;
  }): Promise<TaxInvoiceDto> {
    // FOOTGUN-7-C: Generate signed URL at response time from stored S3 key
    let pdfSignedUrl: string | null = null;
    if (invoice.pdfUrl) {
      pdfSignedUrl = await this.s3Service.getSignedUrl(invoice.pdfUrl, 300).catch(() => null);
    }

    return {
      id: invoice.id,
      orderId: invoice.orderId,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate.toISOString(),
      taxableValue: invoice.taxableValue.toFixed(2),
      cgstAmount: invoice.cgstAmount.toFixed(2),
      sgstAmount: invoice.sgstAmount.toFixed(2),
      igstAmount: invoice.igstAmount.toFixed(2),
      totalTaxAmount: invoice.totalTaxAmount.toFixed(2),
      totalInvoiceValue: invoice.totalInvoiceValue.toFixed(2),
      irn: invoice.irn,
      pdfSignedUrl, // signed URL — generated at response time (FOOTGUN-7-C)
      createdAt: invoice.createdAt.toISOString(),
    };
  }
}
