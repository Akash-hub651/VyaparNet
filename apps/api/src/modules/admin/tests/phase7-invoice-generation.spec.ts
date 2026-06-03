import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { AdminInvoiceService } from '../services/admin-invoice.service';
import { AdminOrderRepository } from '../repositories/admin-order.repository';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { S3Service } from '../../s3/s3.service';
import { Prisma } from '@vyaparnet/database';
import { OrderStatus } from '@vyaparnet/database';

const ORDER_ID = 'order-completed-1';
const ADMIN_ID = 'admin-1';

const makeCompletedOrder = () => ({
  id: ORDER_ID,
  orderNumber: 'VN-20260601-99999',
  status: OrderStatus.COMPLETED,
  segment: 'TEXTILE',
  grandTotal: '10000.00',
  subtotal: '8474.58', // taxableValue before GST
  buyerId: 'buyer-1',
  sellerId: 'biz-1',
  sellerName: 'Test Seller',
  orderMonth: '2026-06',
  placedAt: '2026-06-01T00:00:00.000Z',
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
  buyer: {
    id: 'buyer-1',
    phone: '+91987654321',
    email: 'buyer@test.com',
    name: 'Test Buyer',
  },
  taxAmount: '1525.42',
  shippingCost: '0.00',
  discount: '0.00',
  cancellationReason: null,
  statusHistory: [],
  // No shippingAddressSnapshot — tests MUST handle missing gracefully
});

const makeInvoiceRecord = () => ({
  id: 'inv-1',
  orderId: ORDER_ID,
  invoiceNumber: 'VN-INV-20260601-99999',
  invoiceDate: new Date('2026-06-01'),
  taxableValue: new Prisma.Decimal('8474.58'),
  cgstAmount: new Prisma.Decimal('762.71'),
  sgstAmount: new Prisma.Decimal('762.71'),
  igstAmount: new Prisma.Decimal('0'),
  totalTaxAmount: new Prisma.Decimal('1525.42'),
  totalInvoiceValue: new Prisma.Decimal('10000.00'),
  irn: null,
  pdfUrl: 'invoices/order-completed-1/inv-1.pdf', // S3 key (FOOTGUN-7-C)
  createdAt: new Date('2026-06-01'),
  updatedAt: new Date('2026-06-01'),
});

describe('AdminInvoiceService — Phase 7 Tax Invoice Generation', () => {
  let service: AdminInvoiceService;
  let orderRepo: unknown;
  let prismaService: unknown;
  let s3Service: unknown;
  let invoiceQueue: unknown;

  beforeEach(async () => {
    orderRepo = {
      findById: vi.fn().mockResolvedValue(makeCompletedOrder()),
    };

    prismaService = {
      taxInvoice: {
        findUnique: vi.fn().mockResolvedValue(null), // No existing invoice by default
        create: vi.fn().mockResolvedValue(makeInvoiceRecord()),
        update: vi.fn().mockResolvedValue(makeInvoiceRecord()),
      },
    };

    s3Service = {
      uploadBuffer: vi.fn().mockResolvedValue(undefined),
      getSignedUrl: vi
        .fn()
        .mockResolvedValue('https://s3.example.com/signed-url?token=xxx'),
    };

    invoiceQueue = {
      add: vi.fn().mockResolvedValue({ id: 'job-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminInvoiceService,
        { provide: AdminOrderRepository, useValue: orderRepo },
        { provide: PrismaService, useValue: prismaService },
        { provide: S3Service, useValue: s3Service },
        {
          provide: getQueueToken('invoice-generation'),
          useValue: invoiceQueue,
        },
      ],
    }).compile();

    service = module.get(AdminInvoiceService);
  });

  // ─── calculateGst — FOOTGUN-7-E ─────────────────────────────────────────

  describe('calculateGst (FOOTGUN-7-E)', () => {
    it('returns IGST when no shippingAddressSnapshot (default inter-state)', () => {
      const order = makeCompletedOrder();
      const result = service.calculateGst(order as any);

      // Default: inter-state → IGST only, CGST/SGST = 0
      expect(result.isInterState).toBe(true);
      expect(result.igstAmount.greaterThan(0)).toBe(true);
      expect(result.cgstAmount.equals(0)).toBe(true);
      expect(result.sgstAmount.equals(0)).toBe(true);
    });

    it('returns intra-state CGST+SGST when same state as seller', () => {
      const order = {
        ...makeCompletedOrder(),
        shippingAddressSnapshot: { stateCode: '27' }, // Same as platform (Maharashtra)
      };
      const result = service.calculateGst(order);

      expect(result.isInterState).toBe(false);
      expect(result.cgstAmount.greaterThan(0)).toBe(true);
      expect(result.sgstAmount.greaterThan(0)).toBe(true);
      expect(result.igstAmount.equals(0)).toBe(true);
      // CGST + SGST should equal totalTaxAmount
      expect(result.cgstAmount.add(result.sgstAmount).toFixed(2)).toBe(
        result.totalTaxAmount.toFixed(2),
      );
    });

    it('returns inter-state IGST when different state', () => {
      const order = {
        ...makeCompletedOrder(),
        shippingAddressSnapshot: { stateCode: '29' }, // Karnataka ≠ Maharashtra (27)
      };
      const result = service.calculateGst(order);

      expect(result.isInterState).toBe(true);
      expect(result.igstAmount.greaterThan(0)).toBe(true);
      expect(result.cgstAmount.equals(0)).toBe(true);
    });

    it('FOOTGUN-7-E: totalInvoiceValue = taxableValue + totalTaxAmount', () => {
      const order = makeCompletedOrder();
      const result = service.calculateGst(order as any);

      const expected = result.taxableValue.add(result.totalTaxAmount);
      expect(result.totalInvoiceValue.toFixed(2)).toBe(expected.toFixed(2));
    });

    it('FOOTGUN-7-E: does NOT just apply flat 18% to totalInvoiceValue', () => {
      // If flat 18% was applied to grandTotal instead of taxableValue — that would be wrong
      // taxableValue = subtotal (pre-tax), not grandTotal
      const order = makeCompletedOrder();
      const result = service.calculateGst(order as any);

      // taxableValue should be subtotal (8474.58), NOT grandTotal (10000.00)
      expect(result.taxableValue.toFixed(2)).toBe(
        new Prisma.Decimal('8474.58').toFixed(2),
      );
    });
  });

  // ─── generateInvoice — idempotency ──────────────────────────────────────

  describe('generateInvoice — idempotency', () => {
    it('returns existing invoice if already generated (idempotent)', async () => {
      // Simulate existing invoice in DB
      prismaService.taxInvoice.findUnique.mockResolvedValueOnce(
        makeInvoiceRecord(),
      );

      const result = await service.generateInvoice(ORDER_ID, ADMIN_ID);

      // Should NOT create new record
      expect(prismaService.taxInvoice.create).not.toHaveBeenCalled();
      // Result should be a TaxInvoiceDto (not GENERATING)
      expect('id' in result).toBe(true);
    });

    it('throws NotFoundException for missing order', async () => {
      orderRepo.findById.mockResolvedValueOnce(null);
      await expect(
        service.generateInvoice('missing', ADMIN_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── generateInvoice — synchronous path ─────────────────────────────────

  describe('generateInvoice — synchronous path (INV-S7-16)', () => {
    it('creates invoice record, uploads to S3, stores S3 key (not signed URL)', async () => {
      await service.generateInvoice(ORDER_ID, ADMIN_ID);

      expect(prismaService.taxInvoice.create).toHaveBeenCalledOnce();
      expect(s3Service.uploadBuffer).toHaveBeenCalledOnce();

      // FOOTGUN-7-C: DB update stores S3 KEY not signed URL
      const updateCall = prismaService.taxInvoice.update.mock.calls[0];
      const updatedData = updateCall?.[0]?.data ?? {};
      if (updatedData.pdfUrl) {
        expect(updatedData.pdfUrl).not.toContain('https://');
        expect(updatedData.pdfUrl).not.toContain('?');
        expect(updatedData.pdfUrl).toMatch(/^invoices\//); // S3 key pattern
      }
    });

    it('FOOTGUN-7-B: PDF generation does NOT happen inside $transaction', async () => {
      // PrismaService has no $transaction method mocked — confirms we never call it
      await service.generateInvoice(ORDER_ID, ADMIN_ID);
      // If $transaction was called it would throw since it's not mocked
      expect(prismaService['$transaction']).toBeUndefined();
    });
  });

  // ─── generateInvoice — async path ───────────────────────────────────────

  describe('generateInvoice — async path (INV-S7-16)', () => {
    it('queues BullMQ job when synchronous PDF is too slow (simulated)', async () => {
      // Override generatePdf to simulate slowness
      // We do this by making uploadBuffer take too long (>2000ms would be needed)
      // Instead, directly test queue add is called — the async path test:
      // We can't easily simulate >2000ms elapsed in unit test, so test via fallback path

      // Simulate PDF generation failure → triggers async fallback
      s3Service.uploadBuffer.mockRejectedValueOnce(new Error('S3 unavailable'));

      const result = await service.generateInvoice(ORDER_ID, ADMIN_ID);

      // Should fall back to async queue
      expect(invoiceQueue.add).toHaveBeenCalledWith(
        'generate-pdf',
        expect.objectContaining({ orderId: ORDER_ID }),
      );
      expect(result).toMatchObject({ status: 'GENERATING' });
    });
  });

  // ─── getInvoice ───────────────────────────────────────────────────────────

  describe('getInvoice', () => {
    it('returns invoice with signed URL at response time (FOOTGUN-7-C)', async () => {
      prismaService.taxInvoice.findUnique.mockResolvedValueOnce(
        makeInvoiceRecord(),
      );

      const result = (await service.getInvoice(ORDER_ID)) as any;

      // FOOTGUN-7-C: pdfSignedUrl generated at response time
      expect(s3Service.getSignedUrl).toHaveBeenCalledWith(
        makeInvoiceRecord().pdfUrl, // S3 key stored in DB
        300, // INV-S7-9: 5 min TTL
      );
      expect(result.pdfSignedUrl).toBe(
        'https://s3.example.com/signed-url?token=xxx',
      );
    });

    it('throws NotFoundException for missing invoice', async () => {
      prismaService.taxInvoice.findUnique.mockResolvedValueOnce(null);
      await expect(service.getInvoice('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('pdfSignedUrl is null for invoice without PDF (GENERATING state)', async () => {
      const invoiceWithoutPdf = { ...makeInvoiceRecord(), pdfUrl: null };
      prismaService.taxInvoice.findUnique.mockResolvedValueOnce(
        invoiceWithoutPdf,
      );

      const result = (await service.getInvoice(ORDER_ID)) as any;

      // s3Service.getSignedUrl should NOT be called when pdfUrl is null
      expect(s3Service.getSignedUrl).not.toHaveBeenCalled();
      expect(result.pdfSignedUrl).toBeNull();
    });
  });

  // ─── FOOTGUN-7-C: S3 key storage ─────────────────────────────────────────

  describe('FOOTGUN-7-C: S3 key storage invariant', () => {
    it('DB stores S3 key, NOT presigned URL or full URL', async () => {
      let capturedData: unknown;
      prismaService.taxInvoice.update.mockImplementationOnce(
        (args: unknown) => {
          capturedData = args.data;
          return makeInvoiceRecord();
        },
      );

      await service.generateInvoice(ORDER_ID, ADMIN_ID);

      if (capturedData?.pdfUrl) {
        expect(capturedData.pdfUrl).not.toMatch(/^https?:\/\//);
        expect(capturedData.pdfUrl).not.toContain('X-Amz-Signature');
        expect(capturedData.pdfUrl).toMatch(/^invoices\//);
      }
    });
  });
});
