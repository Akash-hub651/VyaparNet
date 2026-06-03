import { z } from 'zod';
import { Segment } from '../enums';

// FIX #43: All DTO price/amount fields must be string with z.string().regex()
const amountRegex = /^\d+(\.\d{1,2})?$/;

export const BuyerLedgerEntrySchema = z.object({
  id: z.string(),
  buyerId: z.string(),
  segment: z.nativeEnum(Segment),
  transactionType: z.enum(['CREDIT', 'DEBIT', 'REFUND', 'ADJUSTMENT']),
  orderId: z.string().nullable(),
  amount: z.string().regex(amountRegex, 'Amount must be a valid decimal string'),
  balance: z.string().regex(amountRegex, 'Balance must be a valid decimal string'),
  description: z.string().nullable(),
  returnRequestId: z.string().nullable(),
  createdAt: z.string().datetime(),
  createdBy: z.string().nullable(),
});

export type BuyerLedgerEntryDto = z.infer<typeof BuyerLedgerEntrySchema>;

export const BuyerLedgerListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  segment: z.nativeEnum(Segment).optional(),
}).strict();

export type BuyerLedgerListQueryDto = z.infer<typeof BuyerLedgerListQuerySchema>;
