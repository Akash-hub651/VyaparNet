import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../../app.module';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { RedisService } from '../../../core/redis/redis.service';
import { InventoryService } from '../inventory.service';
import { InventoryProcessor } from '../inventory.processor';
import { ReserveStockInput } from '../inventory-reserve.service';
import { Segment, UserRole, ProductStatus } from '@vyaparnet/database';
import { randomUUID } from 'crypto';
import { cleanDatabase } from '../../../../test/helpers/db-cleanup.helper';

describe('Inventory Concurrency Tests (L1-L7)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  let inventoryService: InventoryService;
  let processor: InventoryProcessor;

  let sellerId: string;
  let buyerId: string;
  let businessId: string;
  let categoryId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    redis = app.get(RedisService);
    inventoryService = app.get(InventoryService);
    processor = app.get(InventoryProcessor);

    // FK-safe full database reset via canonical helper (test/helpers/db-cleanup.helper.ts)
    // DO NOT add ad-hoc deleteMany() calls here — update the helper file instead.
    await cleanDatabase(prisma as any);
    
    // Clear Redis keys to prevent cross-run pollution
    const keys = await redis.keys('inv_*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }

    await prisma.segmentInventoryPolicy.create({
      data: {
        segment: Segment.TEXTILE,
        maxReservationQtyPerRequest: 100,
        maxReservationsPerUser: 10000,
        reservationVelocityLimitPerHour: 50000,
        maxReservationTtlSeconds: 900,
      }
    });

    const seller = await prisma.user.create({
      data: {
        email: 'seller_inv_L1@test.com',
        phone: '+919999999901',
        name: 'Seller',
        role: UserRole.SELLER,
        segment: Segment.TEXTILE,
        ownedBusinesses: {
          create: {
            name: 'Business',
            slug: 'business-inv',
            segment: Segment.TEXTILE,
            gstNumber: '27AAAAA1111A1Z1',
          }
        }
      },
      include: { ownedBusinesses: true }
    });
    sellerId = seller.id;
    businessId = seller.ownedBusinesses[0].id;

    const buyer = await prisma.user.create({
      data: {
        email: 'buyer_inv_L1@test.com',
        phone: '+919999999902',
        name: 'Buyer',
        role: UserRole.BUYER,
        segment: Segment.TEXTILE,
      }
    });
    buyerId = buyer.id;

    const category = await prisma.category.create({
      data: { name: 'Inv Cat', segment: Segment.TEXTILE, slug: 'inv-cat' }
    });
    categoryId = category.id;
  });

  afterAll(async () => {
    const keys = await redis.keys('inv_*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    await app.close();
  });

  async function createProductWithStock(qty: number) {
    const p = await prisma.product.create({
      data: {
        name: `Product ${randomUUID()}`,
        slug: `prod-${randomUUID()}`,
        basePrice: 100,
        unit: 'piece',
        segment: Segment.TEXTILE,
        status: ProductStatus.ACTIVE,
        categoryId,
        businessId,
        createdBy: sellerId,
        segmentAttributes: { material: 'Cotton' },
      }
    });

    const inv = await prisma.inventory.create({
      data: {
        productId: p.id,
        businessId,
        segment: Segment.TEXTILE,
        quantity: qty,
        reservedQty: 0,
        version: 1
      }
    });
    return { productId: p.id, inventoryId: inv.id };
  }

  async function reserveWithRetry(input: ReserveStockInput, maxRetries = 100) {
    let lastErr: any;
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await inventoryService.reserve(input);
      } catch (err: any) {
        lastErr = err;
        if (err.status === 409) {
          await new Promise(r => setTimeout(r, Math.random() * 50 + 10));
          continue;
        }
        throw err;
      }
    }
    throw lastErr;
  }

  it('L1: 10 concurrent reserves, stock=1 → exactly 1 succeeds', async () => {
    const { productId } = await createProductWithStock(1);
    
    const requests = Array.from({ length: 10 }).map((_, i) => {
      return reserveWithRetry({
        productId,
        quantity: 1,
        segment: Segment.TEXTILE,
        orderType: 'CART',
        userId: buyerId,
        ipAddress: '127.0.0.1',
        idempotencyKey: `idemp-l1-${i}`
      }).catch(e => e);
    });

    const results = await Promise.all(requests);
    const successes = results.filter(r => r.reservationId);
    expect(successes.length).toBe(1);
  });

  it('L2: 50 concurrent reserves, stock=30 → exactly 30 succeed', async () => {
    const { productId } = await createProductWithStock(30);
    
    const requests = Array.from({ length: 50 }).map((_, i) => {
      return reserveWithRetry({
        productId,
        quantity: 1,
        segment: Segment.TEXTILE,
        orderType: 'CART',
        userId: buyerId,
        ipAddress: `127.0.0.2-${i}`,
        idempotencyKey: `idemp-l2-${i}`
      }, 300).catch(e => e);
    });

    const results = await Promise.all(requests);
    const successes = results.filter(r => r.reservationId);
    
    if (successes.length !== 30) {
      console.log('L2 Failures:', results.filter(r => !r.reservationId));
    }
    expect(successes.length).toBe(30);
  }, 10000); // increase timeout to 10s for heavy retries

  it('L3: Idempotency (same key x5) → 1 reservation, 1 movement, all 5 same result', async () => {
    const { productId, inventoryId } = await createProductWithStock(10);
    const idempKey = `idemp-l3-${randomUUID()}`;
    
    const requests = Array.from({ length: 5 }).map(() => {
      return reserveWithRetry({
        productId,
        quantity: 2,
        segment: Segment.TEXTILE,
        orderType: 'CART',
        userId: buyerId,
        ipAddress: '127.0.0.3',
        idempotencyKey: idempKey
      }).catch(e => e);
    });

    const results = await Promise.all(requests);
    
    const firstResId = results[0].reservationId;
    for (const r of results) {
      expect(r.reservationId).toBe(firstResId);
    }

    const reservations = await prisma.inventoryReservation.findMany({ where: { id: firstResId } });
    expect(reservations.length).toBe(1);

    const movements = await prisma.inventoryMovement.findMany({ where: { inventoryId, quantity: 2 } });
    expect(movements.length).toBe(1);
  });

  it('L4: Reserve → release → reserve → second succeeds', async () => {
    const { productId, inventoryId } = await createProductWithStock(2);
    
    const res1 = await reserveWithRetry({
        productId,
        quantity: 2,
        segment: Segment.TEXTILE,
        orderType: 'CART',
        userId: buyerId,
        ipAddress: '127.0.0.4',
        idempotencyKey: 'idemp-l4-1'
    });
    expect(res1.reservationId).toBeDefined();

    let inv = await prisma.inventory.findUnique({ where: { id: inventoryId } });
    expect(inv?.quantity).toBe(0);

    try {
      await reserveWithRetry({
        productId,
        quantity: 1,
        segment: Segment.TEXTILE,
        orderType: 'CART',
        userId: buyerId,
        ipAddress: '127.0.0.4',
        idempotencyKey: 'idemp-l4-2'
      });
      expect.fail('Should fail');
    } catch (e: any) {
      expect(e.status).toBe(422); 
    }

    const relRes = await inventoryService.release(res1.reservationId, 'CART_ABANDONED', buyerId);
    expect(relRes).toBeDefined(); 
    
    inv = await prisma.inventory.findUnique({ where: { id: inventoryId } });
    expect(inv?.quantity).toBe(2);

    const res2 = await reserveWithRetry({
        productId,
        quantity: 1,
        segment: Segment.TEXTILE,
        orderType: 'CART',
        userId: buyerId,
        ipAddress: '127.0.0.4',
        idempotencyKey: 'idemp-l4-3'
    });
    expect(res2.reservationId).toBeDefined();
  });

  it('L5: Redis down → DEGRADED mode → no oversell', async () => {
    const { productId } = await createProductWithStock(1);
    
    const originalGet = redis.get.bind(redis);
    redis.get = vi.fn().mockRejectedValue(new Error('Redis connection lost'));
    const originalSet = redis.set.bind(redis);
    redis.set = vi.fn().mockRejectedValue(new Error('Redis connection lost'));

    const requests = Array.from({ length: 3 }).map((_, i) => {
      return inventoryService.reserve({ 
        productId,
        quantity: 1,
        segment: Segment.TEXTILE,
        orderType: 'CART',
        userId: buyerId,
        ipAddress: '127.0.0.5',
        idempotencyKey: `idemp-l5-${i}`
      }).catch(e => e);
    });

    const results = await Promise.all(requests);
    redis.get = originalGet;
    redis.set = originalSet;

    const successes = results.filter(r => r.reservationId);
    expect(successes.length).toBe(1); 
  });

  it('L6: 100 expired reservations → expiry worker → all EXPIRED with no duplicates', async () => {
    const { inventoryId } = await createProductWithStock(100);
    const pastDate = new Date(Date.now() - 3600000); 
    
    await prisma.inventory.update({
      where: { id: inventoryId },
      data: { quantity: 0, reservedQty: 100 }
    });

    const data = Array.from({ length: 100 }).map((_, i) => ({
      inventoryId,
      quantity: 1,
      reservedByUserId: buyerId,
      reservedByBusinessId: null,
      orderContext: `order-${i}`,
      reservationSource: 'CART',
      status: 'ACTIVE' as const,
      expiresAt: pastDate
    }));

    await prisma.inventoryReservation.createMany({ data });

    await processor.handleExpireReservations({ id: 'test-1' } as any);

    const count = await prisma.inventoryReservation.count({ where: { status: 'EXPIRED', inventoryId } });
    expect(count).toBe(100);
  });

  it('L7: Velocity abuse → 429 after threshold', async () => {
    const { productId } = await createProductWithStock(5000);
    const userId = randomUUID(); 
    await redis.set(`inv_velocity:${userId}:TEXTILE`, '50000');

    try {
      await inventoryService.reserve({
        productId,
        quantity: 1,
        segment: Segment.TEXTILE,
        orderType: 'CART',
        userId: userId,
        ipAddress: '127.0.0.7',
        idempotencyKey: 'idemp-l7-fail'
      });
      expect.fail('Should fail with 429');
    } catch (e: any) {
      expect(e.status).toBe(429);
      expect(e.response?.code).toContain('VELOCITY');
    }
  });

});
