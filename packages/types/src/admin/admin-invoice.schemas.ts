/**
 * Admin Invoice DTO Schemas — Phase 1
 *
 * Governs:
 * - AdminGenerateInvoiceDtoSchema: body for POST /admin/invoices/generate/:orderId
 *
 * Invariants:
 * - INV-S7-16: Invoice PDF generation via pdf-lib; >2000ms → BullMQ 'invoice-generation' queue
 * - INV-S7-17: POST /admin/invoices/generate/:orderId is the ONLY trigger
 * - FOOTGUN-1-D: NEVER import from @vyaparnet/database
 */
import { z } from 'zod';

// POST /admin/invoices/generate/:orderId — body is empty (orderId comes from path param)
export const AdminGenerateInvoiceDtoSchema = z.object({}).strict();
export type AdminGenerateInvoiceDto = z.infer<typeof AdminGenerateInvoiceDtoSchema>;
