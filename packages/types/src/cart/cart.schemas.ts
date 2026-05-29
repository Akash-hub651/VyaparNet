import { z } from 'zod';
import { Segment } from '@vyaparnet/database';

export const CartItemWarningSchema = z.object({
  type: z.string(),
  message: z.string(),
  productId: z.string(),
});

export const AddToCartSchema = z.object({
  productId: z.string().cuid(),
  quantity: z.number().int().positive(),
  segment: z.nativeEnum(Segment),
});

export const UpdateCartItemSchema = z.object({
  quantity: z.number().int().positive(),
});

export const CartItemDto = z.object({
  id: z.string(),
  cartId: z.string(),
  productId: z.string(),
  quantity: z.number().int(),
  unitPrice: z.number(), // Use number for DTOs representing decimals
  totalPrice: z.number(),
  discountAmount: z.number(),
  productName: z.string().optional(),
  productSlug: z.string().optional(),
  productImage: z.string().optional().nullable(),
  moq: z.number().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const CartDto = z.object({
  id: z.string(),
  userId: z.string(),
  segment: z.nativeEnum(Segment),
  status: z.string(),
  subtotal: z.number(),
  taxAmount: z.number(),
  discount: z.number(),
  total: z.number(),
  items: z.array(CartItemDto).optional(),
  warnings: z.array(CartItemWarningSchema).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type AddToCartDto = z.infer<typeof AddToCartSchema>;
export type UpdateCartItemDto = z.infer<typeof UpdateCartItemSchema>;
export type CartType = z.infer<typeof CartDto>;
export type CartItemType = z.infer<typeof CartItemDto>;
export type CartItemWarningType = z.infer<typeof CartItemWarningSchema>;
