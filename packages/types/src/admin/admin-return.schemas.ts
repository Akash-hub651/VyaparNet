import { z } from 'zod';
import { ReturnStatus, Segment } from '@vyaparnet/database';

export const AdminReturnListQuerySchema = z.object({
  segment: z.nativeEnum(Segment).optional(),
  status: z.nativeEnum(ReturnStatus).optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(50),
}).strict(); // INV-S8-36

export type AdminReturnListQueryDto = z.infer<typeof AdminReturnListQuerySchema>;

// Shared Money string
const MoneyString = z.string().regex(/^\d+(\.\d{1,2})?$/, 'Must be a valid decimal string');

export const AdminReturnQcPassSchema = z.object({
  approvedRefundAmount: MoneyString,
}).strict(); // INV-S8-36

export type AdminReturnQcPassDto = z.infer<typeof AdminReturnQcPassSchema>;

export const AdminReturnInitiateRefundSchema = z.object({
  approvedRefundAmount: MoneyString,
}).strict(); // INV-S8-36

export type AdminReturnInitiateRefundDto = z.infer<typeof AdminReturnInitiateRefundSchema>;
