import { z } from 'zod';
import { Segment } from '../enums';

export const ReserveInventorySchema = z.object({
  productId: z.string().cuid(),
  quantity: z.number().int().min(1).max(100000),
  cartId: z.string().cuid().optional(),
  orderId: z.string().cuid().optional(),
  orderType: z.enum(['CART', 'ORDER', 'RFQ']).optional().default('CART'),
  paymentMethod: z.enum(['ONLINE_UPI', 'ONLINE_CARD', 'COD', 'CREDIT', 'BANK_TRANSFER']).optional(),
}).refine(data => data.cartId || data.orderId, {
  message: 'Either cartId or orderId is required',
});

export const ReleaseInventorySchema = z.object({
  reservationId: z.string().cuid(),
  reason: z.enum(['ORDER_CANCELLED', 'PAYMENT_FAILED', 'CART_EXPIRED', 'MANUAL_RELEASE']),
});

export const UpdateInventorySchema = z.object({
  quantity: z.number().int().min(0).max(1000000),
  lowStockThreshold: z.number().int().min(0).max(100000).optional(),
  reason: z.string().max(500).optional(),
});

export const InventoryListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
  lowStockOnly: z.coerce.boolean().optional(),
  segment: z.nativeEnum(Segment).optional(),
});

export interface InventoryAvailabilityResponse {
  productId: string;
  availableQuantity: number;
  isLowStock: boolean;
  lastUpdated: string;
}

export interface InventoryDetailResponse {
  productId: string;
  inventoryId: string;
  quantity: number;
  reservedQty: number;
  damagedQty: number;
  availableQuantity: number;
  lowStockThreshold: number;
  isLowStock: boolean;
  version: number;
  lastUpdated: string;
}

export type ReserveStockInput = z.infer<typeof ReserveInventorySchema>;
export type ReleaseInventoryInput = z.infer<typeof ReleaseInventorySchema>;
export type UpdateInventoryInput = z.infer<typeof UpdateInventorySchema>;
export type InventoryListQuery = z.infer<typeof InventoryListQuerySchema>;
