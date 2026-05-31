import { z } from 'zod';

export const TransitionStatusSchema = z.object({
  toStatus: z.enum(['CONFIRMED', 'PROCESSING', 'SHIPPED']),
  trackingNumber: z.string().max(100).optional(),
  reason: z.string().max(500).optional(),
  estimatedDelivery: z.string().datetime().optional(),
  idempotencyKey: z.string().min(1).max(100),
}).strict();

export type TransitionStatusDto = z.infer<typeof TransitionStatusSchema>;

export const SellerOrderFilterSchema = z.object({
  status: z.enum(['PLACED', 'CONFIRMED', 'PROCESSING', 'SHIPPED']).optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(20),
}).strict();

export type SellerOrderFilterDto = z.infer<typeof SellerOrderFilterSchema>;

export const SellerOrderItemPreviewSchema = z.object({
  productId: z.string(),
  productName: z.string(),
  productSlug: z.string(),
  productImage: z.string().nullable(),
  quantity: z.number().int(),
  unitPrice: z.string(), // Decimal as string
  totalPrice: z.string(), // Decimal as string
}).strict();

export type SellerOrderItemPreviewDto = z.infer<typeof SellerOrderItemPreviewSchema>;

export const SellerOrderSummarySchema = z.object({
  id: z.string(),
  orderNumber: z.string(),
  status: z.enum(['DRAFT', 'QUOTATION_REQUESTED', 'PLACED', 'CONFIRMED', 'PROCESSING', 'READY_TO_SHIP', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'PAYMENT_FAILED', 'RETURN_INITIATED', 'REFUND_INITIATED', 'DISPUTE_OPEN', 'DISPUTE_RESOLVED']),
  grandTotal: z.string(), // Decimal as string
  createdAt: z.string(), // ISO8601
  buyerCode: z.string(), // BUYER-{first6}
  itemCount: z.number().int(),
  itemsPreview: z.array(SellerOrderItemPreviewSchema),
}).strict();

export type SellerOrderSummaryDto = z.infer<typeof SellerOrderSummarySchema>;

export const SellerOrderListSchema = z.object({
  items: z.array(SellerOrderSummarySchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
}).strict();

export type SellerOrderListResponse = z.infer<typeof SellerOrderListSchema>;

export const SellerOrderHistoryTimelineSchema = z.object({
  id: z.string(),
  statusFrom: z.string().nullable(),
  statusTo: z.string(),
  reason: z.string().nullable(),
  timestamp: z.string(),
  actorRole: z.string(),
}).strict();

export type SellerOrderHistoryTimelineDto = z.infer<typeof SellerOrderHistoryTimelineSchema>;

export const SellerOrderTrackingSchema = z.object({
  carrier: z.string().nullable(),
  trackingNumber: z.string().nullable(),
  estimatedDelivery: z.string().nullable(),
  dispatchProofUrl: z.string().nullable(),
}).strict();

export type SellerOrderTrackingDto = z.infer<typeof SellerOrderTrackingSchema>;

export const SellerOrderViewSchema = z.object({
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
  buyerCode: z.string(),
  items: z.array(SellerOrderItemPreviewSchema),
  statusHistory: z.array(SellerOrderHistoryTimelineSchema).optional(),
  tracking: SellerOrderTrackingSchema.nullable(),
}).strict();

export type SellerOrderView = z.infer<typeof SellerOrderViewSchema>;
