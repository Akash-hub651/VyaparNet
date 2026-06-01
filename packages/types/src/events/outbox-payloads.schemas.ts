import { z } from 'zod';

export const OrderStatusChangedPayloadSchema = z.object({
  orderId: z.string(),
  orderNumber: z.string(),
  buyerId: z.string(),
  sellerId: z.string(),
  segment: z.enum(['TEXTILE', 'SPARE_PARTS']),
  statusFrom: z.string(),
  statusTo: z.string(),
  actorId: z.string(),
  actorRole: z.enum(['SELLER', 'SYSTEM', 'BUYER', 'ADMIN', 'CRON', 'WORKFLOW']),
  timestamp: z.string().datetime(),
  trackingNumber: z.string().optional(),
  estimatedDelivery: z.string().datetime().optional(),
}).strict();

export type OrderStatusChangedPayload = z.infer<typeof OrderStatusChangedPayloadSchema>;

export const SupplierScoreUpdatedPayloadSchema = z.object({
  businessId: z.string(),
  segment: z.string(),                  // 'TEXTILE' | 'SPARE_PARTS' — for analytics routing
  compositeScore: z.number().int().min(0).max(100),
  dispatchSpeedScore: z.number().int().min(0).max(100),
  deliveryQualityScore: z.number().int().min(0).max(100),
  acceptanceRate: z.number().int().min(0).max(100),
  previousCompositeScore: z.number().int().min(0).max(100).nullable(),
  calculatedAt: z.string().datetime(),
  orderCount: z.number().int().nonnegative(),
}).strict();

export type SupplierScoreUpdatedPayload = z.infer<typeof SupplierScoreUpdatedPayloadSchema>;

// §12.1 Extend outbox-payloads.schemas.ts

export const OrderCreatedPayloadSchema = z.object({
  orderId: z.string(),
  orderNumber: z.string(),
  buyerId: z.string(),
  // IMPROVEMENT: sellerId is optional at top-level because Sprint 4/5 orderCreatedPayload puts sellerId inside items
  sellerId: z.string().optional(),
  segment: z.string(),
  // IMPROVEMENT: grandTotal can be number or string, parsed to string
  grandTotal: z.union([z.string(), z.number()]).transform(val => String(val)),
  // IMPROVEMENT: paymentMethod is flexible to support COD / ONLINE_* from Sprint 4
  paymentMethod: z.enum(['COD', 'RAZORPAY', 'ONLINE_UPI', 'ONLINE_CARD']).or(z.string()),
  // IMPROVEMENT: timestamp or placedAt is optional/flexible
  timestamp: z.string().optional(),
  placedAt: z.string().optional(),
  // Allow other properties to avoid failing on extra fields if strict is used
  items: z.array(z.any()).optional(),
  subtotal: z.number().optional(),
  taxAmount: z.number().optional(),
  shippingAddress: z.any().optional(),
  orderMonth: z.string().optional(),
  // INV-S7-30: buyerCode is maskBuyerId() output — NEVER raw buyerId. Seller templates may display it.
  buyerCode: z.string().optional(),
}).strict();

export type OrderCreatedPayload = z.infer<typeof OrderCreatedPayloadSchema>;

export const PaymentReceivedPayloadSchema = z.object({
  orderId: z.string(),
  // IMPROVEMENT: orderNumber is optional as payment-webhook-processor doesn't write it in payload
  orderNumber: z.string().optional(),
  // IMPROVEMENT: buyerId is optional as payment-webhook-processor doesn't write it in payload
  buyerId: z.string().optional(),
  // IMPROVEMENT: amount can be number or string, parsed to string
  amount: z.union([z.string(), z.number()]).transform(val => String(val)),
  // IMPROVEMENT: paymentMethod can be direct enum or mapped from webhook processor
  paymentMethod: z.enum(['COD', 'RAZORPAY', 'ONLINE_UPI', 'ONLINE_CARD']).or(z.string()).optional(),
  method: z.string().optional(),
  // IMPROVEMENT: timestamp is mapped to capturedAt or optional
  timestamp: z.string().optional(),
  capturedAt: z.string().optional(),
  paymentId: z.string().optional(),
  gatewayPaymentId: z.string().nullable().optional(),
}).strict();

export type PaymentReceivedPayload = z.infer<typeof PaymentReceivedPayloadSchema>;

export const PaymentFailedPayloadSchema = z.object({
  orderId: z.string(),
  // IMPROVEMENT: orderNumber and buyerId are optional as payment-webhook-processor doesn't write them
  orderNumber: z.string().optional(),
  buyerId: z.string().optional(),
  // IMPROVEMENT: amount can be optional as payment-webhook-processor doesn't write it
  amount: z.union([z.string(), z.number()]).transform(val => String(val)).optional(),
  failureReason: z.string().optional(),
  reason: z.string().optional(),
  // IMPROVEMENT: retryAllowed is optional
  retryAllowed: z.boolean().optional(),
  // IMPROVEMENT: timestamp is mapped to failedAt or optional
  timestamp: z.string().optional(),
  failedAt: z.string().optional(),
  paymentId: z.string().optional(),
}).strict();

export type PaymentFailedPayload = z.infer<typeof PaymentFailedPayloadSchema>;

export const StockLowPayloadSchema = z.object({
  productId: z.string(),
  productName: z.string().optional(),
  businessId: z.string().optional(),
  segment: z.string().optional(),
  currentStock: z.number().int().nonnegative().optional(),
  quantity: z.number().int().nonnegative().optional(),
  inventoryId: z.string().optional(),
  threshold: z.number().int().nonnegative(),
  timestamp: z.string().optional(),
}).strict();

export type StockLowPayload = z.infer<typeof StockLowPayloadSchema>;

// Update Sprint5OutboxPayload union to Sprint6OutboxPayload:
export type Sprint6OutboxPayload =
  | { eventType: 'OrderCreated'; payload: OrderCreatedPayload }
  | { eventType: 'OrderStatusChanged'; payload: OrderStatusChangedPayload }
  | { eventType: 'PaymentReceived'; payload: PaymentReceivedPayload }
  | { eventType: 'PaymentFailed'; payload: PaymentFailedPayload }
  | { eventType: 'SupplierScoreUpdated'; payload: SupplierScoreUpdatedPayload }
  | { eventType: 'StockLow'; payload: StockLowPayload }
  | { eventType: 'InventoryLowStock'; payload: StockLowPayload };

// =============================================================================
// Sprint 7 EventOutbox Payload Schemas (§9)
// schemaVersion: '7.0', eventVersion: '1.0' (INV-S7-6)
// MERGED Step 1.7+1.9 (H-P1-2): added in ONE operation to prevent omission
// =============================================================================

// ProductApproved — emitted when admin approves a product (PATCH /admin/products/:id/approve)
export const ProductApprovedPayloadSchema = z
  .object({
    productId: z.string().cuid(),
    productName: z.string(),
    businessId: z.string().cuid(),
    sellerUserId: z.string().cuid(), // User.id of the seller (Business.ownerId)
    segment: z.string(),
    adminUserId: z.string().cuid(),
  })
  .strict();

export type ProductApprovedPayload = z.infer<typeof ProductApprovedPayloadSchema>;

// ProductRejected — emitted when admin rejects a product (PATCH /admin/products/:id/reject)
export const ProductRejectedPayloadSchema = z
  .object({
    productId: z.string().cuid(),
    productName: z.string(),
    businessId: z.string().cuid(),
    sellerUserId: z.string().cuid(),
    rejectionReason: z.string(),
    adminUserId: z.string().cuid(),
  })
  .strict();

export type ProductRejectedPayload = z.infer<typeof ProductRejectedPayloadSchema>;

// BusinessVerified — emitted when admin verifies KYC (PATCH /admin/businesses/:id/verify)
export const BusinessVerifiedPayloadSchema = z
  .object({
    businessId: z.string().cuid(),
    businessName: z.string(),
    sellerUserId: z.string().cuid(), // Business.ownerId
    segment: z.string(),
    adminUserId: z.string().cuid(),
  })
  .strict();

export type BusinessVerifiedPayload = z.infer<typeof BusinessVerifiedPayloadSchema>;

// BusinessSuspended — emitted when admin suspends a business (PATCH /admin/businesses/:id/suspend)
export const BusinessSuspendedPayloadSchema = z
  .object({
    businessId: z.string().cuid(),
    businessName: z.string(),
    sellerUserId: z.string().cuid(),
    reason: z.string(),
    adminUserId: z.string().cuid(),
  })
  .strict();

export type BusinessSuspendedPayload = z.infer<typeof BusinessSuspendedPayloadSchema>;

// BusinessRejected — emitted when admin rejects KYC (PATCH /admin/businesses/:id/reject)
export const BusinessRejectedPayloadSchema = z
  .object({
    businessId: z.string().cuid(),
    businessName: z.string(),
    sellerUserId: z.string().cuid(),
    rejectionReason: z.string(),
    adminUserId: z.string().cuid(),
  })
  .strict();

export type BusinessRejectedPayload = z.infer<typeof BusinessRejectedPayloadSchema>;

// UserSuspended — emitted when admin suspends a user (PATCH /admin/users/:id/suspend)
export const UserSuspendedPayloadSchema = z
  .object({
    userId: z.string().cuid(),
    userRole: z.string(), // 'BUYER' | 'SELLER' — string to avoid Prisma enum dependency
    reason: z.string(),
    adminUserId: z.string().cuid(),
  })
  .strict();

export type UserSuspendedPayload = z.infer<typeof UserSuspendedPayloadSchema>;

// Sprint 7 complete outbox payload union
export type Sprint7OutboxPayload =
  | Sprint6OutboxPayload
  | { eventType: 'ProductApproved'; payload: ProductApprovedPayload }
  | { eventType: 'ProductRejected'; payload: ProductRejectedPayload }
  | { eventType: 'BusinessVerified'; payload: BusinessVerifiedPayload }
  | { eventType: 'BusinessSuspended'; payload: BusinessSuspendedPayload }
  | { eventType: 'BusinessRejected'; payload: BusinessRejectedPayload }
  | { eventType: 'UserSuspended'; payload: UserSuspendedPayload };

