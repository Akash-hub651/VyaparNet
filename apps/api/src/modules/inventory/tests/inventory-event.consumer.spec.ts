import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { InventoryEventConsumer } from '../inventory-event.consumer';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { Segment } from '@vyaparnet/database';

describe('InventoryEventConsumer', () => {
  let consumer: InventoryEventConsumer;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      inventory: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      product: {
        findUnique: vi.fn(),
      },
    };

    const module = await Test.createTestingModule({
      providers: [
        InventoryEventConsumer,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    consumer = module.get(InventoryEventConsumer);
  });

  it('should initialize inventory with quantity=0 when product created event is received', async () => {
    // Arrange
    const payload = {
      aggregateId: 'prod_123',
      aggregateType: 'Product',
      productId: 'prod_123',
      segment: Segment.TEXTILE,
      status: 'ACTIVE',
    };

    prismaMock.inventory.findUnique.mockResolvedValue(null); // No existing inventory
    prismaMock.product.findUnique.mockResolvedValue({
      id: 'prod_123',
      businessId: 'biz_456',
    });
    prismaMock.inventory.create.mockResolvedValue({ id: 'inv_789' });

    // Act
    await consumer.handleProductCreated(payload);

    // Assert
    expect(prismaMock.inventory.findUnique).toHaveBeenCalledWith({
      where: { productId: 'prod_123' },
    });
    expect(prismaMock.product.findUnique).toHaveBeenCalledWith({
      where: { id: 'prod_123' },
      select: { businessId: true },
    });
    expect(prismaMock.inventory.create).toHaveBeenCalledWith({
      data: {
        productId: 'prod_123',
        businessId: 'biz_456',
        segment: Segment.TEXTILE,
        quantity: 0,
        reservedQty: 0,
        damagedQty: 0,
        incomingQty: 0,
        lowStockThreshold: 10,
        isLowStock: false,
      },
    });
  });

  it('should be idempotent and skip creation if inventory already exists', async () => {
    // Arrange
    const payload = {
      aggregateId: 'prod_123',
      aggregateType: 'Product',
      productId: 'prod_123',
      segment: Segment.TEXTILE,
      status: 'ACTIVE',
    };

    prismaMock.inventory.findUnique.mockResolvedValue({
      id: 'inv_existing',
      productId: 'prod_123',
    });

    // Act
    await consumer.handleProductCreated(payload);

    // Assert
    expect(prismaMock.inventory.findUnique).toHaveBeenCalledWith({
      where: { productId: 'prod_123' },
    });
    expect(prismaMock.product.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.inventory.create).not.toHaveBeenCalled();
  });

  it('should not initialize inventory if product is not found in database', async () => {
    // Arrange
    const payload = {
      aggregateId: 'prod_123',
      aggregateType: 'Product',
      productId: 'prod_123',
      segment: Segment.TEXTILE,
      status: 'ACTIVE',
    };

    prismaMock.inventory.findUnique.mockResolvedValue(null);
    prismaMock.product.findUnique.mockResolvedValue(null); // Product not found

    // Act
    await consumer.handleProductCreated(payload);

    // Assert
    expect(prismaMock.inventory.findUnique).toHaveBeenCalledWith({
      where: { productId: 'prod_123' },
    });
    expect(prismaMock.product.findUnique).toHaveBeenCalledWith({
      where: { id: 'prod_123' },
      select: { businessId: true },
    });
    expect(prismaMock.inventory.create).not.toHaveBeenCalled();
  });
});
