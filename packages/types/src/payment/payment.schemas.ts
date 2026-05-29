import { z } from 'zod';

/**
 * Payment Zod Schemas — §12.3 ZOD DTO GOVERNANCE
 * Authority: SPRINT_4_EXECUTION_LOCK_FINAL.md §12.3
 */

/** POST /payments/initiate body */
export const InitiatePaymentSchema = z.object({
  orderId: z.string().cuid(),
  paymentMethod: z.enum(['ONLINE_UPI', 'ONLINE_CARD', 'NET_BANKING', 'WALLET']),
});

/** POST /payments/retry body */
export const PaymentRetrySchema = z.object({
  orderId: z.string().cuid(),
  paymentMethod: z.enum(['ONLINE_UPI', 'ONLINE_CARD', 'NET_BANKING', 'WALLET']),
});

/** Webhook event payload envelope from Razorpay */
export const WebhookEventSchema = z.object({
  entity: z.string().optional(),
  account_id: z.string().optional(),
  event: z.string().optional(),
  contains: z.array(z.string()).optional(),
  payload: z.record(z.string(), z.any()).optional(),
  created_at: z.number().optional(),
});

export const PaymentDto = z.object({
  id: z.string(),
  orderId: z.string(),
  amount: z.number(),
  method: z.string(),
  gateway: z.string(),
  gatewayRef: z.string().nullable(),
  gatewayPaymentId: z.string().nullable(),
  idempotencyKey: z.string().nullable(),
  status: z.string(),
  capturedAt: z.date().nullable(),
  failedAt: z.date().nullable(),
  createdAt: z.date(),
});

export const PaymentStatusDto = z.object({
  status: z.string(),
  gatewayRef: z.string().nullable(),
  gatewayPaymentId: z.string().nullable(),
  reason: z.string().optional(),
  capturedAt: z.date().nullable(),
});

export type InitiatePaymentDto = z.infer<typeof InitiatePaymentSchema>;
export type PaymentRetryDto = z.infer<typeof PaymentRetrySchema>;
export type PaymentType = z.infer<typeof PaymentDto>;
export type PaymentStatusType = z.infer<typeof PaymentStatusDto>;
