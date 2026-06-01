import { z } from 'zod';

// Sprint 7 INV-S7-32: NotificationDeliveryStatus as Zod enum (mirrors Prisma enum)
// Defined here to avoid importing from @vyaparnet/database in DTO schemas
const NotificationDeliveryStatusEnum = z.enum(['PENDING', 'SENT', 'FAILED']);
export type NotificationDeliveryStatus = z.infer<typeof NotificationDeliveryStatusEnum>;

export const NotificationDtoSchema = z.object({
  id: z.string(),
  type: z.enum(['ORDER', 'PAYMENT', 'INVENTORY', 'SYSTEM', 'KYC', 'RETURN', 'DISPUTE']),
  title: z.string(),
  body: z.string(),
  isRead: z.boolean(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
  metadata: z.record(z.string(), z.any()).nullable(),
  // Sprint 7 INV-S7-29: delivery status field (defaults PENDING, updated by NotificationWorker)
  status: NotificationDeliveryStatusEnum.optional(),
}).strict();

export type NotificationDto = z.infer<typeof NotificationDtoSchema>;

// INV-S7-31: NotificationListQuerySchema MUST include dateFrom and dateTo
export const NotificationListQuerySchema = z
  .object({
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    isRead: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
    // INV-S7-31: datetime filters for admin user-notification audit
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional(),
    // INV-S7-29: admin can filter by delivery status (e.g. status=FAILED for DLQ investigation)
    status: NotificationDeliveryStatusEnum.optional(),
  })
  .strict();

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

