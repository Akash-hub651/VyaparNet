import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  AdminProductService,
  BulkApproveResult,
} from '../services/admin-product.service';
import { AdminProductRepository } from '../repositories/admin-product.repository';
import { AdminMetricsService } from '../services/admin-metrics.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { RedisService } from '../../../core/redis/redis.service';
import { NotificationService } from '../../notification/services/notification.service';
import { AuditSafeWriterService } from '../../security/audit/audit-safe-writer.service';
import { ProductStatus } from '@vyaparnet/database';

const MOCK_PRODUCT = {
  id: 'prod-1',
  name: 'Test Fabric',
  slug: 'test-fabric',
  segment: 'TEXTILE',
  status: ProductStatus.PENDING_APPROVAL,
  businessId: 'biz-1',
  businessName: 'Textile Co',
  sellerUserId: 'seller-1',
  categoryId: 'cat-1',
  basePrice: '999.00',
  approvedBy: null,
  approvedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  description: null,
  mrp: null,
  moq: 1,
  unit: 'meter',
  hsnCode: null,
  gstPercent: null,
  tags: [],
};

const MOCK_ACTIVE_PRODUCT = {
  ...MOCK_PRODUCT,
  status: ProductStatus.ACTIVE,
  approvedBy: 'admin-1',
  approvedAt: '2026-06-01T00:00:00.000Z',
};

const MOCK_REQUEST = {
  ip: '127.0.0.1',
  headers: { 'user-agent': 'test-agent' },
} as any;

describe('AdminProductService — Phase 4 Product Approval', () => {
  let service: AdminProductService;
  let productRepo: unknown;
  let prismaService: unknown;
  let redisService: unknown;
  let notificationService: unknown;
  let auditWriter: unknown;
  let metrics: unknown;

  beforeEach(async () => {
    productRepo = {
      findMany: vi.fn().mockResolvedValue({
        data: [MOCK_PRODUCT],
        nextCursor: null,
        hasMore: false,
      }),
      findById: vi.fn().mockResolvedValue(MOCK_PRODUCT),
    };

    prismaService = {
      $transaction: vi
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            product: { update: vi.fn().mockResolvedValue(MOCK_ACTIVE_PRODUCT) },
            eventOutbox: { create: vi.fn().mockResolvedValue({ id: 'ev-1' }) },
          }),
        ),
    };

    redisService = {
      set: vi.fn().mockResolvedValue('OK'),
    };

    notificationService = {
      sendDirect: vi.fn().mockResolvedValue(undefined),
    };

    auditWriter = {
      safeWrite: vi.fn().mockResolvedValue(undefined),
    };

    metrics = {
      productApprovedTotal: { inc: vi.fn() },
      productRejectedTotal: { inc: vi.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminProductService,
        { provide: AdminProductRepository, useValue: productRepo },
        { provide: PrismaService, useValue: prismaService },
        { provide: RedisService, useValue: redisService },
        { provide: NotificationService, useValue: notificationService },
        { provide: AuditSafeWriterService, useValue: auditWriter },
        { provide: AdminMetricsService, useValue: metrics },
      ],
    }).compile();

    service = module.get(AdminProductService);
  });

  // ─── GET product list ─────────────────────────────────────────────────────

  describe('getProductList', () => {
    it('returns paginated product list', async () => {
      const result = await service.getProductList({ limit: 20 });
      expect(result.data).toHaveLength(1);
      expect(productRepo.findMany).toHaveBeenCalledWith({ limit: 20 });
    });
  });

  // ─── GET product detail ───────────────────────────────────────────────────

  describe('getProductDetail', () => {
    it('returns product detail for valid ID', async () => {
      const result = await service.getProductDetail('prod-1');
      expect(result.id).toBe('prod-1');
    });

    it('throws NotFoundException for missing product', async () => {
      productRepo.findById.mockResolvedValueOnce(null);
      await expect(service.getProductDetail('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── APPROVE product ──────────────────────────────────────────────────────

  describe('approveProduct', () => {
    it('happy path: approves PENDING_APPROVAL product', async () => {
      productRepo.findById.mockResolvedValueOnce(MOCK_PRODUCT); // pre-fetch
      productRepo.findById.mockResolvedValueOnce(MOCK_ACTIVE_PRODUCT); // post-fetch

      const result = await service.approveProduct(
        'prod-1',
        'admin-1',
        'idem-key-1',
        MOCK_REQUEST,
      );

      expect(prismaService.$transaction).toHaveBeenCalledOnce();
      expect(auditWriter.safeWrite).toHaveBeenCalledOnce();
      expect(auditWriter.safeWrite).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'admin-1',
          action: 'STATUS_CHANGE',
          entityType: 'Product',
          entityId: 'prod-1',
        }),
      );
      expect(notificationService.sendDirect).toHaveBeenCalledWith(
        'seller-1',
        'ProductApproved_SELLER_hi',
        { productName: 'Test Fabric' },
      );
      expect(metrics.productApprovedTotal.inc).toHaveBeenCalledWith({
        segment: 'TEXTILE',
        adminId: 'admin-1',
      });
      expect(result.status).toBe(ProductStatus.ACTIVE);
    });

    it('throws NotFoundException when product does not exist', async () => {
      productRepo.findById.mockResolvedValueOnce(null);
      await expect(
        service.approveProduct('missing', 'admin-1', 'idem-1', MOCK_REQUEST),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when product already ACTIVE (state machine)', async () => {
      productRepo.findById.mockResolvedValueOnce(MOCK_ACTIVE_PRODUCT);
      await expect(
        service.approveProduct('prod-1', 'admin-1', 'idem-1', MOCK_REQUEST),
      ).rejects.toThrow(); // InvalidProductTransitionException
      expect(prismaService.$transaction).not.toHaveBeenCalled();
    });

    it('INV-S7-2: safeWrite() called OUTSIDE $transaction (after commit)', async () => {
      productRepo.findById
        .mockResolvedValueOnce(MOCK_PRODUCT)
        .mockResolvedValueOnce(MOCK_ACTIVE_PRODUCT);

      const callOrder: string[] = [];
      prismaService.$transaction.mockImplementationOnce(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          callOrder.push('$transaction');
          return fn({
            product: { update: vi.fn().mockResolvedValue(MOCK_ACTIVE_PRODUCT) },
            eventOutbox: { create: vi.fn().mockResolvedValue({ id: 'ev-1' }) },
          });
        },
      );
      auditWriter.safeWrite.mockImplementationOnce(async () => {
        callOrder.push('safeWrite');
      });

      await service.approveProduct('prod-1', 'admin-1', 'idem-1', MOCK_REQUEST);

      const txIdx = callOrder.indexOf('$transaction');
      const auditIdx = callOrder.indexOf('safeWrite');
      expect(auditIdx).toBeGreaterThan(txIdx); // audit AFTER transaction
    });

    it('notification failure does NOT block approval (non-fatal)', async () => {
      productRepo.findById
        .mockResolvedValueOnce(MOCK_PRODUCT)
        .mockResolvedValueOnce(MOCK_ACTIVE_PRODUCT);
      notificationService.sendDirect.mockRejectedValueOnce(
        new Error('SMS provider down'),
      );

      // Should NOT throw — notification failure is swallowed
      await expect(
        service.approveProduct('prod-1', 'admin-1', 'idem-1', MOCK_REQUEST),
      ).resolves.toBeDefined();
    });

    it('idempotency key stored in Redis after commit', async () => {
      productRepo.findById
        .mockResolvedValueOnce(MOCK_PRODUCT)
        .mockResolvedValueOnce(MOCK_ACTIVE_PRODUCT);

      await service.approveProduct(
        'prod-1',
        'admin-1',
        'my-idem-key',
        MOCK_REQUEST,
      );

      expect(redisService.set).toHaveBeenCalledWith(
        'admin-idem:my-idem-key',
        expect.stringContaining('ACTIVE'),
        'EX',
        86400,
      );
    });
  });

  // ─── REJECT product ───────────────────────────────────────────────────────

  describe('rejectProduct', () => {
    it('happy path: rejects PENDING_APPROVAL product', async () => {
      const MOCK_REJECTED = { ...MOCK_PRODUCT, status: ProductStatus.REJECTED };
      productRepo.findById
        .mockResolvedValueOnce(MOCK_PRODUCT)
        .mockResolvedValueOnce(MOCK_REJECTED);

      const result = await service.rejectProduct(
        'prod-1',
        { reason: 'Images are too low resolution for marketplace standards.' },
        'admin-1',
        'idem-2',
        MOCK_REQUEST,
      );

      expect(result.status).toBe(ProductStatus.REJECTED);
      expect(auditWriter.safeWrite).toHaveBeenCalledWith(
        expect.objectContaining({
          newValue: expect.objectContaining({
            rejectionReason: expect.any(String),
          }),
        }),
      );
      expect(notificationService.sendDirect).toHaveBeenCalledWith(
        'seller-1',
        'ProductRejected_SELLER_hi',
        expect.objectContaining({ reason: expect.any(String) }),
      );
    });

    it('throws when product not found', async () => {
      productRepo.findById.mockResolvedValueOnce(null);
      await expect(
        service.rejectProduct(
          'x',
          { reason: 'bad product images quality' },
          'admin-1',
          'i',
          MOCK_REQUEST,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws when product already REJECTED (state machine)', async () => {
      productRepo.findById.mockResolvedValueOnce({
        ...MOCK_PRODUCT,
        status: ProductStatus.REJECTED,
      });
      await expect(
        service.rejectProduct(
          'prod-1',
          { reason: 'still bad quality images' },
          'admin-1',
          'i',
          MOCK_REQUEST,
        ),
      ).rejects.toThrow();
    });
  });

  // ─── BULK APPROVE ─────────────────────────────────────────────────────────

  describe('bulkApproveProducts', () => {
    it('INV-S7-20: throws 422 when batch > 100', async () => {
      const tooMany = Array.from({ length: 101 }, (_, i) => `prod-${i}`);
      await expect(
        service.bulkApproveProducts(
          { productIds: tooMany },
          'admin-1',
          'idem-bulk',
          MOCK_REQUEST,
        ),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('partial success: valid products approved, invalid ones fail independently', async () => {
      // First product: valid PENDING_APPROVAL
      // Second product: not found
      productRepo.findById
        .mockResolvedValueOnce(MOCK_PRODUCT) // bulk approval for prod-1 (pre-fetch)
        .mockResolvedValueOnce(MOCK_ACTIVE_PRODUCT) // bulk approval for prod-1 (post-fetch)
        .mockResolvedValueOnce(null); // prod-2 not found

      const result: BulkApproveResult = await service.bulkApproveProducts(
        { productIds: ['prod-1', 'prod-2'] },
        'admin-1',
        'idem-bulk',
        MOCK_REQUEST,
      );

      expect(result.approved).toContain('prod-1');
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].productId).toBe('prod-2');
      expect(result.total).toBe(2);
    });

    it('FOOTGUN-4-D: first failure does NOT stop subsequent approvals', async () => {
      // prod-1: ACTIVE (invalid transition), prod-2: PENDING_APPROVAL (valid)
      productRepo.findById
        .mockResolvedValueOnce(MOCK_ACTIVE_PRODUCT) // prod-1 already ACTIVE → will fail
        .mockResolvedValueOnce(MOCK_PRODUCT) // prod-2 pre-fetch
        .mockResolvedValueOnce(MOCK_ACTIVE_PRODUCT); // prod-2 post-fetch

      const result = await service.bulkApproveProducts(
        { productIds: ['prod-1', 'prod-2'] },
        'admin-1',
        'idem-bulk',
        MOCK_REQUEST,
      );

      expect(result.approved).toContain('prod-2');
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].productId).toBe('prod-1');
    });

    it('returns summary with correct total count', async () => {
      const productIds = ['prod-1', 'prod-2', 'prod-3'];
      productRepo.findById.mockResolvedValue(null); // all not found

      const result = await service.bulkApproveProducts(
        { productIds },
        'admin-1',
        'idem-bulk',
        MOCK_REQUEST,
      );

      expect(result.total).toBe(3);
      expect(result.failed).toHaveLength(3);
      expect(result.approved).toHaveLength(0);
    });
  });
});
