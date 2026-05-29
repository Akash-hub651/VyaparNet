import { z } from 'zod';
import { Segment } from '@vyaparnet/database';

export const CreateOrderSchema = z.object({
  cartId: z.string().cuid().optional(), // Either cart checkout or direct buy
  shippingAddressId: z.string().cuid(),
  billingAddressId: z.string().cuid(),
  paymentMethod: z.string(), // ONLINE_UPI, ONLINE_CARD, COD, etc.
  segment: z.nativeEnum(Segment),
});

export const CancelOrderSchema = z.object({
  orderId: z.string().cuid(),
  reason: z.string(),
});

export const OrderItemDto = z.object({
  id: z.string(),
  orderId: z.string(),
  productId: z.string(),
  sellerId: z.string().nullable(),
  productName: z.string(),
  productSlug: z.string(),
  quantity: z.number().int(),
  unitPrice: z.number(),
  discount: z.number(),
  totalPrice: z.number(),
  hsnCode: z.string().nullable(),
  gstPercent: z.number(),
  gstAmount: z.number(),
});

export const OrderDto = z.object({
  id: z.string(),
  orderNumber: z.string(),
  segment: z.nativeEnum(Segment),
  status: z.string(),
  buyerId: z.string(),
  sellerId: z.string(),
  cartId: z.string().nullable(),
  subtotal: z.number(),
  taxAmount: z.number(),
  shippingCost: z.number(),
  discount: z.number(),
  grandTotal: z.number(),
  placedAt: z.date().nullable(),
  paymentFailedAt: z.date().nullable(),
  items: z.array(OrderItemDto).optional(),
});

export const OrderStatusHistoryDto = z.object({
  id: z.string(),
  orderId: z.string(),
  statusFrom: z.string().nullable(),
  statusTo: z.string(),
  actorId: z.string(),
  actorRole: z.string(),
  reason: z.string().nullable(),
  timestamp: z.date(),
});

export type CreateOrderDto = z.infer<typeof CreateOrderSchema>;
export type CancelOrderDto = z.infer<typeof CancelOrderSchema>;
export type OrderType = z.infer<typeof OrderDto>;
export type OrderItemType = z.infer<typeof OrderItemDto>;
export type OrderStatusHistoryType = z.infer<typeof OrderStatusHistoryDto>;
