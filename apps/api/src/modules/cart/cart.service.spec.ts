import { Test, TestingModule } from '@nestjs/testing';
import { CartService } from './cart.service';
import { CartRepository } from './cart.repository';
import { RedisService } from '../../core/redis/redis.service';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { MetricsService } from '../observability/metrics.service';
import { BadRequestException } from '@nestjs/common';
import { Prisma, Segment } from '@vyaparnet/database';
import { describe, it, expect, beforeEach, vi, Mocked } from 'vitest';

describe('CartService', () => {
  let service: CartService;
  let cartRepo: Mocked<CartRepository>;
  let redisService: Mocked<RedisService>;
  let inventoryService: Mocked<InventoryService>;
  let prismaService: any;

  beforeEach(async () => {
    cartRepo = {
      findOrCreate: vi.fn(),
      findActiveWithItems: vi.fn(),
      upsertItem: vi.fn(),
      updateItemQuantity: vi.fn(),
      removeItem: vi.fn(),
    } as any;

    redisService = {
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
      eval: vi.fn().mockResolvedValue(1),
    } as any;

    inventoryService = {
      getAvailability: vi.fn(),
    } as any;

    prismaService = {
      product: {
        findUnique: vi.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CartService,
        { provide: CartRepository, useValue: cartRepo },
        { provide: RedisService, useValue: redisService },
        { provide: InventoryService, useValue: inventoryService },
        { provide: PrismaService, useValue: prismaService },
        { provide: MetricsService, useValue: { cartItemCountTotal: { inc: vi.fn() }, cartWarningSurfacedTotal: { inc: vi.fn() } } },
      ],
    }).compile();

    service = module.get<CartService>(CartService);
  });

  describe('addItem', () => {
    it('throws SEGMENT_MISMATCH if product segment differs from cart segment', async () => {
      cartRepo.findOrCreate.mockResolvedValue({ id: 'cart1', segment: 'B2B' } as any);
      prismaService.product.findUnique.mockResolvedValue({ id: 'prod1', segment: 'B2C', moq: 1, basePrice: new Prisma.Decimal(100) } as any);

      await expect(service.addItem('user1', { productId: 'prod1', quantity: 1, segment: 'B2B' as Segment }))
        .rejects.toThrow(BadRequestException);
    });

    it('throws MOQ_VIOLATION if quantity is less than product MOQ', async () => {
      cartRepo.findOrCreate.mockResolvedValue({ id: 'cart1', segment: 'B2B' } as any);
      prismaService.product.findUnique.mockResolvedValue({ id: 'prod1', segment: 'B2B', moq: 10, basePrice: new Prisma.Decimal(100) } as any);

      await expect(service.addItem('user1', { productId: 'prod1', quantity: 5, segment: 'B2B' as Segment }))
        .rejects.toThrow(BadRequestException);
    });

    it('throws OUT_OF_STOCK if inventory service returns 0 available quantity', async () => {
      cartRepo.findOrCreate.mockResolvedValue({ id: 'cart1', segment: 'B2B' } as any);
      prismaService.product.findUnique.mockResolvedValue({ id: 'prod1', segment: 'B2B', moq: 1, basePrice: new Prisma.Decimal(100) } as any);
      inventoryService.getAvailability.mockResolvedValue({ availableQuantity: 0 } as any);

      await expect(service.addItem('user1', { productId: 'prod1', quantity: 2, segment: 'B2B' as Segment }))
        .rejects.toThrow(BadRequestException);
    });

    it('adds item successfully if validations pass', async () => {
      cartRepo.findOrCreate.mockResolvedValue({ id: 'cart1', segment: 'B2B' } as any);
      prismaService.product.findUnique.mockResolvedValue({ id: 'prod1', segment: 'B2B', moq: 1, basePrice: new Prisma.Decimal(100) } as any);
      inventoryService.getAvailability.mockResolvedValue({ availableQuantity: 10 } as any);
      cartRepo.upsertItem.mockResolvedValue({ id: 'item1', quantity: 2 } as any);

      const result = await service.addItem('user1', { productId: 'prod1', quantity: 2, segment: 'B2B' as Segment });
      expect(result.id).toEqual('item1');
      expect(cartRepo.upsertItem).toHaveBeenCalledWith('cart1', expect.objectContaining({ quantity: 2, unitPrice: 100 }));
      expect(redisService.del).toHaveBeenCalledWith('cart:user1:B2B');
    });
  });
});
