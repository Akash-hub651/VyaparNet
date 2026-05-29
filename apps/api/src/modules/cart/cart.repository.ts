import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { Segment, Cart, CartItem, Prisma } from '@vyaparnet/database';

@Injectable()
export class CartRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findOrCreate(userId: string, segment: Segment): Promise<Cart> {
    // Upsert using the composite unique index defined in schema v4.3
    return this.prisma.cart.upsert({
      where: {
        userId_segment_status: {
          userId,
          segment,
          status: 'ACTIVE',
        },
      },
      update: {},
      create: {
        userId,
        segment,
        status: 'ACTIVE',
      },
    });
  }

  async findActiveWithItems(
    userId: string,
    segment: Segment,
  ): Promise<(Cart & { items: CartItem[] }) | null> {
    return this.prisma.cart.findFirst({
      where: { userId, segment, status: 'ACTIVE' },
      include: { items: true },
    });
  }

  async upsertItem(
    cartId: string,
    data: { productId: string; quantity: number; unitPrice: number },
  ): Promise<CartItem> {
    // idx_ci_cart_prod is NOT unique in schema v4.3, so we manually find and update
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.cartItem.findFirst({
        where: { cartId, productId: data.productId },
      });

      const priceDecimal = new Prisma.Decimal(data.unitPrice);

      if (existing) {
        return tx.cartItem.update({
          where: { id: existing.id },
          data: {
            quantity: existing.quantity + data.quantity, // Add quantity
            unitPrice: priceDecimal,
            totalPrice: priceDecimal, // NOTE: Not authoritative for checkout
          },
        });
      }

      return tx.cartItem.create({
        data: {
          cartId,
          productId: data.productId,
          quantity: data.quantity,
          unitPrice: priceDecimal,
          totalPrice: priceDecimal,
        },
      });
    });
  }

  async updateItemQuantity(
    cartId: string,
    productId: string,
    quantity: number,
  ): Promise<void> {
    await this.prisma.cartItem.updateMany({
      where: { cartId, productId },
      data: { quantity },
    });
  }

  async removeItem(cartId: string, productId: string): Promise<void> {
    await this.prisma.cartItem.deleteMany({
      where: { cartId, productId },
    });
  }
}
