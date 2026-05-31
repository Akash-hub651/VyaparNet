import { z } from 'zod';

export const BuyerOrderFilterSchema = z.object({
  status: z.enum(['DRAFT', 'QUOTATION_REQUESTED', 'PLACED', 'CONFIRMED', 'PROCESSING', 'READY_TO_SHIP', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'PAYMENT_FAILED', 'RETURN_INITIATED', 'REFUND_INITIATED', 'DISPUTE_OPEN', 'DISPUTE_RESOLVED']).optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(20),
}).strict();

export type BuyerOrderFilter = z.infer<typeof BuyerOrderFilterSchema>;

export const BuyerCancelOrderSchema = z.object({
  reason: z.string().min(1).max(500),
}).strict();

export type BuyerCancelOrderDto = z.infer<typeof BuyerCancelOrderSchema>;

export const BuyerOrderItemSchema = z.object({
  id: z.string(),
  productId: z.string(),
  productName: z.string(),
  productSlug: z.string(),
  productImage: z.string().nullable(),
  quantity: z.number().int(),
  unitPrice: z.string(), // Decimal as string
  totalPrice: z.string(), // Decimal as string
}).strict();

export type BuyerOrderItemDto = z.infer<typeof BuyerOrderItemSchema>;

export const BuyerOrderSchema = z.object({
  id: z.string(),
  orderNumber: z.string(),
  segment: z.enum(['TEXTILE', 'SPARE_PARTS']),
  status: z.enum(['DRAFT', 'QUOTATION_REQUESTED', 'PLACED', 'CONFIRMED', 'PROCESSING', 'READY_TO_SHIP', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'PAYMENT_FAILED', 'RETURN_INITIATED', 'REFUND_INITIATED', 'DISPUTE_OPEN', 'DISPUTE_RESOLVED']),
  grandTotal: z.string(),
  subtotal: z.string(),
  taxAmount: z.string(),
  shippingCost: z.string(),
  discount: z.string(),
  createdAt: z.string(),
  items: z.array(BuyerOrderItemSchema).optional(),
}).strict();

export type BuyerOrderDto = z.infer<typeof BuyerOrderSchema>;

export const BuyerOrderListSchema = z.object({
  items: z.array(BuyerOrderSchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
}).strict();

export type BuyerOrderListDto = z.infer<typeof BuyerOrderListSchema>;

export const BuyerOrderStatusHistoryItemSchema = z.object({
  status: z.string(),
  timestamp: z.string(),
  actorRole: z.enum(['SELLER', 'SYSTEM', 'BUYER', 'ADMIN', 'CRON', 'WORKFLOW']),
  reason: z.string().nullable(),
}).strict();

export const BuyerOrderTimelineSchema = z.object({
  order: BuyerOrderSchema,
  statusHistory: z.array(BuyerOrderStatusHistoryItemSchema),
  tracking: z.object({
    carrier: z.string().nullable(),
    trackingNumber: z.string().nullable(),
    trackingUrl: z.string().nullable(),
    estimatedDelivery: z.string().nullable(),
    dispatchProofUrl: z.string().nullable(),
  }).nullable(),
}).strict();

export type BuyerOrderTimelineDto = z.infer<typeof BuyerOrderTimelineSchema>;
