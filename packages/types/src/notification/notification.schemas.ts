import { z } from 'zod';

export const NotificationDtoSchema = z.object({
  id: z.string(),
  type: z.enum(['ORDER', 'PAYMENT', 'INVENTORY', 'SYSTEM', 'KYC', 'RETURN', 'DISPUTE']),
  title: z.string(),
  body: z.string(),
  isRead: z.boolean(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
  metadata: z.record(z.string(), z.any()).nullable(),
}).strict();

export type NotificationDto = z.infer<typeof NotificationDtoSchema>;

export const NotificationListQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(20),
  isRead: z.boolean().optional(),   // Filter by read status
}).strict();

export type NotificationListQuery = z.infer<typeof NotificationListQuerySchema>;

export const NotificationListResponseSchema = z.object({
  items: z.array(NotificationDtoSchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
}).strict();

export type NotificationListResponse = z.infer<typeof NotificationListResponseSchema>;

// §12.5 / INV-S6-29: Push Unsubscribe Schema
export const PushUnsubscribeSchema = z.object({
  endpoint: z.string().url(),
}).strict();

export type PushUnsubscribeDto = z.infer<typeof PushUnsubscribeSchema>;
