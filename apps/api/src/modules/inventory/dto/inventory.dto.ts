import { z } from 'zod';

export const ReserveInventorySchema = z
  .object({
    productId: z.string().cuid(),
    quantity: z.number().int().min(1).max(1000000),
    segment: z.enum(['TEXTILE', 'SPARE_PARTS']),
    cartId: z.string().cuid().optional(),
    orderId: z.string().cuid().optional(),
    orderType: z.enum(['CART', 'ORDER', 'RFQ']).optional().default('CART'),
    paymentMethod: z
      .enum(['ONLINE_UPI', 'ONLINE_CARD', 'COD', 'CREDIT', 'BANK_TRANSFER'])
      .optional(),
    // expiresAt is FORBIDDEN as an input field (§5 — server time authority)
  })
  .refine((data) => data.cartId || data.orderId, {
    message: 'Either cartId or orderId is required',
  });

export const ReleaseInventorySchema = z.object({
  reservationId: z.string().cuid(),
  reason: z.enum([
    'ORDER_CANCELLED',
    'PAYMENT_FAILED',
    'CART_EXPIRED',
    'MANUAL_RELEASE',
  ]),
});

export const UpdateInventorySchema = z.object({
  quantity: z.number().int().min(0).max(1000000),
  lowStockThreshold: z.number().int().min(0).max(100000).optional(),
  reason: z.string().max(500),
});

export const InventoryListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
  lowStockOnly: z.coerce.boolean().optional(),
  segment: z.enum(['TEXTILE', 'SPARE_PARTS']).optional(),
});

export type ReserveInventoryDto = z.infer<typeof ReserveInventorySchema>;
export type ReleaseInventoryDto = z.infer<typeof ReleaseInventorySchema>;
export type UpdateInventoryDto = z.infer<typeof UpdateInventorySchema>;
export type InventoryListQueryDto = z.infer<typeof InventoryListQuerySchema>;

export interface InventoryAvailabilityResponse {
  productId: string;
  availableQuantity: number; // quantity (never reserved or damaged)
  isLowStock: boolean;
  lastUpdated: string; // ISO 8601
}

export interface InventoryDetailResponse {
  productId: string;
  inventoryId: string;
  quantity: number;
  reservedQty: number;
  damagedQty: number;
  availableQuantity: number; // quantity — reservedQty — damagedQty
  lowStockThreshold: number;
  isLowStock: boolean;
  version: number;
  lastUpdated: string;
}
