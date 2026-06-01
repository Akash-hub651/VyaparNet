import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { S3Service } from '../../s3/s3.service';
import { AdminInvoiceService } from '../services/admin-invoice.service';
import { AdminOrderRepository } from '../repositories/admin-order.repository';

interface InvoiceGenerationJob {
  orderId: string;
  taxInvoiceId: string;
  adminUserId: string;
}

/**
 * InvoiceGenerationWorker — async PDF generation worker (BullMQ).
 *
 * Triggered when AdminInvoiceService.generateInvoice() takes ≥ 2000ms
 * (INV-S7-16 async path) or PDF generation fails synchronously.
 *
 * Responsibilities:
 *  1. Fetch order and existing TaxInvoice record
 *  2. Recalculate GST (same logic as sync path)
 *  3. Generate PDF via pdf-lib
 *  4. Upload to S3 (store key only — FOOTGUN-7-C)
 *  5. Update TaxInvoice.pdfUrl with S3 key
 *
 * FOOTGUN-7-B: PDF generation OUTSIDE $transaction — entire worker is non-transactional.
 * FOOTGUN-7-C: Stores S3 key only in DB — never presigned URL.
 *
 * Authority: §22 Phase 7, Step 7.3.
 */
@Processor('invoice-generation')
export class InvoiceGenerationWorker {
  private readonly logger = new Logger(InvoiceGenerationWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
    private readonly invoiceService: AdminInvoiceService,
    private readonly orderRepo: AdminOrderRepository,
  ) {}

  @Process()
  async process(job: Job<InvoiceGenerationJob>): Promise<void> {
    const { orderId, taxInvoiceId, adminUserId } = job.data;

    this.logger.log(
      { jobId: job.id, orderId, taxInvoiceId, adminUserId },
      'INVOICE_GENERATION_WORKER_START',
    );

    // Step 1: Load order with buyer PII
    const order = await this.orderRepo.findById(orderId);
    if (!order) {
      this.logger.error({ orderId }, 'INVOICE_WORKER_ORDER_NOT_FOUND');
      throw new Error(`Order not found: ${orderId}`);
    }

    // Step 2: Recalculate GST using same logic as sync path
    const gstCalc = this.invoiceService.calculateGst(order);

    // Step 3: Generate PDF (FOOTGUN-7-B: outside $transaction)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
    const pdfBuffer: Buffer = await (this.invoiceService as any).generatePdf(
      { id: taxInvoiceId, invoiceNumber: `ASYNC-${taxInvoiceId}`, invoiceDate: new Date() },
      order,
      gstCalc,
    );

    // Step 4: Upload to S3
    const s3Key = `invoices/${orderId}/${taxInvoiceId}.pdf`;
    await this.s3Service.uploadBuffer(pdfBuffer, s3Key, 'application/pdf');

    // Step 5: Update DB record with S3 key (FOOTGUN-7-C: key only — never signed URL)
    await this.prisma.taxInvoice.update({
      where: { id: taxInvoiceId },
      data: { pdfUrl: s3Key },
    });

    this.logger.log(
      { jobId: job.id, orderId, taxInvoiceId, s3Key },
      'INVOICE_GENERATION_WORKER_COMPLETE',
    );
  }
}
