import { Test, TestingModule } from '@nestjs/testing';
import { RfqService } from '../rfq/rfq.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { RfqRepository } from '../rfq/rfq.repository';
import { QuotationRepository } from '../rfq/quotation.repository';
import { OrdersService } from '../../order/orders.service';
import { AuditSafeWriterService } from '../../security/audit/audit-safe-writer.service';
import { MetricsService } from '../../observability/metrics.service';
import { ConfigService } from '@nestjs/config';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { RfqStatus, QuotationStatus } from '@vyaparnet/database';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('Phase 5: ProcurementModule + RFQ (INV-S8)', () => {
  let service: RfqService;
  let prisma: any;
  let rfqRepo: any;
  let quoteRepo: any;

  beforeEach(async () => {
    prisma = {
      business: { findFirst: vi.fn() },
      product: { findMany: vi.fn() },
      appConfig: { findUnique: vi.fn() },
      quotation: { updateMany: vi.fn() },
      eventOutbox: { create: vi.fn() },
      $transaction: vi.fn().mockImplementation(async (cb) => cb(prisma)),
    };

    rfqRepo = {
      findManyForSeller: vi.fn(),
      findById: vi.fn(),
    };

    quoteRepo = {
      create: vi.fn(),
      findByIdForSeller: vi.fn(),
      addNegotiation: vi.fn(),
      updateStatus: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RfqService,
        { provide: PrismaService, useValue: prisma },
        { provide: RfqRepository, useValue: rfqRepo },
        { provide: QuotationRepository, useValue: quoteRepo },
        { provide: OrdersService, useValue: { createFromQuotation: vi.fn() } },
        { provide: AuditSafeWriterService, useValue: { safeWrite: vi.fn() } },
        { provide: MetricsService, useValue: { rfqCreatedTotal: { inc: vi.fn() } } },
        { provide: ConfigService, useValue: { get: vi.fn() } },
      ],
    }).compile();

    service = module.get<RfqService>(RfqService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('INV-S8-17: Seller Quote Scoping', () => {
    it('should only return RFQs matching seller segment and products', async () => {
      // Mock business segment and products
      prisma.business.findFirst.mockResolvedValue({ id: 'biz-1', segment: 'ELECTRONICS' } as any);
      prisma.product.findMany.mockResolvedValue([{ id: 'prod-1' }, { id: 'prod-2' }] as any);
      
      const rfqs = [{ id: 'rfq-1', items: [{ productId: 'prod-1' }] }];
      rfqRepo.findManyForSeller.mockResolvedValue(rfqs as any);

      const result = await service.getSellerRfqs('seller-1');
      expect(prisma.business.findFirst).toHaveBeenCalledWith({ where: { ownerId: 'seller-1' } });
      expect(prisma.product.findMany).toHaveBeenCalledWith({ where: { businessId: 'biz-1', isDeleted: false }, select: { id: true } });
      expect(rfqRepo.findManyForSeller).toHaveBeenCalledWith('ELECTRONICS', ['prod-1', 'prod-2']);
      expect(result).toEqual(rfqs);
    });
  });

  describe('INV-S8-27: KYC Validation for Quotes', () => {
    it('should throw ForbiddenException if seller is not VERIFIED', async () => {
      prisma.business.findFirst.mockResolvedValue({ id: 'biz-1', kycStatus: 'PENDING' } as any);

      await expect(service.submitQuotation('rfq-1', 'seller-1', {} as any)).rejects.toThrow(ForbiddenException);
      expect(prisma.business.findFirst).toHaveBeenCalledWith({ where: { ownerId: 'seller-1' } });
    });

    it('should proceed if seller is VERIFIED', async () => {
      prisma.business.findFirst.mockResolvedValue({ id: 'biz-1', kycStatus: 'VERIFIED', segment: 'ELECTRONICS' } as any);
      rfqRepo.findById.mockResolvedValue({ id: 'rfq-1', buyerId: 'buyer-1', status: RfqStatus.OPEN } as any);
      const quoteData = { id: 'quote-1' };
      quoteRepo.create.mockResolvedValue(quoteData as any);

      const dto = {
        subtotal: '100.00', taxAmount: '10.00', discount: '0.00', grandTotal: '110.00', validUntil: '2026-12-31T23:59:59Z',
        items: [{ productId: 'prod-1', productName: 'P1', productSlug: 'p1', quantity: 1, unitPrice: '100.00', totalPrice: '100.00' }]
      };

      const result = await service.submitQuotation('rfq-1', 'seller-1', dto as any);
      expect(result).toEqual(quoteData);
    });
  });

  describe('INV-S8-20: Negotiation Rounds Limit', () => {
    it('should throw BadRequestException if max rounds exceeded', async () => {
      const quotation = {
        id: 'quote-1',
        status: QuotationStatus.NEGOTIATING,
        negotiations: [{}, {}, {}], // 3 rounds already
      };
      prisma.business.findFirst.mockResolvedValue({ id: 'biz-1' } as any);
      quoteRepo.findByIdForSeller.mockResolvedValue(quotation as any);
      // Mock AppConfig to return 3 max rounds
      prisma.appConfig.findUnique.mockResolvedValue({ value: '3' } as any);

      await expect(service.negotiatePrice('quote-1', 'seller-1', 'SELLER', { proposedPrice: '90.00', message: 'Counter' })).rejects.toThrow(BadRequestException);
    });

    it('should add negotiation if rounds are within limit', async () => {
      const quotation = {
        id: 'quote-1',
        status: QuotationStatus.DRAFT,
        negotiations: [{}, {}], // 2 rounds
      };
      prisma.business.findFirst.mockResolvedValue({ id: 'biz-1' } as any);
      quoteRepo.findByIdForSeller.mockResolvedValue(quotation as any);
      prisma.appConfig.findUnique.mockResolvedValue({ value: '3' } as any);
      
      const negData = { id: 'neg-1' };
      
      quoteRepo.addNegotiation.mockResolvedValue(negData as any);
      quoteRepo.updateStatus.mockResolvedValue(quotation as any);

      const result = await service.negotiatePrice('quote-1', 'seller-1', 'SELLER', { proposedPrice: '1100.00' });
      expect(result).toEqual(negData);
      expect(quoteRepo.updateStatus).toHaveBeenCalledWith('quote-1', QuotationStatus.NEGOTIATING, expect.anything());
    });
  });
});
