/**
 * Admin Ledger Schemas — Sprint 8
 * INV-S8-2: BuyerLedger is APPEND-ONLY. Only admin corrections create new entries.
 * INV-S8-11: Admin buyer ledger visibility required.
 * All schemas use Zod .strict() to reject unknown fields.
 * FOOTGUN-1-D: NO imports from @vyaparnet/database here.
 */
import { z } from 'zod';

/**
 * Request body for POST /admin/buyers/:id/ledger/correction
 * Creates an ADJUSTMENT ledger entry — never mutates existing entries.
 */
export const AdminLedgerCorrectionSchema = z
  .object({
    amount: z
      .string()
      .regex(/^-?\d+(\.\d{1,2})?$/, 'Must be a valid decimal string (e.g. "100.00" or "-50.00")')
      .describe('Signed decimal adjustment amount (positive=credit, negative=debit)'),
    description: z
      .string()
      .min(5, 'Description must be at least 5 characters')
      .max(500, 'Description too long'),
    segment: z
      .string()
      .min(1, 'Segment is required')
      .describe('Marketplace segment (e.g. GROCERY). Open string — no enum lock for multi-segment support.'),
  })
  .strict(); // INV-DTO: reject unknown fields

export type AdminLedgerCorrectionDto = z.infer<typeof AdminLedgerCorrectionSchema>;
