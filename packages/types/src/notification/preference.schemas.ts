import { z } from 'zod';

export const ChannelPreferenceSchema = z.object({
  orderUpdates: z.boolean(),
  paymentUpdates: z.boolean(),
  scorecard: z.boolean().optional(),
  lowStock: z.boolean().optional(),
}).strict();

export const NotificationPreferenceSchema = z.object({
  sms: ChannelPreferenceSchema,
  email: ChannelPreferenceSchema,
  push: ChannelPreferenceSchema,
  inApp: ChannelPreferenceSchema,
}).strict();

export type NotificationPreference = z.infer<typeof NotificationPreferenceSchema>;

// Sprint 6 Scope Decision DL-20 — defaults
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreference = {
  sms:   { orderUpdates: true,  paymentUpdates: true,  scorecard: false, lowStock: true },
  email: { orderUpdates: true,  paymentUpdates: true,  scorecard: false, lowStock: false },
  push:  { orderUpdates: true,  paymentUpdates: true,  scorecard: false, lowStock: false },
  inApp: { orderUpdates: true,  paymentUpdates: true,  scorecard: true,  lowStock: true },
};

export const UpdatePreferencesSchema = NotificationPreferenceSchema;
export type UpdatePreferencesDto = NotificationPreference;
