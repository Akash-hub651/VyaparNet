import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { CartRepository } from './cart.repository';
import { RedisService } from '../../core/redis/redis.service';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AddToCartDto, CartType, UpdateCartItemDto } from '@vyaparnet/types';
import { Prisma, Segment } from '@vyaparnet/database';
import { MetricsService } from '../observability/metrics.service';

@Injectable()
export class CartService {
  private readonly logger = new Logger(CartService.name);

  constructor(
    private readonly cartRepo: CartRepository,
    private readonly redis: RedisService,
    private readonly inventoryService: InventoryService,
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
  ) {}

  async getCart(userId: string, segment: Segment): Promise<CartType> {
    const cacheKey = `cart:${userId}:${segment}`;
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    const cart = await this.cartRepo.findActiveWithItems(userId, segment);
    
    if (!cart) {
      const emptyCart: CartType = {
        id: `empty_${userId}_${segment}`,
        userId,
        segment,
        status: 'ACTIVE',
        subtotal: 0,
        taxAmount: 0,
        discount: 0,
        total: 0,
        items: [],
        warnings: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      return emptyCart;
    }

    const enriched = await this.enrichCartWithWarnings(cart);
    const totals = this.computeCartTotals(enriched.items || []);

    const result: CartType = {
      ...enriched,
      ...totals,
    };

    // Cache for 60 seconds as per INV cache rules
    await this.redis.set(cacheKey, JSON.stringify(result), 'EX', 60);

    return result;
  }

  async addItem(userId: string, dto: AddToCartDto): Promise<any> {
    // 1. Rate limit check (Max 50 items/min)
    await this.checkCartAddRate(userId);

    // 2. Load or create cart
    const cart = await this.cartRepo.findOrCreate(userId, dto.segment as Segment);

    // 3. Load product directly from DB
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
    });

    if (!product) {
      throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message: 'Product not found' });
    }
    // Assume isActive field isn't explicitly on product in schema, but there's MOQ and segment.
    // We check segment mismatch.
    if (product.segment !== cart.segment) {
      throw new BadRequestException({
        code: 'SEGMENT_MISMATCH',
        message: 'Product segment does not match cart segment',
      });
    }

    // 5. MOQ check
    if (dto.quantity < product.moq) {
      throw new BadRequestException({
        code: 'MOQ_VIOLATION',
        message: `Minimum order quantity is ${product.moq}`,
      });
    }

    // 6. Soft availability check
    const availability = await this.inventoryService.getAvailability(
      dto.productId,
      dto.segment as Segment,
    );

    if (availability.availableQuantity <= 0) {
      throw new BadRequestException({ code: 'OUT_OF_STOCK', message: 'Product is out of stock' });
    }

    // 7. Upsert CartItem
    const item = await this.cartRepo.upsertItem(cart.id, {
      productId: dto.productId,
      quantity: dto.quantity,
      unitPrice: product.basePrice.toNumber(),
    });

    // 8. Invalidate Redis cache
    await this.redis.del(`cart:${userId}:${cart.segment}`);

    // 9. Metrics
    this.metrics.cartItemCountTotal.inc({ segment: cart.segment, action: 'add' });

    return item;
  }

  async updateItem(userId: string, dto: UpdateCartItemDto & { productId: string; segment: Segment }): Promise<void> {
    const cart = await this.cartRepo.findActiveWithItems(userId, dto.segment);
    if (!cart) throw new NotFoundException({ code: 'CART_NOT_FOUND' });

    await this.cartRepo.updateItemQuantity(cart.id, dto.productId, dto.quantity);
    await this.redis.del(`cart:${userId}:${dto.segment}`);

    this.metrics.cartItemCountTotal.inc({ segment: dto.segment, action: 'update' });
  }

  async removeItem(userId: string, productId: string, segment: Segment): Promise<void> {
    const cart = await this.cartRepo.findActiveWithItems(userId, segment);
    if (!cart) return;

    await this.cartRepo.removeItem(cart.id, productId);
    await this.redis.del(`cart:${userId}:${segment}`);

    this.metrics.cartItemCountTotal.inc({ segment, action: 'remove' });
  }

  // Pure function for totals
  private computeCartTotals(items: any[]): { subtotal: number; taxAmount: number; discount: number; total: number } {
    let subtotal = new Prisma.Decimal(0);
    const taxAmount = new Prisma.Decimal(0); // Add logic for tax later if needed
    const discount = new Prisma.Decimal(0);

    for (const item of items) {
      // Use Decimal for precision
      const itemTotal = new Prisma.Decimal(item.unitPrice).mul(item.quantity);
      subtotal = subtotal.add(itemTotal);
    }

    const total = subtotal.add(taxAmount).sub(discount);

    return {
      subtotal: subtotal.toNumber(),
      taxAmount: taxAmount.toNumber(),
      discount: discount.toNumber(),
      total: total.toNumber(),
    };
  }

  private async enrichCartWithWarnings(cart: any): Promise<CartType> {
    const warnings: any[] = [];
    const enrichedItems: any[] = [];

    // HARDENED (OPTIONAL-5): Batch all product lookups in ONE query — eliminates N+1.
    // Previously: one prisma.product.findUnique() per item (10 items = 10 DB round-trips).
    // Now: one findMany() for all products + O(1) Map lookup per item.
    const productIds = cart.items.map((i: any) => i.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      include: {
        media: {
          where: { isDeleted: false },
          include: { media: true },
          orderBy: { displayOrder: 'asc' },
          take: 1,
        },
      },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    // Batch all inventory availability checks in parallel — independent reads, safe to parallelize
    const availabilityResults = await Promise.all(
      cart.items.map((item: any) => this.inventoryService.getAvailability(item.productId, cart.segment)),
    );

    for (let i = 0; i < cart.items.length; i++) {
      const item = cart.items[i];
      const availability = availabilityResults[i];
      const product = productMap.get(item.productId);

      if (availability.availableQuantity <= 0) {
        warnings.push({
          type: 'OUT_OF_STOCK',
          message: 'Product is no longer available.',
          productId: item.productId,
        });
        this.metrics.cartWarningSurfacedTotal.inc({ warning_type: 'OUT_OF_STOCK' });
      }

      if (product && item.quantity < product.moq) {
        warnings.push({
          type: 'MOQ_VIOLATION',
          message: `Minimum order quantity is ${product.moq}`,
          productId: item.productId,
        });
        this.metrics.cartWarningSurfacedTotal.inc({ warning_type: 'MOQ_VIOLATION' });
      }

      enrichedItems.push({
        id: item.id,
        cartId: item.cartId,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        totalPrice: Number(item.totalPrice),
        discountAmount: Number(item.discountAmount),
        productName: product?.name ?? 'Unknown Product',
        productSlug: product?.slug ?? '',
        productImage: product?.media?.[0]?.media?.url ?? null,
        moq: product?.moq ?? 1,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      });
    }

    return {
      id: cart.id,
      userId: cart.userId,
      segment: cart.segment,
      status: cart.status,
      subtotal: Number(cart.subtotal),
      taxAmount: Number(cart.taxAmount),
      discount: Number(cart.discount),
      total: Number(cart.total),
      items: enrichedItems,
      warnings,
      createdAt: cart.createdAt,
      updatedAt: cart.updatedAt,
    };
  }

  private async checkCartAddRate(userId: string): Promise<void> {
    const key = `cart_rate:${userId}`;
    const limit = 50;
    
    // Atomic INCR + EXPIRE via Lua script (INV-21)
    const script = `
      local current = redis.call('INCR', KEYS[1])
      if current == 1 then
        redis.call('EXPIRE', KEYS[1], 60)
      end
      return current
    `;
    
    const count = await this.redis.eval(script, 1, key) as number;
    
    if (count > limit) {
      this.logger.warn({ userId }, 'Cart rate limit exceeded');
      throw new BadRequestException({ code: 'RATE_LIMIT_EXCEEDED', message: 'Too many items added to cart' });
    }
  }
}
